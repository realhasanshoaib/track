import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { authComponent } from './auth'
import { assertActorMatches, requireAuthenticatedActor } from './lib/actorContext'
import { authorizeGroupRequest } from './lib/requestAuthorization'
import { addMember } from './groups'
export const listForGroup = query({
  args: { groupId: v.id('groups'), userId: v.id('users') },
  handler: async (ctx, args) => {
    await authorizeGroupRequest(ctx, { ...args, claimedUserId: args.userId })
    return await ctx.db.query('invitations').withIndex('by_group_status', q => q.eq('groupId', args.groupId)).order('desc').take(50)
  },
})
export const create = mutation({
  args: { groupId: v.id('groups'), invitedBy: v.id('users'), email: v.string() },
  handler: async (ctx, args) => {
    await authorizeGroupRequest(ctx, { groupId: args.groupId, claimedUserId: args.invitedBy })
    const email = args.email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('invalid_email')
    const pending = await ctx.db.query('invitations').withIndex('by_group_status', q => q.eq('groupId', args.groupId).eq('status', 'pending')).collect()
    const existing = pending.find(i => i.email === email && i.expiresAt > Date.now())
    if (existing) return existing._id
    const now = Date.now()
    return await ctx.db.insert('invitations', {
      groupId: args.groupId, email, invitedBy: args.invitedBy, status: 'pending',
      token: crypto.randomUUID(), expiresAt: now + 14 * 24 * 60 * 60 * 1000,
      createdAt: now, updatedAt: now,
    })
  },
})
export const revoke = mutation({
  args: { invitationId: v.id('invitations'), userId: v.id('users') },
  handler: async (ctx, args) => {
    const invite = await ctx.db.get(args.invitationId)
    if (!invite) throw new Error('invitation_not_found')
    await authorizeGroupRequest(ctx, { groupId: invite.groupId, claimedUserId: args.userId })
    await ctx.db.patch(invite._id, { status: 'revoked', updatedAt: Date.now() })
  },
})
export const accept = mutation({
  args: { userId: v.id('users'), token: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    assertActorMatches(actor, args.userId)
    const invite = await ctx.db.query('invitations').withIndex('by_token', q => q.eq('token', args.token)).unique()
    if (!invite || invite.email !== actor.user.email.trim().toLowerCase()) throw new Error('invitation_not_found')
    if (invite.status === 'accepted' && invite.acceptedBy === actor.userId) return invite.groupId
    if (invite.status !== 'pending' || invite.expiresAt <= Date.now()) throw new Error('invitation_expired')
    const group = await ctx.db.get(invite.groupId)
    if (!group) throw new Error('group_not_found')
    await addMember(ctx, group._id, actor.userId)
    await ctx.db.patch(invite._id, { status: 'accepted', acceptedBy: actor.userId, acceptedAt: Date.now(), updatedAt: Date.now() })
    return group._id
  },
})
export const acceptPendingForCurrentUser = mutation({
  args: { userId: v.id('users') },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    assertActorMatches(actor, args.userId)
    const authUser = await authComponent.getAuthUser(ctx)
    if (!authUser.emailVerified || authUser.email.trim().toLowerCase() !== actor.user.email.trim().toLowerCase()) return []
    const pending = await ctx.db.query('invitations').withIndex('by_email_status', q => q.eq('email', actor.user.email.trim().toLowerCase()).eq('status', 'pending')).collect()
    const accepted = []
    for (const invite of pending) {
      if (invite.expiresAt <= Date.now()) {
        await ctx.db.patch(invite._id, { status: 'expired', updatedAt: Date.now() })
        continue
      }
      if (!(await ctx.db.get(invite.groupId))) continue
      await addMember(ctx, invite.groupId, actor.userId)
      await ctx.db.patch(invite._id, { status: 'accepted', acceptedBy: actor.userId, acceptedAt: Date.now(), updatedAt: Date.now() })
      accepted.push(invite.groupId)
    }
    return accepted
  },
})
