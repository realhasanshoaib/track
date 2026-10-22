import { v } from 'convex/values'
import { mutation } from './_generated/server'
import { authorizeGroupRequest } from './lib/requestAuthorization'
const targetType = v.union(v.literal('message'), v.literal('attachment'), v.literal('voice_note'))
const reason = v.union(v.literal('inaccurate'), v.literal('unsafe'), v.literal('spam'), v.literal('harassment'), v.literal('privacy'), v.literal('other'))
export const create = mutation({
 args: { groupId: v.id('groups'), reporterId: v.id('users'), targetType, targetMessageId: v.optional(v.id('messages')), targetAttachmentId: v.optional(v.id('attachments')), reason, note: v.optional(v.string()) },
 handler: async (ctx, args) => {
  await authorizeGroupRequest(ctx, { groupId: args.groupId, claimedUserId: args.reporterId })
  if (args.targetType === 'message') {
   if (!args.targetMessageId || args.targetAttachmentId) throw new Error('report_target_required')
   const message = await ctx.db.get(args.targetMessageId)
   if (!message || message.groupId !== args.groupId) throw new Error('message_not_found')
  } else {
   if (!args.targetAttachmentId) throw new Error('report_target_required')
   const attachment = await ctx.db.get(args.targetAttachmentId)
   if (!attachment || attachment.groupId !== args.groupId || (args.targetMessageId && attachment.messageId !== args.targetMessageId)) throw new Error('attachment_not_found')
   if (args.targetType === 'voice_note' && attachment.kind !== 'voice_note') throw new Error('voice_note_not_found')
  }
  return await ctx.db.insert('contentReports', { ...args, note: args.note?.trim().slice(0, 2000) || undefined, status: 'open', createdAt: Date.now(), updatedAt: Date.now() })
 },
})
