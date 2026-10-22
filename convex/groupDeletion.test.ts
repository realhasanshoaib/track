import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'

const modules = (import.meta as ImportMeta & {
  glob: (patterns: Array<string>) => Record<string, () => Promise<unknown>>
}).glob(['./**/*.{ts,js}', '!./**/*.test.{ts,js}'])

describe('group dependent row deletion', () => {
  for (const kind of ['project', 'group'] as const) {
    it(`${kind} deletion removes dependent rows and preserves surviving scopes and existing orphans`, async () => {
      const t = convexTest(schema, modules)
      const fixture = await seed(t)
      const actor = t.withIdentity({ subject: 'cascade-owner' })
      const survivors = await t.run(async (ctx) => ({
        groups: await Promise.all(fixture.survivingGroups.map((id) => ctx.db.get(id))),
        members: await Promise.all(fixture.survivingMembers.map((id) => ctx.db.get(id))),
        reads: await Promise.all(fixture.survivingReads.map((id) => ctx.db.get(id))),
      }))
      if (kind === 'project') {
        await actor.mutation(api.projects.remove, { projectId: fixture.projectId, userId: fixture.userId })
      } else {
        await actor.mutation(api.groups.remove, { projectId: fixture.projectId, groupId: fixture.groupId, userId: fixture.userId })
      }
      await t.run(async (ctx) => {
        expect(await ctx.db.get(fixture.groupId)).toBeNull()
        for (const id of fixture.targetMembers) expect(await ctx.db.get(id)).toBeNull()
        for (const id of fixture.targetReads) expect(await ctx.db.get(id)).toBeNull()
        expect(await Promise.all(fixture.survivingGroups.map((id) => ctx.db.get(id)))).toEqual(survivors.groups)
        expect(await Promise.all(fixture.survivingMembers.map((id) => ctx.db.get(id)))).toEqual(survivors.members)
        expect(await Promise.all(fixture.survivingReads.map((id) => ctx.db.get(id)))).toEqual(survivors.reads)
        if (kind === 'project') expect(await ctx.db.get(fixture.projectId)).toBeNull()
        else expect(await ctx.db.get(fixture.projectId)).not.toBeNull()
      })
    })
  }
})

async function seed(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', {
      authUserId: 'cascade-owner', googleSubject: 'cascade-owner', normalizedEmail: 'cascade@track.test',
      email: 'cascade@track.test', displayName: 'Cascade', twoFactorEnabled: false, createdAt: 1, updatedAt: 1,
    })
    const projects = []
    const groups = []
    const members = []
    const reads = []
    for (let index = 0; index < 3; index++) {
      const projectId = await ctx.db.insert('projects', { name: `Scope ${index}`, createdBy: userId, createdAt: 1, updatedAt: 1 })
      await ctx.db.insert('projectMembers', { projectId, userId, role: 'owner', createdAt: 1, updatedAt: 1 })
      const groupId = await ctx.db.insert('groups', { projectId, name: `Group ${index}`, kind: 'custom', createdBy: userId, createdAt: 1, updatedAt: 1 })
      const groupMembers = []
      const groupReads = []
      // Legacy and represented read states must both be removed.
      for (const status of ['active', 'removed', undefined] as const) {
        groupMembers.push(await ctx.db.insert('groupMembers', { projectId, groupId, userId, status, createdAt: 1, updatedAt: 1 }))
        groupReads.push(await ctx.db.insert('groupReadStates', { projectId, groupId, userId, lastReadAt: 1, createdAt: 1, updatedAt: 1 }))
      }
      projects.push(projectId)
      groups.push(groupId)
      members.push(groupMembers)
      reads.push(groupReads)
    }
    // Existing orphan rows are deliberately outside this fix.
    await ctx.db.delete(groups[2]!)
    return {
      userId, projectId: projects[0]!, groupId: groups[0]!, targetMembers: members[0]!, targetReads: reads[0]!,
      survivingGroups: [groups[1]!], survivingMembers: [...members[1]!, ...members[2]!],
      survivingReads: [...reads[1]!, ...reads[2]!],
    }
  })
}
