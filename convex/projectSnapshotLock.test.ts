/// <reference types="vite/client" />

import { register as registerRateLimiter } from '@convex-dev/rate-limiter/test'
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob(['./**/*.{ts,js}', '!./**/*.test.{ts,js}'])

beforeEach(() => {
  vi.stubEnv('TRACK_COMPANY_MODEL_ENABLED', 'true')
  vi.stubEnv('TRACK_THREADS_ENABLED', 'true')
})

afterEach(() => vi.unstubAllEnvs())

async function snapshotFixture() {
  const backend = convexTest(schema, modules)
  registerRateLimiter(backend)
  const userId = await backend.run(async (ctx) => {
    const now = Date.now()
    return await ctx.db.insert('users', {
      displayName: 'Snapshot owner',
      googleSubject: 'snapshot-owner',
      email: 'snapshot-owner@example.test',
      normalizedEmail: 'snapshot-owner@example.test',
      twoFactorEnabled: false,
      createdAt: now,
      updatedAt: now,
    })
  })
  const actor = backend.withIdentity({ subject: 'snapshot-owner' })
  const companyId = await actor.mutation(api.companies.create, {
    displayName: 'Snapshot fixture',
    handle: 'snapshot-fixture',
  })
  const { projectId } = await actor.mutation(api.sharedProjects.createInternal, {
    actingCompanyId: companyId,
    name: 'Snapshot fixture',
    initialMembers: [{ userId, role: 'manager' }],
  })
  const capture = await backend.run(async (ctx) => {
    const member = await ctx.db.query('projectMembers')
      .withIndex('by_project', (q) => q.eq('projectId', projectId)).first()
    const participation = await ctx.db.query('projectCompanies')
      .withIndex('by_project_status', (q) => q.eq('projectId', projectId).eq('status', 'active')).first()
    if (!member || !participation) throw new Error('snapshot_fixture_incomplete')
    const now = Date.now()
    const operationId = await ctx.db.insert('projectExitOperations', {
      projectId,
      projectCompanyId: participation._id,
      operationId: 'capture-fixture',
      cutoff: now,
      status: 'capturing',
      phase: 'members',
      stagedCount: 0,
      createdAt: now,
      updatedAt: now,
    })
    await ctx.db.patch(participation._id, {
      status: 'exit_pending', exitOperationId: 'capture-fixture', exitCutoff: now,
    })
    return { projectMemberId: member._id, operationId, projectCompanyId: participation._id }
  })
  return {
    backend,
    actor,
    userId,
    ...capture,
    scope: { projectId, actingCompanyId: companyId, projectMemberId: capture.projectMemberId },
  }
}

describe('Project snapshot preparation lock', () => {
  it('pages normalized archive Channels without exposing another captured Channel', async () => {
    const { backend, actor, operationId, projectCompanyId, scope, userId } = await snapshotFixture()
    const channels = await backend.run(async (ctx) => {
      const now = Date.now()
      await ctx.db.patch(operationId, { status: 'verified', phase: 'complete', verifiedAt: now })
      await ctx.db.patch(projectCompanyId, { status: 'exited' })
      await ctx.db.patch(scope.projectMemberId, { status: 'archived' })
      await ctx.db.insert('projectArchiveEntitlements', {
        projectId: scope.projectId, projectCompanyId, companyId: scope.actingCompanyId,
        projectMemberId: scope.projectMemberId, exitAt: now,
        channelIds: [], channelSnapshots: [], projectSnapshot: { _id: scope.projectId, name: 'Frozen Project' },
        retentionStatus: 'active', manifestHash: 'fixture', snapshotOperationId: 'capture-fixture',
        createdAt: now, updatedAt: now,
      })
      const channelIds = []
      for (const name of ['Allowed snapshot', 'Other member snapshot']) {
        const groupId = await ctx.db.insert('groups', {
          projectId: scope.projectId, kind: 'general', name: 'Changed live name',
          status: 'active', createdBy: userId, createdAt: now, updatedAt: now,
        })
        await ctx.db.insert('projectExitSnapshotStaging', {
          projectCompanyId, projectId: scope.projectId, operationId: 'capture-fixture',
          scope: 'channel', sourceKind: 'channel', sourceId: String(groupId), groupId,
          cutoff: now, createdAt: now,
          payload: { kind: 'channel', snapshot: { _id: groupId, name, kind: 'general', createdAt: now, status: 'active' } },
        })
        channelIds.push(groupId)
      }
      const allowedId = channelIds[0]
      const privateId = channelIds[1]
      if (!allowedId || !privateId) throw new Error('snapshot_channel_fixture_incomplete')
      await ctx.db.insert('projectExitChannelVisibility', {
        projectCompanyId, projectId: scope.projectId, operationId: 'capture-fixture',
        projectMemberId: scope.projectMemberId, groupId: allowedId, createdAt: now,
      })
      return { allowedId, privateId }
    })
    const page = await actor.query(api.mobile.listGroupsPage, {
      ...scope, userId, paginationOpts: { cursor: null, numItems: 1 },
    })
    expect(page.page.map((row) => row.group.name)).toEqual(['Allowed snapshot'])
    expect(page.page[0]?.group._id).toBe(channels.allowedId)
    await expect(actor.query(api.messages.listPage, {
      actingCompanyId: scope.actingCompanyId, projectMemberId: scope.projectMemberId,
      groupId: channels.privateId, userId,
      paginationOpts: { cursor: null, numItems: 10 },
    })).rejects.toThrow('channel_unavailable')
  })


  it('keeps reads available and prevents a Channel write until immutable capture completes', async () => {
    const { backend, actor, operationId, scope } = await snapshotFixture()
    expect(await actor.query(api.projects.getSnapshotState, scope)).toEqual({
      status: 'capturing', phase: 'members', stagedCount: 0, canManageCapture: true,
    })
    expect(await actor.query(api.channels.list, scope)).not.toHaveLength(0)

    const createArgs = { ...scope, name: 'Created after capture', ownCompanyMemberIds: [] }
    await expect(actor.mutation(api.channels.create, createArgs)).rejects.toThrow('project_snapshot_in_progress')
    await backend.run(async (ctx) => {
      await ctx.db.patch(operationId, { status: 'verified', phase: 'complete', verifiedAt: Date.now() })
    })
    expect(await actor.query(api.projects.getSnapshotState, scope)).toBeNull()
    await expect(actor.mutation(api.channels.create, createArgs)).resolves.toBeDefined()
  })

  it('retains a resumable failed-capture lock but releases a cancelled operation', async () => {
    const { backend, actor, operationId, scope } = await snapshotFixture()
    await backend.run(async (ctx) => {
      await ctx.db.patch(operationId, { status: 'failed', error: 'capture_test_failure' })
    })
    expect(await actor.query(api.projects.getSnapshotState, scope)).toMatchObject({ status: 'failed' })
    await expect(actor.mutation(api.channels.create, {
      ...scope, name: 'Not yet', ownCompanyMemberIds: [],
    })).rejects.toThrow('project_snapshot_in_progress')
    await backend.run(async (ctx) => {
      await ctx.db.patch(operationId, { status: 'cancelled' })
    })
    expect(await actor.query(api.projects.getSnapshotState, scope)).toBeNull()
    await expect(actor.mutation(api.channels.create, {
      ...scope, name: 'After cancellation', ownCompanyMemberIds: [],
    })).resolves.toBeDefined()
  })
})
