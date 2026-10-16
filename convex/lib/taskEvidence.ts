import type { Id } from '../_generated/dataModel'
import type { MutationCtx } from '../_generated/server'

export async function invalidateTaskEvidence(
  ctx: MutationCtx,
  source: {
    messageId?: Id<'messages'>
    attachmentId?: Id<'attachments'>
    redacted?: boolean
  },
) {
  const taskReferences = source.messageId
    ? await ctx.db
        .query('taskReferences')
        .withIndex('by_message', (q) => q.eq('messageId', source.messageId))
        .collect()
    : source.attachmentId
      ? await ctx.db
          .query('taskReferences')
          .withIndex('by_attachment', (q) =>
            q.eq('attachmentId', source.attachmentId),
          )
          .collect()
      : []
  const suggestionReferences = source.messageId
    ? await ctx.db
        .query('taskSuggestionReferences')
        .withIndex('by_message', (q) => q.eq('messageId', source.messageId))
        .collect()
    : source.attachmentId
      ? await ctx.db
          .query('taskSuggestionReferences')
          .withIndex('by_attachment', (q) =>
            q.eq('attachmentId', source.attachmentId),
          )
          .collect()
      : []
  const now = Date.now()
  const availability = source.redacted
    ? ('redacted' as const)
    : ('unavailable' as const)
  for (const reference of [...taskReferences, ...suggestionReferences]) {
    await ctx.db.patch(reference._id, {
      availability,
      quote: undefined,
      updatedAt: now,
    })
  }
  const snapshots = source.messageId
    ? await ctx.db
        .query('taskArchiveSnapshots')
        .withIndex('by_message', (q) => q.eq('messageId', source.messageId))
        .collect()
    : source.attachmentId
      ? await ctx.db
          .query('taskArchiveSnapshots')
          .withIndex('by_attachment', (q) =>
            q.eq('attachmentId', source.attachmentId),
          )
          .collect()
      : []
  for (const snapshot of snapshots) {
    const payload = snapshot.payload as Record<string, unknown>
    await ctx.db.patch(snapshot._id, {
      payload: { ...payload, availability, quote: undefined },
      redactedAt: source.redacted ? now : undefined,
    })
  }
  return taskReferences.length + suggestionReferences.length
}
