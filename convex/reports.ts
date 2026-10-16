import { v } from 'convex/values'

import { mutation } from './_generated/server'
import { requireAuthenticatedActor } from './lib/actorContext'
import { appendAuditEvent } from './lib/audit'
import { authorizeScopedRequest } from './lib/requestAuthorization'
import { requireTaskAccess, resolveTaskRequestContext } from './lib/taskPolicy'
import { resolveActorProjectMember, threadsEnabled } from './lib/channelThreadPolicy'

const targetType = v.union(
  v.literal('message'),
  v.literal('attachment'),
  v.literal('voice_note'),
  v.literal('task'),
  v.literal('task_comment'),
  v.literal('task_suggestion'),
)

const reason = v.union(
  v.literal('inaccurate'),
  v.literal('unsafe'),
  v.literal('spam'),
  v.literal('harassment'),
  v.literal('privacy'),
  v.literal('other'),
)

export const create = mutation({
  args: {
    projectId: v.id('projects'),
    reporterId: v.id('users'),
    actingCompanyId: v.optional(v.id('companies')),
    projectMemberId: v.optional(v.id('projectMembers')),
    targetType,
    groupId: v.optional(v.id('groups')),
    targetMessageId: v.optional(v.id('messages')),
    targetAttachmentId: v.optional(v.id('attachments')),
    targetTaskId: v.optional(v.id('tasks')),
    targetTaskCommentId: v.optional(v.id('taskComments')),
    targetTaskSuggestionId: v.optional(v.id('taskSuggestions')),
    reason,
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    const baseAccess = await authorizeScopedRequest(ctx, {
      projectId: args.projectId,
      groupId: args.groupId,
      claimedUserId: args.reporterId,
      actingCompanyId: args.actingCompanyId,
      projectMemberId: args.projectMemberId,
    }, args.groupId ? 'readChannel' : 'readProject')

    let scopedGroupId = args.groupId
    let channelThreadId
    if (args.targetMessageId) {
      const message = await ctx.db.get(args.targetMessageId)
      if (!message || message.projectId !== args.projectId) throw new Error('message_not_found')
      scopedGroupId = message.groupId
      channelThreadId = message.channelThreadId
      await authorizeScopedRequest(ctx, { projectId: args.projectId, groupId: message.groupId, claimedUserId: args.reporterId, actingCompanyId: args.actingCompanyId, projectMemberId: args.projectMemberId }, 'readChannel')
    }
    if (args.targetAttachmentId) {
      const attachment = await ctx.db.get(args.targetAttachmentId)
      if (!attachment || attachment.projectId !== args.projectId) throw new Error('attachment_not_found')
      const message = await ctx.db.get(attachment.messageId)
      scopedGroupId = attachment.groupId
      channelThreadId = message?.channelThreadId
      await authorizeScopedRequest(ctx, { projectId: args.projectId, groupId: attachment.groupId, claimedUserId: args.reporterId, actingCompanyId: args.actingCompanyId, projectMemberId: args.projectMemberId }, 'readChannel')
    }
    if (args.targetTaskId) {
      const access = await requireTaskAccess(ctx, actor, args.targetTaskId, args)
      if (access.task.projectId !== args.projectId || access.task.groupId !== args.groupId) {
        throw new Error('task_access_changed')
      }
    }
    if (args.targetTaskCommentId) {
      const comment = await ctx.db.get(args.targetTaskCommentId)
      if (!comment) throw new Error('task_access_changed')
      const access = await requireTaskAccess(ctx, actor, comment.taskId, args)
      if (access.task.projectId !== args.projectId || comment.originalGroupId !== args.groupId) {
        throw new Error('task_access_changed')
      }
    }
    if (args.targetTaskSuggestionId) {
      const suggestion = await ctx.db.get(args.targetTaskSuggestionId)
      if (!suggestion || suggestion.projectId !== args.projectId || suggestion.groupId !== args.groupId) {
        throw new Error('task_access_changed')
      }
      const access = await resolveTaskRequestContext(
        ctx, actor, suggestion.projectId, args, suggestion.groupId,
      )
      if (suggestion.groupId && !access.capabilities.canReadChannel) throw new Error('task_access_changed')
    }
    if (channelThreadId && !threadsEnabled()) throw new Error('threads_disabled')

    const now = Date.now()
    const note = args.note?.trim()
    const reporterProjectMember = await resolveActorProjectMember(
      ctx,
      args.projectId,
      args.reporterId,
      baseAccess.companyAccess?.projectMember,
    )
    const reportId = await ctx.db.insert('contentReports', {
      projectId: args.projectId,
      groupId: scopedGroupId,
      channelThreadId,
      reporterId: args.reporterId,
      reporterProjectMemberId: reporterProjectMember._id,
      actingCompanyId: baseAccess.companyAccess?.company._id,
      targetType: args.targetType,
      targetMessageId: args.targetMessageId,
      targetAttachmentId: args.targetAttachmentId,
      targetTaskId: args.targetTaskId,
      targetTaskCommentId: args.targetTaskCommentId,
      targetTaskSuggestionId: args.targetTaskSuggestionId,
      reason: args.reason,
      note: note || undefined,
      status: 'open',
      createdAt: now,
      updatedAt: now,
    })

    await appendAuditEvent(ctx, {
      projectId: args.projectId,
      groupId: scopedGroupId,
      channelThreadId,
      actorId: args.reporterId,
      actorProjectMemberId: reporterProjectMember._id,
      actingCompanyId: baseAccess.companyAccess?.company._id,
      entityType: 'contentReport',
      entityId: reportId,
      action: 'content_report.created',
      after: {
        reason: args.reason,
        targetType: args.targetType,
        channelThreadId,
      },
    })

    return reportId
  },
})
