import { assertProjectSnapshotWritable } from './lib/projectSnapshotLock'
import { v } from 'convex/values'
import { isActiveChannelMembership } from '@track/shared/channel-membership'

import { mutation, query } from './_generated/server'
import { appendAuditEvent } from './lib/audit'
import { assertActorMatches, requireAuthenticatedActor } from './lib/actorContext'
import { listActiveChannelMemberships } from './lib/channelMembership'
import { resolveCompanyProjectAccess } from './lib/companyPolicy'
import {
  canRoleJoinDefaultGroup,
  requireGroupMember,
  requireProjectManager,
  requireProjectMember,
} from './lib/permissions'
import { invalidateTaskEvidence } from './lib/taskEvidence'

const role = v.union(
  v.literal('owner'),
  v.literal('admin'),
  v.literal('staff'),
  v.literal('client'),
)

export const listVisible = query({
  args: {
    projectId: v.id('projects'),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    assertActorMatches(actor, args.userId)
    await requireProjectMember(ctx, args.projectId, args.userId)
    const memberships = await ctx.db
      .query('groupMembers')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .collect()
    const visibleMemberships = memberships.filter(
      (membership) =>
        membership.projectId === args.projectId &&
        isActiveChannelMembership(membership, 'legacy'),
    )

    const groups = await Promise.all(
      visibleMemberships.map(async (membership) => await ctx.db.get(membership.groupId)),
    )

    return groups.filter((group) => group !== null)
  },
})

export const create = mutation({
  args: {
    projectId: v.id('projects'),
    userId: v.id('users'),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    assertActorMatches(actor, args.userId)
    await requireProjectManager(ctx, args.projectId, args.userId)
    await assertProjectSnapshotWritable(ctx, args.projectId)
    const now = Date.now()
    const groupId = await ctx.db.insert('groups', {
      projectId: args.projectId,
      kind: 'custom',
      name: args.name,
      status: 'active',
      revision: 1,
      createdBy: args.userId,
      createdAt: now,
      updatedAt: now,
    })
    await ctx.db.insert('groupMembers', {
      projectId: args.projectId,
      groupId,
      userId: args.userId,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    })
    await appendAuditEvent(ctx, {
      projectId: args.projectId,
      groupId,
      actorId: args.userId,
      entityType: 'group',
      entityId: groupId,
      action: 'group.created',
      after: { name: args.name },
    })
    return groupId
  },
})

export const update = mutation({
  args: {
    projectId: v.id('projects'),
    groupId: v.id('groups'),
    userId: v.id('users'),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    assertActorMatches(actor, args.userId)
    await requireProjectManager(ctx, args.projectId, args.userId)
    await assertProjectSnapshotWritable(ctx, args.projectId)
    const group = await ctx.db.get(args.groupId)
    if (!group || group.projectId !== args.projectId) throw new Error('group_not_found')
    const name = args.name.trim()
    if (!name) throw new Error('group_name_required')

    await ctx.db.patch(args.groupId, {
      name,
      updatedAt: Date.now(),
    })

    await appendAuditEvent(ctx, {
      projectId: args.projectId,
      groupId: args.groupId,
      actorId: args.userId,
      entityType: 'group',
      entityId: args.groupId,
      action: 'group.updated',
      before: { name: group.name },
      after: { name },
    })
  },
})

export const remove = mutation({
  args: {
    projectId: v.id('projects'),
    groupId: v.id('groups'),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    assertActorMatches(actor, args.userId)
    await requireProjectManager(ctx, args.projectId, args.userId)
    await assertProjectSnapshotWritable(ctx, args.projectId)
    const group = await ctx.db.get(args.groupId)
    if (!group || group.projectId !== args.projectId) throw new Error('group_not_found')

    const [
      groupMembers,
      groupReadStates,
      messages,
      attachments,
      typingIndicators,
      groupNotificationSettings,
      invitations,
      channelThreads,
    ] = await Promise.all([
      ctx.db.query('groupMembers').withIndex('by_group', (q) => q.eq('groupId', args.groupId)).collect(),
      ctx.db.query('groupReadStates').withIndex('by_group', (q) => q.eq('groupId', args.groupId)).collect(),
      ctx.db.query('messages').withIndex('by_group_created_at', (q) => q.eq('groupId', args.groupId)).collect(),
      ctx.db.query('attachments').withIndex('by_group', (q) => q.eq('groupId', args.groupId)).collect(),
      ctx.db.query('typingIndicators').withIndex('by_group_updated_at', (q) => q.eq('groupId', args.groupId)).collect(),
      ctx.db.query('groupNotificationSettings').collect(),
      Promise.all(
        (['pending', 'accepted', 'revoked', 'expired'] as const).map((status) =>
          ctx.db.query('invitations').withIndex('by_project_status', (q) => q.eq('projectId', args.projectId).eq('status', status)).collect(),
        ),
      ).then((rows) => rows.flat()),
      Promise.all(
        (['active', 'archived'] as const).map((status) =>
          ctx.db
            .query('channelThreads')
            .withIndex('by_group_status_updated_at', (q) =>
              q.eq('groupId', args.groupId).eq('status', status),
            )
            .collect(),
        ),
      ).then((rows) => rows.flat()),
    ])
    const channelThreadIds = new Set(channelThreads.map((thread) => String(thread._id)))
    const [threadFollowers, threadReadStates] = await Promise.all([
      ctx.db.query('channelThreadFollowers').withIndex('by_group', (q) => q.eq('groupId', args.groupId)).collect(),
      ctx.db.query('channelThreadReadStates').withIndex('by_group_project_member', (q) => q.eq('groupId', args.groupId)).collect(),
    ])

    await appendAuditEvent(ctx, {
      projectId: args.projectId,
      groupId: args.groupId,
      actorId: args.userId,
      entityType: 'group',
      entityId: args.groupId,
      action: 'group.deleted',
      before: { name: group.name, kind: group.kind },
    })

    await Promise.all(attachments.map((attachment) => ctx.storage.delete(attachment.storageId).catch(() => undefined)))
    for (const message of messages) await invalidateTaskEvidence(ctx, { messageId: message._id })
    for (const attachment of attachments) await invalidateTaskEvidence(ctx, { attachmentId: attachment._id })

    for (const row of groupNotificationSettings) {
      if (row.groupId === args.groupId) await ctx.db.delete(row._id)
    }
    for (const row of invitations) {
      if (row.groupId === args.groupId) await ctx.db.delete(row._id)
    }
    for (const row of threadReadStates) {
      if (channelThreadIds.has(String(row.channelThreadId))) await ctx.db.delete(row._id)
    }
    for (const row of threadFollowers) {
      if (channelThreadIds.has(String(row.channelThreadId))) await ctx.db.delete(row._id)
    }
    for (const row of channelThreads) await ctx.db.delete(row._id)
    for (const row of typingIndicators) await ctx.db.delete(row._id)
    for (const row of attachments) await ctx.db.delete(row._id)
    for (const row of messages) await ctx.db.delete(row._id)
    for (const row of groupReadStates) await ctx.db.delete(row._id)
    for (const row of groupMembers) await ctx.db.delete(row._id)
    await ctx.db.delete(args.groupId)
  },
})

export const addProjectMember = mutation({
  args: {
    projectId: v.id('projects'),
    actorId: v.id('users'),
    userId: v.id('users'),
    role,
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    assertActorMatches(actor, args.actorId)
    await requireProjectManager(ctx, args.projectId, args.actorId)
    await assertProjectSnapshotWritable(ctx, args.projectId)
    const now = Date.now()
    const existing = await ctx.db
      .query('projectMembers')
      .withIndex('by_project_user', (q) =>
        q.eq('projectId', args.projectId).eq('userId', args.userId),
      )
      .unique()

    if (existing) {
      await ctx.db.patch(existing._id, {
        role: args.role,
        updatedAt: now,
      })
    } else {
      await ctx.db.insert('projectMembers', {
        projectId: args.projectId,
        userId: args.userId,
        role: args.role,
        status: 'active',
        term: 1,
        createdAt: now,
        updatedAt: now,
      })
    }

    const groups = await ctx.db
      .query('groups')
      .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
      .collect()

    for (const group of groups) {
      if (!canRoleJoinDefaultGroup(args.role, group.kind)) continue
      const existingGroupMember = await ctx.db
        .query('groupMembers')
        .withIndex('by_group_user', (q) =>
          q.eq('groupId', group._id).eq('userId', args.userId),
        )
        .unique()
      if (!existingGroupMember) {
        await ctx.db.insert('groupMembers', {
          projectId: args.projectId,
          groupId: group._id,
          userId: args.userId,
          status: 'active',
          createdAt: now,
          updatedAt: now,
        })
      }
    }

    await appendAuditEvent(ctx, {
      projectId: args.projectId,
      actorId: args.actorId,
      entityType: 'projectMember',
      entityId: args.userId,
      action: 'project_member.upserted',
      after: {
        userId: args.userId,
        role: args.role,
      },
    })
  },
})

export const addGroupMember = mutation({
  args: {
    projectId: v.id('projects'),
    groupId: v.id('groups'),
    actorId: v.id('users'),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    assertActorMatches(actor, args.actorId)
    await requireProjectManager(ctx, args.projectId, args.actorId)
    await assertProjectSnapshotWritable(ctx, args.projectId)
    await requireProjectMember(ctx, args.projectId, args.userId)
    const now = Date.now()
    const existing = await ctx.db
      .query('groupMembers')
      .withIndex('by_group_user', (q) =>
        q.eq('groupId', args.groupId).eq('userId', args.userId),
      )
      .unique()
    if (!existing) {
      await ctx.db.insert('groupMembers', {
        projectId: args.projectId,
        groupId: args.groupId,
        userId: args.userId,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      })
    }
    await appendAuditEvent(ctx, {
      projectId: args.projectId,
      groupId: args.groupId,
      actorId: args.actorId,
      entityType: 'groupMember',
      entityId: args.userId,
      action: 'group_member.added',
      after: { userId: args.userId },
    })
  },
})

export const listMembers = query({
  args: {
    groupId: v.id('groups'),
    userId: v.id('users'),
    actingCompanyId: v.optional(v.id('companies')),
    projectMemberId: v.optional(v.id('projectMembers')),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    assertActorMatches(actor, args.userId)
    const hasActingCompany = args.actingCompanyId !== undefined
    const hasProjectMember = args.projectMemberId !== undefined
    if (hasActingCompany !== hasProjectMember) throw new Error('represented_context_required')
    let memberships: Awaited<ReturnType<typeof listActiveChannelMemberships>>
    if (args.actingCompanyId && args.projectMemberId) {
      const group = await ctx.db.get(args.groupId)
      if (!group) throw new Error('channel_unavailable')
      const access = await resolveCompanyProjectAccess(ctx, actor, {
        projectId: group.projectId,
        actingCompanyId: args.actingCompanyId,
        projectMemberId: args.projectMemberId,
        groupId: group._id,
      })
      if (!access.capabilities.canWriteChannel) throw new Error('channel_write_required')
      memberships = await listActiveChannelMemberships(ctx, args.groupId, 'company')
    } else {
      await requireGroupMember(ctx, args.groupId, args.userId)
      memberships = await listActiveChannelMemberships(ctx, args.groupId, 'legacy')
    }
    const members = await Promise.all(
      memberships.map(async (membership) => {
        const user = await ctx.db.get(membership.userId)
        return { membership, user }
      }),
    )
    return members.filter((item) => item.user !== null)
  },
})
