import { v } from 'convex/values'
import { query } from './_generated/server'
import { authorizeScopedRequest } from './lib/requestAuthorization'
export const listProjectEvents = query({
  args: {
    projectId: v.id('projects'),
    userId: v.id('users'),
    projectMemberId: v.optional(v.id('projectMembers')),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await authorizeScopedRequest(
      ctx,
      {
        projectId: args.projectId,
        claimedUserId: args.userId,
        projectMemberId: args.projectMemberId,
      },
      'readProject',
    )
    const visibleGroups = (
      await ctx.db
        .query('groupMembers')
        .withIndex('by_user', (q) => q.eq('userId', args.userId))
        .collect()
    )
      .filter((membership) => membership.projectId === args.projectId)
      .map((membership) => membership.groupId)
    const visibleGroupIds = new Set(visibleGroups.map(String))
    const events = await ctx.db
      .query('auditEvents')
      .withIndex('by_project_created_at', (q) => q.eq('projectId', args.projectId))
      .order('desc')
      .take((args.limit ?? 100) * 2)
    return events
      .filter((event) => !event.groupId || visibleGroupIds.has(String(event.groupId)))
      .slice(0, args.limit ?? 100)
  },
})
