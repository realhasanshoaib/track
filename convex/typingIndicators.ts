import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { authorizeGroupRequest } from './lib/requestAuthorization'
const activity = v.union(v.literal('typing'), v.literal('attaching'), v.literal('recording'))
export const list = query({
  args: { groupId: v.id('groups'), userId: v.id('users') },
  handler: async (ctx, args) => {
    await authorizeGroupRequest(ctx, { ...args, claimedUserId: args.userId })
    const rows = await ctx.db.query('typingIndicators').withIndex('by_group_updated_at', q => q.eq('groupId', args.groupId).gt('updatedAt', Date.now() - 15000)).order('desc').take(12)
    return await Promise.all(rows.filter(row => row.userId !== args.userId).map(async indicator => ({ indicator, user: await ctx.db.get(indicator.userId) })))
  },
})
export const heartbeat = mutation({
  args: { groupId: v.id('groups'), userId: v.id('users'), activity },
  handler: async (ctx, args) => {
    await authorizeGroupRequest(ctx, { ...args, claimedUserId: args.userId }, 'writeChannel')
    const existing = await ctx.db.query('typingIndicators').withIndex('by_group_user', q => q.eq('groupId', args.groupId).eq('userId', args.userId)).unique()
    const now = Date.now()
    if (existing) {
      if (existing.activity === args.activity && existing.updatedAt > now - 1500) return existing._id
      await ctx.db.patch(existing._id, { activity: args.activity, updatedAt: now })
      return existing._id
    }
    return await ctx.db.insert('typingIndicators', { ...args, createdAt: now, updatedAt: now })
  },
})
export const clear = mutation({
  args: { groupId: v.id('groups'), userId: v.id('users') },
  handler: async (ctx, args) => {
    await authorizeGroupRequest(ctx, { ...args, claimedUserId: args.userId })
    const existing = await ctx.db.query('typingIndicators').withIndex('by_group_user', q => q.eq('groupId', args.groupId).eq('userId', args.userId)).unique()
    if (existing) await ctx.db.delete(existing._id)
  },
})
