import { v } from 'convex/values'

import { mutation, query } from './_generated/server'
import { authorizeScopedRequest } from './lib/requestAuthorization'

const SERVER_REFRESH_MIN_MS = 1_500
const STALE_DELETE_MS = 60_000
const LIST_LIMIT = 12
const CLEANUP_LIMIT = 20

const typingActivity = v.union(
  v.literal('typing'),
  v.literal('attaching'),
  v.literal('recording'),
)

export const list = query({
  args: {
    groupId: v.id('groups'),
    channelThreadId: v.optional(v.id('channelThreads')),
    userId: v.id('users'),
    actingCompanyId: v.optional(v.id('companies')),
    projectMemberId: v.optional(v.id('projectMembers')),
  },
  handler: async (ctx, args) => {
    const group = await ctx.db.get(args.groupId)
    if (!group) return []
    await authorizeScopedRequest(ctx, {
      projectId: group.projectId,
      groupId: group._id,
      claimedUserId: args.userId,
      actingCompanyId: args.actingCompanyId,
      projectMemberId: args.projectMemberId,
    }, 'readChannel')

    const now = Date.now()
    const indicators = await ctx.db
      .query('typingIndicators')
      .withIndex('by_group_thread_updated_at', (q) =>
        q.eq('groupId', args.groupId).eq('channelThreadId', args.channelThreadId),
      )
      .order('desc')
      .take(LIST_LIMIT)

    return await Promise.all(
      indicators
        .filter((indicator) => indicator.userId !== args.userId && indicator.updatedAt > now - STALE_DELETE_MS)
        .map(async (indicator) => {
          const user = await ctx.db.get(indicator.userId)
          const avatarUrl = user?.avatarStorageId ? await ctx.storage.getUrl(user.avatarStorageId) : null
          return { avatarUrl, indicator, user }
        }),
    )
  },
})

export const heartbeat = mutation({
  args: {
    projectId: v.id('projects'),
    groupId: v.id('groups'),
    channelThreadId: v.optional(v.id('channelThreads')),
    userId: v.id('users'),
    actingCompanyId: v.optional(v.id('companies')),
    projectMemberId: v.optional(v.id('projectMembers')),
    activity: typingActivity,
  },
  handler: async (ctx, args) => {
    await authorizeScopedRequest(ctx, {
      projectId: args.projectId,
      groupId: args.groupId,
      claimedUserId: args.userId,
      actingCompanyId: args.actingCompanyId,
      projectMemberId: args.projectMemberId,
    }, 'writeChannel')
    const group = await ctx.db.get(args.groupId)
    if (!group || group.projectId !== args.projectId) {
      throw new Error('group_project_mismatch')
    }
    if (args.channelThreadId) {
      const thread = await ctx.db.get(args.channelThreadId)
      if (!thread || thread.groupId !== args.groupId) throw new Error('thread_group_mismatch')
    }
    const now = Date.now()
    const staleIndicators = await ctx.db
      .query('typingIndicators')
      .withIndex('by_group_updated_at', (q) =>
        q.eq('groupId', args.groupId).lt('updatedAt', now - STALE_DELETE_MS),
      )
      .take(CLEANUP_LIMIT)
    await Promise.all(staleIndicators.map((indicator) => ctx.db.delete(indicator._id)))

    const existing = args.projectMemberId
      ? await ctx.db.query('typingIndicators').withIndex('by_group_thread_project_member', (q) =>
          q.eq('groupId', args.groupId).eq('channelThreadId', args.channelThreadId).eq('projectMemberId', args.projectMemberId),
        ).unique()
      : await ctx.db.query('typingIndicators').withIndex('by_group_thread_user', (q) =>
          q.eq('groupId', args.groupId).eq('channelThreadId', args.channelThreadId).eq('userId', args.userId),
        ).unique()

    if (existing) {
      if (
        existing.activity === args.activity &&
        existing.updatedAt > now - SERVER_REFRESH_MIN_MS
      ) {
        return existing._id
      }
      await ctx.db.patch(existing._id, {
        activity: args.activity,
        projectId: args.projectId,
        updatedAt: now,
      })
      return existing._id
    }

    return await ctx.db.insert('typingIndicators', {
      projectId: args.projectId,
      groupId: args.groupId,
      channelThreadId: args.channelThreadId,
      userId: args.userId,
      projectMemberId: args.projectMemberId,
      activity: args.activity,
      createdAt: now,
      updatedAt: now,
    })
  },
})

export const clear = mutation({
  args: {
    groupId: v.id('groups'),
    channelThreadId: v.optional(v.id('channelThreads')),
    userId: v.id('users'),
    actingCompanyId: v.optional(v.id('companies')),
    projectMemberId: v.optional(v.id('projectMembers')),
  },
  handler: async (ctx, args) => {
    const group = await ctx.db.get(args.groupId)
    if (!group) return
    await authorizeScopedRequest(ctx, {
      projectId: group.projectId,
      groupId: group._id,
      claimedUserId: args.userId,
      actingCompanyId: args.actingCompanyId,
      projectMemberId: args.projectMemberId,
    }, 'writeChannel')
    if (args.channelThreadId) {
      const thread = await ctx.db.get(args.channelThreadId)
      if (!thread || thread.groupId !== args.groupId) throw new Error('thread_group_mismatch')
    }
    const now = Date.now()
    const staleIndicators = await ctx.db
      .query('typingIndicators')
      .withIndex('by_group_updated_at', (q) =>
        q.eq('groupId', args.groupId).lt('updatedAt', now - STALE_DELETE_MS),
      )
      .take(CLEANUP_LIMIT)
    await Promise.all(staleIndicators.map((indicator) => ctx.db.delete(indicator._id)))

    const existing = args.projectMemberId
      ? await ctx.db.query('typingIndicators').withIndex('by_group_thread_project_member', (q) =>
          q.eq('groupId', args.groupId).eq('channelThreadId', args.channelThreadId).eq('projectMemberId', args.projectMemberId),
        ).unique()
      : await ctx.db.query('typingIndicators').withIndex('by_group_thread_user', (q) =>
          q.eq('groupId', args.groupId).eq('channelThreadId', args.channelThreadId).eq('userId', args.userId),
        ).unique()

    if (existing) await ctx.db.delete(existing._id)
  },
})
