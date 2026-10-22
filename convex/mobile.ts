import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import type { Id } from './_generated/dataModel'
import type { QueryCtx } from './_generated/server'
import { assertActorMatches, requireAuthenticatedActor } from './lib/actorContext'
import { authorizeGroupRequest } from './lib/requestAuthorization'

async function getGroupUnreadCount(ctx: QueryCtx, groupId: Id<'groups'>, userId: Id<'users'>) {
  const read = await ctx.db.query('groupReadStates').withIndex('by_user_group', q => q.eq('userId', userId).eq('groupId', groupId)).unique()
  const messages = await ctx.db.query('messages').withIndex('by_group_created_at', q => q.eq('groupId', groupId).gt('createdAt', read?.lastReadAt ?? 0)).collect()
  return messages.filter(m => m.authorId !== userId).length
}
export const listGroups = query({
  args: { userId: v.id('users') },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    assertActorMatches(actor, args.userId)
    const memberships = await ctx.db.query('groupMembers').withIndex('by_user', q => q.eq('userId', actor.userId)).collect()
    const rows = await Promise.all(memberships.filter(m => m.status === 'active').map(async membership => {
      const group = await ctx.db.get(membership.groupId)
      if (!group) return null
      const lastMessage = await ctx.db.query('messages').withIndex('by_group_created_at', q => q.eq('groupId', group._id)).order('desc').first()
      return { group, membership, lastMessage, unreadCount: await getGroupUnreadCount(ctx, group._id, actor.userId) }
    }))
    return rows.filter(row => row !== null).sort((a, b) => (b.lastMessage?.createdAt ?? b.group.createdAt) - (a.lastMessage?.createdAt ?? a.group.createdAt) || a.group._id.localeCompare(b.group._id))
  },
})
export const resolveNavigation = query({
  args: { groupId: v.string(), userId: v.id('users') },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    assertActorMatches(actor, args.userId)
    const groupId = ctx.db.normalizeId('groups', args.groupId)
    if (!groupId) return { available: false } as const
    const membership = await ctx.db.query('groupMembers').withIndex('by_group_user', q => q.eq('groupId', groupId).eq('userId', actor.userId)).unique()
    if (membership?.status !== 'active') return { available: false } as const
    const group = await ctx.db.get(groupId)
    if (!group) return { available: false } as const
    return { available: true, group, archived: group.status === 'archived', canWrite: group.status === 'active' } as const
  },
})
export const getLastActiveContext = query({
  args: { userId: v.id('users'), deviceId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    assertActorMatches(actor, args.userId)
    const context = args.deviceId
      ? await ctx.db.query('lastActiveContexts').withIndex('by_user_device', q => q.eq('userId', args.userId).eq('deviceId', args.deviceId)).unique()
      : await ctx.db.query('lastActiveContexts').withIndex('by_user', q => q.eq('userId', args.userId)).first()
    if (!context?.groupId) return context
    const membership = await ctx.db.query('groupMembers').withIndex('by_group_user', q => q.eq('groupId', context.groupId!).eq('userId', args.userId)).unique()
    return membership?.status === 'active' ? context : null
  },
})
export const setLastActiveContext = mutation({
  args: { userId: v.id('users'), groupId: v.optional(v.id('groups')), deviceId: v.optional(v.string()), platform: v.optional(v.union(v.literal('web'), v.literal('ios'), v.literal('android'))) },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    assertActorMatches(actor, args.userId)
    if (args.groupId) await authorizeGroupRequest(ctx, { groupId: args.groupId, claimedUserId: args.userId })
    const existing = args.deviceId
      ? await ctx.db.query('lastActiveContexts').withIndex('by_user_device', q => q.eq('userId', args.userId).eq('deviceId', args.deviceId)).unique()
      : await ctx.db.query('lastActiveContexts').withIndex('by_user', q => q.eq('userId', args.userId)).first()
    const payload = { ...args, updatedAt: Date.now() }
    if (existing) { await ctx.db.patch(existing._id, payload); return existing._id }
    return await ctx.db.insert('lastActiveContexts', payload)
  },
})
export const markGroupRead = mutation({
  args: { groupId: v.id('groups'), userId: v.id('users'), lastReadMessageId: v.optional(v.id('messages')) },
  handler: async (ctx, args) => {
    await authorizeGroupRequest(ctx, { ...args, claimedUserId: args.userId })
    const message = args.lastReadMessageId ? await ctx.db.get(args.lastReadMessageId) : await ctx.db.query('messages').withIndex('by_group_created_at', q => q.eq('groupId', args.groupId)).order('desc').first()
    if (message && message.groupId !== args.groupId) throw new Error('message_scope_mismatch')
    if (args.lastReadMessageId && !message) throw new Error('message_not_found')
    const existing = await ctx.db.query('groupReadStates').withIndex('by_user_group', q => q.eq('userId', args.userId).eq('groupId', args.groupId)).unique()
    const lastReadAt = Math.max(existing?.lastReadAt ?? 0, message?.createdAt ?? 0)
    if (existing && existing.lastReadAt >= lastReadAt) return existing._id
    const payload = { groupId: args.groupId, userId: args.userId, lastReadMessageId: message?._id, lastReadAt, updatedAt: Date.now() }
    if (existing) { await ctx.db.patch(existing._id, payload); return existing._id }
    return await ctx.db.insert('groupReadStates', { ...payload, createdAt: Date.now() })
  },
})
