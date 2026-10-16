import { convexTest } from 'convex-test'
import type { TestConvex } from 'convex-test'
import { register as registerRateLimiter } from '@convex-dev/rate-limiter/test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from './_generated/api'
import type { Id } from './_generated/dataModel'
import schema from './schema'

const modules = (import.meta as ImportMeta & {
  glob: (patterns: Array<string>) => Record<string, () => Promise<unknown>>
}).glob(['./**/*.{ts,js}', '!./**/*.test.{ts,js}'])

type TestBackend = TestConvex<typeof schema>
const scheduledTestBackends: Array<TestBackend> = []

beforeEach(() => {
  vi.stubEnv('TRACK_COMPANY_MODEL_ENABLED', 'true')
})

afterEach(async () => {
  try {
    const backends = scheduledTestBackends.splice(0)
    if (backends.length === 0) return
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    await Promise.all(backends.map((t) => t.finishInProgressScheduledFunctions()))
  } finally {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  }
})

describe('Company model authorization and lifecycle', () => {
  it('keeps Company project order and excludes unrelated and denied memberships', async () => {
    const t = convexTest(schema, modules)
    const owner = await seedUser(t, 'cost-company-owner')
    const a = await createCompany(t, owner, 'Cost A', 'cost-a')
    const b = await createCompany(t, owner, 'Cost B', 'cost-b')
    const first = await seedCompanyProject(t, owner, a, 'First')
    const other = await seedCompanyProject(t, owner, b, 'Other')
    const denied = await seedCompanyProject(t, owner, a, 'Denied')
    const last = await seedCompanyProject(t, owner, a, 'Last')
    await seedLegacyProject(t, owner)
    await t.run(async (ctx) => {
      const participation = await ctx.db.query('projectCompanies')
        .withIndex('by_project_company_term', (q) => q.eq('projectId', denied)).first()
      if (!participation) throw new Error('fixture_participation_missing')
      await ctx.db.patch(participation._id, { status: 'exited' })
    })
    const actor = asUser(t, owner)
    const listed = await actor.query(api.sharedProjects.listForActingCompany, { actingCompanyId: a })
    expect(listed.map(({ project }) => project._id)).toEqual([first, last])
    expect(listed.every((row) => row.representedCompanyId === a && row.membership.companyId === a)).toBe(true)
    expect((await actor.query(api.sharedProjects.listForActingCompany, { actingCompanyId: b }))
      .map(({ project }) => project._id)).toEqual([other])
    await t.run(async (ctx) => {
      const member = await ctx.db.query('companyMembers')
        .withIndex('by_company_user', (q) => q.eq('companyId', a).eq('userId', owner)).unique()
      if (!member) throw new Error('fixture_company_member_missing')
      await ctx.db.patch(member._id, { status: 'suspended' })
    })
    await expect(actor.query(api.sharedProjects.listForActingCompany, { actingCompanyId: a }))
      .rejects.toThrow('company_unavailable')
  })

  it('enforces invitation and Project lifecycle transitions', async () => {
    {
      const t = convexTest(schema, modules)
      const owner = await seedUser(t, 'closing-owner')
      const targetOwner = await seedUser(t, 'closing-target-owner')
      const companyId = await createCompany(t, owner, 'Closing Company', 'closing-company')
      const targetCompanyId = await createCompany(t, targetOwner, 'Closing Target', 'closing-target')
      const now = Date.now()
      const invitationIds = await t.run(async (ctx) => {
        const relationshipId = await ctx.db.insert('relationships', {
          name: 'Unaccepted Relationship', status: 'forming', createdBy: owner,
          createdByCompanyId: companyId, participantRevision: 0, revision: 1,
          createdAt: now, updatedAt: now,
        })
        const relationshipInvitationId = await ctx.db.insert('relationshipInvitations', {
          relationshipId, targetCompanyId, invitingCompanyId: companyId, invitedBy: owner,
          tokenHash: 'closing-relationship-invitation', status: 'pending', expiresAt: now + 60_000,
          createdAt: now, updatedAt: now,
        })
        const projectId = await ctx.db.insert('projects', {
          accessProfile: 'company', createdAt: now, createdBy: owner, name: 'Unaccepted Project',
          origin: 'shared', participantRevision: 0, revision: 1, status: 'proposed', updatedAt: now,
        })
        const projectInvitationId = await ctx.db.insert('projectCompanyInvitations', {
          projectId, targetCompanyId, invitingCompanyId: companyId, invitedBy: owner,
          tokenHash: 'closing-project-invitation', status: 'pending', expiresAt: now + 60_000,
          createdAt: now, updatedAt: now,
        })
        return { projectInvitationId, relationshipInvitationId }
      })
      await asUser(t, owner).mutation(api.companies.close, { companyId, retentionConfirmed: true })
      const closed = await t.run(async (ctx) => ({
        company: await ctx.db.get(companyId),
        projectInvitation: await ctx.db.get(invitationIds.projectInvitationId),
        relationshipInvitation: await ctx.db.get(invitationIds.relationshipInvitationId),
      }))
      expect(closed.company?.status).toBe('closed')
      expect(closed.projectInvitation?.status).toBe('revoked')
      expect(closed.relationshipInvitation?.status).toBe('revoked')
    }
    {
      const { a, aCompany, b, bCompany, projectId, t } = await seedSharedProject()
      const now = Date.now()
      const invitationId = await t.run(async (ctx) => {
        await ctx.db.patch(projectId, { status: 'archived', updatedAt: now })
        return await ctx.db.insert('projectCompanyInvitations', {
          projectId, targetCompanyId: bCompany, invitingCompanyId: aCompany, invitedBy: a,
          tokenHash: 'archived-project-invitation', status: 'pending', expiresAt: now + 60_000,
          createdAt: now, updatedAt: now,
        })
      })
      await expect(asUser(t, b).mutation(api.sharedProjects.decideInvitation, {
        actingCompanyId: bCompany, decision: 'accept', initialMembers: [{ role: 'manager', userId: b }], invitationId,
      })).rejects.toThrow('project_unavailable')
    }
  })

  it('enforces suspension and Channel steward invariants', async () => {
    const t = convexTest(schema, modules)
    const owner = await seedUser(t, 'owner')
    const companyId = await createCompany(t, owner, 'Recovery Company', 'recovery-company')
    const actor = asUser(t, owner)

    await actor.mutation(api.companies.setSuspended, { companyId, suspended: true })
    await expect(actor.query(api.mobile.listProjects, { actingCompanyId: companyId, userId: owner })).rejects.toThrow('company_unavailable')
    await expect(actor.query(api.sharedProjects.listForActingCompany, { actingCompanyId: companyId })).rejects.toThrow('company_unavailable')

    vi.stubEnv('TRACK_COMPANY_MODEL_ENABLED', 'false')
    await expect(actor.mutation(api.companies.setSuspended, { companyId, suspended: false }))
      .rejects.toThrow('company_model_disabled')
    vi.stubEnv('TRACK_COMPANY_MODEL_ENABLED', 'true')
    await actor.mutation(api.companies.setSuspended, { companyId, suspended: false })
    {
      const { a, aCompany, projectId, t } = await seedSharedProject()
      const replacement = await seedUser(t, 'company-a-project-manager')
      await addCompanyMember(t, aCompany, replacement)
      const memberships = await t.run(async (ctx) => await ctx.db
        .query('projectMembers').withIndex('by_project', (q) => q.eq('projectId', projectId)).collect())
      const original = memberships.find((membership) => membership.companyId === aCompany)!
      const replacementMembershipId = await asUser(t, a).mutation(api.sharedProjects.addMember, {
        actingCompanyId: aCompany, projectId, projectMemberId: original._id,
        role: 'manager', userId: replacement,
      })
      await asUser(t, a).mutation(api.sharedProjects.updateMember, {
        actingCompanyId: aCompany, projectId, projectMemberId: original._id,
        role: 'member', targetProjectMemberId: original._id,
      })
      const channelMemberships = await t.run(async (ctx) => await ctx.db
        .query('groupMembers')
        .withIndex('by_project_member_status', (q) => q.eq('projectMemberId', original._id).eq('status', 'active')).collect())
      const replacementChannels = await t.run(async (ctx) => await ctx.db
        .query('groupMembers')
        .withIndex('by_project_member_status', (q) => q.eq('projectMemberId', replacementMembershipId).eq('status', 'active')).collect())
      expect(channelMemberships.every((membership) => !membership.isSteward)).toBe(true)
      expect(replacementChannels.some((membership) => membership.isSteward)).toBe(true)
    }
    {
      const { a, aCompany, projectId, t } = await seedSharedProject()
      const projectMember = (await t.run(async (ctx) => ctx.db
        .query('projectMembers')
        .withIndex('by_project_company_status', (q) => q.eq('projectId', projectId).eq('companyId', aCompany).eq('status', 'active'))
        .first()))!
      const channelMembership = (await t.run(async (ctx) => ctx.db
        .query('groupMembers')
        .withIndex('by_project_member_status', (q) => q.eq('projectMemberId', projectMember._id).eq('status', 'active'))
        .first()))!
      await expect(asUser(t, a).mutation(api.channels.updateOwnCompanyMember, {
        actingCompanyId: aCompany, projectId, groupId: channelMembership.groupId,
        projectMemberId: projectMember._id, targetProjectMemberId: projectMember._id,
        active: true, steward: false,
      })).rejects.toThrow('last_channel_steward')
    }
  })

  it('keeps Project and Channel archive votes scoped and revision-safe', async () => {
    const { a, aCompany, b, bCompany, projectId, t } = await seedSharedProject()
    const memberships = await t.run(async (ctx) => await ctx.db.query('projectMembers').withIndex('by_project', (q) => q.eq('projectId', projectId)).collect())
    const aMembership = memberships.find((membership) => membership.companyId === aCompany)!
    const bMembership = memberships.find((membership) => membership.companyId === bCompany)!
    const requestId = await asUser(t, a).mutation(api.projectArchives.request, {
      actingCompanyId: aCompany,
      idempotencyKey: 'archive-1',
      operation: 'archive',
      projectId,
      projectMemberId: aMembership._id,
    })

    await asUser(t, a).mutation(api.projectArchives.approve, {
      actingCompanyId: aCompany,
      projectId,
      projectMemberId: aMembership._id,
      requestId,
    })
    expect((await t.run(async (ctx) => await ctx.db.get(projectId)))?.status).toBe('archive_pending')

    await t.run(async (ctx) => {
      const project = await ctx.db.get(projectId)
      await ctx.db.patch(projectId, { participantRevision: (project?.participantRevision ?? 0) + 1 })
    })
    await asUser(t, b).mutation(api.projectArchives.approve, {
      actingCompanyId: bCompany,
      projectId,
      projectMemberId: bMembership._id,
      requestId,
    })
    expect((await t.run(async (ctx) => await ctx.db.get(requestId)))?.status).toBe('stale')
    {
      const { a, aCompany, projectId, t } = await seedSharedProject()
      const membership = (await t.run(async (ctx) => await ctx.db
        .query('projectMembers')
        .withIndex('by_project_company_status', (q) => q.eq('projectId', projectId).eq('companyId', aCompany).eq('status', 'active'))
        .collect()))[0]
      const actor = asUser(t, a)
      const firstChannelId = await actor.mutation(api.channels.create, {
        actingCompanyId: aCompany, name: 'First private Channel', ownCompanyMemberIds: [membership._id],
        projectId, projectMemberId: membership._id,
      })
      const secondChannelId = await actor.mutation(api.channels.create, {
        actingCompanyId: aCompany, name: 'Second private Channel', ownCompanyMemberIds: [membership._id],
        projectId, projectMemberId: membership._id,
      })
      const requestId = await actor.mutation(api.channels.requestArchive, {
        actingCompanyId: aCompany, groupId: firstChannelId, idempotencyKey: 'channel-archive-1',
        operation: 'archive', projectId, projectMemberId: membership._id,
      })
      expect(await actor.mutation(api.channels.requestArchive, {
        actingCompanyId: aCompany, groupId: firstChannelId, idempotencyKey: 'channel-archive-1',
        operation: 'archive', projectId, projectMemberId: membership._id,
      })).toBe(requestId)
      await expect(actor.mutation(api.channels.approveArchive, {
        actingCompanyId: aCompany, groupId: secondChannelId, projectId,
        projectMemberId: membership._id, requestId,
      })).rejects.toThrow('channel_archive_request_scope_mismatch')
      await actor.mutation(api.channels.cancelArchive, {
        actingCompanyId: aCompany, groupId: firstChannelId, projectId,
        projectMemberId: membership._id, requestId,
      })
      const cancelled = await t.run(async (ctx) => ({
        channel: await ctx.db.get(firstChannelId), request: await ctx.db.get(requestId),
      }))
      expect(cancelled.channel?.status).toBe('active')
      expect(cancelled.request?.status).toBe('cancelled')
    }
    {
      const { a, aCompany, b, bCompany, projectId, t } = await seedSharedProject()
      const memberships = await t.run(async (ctx) => await ctx.db.query('projectMembers')
        .withIndex('by_project', (q) => q.eq('projectId', projectId)).collect())
      const aMembership = memberships.find((membership) => membership.companyId === aCompany)!
      const bMembership = memberships.find((membership) => membership.companyId === bCompany)!
      const actor = asUser(t, a)
      const groupId = await actor.mutation(api.channels.create, {
        actingCompanyId: aCompany, name: 'Changing participants', ownCompanyMemberIds: [aMembership._id],
        projectId, projectMemberId: aMembership._id,
      })
      const participationRequestId = await actor.mutation(api.channels.requestParticipation, {
        actingCompanyId: aCompany, groupId, idempotencyKey: 'invite-company-b', projectId,
        projectMemberId: aMembership._id, selectedProjectMemberIds: [bMembership._id],
        targetProjectCompanyId: bMembership.projectCompanyId!,
      })
      const archiveRequestId = await actor.mutation(api.channels.requestArchive, {
        actingCompanyId: aCompany, groupId, idempotencyKey: 'archive-before-company-b-joins',
        operation: 'archive', projectId, projectMemberId: aMembership._id,
      })
      await asUser(t, b).mutation(api.channels.decideParticipation, {
        actingCompanyId: bCompany, decision: 'accept', groupId, projectId,
        projectMemberId: bMembership._id, requestId: participationRequestId,
        selectedProjectMemberIds: [bMembership._id],
      })
      const state = await t.run(async (ctx) => ({
        channel: await ctx.db.get(groupId), request: await ctx.db.get(archiveRequestId),
      }))
      expect(state.channel).toMatchObject({ revision: 2, status: 'active' })
      expect(state.request?.status).toBe('stale')
    }
  })

  it('creates an internal Company Project without exposing legacy Projects', async () => {
    const t = convexTest(schema, modules)
    const owner = await seedUser(t, 'internal-project-owner')
    const member = await seedUser(t, 'internal-project-member')
    const companyId = await createCompany(t, owner, 'Internal Company', 'internal-company')
    await addCompanyMember(t, companyId, member)
    const actor = asUser(t, owner)
    const { projectId } = await actor.mutation(api.sharedProjects.createInternal, {
      actingCompanyId: companyId,
      name: 'Internal Launch',
      description: 'Company-only work before collaboration',
      initialMembers: [
        { userId: owner, role: 'manager' },
        { userId: member, role: 'member' },
      ],
    })
    const state = await t.run(async (ctx) => {
      const project = await ctx.db.get(projectId)
      const projectMembers = await ctx.db
        .query('projectMembers')
        .withIndex('by_project', (q) => q.eq('projectId', projectId))
        .collect()
      const groups = await ctx.db
        .query('groups')
        .withIndex('by_project', (q) => q.eq('projectId', projectId))
        .collect()
      return { project, projectMembers, groups }
    })
    expect(state.project).toMatchObject({
      accessProfile: 'company',
      origin: 'single_company',
      owningCompanyId: companyId,
      status: 'active',
    })
    expect(state.projectMembers).toHaveLength(2)
    expect(state.groups).toHaveLength(1)
    const ownerProjectMember = state.projectMembers.find((projectMember) => projectMember.userId === owner)
    const general = state.groups[0]
    if (!ownerProjectMember || !general) throw new Error('internal_project_fixture_failed')
    const channelMembers = await actor.query(api.groups.listMembers, {
      groupId: general._id,
      userId: owner,
      actingCompanyId: companyId,
      projectMemberId: ownerProjectMember._id,
    })
    expect(channelMembers).toHaveLength(2)
    expect(channelMembers.every(({ membership }) => membership.projectMemberId)).toBe(true)
    await expect(
      actor.query(api.groups.listMembers, {
        groupId: general._id,
        userId: owner,
        actingCompanyId: companyId,
      }),
    ).rejects.toThrow('represented_context_required')

    const { projectId: legacyProjectId } = await seedLegacyProject(t, owner)
    const listed = await actor.query(api.sharedProjects.listForActingCompany, {
      actingCompanyId: companyId,
    })
    expect(listed).toHaveLength(1)
    expect(listed[0]).toMatchObject({
      representedCompanyId: companyId,
      participationRole: 'owner',
      owningCompany: { _id: companyId, displayName: 'Internal Company' },
      project: { _id: projectId },
    })
    expect(listed.some(({ project }) => project._id === legacyProjectId)).toBe(false)
  })

  it('scopes Project collaboration options for owning-Company managers', async () => {
    const t = convexTest(schema, modules)
    registerRateLimiter(t)
    const owner = await seedUser(t, 'collaboration-options-owner')
    const manager = await seedUser(t, 'collaboration-options-manager')
    const b = await seedUser(t, 'collaboration-options-b')
    const c = await seedUser(t, 'collaboration-options-c')
    const d = await seedUser(t, 'collaboration-options-d')
    const ownerCompany = await createCompany(t, owner, 'Collaboration Options Owner', 'collaboration-options-owner')
    const bCompany = await createCompany(t, b, 'Collaboration Options B', 'collaboration-options-b')
    const cCompany = await createCompany(t, c, 'Collaboration Options C', 'collaboration-options-c')
    const dCompany = await createCompany(t, d, 'Unrelated Company', 'unrelated-company')
    await addCompanyMember(t, ownerCompany, manager)
    const relationshipB = await asUser(t, owner).mutation(api.relationships.create, {
      actingCompanyId: ownerCompany,
      name: 'Options Relationship B',
      targetCompanyId: bCompany,
    })
    const relationshipC = await asUser(t, owner).mutation(api.relationships.create, {
      actingCompanyId: ownerCompany,
      name: 'Options Relationship C',
      targetCompanyId: cCompany,
    })
    await Promise.all([
      asUser(t, b).mutation(api.relationships.decideInvitation, {
        actingCompanyId: bCompany,
        decision: 'accept',
        invitationId: relationshipB.invitationId,
      }),
      asUser(t, c).mutation(api.relationships.decideInvitation, {
        actingCompanyId: cCompany,
        decision: 'accept',
        invitationId: relationshipC.invitationId,
      }),
    ])
    const { projectId } = await asUser(t, owner).mutation(api.sharedProjects.createInternal, {
      actingCompanyId: ownerCompany,
      name: 'Collaboration Options Project',
      initialMembers: [
        { userId: owner, role: 'member' },
        { userId: manager, role: 'manager' },
      ],
    })
    const projectMembers = await t.run(
      async (ctx) =>
        await ctx.db
          .query('projectMembers')
          .withIndex('by_project', (q) => q.eq('projectId', projectId))
          .collect(),
    )
    const ownerProjectMember = projectMembers.find((member) => member.userId === owner)
    const managerProjectMember = projectMembers.find((member) => member.userId === manager)
    if (!ownerProjectMember || !managerProjectMember) {
      throw new Error('collaboration_options_project_members_missing')
    }

    await expect(
      asUser(t, owner).query(api.sharedProjects.getCollaborationOptions, {
        actingCompanyId: ownerCompany,
        projectId,
        projectMemberId: ownerProjectMember._id,
      }),
    ).rejects.toThrow('project_manager_required')
    const unboundOptions = await asUser(t, manager).query(api.sharedProjects.getCollaborationOptions, {
      actingCompanyId: ownerCompany,
      projectId,
      projectMemberId: managerProjectMember._id,
    })
    expect(unboundOptions.projectRelationshipId).toBeNull()
    expect(unboundOptions.pendingInvitations).toEqual([])
    expect(unboundOptions.relationships).toEqual(
      expect.arrayContaining([
        {
          relationship: {
            _id: relationshipB.relationshipId,
            name: 'Options Relationship B',
          },
          companies: [{ _id: bCompany, displayName: 'Collaboration Options B' }],
        },
        {
          relationship: {
            _id: relationshipC.relationshipId,
            name: 'Options Relationship C',
          },
          companies: [{ _id: cCompany, displayName: 'Collaboration Options C' }],
        },
      ]),
    )
    expect(
      unboundOptions.relationships.flatMap((item) => item.companies).some((company) => company._id === dCompany),
    ).toBe(false)

    const invited = await asUser(t, manager).mutation(api.sharedProjects.inviteCompanies, {
      actingCompanyId: ownerCompany,
      projectId,
      projectMemberId: managerProjectMember._id,
      relationshipId: relationshipB.relationshipId,
      targetCompanyIds: [bCompany],
    })
    const pendingOptions = await asUser(t, manager).query(api.sharedProjects.getCollaborationOptions, {
      actingCompanyId: ownerCompany,
      projectId,
      projectMemberId: managerProjectMember._id,
    })
    expect(pendingOptions).toMatchObject({
      projectRelationshipId: relationshipB.relationshipId,
      relationships: [
        {
          relationship: {
            _id: relationshipB.relationshipId,
            name: 'Options Relationship B',
          },
          companies: [],
        },
      ],
      pendingInvitations: [
        {
          invitation: {
            _id: invited.invitations[0].invitationId,
            targetCompanyId: bCompany,
            status: 'pending',
          },
          targetCompany: {
            _id: bCompany,
            displayName: 'Collaboration Options B',
          },
        },
      ],
    })
    await asUser(t, b).mutation(api.sharedProjects.decideInvitation, {
      actingCompanyId: bCompany,
      decision: 'accept',
      initialMembers: [{ userId: b, role: 'manager' }],
      invitationId: invited.invitations[0].invitationId,
    })
    const acceptedOptions = await asUser(t, manager).query(api.sharedProjects.getCollaborationOptions, {
      actingCompanyId: ownerCompany,
      projectId,
      projectMemberId: managerProjectMember._id,
    })
    expect(acceptedOptions.relationships[0]?.companies).toEqual([])
    expect(acceptedOptions.pendingInvitations).toEqual([])
  })

  it('lets only the owning Company add collaborators to an internal Project', async () => {
    const t = convexTest(schema, modules)
    registerRateLimiter(t)
    const a = await seedUser(t, 'internal-owner-a')
    const b = await seedUser(t, 'internal-owner-b')
    const aCompany = await createCompany(t, a, 'Internal A', 'internal-a')
    const bCompany = await createCompany(t, b, 'Collaborator B', 'collaborator-b')
    const relationship = await asUser(t, a).mutation(api.relationships.create, {
      actingCompanyId: aCompany,
      name: 'Internal collaboration',
      targetCompanyId: bCompany,
    })
    await asUser(t, b).mutation(api.relationships.decideInvitation, {
      actingCompanyId: bCompany,
      decision: 'accept',
      invitationId: relationship.invitationId,
    })
    const { projectId } = await asUser(t, a).mutation(api.sharedProjects.createInternal, {
      actingCompanyId: aCompany,
      name: 'Start private',
      initialMembers: [{ userId: a, role: 'manager' }],
    })
    const aProjectMember = await t.run(
      async (ctx) =>
        await ctx.db
          .query('projectMembers')
          .withIndex('by_project_user', (q) => q.eq('projectId', projectId).eq('userId', a))
          .unique(),
    )
    if (!aProjectMember) throw new Error('owner_project_member_missing')
    const invited = await asUser(t, a).mutation(api.sharedProjects.inviteCompanies, {
      actingCompanyId: aCompany,
      projectId,
      projectMemberId: aProjectMember._id,
      relationshipId: relationship.relationshipId,
      targetCompanyIds: [bCompany],
    })
    expect(invited.invitations).toHaveLength(1)
    await expect(
      asUser(t, a).mutation(api.sharedProjects.inviteCompanies, {
        actingCompanyId: aCompany,
        projectId,
        projectMemberId: aProjectMember._id,
        relationshipId: relationship.relationshipId,
        targetCompanyIds: [bCompany],
      }),
    ).rejects.toThrow('company_invitation_pending')
    await asUser(t, b).mutation(api.sharedProjects.decideInvitation, {
      actingCompanyId: bCompany,
      decision: 'accept',
      initialMembers: [{ userId: b, role: 'manager' }],
      invitationId: invited.invitations[0].invitationId,
    })
    const bProjectMember = await t.run(
      async (ctx) =>
        await ctx.db
          .query('projectMembers')
          .withIndex('by_project_user', (q) => q.eq('projectId', projectId).eq('userId', b))
          .unique(),
    )
    if (!bProjectMember) throw new Error('collaborator_project_member_missing')
    await expect(
      asUser(t, b).mutation(api.projectOwnership.request, {
        actingCompanyId: bCompany,
        projectId,
        projectMemberId: bProjectMember._id,
        proposedOwningCompanyId: bCompany,
        idempotencyKey: 'collaborator-cannot-take-ownership',
      }),
    ).rejects.toThrow('owning_company_required')
    await expect(
      asUser(t, b).mutation(api.sharedProjects.inviteCompanies, {
        actingCompanyId: bCompany,
        projectId,
        projectMemberId: bProjectMember._id,
        relationshipId: relationship.relationshipId,
        targetCompanyIds: [aCompany],
      }),
    ).rejects.toThrow('owning_company_required')
    const [ownerList, collaboratorList] = await Promise.all([
      asUser(t, a).query(api.sharedProjects.listForActingCompany, {
        actingCompanyId: aCompany,
      }),
      asUser(t, b).query(api.sharedProjects.listForActingCompany, {
        actingCompanyId: bCompany,
      }),
    ])
    expect(ownerList[0]?.participationRole).toBe('owner')
    expect(collaboratorList[0]).toMatchObject({
      participationRole: 'collaborator',
      owningCompany: { _id: aCompany, displayName: 'Internal A' },
    })
  })

  it('assigns missing ownership only with revision-bound participant confirmation', async () => {
    {
      const t = convexTest(schema, modules)
      const owner = await seedUser(t, 'single-owner-confirmation')
      const manager = await seedUser(t, 'single-manager-without-company-admin')
      const companyId = await createCompany(t, owner, 'Single Participant', 'single-participant')
      await addCompanyMember(t, companyId, manager)
      const projectId = await seedCompanyProject(t, owner, companyId, 'Unassigned Single')
      const ownerProjectMember = await t.run(
        async (ctx) =>
          await ctx.db
            .query('projectMembers')
            .withIndex('by_project_user', (q) => q.eq('projectId', projectId).eq('userId', owner))
            .unique(),
      )
      if (!ownerProjectMember) throw new Error('owner_project_member_missing')
      const managerProjectMemberId = await asUser(t, owner).mutation(api.sharedProjects.addMember, {
        actingCompanyId: companyId,
        projectId,
        projectMemberId: ownerProjectMember._id,
        role: 'manager',
        userId: manager,
      })
      await expect(
        asUser(t, manager).mutation(api.projectOwnership.request, {
          actingCompanyId: companyId,
          projectId,
          projectMemberId: managerProjectMemberId,
          proposedOwningCompanyId: companyId,
          idempotencyKey: 'manager-without-company-admin',
        }),
      ).rejects.toThrow('company_admin_required')
      await asUser(t, owner).mutation(api.projectOwnership.request, {
        actingCompanyId: companyId,
        projectId,
        projectMemberId: ownerProjectMember._id,
        proposedOwningCompanyId: companyId,
        idempotencyKey: 'single-owner-confirmation',
      })
      expect(await t.run(async (ctx) => (await ctx.db.get(projectId))?.owningCompanyId)).toBe(companyId)
    }
    {
      const t = convexTest(schema, modules)
      const a = await seedUser(t, 'ownership-vote-a')
      const b = await seedUser(t, 'ownership-vote-b')
      const aCompany = await createCompany(t, a, 'Ownership A', 'ownership-a')
      const bCompany = await createCompany(t, b, 'Ownership B', 'ownership-b')
      const fixture = await seedUnownedSharedProject(t, a, aCompany, b, bCompany)
      const initialState = await asUser(t, a).query(api.projectOwnership.getState, {
        actingCompanyId: aCompany,
        projectId: fixture.projectId,
        projectMemberId: fixture.aProjectMemberId,
      })
      expect(initialState.request).toBeNull()
      expect(initialState.proposedOwningCompany).toBeNull()
      expect(initialState.participants).toHaveLength(2)
      expect(initialState.approvals).toEqual([])
      const requestId = await asUser(t, a).mutation(api.projectOwnership.request, {
        actingCompanyId: aCompany,
        projectId: fixture.projectId,
        projectMemberId: fixture.aProjectMemberId,
        proposedOwningCompanyId: bCompany,
        idempotencyKey: 'multi-company-owner-confirmation',
      })
      expect(await t.run(async (ctx) => (await ctx.db.get(fixture.projectId))?.owningCompanyId)).toBeFalsy()
      const pending = await asUser(t, b).query(api.projectOwnership.getState, {
        actingCompanyId: bCompany,
        projectId: fixture.projectId,
        projectMemberId: fixture.bProjectMemberId,
      })
      expect(pending?.participants).toHaveLength(2)
      expect(pending?.approvals).toHaveLength(1)
      expect(pending?.proposedOwningCompany?._id).toBe(bCompany)
      await asUser(t, b).mutation(api.projectOwnership.decide, {
        actingCompanyId: bCompany,
        projectId: fixture.projectId,
        projectMemberId: fixture.bProjectMemberId,
        requestId,
        decision: 'approve',
      })
      expect(await t.run(async (ctx) => (await ctx.db.get(fixture.projectId))?.owningCompanyId)).toBe(bCompany)
    }
    {
      const t = convexTest(schema, modules)
      const a = await seedUser(t, 'ownership-stale-a')
      const b = await seedUser(t, 'ownership-stale-b')
      const aCompany = await createCompany(t, a, 'Stale A', 'stale-a')
      const bCompany = await createCompany(t, b, 'Stale B', 'stale-b')
      const fixture = await seedUnownedSharedProject(t, a, aCompany, b, bCompany)
      const requestId = await asUser(t, a).mutation(api.projectOwnership.request, {
        actingCompanyId: aCompany,
        projectId: fixture.projectId,
        projectMemberId: fixture.aProjectMemberId,
        proposedOwningCompanyId: aCompany,
        idempotencyKey: 'stale-owner-confirmation',
      })
      await t.run(async (ctx) => {
        const project = await ctx.db.get(fixture.projectId)
        if (!project) throw new Error('project_missing')
        await ctx.db.patch(project._id, { participantRevision: 3 })
      })
      await asUser(t, b).mutation(api.projectOwnership.decide, {
        actingCompanyId: bCompany,
        projectId: fixture.projectId,
        projectMemberId: fixture.bProjectMemberId,
        requestId,
        decision: 'approve',
      })
      const result = await t.run(async (ctx) => ({
        project: await ctx.db.get(fixture.projectId),
        request: await ctx.db.get(requestId),
      }))
      expect(result.project?.owningCompanyId).toBeFalsy()
      expect(result.request?.status).toBe('stale')
    }
  })

  it('attributes the final ownership approval and preserves archived ownership context', async () => {
    const { a, aCompany, b, bCompany, projectId, relationshipId, t } = await seedSharedProject()
    scheduledTestBackends.push(t)
    const c = await seedUser(t, 'company-c-owner')
    const cCompany = await createCompany(t, c, 'Company C', 'company-c')
    const relationshipInvitation = await asUser(t, a).mutation(api.relationships.inviteCompany, {
      actingCompanyId: aCompany,
      relationshipId,
      targetCompanyId: cCompany,
    })
    await asUser(t, c).mutation(api.relationships.decideInvitation, {
      actingCompanyId: cCompany,
      decision: 'accept',
      invitationId: relationshipInvitation.invitationId,
    })
    const initialMemberships = await t.run(async (ctx) => await ctx.db
      .query('projectMembers')
      .withIndex('by_project', (q) => q.eq('projectId', projectId))
      .collect())
    const aProjectMember = initialMemberships.find((member) => member.companyId === aCompany)
    const bProjectMember = initialMemberships.find((member) => member.companyId === bCompany)
    if (!aProjectMember || !bProjectMember) throw new Error('ownership_snapshot_members_missing')
    const projectInvitation = await asUser(t, a).mutation(api.sharedProjects.inviteCompanies, {
      actingCompanyId: aCompany,
      projectId,
      projectMemberId: aProjectMember._id,
      relationshipId,
      targetCompanyIds: [cCompany],
    })
    await asUser(t, c).mutation(api.sharedProjects.decideInvitation, {
      actingCompanyId: cCompany,
      decision: 'accept',
      initialMembers: [{ userId: c, role: 'manager' }],
      invitationId: projectInvitation.invitations[0].invitationId,
    })
    const cProjectMember = await t.run(async (ctx) => await ctx.db
      .query('projectMembers')
      .withIndex('by_project_user', (q) => q.eq('projectId', projectId).eq('userId', c))
      .unique())
    if (!cProjectMember) throw new Error('ownership_snapshot_third_member_missing')

    const transferToB = await asUser(t, a).mutation(api.projectOwnership.request, {
      actingCompanyId: aCompany,
      idempotencyKey: 'ownership-a-to-b-before-exit',
      projectId,
      projectMemberId: aProjectMember._id,
      proposedOwningCompanyId: bCompany,
    })
    await asUser(t, b).mutation(api.projectOwnership.decide, {
      actingCompanyId: bCompany,
      decision: 'approve',
      projectId,
      projectMemberId: bProjectMember._id,
      requestId: transferToB,
    })
    await asUser(t, c).mutation(api.projectOwnership.decide, {
      actingCompanyId: cCompany,
      decision: 'approve',
      projectId,
      projectMemberId: cProjectMember._id,
      requestId: transferToB,
    })
    const assignmentAudit = await t.run(async (ctx) => (await ctx.db
      .query('auditEvents')
      .withIndex('by_project_created_at', (q) => q.eq('projectId', projectId))
      .collect()).find((event) => event.action === 'project_ownership.assigned'))
    expect(assignmentAudit).toMatchObject({
      actingCompanyId: cCompany,
      actorId: c,
      companyId: bCompany,
    })

    await runWithScheduledFunctions(t, async () => await asUser(t, a).mutation(api.projectExit.prepare, {
      actingCompanyId: aCompany,
      projectId,
    }))
    await runWithScheduledFunctions(t, async () => await asUser(t, a).mutation(api.projectExit.finalize, {
      actingCompanyId: aCompany,
      projectId,
    }))

    const transferToC = await asUser(t, b).mutation(api.projectOwnership.request, {
      actingCompanyId: bCompany,
      idempotencyKey: 'ownership-b-to-c-after-a-exit',
      projectId,
      projectMemberId: bProjectMember._id,
      proposedOwningCompanyId: cCompany,
    })
    await asUser(t, c).mutation(api.projectOwnership.decide, {
      actingCompanyId: cCompany,
      decision: 'approve',
      projectId,
      projectMemberId: cProjectMember._id,
      requestId: transferToC,
    })
    await asUser(t, b).mutation(api.companies.updateProfile, {
      companyId: bCompany,
      displayName: 'Renamed Company B',
    })
    const archivedProjects = await asUser(t, a).query(api.sharedProjects.listForActingCompany, {
      actingCompanyId: aCompany,
    })
    expect(await t.run(async (ctx) => await ctx.db.get(projectId))).toMatchObject({
      owningCompanyId: cCompany,
    })
    expect(archivedProjects).toHaveLength(1)
    expect(archivedProjects[0]).toMatchObject({
      owningCompany: { _id: bCompany, displayName: 'Company B' },
      participationRole: 'collaborator',
      project: {
        _id: projectId,
        owningCompanyId: bCompany,
      },
    })
    await t.run(async (ctx) => {
      const entitlement = await ctx.db
        .query('projectArchiveEntitlements')
        .withIndex('by_member', (q) => q.eq('projectMemberId', aProjectMember._id))
        .unique()
      if (!entitlement) throw new Error('ownership_snapshot_entitlement_missing')
      await ctx.db.patch(entitlement._id, {
        owningCompanyId: undefined,
        owningCompanyDisplayName: undefined,
      })
    })
    const legacyArchive = await asUser(t, a).query(api.sharedProjects.listForActingCompany, {
      actingCompanyId: aCompany,
    })
    expect(legacyArchive[0]?.owningCompany).toBeNull()
    expect(legacyArchive[0]?.participationRole).toBe('unassigned_legacy')
    expect(legacyArchive[0]?.project.owningCompanyId).toBeUndefined()
  })

  it('blocks an already-prepared owning Company exit while another participant remains', async () => {
    const { a, aCompany, projectId, t } = await seedSharedProject()
    await t.run(async (ctx) => {
      const ownerParticipation = (
        await ctx.db
          .query('projectCompanies')
          .withIndex('by_project_status', (q) => q.eq('projectId', projectId).eq('status', 'active'))
          .collect()
      ).find((participation) => participation.companyId === aCompany)
      if (!ownerParticipation) throw new Error('owner_participation_missing')
      await ctx.db.patch(ownerParticipation._id, {
        status: 'exit_pending',
        updatedAt: Date.now(),
      })
    })
    await expect(
      asUser(t, a).mutation(api.projectExit.finalize, {
        actingCompanyId: aCompany,
        projectId,
      }),
    ).rejects.toThrow('project_ownership_transfer_required')
  })

  it('validates legacy-to-Company migration mappings and drift', async () => {
    const t = convexTest(schema, modules)
    registerRateLimiter(t)
    const owner = await seedUser(t, 'upgrade-owner')
    const member = await seedUser(t, 'upgrade-member')
    const companyId = await createCompany(t, owner, 'Upgrade Company', 'upgrade-company')
    await addCompanyMember(t, companyId, member)
    const { groupId, projectId } = await seedLegacyProject(t, owner, member)
    const memberships = await t.run(async (ctx) => await ctx.db.query('projectMembers').withIndex('by_project', (q) => q.eq('projectId', projectId)).collect())
    const before = await t.run(async (ctx) => (await ctx.db.query('groupMembers').withIndex('by_group', (q) => q.eq('groupId', groupId)).collect()).map((row) => row.userId).sort())
    const actor = asUser(t, owner)
    const upgradeId = await actor.mutation(api.companyMigration.initiate, {
      idempotencyKey: 'upgrade-1',
      initiatingCompanyId: companyId,
      mappings: memberships.map((membership) => ({
        companyId,
        neutralRole: membership.userId === owner ? ('manager' as const) : ('member' as const),
        projectMemberId: membership._id,
      })),
      projectId,
    })
    await actor.mutation(api.companyMigration.activate, { upgradeId })

    const after = await t.run(async (ctx) => {
      const project = await ctx.db.get(projectId)
      const groupMembers = await ctx.db.query('groupMembers').withIndex('by_group', (q) => q.eq('groupId', groupId)).collect()
      return { project, groupMembers }
    })
    expect(after.project).toMatchObject({ accessProfile: 'company', origin: 'single_company',
      owningCompanyId: companyId,
      status: 'active' })
    expect(after.groupMembers.map((row) => row.userId).sort()).toEqual(before)
    expect(after.groupMembers.every((row) => row.projectMemberId && row.status === 'active')).toBe(true)
    {
      const t = convexTest(schema, modules)
      const owner = await seedUser(t, 'drift-owner')
      const member = await seedUser(t, 'drift-member')
      const companyId = await createCompany(t, owner, 'Drift Company', 'drift-company')
      await addCompanyMember(t, companyId, member)
      const { groupId, projectId } = await seedLegacyProject(t, owner, member)
      const memberships = await t.run(async (ctx) => await ctx.db.query('projectMembers')
        .withIndex('by_project', (q) => q.eq('projectId', projectId)).collect())
      const actor = asUser(t, owner)
      const upgradeId = await actor.mutation(api.companyMigration.initiate, {
        idempotencyKey: 'upgrade-drift', initiatingCompanyId: companyId,
        mappings: memberships.map((membership) => ({
          companyId,
          neutralRole: membership.userId === owner ? ('manager' as const) : ('member' as const),
          projectMemberId: membership._id,
        })), projectId,
      })
      await t.run(async (ctx) => {
        const channelMember = (await ctx.db.query('groupMembers').withIndex('by_group', (q) => q.eq('groupId', groupId)).collect())[0]
        await ctx.db.patch(channelMember._id, { isSteward: true, updatedAt: Date.now() + 1 })
      })
      await expect(actor.mutation(api.companyMigration.activate, { upgradeId }))
        .rejects.toThrow('upgrade_source_changed')
    }
    {
      const t = convexTest(schema, modules)
      const owner = await seedUser(t, 'company-drift-owner')
      const member = await seedUser(t, 'company-drift-member')
      const companyId = await createCompany(t, owner, 'Company Drift', 'company-drift')
      await addCompanyMember(t, companyId, member)
      const { projectId } = await seedLegacyProject(t, owner, member)
      const memberships = await t.run(async (ctx) => await ctx.db.query('projectMembers')
        .withIndex('by_project', (q) => q.eq('projectId', projectId)).collect())
      const actor = asUser(t, owner)
      const upgradeId = await actor.mutation(api.companyMigration.initiate, {
        idempotencyKey: 'upgrade-company-drift', initiatingCompanyId: companyId,
        mappings: memberships.map((membership) => ({
          companyId,
          neutralRole: membership.userId === owner ? ('manager' as const) : ('member' as const),
          projectMemberId: membership._id,
        })), projectId,
      })
      await t.run(async (ctx) => {
        const companyMembership = await ctx.db.query('companyMembers')
          .withIndex('by_company_user', (q) => q.eq('companyId', companyId).eq('userId', member)).unique()
        const now = Date.now()
        await ctx.db.patch(companyMembership!._id, { status: 'removed', endedAt: now, updatedAt: now })
      })
      await expect(actor.mutation(api.companyMigration.activate, { upgradeId }))
        .rejects.toThrow('mapped_company_member_unavailable')
    }
  })

  it('requires forwarding confirmation when a same-Company destination adds people', async () => {
    const { a, aCompany, b, bCompany, projectId, t } = await seedSharedProject()
    scheduledTestBackends.push(t)
    const extraRecipient = await seedUser(t, 'forward-extra-recipient')
    await addCompanyMember(t, bCompany, extraRecipient)
    const initialMembers = await t.run(async (ctx) => ctx.db
      .query('projectMembers')
      .withIndex('by_project', (q) => q.eq('projectId', projectId))
      .collect())
    const aMember = initialMembers.find((member) => member.companyId === aCompany)!
    const bMember = initialMembers.find((member) => member.companyId === bCompany)!
    const extraMemberId = await asUser(t, b).mutation(api.sharedProjects.addMember, {
      actingCompanyId: bCompany,
      projectId,
      projectMemberId: bMember._id,
      role: 'member',
      userId: extraRecipient,
    })
    const { sourceGroupId, targetGroupId } = await t.run(async (ctx) => {
      const now = Date.now()
      const sourceGroupId = await ctx.db.insert('groups', {
        createdAt: now, createdBy: a, kind: 'custom', name: 'Source audience',
        projectId, revision: 1, status: 'active', updatedAt: now,
      })
      const targetGroupId = await ctx.db.insert('groups', {
        createdAt: now, createdBy: a, kind: 'custom', name: 'Expanded audience',
        projectId, revision: 1, status: 'active', updatedAt: now,
      })
      for (const [groupId, members] of [
        [sourceGroupId, [aMember, bMember]],
        [targetGroupId, [aMember, bMember, { ...bMember, _id: extraMemberId, userId: extraRecipient }]],
      ] as const) {
        for (const member of members) await ctx.db.insert('groupMembers', {
          createdAt: now,
          groupId,
          isSteward: member._id === aMember._id,
          projectId,
          projectMemberId: member._id,
          status: 'active',
          updatedAt: now,
          userId: member.userId,
        })
      }
      return { sourceGroupId, targetGroupId }
    })
    const sourceMessageId = await asUser(t, a).mutation(api.messages.send, {
      actingCompanyId: aCompany,
      authorId: a,
      body: 'Share only after confirming the additional person.',
      groupId: sourceGroupId,
      idempotencyKey: 'member-expansion-source',
      projectId,
      projectMemberId: aMember._id,
    })
    const forwardArgs = {
      actingCompanyId: aCompany,
      actorId: a,
      idempotencyKey: 'member-expansion-forward',
      projectId,
      projectMemberId: aMember._id,
      sourceMessageId,
      targetGroupId,
    }
    await expect(asUser(t, a).mutation(api.messages.forwardMessage, forwardArgs))
      .rejects.toThrow('audience_expansion_confirmation_required')
    await expect(asUser(t, a).mutation(api.messages.forwardMessage, {
      ...forwardArgs,
      audienceExpansionConfirmed: true,
    })).resolves.toBeDefined()
  })

  it('retries attachment preservation idempotently without crossing represented scope', async () => {
    const { a, aCompany, b, bCompany, projectId, t } = await seedSharedProject()
    const state = await t.run(async (ctx) => ({
      group: await ctx.db
        .query('groups')
        .withIndex('by_project', (q) => q.eq('projectId', projectId))
        .first(),
      memberships: await ctx.db
        .query('projectMembers')
        .withIndex('by_project', (q) => q.eq('projectId', projectId))
        .collect(),
    }))
    const aProjectMember = state.memberships.find((membership) => membership.companyId === aCompany)
    const bProjectMember = state.memberships.find((membership) => membership.companyId === bCompany)
    if (!state.group || !aProjectMember || !bProjectMember) {
      throw new Error('attachment_retry_fixture_failed')
    }
    const firstMessageId = await asUser(t, a).mutation(api.messages.send, {
      actingCompanyId: aCompany,
      authorId: a,
      body: 'Attach once',
      groupId: state.group._id,
      idempotencyKey: 'attachment-retry-first-message',
      projectId,
      projectMemberId: aProjectMember._id,
    })
    const secondMessageId = await asUser(t, a).mutation(api.messages.send, {
      actingCompanyId: aCompany,
      authorId: a,
      body: 'Different message',
      groupId: state.group._id,
      idempotencyKey: 'attachment-retry-second-message',
      projectId,
      projectMemberId: aProjectMember._id,
    })
    const representedMessageId = await asUser(t, b).mutation(api.messages.send, {
      actingCompanyId: bCompany,
      authorId: b,
      body: 'Different represented Company',
      groupId: state.group._id,
      idempotencyKey: 'attachment-retry-represented-message',
      projectId,
      projectMemberId: bProjectMember._id,
    })
    const storageId = await t.run(async (ctx) => await ctx.storage.store(new Blob(['retry-safe attachment'])))
    const uploadIntent = await asUser(t, a).mutation(api.messages.generateUploadUrl, {
      actingCompanyId: aCompany,
      contentType: 'text/plain',
      filename: 'retry.txt',
      groupId: state.group._id,
      intentKey: 'attachment-retry-upload',
      kind: 'file',
      projectMemberId: aProjectMember._id,
      size: 21,
      userId: a,
    })
    await asUser(t, a).mutation(api.messages.claimUploadIntent, {
      actingCompanyId: aCompany,
      intentId: uploadIntent.intentId,
      projectMemberId: aProjectMember._id,
      storageId,
      userId: a,
    })
    const attachmentArgs = {
      actingCompanyId: aCompany,
      contentType: 'text/plain',
      filename: 'retry.txt',
      groupId: state.group._id,
      kind: 'file' as const,
      messageId: firstMessageId,
      projectId,
      projectMemberId: aProjectMember._id,
      size: 21,
      storageId,
      uploadIntentId: uploadIntent.intentId,
      userId: a,
    }
    const attachmentId = await asUser(t, a).mutation(api.messages.attachFile, attachmentArgs)
    expect(await asUser(t, a).mutation(api.messages.attachFile, attachmentArgs)).toBe(attachmentId)
    const attachedMessage = await t.run(async (ctx) => await ctx.db.get(firstMessageId))
    expect(attachedMessage?.attachmentIds).toEqual([attachmentId])
    await expect(
      asUser(t, a).mutation(api.messages.attachFile, {
        ...attachmentArgs,
        messageId: secondMessageId,
      }),
    ).rejects.toThrow('upload_intent_not_ready')
    await expect(
      asUser(t, b).mutation(api.messages.attachFile, {
        ...attachmentArgs,
        actingCompanyId: bCompany,
        messageId: representedMessageId,
        projectMemberId: bProjectMember._id,
        userId: b,
      }),
    ).rejects.toThrow('upload_intent_scope_mismatch')
    const crossAuthorStorageId = await t.run(async (ctx) =>
      await ctx.storage.store(new Blob(['b'], { type: 'text/plain' })),
    )
    await expect(
      asUser(t, a).mutation(api.messages.attachFile, {
        ...attachmentArgs,
        filename: 'cross-author.txt',
        messageId: representedMessageId,
        size: 1,
        storageId: crossAuthorStorageId,
      }),
    ).rejects.toThrow('attachment_author_mismatch')
    const mismatchedMetadataStorageId = await t.run(async (ctx) =>
      await ctx.storage.store(new Blob(['metadata'], { type: 'text/plain' })),
    )
    await expect(
      asUser(t, a).mutation(api.messages.attachFile, {
        ...attachmentArgs,
        filename: 'metadata.txt',
        messageId: secondMessageId,
        size: 999,
        storageId: mismatchedMetadataStorageId,
      }),
    ).rejects.toThrow('upload_intent_storage_mismatch')
  })

  it('requires a verified exit snapshot, creates exact archives, and terminally archives after the last exit', async () => {
    const { a, aCompany, b, bCompany, projectId, t } = await seedSharedProject()
    scheduledTestBackends.push(t)
    const initialMemberships = await t.run(async (ctx) => await ctx.db
      .query('projectMembers')
      .withIndex('by_project', (q) => q.eq('projectId', projectId))
      .collect())
    const aInitialMembership = initialMemberships.find((membership) => membership.companyId === aCompany)!
    const bInitialMembership = initialMemberships.find((membership) => membership.companyId === bCompany)!
    const groupId = await t.run(async (ctx) => (await ctx.db
      .query('groups')
      .withIndex('by_project', (q) => q.eq('projectId', projectId))
      .first())!._id)
    await asUser(t, a).mutation(api.messages.send, {
      authorId: a,
      body: 'Snapshot this focused source.',
      groupId,
      idempotencyKey: 'exit-message',
      projectId,
      actingCompanyId: aCompany,
      projectMemberId: aInitialMembership._id,
    })
    const ownershipTransferRequestId = await asUser(t, a).mutation(api.projectOwnership.request, {
      actingCompanyId: aCompany,
      projectId,
      projectMemberId: aInitialMembership._id,
      proposedOwningCompanyId: bCompany,
      idempotencyKey: 'transfer-before-owner-exit',
    })
    await asUser(t, b).mutation(api.projectOwnership.decide, {
      actingCompanyId: bCompany,
      projectId,
      projectMemberId: bInitialMembership._id,
      requestId: ownershipTransferRequestId,
      decision: 'approve',
    })
    expect(await t.run(async (ctx) => (await ctx.db.get(projectId))?.owningCompanyId)).toBe(bCompany)
    const archiveRequestId = await asUser(t, a).mutation(api.projectArchives.request, {
      actingCompanyId: aCompany,
      idempotencyKey: 'archive-before-exit',
      operation: 'archive',
      projectId,
      projectMemberId: aInitialMembership._id,
    })
    await runWithScheduledFunctions(t, async () => {
      const prepared = await asUser(t, a).mutation(api.projectExit.prepare, { actingCompanyId: aCompany, projectId })
      expect(await asUser(t, a).mutation(api.projectExit.prepare, { actingCompanyId: aCompany, projectId })).toBe(prepared)
      expect(await asUser(t, a).query(api.projectExit.getStatus, {
        actingCompanyId: aCompany,
        projectId,
        projectMemberId: aInitialMembership._id,
      })).toMatchObject({ status: 'exit_pending' })
      expect((await t.run(async (ctx) => await ctx.db.get(archiveRequestId)))?.status).toBe('stale')
      await expect(asUser(t, a).mutation(api.projectExit.finalize, { actingCompanyId: aCompany, projectId })).rejects.toThrow('exit_snapshot_not_verified')
    })
    const postCutoffMember = await seedUser(t, 'post-cutoff-project-member')
    await addCompanyMember(t, bCompany, postCutoffMember)
    await t.run(async (ctx) => {
      const now = Date.now()
      const [company, user] = await Promise.all([
        ctx.db.get(bCompany),
        ctx.db.get(postCutoffMember)])
      await ctx.db.patch(a, { displayName: 'Live author after exit', updatedAt: now })
      await ctx.db.patch(aInitialMembership._id, {
        role: 'member',
        userDisplayNameSnapshot: 'Live author after exit',
        updatedAt: now,
      })
      await ctx.db.insert('projectMembers', {
        projectId,
        projectCompanyId: bInitialMembership.projectCompanyId,
        companyId: bCompany,
        userId: postCutoffMember,
        role: 'member',
        status: 'active',
        term: 1,
        invitedBy: b,
        userDisplayNameSnapshot: user!.displayName,
        companyDisplayNameSnapshot: company!.displayName,
        createdAt: now,
        updatedAt: now,
      })
    })
    await runWithScheduledFunctions(t, async () => await asUser(t, a).mutation(api.projectExit.finalize, {
      actingCompanyId: aCompany,
      projectId,
    }))

    const firstExit = await t.run(async (ctx) => {
      const project = await ctx.db.get(projectId)
      const aMember = (await ctx.db.query('projectMembers').withIndex('by_project', (q) => q.eq('projectId', projectId)).collect()).find((member) => member.companyId === aCompany)
      const entitlement = aMember ? await ctx.db.query('projectArchiveEntitlements').withIndex('by_member', (q) => q.eq('projectMemberId', aMember._id)).unique() : null
      const operationId = entitlement?.snapshotOperationId
      const archiveRows = operationId
        ? await ctx.db.query('projectExitSnapshotStaging')
            .withIndex('by_operation', (q) => q.eq('operationId', operationId))
            .collect()
        : []
      return { archiveRows, aMember, entitlement, project }
    })
    expect(firstExit.project?.status).toBe('active')
    expect(firstExit.aMember?.status).toBe('archived')
    expect(firstExit.entitlement).toMatchObject({ channelCount: 1, visibilityStatus: 'active' })
    expect(firstExit.archiveRows.filter((row) => row.scope === 'member')).toHaveLength(2)
    const replacementOwner = await seedUser(t, 'company-a-replacement-owner')
    await addCompanyMember(t, aCompany, replacementOwner, 'owner')
    const formerOwnerMembership = await t.run(async (ctx) => await ctx.db
      .query('companyMembers')
      .withIndex('by_company_user', (q) => q.eq('companyId', aCompany).eq('userId', a))
      .unique())
    await asUser(t, replacementOwner).mutation(api.companies.updateMember, {
      companyId: aCompany,
      companyMemberId: formerOwnerMembership!._id,
      status: 'removed',
    })
    expect((await t.run(async (ctx) => await ctx.db.get(firstExit.entitlement!._id)))?.retentionStatus).toBe('revoked')
    await asUser(t, replacementOwner).mutation(api.companies.updateMember, {
      companyId: aCompany,
      companyMemberId: formerOwnerMembership!._id,
      status: 'active',
    })
    await asUser(t, replacementOwner).mutation(api.companies.updateMember, {
      companyId: aCompany,
      companyMemberId: formerOwnerMembership!._id,
      role: 'member',
    })
    await runWithScheduledFunctions(t, async () => await asUser(t, b).mutation(api.projectExit.prepare, {
      actingCompanyId: bCompany,
      projectId,
    }))
    await runWithScheduledFunctions(t, async () => await asUser(t, b).mutation(api.projectExit.finalize, {
      actingCompanyId: bCompany,
      projectId,
    }))
    expect(await t.run(async (ctx) => await ctx.db.get(projectId))).toMatchObject({
      archiveReason: 'no_active_participants',
      status: 'archived',
    })
  })
})

async function seedUser(t: TestBackend, subject: string) {
  const now = Date.now()
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', {
      createdAt: now,
      displayName: subject,
      email: `${subject}@example.test`,
      googleSubject: subject,
      normalizedEmail: `${subject}@example.test`,
      twoFactorEnabled: false,
      updatedAt: now,
    })
    await ctx.db.patch(userId, { authUserId: String(userId) })
    return userId
  })
}

function asUser(t: TestBackend, userId: Id<'users'>) {
  return t.withIdentity({ subject: String(userId) })
}

async function createCompany(t: TestBackend, userId: Id<'users'>, displayName: string, handle: string) {
  return await asUser(t, userId).mutation(api.companies.create, { displayName, handle })
}

async function addCompanyMember(
  t: TestBackend,
  companyId: Id<'companies'>,
  userId: Id<'users'>,
  role: 'owner' | 'admin' | 'member' = 'member',
) {
  const now = Date.now()
  await t.run(async (ctx) => {
    const [company, user] = await Promise.all([ctx.db.get(companyId), ctx.db.get(userId)])
    await ctx.db.insert('companyMembers', {
      companyId,
      companyDisplayNameSnapshot: company!.displayName,
      createdAt: now,
      role,
      status: 'active',
      updatedAt: now,
      userDisplayNameSnapshot: user!.displayName,
      userId,
    })
  })
}

async function seedLegacyProject(t: TestBackend, ownerId: Id<'users'>, memberId?: Id<'users'>) {
  const now = Date.now()
  return await t.run(async (ctx) => {
    const projectId = await ctx.db.insert('projects', { createdAt: now, createdBy: ownerId, name: 'Legacy', revision: 1, updatedAt: now })
    const groupId = await ctx.db.insert('groups', { createdAt: now, createdBy: ownerId, kind: 'general', name: 'General', projectId, updatedAt: now })
    const users = memberId ? [ownerId, memberId] : [ownerId]
    for (const userId of users) {
      await ctx.db.insert('projectMembers', { createdAt: now, projectId, role: userId === ownerId ? 'owner' : 'staff', updatedAt: now, userId })
      await ctx.db.insert('groupMembers', { createdAt: now, groupId, projectId, updatedAt: now, userId })
    }
    return { groupId, projectId }
  })
}

async function seedCompanyProject(t: TestBackend, userId: Id<'users'>, companyId: Id<'companies'>, name: string) {
  const now = Date.now()
  return await t.run(async (ctx) => {
    const projectId = await ctx.db.insert('projects', {
      accessProfile: 'company', createdAt: now, createdBy: userId, name, origin: 'single_company',
      participantRevision: 1, revision: 1, status: 'active', updatedAt: now,
    })
    const projectCompanyId = await ctx.db.insert('projectCompanies', {
      acceptedAt: now, acceptedBy: userId, companyId, createdAt: now, projectId, status: 'active', term: 1, updatedAt: now,
    })
    const projectMemberId = await ctx.db.insert('projectMembers', {
      companyDisplayNameSnapshot: name, companyId, createdAt: now, projectCompanyId, projectId,
      role: 'manager', status: 'active', term: 1, updatedAt: now, userDisplayNameSnapshot: name, userId,
    })
    const groupId = await ctx.db.insert('groups', { createdAt: now, createdBy: userId, kind: 'general', name: 'General', projectId, revision: 1, status: 'active', updatedAt: now })
    await ctx.db.insert('groupMembers', { createdAt: now, groupId, isSteward: true, projectId, projectMemberId, status: 'active', updatedAt: now, userId })
    return projectId
  })
}

async function seedUnownedSharedProject(
  t: TestBackend,
  a: Id<'users'>,
  aCompany: Id<'companies'>,
  b: Id<'users'>,
  bCompany: Id<'companies'>,
) {
  const now = Date.now()
  return await t.run(async (ctx) => {
    const projectId = await ctx.db.insert('projects', {
      accessProfile: 'company',
      createdAt: now,
      createdBy: a,
      name: 'Ownership confirmation required',
      origin: 'shared',
      participantRevision: 2,
      revision: 1,
      status: 'active',
      updatedAt: now,
    })
    const groupId = await ctx.db.insert('groups', {
      createdAt: now,
      createdBy: a,
      kind: 'general',
      name: 'General',
      projectId,
      revision: 1,
      status: 'active',
      updatedAt: now,
    })
    const addParticipation = async (userId: Id<'users'>, companyId: Id<'companies'>) => {
      const company = await ctx.db.get(companyId)
      const user = await ctx.db.get(userId)
      if (!company || !user) throw new Error('ownership_fixture_identity_missing')
      const projectCompanyId = await ctx.db.insert('projectCompanies', {
        acceptedAt: now,
        acceptedBy: userId,
        companyId,
        createdAt: now,
        projectId,
        status: 'active',
        term: 1,
        updatedAt: now,
      })
      const projectMemberId = await ctx.db.insert('projectMembers', {
        companyDisplayNameSnapshot: company.displayName,
        companyId,
        createdAt: now,
        projectCompanyId,
        projectId,
        role: 'manager',
        status: 'active',
        term: 1,
        updatedAt: now,
        userDisplayNameSnapshot: user.displayName,
        userId,
      })
      await ctx.db.insert('groupMembers', {
        createdAt: now,
        groupId,
        isSteward: true,
        projectId,
        projectMemberId,
        status: 'active',
        updatedAt: now,
        userId,
      })
      return projectMemberId
    }
    const aProjectMemberId = await addParticipation(a, aCompany)
    const bProjectMemberId = await addParticipation(b, bCompany)
    return { projectId, aProjectMemberId, bProjectMemberId }
  })
}

async function seedSharedProject() {
  const t = convexTest(schema, modules)
  registerRateLimiter(t)
  const a = await seedUser(t, 'company-a-owner')
  const b = await seedUser(t, 'company-b-owner')
  const aCompany = await createCompany(t, a, 'Company A', 'company-a')
  const bCompany = await createCompany(t, b, 'Company B', 'company-b')
  const created = await asUser(t, a).mutation(api.relationships.create, { actingCompanyId: aCompany, name: 'Partner Network', targetCompanyId: bCompany })
  await asUser(t, b).mutation(api.relationships.decideInvitation, { actingCompanyId: bCompany, decision: 'accept', invitationId: created.invitationId })
  const proposed = await asUser(t, a).mutation(api.sharedProjects.propose, {
    actingCompanyId: aCompany,
    initialMembers: [{ role: 'manager', userId: a }],
    name: 'Shared Project',
    relationshipId: created.relationshipId,
    targetCompanyIds: [bCompany],
  })
  await asUser(t, b).mutation(api.sharedProjects.decideInvitation, {
    actingCompanyId: bCompany,
    decision: 'accept',
    initialMembers: [{ role: 'manager', userId: b }],
    invitationId: proposed.invitations[0].invitationId,
  })
  return {
    a,
    aCompany,
    b,
    bCompany,
    projectId: proposed.projectId,
    relationshipId: created.relationshipId,
    t,
  }
}

async function runWithScheduledFunctions<Output>(t: TestBackend, operation: () => Promise<Output>) {
  vi.useFakeTimers()
  try {
    const result = await operation()
    await t.finishAllScheduledFunctions(() => vi.runAllTimers())
    return result
  } finally {
    vi.useRealTimers()
  }
}
