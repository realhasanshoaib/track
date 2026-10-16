/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'
import { api } from './_generated/api'
import schema from './schema'
const modules = import.meta.glob(['./**/*.{ts,js}', '!./**/*.test.{ts,js}'])
describe('groups.listMembers', () => {
  it('reports archived conversations as read-only in mobile navigation', async () => {
    const t = convexTest(schema, modules)
    const fixture = await seedChannel(t)
    const actor = t.withIdentity({ subject: 'channel-owner' })
    const args = { projectId: fixture.projectId, groupId: fixture.groupId, userId: fixture.ownerId }
    expect(await actor.query(api.mobile.resolveNavigation, args)).toEqual({
      available: true, archived: false, canWrite: true,
    })
    await t.run(async (ctx) => { await ctx.db.patch(fixture.groupId, { status: 'archived' }) })
    expect(await actor.query(api.mobile.resolveNavigation, args)).toEqual({
      available: true, archived: true, canWrite: false,
    })
    await expect(actor.mutation(api.messages.send, {
      projectId: fixture.projectId, groupId: fixture.groupId, authorId: fixture.ownerId,
      body: 'Archived write', mentions: [],
    })).rejects.toThrow('group_archived')
  })
  it('keeps legacy members visible and rejects Project-only or removed actors', async () => {
    const t = convexTest(schema, modules)
    const fixture = await seedChannel(t)
    const members = await t
      .withIdentity({ subject: 'channel-owner' })
      .query(api.groups.listMembers, { groupId: fixture.groupId, userId: fixture.ownerId })
    expect(members.map((item) => item.user?.displayName)).toEqual(['Channel owner'])
    await expect(
      t
        .withIdentity({ subject: 'project-only-member' })
        .query(api.groups.listMembers, {
          groupId: fixture.groupId,
          userId: fixture.projectOnlyMemberId,
        }),
    ).rejects.toThrow('not_group_member')
    const visible = await t
      .withIdentity({ subject: 'channel-owner' })
      .query(api.groups.listVisible, { projectId: fixture.projectId, userId: fixture.ownerId })
    expect(visible.map((group) => group?._id)).toEqual([fixture.groupId])
    const removedVisible = await t
      .withIdentity({ subject: 'removed-channel-member' })
      .query(api.groups.listVisible, {
        projectId: fixture.projectId,
        userId: fixture.removedMemberId,
      })
    expect(removedVisible).toEqual([])
    await expect(
      t
        .withIdentity({ subject: 'removed-channel-member' })
        .query(api.groups.listMembers, {
          groupId: fixture.groupId,
          userId: fixture.removedMemberId,
        }),
    ).rejects.toThrow('not_group_member')
  })
})
async function seedChannel(t: ReturnType<typeof convexTest>) {
  const now = 1
  const ownerId = await seedUser(t, 'channel-owner', 'Channel owner')
  const projectOnlyMemberId = await seedUser(t, 'project-only-member', 'Project-only member')
  const removedMemberId = await seedUser(t, 'removed-channel-member', 'Removed channel member')
  return await t.run(async (ctx) => {
    const projectId = await ctx.db.insert('projects', {
      name: 'Membership source',
      createdBy: ownerId,
      createdAt: now,
      updatedAt: now,
    })
    const groupId = await ctx.db.insert('groups', {
      projectId,
      kind: 'custom',
      name: 'Authorized Channel',
      status: 'active',
      createdBy: ownerId,
      createdAt: now,
      updatedAt: now,
    })
    for (const userId of [ownerId, projectOnlyMemberId, removedMemberId]) {
      await ctx.db.insert('projectMembers', {
        projectId,
        userId,
        role: userId === ownerId ? 'owner' : 'staff',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      })
    }
    await ctx.db.insert('groupMembers', {
      projectId,
      groupId,
      userId: ownerId,
      createdAt: now,
      updatedAt: now,
    })
    await ctx.db.insert('groupMembers', {
      projectId,
      groupId,
      userId: removedMemberId,
      status: 'removed',
      createdAt: now,
      updatedAt: now,
    })
    return { groupId, ownerId, projectId, projectOnlyMemberId, removedMemberId }
  })
}
async function seedUser(t: ReturnType<typeof convexTest>, authUserId: string, displayName: string) {
  return await t.run(
    async (ctx) =>
      await ctx.db.insert('users', {
        authUserId,
        googleSubject: authUserId,
        normalizedEmail: `${authUserId}@track.test`,
        email: `${authUserId}@track.test`,
        displayName,
        twoFactorEnabled: false,
        createdAt: 1,
        updatedAt: 1,
      }),
  )
}
