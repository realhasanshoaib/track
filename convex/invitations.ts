import { assertProjectSnapshotWritable } from './lib/projectSnapshotLock'
import { v } from 'convex/values'

import { mutation, query } from './_generated/server'
import { internal } from './_generated/api'
import { appendAuditEvent } from './lib/audit'
import { assertActorMatches, requireAuthenticatedActor } from './lib/actorContext'
import {
  canRoleJoinDefaultGroup,
  requireProjectManager,
  requireProjectMember,
} from './lib/permissions'

const role = v.union(
  v.literal('owner'),
  v.literal('admin'),
  v.literal('staff'),
  v.literal('client'),
)

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function newInviteToken() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`
}

export const listForProject = query({
  args: {
    projectId: v.id('projects'),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    assertActorMatches(actor, args.userId)
    await requireProjectMember(ctx, args.projectId, args.userId)
    return await ctx.db
      .query('invitations')
      .withIndex('by_project_status', (q) => q.eq('projectId', args.projectId))
      .order('desc')
      .take(50)
  },
})

export const listPendingForCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireAuthenticatedActor(ctx)
    const pending = await ctx.db
      .query('invitations')
      .withIndex('by_email_status', (q) =>
        q.eq('email', normalizeEmail(actor.user.email)).eq('status', 'pending'),
      )
      .order('desc')
      .take(50)
    const rows = await Promise.all(pending.map(async (invitation) => {
      if (invitation.expiresAt <= Date.now()) return null
      const [project, group] = await Promise.all([
        ctx.db.get(invitation.projectId),
        invitation.groupId ? ctx.db.get(invitation.groupId) : null,
      ])
      if (!project || project.status === 'archived' || project.status === 'archive_pending') return null
      return {
        id: invitation._id,
        projectId: project._id,
        projectName: project.name,
        groupName: group?.name,
        createdAt: invitation.createdAt,
      }
    }))
    return rows.filter((row): row is NonNullable<typeof row> => row !== null)
  },
})

export const create = mutation({
  args: {
    projectId: v.id('projects'),
    groupId: v.optional(v.id('groups')),
    invitedBy: v.id('users'),
    email: v.string(),
    role,
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    assertActorMatches(actor, args.invitedBy)
    await requireProjectManager(ctx, args.projectId, args.invitedBy)
    await assertProjectSnapshotWritable(ctx, args.projectId)
    const email = normalizeEmail(args.email)
    if (!email.includes('@')) throw new Error('invalid_email')

    const now = Date.now()
    const inviteId = await ctx.db.insert('invitations', {
      projectId: args.projectId,
      groupId: args.groupId,
      email,
      role: args.role,
      invitedBy: args.invitedBy,
      status: 'pending',
      token: newInviteToken(),
      expiresAt: now + 1000 * 60 * 60 * 24 * 14,
      createdAt: now,
      updatedAt: now,
    })

    await appendAuditEvent(ctx, {
      projectId: args.projectId,
      groupId: args.groupId,
      actorId: args.invitedBy,
      entityType: 'invitation',
      entityId: inviteId,
      action: 'invitation.created',
      after: {
        email,
        role: args.role,
        groupId: args.groupId,
      },
    })

    const recipient = await ctx.db
      .query('users')
      .withIndex('by_normalized_email', (q) => q.eq('normalizedEmail', email))
      .unique()
    if (recipient) {
      await ctx.scheduler.runAfter(0, internal.pushNotifications.deliverProjectInvitation, {
        invitationId: inviteId,
      })
    }

    return inviteId
  },
})

export const acceptPendingForCurrentUser = mutation({
  args: {
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    assertActorMatches(actor, args.userId)
    const user = await ctx.db.get(args.userId)
    if (!user) throw new Error('user_not_found')
    const now = Date.now()
    const pending = await ctx.db
      .query('invitations')
      .withIndex('by_email_status', (q) =>
        q.eq('email', normalizeEmail(user.email)).eq('status', 'pending'),
      )
      .collect()

    const accepted: Array<string> = []

    for (const invite of pending) {
      if (invite.expiresAt < now) {
        await ctx.db.patch(invite._id, {
          status: 'expired',
          updatedAt: now,
        })
        continue
      }

      const existingProjectMember = await ctx.db
        .query('projectMembers')
        .withIndex('by_project_user', (q) =>
          q.eq('projectId', invite.projectId).eq('userId', args.userId),
        )
        .unique()

      if (existingProjectMember) {
        await ctx.db.patch(existingProjectMember._id, {
          role: invite.role,
          updatedAt: now,
        })
      } else {
        await ctx.db.insert('projectMembers', {
          projectId: invite.projectId,
          userId: args.userId,
          role: invite.role,
          status: 'active',
          term: 1,
          createdAt: now,
          updatedAt: now,
        })
      }

      const groups = invite.groupId
        ? [await ctx.db.get(invite.groupId)]
        : await ctx.db
            .query('groups')
            .withIndex('by_project', (q) => q.eq('projectId', invite.projectId))
            .collect()

      for (const group of groups) {
        if (!group) continue
        if (!invite.groupId && !canRoleJoinDefaultGroup(invite.role, group.kind)) continue
        const existingGroupMember = await ctx.db
          .query('groupMembers')
          .withIndex('by_group_user', (q) =>
            q.eq('groupId', group._id).eq('userId', args.userId),
          )
          .unique()
        if (!existingGroupMember) {
          await ctx.db.insert('groupMembers', {
            projectId: invite.projectId,
            groupId: group._id,
            userId: args.userId,
            status: 'active',
            createdAt: now,
            updatedAt: now,
          })
        }
      }

      await ctx.db.patch(invite._id, {
        status: 'accepted',
        acceptedBy: args.userId,
        acceptedAt: now,
        updatedAt: now,
      })

      await appendAuditEvent(ctx, {
        projectId: invite.projectId,
        groupId: invite.groupId,
        actorId: args.userId,
        entityType: 'invitation',
        entityId: invite._id,
        action: 'invitation.accepted',
        after: { email: user.email, role: invite.role },
      })

      accepted.push(invite._id)
    }

    return accepted
  },
})
