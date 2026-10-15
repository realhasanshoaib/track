import { v } from 'convex/values'
import { entityMarkColorKeys, entityMarkIconKeys } from '@track/shared'
import { canAdministerCompany } from '@track/shared/company'
import { resolveProjectAccessProfile } from '@track/shared/feature-flags'
import type { Id } from './_generated/dataModel'

import { mutation, query } from './_generated/server'
import { internal } from './_generated/api'
import { appendAuditEvent } from './lib/audit'
import { assertActorMatches, requireAuthenticatedActor } from './lib/actorContext'
import { canRoleJoinDefaultGroup, requireProjectManager, requireProjectMember, requireProjectOwner } from './lib/permissions'
import { invalidateTaskEvidence } from './lib/taskEvidence'
import { deleteTaskProjectData } from './lib/taskLifecycle'
import { authorizeScopedRequest } from './lib/requestAuthorization'
import { assertProjectSnapshotWritable, readProjectSnapshotState } from './lib/projectSnapshotLock'
import { listArchivedMemberSnapshotsPage } from './lib/projectExitArchive'

const defaultGroups = [
  { kind: 'general', name: 'General' },
  { kind: 'internal', name: 'Internal' },
  { kind: 'commercials', name: 'Commercials' },
] as const

const accessibleProjectLimit = 200

export const listAccessible = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireAuthenticatedActor(ctx)
    const allMemberships = await ctx.db
      .query('projectMembers')
      .withIndex('by_user', (q) => q.eq('userId', actor.userId))
      .collect()
    const memberships = allMemberships.filter((membership) =>
      membership.status === undefined || membership.status === 'active' || membership.status === 'archived',
    )
    if (memberships.length > accessibleProjectLimit) {
      throw new Error('accessible_project_list_limit_exceeded')
    }

    const items = await Promise.all(memberships.map(async (membership) => {
      const project = await ctx.db.get(membership.projectId)
      if (!project) return null
      const projectType = resolveProjectAccessProfile(project.accessProfile)
      let archiveEntitlement = null
      if (projectType === 'legacy') {
        if (membership.status !== undefined && membership.status !== 'active') return null
      } else {
        if (!membership.companyId || !membership.projectCompanyId || (membership.status !== 'active' && membership.status !== 'archived')) return null
        const [company, companyMembership, projectCompany] = await Promise.all([
          ctx.db.get(membership.companyId),
          ctx.db.query('companyMembers').withIndex('by_company_user', (q) =>
            q.eq('companyId', membership.companyId!).eq('userId', actor.userId),
          ).unique(),
          ctx.db.get(membership.projectCompanyId),
        ])
        if (!company || !companyMembership || companyMembership.status !== 'active') return null
        if (!projectCompany || (membership.status === 'active' ? projectCompany.status !== 'active' : projectCompany.status !== 'exited')) return null
        if (membership.status === 'archived') {
          archiveEntitlement = await ctx.db.query('projectArchiveEntitlements')
            .withIndex('by_member', (q) => q.eq('projectMemberId', membership._id))
            .unique()
          if (!archiveEntitlement || archiveEntitlement.retentionStatus !== 'active') return null
        } else if (company.status !== 'active') return null
        if (!archiveEntitlement && project.origin === 'shared' && project.relationshipId) {
          const relationship = await ctx.db.get(project.relationshipId)
          const relationshipTerms = await ctx.db.query('relationshipCompanies')
            .withIndex('by_relationship_status', (q) => q.eq('relationshipId', project.relationshipId!).eq('status', 'active'))
            .collect()
          if (!relationship || relationship.status !== 'active' || !relationshipTerms.some((term) => term.companyId === company._id)) return null
        }
      }

      const company = membership.companyId ? await ctx.db.get(membership.companyId) : null
      const visibleProject = archiveEntitlement?.projectSnapshot
        ? { ...project, ...archiveEntitlement.projectSnapshot }
        : project
      const projectMembers = archiveEntitlement
        ? archiveEntitlement.snapshotOperationId
          ? (await listArchivedMemberSnapshotsPage(ctx, {
              operationId: archiveEntitlement.snapshotOperationId,
              cursor: null,
              numItems: 501,
            })).page
          : []
        : await ctx.db.query('projectMembers').withIndex('by_project', (q) => q.eq('projectId', project._id)).take(501)
      const channelMemberships = projectType === 'legacy'
        ? (await ctx.db.query('groupMembers')
            .withIndex('by_project_user', (q) =>
              q.eq('projectId', project._id).eq('userId', actor.userId),
            )
            .take(1001))
            .filter((item) => !item.status || item.status === 'active')
        : await ctx.db.query('groupMembers')
            .withIndex('by_project_member_status', (q) =>
              q.eq('projectMemberId', membership._id).eq('status', 'active'),
            )
            .take(1001)
      return {
        project: visibleProject,
        membership,
        projectCompany: membership.projectCompanyId ? await ctx.db.get(membership.projectCompanyId) : null,
        company: company ? {
          _id: company._id,
          displayName: company.displayName,
          normalizedHandle: company.normalizedHandle,
          logoStorageId: company.logoStorageId,
          status: company.status,
        } : null,
        role: membership.role,
        projectStatus: visibleProject.status,
        projectType: projectType === 'legacy'
          ? 'legacy' as const
          : project.origin === 'shared' ? 'shared' as const : 'company' as const,
        memberCount: Math.min(projectMembers.length, 500),
        memberCountTruncated: projectMembers.length > 500,
        channelCount: archiveEntitlement?.channelCount ?? channelMemberships.length,
        channelCountTruncated: channelMemberships.length > 1000,
        lastActivityAt: project.updatedAt,
      }
    }))
    return items.filter((item): item is NonNullable<typeof item> => item !== null)
  },
})

export const getSnapshotState = query({
  args: {
    projectId: v.id('projects'),
    actingCompanyId: v.optional(v.id('companies')),
    projectMemberId: v.optional(v.id('projectMembers')),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    const access = await authorizeScopedRequest(ctx, {
      ...args,
      claimedUserId: actor.userId,
    }, 'readProject')
    if (access.companyAccess?.entitlement) return null
    const operation = await readProjectSnapshotState(ctx, args.projectId)
    if (!operation) return null
    const participation = await ctx.db.get(operation.projectCompanyId)
    return {
      status: operation.status === 'failed' ? 'failed' as const : 'capturing' as const,
      phase: operation.phase,
      stagedCount: operation.stagedCount,
      canManageCapture: Boolean(
        access.companyAccess &&
        participation?.companyId === access.companyAccess.company._id &&
        canAdministerCompany(access.companyAccess.companyMember.role),
      ),
    }
  },
})

export const list = query({
  args: {
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    assertActorMatches(actor, args.userId)
    const memberships = await ctx.db
      .query('projectMembers')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .collect()

    const projects = await Promise.all(
      memberships.map(async (membership) => {
        const project = await ctx.db.get(membership.projectId)
        return project && (!project.accessProfile || project.accessProfile === 'legacy') ? { project, membership } : null
      }),
    )

    return projects.filter((project) => project !== null)
  },
})

export const listMembers = query({
  args: {
    projectId: v.id('projects'),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    assertActorMatches(actor, args.userId)
    await requireProjectMember(ctx, args.projectId, args.userId)
    const memberships = await ctx.db
      .query('projectMembers')
      .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
      .collect()

    return await Promise.all(
      memberships.map(async (membership) => {
        const user = await ctx.db.get(membership.userId)
        return { membership, user }
      }),
    )
  },
})

export const create = mutation({
  args: {
    userId: v.id('users'),
    name: v.string(),
    clientLabel: v.optional(v.string()),
    markIconKey: v.optional(v.union(v.null(), ...entityMarkIconKeys.map((key) => v.literal(key)))),
    markColorKey: v.optional(v.union(v.null(), ...entityMarkColorKeys.map((key) => v.literal(key)))),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    assertActorMatches(actor, args.userId)
    const name = args.name.trim()
    if (!name) throw new Error('project_name_required')
    if (name.length > 120) throw new Error('project_name_too_long')
    const clientLabel = args.clientLabel?.trim() || undefined
    const now = Date.now()
    const existingMembership = await ctx.db
      .query('projectMembers')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .first()

    if (existingMembership) {
      const existingProject = await ctx.db.get(existingMembership.projectId)
      if (
        existingProject &&
        existingMembership.role !== 'owner' &&
        existingMembership.role !== 'admin'
      ) {
        throw new Error('not_allowed_to_create_project')
      }
    }

    const projectId = await ctx.db.insert('projects', {
      name,
      clientLabel,
      accessProfile: 'legacy',
      origin: 'single_company',
      status: 'active',
      participantRevision: 0,
      revision: 1,
      createdBy: args.userId,
      createdAt: now,
      updatedAt: now,
    })

    const projectMemberId = await ctx.db.insert('projectMembers', {
      projectId,
      userId: args.userId,
      role: 'owner',
      status: 'active',
      term: 1,
      createdAt: now,
      updatedAt: now,
    })

    for (const group of defaultGroups) {
      const groupId = await ctx.db.insert('groups', {
        projectId,
        kind: group.kind,
        name: group.name,
        status: 'active',
        revision: 1,
        createdBy: args.userId,
        createdAt: now,
        updatedAt: now,
      })

      if (canRoleJoinDefaultGroup('owner', group.kind)) {
        await ctx.db.insert('groupMembers', {
          projectId,
          groupId,
          userId: args.userId,
          projectMemberId,
          status: 'active',
          createdAt: now,
          updatedAt: now,
        })
      }
    }

    await appendAuditEvent(ctx, {
      projectId,
      actorId: args.userId,
      entityType: 'project',
      entityId: projectId,
      action: 'project.created',
      after: { name, clientLabel },
    })

    return projectId
  },
})

export const update = mutation({
  args: {
    projectId: v.id('projects'),
    userId: v.id('users'),
    name: v.string(),
    clientLabel: v.optional(v.string()),
    markIconKey: v.optional(v.union(v.null(), ...entityMarkIconKeys.map((key) => v.literal(key)))),
    markColorKey: v.optional(v.union(v.null(), ...entityMarkColorKeys.map((key) => v.literal(key)))),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    assertActorMatches(actor, args.userId)
    await requireProjectManager(ctx, args.projectId, args.userId)
    await assertProjectSnapshotWritable(ctx, args.projectId)
    const project = await ctx.db.get(args.projectId)
    if (!project) throw new Error('project_not_found')
    const name = args.name.trim()
    if (!name) throw new Error('project_name_required')
    const clientLabel = args.clientLabel?.trim() || undefined

    await ctx.db.patch(args.projectId, {
      name,
      clientLabel,
      ...(args.markIconKey !== undefined ? { markIconKey: args.markIconKey ?? undefined } : {}),
      ...(args.markColorKey !== undefined ? { markColorKey: args.markColorKey ?? undefined } : {}),
      updatedAt: Date.now(),
    })

    await appendAuditEvent(ctx, {
      projectId: args.projectId,
      actorId: args.userId,
      entityType: 'project',
      entityId: args.projectId,
      action: 'project.updated',
      before: { name: project.name, clientLabel: project.clientLabel, markIconKey: project.markIconKey, markColorKey: project.markColorKey },
      after: { name, clientLabel, markIconKey: args.markIconKey === undefined ? project.markIconKey : args.markIconKey ?? undefined, markColorKey: args.markColorKey === undefined ? project.markColorKey : args.markColorKey ?? undefined },
    })
  },
})

export const remove = mutation({
  args: {
    projectId: v.id('projects'),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    assertActorMatches(actor, args.userId)
    await requireProjectOwner(ctx, args.projectId, args.userId)
    await assertProjectSnapshotWritable(ctx, args.projectId)
    const project = await ctx.db.get(args.projectId)
    if (!project) throw new Error('project_not_found')

    const groups = await ctx.db.query('groups').withIndex('by_project', (q) => q.eq('projectId', args.projectId)).collect()
    const [
      projectMembers,
      invitations,
      messages,
      attachments,
      typingIndicators,
      assistantStreams,
      auditEvents,
      memoryBoxes,
      memoryImports,
      memoryPathLocks,
      channelThreads,
      channelThreadFollowers,
      channelThreadReadStates,
      groupReadStates,
      uploadIntents,
    ] = await Promise.all([
      ctx.db.query('projectMembers').withIndex('by_project', (q) => q.eq('projectId', args.projectId)).collect(),
      Promise.all(
        (['pending', 'accepted', 'revoked', 'expired'] as const).map((status) =>
          ctx.db.query('invitations').withIndex('by_project_status', (q) => q.eq('projectId', args.projectId).eq('status', status)).collect(),
        ),
      ).then((rows) => rows.flat()),
      ctx.db.query('messages').withIndex('by_project_created_at', (q) => q.eq('projectId', args.projectId)).collect(),
      ctx.db.query('attachments').withIndex('by_project', (q) => q.eq('projectId', args.projectId)).collect(),
      ctx.db.query('typingIndicators').withIndex('by_project', (q) => q.eq('projectId', args.projectId)).collect(),
      ctx.db.query('assistantStreams').withIndex('by_project', (q) => q.eq('projectId', args.projectId)).collect(),
      ctx.db.query('auditEvents').withIndex('by_project_created_at', (q) => q.eq('projectId', args.projectId)).collect(),
      ctx.db.query('projectMemoryBoxes').withIndex('by_project', (q) => q.eq('projectId', args.projectId)).collect(),
      ctx.db.query('memoryImports').withIndex('by_project_created_at', (q) => q.eq('projectId', args.projectId)).collect(),
      ctx.db.query('memoryPathLocks').withIndex('by_project_path', (q) => q.eq('projectId', args.projectId)).collect(),
      ctx.db.query('channelThreads').withIndex('by_project', (q) => q.eq('projectId', args.projectId)).collect(),
      ctx.db.query('channelThreadFollowers').withIndex('by_project', (q) => q.eq('projectId', args.projectId)).collect(),
      ctx.db.query('channelThreadReadStates').withIndex('by_project', (q) => q.eq('projectId', args.projectId)).collect(),
      Promise.all(groups.map((group) => ctx.db.query('groupReadStates').withIndex('by_group', (q) => q.eq('groupId', group._id)).collect())).then((rows) => rows.flat()),
      Promise.all(groups.map((group) => ctx.db.query('messageUploadIntents').withIndex('by_group', (q) => q.eq('groupId', group._id)).collect())).then((rows) => rows.flat()),
    ])
    const groupNotificationSettings = (await Promise.all(groups.map((group) =>
      ctx.db.query('groupNotificationSettings').withIndex('by_group', (q) => q.eq('groupId', group._id)).collect(),
    ))).flat()

    await appendAuditEvent(ctx, {
      projectId: args.projectId,
      actorId: args.userId,
      entityType: 'project',
      entityId: args.projectId,
      action: 'project.deleted',
      before: { name: project.name, clientLabel: project.clientLabel },
    })

    const projectAttachments = attachments
    await Promise.all(projectAttachments.flatMap((attachment) => [attachment.storageId, attachment.previewStorageId]
      .filter((storageId): storageId is Id<'_storage'> => Boolean(storageId))
      .map((storageId) => ctx.storage.delete(storageId).catch(() => undefined))))
    for (const message of messages) await invalidateTaskEvidence(ctx, { messageId: message._id })
    for (const attachment of projectAttachments) await invalidateTaskEvidence(ctx, { attachmentId: attachment._id })
    for (const stream of assistantStreams) {
      await invalidateTaskEvidence(ctx, { assistantStreamId: stream._id })
    }
    await deleteTaskProjectData(ctx, args.projectId)
    for (const row of memoryBoxes) {
      await ctx.scheduler.runAfter(0, (internal as any).memoryActions.deleteMemoryBoxById, {
        actorId: args.userId,
        boxId: row.boxId,
        projectId: args.projectId,
      })
    }

    for (const row of groupNotificationSettings) await ctx.db.delete(row._id)
    for (const row of memoryPathLocks) await ctx.db.delete(row._id)
    for (const row of memoryImports) await ctx.db.delete(row._id)
    for (const row of memoryBoxes) await ctx.db.delete(row._id)
    for (const row of channelThreadReadStates) await ctx.db.delete(row._id)
    for (const row of channelThreadFollowers) await ctx.db.delete(row._id)
    for (const row of channelThreads) await ctx.db.delete(row._id)
    for (const row of groupReadStates) await ctx.db.delete(row._id)
    for (const row of uploadIntents) {
      if (row.storageId) await ctx.storage.delete(row.storageId).catch(() => undefined)
      await ctx.db.delete(row._id)
    }
    for (const row of assistantStreams) await ctx.db.delete(row._id)
    for (const row of typingIndicators) await ctx.db.delete(row._id)
    for (const row of projectAttachments) await ctx.db.delete(row._id)
    for (const row of messages) {
      const hides = await ctx.db.query('messageHides')
        .withIndex('by_message', (q) => q.eq('messageId', row._id))
        .collect()
      for (const hide of hides) await ctx.db.delete(hide._id)
      await ctx.db.delete(row._id)
    }
    for (const row of invitations) await ctx.db.delete(row._id)
    for (const row of projectMembers) await ctx.db.delete(row._id)
    for (const row of groups) await ctx.db.delete(row._id)
    for (const row of auditEvents) await ctx.db.delete(row._id)
    await ctx.db.delete(args.projectId)
  },
})

export const ensureStarter = mutation({
  args: {
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    assertActorMatches(actor, args.userId)
    const existingMembership = await ctx.db
      .query('projectMembers')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .first()

    if (existingMembership) return existingMembership.projectId

    const now = Date.now()
    const projectId = await ctx.db.insert('projects', {
      name: 'Default',
      clientLabel: 'Internal product build',
      accessProfile: 'legacy',
      origin: 'single_company',
      status: 'active',
      participantRevision: 0,
      revision: 1,
      createdBy: args.userId,
      createdAt: now,
      updatedAt: now,
    })

    const projectMemberId = await ctx.db.insert('projectMembers', {
      projectId,
      userId: args.userId,
      role: 'owner',
      status: 'active',
      term: 1,
      createdAt: now,
      updatedAt: now,
    })

    for (const group of defaultGroups) {
      const groupId = await ctx.db.insert('groups', {
        projectId,
        kind: group.kind,
        name: group.name,
        status: 'active',
        revision: 1,
        createdBy: args.userId,
        createdAt: now,
        updatedAt: now,
      })

      await ctx.db.insert('groupMembers', {
        projectId,
        groupId,
        userId: args.userId,
        projectMemberId,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      })
    }

    await appendAuditEvent(ctx, {
      projectId,
      actorId: args.userId,
      entityType: 'project',
      entityId: projectId,
      action: 'project.created',
      after: { name: 'Default', clientLabel: 'Internal product build' },
    })

    return projectId
  },
})

export const getOverview = query({
  args: {
    projectId: v.id('projects'),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    assertActorMatches(actor, args.userId)
    await requireProjectMember(ctx, args.projectId, args.userId)
    const project = await ctx.db.get(args.projectId)
    const groups = await ctx.db
      .query('groups')
      .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
      .collect()
    return {
      project,
      groups,
    }
  },
})
