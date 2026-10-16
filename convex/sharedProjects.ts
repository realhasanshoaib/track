import { assertProjectSnapshotWritable } from './lib/projectSnapshotLock'
import { resolveCompanyProjectParticipationRole } from '@track/shared/company'
import { v } from 'convex/values'

import { mutation, query } from './_generated/server'
import type { Id } from './_generated/dataModel'
import { appendAuditEvent } from './lib/audit'
import { decodeLegacyArchivedProject } from './lib/legacyArchiveSnapshot'
import { requireAuthenticatedActor } from './lib/actorContext'
import {
  requireActiveRelationshipParticipant,
  requireActiveCompanyMembership,
  requireCompanyAdmin,
  requireCompanyModelEnabled,
  requireCompanyProjectManager,
  resolveCompanyProjectAccess,
} from './lib/companyPolicy'
import {
  createInvitationToken,
  hashInvitationToken,
  invitationLifetimeMs,
} from './lib/companyInvitations'
import {
  bumpProjectParticipants,
  createCompanyProject,
  createCompanyProjectMembership,
  requireEligibleCompanyUser,
} from './lib/companyProjectLifecycle'

const initialMember = v.object({
  userId: v.id('users'),
  role: v.union(v.literal('manager'), v.literal('member')),
})

async function createProjectCompanyInvitations(
  ctx: Parameters<typeof createCompanyProject>[0],
  input: {
    projectId: Id<'projects'>
    invitingCompanyId: Id<'companies'>
    invitedBy: Id<'users'>
    targetCompanyIds: Array<Id<'companies'>>
    now: number
  },
) {
  const invitations = []
  for (const targetCompanyId of input.targetCompanyIds) {
    const token = createInvitationToken()
    const invitationId = await ctx.db.insert('projectCompanyInvitations', {
      projectId: input.projectId,
      targetCompanyId,
      invitingCompanyId: input.invitingCompanyId,
      invitedBy: input.invitedBy,
      tokenHash: await hashInvitationToken(token),
      status: 'pending',
      expiresAt: input.now + invitationLifetimeMs,
      createdAt: input.now,
      updatedAt: input.now,
    })
    invitations.push({ invitationId, targetCompanyId, token })
  }
  return invitations
}

export const listForActingCompany = query({
  args: { actingCompanyId: v.id('companies') },
  handler: async (ctx, args) => {
    requireCompanyModelEnabled()
    const actor = await requireAuthenticatedActor(ctx)
    await requireActiveCompanyMembership(ctx, actor, args.actingCompanyId)
    const projectMemberships = await ctx.db
      .query('projectMembers')
      .withIndex('by_user_company', (q) =>
        q.eq('userId', actor.userId).eq('companyId', args.actingCompanyId),
      )
      .collect()
    const represented = projectMemberships.filter((member) =>
      member.companyId === args.actingCompanyId &&
      (member.status === 'active' || member.status === 'archived'),
    )
    return await Promise.all(
      represented.map(async (membership) => {
        try {
          const access = await resolveCompanyProjectAccess(ctx, actor, {
            actingCompanyId: args.actingCompanyId,
            projectId: membership.projectId,
            projectMemberId: membership._id,
          })
          const owningCompanyId = access.entitlement
            ? access.entitlement.owningCompanyId
            : access.project.owningCompanyId
          let project = access.project
          if (access.entitlement) {
            const snapshot = decodeLegacyArchivedProject(access.entitlement.projectSnapshot)
            project = {
              ...access.project,
              name: snapshot.name,
              description: snapshot.description,
              owningCompanyId: access.entitlement.owningCompanyId,
            }
          }
          let owningCompany: {
            _id: Id<'companies'>
            displayName: string
          } | null = null
          if (access.entitlement?.owningCompanyId && access.entitlement.owningCompanyDisplayName) {
            owningCompany = {
              _id: access.entitlement.owningCompanyId,
              displayName: access.entitlement.owningCompanyDisplayName,
            }
          } else if (!access.entitlement && owningCompanyId) {
            const liveOwningCompany = await ctx.db.get(owningCompanyId)
            if (liveOwningCompany) {
              owningCompany = {
                _id: liveOwningCompany._id,
                displayName: liveOwningCompany.displayName,
              }
            }
          }
          return {
            project,
            membership: access.projectMember,
            representedCompanyId: args.actingCompanyId,
            owningCompany,
            participationRole: resolveCompanyProjectParticipationRole(
              owningCompanyId,
              args.actingCompanyId,
            ),
          }
        } catch {
          return null
        }
      }),
    ).then((items) => items.filter((item) => item !== null))
  },
})

export const getCollaborationOptions = query({
  args: {
    actingCompanyId: v.id('companies'),
    projectId: v.id('projects'),
    projectMemberId: v.id('projectMembers'),
  },
  handler: async (ctx, args) => {
    requireCompanyModelEnabled()
    const actor = await requireAuthenticatedActor(ctx)
    const access = await requireCompanyProjectManager(ctx, actor, args)
    if (access.project.owningCompanyId !== access.company._id) {
      throw new Error('owning_company_required')
    }
    if (access.project.status !== 'active' && access.project.status !== 'proposed') {
      throw new Error('project_unavailable')
    }

    const [projectCompanies, pendingInvitations, relationshipTerms] = await Promise.all([
      ctx.db
        .query('projectCompanies')
        .withIndex('by_project_status', (q) =>
          q.eq('projectId', access.project._id).eq('status', 'active'),
        )
        .collect(),
      ctx.db
        .query('projectCompanyInvitations')
        .withIndex('by_project_status', (q) =>
          q.eq('projectId', access.project._id).eq('status', 'pending'),
        )
        .collect(),
      ctx.db
        .query('relationshipCompanies')
        .withIndex('by_company_status', (q) =>
          q.eq('companyId', access.company._id).eq('status', 'active'),
        )
        .collect(),
    ])
    const unavailableCompanyIds = new Set([
      ...projectCompanies.map((participant) => participant.companyId),
      ...pendingInvitations.map((invitation) => invitation.targetCompanyId),
    ])
    const eligibleTerms = access.project.relationshipId
      ? relationshipTerms.filter((term) => term.relationshipId === access.project.relationshipId)
      : relationshipTerms
    const relationships = await Promise.all(
      eligibleTerms.map(async (term) => {
        const relationship = await ctx.db.get(term.relationshipId)
        if (!relationship || relationship.status !== 'active') return null
        const participants = await ctx.db
          .query('relationshipCompanies')
          .withIndex('by_relationship_status', (q) =>
            q.eq('relationshipId', relationship._id).eq('status', 'active'),
          )
          .collect()
        const companies = await Promise.all(
          participants.map(async (participant) => {
            if (unavailableCompanyIds.has(participant.companyId)) return null
            const company = await ctx.db.get(participant.companyId)
            if (!company || company.status !== 'active') return null
            return { _id: company._id, displayName: company.displayName }
          }),
        )
        return {
          relationship: { _id: relationship._id, name: relationship.name },
          companies: companies.filter((company) => company !== null),
        }
      }),
    )
    return {
      projectRelationshipId: access.project.relationshipId ?? null,
      relationships: relationships.filter((relationship) => relationship !== null),
      pendingInvitations: await Promise.all(
        pendingInvitations.map(async (invitation) => {
          const targetCompany = await ctx.db.get(invitation.targetCompanyId)
          return {
            invitation: {
              _id: invitation._id,
              targetCompanyId: invitation.targetCompanyId,
              status: invitation.status,
              expiresAt: invitation.expiresAt,
            },
            targetCompany: targetCompany
              ? {
                  _id: targetCompany._id,
                  displayName: targetCompany.displayName,
                }
              : null,
          }
        }),
      ),
    }
  },
})

export const createInternal = mutation({
  args: {
    actingCompanyId: v.id('companies'),
    name: v.string(),
    description: v.optional(v.string()),
    initialMembers: v.array(initialMember),
  },
  handler: async (ctx, args) => {
    requireCompanyModelEnabled()
    const actor = await requireAuthenticatedActor(ctx)
    const { company } = await requireCompanyAdmin(ctx, actor, args.actingCompanyId)
    if (!args.initialMembers.some((member) => member.role === 'manager')) {
      throw new Error('initial_manager_required')
    }
    for (const member of args.initialMembers) {
      await requireEligibleCompanyUser(ctx, company._id, member.userId)
    }
    const name = args.name.trim()
    if (!name) throw new Error('project_name_required')
    const { projectId } = await createCompanyProject(ctx, {
      name,
      description: args.description?.trim() || undefined,
      owningCompanyId: company._id,
      owningCompanyDisplayName: company.displayName,
      origin: 'single_company',
      status: 'active',
      createdBy: actor.userId,
      initialMembers: args.initialMembers,
    })
    await appendAuditEvent(ctx, {
      companyId: company._id,
      projectId,
      actorId: actor.userId,
      actingCompanyId: company._id,
      entityType: 'project',
      entityId: projectId,
      action: 'company_project.created',
      after: { name, owningCompanyId: company._id },
    })
    return { projectId }
  },
})

export const listInvitations = query({
  args: { actingCompanyId: v.id('companies') },
  handler: async (ctx, args) => {
    requireCompanyModelEnabled()
    const actor = await requireAuthenticatedActor(ctx)
    await requireCompanyAdmin(ctx, actor, args.actingCompanyId)
    const invitations = await ctx.db
      .query('projectCompanyInvitations')
      .withIndex('by_target_status', (q) => q.eq('targetCompanyId', args.actingCompanyId).eq('status', 'pending'))
      .collect()
    return await Promise.all(invitations.map(async (invitation) => {
      const [project, invitingCompany] = await Promise.all([
        ctx.db.get(invitation.projectId),
        ctx.db.get(invitation.invitingCompanyId),
      ])
      return {
        invitation,
        project: project ? { _id: project._id, name: project.name, description: project.description } : null,
        invitingCompany: invitingCompany ? { _id: invitingCompany._id, displayName: invitingCompany.displayName } : null,
      }
    }))
  },
})

export const propose = mutation({
  args: {
    actingCompanyId: v.id('companies'),
    relationshipId: v.id('relationships'),
    name: v.string(),
    description: v.optional(v.string()),
    initialMembers: v.array(initialMember),
    targetCompanyIds: v.array(v.id('companies')),
  },
  handler: async (ctx, args) => {
    requireCompanyModelEnabled()
    const actor = await requireAuthenticatedActor(ctx)
    const { company } = await requireCompanyAdmin(ctx, actor, args.actingCompanyId)
    await requireActiveRelationshipParticipant(ctx, args.relationshipId, company._id)
    const relationship = await ctx.db.get(args.relationshipId)
    if (!relationship || relationship.status !== 'active') throw new Error('relationship_unavailable')
    const targetCompanyIds = Array.from(new Set(args.targetCompanyIds)).filter((id) => id !== company._id)
    if (targetCompanyIds.length === 0) throw new Error('shared_project_target_required')
    for (const targetCompanyId of targetCompanyIds) {
      await requireActiveRelationshipParticipant(ctx, relationship._id, targetCompanyId)
      const targetCompany = await ctx.db.get(targetCompanyId)
      if (!targetCompany || targetCompany.status !== 'active') throw new Error('mapped_company_unavailable')
    }
    if (!args.initialMembers.some((member) => member.role === 'manager')) {
      throw new Error('initial_manager_required')
    }
    for (const member of args.initialMembers) {
      await requireEligibleCompanyUser(ctx, company._id, member.userId)
    }
    const name = args.name.trim()
    if (!name) throw new Error('project_name_required')
    const now = Date.now()
    const { projectId } = await createCompanyProject(ctx, {
      name,
      description: args.description?.trim() || undefined,
      relationshipId: relationship._id,
      owningCompanyId: company._id,
      owningCompanyDisplayName: company.displayName,
      proposingCompanyId: company._id,
      origin: 'shared',
      status: 'proposed',
      createdBy: actor.userId,
      initialMembers: args.initialMembers,
    })
    const invitations = await createProjectCompanyInvitations(ctx, {
        projectId,
        invitingCompanyId: company._id,
        invitedBy: actor.userId,
      targetCompanyIds,
      now,
      })
    await appendAuditEvent(ctx, {
      companyId: company._id,
      relationshipId: relationship._id,
      projectId,
      actorId: actor.userId,
      actingCompanyId: company._id,
      entityType: 'project',
      entityId: projectId,
      action: 'shared_project.proposed',
      after: { name, targetCompanyIds },
    })
    return { projectId, invitations }
  },
})

export const inviteCompanies = mutation({
  args: {
    actingCompanyId: v.id('companies'),
    projectId: v.id('projects'),
    projectMemberId: v.id('projectMembers'),
    relationshipId: v.id('relationships'),
    targetCompanyIds: v.array(v.id('companies')),
  },
  handler: async (ctx, args) => {
    requireCompanyModelEnabled()
    const actor = await requireAuthenticatedActor(ctx)
    const access = await requireCompanyProjectManager(ctx, actor, args)
    await assertProjectSnapshotWritable(ctx, args.projectId)
    if (access.project.owningCompanyId !== access.company._id) {
      throw new Error('owning_company_required')
    }
    if (access.project.status !== 'active' && access.project.status !== 'proposed') {
      throw new Error('project_unavailable')
    }
    if (access.project.relationshipId && access.project.relationshipId !== args.relationshipId) {
      throw new Error('project_relationship_conflict')
    }
    await requireActiveRelationshipParticipant(ctx, args.relationshipId, access.company._id)
    const relationship = await ctx.db.get(args.relationshipId)
    if (!relationship || relationship.status !== 'active') throw new Error('relationship_unavailable')
    const targetCompanyIds = Array.from(new Set(args.targetCompanyIds)).filter(
      (companyId) => companyId !== access.company._id,
    )
    if (targetCompanyIds.length === 0) throw new Error('shared_project_target_required')
    const [activeParticipants, pendingInvitations] = await Promise.all([
      ctx.db
        .query('projectCompanies')
        .withIndex('by_project_status', (q) => q.eq('projectId', access.project._id).eq('status', 'active'))
        .collect(),
      ctx.db
        .query('projectCompanyInvitations')
        .withIndex('by_project_status', (q) => q.eq('projectId', access.project._id).eq('status', 'pending'))
        .collect(),
    ])
    for (const targetCompanyId of targetCompanyIds) {
      await requireActiveRelationshipParticipant(ctx, relationship._id, targetCompanyId)
      const targetCompany = await ctx.db.get(targetCompanyId)
      if (!targetCompany || targetCompany.status !== 'active') {
        throw new Error('mapped_company_unavailable')
      }
      if (activeParticipants.some((participant) => participant.companyId === targetCompanyId)) {
        throw new Error('company_already_participating')
      }
      if (pendingInvitations.some((invitation) => invitation.targetCompanyId === targetCompanyId)) {
        throw new Error('company_invitation_pending')
      }
    }
    const now = Date.now()
    const invitations = await createProjectCompanyInvitations(ctx, {
      projectId: access.project._id,
      invitingCompanyId: access.company._id,
      invitedBy: actor.userId,
      targetCompanyIds,
      now,
    })
    await ctx.db.patch(access.project._id, {
      relationshipId: relationship._id,
      origin: 'shared',
      revision: (access.project.revision ?? 0) + 1,
      updatedAt: now,
    })
    await appendAuditEvent(ctx, {
      companyId: access.company._id,
      relationshipId: relationship._id,
      projectId: access.project._id,
      actorId: actor.userId,
      actingCompanyId: access.company._id,
      entityType: 'project',
      entityId: access.project._id,
      action: 'project_company.invited',
      after: { targetCompanyIds },
    })
    return { invitations }
  },
})

export const decideInvitation = mutation({
  args: {
    actingCompanyId: v.id('companies'),
    invitationId: v.id('projectCompanyInvitations'),
    decision: v.union(v.literal('accept'), v.literal('decline')),
    initialMembers: v.array(initialMember),
  },
  handler: async (ctx, args) => {
    requireCompanyModelEnabled()
    const actor = await requireAuthenticatedActor(ctx)
    const { company } = await requireCompanyAdmin(ctx, actor, args.actingCompanyId)
    const invitation = await ctx.db.get(args.invitationId)
    if (!invitation || invitation.targetCompanyId !== company._id || invitation.status !== 'pending') {
      return invitation?._id ?? null
    }
    const now = Date.now()
    if (invitation.expiresAt <= now) {
      await ctx.db.patch(invitation._id, { status: 'expired', updatedAt: now })
      throw new Error('invitation_expired')
    }
    if (args.decision === 'decline') {
      await ctx.db.patch(invitation._id, { status: 'declined', decidedBy: actor.userId, decidedAt: now, updatedAt: now })
      return invitation._id
    }
    if (!args.initialMembers.some((member) => member.role === 'manager')) throw new Error('initial_manager_required')
    const [project, invitingCompany] = await Promise.all([
      ctx.db.get(invitation.projectId),
      ctx.db.get(invitation.invitingCompanyId),
    ])
    if (
      !project ||
      !project.relationshipId ||
      project.accessProfile !== 'company' ||
      (project.status !== 'proposed' && project.status !== 'active') ||
      !invitingCompany ||
      invitingCompany.status !== 'active'
    ) throw new Error('project_unavailable')
    await requireActiveRelationshipParticipant(ctx, project.relationshipId, company._id)
    for (const member of args.initialMembers) await requireEligibleCompanyUser(ctx, company._id, member.userId)
    const terms = await ctx.db
      .query('projectCompanies')
      .withIndex('by_project_company_term', (q) => q.eq('projectId', project._id).eq('companyId', company._id))
      .collect()
    let projectCompany = terms.find((term) => term.status === 'active')
    if (!projectCompany) {
      const projectCompanyId = await ctx.db.insert('projectCompanies', {
        projectId: project._id,
        companyId: company._id,
        term: Math.max(0, ...terms.map((term) => term.term)) + 1,
        status: 'active',
        acceptedBy: actor.userId,
        acceptedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      projectCompany = (await ctx.db.get(projectCompanyId)) ?? undefined
    }
    if (!projectCompany) throw new Error('project_participation_failed')
    for (const member of args.initialMembers) {
      await createCompanyProjectMembership(ctx, {
        projectId: project._id,
        projectCompanyId: projectCompany._id,
        companyId: company._id,
        companyDisplayName: company.displayName,
        userId: member.userId,
        role: member.role,
        invitedBy: actor.userId,
      })
    }
    await ctx.db.patch(invitation._id, { status: 'accepted', decidedBy: actor.userId, decidedAt: now, updatedAt: now })
    const participants = await ctx.db
      .query('projectCompanies')
      .withIndex('by_project_status', (q) => q.eq('projectId', project._id).eq('status', 'active'))
      .collect()
    await bumpProjectParticipants(ctx, project._id, now)
    if (participants.length >= 2 && project.status === 'proposed') {
      await ctx.db.patch(project._id, { status: 'active', updatedAt: now })
    }
    return invitation._id
  },
})

export const listMembers = query({
  args: {
    projectId: v.id('projects'),
    actingCompanyId: v.id('companies'),
    projectMemberId: v.id('projectMembers'),
  },
  handler: async (ctx, args) => {
    requireCompanyModelEnabled()
    const actor = await requireAuthenticatedActor(ctx)
    await requireCompanyProjectManager(ctx, actor, args)
    const memberships = (await ctx.db
      .query('projectMembers')
      .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
      .collect())
      .filter((membership) => membership.companyId === args.actingCompanyId && membership.status !== 'removed')
    return await Promise.all(memberships.map(async (membership) => {
      const user = await ctx.db.get(membership.userId)
      return { membership, user: user ? { _id: user._id, displayName: user.displayName } : null }
    }))
  },
})

export const addMember = mutation({
  args: {
    projectId: v.id('projects'),
    actingCompanyId: v.id('companies'),
    projectMemberId: v.id('projectMembers'),
    userId: v.id('users'),
    role: v.union(v.literal('manager'), v.literal('member')),
  },
  handler: async (ctx, args) => {
    requireCompanyModelEnabled()
    const actor = await requireAuthenticatedActor(ctx)
    const access = await requireCompanyProjectManager(ctx, actor, args)
    await assertProjectSnapshotWritable(ctx, args.projectId)
    return (await createCompanyProjectMembership(ctx, {
      projectId: access.project._id,
      projectCompanyId: access.projectCompany._id,
      companyId: access.company._id,
      companyDisplayName: access.company.displayName,
      userId: args.userId,
      role: args.role,
      invitedBy: actor.userId,
    }))._id
  },
})

export const updateMember = mutation({
  args: {
    projectId: v.id('projects'),
    actingCompanyId: v.id('companies'),
    projectMemberId: v.id('projectMembers'),
    targetProjectMemberId: v.id('projectMembers'),
    role: v.optional(v.union(v.literal('manager'), v.literal('member'))),
    status: v.optional(v.union(v.literal('active'), v.literal('suspended'), v.literal('removed'))),
  },
  handler: async (ctx, args) => {
    requireCompanyModelEnabled()
    const actor = await requireAuthenticatedActor(ctx)
    await requireCompanyProjectManager(ctx, actor, args)
    await assertProjectSnapshotWritable(ctx, args.projectId)
    const target = await ctx.db.get(args.targetProjectMemberId)
    if (!target || target.projectId !== args.projectId || target.companyId !== args.actingCompanyId) {
      throw new Error('project_member_unavailable')
    }
    const removesManager = target.role === 'manager' && (args.role === 'member' || args.status === 'suspended' || args.status === 'removed')
    if (removesManager) {
      const managers = await ctx.db
        .query('projectMembers')
        .withIndex('by_project_company_status', (q) =>
          q.eq('projectId', args.projectId).eq('companyId', args.actingCompanyId).eq('status', 'active'),
        )
        .collect()
      if (managers.filter((manager) => manager.role === 'manager').length <= 1) throw new Error('last_project_manager')
      const stewardMemberships = await ctx.db
        .query('groupMembers')
        .withIndex('by_project_member_status', (q) =>
          q.eq('projectMemberId', target._id).eq('status', 'active'))
        .collect()
      for (const stewardMembership of stewardMemberships.filter((item) => item.isSteward)) {
        const channelMemberships = await ctx.db
          .query('groupMembers')
          .withIndex('by_group', (q) => q.eq('groupId', stewardMembership.groupId))
          .collect()
        const otherCompanyMembers = await Promise.all(channelMemberships
          .filter((item) => item.status === 'active' && item.projectMemberId !== target._id)
          .map(async (item) => (item.projectMemberId ? await ctx.db.get(item.projectMemberId) : null)),
        )
        const representedAfterChange =
          (args.status !== 'suspended' && args.status !== 'removed') ||
          otherCompanyMembers.some((member) => member?.companyId === args.actingCompanyId && member.status === 'active')
        const replacementExists = await Promise.all(channelMemberships
          .filter((item) => item.status === 'active' && item.isSteward && item.projectMemberId !== target._id)
          .map(async (item) => (item.projectMemberId ? await ctx.db.get(item.projectMemberId) : null)),
        )
          .then((members) => members.some((member) =>
            member?.companyId === args.actingCompanyId && member.status === 'active' && member.role === 'manager',
          ))
        if (representedAfterChange && !replacementExists) throw new Error('last_channel_steward')
      }
    }
    if (target.status === 'removed' && args.status === 'active') {
      throw new Error('project_member_reinvite_required')
    }
    const now = Date.now()
    await ctx.db.patch(target._id, {
      role: args.role ?? target.role,
      status: args.status ?? target.status,
      endedAt: args.status === 'removed' ? now : args.status === 'active' ? undefined : target.endedAt,
      updatedAt: now,
    })
    if (target.role === 'manager' && args.role === 'member') {
      const stewardMemberships = await ctx.db
        .query('groupMembers')
        .withIndex('by_project_member_status', (q) =>
          q.eq('projectMemberId', target._id).eq('status', 'active'))
        .collect()
      await Promise.all(stewardMemberships.filter((membership) => membership.isSteward).map((membership) =>
        ctx.db.patch(membership._id, { isSteward: false, updatedAt: now })),
      )
    }
    if (args.status === 'removed' || args.status === 'suspended') {
      const channels = await ctx.db
        .query('groupMembers')
        .withIndex('by_project_member_status', (q) => q.eq('projectMemberId', target._id).eq('status', 'active'))
        .collect()
      await Promise.all(channels.map((membership) =>
        ctx.db.patch(membership._id, {
          status: args.status === 'suspended' ? 'suspended' : 'removed',
          endedAt: now,
          updatedAt: now,
        }),
      ))
    } else if (args.status === 'active' && target.status === 'suspended') {
      const channels = await ctx.db
        .query('groupMembers')
        .withIndex('by_project_member_status', (q) => q.eq('projectMemberId', target._id).eq('status', 'suspended'))
        .collect()
      await Promise.all(channels.map((membership) =>
        ctx.db.patch(membership._id, { status: 'active', endedAt: undefined, updatedAt: now }),
      ))
    }
    return target._id
  },
})
