import { v } from 'convex/values'

import { internalMutation, internalQuery, query } from './_generated/server'
import { authorizeScopedRequest } from './lib/requestAuthorization'
import { assertProjectSnapshotWritable } from './lib/projectSnapshotLock'
import { initialContextTemplate, type BoxAccessScope } from './lib/memoryPolicy'

const memorySchemaVersion = 1

export const getStatus = query({
  args: {
    projectId: v.id('projects'),
    userId: v.id('users'),
    actingCompanyId: v.optional(v.id('companies')),
    projectMemberId: v.optional(v.id('projectMembers')),
  },
  handler: async (ctx, args) => {
    const access = await authorizeScopedRequest(ctx, {
      projectId: args.projectId,
      claimedUserId: args.userId,
      actingCompanyId: args.actingCompanyId,
      projectMemberId: args.projectMemberId,
    }, 'readProject')
    if (access.companyAccess?.entitlement) {
      const snapshots = await ctx.db.query('projectArchiveSnapshots').withIndex('by_entitlement', (q) =>
        q.eq('entitlementId', access.companyAccess!.entitlement!._id),
      ).collect()
      return { archive: true as const, snapshots }
    }
    return await ctx.db
      .query('projectMemoryBoxes')
      .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
      .unique()
  },
})

export const listImports = query({
  args: {
    projectId: v.id('projects'),
    userId: v.id('users'),
    actingCompanyId: v.optional(v.id('companies')),
    projectMemberId: v.optional(v.id('projectMembers')),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const access = await authorizeScopedRequest(ctx, {
      projectId: args.projectId,
      claimedUserId: args.userId,
      actingCompanyId: args.actingCompanyId,
      projectMemberId: args.projectMemberId,
    }, 'readProject')
    if (access.companyAccess?.entitlement) {
      return await ctx.db.query('projectArchiveSnapshots').withIndex('by_entitlement', (q) =>
        q.eq('entitlementId', access.companyAccess!.entitlement!._id),
      ).collect()
    }
    const imports = await ctx.db
      .query('memoryImports')
      .withIndex('by_project_created_at', (q) => q.eq('projectId', args.projectId))
      .order('desc')
      .take((args.limit ?? 20) * 2)
    if (!access.companyAccess) return imports.slice(0, args.limit ?? 20)
    const memberships = await ctx.db.query('groupMembers').withIndex('by_project_member_status', (q) =>
      q.eq('projectMemberId', access.companyAccess!.projectMember._id).eq('status', 'active'),
    ).collect()
    const visibleGroups = new Set(memberships.map((membership) => String(membership.groupId)))
    return imports.filter((item) => item.scope === 'project' || visibleGroups.has(String(item.groupId))).slice(0, args.limit ?? 20)
  },
})

export const getAccessScope = query({
  args: {
    projectId: v.id('projects'),
    groupId: v.id('groups'),
    actorId: v.id('users'),
    actingCompanyId: v.optional(v.id('companies')),
    projectMemberId: v.optional(v.id('projectMembers')),
    boxId: v.string(),
    runId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<BoxAccessScope> => {
    const access = await authorizeScopedRequest(ctx, {
      projectId: args.projectId,
      groupId: args.groupId,
      claimedUserId: args.actorId,
      actingCompanyId: args.actingCompanyId,
      projectMemberId: args.projectMemberId,
    }, 'readChannel')
    if (access.companyAccess?.projectMember.status === 'archived') throw new Error('archive_memory_is_snapshot_only')
    const member = access.companyAccess?.projectMember
      ?? await ctx.db.query('projectMembers').withIndex('by_project_user', (q) =>
        q.eq('projectId', args.projectId).eq('userId', args.actorId),
      ).unique()
    if (!member) throw new Error('project_unavailable')
    const canAccessAllGroups = !access.companyAccess && (member.role === 'owner' || member.role === 'admin')
    const allowedGroupIds = canAccessAllGroups
      ? (await ctx.db
          .query('groups')
          .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
          .collect()).map((group) => group._id)
      : access.companyAccess
        ? (await ctx.db.query('groupMembers').withIndex('by_project_member_status', (q) =>
            q.eq('projectMemberId', access.companyAccess!.projectMember._id).eq('status', 'active'),
          ).collect()).map((membership) => membership.groupId)
        : (await ctx.db.query('groupMembers').withIndex('by_user', (q) => q.eq('userId', args.actorId)).collect())
            .filter((membership) =>
              membership.projectId === args.projectId &&
              (!membership.status || membership.status === 'active'))
            .map((membership) => membership.groupId)
    return {
      actorUserId: args.actorId,
      allowedGroupIds,
      boxId: args.boxId,
      canAccessAllGroups,
      projectId: args.projectId,
      role: member.role,
      runId: args.runId,
    }
  },
})

export const getMemoryBoxForProject = query({
  args: {
    projectId: v.id('projects'),
    actorId: v.id('users'),
    actingCompanyId: v.optional(v.id('companies')),
    projectMemberId: v.optional(v.id('projectMembers')),
  },
  handler: async (ctx, args) => {
    const access = await authorizeScopedRequest(ctx, {
      projectId: args.projectId,
      claimedUserId: args.actorId,
      actingCompanyId: args.actingCompanyId,
      projectMemberId: args.projectMemberId,
    }, 'readProject')
    if (access.companyAccess?.entitlement) throw new Error('archive_memory_is_snapshot_only')
    return await ctx.db
      .query('projectMemoryBoxes')
      .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
      .unique()
  },
})

export const listMemoryBoxesForCleanup = internalQuery({
  args: {},
  handler: async (ctx) => {
    const boxes = await Promise.all(
      (['creating', 'ready', 'paused'] as const).map((status) =>
        ctx.db.query('projectMemoryBoxes')
          .withIndex('by_status_updated_at', (q) => q.eq('status', status))
          .collect(),
      ),
    )
    // Keep the table's creation order when combining the status ranges.
    return boxes.flat().sort((a, b) => a._creationTime - b._creationTime)
  },
})

export const authorizeGroupMemoryWrite = internalMutation({
  args: {
    projectId: v.id('projects'),
    groupId: v.id('groups'),
    actorId: v.id('users'),
    actingCompanyId: v.optional(v.id('companies')),
    projectMemberId: v.optional(v.id('projectMembers')),
  },
  handler: async (ctx, args) => {
    const group = await ctx.db.get(args.groupId)
    if (!group || group.projectId !== args.projectId) throw new Error('group_project_mismatch')
    await authorizeScopedRequest(ctx, {
      projectId: args.projectId,
      groupId: args.groupId,
      claimedUserId: args.actorId,
      actingCompanyId: args.actingCompanyId,
      projectMemberId: args.projectMemberId,
    }, 'writeChannel')
  },
})

export const createImportJob = internalMutation({
  args: {
    projectId: v.id('projects'),
    groupId: v.id('groups'),
    actorId: v.id('users'),
    actorProjectMemberId: v.optional(v.id('projectMembers')),
    actingCompanyId: v.optional(v.id('companies')),
    scope: v.optional(v.union(v.literal('project'), v.literal('channel'))),
    sourceKind: v.union(v.literal('paste'), v.literal('file'), v.literal('link'), v.literal('chat_export'), v.literal('track_attachment')),
    sourceStorageIds: v.array(v.id('_storage')),
    sourceUrls: v.array(v.string()),
    createdAt: v.number(),
  },
  handler: async (ctx, args) => {
    await assertProjectSnapshotWritable(ctx, args.projectId)
    const importId = await ctx.db.insert('memoryImports', {
      ...args,
      scope: args.scope ?? 'channel',
      status: 'queued',
      updatedAt: args.createdAt,
    })
    await ctx.db.insert('auditEvents', {
      projectId: args.projectId,
      groupId: args.groupId,
      actorId: args.actorId,
      actorProjectMemberId: args.actorProjectMemberId,
      actingCompanyId: args.actingCompanyId,
      entityType: 'memoryImport',
      entityId: importId,
      action: 'memory_import.queued',
      after: { sourceKind: args.sourceKind, sourceUrlCount: args.sourceUrls.length, sourceStorageCount: args.sourceStorageIds.length },
      createdAt: Date.now(),
    })
    return importId
  },
})

export const updateImportJob = internalMutation({
  args: {
    importId: v.id('memoryImports'),
    status: v.optional(v.union(v.literal('queued'), v.literal('running'), v.literal('completed'), v.literal('failed'))),
    boxScratchPath: v.optional(v.string()),
    summary: v.optional(v.string()),
    error: v.optional(v.string()),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.importId, {
      boxScratchPath: args.boxScratchPath,
      completedAt: args.completedAt,
      error: args.error,
      status: args.status,
      summary: args.summary,
      updatedAt: args.updatedAt,
    })
  },
})

export const createMemoryBoxRecord = internalMutation({
  args: {
    projectId: v.id('projects'),
    boxId: v.string(),
    runtime: v.string(),
    createdBy: v.id('users'),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('projectMemoryBoxes')
      .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
      .unique()
    const now = Date.now()
    if (existing) {
      await ctx.db.patch(existing._id, {
        boxId: args.boxId,
        contextLength: initialContextTemplate.length,
        error: undefined,
        lastUsedAt: now,
        runtime: args.runtime,
        schemaVersion: memorySchemaVersion,
        status: 'ready',
        updatedAt: now,
      })
      await ctx.db.insert('auditEvents', {
        projectId: args.projectId,
        actorId: args.createdBy,
        entityType: 'projectMemoryBox',
        entityId: args.boxId,
        action: 'memory_box.created',
        after: { rowId: existing._id, runtime: args.runtime, reusedRow: true },
        createdAt: now,
      })
      return await ctx.db.get(existing._id)
    }
    const id = await ctx.db.insert('projectMemoryBoxes', {
      boxId: args.boxId,
      createdAt: now,
      createdBy: args.createdBy,
      projectId: args.projectId,
      runtime: args.runtime,
      schemaVersion: memorySchemaVersion,
      status: 'ready',
      updatedAt: now,
      lastUsedAt: now,
      contextLength: initialContextTemplate.length,
    })
    await ctx.db.insert('auditEvents', {
      projectId: args.projectId,
      actorId: args.createdBy,
      entityType: 'projectMemoryBox',
      entityId: args.boxId,
      action: 'memory_box.created',
      after: { rowId: id, runtime: args.runtime },
      createdAt: now,
    })
    return await ctx.db.get(id)
  },
})

export const markMemoryBoxUsed = internalMutation({
  args: {
    projectId: v.id('projects'),
    boxId: v.string(),
    actorId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query('projectMemoryBoxes')
      .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
      .unique()
    if (!row) throw new Error('memory_box_not_found')
    await ctx.db.patch(row._id, { lastUsedAt: Date.now(), status: row.status === 'paused' ? 'ready' : row.status, updatedAt: Date.now() })
    await ctx.db.insert('auditEvents', {
      projectId: args.projectId,
      actorId: args.actorId,
      entityType: 'projectMemoryBox',
      entityId: args.boxId,
      action: 'memory_box.reused',
      after: { status: row.status },
      createdAt: Date.now(),
    })
  },
})

export const beginMemoryBoxContextWrite = internalMutation({
  args: {
    projectId: v.id('projects'),
    boxId: v.string(),
  },
  handler: async (ctx, args) => {
    await assertProjectSnapshotWritable(ctx, args.projectId)
    const row = await ctx.db
      .query('projectMemoryBoxes')
      .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
      .unique()
    if (!row || row.boxId !== args.boxId) throw new Error('memory_box_not_found')
    if (row.contextWritePendingRevision) throw new Error('memory_context_write_in_progress')
    const revision = Math.max(Date.now(), (row.lastContextUpdatedAt ?? 0) + 1)
    await ctx.db.patch(row._id, {
      contextWritePendingRevision: revision,
      lastContextUpdatedAt: revision,
      lastUsedAt: Date.now(),
      updatedAt: Date.now(),
    })
    return revision
  },
})

export const completeMemoryBoxContextWrite = internalMutation({
  args: {
    projectId: v.id('projects'),
    boxId: v.string(),
    contextLength: v.optional(v.number()),
    revision: v.number(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query('projectMemoryBoxes')
      .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
      .unique()
    if (
      !row ||
      row.boxId !== args.boxId ||
      row.contextWritePendingRevision !== args.revision
    ) throw new Error('memory_context_write_superseded')
    await ctx.db.patch(row._id, {
      ...(args.contextLength === undefined ? {} : { contextLength: args.contextLength }),
      contextWritePendingRevision: undefined,
      lastContextUpdatedAt: args.revision,
      lastUsedAt: Date.now(),
      updatedAt: Date.now(),
    })
  },
})

export const abortMemoryBoxContextWrite = internalMutation({
  args: {
    projectId: v.id('projects'),
    boxId: v.string(),
    revision: v.number(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query('projectMemoryBoxes')
      .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
      .unique()
    if (
      row?.boxId === args.boxId &&
      row.contextWritePendingRevision === args.revision
    ) {
      await ctx.db.patch(row._id, {
        contextWritePendingRevision: undefined,
        updatedAt: Date.now(),
      })
    }
  },
})

export const markMemoryBoxDeleted = internalMutation({
  args: {
    projectId: v.id('projects'),
    boxId: v.string(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query('projectMemoryBoxes')
      .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
      .unique()
    if (!row || row.boxId !== args.boxId) return
    await ctx.db.patch(row._id, {
      error: args.error,
      status: args.error ? 'error' : 'deleted',
      updatedAt: Date.now(),
    })
  },
})

export const auditMemoryEvent = internalMutation({
  args: {
    projectId: v.optional(v.id('projects')),
    groupId: v.optional(v.id('groups')),
    actorId: v.optional(v.id('users')),
    entityType: v.string(),
    entityId: v.string(),
    action: v.string(),
    before: v.optional(v.any()),
    after: v.optional(v.any()),
    correlationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert('auditEvents', {
      ...args,
      createdAt: Date.now(),
    })
  },
})

export const acquireMemoryPathLock = internalMutation({
  args: {
    projectId: v.id('projects'),
    path: v.string(),
    holderId: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    await assertProjectSnapshotWritable(ctx, args.projectId)
    const existing = await ctx.db
      .query('memoryPathLocks')
      .withIndex('by_project_path', (q) => q.eq('projectId', args.projectId).eq('path', args.path))
      .unique()
    const now = Date.now()
    if (existing && existing.expiresAt > now) throw new Error('memory_path_locked')
    if (existing) {
      await ctx.db.patch(existing._id, {
        expiresAt: args.expiresAt,
        holderId: args.holderId,
        updatedAt: now,
      })
      return existing._id
    }
    return await ctx.db.insert('memoryPathLocks', {
      createdAt: now,
      expiresAt: args.expiresAt,
      holderId: args.holderId,
      path: args.path,
      projectId: args.projectId,
      updatedAt: now,
    })
  },
})

export const releaseMemoryPathLock = internalMutation({
  args: {
    lockId: v.id('memoryPathLocks'),
  },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.lockId).catch(() => undefined)
  },
})
