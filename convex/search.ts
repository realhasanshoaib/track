import { v } from 'convex/values'
import { query } from './_generated/server'
import { authorizeGroupRequest } from './lib/requestAuthorization'
export const group = query({
  args: { groupId: v.id('groups'), userId: v.id('users'), term: v.string() },
  handler: async (ctx, args) => {
    await authorizeGroupRequest(ctx, { ...args, claimedUserId: args.userId })
    const term = args.term.trim().slice(0, 200)
    if (!term) return { messages: [], files: [] }
    const [messages, attachments] = await Promise.all([
      ctx.db.query('messages').withSearchIndex('search_body_by_group', q => q.search('body', term).eq('groupId', args.groupId)).take(50),
      ctx.db.query('attachments').withSearchIndex('search_filename_by_group', q => q.search('filename', term).eq('groupId', args.groupId)).take(50),
    ])
    return {
      messages: await Promise.all(messages.map(async message => ({
        messageId: message._id, body: message.body, createdAt: message.createdAt,
        authorName: (await ctx.db.get(message.authorId))?.displayName ?? 'Deleted user',
      }))),
      files: attachments.map(a => ({ attachmentId: a._id, messageId: a.messageId, filename: a.filename })),
    }
  },
})
