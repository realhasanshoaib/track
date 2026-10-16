import {
  isTaskDescription,
  isTaskDueDate,
  isTaskTitle,
  isTerminalTaskState,
  normalizeTaskText,
  resolveTaskCapabilities,
} from '@track/shared/tasks'
import { v } from 'convex/values'

import type { Doc } from './_generated/dataModel'
import { mutation, query } from './_generated/server'
import { requireAuthenticatedActor } from './lib/actorContext'
import { appendAuditEvent } from './lib/audit'
import { threadsEnabled } from './lib/channelThreadPolicy'
import { assertProjectSnapshotWritable } from './lib/projectSnapshotLock'
import { appendTaskActivity, createUniqueTaskPublicKey, getDefaultWorkflowState, rankForIndex } from './lib/taskData'
import { createTaskNotification } from './lib/taskNotifications'
import {
  assertCanAssignTaskMember,
  requireEligibleTaskMember,
  requireTaskAccess,
  resolveTaskRequestContext,
} from './lib/taskPolicy'
import { taskPriority, taskSuggestionDismissalReason } from './schema/taskValidators'
import { rescheduleTaskReminders } from './taskReminders'

const identityArgs = {
  actingCompanyId: v.optional(v.id('companies')),
  projectMemberId: v.optional(v.id('projectMembers')),
}

async function suggestionAccess(
  ctx: Parameters<typeof resolveTaskRequestContext>[0],
  actor: Parameters<typeof resolveTaskRequestContext>[1],
  suggestion: Doc<'taskSuggestions'>,
  identity: Parameters<typeof resolveTaskRequestContext>[3],
) {
  const access = await resolveTaskRequestContext(
    ctx, actor, suggestion.projectId, identity, suggestion.groupId,
  )
  if (suggestion.groupId && !access.capabilities.canReadChannel) throw new Error('task_access_changed')
  if (access.capabilities.accessMode !== 'active') throw new Error('task_access_changed')
  return access
}

function terminalResult(suggestion: Doc<'taskSuggestions'>) {
  return {
    status: suggestion.status,
    taskId: suggestion.decidedTaskId,
    dismissalReason: suggestion.dismissalReason,
  }
}

async function suggestionReferenceVisible(
  ctx: Parameters<typeof resolveTaskRequestContext>[0],
  reference: Doc<'taskSuggestionReferences'>,
) {
  if (reference.channelThreadId) return threadsEnabled()
  if (!reference.messageId) return true
  const message = await ctx.db.get(reference.messageId)
  return !message?.channelThreadId || threadsEnabled()
}

export const list = query({
  args: { projectId: v.id('projects'), ...identityArgs },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    const projectAccess = await resolveTaskRequestContext(ctx, actor, args.projectId, args)
    if (projectAccess.capabilities.accessMode !== 'active') return []
    const suggestions = await ctx.db.query('taskSuggestions')
      .withIndex('by_project_status', (q) =>
        q.eq('projectId', args.projectId).eq('status', 'pending').eq('archivedAt', undefined),
      ).collect()
    const visible = []
    for (const suggestion of suggestions) {
      try {
        const access = await suggestionAccess(ctx, actor, suggestion, args)
        const hidden = await ctx.db.query('taskSuggestionHides')
          .withIndex('by_member_suggestion', (q) =>
            q.eq('projectMemberId', access.projectMember._id).eq('suggestionId', suggestion._id),
          ).unique()
        if (hidden) continue
        const references = await ctx.db.query('taskSuggestionReferences')
          .withIndex('by_suggestion_rank', (q) => q.eq('suggestionId', suggestion._id)).collect()
        const visibleReferences = []
        for (const reference of references) {
          if (await suggestionReferenceVisible(ctx, reference)) visibleReferences.push(reference)
        }
        if (visibleReferences.length !== references.length) continue
        const possibleDuplicateTask = suggestion.possibleDuplicateTaskId
          ? await ctx.db.get(suggestion.possibleDuplicateTaskId)
          : null
        const proposedAssignee = suggestion.proposedAssigneeProjectMemberId
          ? await ctx.db.get(suggestion.proposedAssigneeProjectMemberId) : null
        const [assigneeUser, assigneeCompany] = proposedAssignee ? await Promise.all([
          ctx.db.get(proposedAssignee.userId), proposedAssignee.companyId ? ctx.db.get(proposedAssignee.companyId) : null,
        ]) : [null, null]
        visible.push({
          suggestion,
          proposedAssignee: proposedAssignee && assigneeUser ? {
            member: proposedAssignee,
            user: { _id: assigneeUser._id, displayName: assigneeUser.displayName },
            company: assigneeCompany,
          } : null,
          possibleDuplicateTask: possibleDuplicateTask &&
            (possibleDuplicateTask.groupId === undefined || possibleDuplicateTask.groupId === suggestion.groupId)
            ? { _id: possibleDuplicateTask._id, publicKey: possibleDuplicateTask.publicKey, title: possibleDuplicateTask.title }
            : null,
          references: visibleReferences.map((reference) => ({
            ...reference,
            quote: reference.availability === 'available' ? reference.quote : undefined,
          })),
          canDismiss: access.capabilities.taskCollaboration !== 'scoped' || await Promise.all(
            visibleReferences.flatMap((reference) => reference.messageId ? [ctx.db.get(reference.messageId)] : []),
          ).then((messages) => messages.some((message) =>
            message?.authorProjectMemberId === access.projectMember._id || message?.authorId === actor.userId,
          )),
        })
      } catch {
        continue
      }
    }
    return visible
  },
})

export const hide = mutation({
  args: { suggestionId: v.id('taskSuggestions'), ...identityArgs },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    const suggestion = await ctx.db.get(args.suggestionId)
    if (!suggestion || suggestion.status !== 'pending') throw new Error('task_access_changed')
    const access = await suggestionAccess(ctx, actor, suggestion, args)
    await assertProjectSnapshotWritable(ctx, suggestion.projectId)
    const existing = await ctx.db.query('taskSuggestionHides')
      .withIndex('by_member_suggestion', (q) =>
        q.eq('projectMemberId', access.projectMember._id).eq('suggestionId', suggestion._id),
      ).unique()
    if (!existing) await ctx.db.insert('taskSuggestionHides', {
      projectId: suggestion.projectId,
      suggestionId: suggestion._id,
      projectMemberId: access.projectMember._id,
      createdAt: Date.now(),
    })
    return suggestion._id
  },
})

export const dismiss = mutation({
  args: {
    suggestionId: v.id('taskSuggestions'), reason: v.optional(taskSuggestionDismissalReason),
    idempotencyKey: v.string(), ...identityArgs,
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    const suggestion = await ctx.db.get(args.suggestionId)
    if (!suggestion) throw new Error('task_access_changed')
    const access = await suggestionAccess(ctx, actor, suggestion, args)
    await assertProjectSnapshotWritable(ctx, suggestion.projectId)
    if (suggestion.status !== 'pending') return terminalResult(suggestion)
    const references = await ctx.db.query('taskSuggestionReferences')
      .withIndex('by_suggestion_rank', (q) => q.eq('suggestionId', suggestion._id)).collect()
    let ownSource = false
    for (const reference of references) {
      const message = reference.messageId ? await ctx.db.get(reference.messageId) : null
      if (message?.authorProjectMemberId === access.projectMember._id || message?.authorId === actor.userId) ownSource = true
    }
    if (access.capabilities.taskCollaboration === 'scoped' && !ownSource) {
      throw new Error('task_suggestion_dismiss_forbidden')
    }
    const now = Date.now()
    await ctx.db.patch(suggestion._id, {
      status: 'dismissed', dismissalReason: args.reason, decidedByProjectMemberId: access.projectMember._id,
      decisionActingCompanyId: access.actingCompanyId, decisionIdempotencyKey: args.idempotencyKey,
      decidedAt: now, updatedAt: now,
    })
    await appendAuditEvent(ctx, {
      projectId: suggestion.projectId, groupId: suggestion.groupId, actorId: actor.userId,
      actorProjectMemberId: access.projectMember._id, actingCompanyId: access.actingCompanyId,
      entityType: 'task_suggestion', entityId: String(suggestion._id), action: 'dismissed',
      after: { reason: args.reason },
    })
    return { status: 'dismissed' as const, dismissalReason: args.reason, taskId: undefined }
  },
})

export const accept = mutation({
  args: {
    suggestionId: v.id('taskSuggestions'), boardId: v.id('taskBoards'),
    workflowStateId: v.optional(v.id('taskWorkflowStates')), title: v.string(),
    description: v.optional(v.string()), assigneeProjectMemberId: v.optional(v.id('projectMembers')),
    priority: taskPriority, dueDate: v.optional(v.string()), labelIds: v.optional(v.array(v.id('taskLabels'))),
    duplicateOverride: v.optional(v.boolean()), idempotencyKey: v.string(), ...identityArgs,
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    const suggestion = await ctx.db.get(args.suggestionId)
    if (!suggestion) throw new Error('task_access_changed')
    const access = await suggestionAccess(ctx, actor, suggestion, args)
    await assertProjectSnapshotWritable(ctx, suggestion.projectId)
    if (suggestion.status !== 'pending') return terminalResult(suggestion)
    if (!isTaskTitle(args.title) || (args.description && !isTaskDescription(args.description)) ||
      (args.dueDate && !isTaskDueDate(args.dueDate))) throw new Error('task_fields_invalid')
    if (suggestion.possibleDuplicateTaskId && !args.duplicateOverride) {
      throw new Error('task_duplicate_decision_required')
    }
    const board = await ctx.db.get(args.boardId)
    if (!board || board.archivedAt || board.projectId !== suggestion.projectId || board.groupId !== suggestion.groupId) {
      throw new Error('task_destination_invalid')
    }
    const state = args.workflowStateId ? await ctx.db.get(args.workflowStateId) : await getDefaultWorkflowState(ctx, board._id)
    if (!state || state.boardId !== board._id || state.archivedAt) throw new Error('task_destination_invalid')
    const capabilities = resolveTaskCapabilities({
      collaboration: access.capabilities.taskCollaboration,
      activeScope: true,
      channelMember: suggestion.groupId ? access.capabilities.canReadChannel : access.capabilities.canReadProject,
      createdByActor: true,
      assignedToActor: args.assigneeProjectMemberId === access.projectMember._id,
    })
    if (!capabilities.canCreate) throw new Error('task_access_changed')
    assertCanAssignTaskMember(access.projectMember._id, args.assigneeProjectMemberId, capabilities.canAssignOthers)
    const assignee = args.assigneeProjectMemberId ? await requireEligibleTaskMember(ctx, {
      projectId: suggestion.projectId, groupId: suggestion.groupId,
      projectMemberId: args.assigneeProjectMemberId,
    }) : null
    const existingDecision = await ctx.db.query('taskSuggestions')
      .withIndex('by_decision_idempotency', (q) =>
        q.eq('projectId', suggestion.projectId).eq('decisionIdempotencyKey', args.idempotencyKey),
      ).unique()
    if (existingDecision) return terminalResult(existingDecision)

    const stateTasks = await ctx.db.query('tasks').withIndex('by_board_state_rank', (q) =>
      q.eq('boardId', board._id).eq('workflowStateId', state._id),
    ).collect()
    const now = Date.now()
    const taskId = await ctx.db.insert('tasks', {
      projectId: suggestion.projectId, publicKey: await createUniqueTaskPublicKey(ctx, suggestion.projectId),
      boardId: board._id, groupId: suggestion.groupId, workflowStateId: state._id,
      rank: rankForIndex(stateTasks.length), title: normalizeTaskText(args.title),
      description: args.description?.trim() || undefined, assigneeProjectMemberId: assignee?._id,
      searchText: `${normalizeTaskText(args.title)} ${args.description?.trim() ?? ''} `,
      priority: args.priority, dueDate: args.dueDate,
      createdByProjectMemberId: access.projectMember._id, actingCompanyId: access.actingCompanyId,
      revision: 1, terminalAt: isTerminalTaskState(state.category) ? now : undefined,
      sourceSuggestionId: suggestion._id, createIdempotencyKey: `suggestion:${suggestion._id}`,
      createdAt: now, updatedAt: now,
    })
    const task = await ctx.db.get(taskId)
    if (!task) throw new Error('task_create_failed')
    const suggestionReferences = await ctx.db.query('taskSuggestionReferences')
      .withIndex('by_suggestion_rank', (q) => q.eq('suggestionId', suggestion._id)).collect()
    if ((await Promise.all(suggestionReferences.map((reference) =>
      suggestionReferenceVisible(ctx, reference),
    ))).some((visible) => !visible)) throw new Error('task_access_changed')
    for (const reference of suggestionReferences) await ctx.db.insert('taskReferences', {
      projectId: task.projectId, taskId: task._id, type: reference.type, groupId: reference.groupId,
      channelThreadId: reference.channelThreadId, messageId: reference.messageId,
      attachmentId: reference.attachmentId,
      quote: reference.quote, availability: reference.availability, isPrimary: reference.isPrimary,
      actorProjectMemberId: access.projectMember._id, actingCompanyId: access.actingCompanyId,
      rank: reference.rank, createdAt: now, updatedAt: now,
    })
    for (const labelId of args.labelIds ?? []) {
      const label = await ctx.db.get(labelId)
      if (!label || label.projectId !== task.projectId || label.archivedAt) throw new Error('task_label_invalid')
      await ctx.db.insert('taskLabelLinks', { projectId: task.projectId, taskId, labelId, createdAt: now })
    }
    const followers: Array<{
      member: Doc<'projectMembers'>
      reason: Doc<'taskFollowers'>['reason']
    }> = [{ member: access.projectMember, reason: 'creator' }]
    if (assignee && assignee._id !== access.projectMember._id) {
      followers.push({ member: assignee, reason: 'assignee' })
    }
    for (const { member, reason } of followers) {
      const existingFollower = await ctx.db.query('taskFollowers').withIndex('by_task_member', (q) =>
        q.eq('taskId', task._id).eq('projectMemberId', member._id),
      ).unique()
      if (!existingFollower) await ctx.db.insert('taskFollowers', {
        projectId: task.projectId, taskId: task._id, userId: member.userId,
        projectMemberId: member._id, reason, enabled: true, createdAt: now, updatedAt: now,
      })
    }
    await ctx.db.patch(suggestion._id, {
      status: 'accepted', decidedByProjectMemberId: access.projectMember._id,
      decisionActingCompanyId: access.actingCompanyId, decidedTaskId: task._id,
      duplicateOverride: args.duplicateOverride, decisionIdempotencyKey: args.idempotencyKey,
      decidedAt: now, updatedAt: now,
    })
    await appendTaskActivity(ctx, {
      task, action: 'created', actorProjectMemberId: access.projectMember._id,
      actingCompanyId: access.actingCompanyId, after: { suggestionId: suggestion._id },
    })
    if (assignee) await createTaskNotification(ctx, {
      task,
      recipient: assignee,
      actorProjectMemberId: access.projectMember._id,
      eventType: 'assignment',
      payload: { publicKey: task.publicKey },
      idempotencyKey: `assignment:${task._id}:${assignee._id}:1`,
    })
    await rescheduleTaskReminders(ctx, task)
    await appendAuditEvent(ctx, {
      projectId: task.projectId, groupId: task.groupId, actorId: actor.userId,
      actorProjectMemberId: access.projectMember._id, actingCompanyId: access.actingCompanyId,
      entityType: 'task_suggestion', entityId: String(suggestion._id), action: 'accepted',
      after: { taskId },
    })
    return { status: 'accepted' as const, taskId, dismissalReason: undefined }
  },
})

export const linkToExisting = mutation({
  args: {
    suggestionId: v.id('taskSuggestions'), taskId: v.id('tasks'),
    idempotencyKey: v.string(), ...identityArgs,
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    const suggestion = await ctx.db.get(args.suggestionId)
    if (!suggestion) throw new Error('task_access_changed')
    const suggestionPolicy = await suggestionAccess(ctx, actor, suggestion, args)
    if (suggestion.status !== 'pending') return terminalResult(suggestion)
    const taskPolicy = await requireTaskAccess(ctx, actor, args.taskId, args)
    await assertProjectSnapshotWritable(ctx, suggestion.projectId)
    if (!taskPolicy.taskCapabilities.canEdit || taskPolicy.task.projectId !== suggestion.projectId ||
      taskPolicy.task.groupId !== suggestion.groupId) throw new Error('task_access_changed')
    const references = await ctx.db.query('taskSuggestionReferences')
      .withIndex('by_suggestion_rank', (q) => q.eq('suggestionId', suggestion._id)).collect()
    if ((await Promise.all(references.map((reference) =>
      suggestionReferenceVisible(ctx, reference),
    ))).some((visible) => !visible)) throw new Error('task_access_changed')
    const existing = await ctx.db.query('taskReferences')
      .withIndex('by_task_rank', (q) => q.eq('taskId', taskPolicy.task._id)).collect()
    const now = Date.now()
    for (const reference of references) {
      if (existing.some((candidate) => candidate.messageId === reference.messageId && candidate.type === reference.type)) continue
      await ctx.db.insert('taskReferences', {
        projectId: taskPolicy.task.projectId, taskId: taskPolicy.task._id, type: reference.type,
        groupId: reference.groupId, channelThreadId: reference.channelThreadId,
        messageId: reference.messageId, attachmentId: reference.attachmentId,
        quote: reference.quote, availability: reference.availability, isPrimary: false,
        actorProjectMemberId: suggestionPolicy.projectMember._id,
        actingCompanyId: suggestionPolicy.actingCompanyId,
        rank: rankForIndex(existing.length++), createdAt: now, updatedAt: now,
      })
    }
    await ctx.db.patch(suggestion._id, {
      status: 'linked', decidedByProjectMemberId: suggestionPolicy.projectMember._id,
      decisionActingCompanyId: suggestionPolicy.actingCompanyId, decidedTaskId: taskPolicy.task._id,
      decisionIdempotencyKey: args.idempotencyKey, decidedAt: now, updatedAt: now,
    })
    return { status: 'linked' as const, taskId: taskPolicy.task._id, dismissalReason: undefined }
  },
})
