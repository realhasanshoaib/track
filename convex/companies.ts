import { isCompanyHandleAllowed, normalizeCompanyHandle } from '@track/shared/company'
import { v } from 'convex/values'

import { mutation, query } from './_generated/server'
import type { Id } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'
import { appendAuditEvent } from './lib/audit'
import { requireAuthenticatedActor } from './lib/actorContext'
import {
  getCompanyMembership,
  requireActiveCompanyMembership,
  requireCompanyAdmin,
  requireCompanyModelEnabled,
  requireCompanyOwner,
} from './lib/companyPolicy'
import {
  createInvitationToken,
  hashInvitationToken,
  invitationLifetimeMs,
  normalizeEmail,
} from './lib/companyInvitations'

const invitationRole = v.union(v.literal('admin'), v.literal('member'))

function requireVerifiedTrackEmail(user: { emailVerified?: boolean }) {
  if (user.emailVerified !== true) throw new Error('email_verification_required')
}

async function revokeCompanyMemberArchives(
  ctx: MutationCtx,
  companyId: Id<'companies'>,
  userId: Id<'users'>,
  now: number,
) {
  const projectMemberships = await ctx.db
    .query('projectMembers')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .collect()
  for (const projectMembership of projectMemberships.filter((item) => item.companyId === companyId)) {
    const entitlement = await ctx.db
      .query('projectArchiveEntitlements')
      .withIndex('by_member', (q) => q.eq('projectMemberId', projectMembership._id))
      .unique()
    if (entitlement?.retentionStatus === 'active') {
      await ctx.db.patch(entitlement._id, { retentionStatus: 'revoked', updatedAt: now })
    }
  }
}

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    requireCompanyModelEnabled()
    const actor = await requireAuthenticatedActor(ctx)
    const memberships = await ctx.db
      .query('companyMembers')
      .withIndex('by_user_status', (q) => q.eq('userId', actor.userId).eq('status', 'active'))
      .collect()
    return await Promise.all(memberships.map(async (membership) => ({
      company: await ctx.db.get(membership.companyId),
      membership,
    })))
  },
})

export const discoverExact = query({
  args: { actingCompanyId: v.id('companies'), handle: v.string() },
  handler: async (ctx, args) => {
    requireCompanyModelEnabled()
    const actor = await requireAuthenticatedActor(ctx)
    await requireCompanyAdmin(ctx, actor, args.actingCompanyId)
    const normalizedHandle = normalizeCompanyHandle(args.handle)
    if (!isCompanyHandleAllowed(normalizedHandle)) return null
    const company = await ctx.db
      .query('companies')
      .withIndex('by_handle', (q) => q.eq('normalizedHandle', normalizedHandle))
      .unique()
    if (!company || company.status !== 'active') return null
    return { _id: company._id, displayName: company.displayName, normalizedHandle }
  },
})

export const getAdministration = query({
  args: { companyId: v.id('companies') },
  handler: async (ctx, args) => {
    requireCompanyModelEnabled()
    const actor = await requireAuthenticatedActor(ctx)
    requireVerifiedTrackEmail(actor.user)
    const { company, membership } = await requireActiveCompanyMembership(ctx, actor, args.companyId)
    const members = await ctx.db
      .query('companyMembers')
      .withIndex('by_company', (q) => q.eq('companyId', company._id))
      .collect()
    const invitations = membership.role === 'member'
      ? []
      : await ctx.db
          .query('companyInvitations')
          .withIndex('by_company_status', (q) => q.eq('companyId', company._id).eq('status', 'pending'))
          .collect()
    return {
      company,
      membership,
      members: await Promise.all(members.filter((member) => member.status !== 'removed').map(async (member) => {
        const user = await ctx.db.get(member.userId)
        return {
          membership: member,
          user: user ? { _id: user._id, displayName: user.displayName } : null,
        }
      })),
      invitations,
    }
  },
})

export const create = mutation({
  args: { displayName: v.string(), handle: v.string() },
  handler: async (ctx, args) => {
    requireCompanyModelEnabled()
    const actor = await requireAuthenticatedActor(ctx)
    const displayName = args.displayName.trim()
    const normalizedHandle = normalizeCompanyHandle(args.handle)
    if (!displayName) throw new Error('company_name_required')
    if (!isCompanyHandleAllowed(normalizedHandle)) throw new Error('company_handle_invalid')
    const existing = await ctx.db
      .query('companies')
      .withIndex('by_handle', (q) => q.eq('normalizedHandle', normalizedHandle))
      .unique()
    if (existing) throw new Error('company_handle_unavailable')

    const now = Date.now()
    const companyId = await ctx.db.insert('companies', {
      displayName,
      normalizedHandle,
      status: 'active',
      revision: 1,
      createdBy: actor.userId,
      createdAt: now,
      updatedAt: now,
    })
    await ctx.db.insert('companyMembers', {
      companyId,
      userId: actor.userId,
      role: 'owner',
      status: 'active',
      userDisplayNameSnapshot: actor.user.displayName,
      companyDisplayNameSnapshot: displayName,
      createdAt: now,
      updatedAt: now,
    })
    await appendAuditEvent(ctx, {
      companyId,
      actorId: actor.userId,
      actingCompanyId: companyId,
      entityType: 'company',
      entityId: companyId,
      action: 'company.created',
      after: { displayName, normalizedHandle },
    })
    return companyId
  },
})

export const updateProfile = mutation({
  args: { companyId: v.id('companies'), displayName: v.string() },
  handler: async (ctx, args) => {
    requireCompanyModelEnabled()
    const actor = await requireAuthenticatedActor(ctx)
    const { company } = await requireCompanyAdmin(ctx, actor, args.companyId)
    const displayName = args.displayName.trim()
    if (!displayName) throw new Error('company_name_required')
    const now = Date.now()
    await ctx.db.patch(company._id, { displayName, revision: company.revision + 1, updatedAt: now })
    await appendAuditEvent(ctx, {
      companyId: company._id,
      actorId: actor.userId,
      actingCompanyId: company._id,
      entityType: 'company',
      entityId: company._id,
      action: 'company.updated',
      before: { displayName: company.displayName },
      after: { displayName },
    })
  },
})

export const inviteMember = mutation({
  args: { companyId: v.id('companies'), email: v.string(), role: invitationRole },
  handler: async (ctx, args) => {
    requireCompanyModelEnabled()
    const actor = await requireAuthenticatedActor(ctx)
    await requireCompanyAdmin(ctx, actor, args.companyId)
    const normalizedEmail = normalizeEmail(args.email)
    if (!normalizedEmail.includes('@')) throw new Error('email_invalid')
    const existing = await ctx.db
      .query('companyInvitations')
      .withIndex('by_email_status', (q) => q.eq('normalizedEmail', normalizedEmail).eq('status', 'pending'))
      .collect()
    const duplicate = existing.find((invite) => invite.companyId === args.companyId)
    if (duplicate && duplicate.expiresAt > Date.now()) return { invitationId: duplicate._id, token: null }

    const recipient = await ctx.db
      .query('users')
      .withIndex('by_normalized_email', (q) => q.eq('normalizedEmail', normalizedEmail))
      .unique()
    const token = createInvitationToken()
    const now = Date.now()
    const invitationId = await ctx.db.insert('companyInvitations', {
      companyId: args.companyId,
      normalizedEmail,
      recipientUserId: recipient?._id,
      role: args.role,
      tokenHash: await hashInvitationToken(token),
      status: 'pending',
      invitedBy: actor.userId,
      expiresAt: now + invitationLifetimeMs,
      createdAt: now,
      updatedAt: now,
    })
    await appendAuditEvent(ctx, {
      companyId: args.companyId,
      actorId: actor.userId,
      actingCompanyId: args.companyId,
      entityType: 'companyInvitation',
      entityId: invitationId,
      action: 'company_invitation.created',
      after: { normalizedEmail, role: args.role },
    })
    return { invitationId, token }
  },
})

export const listPendingForMe = query({
  args: {},
  handler: async (ctx) => {
    requireCompanyModelEnabled()
    const actor = await requireAuthenticatedActor(ctx)
    requireVerifiedTrackEmail(actor.user)
    const invites = await ctx.db
      .query('companyInvitations')
      .withIndex('by_email_status', (q) =>
        q.eq('normalizedEmail', normalizeEmail(actor.user.email)).eq('status', 'pending'),
      )
      .collect()
    return await Promise.all(invites.map(async (invitation) => ({
      invitation,
      company: await ctx.db.get(invitation.companyId),
    })))
  },
})

export const decideInvitation = mutation({
  args: { invitationId: v.id('companyInvitations'), decision: v.union(v.literal('accept'), v.literal('decline')) },
  handler: async (ctx, args) => {
    requireCompanyModelEnabled()
    const actor = await requireAuthenticatedActor(ctx)
    requireVerifiedTrackEmail(actor.user)
    const invitation = await ctx.db.get(args.invitationId)
    if (!invitation || invitation.status !== 'pending') return invitation?._id ?? null
    if (invitation.normalizedEmail !== normalizeEmail(actor.user.email)) throw new Error('invitation_unavailable')
    const now = Date.now()
    if (invitation.expiresAt <= now) {
      await ctx.db.patch(invitation._id, { status: 'expired', updatedAt: now })
      throw new Error('invitation_expired')
    }
    if (args.decision === 'decline') {
      await ctx.db.patch(invitation._id, { status: 'declined', updatedAt: now })
      return invitation._id
    }
    const company = await ctx.db.get(invitation.companyId)
    if (!company || company.status !== 'active') throw new Error('company_unavailable')
    const existing = await getCompanyMembership(ctx, company._id, actor.userId)
    if (existing) {
      if (existing.status === 'active') throw new Error('company_member_already_active')
      await ctx.db.patch(existing._id, {
        role: invitation.role,
        status: 'active',
        endedAt: undefined,
        updatedAt: now,
      })
    } else {
      await ctx.db.insert('companyMembers', {
        companyId: company._id,
        userId: actor.userId,
        role: invitation.role,
        status: 'active',
        invitedBy: invitation.invitedBy,
        userDisplayNameSnapshot: actor.user.displayName,
        companyDisplayNameSnapshot: company.displayName,
        createdAt: now,
        updatedAt: now,
      })
    }
    await ctx.db.patch(invitation._id, {
      status: 'accepted',
      acceptedBy: actor.userId,
      acceptedAt: now,
      updatedAt: now,
    })
    return invitation._id
  },
})

export const updateMember = mutation({
  args: {
    companyId: v.id('companies'),
    companyMemberId: v.id('companyMembers'),
    role: v.optional(v.union(v.literal('owner'), v.literal('admin'), v.literal('member'))),
    status: v.optional(v.union(v.literal('active'), v.literal('suspended'), v.literal('removed'))),
  },
  handler: async (ctx, args) => {
    requireCompanyModelEnabled()
    const actor = await requireAuthenticatedActor(ctx)
    const actorContext = await requireCompanyAdmin(ctx, actor, args.companyId)
    const target = await ctx.db.get(args.companyMemberId)
    if (!target || target.companyId !== args.companyId) throw new Error('company_member_unavailable')
    const changesOwnership = args.role === 'owner' || (target.role === 'owner' && args.role !== undefined)
    if (changesOwnership && actorContext.membership.role !== 'owner') {
      throw new Error('company_owner_required')
    }
    const removesOwner = target.role === 'owner' && (args.role && args.role !== 'owner' || args.status && args.status !== 'active')
    if (removesOwner) {
      const owners = await ctx.db
        .query('companyMembers')
        .withIndex('by_company_status_role', (q) =>
          q.eq('companyId', args.companyId).eq('status', 'active').eq('role', 'owner'),
        )
        .collect()
      if (owners.length <= 1) throw new Error('last_company_owner')
    }
    const now = Date.now()
    if (args.status === 'suspended' || args.status === 'removed') {
      await revokeCompanyMemberArchives(ctx, args.companyId, target.userId, now)
    }
    await ctx.db.patch(target._id, {
      role: args.role ?? target.role,
      status: args.status ?? target.status,
      endedAt: args.status === 'removed' ? now : args.status === 'active' ? undefined : target.endedAt,
      updatedAt: now,
    })
  },
})

export const setSuspended = mutation({
  args: { companyId: v.id('companies'), suspended: v.boolean() },
  handler: async (ctx, args) => {
    requireCompanyModelEnabled()
    const actor = await requireAuthenticatedActor(ctx)
    const { company } = await requireCompanyOwner(ctx, actor, args.companyId, true)
    const status = args.suspended ? 'suspended' : 'active'
    if (company.status === status) return company._id
    const now = Date.now()
    await ctx.db.patch(company._id, { status, revision: company.revision + 1, updatedAt: now })
    await appendAuditEvent(ctx, {
      companyId: company._id,
      actorId: actor.userId,
      actingCompanyId: company._id,
      entityType: 'company',
      entityId: company._id,
      action: args.suspended ? 'company.suspended' : 'company.reactivated',
    })
    return company._id
  },
})

export const close = mutation({
  args: { companyId: v.id('companies'), retentionConfirmed: v.boolean() },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    const { company } = await requireCompanyOwner(ctx, actor, args.companyId, true)
    if (!args.retentionConfirmed) throw new Error('retention_confirmation_required')
    const activeParticipations = await ctx.db
      .query('projectCompanies')
      .withIndex('by_company_status', (q) => q.eq('companyId', company._id).eq('status', 'active'))
      .collect()
    const pendingExits = await ctx.db
      .query('projectCompanies')
      .withIndex('by_company_status', (q) => q.eq('companyId', company._id).eq('status', 'exit_pending'))
      .collect()
    const liveParticipations = (await Promise.all(activeParticipations.map(async (participation) => ({
      participation,
      project: await ctx.db.get(participation.projectId),
    })))).filter(({ project }) => project && (project.origin === 'shared' || project.status !== 'archived'))
    if (liveParticipations.length || pendingExits.length) throw new Error('company_projects_must_exit')
    const activeRelationships = await ctx.db
      .query('relationshipCompanies')
      .withIndex('by_company_status', (q) => q.eq('companyId', company._id).eq('status', 'active'))
      .collect()
    if (activeRelationships.length) throw new Error('company_relationships_must_exit')
    const now = Date.now()
    const [
      pendingCompanyInvitations,
      incomingRelationshipInvitations,
      outgoingRelationshipInvitations,
      incomingProjectInvitations,
      outgoingProjectInvitations,
    ] = await Promise.all([
      ctx.db.query('companyInvitations').withIndex('by_company_status', (q) =>
        q.eq('companyId', company._id).eq('status', 'pending'),
      ).collect(),
      ctx.db.query('relationshipInvitations').withIndex('by_target_status', (q) =>
        q.eq('targetCompanyId', company._id).eq('status', 'pending'),
      ).collect(),
      ctx.db.query('relationshipInvitations').withIndex('by_inviting_status', (q) =>
        q.eq('invitingCompanyId', company._id).eq('status', 'pending'),
      ).collect(),
      ctx.db.query('projectCompanyInvitations').withIndex('by_target_status', (q) =>
        q.eq('targetCompanyId', company._id).eq('status', 'pending'),
      ).collect(),
      ctx.db.query('projectCompanyInvitations').withIndex('by_inviting_status', (q) =>
        q.eq('invitingCompanyId', company._id).eq('status', 'pending'),
      ).collect(),
    ])
    const invitationsToRevoke = [
      ...pendingCompanyInvitations,
      ...incomingRelationshipInvitations,
      ...outgoingRelationshipInvitations,
      ...incomingProjectInvitations,
      ...outgoingProjectInvitations,
    ]
    await Promise.all(invitationsToRevoke.map((invitation) =>
      ctx.db.patch(invitation._id, { status: 'revoked', updatedAt: now }),
    ))
    const members = await ctx.db.query('companyMembers').withIndex('by_company', (q) => q.eq('companyId', company._id)).collect()
    await Promise.all(members.filter((member) => member.status === 'active').map((member) =>
      ctx.db.patch(member._id, { status: 'suspended', updatedAt: now }),
    ))
    await ctx.db.patch(company._id, {
      status: 'closed',
      revision: company.revision + 1,
      closedAt: now,
      updatedAt: now,
    })
    return company._id
  },
})
