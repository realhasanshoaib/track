import { v } from 'convex/values'
import { paginationOptsValidator } from 'convex/server'
import { mutation, query } from './_generated/server'
import type { Id } from './_generated/dataModel'
import type { QueryCtx } from './_generated/server'
import { assertActorMatches, requireAuthenticatedActor } from './lib/actorContext'
import { authorizeScopedRequest } from './lib/requestAuthorization'
import { isActiveChannelMembership } from '@track/shared/channel-membership'
const platform = v.union(v.literal('web'), v.literal('ios'), v.literal('android'))
async function getGroupUnreadCount(ctx: QueryCtx, groupId: Id<'groups'>, userId: Id<'users'>) {
  const read = await ctx.db
    .query('groupReadStates')
    .withIndex('by_user_group', (q) => q.eq('userId', userId).eq('groupId', groupId))
    .unique()
  const messages = await ctx.db
    .query('messages')
    .withIndex('by_group_created_at', (q) =>
      q.eq('groupId', groupId).gt('createdAt', read?.lastReadAt ?? 0),
    )
    .collect()
  return messages.filter((message) => message.authorId !== userId).length
}
export const listProjects = query({
  args: { userId: v.id('users') },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    assertActorMatches(actor, args.userId)
    const memberships = await ctx.db
      .query('projectMembers')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .collect()
    const rows = await Promise.all(
      memberships.map(async (membership) => {
        const project = await ctx.db.get(membership.projectId)
        if (!project) return null
        const groupMemberships = await ctx.db
          .query('groupMembers')
          .withIndex('by_project_user', (q) =>
            q.eq('projectId', project._id).eq('userId', args.userId),
          )
          .collect()
        const groups = groupMemberships.filter(isActiveChannelMembership)
        const unreadCount = (
          await Promise.all(
            groups.map((member) => getGroupUnreadCount(ctx, member.groupId, args.userId)),
          )
        ).reduce((a, b) => a + b, 0)
        return { project, membership, groupCount: groups.length, unreadCount }
      }),
    )
    return rows.filter((row) => row !== null)
  },
})
export const resolveNavigation = query({
  args: {
    projectId: v.id('projects'),
    groupId: v.optional(v.id('groups')),
    userId: v.id('users'),
    projectMemberId: v.optional(v.id('projectMembers')),
  },
  handler: async (ctx, args) => {
    try {
      await authorizeScopedRequest(
        ctx,
        { ...args, claimedUserId: args.userId },
        args.groupId ? 'readChannel' : 'readProject',
      )
      const group = args.groupId ? await ctx.db.get(args.groupId) : null
      const archived = group?.status === 'archived'
      return { available: true, archived, canWrite: !archived }
    } catch {
      return { available: false, archived: false, canWrite: false }
    }
  },
})
export const listProjectMembers = query({
  args: {
    projectId: v.id('projects'),
    userId: v.id('users'),
    projectMemberId: v.optional(v.id('projectMembers')),
  },
  handler: async (ctx, args) => {
    await authorizeScopedRequest(ctx, { ...args, claimedUserId: args.userId }, 'readProject')
    const memberships = await ctx.db
      .query('projectMembers')
      .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
      .collect()
    return await Promise.all(
      memberships.map(async (membership) => ({
        membership,
        user: await ctx.db.get(membership.userId),
      })),
    )
  },
})
export const listProjectMembersPage = query({
  args: {
    projectId: v.id('projects'),
    userId: v.id('users'),
    projectMemberId: v.optional(v.id('projectMembers')),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await authorizeScopedRequest(ctx, { ...args, claimedUserId: args.userId }, 'readProject')
    const result = await ctx.db
      .query('projectMembers')
      .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
      .paginate(args.paginationOpts)
    return {
      ...result,
      page: await Promise.all(
        result.page.map(async (membership) => ({
          membership,
          user: await ctx.db.get(membership.userId),
        })),
      ),
    }
  },
})
export const listGroups = query({
  args: {
    projectId: v.id('projects'),
    userId: v.id('users'),
    projectMemberId: v.optional(v.id('projectMembers')),
  },
  handler: async (ctx, args) => {
    await authorizeScopedRequest(ctx, { ...args, claimedUserId: args.userId }, 'readProject')
    const memberships = await ctx.db
      .query('groupMembers')
      .withIndex('by_project_user', (q) =>
        q.eq('projectId', args.projectId).eq('userId', args.userId),
      )
      .collect()
    const rows = await Promise.all(
      memberships.filter(isActiveChannelMembership).map(async (membership) => {
        const group = await ctx.db.get(membership.groupId)
        if (!group) return null
        const lastMessage = await ctx.db
          .query('messages')
          .withIndex('by_group_created_at', (q) => q.eq('groupId', group._id))
          .order('desc')
          .first()
        return {
          group,
          membership,
          lastMessage,
          unreadCount: await getGroupUnreadCount(ctx, group._id, args.userId),
        }
      }),
    )
    return rows.filter((row) => row !== null)
  },
})
export const listGroupsPage = query({
  args: {
    projectId: v.id('projects'),
    userId: v.id('users'),
    projectMemberId: v.optional(v.id('projectMembers')),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await authorizeScopedRequest(ctx, { ...args, claimedUserId: args.userId }, 'readProject')
    const result = await ctx.db
      .query('groupMembers')
      .withIndex('by_project_user', (q) =>
        q.eq('projectId', args.projectId).eq('userId', args.userId),
      )
      .paginate(args.paginationOpts)
    const rows = await Promise.all(
      result.page.filter(isActiveChannelMembership).map(async (membership) => {
        const group = await ctx.db.get(membership.groupId)
        if (!group) return null
        const lastMessage = await ctx.db
          .query('messages')
          .withIndex('by_group_created_at', (q) => q.eq('groupId', group._id))
          .order('desc')
          .first()
        return {
          group,
          membership,
          lastMessage,
          unreadCount: await getGroupUnreadCount(ctx, group._id, args.userId),
        }
      }),
    )
    return { ...result, page: rows.filter((row) => row !== null) }
  },
})
export const getLastActiveContext = query({
  args: {
    userId: v.id('users'),
    deviceId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    assertActorMatches(actor, args.userId)
    const byDevice = args.deviceId
      ? await ctx.db
          .query('lastActiveContexts')
          .withIndex('by_user_device', (q) =>
            q.eq('userId', args.userId).eq('deviceId', args.deviceId),
          )
          .unique()
      : null
    if (byDevice) return byDevice
    return await ctx.db
      .query('lastActiveContexts')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .order('desc')
      .first()
  },
})
export const setLastActiveContext = mutation({
  args: {
    userId: v.id('users'),
    projectId: v.optional(v.id('projects')),
    groupId: v.optional(v.id('groups')),
    deviceId: v.optional(v.string()),
    platform: v.optional(platform),
    projectMemberId: v.optional(v.id('projectMembers')),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    assertActorMatches(actor, args.userId)
    if (args.projectId)
      await authorizeScopedRequest(
        ctx,
        {
          projectId: args.projectId,
          groupId: args.groupId,
          claimedUserId: args.userId,
          projectMemberId: args.projectMemberId,
        },
        args.groupId ? 'readChannel' : 'readProject',
      )
    const now = Date.now()
    const existing = args.deviceId
      ? await ctx.db
          .query('lastActiveContexts')
          .withIndex('by_user_device', (q) =>
            q.eq('userId', args.userId).eq('deviceId', args.deviceId),
          )
          .unique()
      : await ctx.db
          .query('lastActiveContexts')
          .withIndex('by_user', (q) => q.eq('userId', args.userId))
          .first()
    const payload = {
      projectId: args.projectId,
      groupId: args.groupId,
      deviceId: args.deviceId,
      platform: args.platform,
      projectMemberId: args.projectMemberId,
      updatedAt: now,
    }
    if (existing) {
      await ctx.db.patch(existing._id, payload)
      return existing._id
    }
    return await ctx.db.insert('lastActiveContexts', {
      userId: args.userId,
      ...payload,
    })
  },
})
export const markGroupRead = mutation({
  args: {
    groupId: v.id('groups'),
    userId: v.id('users'),
    projectMemberId: v.optional(v.id('projectMembers')),
    lastReadMessageId: v.optional(v.id('messages')),
  },
  handler: async (ctx, args) => {
    const group = await ctx.db.get(args.groupId)
    if (!group) throw new Error('group_not_found')
    await authorizeScopedRequest(
      ctx,
      {
        projectId: group.projectId,
        groupId: group._id,
        claimedUserId: args.userId,
        projectMemberId: args.projectMemberId,
      },
      'readChannel',
    )
    if (args.lastReadMessageId) {
      const message = await ctx.db.get(args.lastReadMessageId)
      if (!message || message.groupId !== args.groupId) {
        throw new Error('message_not_found')
      }
    }
    const now = Date.now()
    const existing = args.projectMemberId
      ? await ctx.db
          .query('groupReadStates')
          .withIndex('by_project_member_group', (q) =>
            q.eq('projectMemberId', args.projectMemberId).eq('groupId', args.groupId),
          )
          .unique()
      : await ctx.db
          .query('groupReadStates')
          .withIndex('by_user_group', (q) =>
            q.eq('userId', args.userId).eq('groupId', args.groupId),
          )
          .unique()
    const payload = {
      projectId: group.projectId,
      groupId: args.groupId,
      userId: args.userId,
      projectMemberId: args.projectMemberId,
      lastReadMessageId: args.lastReadMessageId,
      lastReadAt: now,
      updatedAt: now,
    }
    if (existing) {
      await ctx.db.patch(existing._id, payload)
      return existing._id
    }
    return await ctx.db.insert('groupReadStates', {
      ...payload,
      createdAt: now,
    })
  },
})
