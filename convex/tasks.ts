import {
  isTaskDescription,
  isTaskDueDate,
  isTaskTitle,
  isTerminalTaskState,
  getTaskDueState,
  normalizeTaskText,
  resolveTaskCapabilities,
} from '@track/shared/tasks'
import { paginationOptsValidator, type PaginationOptions } from 'convex/server'
import { v } from 'convex/values'

import type { Doc, Id } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'
import { internalMutation, mutation, query } from './_generated/server'
import { requireAuthenticatedActor } from './lib/actorContext'
import { appendAuditEvent } from './lib/audit'
import { threadsEnabled } from './lib/channelThreadPolicy'
import { createTaskNotification, notifyTaskFollowers } from './lib/taskNotifications'
import { invalidateTaskEvidence } from './lib/taskEvidence'
import { assertProjectSnapshotWritable } from './lib/projectSnapshotLock'
import {
  appendTaskActivity,
  createUniqueTaskPublicKey,
  getDefaultWorkflowState,
  isTaskArchiveBoardPayload,
  isTaskArchiveActivityPayload,
  isTaskArchiveCommentPayload,
  isTaskArchiveLabelLinkPayload,
  isTaskArchiveLabelPayload,
  isTaskArchiveReferencePayload,
  isTaskArchiveStatePayload,
  rankBetween,
  rankForIndex,
  taskArchiveAssistantRowsPage,
  taskArchiveGroupIsVisible,
  taskArchiveHasEvidence,
  taskArchiveHasLabel,
  taskArchiveMessageRowsPage,
  taskArchiveRowsPage,
  taskArchiveSourceForEntitlement,
  taskArchiveSourceRow,
  taskArchiveTaskByPublicKey,
  taskArchiveTaskRowsPage,
  taskArchiveSummary,
  taskFromArchiveRow,
  taskSummaryPage,
  taskView,
} from './lib/taskData'
import type { TaskArchiveSnapshotRow } from './lib/taskData'
import {
  assertCanAssignTaskMember,
  createTaskRequestScope,
  requireEligibleTaskMember,
  requireTaskAccess,
  requireTaskBoardAccess,
  resolveTaskRequestContext,
  type TaskRequestIdentity,
} from './lib/taskPolicy'
import { taskPriority, taskStateCategory } from './schema/taskValidators'
import { getOrCreateDefaultBoard } from './taskBoards'
import { rescheduleTaskReminders } from './taskReminders'

function localTaskDate(timestamp: number, timeZone: string | undefined) {
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(timestamp).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
    return `${parts.year}-${parts.month}-${parts.day}`
  } catch {
    return new Date(timestamp).toISOString().slice(0, 10)
  }
}

const identityArgs = {
  actingCompanyId: v.optional(v.id('companies')),
  projectMemberId: v.optional(v.id('projectMembers')),
}

/** Checklist rows keep their short description so mobile can expand context
 * without loading each child task separately. Board/list summaries stay lean. */
type TaskChildSummary<T extends { task: object }> = Omit<T, 'task'> & {
  task: T['task'] & Pick<Doc<'tasks'>, 'description'>
}

function taskChildSummary<T extends { task: object }>(
  summary: T,
  task: Doc<'tasks'>,
): TaskChildSummary<T> {
  return {
    ...summary,
    task: { ...summary.task, description: task.description },
  }
}

const referenceInput = v.object({
  type: v.union(
    v.literal('message'), v.literal('attachment'),
    v.literal('assistant_answer'), v.literal('memory_excerpt'),
  ),
  messageId: v.optional(v.id('messages')),
  attachmentId: v.optional(v.id('attachments')),
  assistantStreamId: v.optional(v.id('assistantStreams')),
  memoryImportId: v.optional(v.id('memoryImports')),
  sourceIdentifier: v.optional(v.string()),
  isPrimary: v.optional(v.boolean()),
})

type ReferenceInput = {
  type: Doc<'taskReferences'>['type']
  messageId?: Id<'messages'>
  attachmentId?: Id<'attachments'>
  assistantStreamId?: Id<'assistantStreams'>
  memoryImportId?: Id<'memoryImports'>
  sourceIdentifier?: string
  isPrimary?: boolean
}

type TaskListFilters = {
  projectId: Id<'projects'>
  boardId?: Id<'taskBoards'>
  groupId?: Id<'groups'>
  assigneeProjectMemberId?: Id<'projectMembers'>
  unassignedOnly?: boolean
  creatorProjectMemberId?: Id<'projectMembers'>
  workflowStateId?: Id<'taskWorkflowStates'>
  stateCategory?: 'backlog' | 'unstarted' | 'started' | 'completed' | 'canceled'
  priority?: 'none' | 'urgent' | 'high' | 'medium' | 'low'
  dueState?: 'none' | 'upcoming' | 'due_today' | 'overdue'
  localDate?: string
  labelId?: Id<'taskLabels'>
  openOnly?: boolean
  includeArchived?: boolean
}

const taskPageLimit = 100
const taskPageScanLimit = 256
const taskNeighborScanLimit = 256

function expectedReadFailure(error: unknown) {
  return error instanceof Error && (
    error.message === 'task_access_changed' ||
    error.message === 'project_unavailable' ||
    error.message === 'channel_unavailable'
  )
}

function validateTaskFields(input: { title: string; description?: string; dueDate?: string }) {
  if (!isTaskTitle(input.title)) throw new Error('task_title_invalid')
  if (input.description !== undefined && !isTaskDescription(input.description)) {
    throw new Error('task_description_invalid')
  }
  if (input.dueDate !== undefined && !isTaskDueDate(input.dueDate)) {
    throw new Error('task_due_date_invalid')
  }
}

async function validateReference(
  ctx: MutationCtx,
  projectId: Id<'projects'>,
  groupId: Id<'groups'> | undefined,
  reference: ReferenceInput,
) {
  const source = reference.messageId
    ? await ctx.db.get(reference.messageId)
    : reference.attachmentId
      ? await ctx.db.get(reference.attachmentId)
      : reference.assistantStreamId
        ? await ctx.db.get(reference.assistantStreamId)
        : reference.memoryImportId
          ? await ctx.db.get(reference.memoryImportId)
          : null
  if (!source || source.projectId !== projectId || ('groupId' in source && source.groupId !== groupId)) {
    throw new Error('task_reference_invalid')
  }
  const channelThreadId = 'channelThreadId' in source
    ? source.channelThreadId as Id<'channelThreads'> | undefined
    : undefined
  if (channelThreadId && !threadsEnabled()) throw new Error('task_reference_invalid')
  return { source, channelThreadId }
}

/**
 * A parent task may only enter a terminal state once the actor has confirmed
 * that its open subtasks are being closed with it.
 */
async function assertOpenSubtasksConfirmed(
  ctx: MutationCtx,
  task: Doc<'tasks'>,
  confirmed: boolean | undefined,
) {
  if (confirmed || task.parentTaskId) return
  const subtasks = await ctx.db.query('tasks')
    .withIndex('by_parent', (q) => q.eq('parentTaskId', task._id)).take(taskNeighborScanLimit + 1)
  if (subtasks.length > taskNeighborScanLimit) throw new Error('task_open_subtasks_confirmation_required')
  for (const subtask of subtasks) {
    if (subtask.archivedAt) continue
    const state = await ctx.db.get(subtask.workflowStateId)
    if (state && !isTerminalTaskState(state.category)) {
      throw new Error('task_open_subtasks_confirmation_required')
    }
  }
}

async function addFollower(
  ctx: MutationCtx,
  task: Doc<'tasks'>,
  member: Doc<'projectMembers'>,
  reason: Doc<'taskFollowers'>['reason'],
) {
  const existing = await ctx.db.query('taskFollowers')
    .withIndex('by_task_member', (q) => q.eq('taskId', task._id).eq('projectMemberId', member._id))
    .unique()
  const now = Date.now()
  if (existing) {
    await ctx.db.patch(existing._id, { enabled: true, reason, updatedAt: now })
    return
  }
  await ctx.db.insert('taskFollowers', {
    projectId: task.projectId,
    taskId: task._id,
    userId: member.userId,
    projectMemberId: member._id,
    reason,
    enabled: true,
    createdAt: now,
    updatedAt: now,
  })
}

async function insertReference(
  ctx: MutationCtx,
  task: Doc<'tasks'>,
  actorProjectMemberId: Id<'projectMembers'>,
  actingCompanyId: Id<'companies'> | undefined,
  reference: ReferenceInput,
  index: number,
) {
  const { source, channelThreadId } = await validateReference(ctx, task.projectId, task.groupId, reference)
  const quote = 'body' in source
    ? source.body.slice(0, 280)
    : 'answer' in source && typeof source.answer === 'string'
      ? source.answer.slice(0, 280)
      : 'filename' in source
        ? source.filename.slice(0, 280)
        : undefined
  return await ctx.db.insert('taskReferences', {
    projectId: task.projectId,
    taskId: task._id,
    type: reference.type,
    groupId: task.groupId,
    channelThreadId,
    messageId: reference.messageId,
    attachmentId: reference.attachmentId,
    assistantStreamId: reference.assistantStreamId,
    memoryImportId: reference.memoryImportId,
    sourceIdentifier: reference.sourceIdentifier,
    quote,
    availability: 'available',
    isPrimary: reference.isPrimary === true || index === 0,
    actorProjectMemberId,
    actingCompanyId,
    rank: rankForIndex(index),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  })
}

function taskListQuery(ctx: QueryCtx, filters: TaskListFilters) {
  const includeArchived = filters.includeArchived === true
  const boardId = filters.boardId
  const workflowStateId = filters.workflowStateId
  const priority = filters.priority
  const assigneeProjectMemberId = filters.assigneeProjectMemberId
  const groupId = filters.groupId
  if (boardId && workflowStateId && priority) {
    return ctx.db.query('tasks').withIndex('by_board_state_priority_archived_rank', (q) => {
      const indexed = q.eq('boardId', boardId).eq('workflowStateId', workflowStateId).eq('priority', priority)
      // eslint-disable-next-line unicorn/no-useless-undefined -- reason: Convex compares absent fields explicitly.
      return includeArchived ? indexed : indexed.eq('archivedAt', undefined)
    })
  }
  if (boardId && workflowStateId) {
    return ctx.db.query('tasks').withIndex('by_board_state_archived_rank', (q) => {
      const indexed = q.eq('boardId', boardId).eq('workflowStateId', workflowStateId)
      // eslint-disable-next-line unicorn/no-useless-undefined -- reason: Convex compares absent fields explicitly.
      return includeArchived ? indexed : indexed.eq('archivedAt', undefined)
    })
  }
  if (boardId && priority) {
    return ctx.db.query('tasks').withIndex('by_board_priority_archived_rank', (q) => {
      const indexed = q.eq('boardId', boardId).eq('priority', priority)
      // eslint-disable-next-line unicorn/no-useless-undefined -- reason: Convex compares absent fields explicitly.
      return includeArchived ? indexed : indexed.eq('archivedAt', undefined)
    })
  }
  if (boardId) {
    return ctx.db.query('tasks').withIndex('by_board_archived_rank', (q) => {
      const indexed = q.eq('boardId', boardId)
      // eslint-disable-next-line unicorn/no-useless-undefined -- reason: Convex compares absent fields explicitly.
      return includeArchived ? indexed : indexed.eq('archivedAt', undefined)
    })
  }
  if (assigneeProjectMemberId) {
    return ctx.db.query('tasks').withIndex('by_assignee_archived', (q) => {
      const indexed = q.eq('assigneeProjectMemberId', assigneeProjectMemberId)
      // eslint-disable-next-line unicorn/no-useless-undefined -- reason: Convex compares absent fields explicitly.
      return includeArchived ? indexed : indexed.eq('archivedAt', undefined)
    })
  }
  if (groupId) {
    return ctx.db.query('tasks').withIndex('by_project_scope_archived', (q) => {
      const indexed = q.eq('projectId', filters.projectId).eq('groupId', groupId)
      // eslint-disable-next-line unicorn/no-useless-undefined -- reason: Convex compares absent fields explicitly.
      return includeArchived ? indexed : indexed.eq('archivedAt', undefined)
    })
  }
  if (priority) {
    return ctx.db.query('tasks').withIndex('by_project_priority_archived_rank', (q) => {
      const indexed = q.eq('projectId', filters.projectId).eq('priority', priority)
      // eslint-disable-next-line unicorn/no-useless-undefined -- reason: Convex compares absent fields explicitly.
      return includeArchived ? indexed : indexed.eq('archivedAt', undefined)
    })
  }
  return ctx.db.query('tasks').withIndex('by_project_archived', (q) => {
    const indexed = q.eq('projectId', filters.projectId)
    // eslint-disable-next-line unicorn/no-useless-undefined -- reason: Convex compares absent fields explicitly.
    return includeArchived ? indexed : indexed.eq('archivedAt', undefined)
  })
}

async function filterTaskRows(
  ctx: QueryCtx,
  scope: Awaited<ReturnType<typeof createTaskRequestScope>>,
  filters: TaskListFilters,
  rows: Array<Doc<'tasks'>>,
) {
  const labelId = filters.labelId
  const boardIds = Array.from(new Set(rows.map((task) => task.boardId)))
  const stateIds = Array.from(new Set(rows.map((task) => task.workflowStateId)))
  const [boards, states] = await Promise.all([
    Promise.all(boardIds.map((boardId) => ctx.db.get(boardId))),
    Promise.all(stateIds.map((stateId) => ctx.db.get(stateId))),
  ])
  const boardsById = new Map<Id<'taskBoards'>, Doc<'taskBoards'>>()
  for (const [index, board] of boards.entries()) {
    if (board) boardsById.set(boardIds[index], board)
  }
  const statesById = new Map<Id<'taskWorkflowStates'>, Doc<'taskWorkflowStates'>>()
  for (const [index, state] of states.entries()) {
    if (state) statesById.set(stateIds[index], state)
  }
  const channelAccess = new Map<string, boolean>()
  const visible: Array<Doc<'tasks'>> = []
  for (const task of rows) {
    if (task.projectId !== filters.projectId) continue
    if (!filters.includeArchived && task.archivedAt) continue
    if (filters.boardId && task.boardId !== filters.boardId) continue
    if (filters.groupId && task.groupId !== filters.groupId) continue
    if (filters.assigneeProjectMemberId && task.assigneeProjectMemberId !== filters.assigneeProjectMemberId) continue
    if (filters.unassignedOnly && task.assigneeProjectMemberId) continue
    if (filters.creatorProjectMemberId && task.createdByProjectMemberId !== filters.creatorProjectMemberId) continue
    if (filters.workflowStateId && task.workflowStateId !== filters.workflowStateId) continue
    if (filters.priority && task.priority !== filters.priority) continue
    const board = boardsById.get(task.boardId)
    if (!board || board.projectId !== filters.projectId || (!filters.includeArchived && board.archivedAt)) continue
    const state = statesById.get(task.workflowStateId)
    if (!state || (filters.stateCategory && state.category !== filters.stateCategory)) continue
    if (filters.openOnly && isTerminalTaskState(state.category)) continue
    if (filters.dueState && getTaskDueState(
      task.dueDate,
      filters.localDate ?? new Date().toISOString().slice(0, 10),
      isTerminalTaskState(state.category),
    ) !== filters.dueState) continue
    if (labelId) {
      const link = await ctx.db.query('taskLabelLinks')
        .withIndex('by_task_label', (q) => q.eq('taskId', task._id).eq('labelId', labelId))
        .unique()
      if (!link) continue
    }
    if (!task.groupId) {
      if (!scope.project.capabilities.canReadProject) continue
    } else {
      const key = String(task.groupId)
      let canRead = channelAccess.get(key)
      if (canRead === undefined) {
        try {
          const channel = await scope.forGroup(task.groupId)
          canRead = channel.capabilities.canReadChannel
        } catch (error) {
          if (!expectedReadFailure(error)) throw error
          canRead = false
        }
        channelAccess.set(key, canRead)
      }
      if (!canRead) continue
    }
    visible.push(task)
  }
  return visible
}

async function collectTaskListPage(
  ctx: QueryCtx,
  scope: Awaited<ReturnType<typeof createTaskRequestScope>>,
  filters: TaskListFilters,
  paginationOpts: PaginationOptions,
) {
  const pageSize = Math.min(Math.max(Math.trunc(paginationOpts.numItems), 1), taskPageLimit)
  const result = await taskListQuery(ctx, filters).paginate({ ...paginationOpts, numItems: pageSize })
  const tasks = await filterTaskRows(ctx, scope, filters, result.page)
  const page = await taskSummaryPage(ctx, tasks)
  return { page, isDone: result.isDone, continueCursor: result.continueCursor }
}

async function archivedTaskListPage(
  ctx: QueryCtx,
  scope: Awaited<ReturnType<typeof createTaskRequestScope>>,
  filters: TaskListFilters,
  paginationOpts: PaginationOptions,
) {
  const entitlement = scope.project.entitlement
  if (!entitlement) return { page: [], isDone: true, continueCursor: paginationOpts.cursor ?? '' }
  const pageSize = Math.min(Math.max(Math.trunc(paginationOpts.numItems), 1), taskPageLimit)
  const archiveSource = taskArchiveSourceForEntitlement(entitlement)
  const result = await taskArchiveRowsPage(ctx, archiveSource, 'tasks', {
    ...paginationOpts,
    numItems: pageSize,
  })
  const page: Array<ReturnType<typeof taskArchiveSummary>> = []
  for (const row of result.page) {
      const task = taskFromArchiveRow(row)
      if (!task || (task.groupId && !await taskArchiveGroupIsVisible(
        ctx,
        entitlement,
        scope.project.projectMember._id,
        task.groupId,
      ))) continue
      if (!filters.includeArchived && task.archivedAt) continue
      if (filters.boardId && task.boardId !== filters.boardId) continue
      if (filters.groupId && task.groupId !== filters.groupId) continue
      if (filters.assigneeProjectMemberId && task.assigneeProjectMemberId !== filters.assigneeProjectMemberId) continue
      if (filters.unassignedOnly && task.assigneeProjectMemberId) continue
      if (filters.creatorProjectMemberId && task.createdByProjectMemberId !== filters.creatorProjectMemberId) continue
      if (filters.workflowStateId && task.workflowStateId !== filters.workflowStateId) continue
      if (filters.priority && task.priority !== filters.priority) continue

      const [boardRow, stateRow] = await Promise.all([
        taskArchiveSourceRow(ctx, archiveSource, 'taskBoards', String(task.boardId)),
        taskArchiveSourceRow(ctx, archiveSource, 'taskWorkflowStates', String(task.workflowStateId)),
      ])
      const board = boardRow && isTaskArchiveBoardPayload(boardRow.payload) ? boardRow.payload : null
      const state = stateRow && isTaskArchiveStatePayload(stateRow.payload) ? stateRow.payload : null
      if (!board || !state || (!filters.includeArchived && board.archivedAt)) continue
      if (filters.stateCategory && state.category !== filters.stateCategory) continue
      if (filters.openOnly && isTerminalTaskState(state.category)) continue
      if (filters.dueState && getTaskDueState(
        task.dueDate,
        filters.localDate ?? new Date().toISOString().slice(0, 10),
        isTerminalTaskState(state.category),
      ) !== filters.dueState) continue
      if (filters.labelId && !await taskArchiveHasLabel(ctx, archiveSource, task._id, filters.labelId)) continue
      page.push(taskArchiveSummary(
        task,
        board,
        state,
        await taskArchiveHasEvidence(ctx, archiveSource, task._id),
      ))
    if (page.length >= pageSize) break
  }
  return { page, isDone: result.isDone, continueCursor: result.continueCursor }
}

export const listPage = query({
  args: {
    projectId: v.id('projects'),
    boardId: v.optional(v.id('taskBoards')),
    groupId: v.optional(v.id('groups')),
    assigneeProjectMemberId: v.optional(v.id('projectMembers')),
    unassignedOnly: v.optional(v.boolean()),
    creatorProjectMemberId: v.optional(v.id('projectMembers')),
    workflowStateId: v.optional(v.id('taskWorkflowStates')),
    stateCategory: v.optional(taskStateCategory),
    priority: v.optional(taskPriority),
    dueState: v.optional(v.union(v.literal('none'), v.literal('upcoming'), v.literal('due_today'), v.literal('overdue'))),
    localDate: v.optional(v.string()),
    labelId: v.optional(v.id('taskLabels')),
    openOnly: v.optional(v.boolean()),
    includeArchived: v.optional(v.boolean()),
    paginationOpts: paginationOptsValidator,
    ...identityArgs,
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    const scope = await createTaskRequestScope(ctx, actor, args.projectId, args)
    if (scope.project.capabilities.accessMode === 'archive') {
      return await archivedTaskListPage(ctx, scope, args, args.paginationOpts)
    }
    if (!scope.project.capabilities.canReadProject && !args.groupId) {
      return { page: [], isDone: true, continueCursor: args.paginationOpts.cursor ?? '' }
    }
    return await collectTaskListPage(ctx, scope, args, args.paginationOpts)
  },
})

async function archivedTaskDetailByKey(
  ctx: QueryCtx,
  entitlement: Doc<'projectArchiveEntitlements'>,
  publicKey: string,
  currentProjectMemberId: Id<'projectMembers'>,
) {
  const archiveSource = taskArchiveSourceForEntitlement(entitlement)
  const taskRow = await taskArchiveTaskByPublicKey(ctx, archiveSource, publicKey)
  const task = taskRow ? taskFromArchiveRow(taskRow) : null
  if (!task || (task.groupId && !await taskArchiveGroupIsVisible(
    ctx,
    entitlement,
    currentProjectMemberId,
    task.groupId,
  ))) return null
  const hasTaskIdentity = Boolean(taskRow?.taskId)
  const [boardRow, stateRow] = await Promise.all([
    taskArchiveSourceRow(ctx, archiveSource, 'taskBoards', String(task.boardId)),
    taskArchiveSourceRow(ctx, archiveSource, 'taskWorkflowStates', String(task.workflowStateId)),
  ])
  const board = boardRow && isTaskArchiveBoardPayload(boardRow.payload) ? boardRow.payload : null
  const state = stateRow && isTaskArchiveStatePayload(stateRow.payload) ? stateRow.payload : null
  if (!board || !state) return null

  let linkRows: TaskArchiveSnapshotRow[] = []
  let referenceRows: TaskArchiveSnapshotRow[] = []
  let commentRows: TaskArchiveSnapshotRow[] = []
  let activityRows: TaskArchiveSnapshotRow[] = []
  if (hasTaskIdentity) {
    const pages = await Promise.all([
      taskArchiveTaskRowsPage(ctx, archiveSource, task._id, 'taskLabelLinks', { cursor: null, numItems: taskPageLimit }),
      taskArchiveTaskRowsPage(ctx, archiveSource, task._id, 'taskReferences', { cursor: null, numItems: taskPageLimit }),
      taskArchiveTaskRowsPage(ctx, archiveSource, task._id, 'taskComments', { cursor: null, numItems: taskPageLimit }),
      taskArchiveTaskRowsPage(ctx, archiveSource, task._id, 'taskActivities', { cursor: null, numItems: taskPageLimit }),
    ])
    linkRows = pages[0].page
    referenceRows = pages[1].page
    commentRows = pages[2].page
    activityRows = pages[3].page
  }
  const visibleRows = async (rows: TaskArchiveSnapshotRow[]) => {
    const visible = await Promise.all(rows.map(async (row) =>
      !row.groupId || await taskArchiveGroupIsVisible(ctx, entitlement, currentProjectMemberId, row.groupId)
        ? row
        : null,
    ))
    return visible.filter((row): row is TaskArchiveSnapshotRow => row !== null)
  }
  const [visibleLinkRows, visibleReferenceRows, visibleCommentRows, visibleActivityRows] = await Promise.all([
    visibleRows(linkRows),
    visibleRows(referenceRows),
    visibleRows(commentRows),
    visibleRows(activityRows),
  ])
  const labelLinks = visibleLinkRows.flatMap((row) =>
    isTaskArchiveLabelLinkPayload(row.payload) ? [row.payload] : [])
  const labelRows = await Promise.all(labelLinks.map((link) =>
    taskArchiveSourceRow(ctx, archiveSource, 'taskLabels', String(link.labelId)),
  ))
  const labels = labelRows.flatMap((row) =>
    row && isTaskArchiveLabelPayload(row.payload) ? [row.payload] : [])
  const references = visibleReferenceRows.flatMap((row) => {
    if (row.sourceTable !== 'taskReferences' || !isTaskArchiveReferencePayload(row.payload)) return []
    return [{
      ...row.payload,
      availability: row.payload.channelThreadId && !threadsEnabled() ? 'unavailable' as const : row.payload.availability,
      quote: row.payload.channelThreadId && !threadsEnabled() ? undefined : row.payload.quote,
    }]
  })
  const comments = visibleCommentRows.flatMap((row) =>
    row.sourceTable === 'taskComments' && isTaskArchiveCommentPayload(row.payload) ? [row.payload] : [])
  const activities = visibleActivityRows.flatMap((row) =>
    row.sourceTable === 'taskActivities' && isTaskArchiveActivityPayload(row.payload) ? [row.payload] : [])
  return {
    ...taskArchiveSummary(task, board, state, visibleReferenceRows.length > 0),
    // Detail consumers need the complete archived task payload. Keep list and
    // link projections compact, but do not drop description from getByKey.
    task,
    board,
    state,
    creator: null,
    labels,
    references,
    comments,
    activities,
    following: false,
    capabilities: {
      canView: true, canCreate: false, canEdit: false, canAssignOthers: false,
      canTransfer: false, canManage: false, canChangeScope: false,
      canArchive: false, canComment: false,
    },
    currentProjectMemberId,
    restrictedEarlierContext: !hasTaskIdentity,
  }
}

export const list = query({
  args: {
    projectId: v.id('projects'),
    boardId: v.optional(v.id('taskBoards')),
    groupId: v.optional(v.id('groups')),
    assigneeProjectMemberId: v.optional(v.id('projectMembers')),
    creatorProjectMemberId: v.optional(v.id('projectMembers')),
    workflowStateId: v.optional(v.id('taskWorkflowStates')),
    stateCategory: v.optional(taskStateCategory),
    priority: v.optional(taskPriority),
    dueState: v.optional(v.union(v.literal('none'), v.literal('upcoming'), v.literal('due_today'), v.literal('overdue'))),
    localDate: v.optional(v.string()),
    labelId: v.optional(v.id('taskLabels')),
    openOnly: v.optional(v.boolean()),
    includeArchived: v.optional(v.boolean()),
    ...identityArgs,
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    const scope = await createTaskRequestScope(ctx, actor, args.projectId, args)
    if (scope.project.capabilities.accessMode === 'archive') {
      const archived = await archivedTaskListPage(ctx, scope, args, { cursor: null, numItems: taskPageLimit })
      return archived.page.map((item) => ({ ...item, capabilities: { ...scope.project.capabilities, canView: true, canCreate: false, canEdit: false, canAssignOthers: false, canTransfer: false, canManage: false, canChangeScope: false, canArchive: false, canComment: false } }))
    }
    const rows = args.assigneeProjectMemberId
      ? await ctx.db.query('tasks')
          .withIndex('by_assignee_archived', (q) => q.eq('assigneeProjectMemberId', args.assigneeProjectMemberId))
          .collect()
      : await ctx.db.query('tasks')
          .withIndex('by_project_archived', (q) => q.eq('projectId', args.projectId))
          .collect()
    const visible = []
    for (const task of rows) {
      if (task.projectId !== args.projectId) continue
      if (!args.includeArchived && task.archivedAt) continue
      const board = await ctx.db.get(task.boardId)
      if (!board || (!args.includeArchived && board.archivedAt)) continue
      if (args.boardId && task.boardId !== args.boardId) continue
      if (args.groupId && task.groupId !== args.groupId) continue
      if (args.creatorProjectMemberId && task.createdByProjectMemberId !== args.creatorProjectMemberId) continue
      if (args.workflowStateId && task.workflowStateId !== args.workflowStateId) continue
      if (args.priority && task.priority !== args.priority) continue
      const state = await ctx.db.get(task.workflowStateId)
      if (!state) continue
      if (args.stateCategory && state.category !== args.stateCategory) continue
      if (args.openOnly && isTerminalTaskState(state.category)) continue
      if (args.dueState && getTaskDueState(task.dueDate, args.localDate ?? new Date().toISOString().slice(0, 10), isTerminalTaskState(state.category)) !== args.dueState) continue
      if (args.labelId) {
        const link = await ctx.db.query('taskLabelLinks')
          .withIndex('by_task_label', (q) => q.eq('taskId', task._id).eq('labelId', args.labelId!)).unique()
        if (!link) continue
      }
      let taskAccess
      try {
        taskAccess = await requireTaskAccess(ctx, actor, task._id, args)
      } catch {
        continue
      }
      visible.push({
        ...await taskView(ctx, task),
        capabilities: taskAccess.taskCapabilities,
      })
    }
    return visible
  },
})

export const getByKey = query({
  args: { projectId: v.id('projects'), publicKey: v.string(), ...identityArgs },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    const projectAccess = await resolveTaskRequestContext(ctx, actor, args.projectId, args)
    if (projectAccess.capabilities.accessMode === 'archive' && projectAccess.entitlement) {
      return await archivedTaskDetailByKey(
        ctx,
        projectAccess.entitlement,
        args.publicKey,
        projectAccess.projectMember._id,
      )
    }
    const task = await ctx.db.query('tasks')
      .withIndex('by_project_key', (q) => q.eq('projectId', args.projectId).eq('publicKey', args.publicKey))
      .unique()
    if (!task) return null
    try {
      const access = await requireTaskAccess(ctx, actor, task._id, args)
      const [comments, activities, follow, references] = await Promise.all([
        ctx.db.query('taskComments').withIndex('by_task_created_at', (q) => q.eq('taskId', task._id)).order('desc').take(taskPageLimit),
        ctx.db.query('taskActivities').withIndex('by_task_created_at', (q) => q.eq('taskId', task._id)).order('desc').take(taskPageLimit),
        ctx.db.query('taskFollowers').withIndex('by_task_member', (q) =>
          q.eq('taskId', task._id).eq('projectMemberId', access.projectMember._id),
        ).unique(),
        ctx.db.query('taskReferences').withIndex('by_task_rank', (q) => q.eq('taskId', task._id)).take(taskPageLimit),
      ])
      const originalGroups = new Set<string>()
      for (const groupId of new Set([
        ...comments.map((comment) => comment.originalGroupId),
        ...activities.map((activity) => activity.originalGroupId),
        ...references.map((reference) => reference.groupId),
      ].filter(Boolean))) {
        try {
          const scoped = await resolveTaskRequestContext(ctx, actor, task.projectId, args, groupId)
          if (scoped.capabilities.canReadChannel) originalGroups.add(String(groupId))
        } catch {
          continue
        }
      }
      const view = await taskView(ctx, task, originalGroups, { includeReferences: true, maxReferences: taskPageLimit })
      const visibleComments = comments.filter((comment) => !comment.originalGroupId ||
        comment.originalGroupId === task.groupId || originalGroups.has(String(comment.originalGroupId)))
      const visibleActivities = activities.filter((activity) => !activity.originalGroupId ||
        activity.originalGroupId === task.groupId || originalGroups.has(String(activity.originalGroupId)))
      return {
        ...view,
        comments: visibleComments,
        activities: visibleActivities,
        following: follow?.enabled ?? false,
        capabilities: access.taskCapabilities,
        currentProjectMemberId: access.projectMember._id,
        restrictedEarlierContext: comments.length >= taskPageLimit || activities.length >= taskPageLimit ||
          references.length >= taskPageLimit ||
          comments.length !== visibleComments.length || activities.length !== visibleActivities.length,
      }
    } catch {
      return null
    }
  },
})

async function canReadOriginalTaskGroup(
  ctx: QueryCtx,
  actor: Awaited<ReturnType<typeof requireAuthenticatedActor>>,
  task: Doc<'tasks'>,
  identity: TaskRequestIdentity,
  originalGroupId: Id<'groups'> | undefined,
) {
  if (!originalGroupId || originalGroupId === task.groupId) return true
  try {
    const access = await resolveTaskRequestContext(ctx, actor, task.projectId, identity, originalGroupId)
    return access.capabilities.canReadChannel
  } catch (error) {
    if (!expectedReadFailure(error)) throw error
    return false
  }
}

async function collectVisiblePage<Source, Output>(
  paginationOpts: PaginationOptions,
  load: (pagination: PaginationOptions) => Promise<{
    continueCursor: string;
    isDone: boolean;
    page: Source[];
  }>,
  project: (row: Source) => Promise<Output | null>,
) {
  const pageSize = Math.min(Math.max(Math.trunc(paginationOpts.numItems), 1), taskPageLimit)
  const page: Output[] = []
  let cursor = paginationOpts.cursor
  let isDone = false
  let scanned = 0
  while (page.length < pageSize && !isDone && scanned < taskPageScanLimit) {
    const result = await load({
      cursor,
      numItems: Math.min(pageSize - page.length, taskPageScanLimit - scanned),
    })
    scanned += result.page.length
    cursor = result.continueCursor
    isDone = result.isDone
    for (const row of result.page) {
      const value = await project(row)
      if (value !== null) page.push(value)
    }
    if (result.page.length === 0) break
  }
  return { page, isDone, continueCursor: cursor ?? '' }
}

export const listChildren = query({
  args: {
    parentTaskId: v.id('tasks'),
    includeArchived: v.optional(v.boolean()),
    paginationOpts: paginationOptsValidator,
    ...identityArgs,
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    const access = await requireTaskAccess(ctx, actor, args.parentTaskId, args)
    const entitlement = access.entitlement
    if (entitlement) {
      const archiveSource = taskArchiveSourceForEntitlement(entitlement)
      return await collectVisiblePage<
        TaskArchiveSnapshotRow,
        TaskChildSummary<ReturnType<typeof taskArchiveSummary>>
      >(args.paginationOpts, (pagination) =>
        taskArchiveRowsPage(ctx, archiveSource, 'tasks', pagination), async (row) => {
        const child = taskFromArchiveRow(row)
        if (!child || child.parentTaskId !== access.task._id || (!args.includeArchived && child.archivedAt)) return null
        if (child.groupId && !await taskArchiveGroupIsVisible(
          ctx,
          entitlement,
          access.projectMember._id,
          child.groupId,
        )) return null
        const [boardRow, stateRow] = await Promise.all([
          taskArchiveSourceRow(ctx, archiveSource, 'taskBoards', String(child.boardId)),
          taskArchiveSourceRow(ctx, archiveSource, 'taskWorkflowStates', String(child.workflowStateId)),
        ])
        const board = boardRow && isTaskArchiveBoardPayload(boardRow.payload) ? boardRow.payload : null
        const state = stateRow && isTaskArchiveStatePayload(stateRow.payload) ? stateRow.payload : null
        if (!board || !state) return null
        return taskChildSummary(taskArchiveSummary(
          child,
          board,
          state,
          await taskArchiveHasEvidence(ctx, archiveSource, child._id),
        ), child)
      })
    }
    return await collectVisiblePage(args.paginationOpts, (pagination) => ctx.db.query('tasks')
      .withIndex('by_parent_rank', (q) => q.eq('parentTaskId', access.task._id))
      .paginate(pagination), async (task) => {
      if (!args.includeArchived && task.archivedAt) return null
      const [summary] = await taskSummaryPage(ctx, [task])
      return summary ? taskChildSummary(summary, task) : null
    })
  },
})

export const listHistory = query({
  args: {
    taskId: v.id('tasks'),
    kind: v.optional(v.union(v.literal('comments'), v.literal('activities'))),
    paginationOpts: paginationOptsValidator,
    ...identityArgs,
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    const access = await requireTaskAccess(ctx, actor, args.taskId, args)
    const kind = args.kind ?? 'comments'
    const entitlement = access.entitlement
    if (entitlement) {
      const archiveSource = taskArchiveSourceForEntitlement(entitlement)
      return await collectVisiblePage<
        TaskArchiveSnapshotRow,
        Doc<'taskComments'> | Doc<'taskActivities'>
      >(args.paginationOpts, (pagination) => taskArchiveTaskRowsPage(
        ctx, archiveSource, access.task._id,
        kind === 'comments' ? 'taskComments' : 'taskActivities', pagination,
      ), async (row) => {
        const item = kind === 'comments'
          ? isTaskArchiveCommentPayload(row.payload) ? row.payload : null
          : isTaskArchiveActivityPayload(row.payload) ? row.payload : null
        return item && (!row.groupId || await taskArchiveGroupIsVisible(
          ctx,
          entitlement,
          access.projectMember._id,
          row.groupId,
        )) ? item : null
      })
    }
    if (kind === 'comments') {
      return await collectVisiblePage(args.paginationOpts, (pagination) => ctx.db.query('taskComments')
        .withIndex('by_task_created_at', (q) => q.eq('taskId', access.task._id)).order('desc')
        .paginate(pagination), async (comment) =>
        await canReadOriginalTaskGroup(ctx, actor, access.task, args, comment.originalGroupId) ? comment : null)
    }
    return await collectVisiblePage(args.paginationOpts, (pagination) => ctx.db.query('taskActivities')
      .withIndex('by_task_created_at', (q) => q.eq('taskId', access.task._id)).order('desc')
      .paginate(pagination), async (activity) =>
      await canReadOriginalTaskGroup(ctx, actor, access.task, args, activity.originalGroupId) ? activity : null)
  },
})

export const listReferences = query({
  args: {
    taskId: v.id('tasks'),
    paginationOpts: paginationOptsValidator,
    ...identityArgs,
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    const access = await requireTaskAccess(ctx, actor, args.taskId, args)
    const entitlement = access.entitlement
    if (entitlement) {
      const archiveSource = taskArchiveSourceForEntitlement(entitlement)
      return await collectVisiblePage<TaskArchiveSnapshotRow, Doc<'taskReferences'>>(
        args.paginationOpts, (pagination) => taskArchiveTaskRowsPage(
        ctx, archiveSource, access.task._id, 'taskReferences', pagination,
      ), async (row) => {
        return isTaskArchiveReferencePayload(row.payload) &&
          (!row.groupId || await taskArchiveGroupIsVisible(
            ctx,
            entitlement,
            access.projectMember._id,
            row.groupId,
          )) ? row.payload : null
      })
    }
    return await collectVisiblePage(args.paginationOpts, (pagination) => ctx.db.query('taskReferences')
      .withIndex('by_task_rank', (q) => q.eq('taskId', access.task._id))
      .paginate(pagination), async (reference) =>
      await canReadOriginalTaskGroup(ctx, actor, access.task, args, reference.groupId) ? reference : null)
  },
})

type TaskLinkSummary = Awaited<ReturnType<typeof taskSummaryPage>>[number]

async function taskLinksForMessage(
  ctx: QueryCtx,
  actor: Awaited<ReturnType<typeof requireAuthenticatedActor>>,
  messageId: Id<'messages'>,
  identity: TaskRequestIdentity,
) {
  const message = await ctx.db.get(messageId)
  if (!message || (message.channelThreadId && !threadsEnabled())) return null
  const access = await resolveTaskRequestContext(ctx, actor, message.projectId, identity, message.groupId)
  const canRead = message.groupId
    ? access.capabilities.canReadChannel
    : access.capabilities.canReadProject
  if (!canRead) return null
  const entitlement = access.entitlement
  if (entitlement) {
    const archiveSource = taskArchiveSourceForEntitlement(entitlement)
    const referencePage = await taskArchiveMessageRowsPage(
      ctx,
      archiveSource,
      message._id,
      { cursor: null, numItems: taskPageLimit },
    )
    const referenceRows = referencePage.page
    const taskIds = Array.from(new Set((await Promise.all(referenceRows.map(async (row) =>
      row.sourceTable === 'taskReferences' && row.taskId &&
      (!row.groupId || await taskArchiveGroupIsVisible(ctx, entitlement, access.projectMember._id, row.groupId))
        ? row.taskId : null,
    ))).filter((taskId): taskId is Id<'tasks'> => taskId !== null)))
    const summaries: Array<TaskLinkSummary> = []
    for (const taskId of taskIds) {
      const taskPage = await taskArchiveTaskRowsPage(
        ctx,
        archiveSource,
        taskId,
        'tasks',
        { cursor: null, numItems: 1 },
      )
      const task = taskPage.page[0] ? taskFromArchiveRow(taskPage.page[0]) : null
      if (!task || task.archivedAt || (task.groupId && !await taskArchiveGroupIsVisible(
        ctx,
        entitlement,
        access.projectMember._id,
        task.groupId,
      ))) continue
      const related = await Promise.all([
        taskArchiveSourceRow(ctx, archiveSource, 'taskBoards', String(task.boardId)),
        taskArchiveSourceRow(ctx, archiveSource, 'taskWorkflowStates', String(task.workflowStateId)),
      ])
      const board = related[0] && isTaskArchiveBoardPayload(related[0].payload) ? related[0].payload : null
      const state = related[1] && isTaskArchiveStatePayload(related[1].payload) ? related[1].payload : null
      if (board && state) summaries.push(taskArchiveSummary(task, board, state, true))
    }
    return summaries
  }
  const references = await ctx.db.query('taskReferences')
    .withIndex('by_message', (q) => q.eq('messageId', message._id)).take(taskPageLimit)
  const taskIds = Array.from(new Set(references.flatMap((reference) =>
    reference.availability === 'available' ? [reference.taskId] : [])))
  const tasks = (await Promise.all(taskIds.map((taskId) => ctx.db.get(taskId))))
    .filter((task): task is Doc<'tasks'> => Boolean(task && !task.archivedAt && task.groupId === message.groupId))
  return await taskSummaryPage(ctx, tasks)
}

export const listForMessages = query({
  args: {
    messageIds: v.array(v.id('messages')),
    ...identityArgs,
  },
  handler: async (ctx, args) => {
    if (args.messageIds.length > taskPageLimit) throw new Error('task_batch_limit')
    const actor = await requireAuthenticatedActor(ctx)
    const results: Array<{ messageId: Id<'messages'>; tasks: Array<TaskLinkSummary> }> = []
    const uniqueIds = Array.from(new Set(args.messageIds.map(String)))
    for (const messageId of uniqueIds) {
      const parsed = args.messageIds.find((candidate) => String(candidate) === messageId)
      if (!parsed) continue
      const tasks = await taskLinksForMessage(ctx, actor, parsed, args)
      if (tasks) results.push({ messageId: parsed, tasks })
    }
    return results
  },
})

export const listEligibleAssignees = query({
  args: { projectId: v.id('projects'), groupId: v.optional(v.id('groups')), ...identityArgs },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    const access = await resolveTaskRequestContext(ctx, actor, args.projectId, args, args.groupId)
    if (args.groupId && !access.capabilities.canReadChannel) throw new Error('task_access_changed')
    if (access.capabilities.accessMode !== 'active') return []
    const members = await ctx.db.query('projectMembers')
      .withIndex('by_project', (q) => q.eq('projectId', args.projectId)).collect()
    const eligible = []
    for (const member of members) {
      if (member.status !== undefined && member.status !== 'active') continue
      try {
        await requireEligibleTaskMember(ctx, {
          projectId: args.projectId, groupId: args.groupId, projectMemberId: member._id,
        })
      } catch {
        continue
      }
      const [user, company] = await Promise.all([
        ctx.db.get(member.userId), member.companyId ? ctx.db.get(member.companyId) : null,
      ])
      if (user) eligible.push({ member, user: { _id: user._id, displayName: user.displayName }, company })
    }
    return eligible
  },
})

export const listForMessage = query({
  args: { messageId: v.id('messages'), ...identityArgs },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    return await taskLinksForMessage(ctx, actor, args.messageId, args) ?? []
  },
})

async function taskLinksForAssistant(
  ctx: QueryCtx,
  actor: Awaited<ReturnType<typeof requireAuthenticatedActor>>,
  assistantStreamId: Id<'assistantStreams'>,
  identity: TaskRequestIdentity,
) {
  const stream = await ctx.db.get(assistantStreamId)
  if (!stream || stream.status !== 'completed' || (stream.channelThreadId && !threadsEnabled())) return null
  const access = await resolveTaskRequestContext(ctx, actor, stream.projectId, identity, stream.groupId)
  const canRead = stream.groupId
    ? access.capabilities.canReadChannel
    : access.capabilities.canReadProject
  if (!canRead) return null
  const entitlement = access.entitlement
  if (entitlement) {
    const archiveSource = taskArchiveSourceForEntitlement(entitlement)
    const referencePage = await taskArchiveAssistantRowsPage(
      ctx,
      archiveSource,
      stream._id,
      { cursor: null, numItems: taskPageLimit },
    )
    const referenceRows = referencePage.page
    const taskIds = Array.from(new Set((await Promise.all(referenceRows.map(async (row) =>
      row.sourceTable === 'taskReferences' && row.taskId &&
      (!row.groupId || await taskArchiveGroupIsVisible(ctx, entitlement, access.projectMember._id, row.groupId))
        ? row.taskId : null,
    ))).filter((taskId): taskId is Id<'tasks'> => taskId !== null)))
    const summaries: Array<TaskLinkSummary> = []
    for (const taskId of taskIds) {
      const taskPage = await taskArchiveTaskRowsPage(
        ctx,
        archiveSource,
        taskId,
        'tasks',
        { cursor: null, numItems: 1 },
      )
      const task = taskPage.page[0] ? taskFromArchiveRow(taskPage.page[0]) : null
      if (!task || task.archivedAt || task.groupId !== stream.groupId ||
        (task.groupId && !await taskArchiveGroupIsVisible(
          ctx,
          entitlement,
          access.projectMember._id,
          task.groupId,
        ))) continue
      const [boardRow, stateRow] = await Promise.all([
        taskArchiveSourceRow(ctx, archiveSource, 'taskBoards', String(task.boardId)),
        taskArchiveSourceRow(ctx, archiveSource, 'taskWorkflowStates', String(task.workflowStateId)),
      ])
      const board = boardRow && isTaskArchiveBoardPayload(boardRow.payload) ? boardRow.payload : null
      const state = stateRow && isTaskArchiveStatePayload(stateRow.payload) ? stateRow.payload : null
      if (board && state) summaries.push(taskArchiveSummary(task, board, state, true))
    }
    return summaries
  }
  const references = await ctx.db.query('taskReferences')
    .withIndex('by_assistant_stream', (q) => q.eq('assistantStreamId', stream._id)).take(taskPageLimit)
  const taskIds = Array.from(new Set(references.flatMap((reference) =>
    reference.availability === 'available' ? [reference.taskId] : [])))
  const tasks = (await Promise.all(taskIds.map((taskId) => ctx.db.get(taskId))))
    .filter((task): task is Doc<'tasks'> => Boolean(task && !task.archivedAt && task.groupId === stream.groupId))
  return await taskSummaryPage(ctx, tasks)
}

export const listForAssistant = query({
  args: { assistantStreamId: v.id('assistantStreams'), ...identityArgs },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    return await taskLinksForAssistant(ctx, actor, args.assistantStreamId, args) ?? []
  },
})

export const listForAssistantStreams = query({
  args: {
    assistantStreamIds: v.array(v.id('assistantStreams')),
    ...identityArgs,
  },
  handler: async (ctx, args) => {
    if (args.assistantStreamIds.length > taskPageLimit) throw new Error('task_batch_limit')
    const actor = await requireAuthenticatedActor(ctx)
    const results: Array<{ assistantStreamId: Id<'assistantStreams'>; tasks: Array<TaskLinkSummary> }> = []
    const uniqueIds = Array.from(new Set(args.assistantStreamIds.map(String)))
    for (const streamKey of uniqueIds) {
      const streamId = args.assistantStreamIds.find((candidate) => String(candidate) === streamKey)
      if (!streamId) continue
      const tasks = await taskLinksForAssistant(ctx, actor, streamId, args)
      if (tasks) results.push({ assistantStreamId: streamId, tasks })
    }
    return results
  },
})

export const create = mutation({
  args: {
    projectId: v.id('projects'),
    boardId: v.optional(v.id('taskBoards')),
    workflowStateId: v.optional(v.id('taskWorkflowStates')),
    groupId: v.optional(v.id('groups')),
    parentTaskId: v.optional(v.id('tasks')),
    title: v.string(),
    description: v.optional(v.string()),
    assigneeProjectMemberId: v.optional(v.id('projectMembers')),
    priority: taskPriority,
    dueDate: v.optional(v.string()),
    labelIds: v.optional(v.array(v.id('taskLabels'))),
    references: v.optional(v.array(referenceInput)),
    idempotencyKey: v.string(),
    ...identityArgs,
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    await assertProjectSnapshotWritable(ctx, args.projectId)
    validateTaskFields(args)
    if ((args.references?.length ?? 0) > 20) throw new Error('task_references_limit_exceeded')
    let initialAccess
    let board: Doc<'taskBoards'>
    if (args.boardId) {
      const boardAccess = await requireTaskBoardAccess(
        ctx,
        actor,
        args.boardId,
        args,
        args.projectId,
      )
      initialAccess = boardAccess
      board = boardAccess.board
    } else {
      initialAccess = await resolveTaskRequestContext(ctx, actor, args.projectId, args, args.groupId)
      board = await getOrCreateDefaultBoard(ctx, {
        projectId: args.projectId,
        groupId: args.groupId,
        projectMemberId: initialAccess.projectMember._id,
        actingCompanyId: initialAccess.actingCompanyId,
        channelName: initialAccess.group?.name,
      })
    }
    const groupId = board.groupId
    const baseCapabilities = resolveTaskCapabilities({
      collaboration: initialAccess.capabilities.taskCollaboration,
      activeScope: initialAccess.capabilities.accessMode === 'active',
      channelMember: groupId ? initialAccess.capabilities.canReadChannel : initialAccess.capabilities.canReadProject,
      createdByActor: true,
      assignedToActor: args.assigneeProjectMemberId === initialAccess.projectMember._id,
    })
    if (!baseCapabilities.canCreate) throw new Error('task_access_changed')

    const existing = await ctx.db.query('tasks')
      .withIndex('by_project_idempotency', (q) =>
        q.eq('projectId', args.projectId).eq('createIdempotencyKey', args.idempotencyKey),
      ).unique()
    if (existing) return { publicKey: existing.publicKey, taskId: existing._id }

    if (board.projectId !== args.projectId || board.groupId !== groupId || board.archivedAt) {
      throw new Error('task_destination_invalid')
    }
    const state = args.workflowStateId
      ? await ctx.db.get(args.workflowStateId)
      : await getDefaultWorkflowState(ctx, board._id)
    if (!state || state.boardId !== board._id || state.archivedAt) {
      throw new Error('task_destination_invalid')
    }
    assertCanAssignTaskMember(
      initialAccess.projectMember._id,
      args.assigneeProjectMemberId,
      baseCapabilities.canAssignOthers,
    )
    const assignee = args.assigneeProjectMemberId
      ? await requireEligibleTaskMember(ctx, {
          projectId: args.projectId, groupId, projectMemberId: args.assigneeProjectMemberId,
        })
      : null

    let parent: Doc<'tasks'> | null = null
    if (args.parentTaskId) {
      parent = await ctx.db.get(args.parentTaskId)
      if (!parent || parent.parentTaskId || parent.projectId !== args.projectId ||
        parent.boardId !== board._id || parent.groupId !== groupId || parent.archivedAt) {
        throw new Error('task_parent_invalid')
      }
    }
    const lastStateTask = await ctx.db.query('tasks')
      .withIndex('by_board_state_rank', (q) => q.eq('boardId', board._id).eq('workflowStateId', state._id))
      .order('desc')
      .first()
    const now = Date.now()
    const taskId = await ctx.db.insert('tasks', {
      projectId: args.projectId,
      publicKey: await createUniqueTaskPublicKey(ctx, args.projectId),
      boardId: board._id,
      groupId,
      parentTaskId: parent?._id,
      workflowStateId: state._id,
      rank: rankBetween(lastStateTask?.rank) ?? rankForIndex(0),
      title: normalizeTaskText(args.title),
      description: args.description?.trim() || undefined,
      searchText: `${normalizeTaskText(args.title)} ${args.description?.trim() ?? ''} `,
      assigneeProjectMemberId: assignee?._id,
      priority: args.priority,
      dueDate: args.dueDate,
      createdByProjectMemberId: initialAccess.projectMember._id,
      actingCompanyId: initialAccess.actingCompanyId,
      revision: 1,
      createIdempotencyKey: args.idempotencyKey,
      createdAt: now,
      updatedAt: now,
    })
    const task = await ctx.db.get(taskId)
    if (!task) throw new Error('task_create_failed')

    for (const [index, reference] of (args.references ?? []).entries()) {
      await insertReference(ctx, task, initialAccess.projectMember._id, initialAccess.actingCompanyId, reference, index)
    }
    for (const labelId of args.labelIds ?? []) {
      const label = await ctx.db.get(labelId)
      if (!label || label.projectId !== task.projectId || label.archivedAt) throw new Error('task_label_invalid')
      await ctx.db.insert('taskLabelLinks', { projectId: task.projectId, taskId, labelId, createdAt: now })
    }
    await addFollower(ctx, task, initialAccess.projectMember, 'creator')
    if (assignee && assignee._id !== initialAccess.projectMember._id) await addFollower(ctx, task, assignee, 'assignee')
    await appendTaskActivity(ctx, {
      task, action: 'created', actorProjectMemberId: initialAccess.projectMember._id,
      actingCompanyId: initialAccess.actingCompanyId,
    })
    if (assignee) await createTaskNotification(ctx, {
      task, recipient: assignee, actorProjectMemberId: initialAccess.projectMember._id,
      eventType: 'assignment', payload: { publicKey: task.publicKey },
      idempotencyKey: `assignment:${task._id}:${assignee._id}:1`,
    })
    await rescheduleTaskReminders(ctx, task)
    await appendAuditEvent(ctx, {
      projectId: task.projectId, groupId: task.groupId, actorId: actor.userId,
      actorProjectMemberId: initialAccess.projectMember._id, actingCompanyId: initialAccess.actingCompanyId,
      entityType: 'task', entityId: String(task._id), action: 'created',
    })
    return { publicKey: task.publicKey, taskId: task._id }
  },
})

export const update = mutation({
  args: {
    taskId: v.id('tasks'),
    expectedRevision: v.number(),
    title: v.optional(v.string()),
    description: v.optional(v.union(v.string(), v.null())),
    workflowStateId: v.optional(v.id('taskWorkflowStates')),
    assigneeProjectMemberId: v.optional(v.union(v.id('projectMembers'), v.null())),
    priority: v.optional(taskPriority),
    dueDate: v.optional(v.union(v.string(), v.null())),
    confirmOpenSubtasks: v.optional(v.boolean()),
    ...identityArgs,
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    const access = await requireTaskAccess(ctx, actor, args.taskId, args)
    await assertProjectSnapshotWritable(ctx, access.task.projectId)
    if (!access.taskCapabilities.canEdit) throw new Error('task_edit_forbidden')
    if (access.task.revision !== args.expectedRevision) {
      throw new Error(`task_conflict:${access.task.revision}`)
    }
    if (args.title !== undefined && !isTaskTitle(args.title)) throw new Error('task_title_invalid')
    if (typeof args.description === 'string' && !isTaskDescription(args.description)) throw new Error('task_description_invalid')
    if (typeof args.dueDate === 'string' && !isTaskDueDate(args.dueDate)) throw new Error('task_due_date_invalid')

    const patch: Partial<Doc<'tasks'>> = {}
    let assignedMember: Doc<'projectMembers'> | null = null
    const changes: Array<{ action: Doc<'taskActivities'>['action']; before: unknown; after: unknown }> = []
    if (args.title !== undefined && normalizeTaskText(args.title) !== access.task.title) {
      patch.title = normalizeTaskText(args.title)
      changes.push({ action: 'title_changed', before: access.task.title, after: patch.title })
    }
    if (args.description !== undefined && (args.description || undefined) !== access.task.description) {
      patch.description = args.description?.trim() || undefined
      changes.push({ action: 'description_changed', before: Boolean(access.task.description), after: Boolean(patch.description) })
    }
    if (args.priority !== undefined && args.priority !== access.task.priority) {
      patch.priority = args.priority
      changes.push({ action: 'priority_changed', before: access.task.priority, after: args.priority })
    }
    if (args.dueDate !== undefined && (args.dueDate || undefined) !== access.task.dueDate) {
      patch.dueDate = args.dueDate || undefined
      changes.push({ action: 'due_date_changed', before: access.task.dueDate, after: patch.dueDate })
    }
    if (args.assigneeProjectMemberId !== undefined) {
      const nextAssigneeId = args.assigneeProjectMemberId || undefined
      if (nextAssigneeId !== access.task.assigneeProjectMemberId) {
        if (!nextAssigneeId && access.task.assigneeProjectMemberId !== access.projectMember._id &&
          !access.taskCapabilities.canAssignOthers) {
          throw new Error('task_assignment_forbidden')
        }
        assertCanAssignTaskMember(
          access.projectMember._id,
          nextAssigneeId,
          access.taskCapabilities.canAssignOthers,
        )
      }
      if (nextAssigneeId !== access.task.assigneeProjectMemberId) {
        const assignee = nextAssigneeId ? await requireEligibleTaskMember(ctx, {
          projectId: access.task.projectId, groupId: access.task.groupId, projectMemberId: nextAssigneeId,
        }) : null
        assignedMember = assignee
        patch.assigneeProjectMemberId = nextAssigneeId
        changes.push({ action: 'assignee_changed', before: access.task.assigneeProjectMemberId, after: nextAssigneeId })
        if (assignee) await addFollower(ctx, access.task, assignee, 'assignee')
      }
    }
    if (args.workflowStateId && args.workflowStateId !== access.task.workflowStateId) {
      const state = await ctx.db.get(args.workflowStateId)
      if (!state || state.boardId !== access.task.boardId || state.archivedAt) throw new Error('task_destination_invalid')
      if (isTerminalTaskState(state.category)) {
        await assertOpenSubtasksConfirmed(ctx, access.task, args.confirmOpenSubtasks)
      }
      patch.workflowStateId = state._id
      patch.terminalAt = isTerminalTaskState(state.category) ? access.task.terminalAt ?? Date.now() : undefined
      changes.push({ action: 'state_changed', before: access.task.workflowStateId, after: state._id })
    }
    if (!changes.length) return access.task.revision
    const nextDescription = args.description !== undefined
      ? args.description?.trim() || undefined
      : access.task.description
    patch.searchText = `${patch.title ?? access.task.title} ${nextDescription ?? ''} `
    const now = Date.now()
    await ctx.db.patch(access.task._id, { ...patch, revision: access.task.revision + 1, updatedAt: now })
    const updated = await ctx.db.get(access.task._id)
    if (!updated) throw new Error('task_access_changed')
    const correlationId = crypto.randomUUID()
    for (const change of changes) {
      await appendTaskActivity(ctx, {
        task: updated, ...change, actorProjectMemberId: access.projectMember._id,
        actingCompanyId: access.actingCompanyId, correlationId,
      })
    }
    if (assignedMember) await createTaskNotification(ctx, {
      task: updated, recipient: assignedMember, actorProjectMemberId: access.projectMember._id,
      eventType: 'assignment', payload: { publicKey: updated.publicKey },
      idempotencyKey: `assignment:${updated._id}:${assignedMember._id}:${updated.revision}`,
    })
    const dueDateChanged = changes.some((change) => change.action === 'due_date_changed')
    let dueDateBecameCritical = false
    if (dueDateChanged && updated.dueDate) {
      const currentAssignee = updated.assigneeProjectMemberId
        ? await ctx.db.get(updated.assigneeProjectMemberId)
        : null
      const assigneeUser = currentAssignee ? await ctx.db.get(currentAssignee.userId) : null
      const localToday = localTaskDate(now, assigneeUser?.timezone)
      dueDateBecameCritical = updated.dueDate <= localToday &&
        (!access.task.dueDate || access.task.dueDate > localToday)
    }
    const priorityBecameUrgent = access.task.priority !== 'urgent' && updated.priority === 'urgent'
    const urgencyEscalated = dueDateBecameCritical || priorityBecameUrgent
    const updatedState = urgencyEscalated ? await ctx.db.get(updated.workflowStateId) : null
    const urgentUpdate = Boolean(urgencyEscalated && updatedState && !isTerminalTaskState(updatedState.category))
    await notifyTaskFollowers(ctx, {
      task: updated, actorProjectMemberId: access.projectMember._id,
      eventType: urgentUpdate ? 'urgent_update' : 'task_changed',
      payload: { publicKey: updated.publicKey },
      idempotencyKey: `${urgentUpdate ? 'urgent' : 'changed'}:${updated._id}:${updated.revision}`,
    })
    await rescheduleTaskReminders(ctx, updated)
    return updated.revision
  },
})

/** Rewrites a column into evenly spaced ranks and returns the moved task's rank. */
async function reindexTaskColumn(
  ctx: MutationCtx,
  input: { index: number; moved: Doc<'tasks'>; now: number; siblings: Array<Doc<'tasks'>> },
) {
  const ordered = [...input.siblings]
  ordered.splice(input.index, 0, input.moved)
  for (const [position, task] of ordered.entries()) {
    const rank = rankForIndex(position)
    if (task._id !== input.moved._id && task.rank !== rank) {
      await ctx.db.patch(task._id, { rank, updatedAt: input.now })
    }
  }
  return rankForIndex(input.index)
}

async function taskNeighbour(
  ctx: MutationCtx,
  taskId: Id<'tasks'> | undefined,
  input: { taskId: Id<'tasks'>; boardId: Id<'taskBoards'>; workflowStateId: Id<'taskWorkflowStates'> },
) {
  if (!taskId) return undefined
  const neighbour = await ctx.db.get(taskId)
  if (!neighbour || neighbour._id === input.taskId || neighbour.archivedAt ||
    neighbour.boardId !== input.boardId || neighbour.workflowStateId !== input.workflowStateId) {
    throw new Error('task_destination_invalid')
  }
  return neighbour
}

async function resolveTaskMoveRank(
  ctx: MutationCtx,
  input: {
    task: Doc<'tasks'>
    boardId: Id<'taskBoards'>
    workflowStateId: Id<'taskWorkflowStates'>
    beforeTaskId?: Id<'tasks'>
    afterTaskId?: Id<'tasks'>
    targetIndex?: number
    now: number
  },
) {
  const neighbourContext = {
    taskId: input.task._id,
    boardId: input.boardId,
    workflowStateId: input.workflowStateId,
  }
  let below = await taskNeighbour(ctx, input.beforeTaskId, neighbourContext)
  let above = await taskNeighbour(ctx, input.afterTaskId, neighbourContext)
  if (!below && !above && input.targetIndex !== undefined) {
    const targetIndex = Math.trunc(input.targetIndex)
    if (targetIndex < 0 || targetIndex > taskNeighborScanLimit) {
      throw new Error('task_move_target_too_deep')
    }
    const candidates = (await ctx.db.query('tasks')
      .withIndex('by_board_state_rank', (q) =>
        q.eq('boardId', input.boardId).eq('workflowStateId', input.workflowStateId),
      )
      .order('asc')
      .take(taskNeighborScanLimit + 1))
      .filter((task) => task._id !== input.task._id && !task.archivedAt)
    below = candidates[targetIndex]
    above = targetIndex > 0 ? candidates[targetIndex - 1] : undefined
  }
  if (!below && !above) {
    above = await ctx.db.query('tasks')
      .withIndex('by_board_state_rank', (q) =>
        q.eq('boardId', input.boardId).eq('workflowStateId', input.workflowStateId),
      )
      .order('desc')
      .first() ?? undefined
    if (above?._id === input.task._id || above?.archivedAt) above = undefined
  }
  const rank = rankBetween(above?.rank, below?.rank)
  if (rank) return rank
  const siblings = (await ctx.db.query('tasks')
    .withIndex('by_board_state_rank', (q) =>
      q.eq('boardId', input.boardId).eq('workflowStateId', input.workflowStateId),
    )
    .collect())
    .filter((task) => task._id !== input.task._id && !task.archivedAt)
  const index = below ? siblings.findIndex((task) => task._id === below._id) : above
    ? siblings.findIndex((task) => task._id === above._id) + 1
    : siblings.length
  if (index < 0) throw new Error('task_destination_invalid')
  return await reindexTaskColumn(ctx, { index, moved: input.task, now: input.now, siblings })
}

/**
 * Repositions a task inside its own board: into another workflow state and/or
 * between two neighbours. `afterTaskId` is the sibling the card lands below and
 * `beforeTaskId` the sibling it lands above; omitting both appends to the
 * column. Authorization matches `update` rather than `move`, because dragging a
 * card within one board is an edit, not a board transfer.
 */
export const moveTask = mutation({
  args: {
    taskId: v.id('tasks'),
    workflowStateId: v.id('taskWorkflowStates'),
    beforeTaskId: v.optional(v.id('tasks')),
    afterTaskId: v.optional(v.id('tasks')),
    expectedRevision: v.number(),
    confirmOpenSubtasks: v.optional(v.boolean()),
    ...identityArgs,
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    const access = await requireTaskAccess(ctx, actor, args.taskId, args)
    await assertProjectSnapshotWritable(ctx, access.task.projectId)
    if (!access.taskCapabilities.canEdit) throw new Error('task_edit_forbidden')
    if (access.task.revision !== args.expectedRevision) {
      throw new Error(`task_conflict:${access.task.revision}`)
    }
    const state = await ctx.db.get(args.workflowStateId)
    if (!state || state.boardId !== access.task.boardId || state.archivedAt) {
      throw new Error('task_destination_invalid')
    }
    const stateChanged = state._id !== access.task.workflowStateId
    if (stateChanged && isTerminalTaskState(state.category)) {
      await assertOpenSubtasksConfirmed(ctx, access.task, args.confirmOpenSubtasks)
    }
    const now = Date.now()
    const rank = await resolveTaskMoveRank(ctx, {
      task: access.task,
      boardId: access.task.boardId,
      workflowStateId: state._id,
      beforeTaskId: args.beforeTaskId,
      afterTaskId: args.afterTaskId,
      now,
    })
    await ctx.db.patch(access.task._id, {
      workflowStateId: state._id,
      rank,
      ...(stateChanged
        ? { terminalAt: isTerminalTaskState(state.category) ? access.task.terminalAt ?? now : undefined }
        : {}),
      revision: access.task.revision + 1,
      updatedAt: now,
    })
    const updated = await ctx.db.get(access.task._id)
    if (!updated) throw new Error('task_access_changed')
    // A rank change inside one state is routine and stays out of the activity feed.
    if (stateChanged) {
      await appendTaskActivity(ctx, {
        task: updated,
        action: 'state_changed',
        actorProjectMemberId: access.projectMember._id,
        actingCompanyId: access.actingCompanyId,
        before: access.task.workflowStateId,
        after: state._id,
      })
    }
    await notifyTaskFollowers(ctx, {
      task: updated,
      actorProjectMemberId: access.projectMember._id,
      eventType: 'task_changed',
      payload: { publicKey: updated.publicKey },
      idempotencyKey: `changed:${updated._id}:${updated.revision}`,
    })
    await rescheduleTaskReminders(ctx, updated)
    return { rank: updated.rank, revision: updated.revision, workflowStateId: updated.workflowStateId }
  },
})

export const move = mutation({
  args: {
    taskId: v.id('tasks'), destinationBoardId: v.id('taskBoards'),
    workflowStateId: v.optional(v.id('taskWorkflowStates')),
    beforeTaskId: v.optional(v.id('tasks')),
    afterTaskId: v.optional(v.id('tasks')),
    targetIndex: v.optional(v.number()),
    expectedRevision: v.number(),
    confirmOpenSubtasks: v.optional(v.boolean()),
    ...identityArgs,
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    const access = await requireTaskAccess(ctx, actor, args.taskId, args)
    await assertProjectSnapshotWritable(ctx, access.task.projectId)
    if (access.task.revision !== args.expectedRevision) throw new Error(`task_conflict:${access.task.revision}`)
    const board = await ctx.db.get(args.destinationBoardId)
    if (!board || board.archivedAt || board.projectId !== access.task.projectId || board.groupId !== access.task.groupId) {
      throw new Error('task_destination_invalid')
    }
    if (board._id === access.task.boardId) {
      if (!access.taskCapabilities.canEdit) throw new Error('task_edit_forbidden')
    } else if (!access.taskCapabilities.canTransfer) {
      throw new Error('task_move_forbidden')
    }
    if (access.task.parentTaskId && board._id !== access.task.boardId) {
      throw new Error('task_destination_invalid')
    }
    const state = args.workflowStateId ? await ctx.db.get(args.workflowStateId) : await getDefaultWorkflowState(ctx, board._id)
    if (!state || state.boardId !== board._id || state.archivedAt) throw new Error('task_destination_invalid')
    const now = Date.now()
    const stateChanged = state._id !== access.task.workflowStateId
    if (stateChanged && isTerminalTaskState(state.category)) {
      await assertOpenSubtasksConfirmed(ctx, access.task, args.confirmOpenSubtasks)
    }
    const rank = await resolveTaskMoveRank(ctx, {
      task: access.task,
      boardId: board._id,
      workflowStateId: state._id,
      beforeTaskId: args.beforeTaskId,
      afterTaskId: args.afterTaskId,
      targetIndex: args.targetIndex,
      now,
    })
    await ctx.db.patch(access.task._id, {
      boardId: board._id,
      workflowStateId: state._id,
      rank,
      terminalAt: isTerminalTaskState(state.category) ? access.task.terminalAt ?? now : undefined,
      revision: access.task.revision + 1,
      updatedAt: now,
    })
    if (access.task.parentTaskId === undefined && board._id !== access.task.boardId) {
      const subtasks = await ctx.db.query('tasks').withIndex('by_parent', (q) => q.eq('parentTaskId', access.task._id)).collect()
      const defaultState = await getDefaultWorkflowState(ctx, board._id)
      for (const subtask of subtasks) {
        const updatedSubtask = {
          ...subtask,
          boardId: board._id, workflowStateId: defaultState._id,
          terminalAt: undefined, revision: subtask.revision + 1, updatedAt: now,
        }
        await ctx.db.patch(subtask._id, {
          boardId: updatedSubtask.boardId,
          workflowStateId: updatedSubtask.workflowStateId,
          terminalAt: updatedSubtask.terminalAt,
          revision: updatedSubtask.revision,
          updatedAt: updatedSubtask.updatedAt,
        })
        await notifyTaskFollowers(ctx, {
          task: updatedSubtask,
          actorProjectMemberId: access.projectMember._id,
          eventType: 'task_changed',
          payload: { publicKey: updatedSubtask.publicKey },
          idempotencyKey: `changed:${updatedSubtask._id}:${updatedSubtask.revision}`,
        })
        await rescheduleTaskReminders(ctx, updatedSubtask)
      }
    }
    const updated = await ctx.db.get(access.task._id)
    if (!updated) throw new Error('task_access_changed')
    if (board._id !== access.task.boardId || stateChanged) {
      await appendTaskActivity(ctx, {
        task: updated, action: board._id !== access.task.boardId ? 'board_changed' : 'state_changed',
        actorProjectMemberId: access.projectMember._id, actingCompanyId: access.actingCompanyId,
        before: { boardId: access.task.boardId, stateId: access.task.workflowStateId },
        after: { boardId: board._id, stateId: state._id },
      })
    }
    await notifyTaskFollowers(ctx, {
      task: updated,
      actorProjectMemberId: access.projectMember._id,
      eventType: 'task_changed',
      payload: { publicKey: updated.publicKey },
      idempotencyKey: `changed:${updated._id}:${updated.revision}`,
    })
    await rescheduleTaskReminders(ctx, updated)
    return await taskView(ctx, updated, new Set(), { includeReferences: false })
  },
})

export const setFollowing = mutation({
  args: { taskId: v.id('tasks'), enabled: v.boolean(), ...identityArgs },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    const access = await requireTaskAccess(ctx, actor, args.taskId, args)
    await assertProjectSnapshotWritable(ctx, access.task.projectId)
    if (!access.taskCapabilities.canComment) throw new Error('task_access_changed')
    const existing = await ctx.db.query('taskFollowers').withIndex('by_task_member', (q) =>
      q.eq('taskId', access.task._id).eq('projectMemberId', access.projectMember._id),
    ).unique()
    const now = Date.now()
    if (existing) await ctx.db.patch(existing._id, { enabled: args.enabled, reason: 'explicit', updatedAt: now })
    else await ctx.db.insert('taskFollowers', {
      projectId: access.task.projectId, taskId: access.task._id, userId: actor.userId,
      projectMemberId: access.projectMember._id, reason: 'explicit', enabled: args.enabled,
      createdAt: now, updatedAt: now,
    })
    return args.enabled
  },
})

export const setArchived = mutation({
  args: { taskId: v.id('tasks'), archived: v.boolean(), restoreSubtasks: v.optional(v.boolean()), ...identityArgs },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    const access = await requireTaskAccess(ctx, actor, args.taskId, args)
    await assertProjectSnapshotWritable(ctx, access.task.projectId)
    if (!access.taskCapabilities.canArchive) throw new Error('task_archive_forbidden')
    const now = Date.now()
    const archivedAt = args.archived ? access.task.archivedAt ?? now : undefined
    await ctx.db.patch(access.task._id, { archivedAt, revision: access.task.revision + 1, updatedAt: now })
    if (!access.task.parentTaskId && (args.archived || args.restoreSubtasks)) {
      const subtasks = await ctx.db.query('tasks').withIndex('by_parent', (q) => q.eq('parentTaskId', access.task._id)).collect()
      for (const subtask of subtasks) {
        await ctx.db.patch(subtask._id, { archivedAt, revision: subtask.revision + 1, updatedAt: now })
        const updatedSubtask = await ctx.db.get(subtask._id)
        if (updatedSubtask) await rescheduleTaskReminders(ctx, updatedSubtask)
      }
    }
    const updated = await ctx.db.get(access.task._id)
    if (!updated) throw new Error('task_access_changed')
    await appendTaskActivity(ctx, {
      task: updated, action: args.archived ? 'archived' : 'restored',
      actorProjectMemberId: access.projectMember._id, actingCompanyId: access.actingCompanyId,
    })
    await rescheduleTaskReminders(ctx, updated)
    return updated.revision
  },
})

export const changeScope = mutation({
  args: {
    taskId: v.id('tasks'),
    destinationBoardId: v.id('taskBoards'),
    declassificationConfirmed: v.optional(v.boolean()),
    audienceReductionConfirmed: v.optional(v.boolean()),
    ...identityArgs,
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    const access = await requireTaskAccess(ctx, actor, args.taskId, args)
    await assertProjectSnapshotWritable(ctx, access.task.projectId)
    if (!access.taskCapabilities.canChangeScope || access.task.parentTaskId) {
      throw new Error('task_scope_change_forbidden')
    }
    const destination = await ctx.db.get(args.destinationBoardId)
    if (!destination || destination.archivedAt || destination.projectId !== access.task.projectId ||
      destination.groupId === access.task.groupId) throw new Error('task_destination_invalid')
    const destinationAccess = await resolveTaskRequestContext(
      ctx, actor, access.task.projectId, args, destination.groupId,
    )
    if (destination.groupId && !destinationAccess.capabilities.canReadChannel) {
      throw new Error('task_destination_invalid')
    }
    if (access.task.groupId && !destination.groupId && !args.declassificationConfirmed) {
      throw new Error('task_declassification_confirmation_required')
    }
    if (!access.task.groupId && destination.groupId && !args.audienceReductionConfirmed) {
      throw new Error('task_audience_reduction_confirmation_required')
    }
    const destinationState = await getDefaultWorkflowState(ctx, destination._id)
    const affected = [
      access.task,
      ...await ctx.db.query('tasks').withIndex('by_parent', (q) => q.eq('parentTaskId', access.task._id)).collect(),
    ]
    const now = Date.now()
    for (const task of affected) {
      let assigneeProjectMemberId = task.assigneeProjectMemberId
      if (destination.groupId && assigneeProjectMemberId) {
        try {
          await requireEligibleTaskMember(ctx, {
            projectId: task.projectId,
            groupId: destination.groupId,
            projectMemberId: assigneeProjectMemberId,
          })
        } catch {
          assigneeProjectMemberId = undefined
        }
      }
      await ctx.db.patch(task._id, {
        boardId: destination._id,
        groupId: destination.groupId,
        workflowStateId: destinationState._id,
        assigneeProjectMemberId,
        terminalAt: undefined,
        revision: task.revision + 1,
        updatedAt: now,
      })
      const followers = await ctx.db.query('taskFollowers')
        .withIndex('by_task_enabled', (q) => q.eq('taskId', task._id).eq('enabled', true)).collect()
      if (destination.groupId) {
        for (const follower of followers) {
          try {
            await requireEligibleTaskMember(ctx, {
              projectId: task.projectId,
              groupId: destination.groupId,
              projectMemberId: follower.projectMemberId,
            })
          } catch {
            await ctx.db.patch(follower._id, { enabled: false, updatedAt: now })
          }
        }
      }
      await ctx.db.insert('taskActivities', {
        projectId: task.projectId,
        taskId: task._id,
        originalGroupId: task.groupId,
        actorProjectMemberId: access.projectMember._id,
        actingCompanyId: access.actingCompanyId,
        action: 'scope_changed',
        before: { boardId: task.boardId, groupId: task.groupId },
        after: { boardId: destination._id, groupId: destination.groupId },
        correlationId: `scope:${access.task._id}:${now}`,
        createdAt: now,
      })
    }
    await appendAuditEvent(ctx, {
      projectId: access.task.projectId,
      groupId: access.task.groupId,
      actorId: actor.userId,
      actorProjectMemberId: access.projectMember._id,
      actingCompanyId: access.actingCompanyId,
      entityType: 'task',
      entityId: String(access.task._id),
      action: 'scope_changed',
      before: { groupId: access.task.groupId },
      after: { groupId: destination.groupId },
    })
    return access.task.revision + 1
  },
})

export const invalidateReferences = internalMutation({
  args: {
    messageId: v.optional(v.id('messages')),
    attachmentId: v.optional(v.id('attachments')),
    assistantStreamId: v.optional(v.id('assistantStreams')),
    redacted: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    return await invalidateTaskEvidence(ctx, args)
  },
})
