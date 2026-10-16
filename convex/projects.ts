import { v } from 'convex/values'
import { canAdministerCompany } from '@track/shared/company'

import { mutation, query } from './_generated/server'
import { appendAuditEvent } from './lib/audit'
import { assertActorMatches, requireAuthenticatedActor } from './lib/actorContext'
import { canRoleJoinDefaultGroup, requireProjectManager, requireProjectMember, requireProjectOwner } from './lib/permissions'
import { authorizeScopedRequest } from './lib/requestAuthorization'
import { assertProjectSnapshotWritable, readProjectSnapshotState } from './lib/projectSnapshotLock'

const defaultGroups = [
  { kind: 'general', name: 'General' },
  { kind: 'internal', name: 'Internal' },
  { kind: 'commercials', name: 'Commercials' },
] as const

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
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    assertActorMatches(actor, args.userId)
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
      name: args.name,
      clientLabel: args.clientLabel,
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
      after: { name: args.name, clientLabel: args.clientLabel },
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
      updatedAt: Date.now(),
    })

    await appendAuditEvent(ctx, {
      projectId: args.projectId,
      actorId: args.userId,
      entityType: 'project',
      entityId: args.projectId,
      action: 'project.updated',
      before: { name: project.name, clientLabel: project.clientLabel },
      after: { name, clientLabel },
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

    const [
      groups,
      projectMembers,
      invitations,
      messages,
      attachments,
      typingIndicators,
      auditEvents,
      groupNotificationSettings,
      channelThreads,
      channelThreadFollowers,
      channelThreadReadStates,
    ] = await Promise.all([
      ctx.db.query('groups').withIndex('by_project', (q) => q.eq('projectId', args.projectId)).collect(),
      ctx.db.query('projectMembers').withIndex('by_project', (q) => q.eq('projectId', args.projectId)).collect(),
      Promise.all(
        (['pending', 'accepted', 'revoked', 'expired'] as const).map((status) =>
          ctx.db.query('invitations').withIndex('by_project_status', (q) => q.eq('projectId', args.projectId).eq('status', status)).collect(),
        ),
      ).then((rows) => rows.flat()),
      ctx.db.query('messages').withIndex('by_project_created_at', (q) => q.eq('projectId', args.projectId)).collect(),
      ctx.db.query('attachments').collect(),
      ctx.db.query('typingIndicators').collect(),
      ctx.db.query('auditEvents').withIndex('by_project_created_at', (q) => q.eq('projectId', args.projectId)).collect(),
      ctx.db.query('groupNotificationSettings').collect(),
      ctx.db.query('channelThreads').withIndex('by_project', (q) => q.eq('projectId', args.projectId)).collect(),
      ctx.db.query('channelThreadFollowers').withIndex('by_project', (q) => q.eq('projectId', args.projectId)).collect(),
      ctx.db.query('channelThreadReadStates').withIndex('by_project', (q) => q.eq('projectId', args.projectId)).collect(),
    ])
    const groupIds = new Set(groups.map((group) => group._id))

    await appendAuditEvent(ctx, {
      projectId: args.projectId,
      actorId: args.userId,
      entityType: 'project',
      entityId: args.projectId,
      action: 'project.deleted',
      before: { name: project.name, clientLabel: project.clientLabel },
    })

    const projectAttachments = attachments.filter((attachment) => attachment.projectId === args.projectId)
    await Promise.all(projectAttachments.map((attachment) => ctx.storage.delete(attachment.storageId).catch(() => undefined)))
    for (const row of groupNotificationSettings) {
      if (groupIds.has(row.groupId)) await ctx.db.delete(row._id)
    }
    for (const row of channelThreadReadStates) await ctx.db.delete(row._id)
    for (const row of channelThreadFollowers) await ctx.db.delete(row._id)
    for (const row of channelThreads) await ctx.db.delete(row._id)
    for (const row of typingIndicators) {
      if (row.projectId === args.projectId) await ctx.db.delete(row._id)
    }
    for (const row of projectAttachments) await ctx.db.delete(row._id)
    for (const row of messages) await ctx.db.delete(row._id)
    for (const row of invitations) await ctx.db.delete(row._id)
    for (const row of projectMembers) await ctx.db.delete(row._id)
    for (const group of groups) {
      const [groupMembers, groupReadStates] = await Promise.all([
        ctx.db.query('groupMembers').withIndex('by_group', (q) => q.eq('groupId', group._id)).collect(),
        ctx.db.query('groupReadStates').withIndex('by_group', (q) => q.eq('groupId', group._id)).collect(),
      ])
      for (const row of groupMembers) await ctx.db.delete(row._id)
      for (const row of groupReadStates) await ctx.db.delete(row._id)
      await ctx.db.delete(group._id)
    }
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
