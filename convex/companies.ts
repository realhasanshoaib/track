import { isCompanyHandleAllowed, normalizeCompanyHandle } from '@track/shared/company'
import { v } from 'convex/values'

import { internalMutation, mutation, query } from './_generated/server'
import { internal } from './_generated/api'
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
const companyDescriptionMaxLength = 1_000
const companyNameMaxLength = 120

function basicCompany(company: {
  _id: Id<'companies'>
  displayName: string
  normalizedHandle: string
  logoStorageId?: Id<'_storage'>
  description?: string
  status: 'active' | 'suspended' | 'closed'
  createdAt: number
  updatedAt: number
}) {
  return {
    _id: company._id,
    displayName: company.displayName,
    normalizedHandle: company.normalizedHandle,
    logoStorageId: company.logoStorageId,
    description: company.description,
    status: company.status,
    createdAt: company.createdAt,
    updatedAt: company.updatedAt,
  }
}

function validateCompanyName(value: string) {
  const displayName = value.trim()
  if (!displayName) throw new Error('company_name_required')
  if (displayName.length > companyNameMaxLength) throw new Error('company_name_too_long')
  return displayName
}

function validateCompanyDescription(value: string | undefined) {
  const description = value?.trim() || undefined
  if (description && description.length > companyDescriptionMaxLength) {
    throw new Error('company_description_too_long')
  }
  return description
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254
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
    return await Promise.all(memberships.map(async (membership) => {
      const company = await ctx.db.get(membership.companyId)
      return {
        company: company ? { ...basicCompany(company), logoUrl: company.logoStorageId ? await ctx.storage.getUrl(company.logoStorageId) : null } : null,
        membership,
      }
    }))
  },
})

export const getBasic = query({
  args: { companyId: v.id('companies') },
  handler: async (ctx, args) => {
    requireCompanyModelEnabled()
    const actor = await requireAuthenticatedActor(ctx)
    const { company, membership } = await requireActiveCompanyMembership(ctx, actor, args.companyId)
    const [members, projects] = await Promise.all([
      ctx.db.query('companyMembers').withIndex('by_company', (q) => q.eq('companyId', company._id)).collect(),
      ctx.db.query('projectCompanies').withIndex('by_company_status', (q) =>
        q.eq('companyId', company._id).eq('status', 'active'),
      ).collect(),
    ])
    return {
      company: { ...basicCompany(company), logoUrl: company.logoStorageId ? await ctx.storage.getUrl(company.logoStorageId) : null },
      membership,
      memberCount: members.filter((member) => member.status === 'active').length,
      projectCount: projects.length,
    }
  },
})

export const getLogoUrl = query({
  args: { companyId: v.id('companies') },
  handler: async (ctx, args) => {
    requireCompanyModelEnabled()
    const actor = await requireAuthenticatedActor(ctx)
    const { company } = await requireActiveCompanyMembership(ctx, actor, args.companyId)
    return company.logoStorageId ? await ctx.storage.getUrl(company.logoStorageId) : null
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
    const { company, membership } = await requireCompanyAdmin(ctx, actor, args.companyId)
    const members = await ctx.db
      .query('companyMembers')
      .withIndex('by_company', (q) => q.eq('companyId', company._id))
      .collect()
    const invitations = await ctx.db
      .query('companyInvitations')
      .withIndex('by_company_status', (q) => q.eq('companyId', company._id).eq('status', 'pending'))
      .collect()
    return {
      company: { ...company, logoUrl: company.logoStorageId ? await ctx.storage.getUrl(company.logoStorageId) : null },
      membership,
      members: await Promise.all(members.filter((member) => member.status !== 'removed').map(async (member) => {
        const user = await ctx.db.get(member.userId)
        return {
          membership: member,
          user: user ? { _id: user._id, displayName: user.displayName, email: user.email } : null,
        }
      })),
      invitations,
    }
  },
})

export const create = mutation({
  args: { displayName: v.string(), handle: v.string(), description: v.optional(v.string()) },
  handler: async (ctx, args) => {
    requireCompanyModelEnabled()
    const actor = await requireAuthenticatedActor(ctx)
    const displayName = validateCompanyName(args.displayName)
    const description = validateCompanyDescription(args.description)
    const normalizedHandle = normalizeCompanyHandle(args.handle)
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
      description,
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
      after: { displayName, normalizedHandle, description },
    })
    return companyId
  },
})

export const updateProfile = mutation({
  args: {
    companyId: v.id('companies'),
    displayName: v.optional(v.string()),
    handle: v.optional(v.string()),
    description: v.optional(v.string()),
    logoStorageId: v.optional(v.union(v.id('_storage'), v.null())),
  },
  handler: async (ctx, args) => {
    requireCompanyModelEnabled()
    const actor = await requireAuthenticatedActor(ctx)
    const { company } = await requireCompanyAdmin(ctx, actor, args.companyId)
    if (args.displayName === undefined && args.handle === undefined && args.description === undefined && args.logoStorageId === undefined) {
      throw new Error('company_update_required')
    }
    const displayName = args.displayName === undefined ? company.displayName : validateCompanyName(args.displayName)
    const normalizedHandle = args.handle === undefined ? company.normalizedHandle : normalizeCompanyHandle(args.handle)
    const description = args.description === undefined ? company.description : validateCompanyDescription(args.description)
    if (!isCompanyHandleAllowed(normalizedHandle)) throw new Error('company_handle_invalid')
    if (normalizedHandle !== company.normalizedHandle) {
      const existing = await ctx.db.query('companies')
        .withIndex('by_handle', (q) => q.eq('normalizedHandle', normalizedHandle)).unique()
      if (existing && existing._id !== company._id) throw new Error('company_handle_unavailable')
    }
    if (args.logoStorageId) {
      const metadata = await ctx.storage.getMetadata(args.logoStorageId)
      if (!metadata || metadata.size > 5_000_000 || !['image/png', 'image/jpeg', 'image/webp'].includes(metadata.contentType ?? '')) {
        throw new Error('company_logo_invalid')
      }
    }
    const now = Date.now()
    const logoStorageId = args.logoStorageId === undefined
      ? company.logoStorageId
      : args.logoStorageId ?? undefined
    await ctx.db.patch(company._id, {
      displayName, normalizedHandle, description, logoStorageId,
      revision: company.revision + 1, updatedAt: now,
    })
    if (displayName !== company.displayName) {
      const [companyMembers, projectMembers] = await Promise.all([
        ctx.db.query('companyMembers')
          .withIndex('by_company', (q) => q.eq('companyId', company._id))
          .take(101),
        ctx.db.query('projectMembers')
          .withIndex('by_company', (q) => q.eq('companyId', company._id))
          .take(101),
      ])
      await Promise.all([...companyMembers.slice(0, 100), ...projectMembers.slice(0, 100)].map((member) =>
        ctx.db.patch(member._id, { companyDisplayNameSnapshot: displayName, updatedAt: now }),
      ))
      if (companyMembers.length > 100) await ctx.scheduler.runAfter(
        0,
        internal.companies.propagateDisplayNameSnapshots,
        { companyId: company._id, displayName, cursor: null, table: 'companyMembers' },
      )
      if (projectMembers.length > 100) await ctx.scheduler.runAfter(
        0,
        internal.companies.propagateDisplayNameSnapshots,
        { companyId: company._id, displayName, cursor: null, table: 'projectMembers' },
      )
    }
    await appendAuditEvent(ctx, {
      companyId: company._id,
      actorId: actor.userId,
      actingCompanyId: company._id,
      entityType: 'company',
      entityId: company._id,
      action: 'company.updated',
      before: { displayName: company.displayName, normalizedHandle: company.normalizedHandle, description: company.description, logoStorageId: company.logoStorageId },
      after: { displayName, normalizedHandle, description, logoStorageId },
    })
  },
})

export const propagateDisplayNameSnapshots = internalMutation({
  args: {
    companyId: v.id('companies'),
    displayName: v.string(),
    cursor: v.union(v.string(), v.null()),
    table: v.union(v.literal('companyMembers'), v.literal('projectMembers')),
  },
  handler: async (ctx, args) => {
    const company = await ctx.db.get(args.companyId)
    if (!company || company.displayName !== args.displayName) return
    const now = Date.now()
    const result = args.table === 'companyMembers'
      ? await ctx.db.query('companyMembers')
          .withIndex('by_company', (q) => q.eq('companyId', args.companyId))
          .paginate({ cursor: args.cursor, numItems: 100 })
      : await ctx.db.query('projectMembers')
          .withIndex('by_company', (q) => q.eq('companyId', args.companyId))
          .paginate({ cursor: args.cursor, numItems: 100 })
    await Promise.all(result.page.map((member) =>
      ctx.db.patch(member._id, { companyDisplayNameSnapshot: args.displayName, updatedAt: now }),
    ))
    if (!result.isDone) {
      await ctx.scheduler.runAfter(0, internal.companies.propagateDisplayNameSnapshots, {
        ...args,
        cursor: result.continueCursor,
      })
    }
  },
})

export const generateLogoUploadUrl = mutation({
  args: { companyId: v.id('companies') },
  handler: async (ctx, args) => {
    requireCompanyModelEnabled()
    const actor = await requireAuthenticatedActor(ctx)
    await requireCompanyAdmin(ctx, actor, args.companyId)
    return await ctx.storage.generateUploadUrl()
  },
})

export const inviteMember = mutation({
  args: { companyId: v.id('companies'), email: v.string(), role: invitationRole },
  handler: async (ctx, args) => {
    requireCompanyModelEnabled()
    const actor = await requireAuthenticatedActor(ctx)
    await requireCompanyAdmin(ctx, actor, args.companyId)
    const normalizedEmail = normalizeEmail(args.email)
    if (!isValidEmail(normalizedEmail)) throw new Error('email_invalid')
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
    if (recipient) {
      const membership = await getCompanyMembership(ctx, args.companyId, recipient._id)
      if (membership?.status === 'active') throw new Error('company_member_already_active')
    }
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
    if (recipient) {
      await ctx.scheduler.runAfter(0, internal.pushNotifications.deliverCompanyInvitation, {
        invitationId,
      })
    }
    return { invitationId, token }
  },
})

export const listPendingForMe = query({
  args: {},
  handler: async (ctx) => {
    requireCompanyModelEnabled()
    const actor = await requireAuthenticatedActor(ctx)
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
    const invitation = await ctx.db.get(args.invitationId)
    if (!invitation || invitation.normalizedEmail !== normalizeEmail(actor.user.email)) throw new Error('invitation_unavailable')
    if (invitation.status !== 'pending') {
      if (invitation.status === 'accepted' && invitation.acceptedBy !== actor.userId) throw new Error('invitation_unavailable')
      return invitation._id
    }
    const now = Date.now()
    if (invitation.expiresAt <= now) {
      await ctx.db.patch(invitation._id, { status: 'expired', updatedAt: now })
      await appendAuditEvent(ctx, {
        companyId: invitation.companyId, actorId: actor.userId, actingCompanyId: invitation.companyId,
        entityType: 'companyInvitation', entityId: invitation._id,
        action: 'company_invitation.expired', before: { status: 'pending' }, after: { status: 'expired' },
      })
      return { invitationId: invitation._id, status: 'expired' as const }
    }
    if (args.decision === 'decline') {
      await ctx.db.patch(invitation._id, { status: 'declined', updatedAt: now })
      await appendAuditEvent(ctx, {
        companyId: invitation.companyId, actorId: actor.userId, actingCompanyId: invitation.companyId,
        entityType: 'companyInvitation', entityId: invitation._id,
        action: 'company_invitation.declined', before: { status: 'pending' }, after: { status: 'declined' },
      })
      return invitation._id
    }
    const company = await ctx.db.get(invitation.companyId)
    if (!company || company.status !== 'active') throw new Error('company_unavailable')
    const existing = await getCompanyMembership(ctx, company._id, actor.userId)
    let memberId = existing?._id
    if (existing) {
      if (existing.status === 'active') throw new Error('company_member_already_active')
      await ctx.db.patch(existing._id, {
        role: invitation.role,
        status: 'active',
        endedAt: undefined,
        updatedAt: now,
      })
    } else {
      memberId = await ctx.db.insert('companyMembers', {
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
    await appendAuditEvent(ctx, {
      companyId: company._id, actorId: actor.userId, actingCompanyId: company._id,
      entityType: 'companyInvitation', entityId: invitation._id,
      action: 'company_invitation.accepted', before: { status: 'pending' },
      after: { status: 'accepted', role: invitation.role, memberId },
    })
    return invitation._id
  },
})

export const revokeInvitation = mutation({
  args: { companyId: v.id('companies'), invitationId: v.id('companyInvitations') },
  handler: async (ctx, args) => {
    requireCompanyModelEnabled()
    const actor = await requireAuthenticatedActor(ctx)
    await requireCompanyAdmin(ctx, actor, args.companyId)
    const invitation = await ctx.db.get(args.invitationId)
    if (!invitation || invitation.companyId !== args.companyId) throw new Error('invitation_unavailable')
    if (invitation.status !== 'pending') return invitation._id
    const now = Date.now()
    await ctx.db.patch(invitation._id, { status: 'revoked', updatedAt: now })
    await appendAuditEvent(ctx, {
      companyId: args.companyId, actorId: actor.userId, actingCompanyId: args.companyId,
      entityType: 'companyInvitation', entityId: invitation._id,
      action: 'company_invitation.revoked', before: { status: 'pending' }, after: { status: 'revoked' },
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
    if (args.role === undefined && args.status === undefined) throw new Error('company_member_update_required')
    if (target.role === 'owner' && actorContext.membership.role !== 'owner') throw new Error('company_owner_required')
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
    await appendAuditEvent(ctx, {
      companyId: args.companyId, actorId: actor.userId, actingCompanyId: args.companyId,
      entityType: 'companyMember', entityId: target._id,
      action: args.status === 'suspended' ? 'company_member.suspended'
        : args.status === 'removed' ? 'company_member.removed'
          : args.status === 'active' ? 'company_member.reactivated' : 'company_member.role_changed',
      before: { role: target.role, status: target.status },
      after: { role: args.role ?? target.role, status: args.status ?? target.status },
    })
    return target._id
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
    await appendAuditEvent(ctx, {
      companyId: company._id, actorId: actor.userId, actingCompanyId: company._id,
      entityType: 'company', entityId: company._id, action: 'company.closed',
      before: { status: company.status }, after: { status: 'closed' },
    })
    return company._id
  },
})
