import { v } from 'convex/values'
import { mutation } from './_generated/server'
import { requireAuthenticatedActor } from './lib/actorContext'
import { appendAuditEvent } from './lib/audit'
import { authorizeScopedRequest } from './lib/requestAuthorization'
import { resolveActorProjectMember } from './lib/messagePolicy'
const targetType = v.union(v.literal('message'), v.literal('attachment'), v.literal('voice_note'))
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
    projectMemberId: v.optional(v.id('projectMembers')),
    targetType,
    groupId: v.optional(v.id('groups')),
    targetMessageId: v.optional(v.id('messages')),
    targetAttachmentId: v.optional(v.id('attachments')),
    reason,
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuthenticatedActor(ctx)
    await authorizeScopedRequest(
      ctx,
      {
        projectId: args.projectId,
        groupId: args.groupId,
        claimedUserId: args.reporterId,
        projectMemberId: args.projectMemberId,
      },
      args.groupId ? 'readChannel' : 'readProject',
    )
    let scopedGroupId = args.groupId
    if (args.targetMessageId) {
      const message = await ctx.db.get(args.targetMessageId)
      if (!message || message.projectId !== args.projectId) throw new Error('message_not_found')
      scopedGroupId = message.groupId
      await authorizeScopedRequest(
        ctx,
        {
          projectId: args.projectId,
          groupId: message.groupId,
          claimedUserId: args.reporterId,
          projectMemberId: args.projectMemberId,
        },
        'readChannel',
      )
    }
    if (args.targetAttachmentId) {
      const attachment = await ctx.db.get(args.targetAttachmentId)
      if (!attachment || attachment.projectId !== args.projectId)
        throw new Error('attachment_not_found')
      scopedGroupId = attachment.groupId
      await authorizeScopedRequest(
        ctx,
        {
          projectId: args.projectId,
          groupId: attachment.groupId,
          claimedUserId: args.reporterId,
          projectMemberId: args.projectMemberId,
        },
        'readChannel',
      )
    }
    const now = Date.now()
    const note = args.note?.trim()
    const reporterProjectMember = await resolveActorProjectMember(
      ctx,
      args.projectId,
      args.reporterId,
    )
    const reportId = await ctx.db.insert('contentReports', {
      projectId: args.projectId,
      groupId: scopedGroupId,
      reporterId: args.reporterId,
      reporterProjectMemberId: reporterProjectMember._id,
      targetType: args.targetType,
      targetMessageId: args.targetMessageId,
      targetAttachmentId: args.targetAttachmentId,
      reason: args.reason,
      note: note || undefined,
      status: 'open',
      createdAt: now,
      updatedAt: now,
    })
    await appendAuditEvent(ctx, {
      projectId: args.projectId,
      groupId: scopedGroupId,
      actorId: args.reporterId,
      actorProjectMemberId: reporterProjectMember._id,
      entityType: 'contentReport',
      entityId: reportId,
      action: 'content_report.created',
      after: {
        reason: args.reason,
        targetType: args.targetType,
      },
    })
    return reportId
  },
})
