import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob(['./**/*.{ts,js}', '!./**/*.test.{ts,js}'])

describe('legacy project and channel scope authorization', () => {
  it('rejects foreign channel context reads while preserving same-project reads', async () => {
    const t = convexTest(schema, modules)
    const fixture = await seedLegacyScope(t)
    const authenticated = t.withIdentity({ subject: 'scope-owner' })

    await expect(authenticated.query(api.assistant.collectContext, {
      projectId: fixture.projectAId,
      groupId: fixture.groupAId,
      requesterId: fixture.ownerId,
      question: 'same project context',
    })).resolves.toMatchObject({
      messages: [{ body: 'Project A context' }],
    })

    await expect(authenticated.query(api.assistant.collectContext, {
      projectId: fixture.projectAId,
      groupId: fixture.groupBId,
      requesterId: fixture.ownerId,
      question: 'foreign project context',
    })).rejects.toThrow('channel_unavailable')
  })

  it('rejects foreign group membership writes while preserving same-project writes', async () => {
    const t = convexTest(schema, modules)
    const fixture = await seedLegacyScope(t)
    const authenticated = t.withIdentity({ subject: 'scope-owner' })

    await expect(authenticated.mutation(api.groups.addGroupMember, {
      projectId: fixture.projectAId,
      groupId: fixture.groupBId,
      actorId: fixture.ownerId,
      userId: fixture.memberId,
    })).rejects.toThrow('group_not_found')

    await expect(t.run(async (ctx) => await ctx.db
      .query('groupMembers')
      .withIndex('by_group_user', (q) => q.eq('groupId', fixture.groupBId).eq('userId', fixture.memberId))
      .unique())).resolves.toBeNull()

    await expect(authenticated.mutation(api.groups.addGroupMember, {
      projectId: fixture.projectAId,
      groupId: fixture.groupAId,
      actorId: fixture.ownerId,
      userId: fixture.memberId,
    })).resolves.toBeNull()

    await expect(t.run(async (ctx) => await ctx.db
      .query('groupMembers')
      .withIndex('by_group_user', (q) => q.eq('groupId', fixture.groupAId).eq('userId', fixture.memberId))
      .unique())).resolves.toMatchObject({
      projectId: fixture.projectAId,
      groupId: fixture.groupAId,
      userId: fixture.memberId,
    })
  })
})

async function seedLegacyScope(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const now = 1
    const ownerId = await ctx.db.insert('users', {
      authUserId: 'scope-owner',
      googleSubject: 'scope-owner',
      normalizedEmail: 'scope-owner@track.test',
      email: 'scope-owner@track.test',
      displayName: 'Scope owner',
      twoFactorEnabled: false,
      createdAt: now,
      updatedAt: now,
    })
    const memberId = await ctx.db.insert('users', {
      authUserId: 'scope-member',
      googleSubject: 'scope-member',
      normalizedEmail: 'scope-member@track.test',
      email: 'scope-member@track.test',
      displayName: 'Scope member',
      twoFactorEnabled: false,
      createdAt: now,
      updatedAt: now,
    })
    const projectAId = await ctx.db.insert('projects', {
      name: 'Project A',
      accessProfile: 'legacy',
      createdBy: ownerId,
      createdAt: now,
      updatedAt: now,
    })
    const projectBId = await ctx.db.insert('projects', {
      name: 'Project B',
      accessProfile: 'legacy',
      createdBy: ownerId,
      createdAt: now,
      updatedAt: now,
    })
    for (const projectId of [projectAId, projectBId]) {
      await ctx.db.insert('projectMembers', {
        projectId,
        userId: ownerId,
        role: 'owner',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      })
    }
    await ctx.db.insert('projectMembers', {
      projectId: projectAId,
      userId: memberId,
      role: 'staff',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    })
    const groupAId = await ctx.db.insert('groups', {
      projectId: projectAId,
      kind: 'custom',
      name: 'Channel A',
      status: 'active',
      createdBy: ownerId,
      createdAt: now,
      updatedAt: now,
    })
    const groupBId = await ctx.db.insert('groups', {
      projectId: projectBId,
      kind: 'custom',
      name: 'Channel B',
      status: 'active',
      createdBy: ownerId,
      createdAt: now,
      updatedAt: now,
    })
    await ctx.db.insert('groupMembers', {
      projectId: projectAId,
      groupId: groupAId,
      userId: ownerId,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    })
    await ctx.db.insert('groupMembers', {
      projectId: projectBId,
      groupId: groupBId,
      userId: ownerId,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    })
    await ctx.db.insert('messages', {
      projectId: projectAId,
      groupId: groupAId,
      authorId: ownerId,
      body: 'Project A context',
      mentions: [],
      attachmentIds: [],
      createdAt: now,
    })
    await ctx.db.insert('messages', {
      projectId: projectBId,
      groupId: groupBId,
      authorId: ownerId,
      body: 'Project B secret',
      mentions: [],
      attachmentIds: [],
      createdAt: now,
    })
    return { projectAId, projectBId, groupAId, groupBId, ownerId, memberId }
  })
}
