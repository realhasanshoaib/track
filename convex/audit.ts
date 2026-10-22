import { v } from 'convex/values'
import { query } from './_generated/server'
import { authorizeGroupRequest } from './lib/requestAuthorization'
export const listGroupEvents = query({
  args: { groupId: v.id('groups'), userId: v.id('users'), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await authorizeGroupRequest(ctx, { ...args, claimedUserId: args.userId })
    return await ctx.db.query('auditEvents').withIndex('by_group_created_at', q => q.eq('groupId', args.groupId)).order('desc').take(Math.max(1, Math.min(100, args.limit ?? 50)))
  },
})
