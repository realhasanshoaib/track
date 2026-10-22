import type { Doc, Id } from '../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../_generated/server'
export async function allocateChannelSequence(ctx: MutationCtx, group: Doc<'groups'>) {
  const sequence = group.nextChannelSequence
  await ctx.db.patch(group._id, { nextChannelSequence: sequence + 1, updatedAt: Date.now() })
  return sequence
}
export async function assertReplyScope(ctx: QueryCtx | MutationCtx, replyToMessageId: Id<'messages'> | undefined, input: { groupId: Id<'groups'> }) {
  if (!replyToMessageId) return
  const reply = await ctx.db.get(replyToMessageId)
  if (!reply || reply.groupId !== input.groupId) throw new Error('reply_scope_mismatch')
}
