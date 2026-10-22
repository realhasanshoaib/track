import { v } from 'convex/values'
import { groupPairKey } from '@track/shared'
import { mutation, query } from './_generated/server'
import type { MutationCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'
import { assertActorMatches, requireAuthenticatedActor } from './lib/actorContext'
import { authorizeGroupRequest } from './lib/requestAuthorization'
import { listActiveChannelMemberships } from './lib/channelMembership'

export async function addMember(ctx: MutationCtx, groupId: Id<'groups'>, userId: Id<'users'>) {
  const existing = await ctx.db.query('groupMembers').withIndex('by_group_user', q => q.eq('groupId', groupId).eq('userId', userId)).unique()
  const now = Date.now()
  if (existing) {
    if (existing.status === 'active') return
    await ctx.db.patch(existing._id, { status: 'active', updatedAt: now })
  } else {
    await ctx.db.insert('groupMembers', { groupId, userId, status: 'active', createdAt: now, updatedAt: now })
  }
  const members = await listActiveChannelMemberships(ctx, groupId)
  if (members.length > 2) await ctx.db.patch(groupId, { pairKey: undefined })
}
export const get = query({
  args: { groupId: v.string(), userId: v.id('users') },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    assertActorMatches(actor, args.userId)
    const id = ctx.db.normalizeId('groups', args.groupId)
    if (!id) return null
    const membership = await ctx.db.query('groupMembers').withIndex('by_group_user', q => q.eq('groupId', id).eq('userId', actor.userId)).unique()
    return membership?.status === 'active' ? await ctx.db.get(id) : null
  },
})
export const listVisible = query({
  args: { userId: v.id('users') },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    assertActorMatches(actor, args.userId)
    const memberships = await ctx.db.query('groupMembers').withIndex('by_user', q => q.eq('userId', actor.userId)).collect()
    const groups = await Promise.all(memberships.filter(m => m.status === 'active').map(m => ctx.db.get(m.groupId)))
    return groups.filter(g => g !== null)
  },
})
export const findPeople = query({
  args: { userId: v.id('users'), name: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    assertActorMatches(actor, args.userId)
    const term = args.name.trim()
    if (!term) return []
    const people = await ctx.db.query('users').withSearchIndex('search_display_name', q => q.search('displayName', term)).take(20)
    return await Promise.all(people.filter(u => u._id !== actor.userId).map(async u => ({
      _id: u._id, displayName: u.displayName,
      avatarUrl: u.avatarStorageId ? await ctx.storage.getUrl(u.avatarStorageId) : null,
    })))
  },
})
export const startWithPerson = mutation({
  args: { userId: v.id('users'), personId: v.id('users') },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    assertActorMatches(actor, args.userId)
    if (args.personId === actor.userId) throw new Error('choose_another_person')
    const person = await ctx.db.get(args.personId)
    if (!person) throw new Error('person_not_found')
    const pairKey = groupPairKey(actor.userId, person._id)
    const existing = await ctx.db.query('groups').withIndex('by_pair_key', q => q.eq('pairKey', pairKey)).unique()
    if (existing) return existing._id
    const now = Date.now()
    const groupId = await ctx.db.insert('groups', {
      name: actor.user.displayName + ' & ' + person.displayName, pairKey, status: 'active',
      nextChannelSequence: 1, createdBy: actor.userId, createdAt: now, updatedAt: now,
    })
    await addMember(ctx, groupId, actor.userId)
    await addMember(ctx, groupId, person._id)
    return groupId
  },
})
export const update = mutation({
  args: { groupId: v.id('groups'), userId: v.id('users'), name: v.string() },
  handler: async (ctx, args) => {
    await authorizeGroupRequest(ctx, { ...args, claimedUserId: args.userId })
    const name = args.name.trim()
    if (!name) throw new Error('group_name_required')
    await ctx.db.patch(args.groupId, { name, updatedAt: Date.now() })
  },
})
export const setArchived = mutation({
  args: { groupId: v.id('groups'), userId: v.id('users'), archived: v.boolean() },
  handler: async (ctx, args) => {
    await authorizeGroupRequest(ctx, { ...args, claimedUserId: args.userId })
    await ctx.db.patch(args.groupId, { status: args.archived ? 'archived' : 'active', archivedAt: args.archived ? Date.now() : undefined, updatedAt: Date.now() })
  },
})
export const leave = mutation({
  args: { groupId: v.id('groups'), userId: v.id('users') },
  handler: async (ctx, args) => {
    const { membership } = await authorizeGroupRequest(ctx, { ...args, claimedUserId: args.userId })
    await ctx.db.patch(membership._id, { status: 'removed', updatedAt: Date.now() })
    await ctx.db.patch(args.groupId, { pairKey: undefined })
    const typing = await ctx.db.query('typingIndicators').withIndex('by_group_user', q => q.eq('groupId', args.groupId).eq('userId', args.userId)).unique()
    if (typing) await ctx.db.delete(typing._id)
  },
})
export const listMembers = query({
  args: { groupId: v.id('groups'), userId: v.id('users') },
  handler: async (ctx, args) => {
    await authorizeGroupRequest(ctx, { ...args, claimedUserId: args.userId })
    const memberships = await listActiveChannelMemberships(ctx, args.groupId)
    const rows = await Promise.all(memberships.map(async membership => ({ membership, user: await ctx.db.get(membership.userId) })))
    return rows.filter((row): row is typeof row & { user: NonNullable<typeof row.user> } => row.user !== null)
  },
})
