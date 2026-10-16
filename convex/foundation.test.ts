import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'

const modules = (import.meta as ImportMeta & {
  glob: (patterns: Array<string>) => Record<string, () => Promise<unknown>>
}).glob(['./**/*.{ts,js}', '!./**/*.test.{ts,js}'])

describe('central Project and Channel policy adapter', () => {
  it('enforces legacy and Company Project-Channel scope, including selected membership', async () => {
    const t = convexTest(schema, modules)
    const { groupId, projectId, projectMemberId, userId } = await seedLegacyProject(t)
    const authenticated = t.withIdentity({ subject: 'legacy-user' })

    await expect(authenticated.query(
      api.foundation.getProjectChannelContext,
      { projectId, groupId },
    )).resolves.toMatchObject({
      userId,
      projectId,
      projectMemberId,
      groupId,
      capabilities: {
        accessProfile: 'legacy',
        canReadChannel: true,
        canWriteChannel: true,
      },
    })

    const restrictedGroupId = await t.run(async (ctx) => await ctx.db.insert('groups', {
      projectId,
      kind: 'custom',
      name: 'Restricted',
      createdBy: userId,
      createdAt: 1,
      updatedAt: 1,
    }))
    await expect(authenticated.query(
      api.foundation.getProjectChannelContext,
      { projectId, groupId: restrictedGroupId },
    )).rejects.toThrow('channel_unavailable')
    const seeded = await seedCompanyProject(t)
    const companyAuthenticated = t.withIdentity({ subject: 'company-user' })
    const args = {
      projectId: seeded.projectId,
      groupId: seeded.groupId,
      selectedProjectMemberId: seeded.projectMemberId,
      actingCompanyId: seeded.companyId,
    }

    await expect(companyAuthenticated.query(
      api.foundation.getProjectChannelContext,
      args,
    )).rejects.toThrow('channel_unavailable')

    await t.run(async (ctx) => {
      await ctx.db.insert('groupMembers', {
        projectId: seeded.projectId,
        groupId: seeded.groupId,
        userId: seeded.userId,
        projectMemberId: seeded.projectMemberId,
        status: 'active',
        isSteward: false,
        createdAt: 1,
        updatedAt: 1,
      })
    })
    await expect(companyAuthenticated.query(
      api.foundation.getProjectChannelContext,
      args,
    )).resolves.toMatchObject({
      projectMemberId: seeded.projectMemberId,
      actingCompanyId: seeded.companyId,
      capabilities: {
        accessProfile: 'company',
        canManageProject: true,
        canReadChannel: true,
        canStewardChannel: false,
      },
    })

    await t.run(async (ctx) => {
      const membership = await ctx.db
        .query('groupMembers')
        .withIndex('by_group_project_member', (q) =>
          q.eq('groupId', seeded.groupId).eq('projectMemberId', seeded.projectMemberId),
        )
        .unique()
      if (!membership) throw new Error('missing_test_membership')
      await ctx.db.patch(membership._id, { isSteward: true })
    })
    await expect(companyAuthenticated.query(
      api.foundation.getProjectChannelContext,
      args,
    )).resolves.toMatchObject({
      capabilities: { canStewardChannel: true },
    })
    await seedUser(t, 'other-user')

    await expect(t.withIdentity({ subject: 'other-user' }).query(
      api.foundation.getProjectChannelContext,
      {
        projectId: seeded.projectId,
        selectedProjectMemberId: seeded.projectMemberId,
        actingCompanyId: seeded.companyId,
      },
    )).rejects.toThrow('project_unavailable')
  })

  it('keeps archive entitlements read-only and actor-bound', async () => {
    const t = convexTest(schema, modules)
    const seeded = await seedCompanyProject(t)
    await seedUser(t, 'other-archive-user')

    await t.run(async (ctx) => {
      await ctx.db.patch(seeded.projectCompanyId, {
        status: 'exited',
        exitedBy: seeded.userId,
        exitedAt: 2,
      })
      await ctx.db.patch(seeded.projectMemberId, {
        status: 'archived',
        endedAt: 2,
      })
      await ctx.db.insert('projectArchiveEntitlements', {
        projectId: seeded.projectId,
        projectCompanyId: seeded.projectCompanyId,
        companyId: seeded.companyId,
        projectMemberId: seeded.projectMemberId,
        exitAt: 2,
        channelIds: [seeded.groupId],
        projectSnapshot: {
          name: 'Company Project',
          status: 'active',
        },
        channelSnapshots: [{
          _id: seeded.groupId,
          name: 'Restricted',
          status: 'active',
        }],
        retentionStatus: 'active',
        manifestHash: 'archive-manifest',
        createdAt: 2,
        updatedAt: 2,
      })
    })

    await expect(t.withIdentity({ subject: 'company-user' }).query(
      api.foundation.getProjectChannelContext,
      {
        projectId: seeded.projectId,
        groupId: seeded.groupId,
        selectedProjectMemberId: seeded.projectMemberId,
        actingCompanyId: seeded.companyId,
      },
    )).resolves.toMatchObject({
      capabilities: {
        accessMode: 'archive',
        canReadProject: true,
        canWriteProject: false,
        canReadChannel: true,
        canWriteChannel: false,
      },
    })
  })
})

async function seedUser(
  t: ReturnType<typeof convexTest<typeof schema.tables>>,
  authUserId: string,
) {
  return await t.run(async (ctx) => await ctx.db.insert('users', {
    googleSubject: authUserId,
    authUserId,
    normalizedEmail: `${authUserId}@track.test`,
    email: `${authUserId}@track.test`,
    displayName: authUserId,
    twoFactorEnabled: false,
    createdAt: 1,
    updatedAt: 1,
  }))
}

async function seedLegacyProject(t: ReturnType<typeof convexTest<typeof schema.tables>>) {
  const userId = await seedUser(t, 'legacy-user')
  return await t.run(async (ctx) => {
    const projectId = await ctx.db.insert('projects', {
      name: 'Legacy',
      createdBy: userId,
      createdAt: 1,
      updatedAt: 1,
    })
    const projectMemberId = await ctx.db.insert('projectMembers', {
      projectId,
      userId,
      role: 'staff',
      createdAt: 1,
      updatedAt: 1,
    })
    const groupId = await ctx.db.insert('groups', {
      projectId,
      kind: 'general',
      name: 'General',
      createdBy: userId,
      createdAt: 1,
      updatedAt: 1,
    })
    await ctx.db.insert('groupMembers', {
      projectId,
      groupId,
      userId,
      createdAt: 1,
      updatedAt: 1,
    })
    return { groupId, projectId, projectMemberId, userId }
  })
}

async function seedCompanyProject(t: ReturnType<typeof convexTest<typeof schema.tables>>) {
  const userId = await seedUser(t, 'company-user')
  return await t.run(async (ctx) => {
    const companyId = await ctx.db.insert('companies', {
      displayName: 'Company',
      normalizedHandle: 'company',
      status: 'active',
      revision: 1,
      createdBy: userId,
      createdAt: 1,
      updatedAt: 1,
    })
    await ctx.db.insert('companyMembers', {
      companyId,
      userId,
      role: 'owner',
      status: 'active',
      userDisplayNameSnapshot: 'Company User',
      companyDisplayNameSnapshot: 'Company',
      createdAt: 1,
      updatedAt: 1,
    })
    const projectId = await ctx.db.insert('projects', {
      name: 'Company Project',
      accessProfile: 'company',
      proposingCompanyId: companyId,
      origin: 'single_company',
      status: 'active',
      participantRevision: 1,
      revision: 1,
      createdBy: userId,
      createdAt: 1,
      updatedAt: 1,
    })
    const projectCompanyId = await ctx.db.insert('projectCompanies', {
      projectId,
      companyId,
      term: 1,
      status: 'active',
      acceptedBy: userId,
      acceptedAt: 1,
      createdAt: 1,
      updatedAt: 1,
    })
    const projectMemberId = await ctx.db.insert('projectMembers', {
      projectId,
      userId,
      role: 'manager',
      companyId,
      projectCompanyId,
      status: 'active',
      term: 1,
      createdAt: 1,
      updatedAt: 1,
    })
    const groupId = await ctx.db.insert('groups', {
      projectId,
      kind: 'custom',
      name: 'Restricted',
      status: 'active',
      revision: 1,
      createdBy: userId,
      createdAt: 1,
      updatedAt: 1,
    })
    return { companyId, groupId, projectId, projectCompanyId, projectMemberId, userId }
  })
}
