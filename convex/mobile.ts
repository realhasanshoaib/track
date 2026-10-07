import { v } from 'convex/values'
import { paginationOptsValidator, type PaginationResult } from 'convex/server'
import { isTerminalTaskState } from '@track/shared/tasks'
import { resolveReleaseFeatureFlag } from '@track/shared/feature-flags'

import { mutation, query } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import { assertActorMatches, requireAuthenticatedActor } from './lib/actorContext'
import { authorizeScopedRequest } from './lib/requestAuthorization'
import { requireActiveCompanyMembership, requireCompanyModelEnabled } from './lib/companyPolicy'
import { getGroupUnreadCount } from './lib/groupUnreadCount'
import { requireTaskAccess } from './lib/taskPolicy'
import { taskView } from './lib/taskData'
import { suggestionAccess, suggestionReferenceVisible } from './taskSuggestions'
import { normalizeEmail } from './lib/companyInvitations'
import {
  getArchivedChannelSnapshot,
  listArchivedChannelVisibilityPage,
  listArchivedMemberSnapshotsPage,
} from './lib/projectExitArchive'
import {
  decodeLegacyArchivedChannel,
  decodeLegacyArchivedMember,
  decodeLegacyArchivedProject,
  paginateLegacySnapshot,
} from './lib/legacyArchiveSnapshot'

const platform = v.union(v.literal('web'), v.literal('ios'), v.literal('android'))
function attentionPriority(item: { eventType: string }) {
  switch (item.eventType) {
    case 'company_invitation': return 0
    case 'overdue': return 1
    case 'mention': return 2
    case 'direct_reply': return 3
    case 'due_soon': return 4
    case 'assignment': return 5
    case 'task_suggestion': return 6
    default: return 7
  }
}

type MobileMemberRow = {
  membership: {
    _id: Id<'projectMembers'>
    userId: Id<'users'>
    role: Doc<'projectMembers'>['role']
    companyId?: Id<'companies'>
  }
  user: { _id: Id<'users'>; displayName: string } | null
  company: { _id: Id<'companies'>; displayName: string } | null
}

type MobileGroupRow = {
  group: { _id: Id<'groups'>; projectId: Id<'projects'>; name: string; kind: string; status?: string; markIconKey?: string; markColorKey?: string }
  membership: { _id: string; groupId: Id<'groups'>; projectId: Id<'projects'> }
  lastMessage: Doc<'messages'> | null
  unreadCount: number
}

const directoryScopeArgs = {
  projectId: v.id('projects'),
  userId: v.id('users'),
  actingCompanyId: v.optional(v.id('companies')),
  projectMemberId: v.optional(v.id('projectMembers')),
  paginationOpts: paginationOptsValidator,
}

export const listProjectMembersPage = query({
  args: directoryScopeArgs,
  handler: async (ctx, args): Promise<PaginationResult<MobileMemberRow>> => {
    const access = await authorizeScopedRequest(ctx, {
      ...args, claimedUserId: args.userId,
    }, 'readProject')
    const options = { ...args.paginationOpts, numItems: Math.max(1, Math.min(100, args.paginationOpts.numItems)) }
    const entitlement = access.companyAccess?.entitlement
    if (entitlement) {
      const result = entitlement.snapshotOperationId
        ? await listArchivedMemberSnapshotsPage(ctx, { ...options, operationId: entitlement.snapshotOperationId })
        : paginateLegacySnapshot<unknown>(entitlement.memberSnapshots ?? [], options)
      return {
        ...result,
        page: result.page.map((value) => {
          const snapshot = decodeLegacyArchivedMember(ctx, value)
          return { ...snapshot, company: snapshot.company ?? null }
        }),
      }
    }
    const result = access.companyAccess
      ? await ctx.db.query('projectMembers').withIndex('by_project_status', (q) =>
          q.eq('projectId', args.projectId).eq('status', 'active')).paginate(options)
      : await ctx.db.query('projectMembers').withIndex('by_project', (q) =>
          // eslint-disable-next-line unicorn/no-useless-undefined -- reason: Convex compares absent optional fields explicitly.
          q.eq('projectId', args.projectId)).filter((q) => q.eq(q.field('companyId'), undefined)).paginate(options)
    return {
      ...result,
      page: await Promise.all(result.page.map(async (membership) => {
        const [user, company] = await Promise.all([
          ctx.db.get(membership.userId),
          membership.companyId ? ctx.db.get(membership.companyId) : null,
        ])
        return {
          membership,
          user: user ? { _id: user._id, displayName: user.displayName } : null,
          company: company ? { _id: company._id, displayName: company.displayName } : null,
        }
      })),
    }
  },
})

export const listGroupsPage = query({
  args: directoryScopeArgs,
  handler: async (ctx, args): Promise<PaginationResult<MobileGroupRow>> => {
    const access = await authorizeScopedRequest(ctx, {
      ...args, claimedUserId: args.userId,
    }, 'readProject')
    const options = { ...args.paginationOpts, numItems: Math.max(1, Math.min(100, args.paginationOpts.numItems)) }
    const entitlement = access.companyAccess?.entitlement
    const companyMemberId = access.companyAccess?.projectMember._id
    const legacyChannelSnapshots = entitlement && !entitlement.snapshotOperationId
      ? new Map(entitlement.channelSnapshots.map((value: unknown) => {
          const snapshot = decodeLegacyArchivedChannel(ctx, value)
          return [snapshot._id, snapshot] as const
        }))
      : null
    const result = entitlement
      ? entitlement.snapshotOperationId
        ? await listArchivedChannelVisibilityPage(ctx, {
            ...options, operationId: entitlement.snapshotOperationId,
            projectMemberId: entitlement.projectMemberId,
          })
        : paginateLegacySnapshot(entitlement.channelIds.map((groupId) => ({
            _id: String(groupId), groupId, projectId: args.projectId,
          })), options)
      : companyMemberId
        ? await ctx.db.query('groupMembers').withIndex('by_project_member_status', (q) =>
            q.eq('projectMemberId', companyMemberId).eq('status', 'active')).paginate(options)
        : await ctx.db.query('groupMembers').withIndex('by_project_user', (q) =>
            q.eq('projectId', args.projectId).eq('userId', args.userId)).paginate(options)
    const page = await Promise.all(result.page.map(async (membership): Promise<MobileGroupRow | null> => {
      const liveGroup = await ctx.db.get(membership.groupId)
      let group: MobileGroupRow['group'] | null = liveGroup
      if (entitlement) {
        const snapshot = entitlement.snapshotOperationId
          ? await getArchivedChannelSnapshot(ctx, entitlement.snapshotOperationId, membership.groupId)
          : legacyChannelSnapshots?.get(membership.groupId)
        if (!snapshot) throw new Error('archive_channel_snapshot_unavailable')
        group = { ...snapshot, projectId: args.projectId }
      }
      if (!group) return null
      const cutoff = entitlement?.exitAt
      const lastMessage = await ctx.db.query('messages').withIndex('by_group_thread_created_at', (q) =>
        cutoff
          // eslint-disable-next-line unicorn/no-useless-undefined -- reason: Convex compares absent optional fields explicitly.
          ? q.eq('groupId', membership.groupId).eq('channelThreadId', undefined).lte('createdAt', cutoff)
          // eslint-disable-next-line unicorn/no-useless-undefined -- reason: Convex compares absent optional fields explicitly.
          : q.eq('groupId', membership.groupId).eq('channelThreadId', undefined)).order('desc').first()
      const unreadCount = await getGroupUnreadCount(ctx, membership.groupId, args.userId, companyMemberId, cutoff)
      return { group, membership, lastMessage, unreadCount }
    }))
    return { ...result, page: page.filter((row) => row !== null) }
  },
})

export const listProjects = query({
  args: {
    userId: v.id('users'),
    actingCompanyId: v.optional(v.id('companies')),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    assertActorMatches(actor, args.userId)
    if (args.actingCompanyId) {
      requireCompanyModelEnabled()
      await requireActiveCompanyMembership(ctx, actor, args.actingCompanyId)
    }
    const memberships = args.actingCompanyId
      ? await ctx.db
        .query('projectMembers')
        .withIndex('by_user_company_status', (q) =>
          q.eq('userId', args.userId).eq('companyId', args.actingCompanyId),
        )
        .paginate(args.paginationOpts)
      : await ctx.db
        .query('projectMembers')
        .withIndex('by_user', (q) => q.eq('userId', args.userId))
        .paginate(args.paginationOpts)

    const rows = await Promise.all(
      memberships.page.filter((membership) => args.actingCompanyId
        ? membership.companyId === args.actingCompanyId && (membership.status === 'active' || membership.status === 'archived')
        : membership.status === undefined || membership.status === 'active' || membership.status === 'archived',
      ).map(async (membership) => {
        const project = await ctx.db.get(membership.projectId)
        if (!project) return null
        const memberRows = membership.status === 'archived'
          ? []
          : await ctx.db.query('projectMembers')
            .withIndex('by_project_status', (q) => q.eq('projectId', project._id).eq('status', 'active'))
            .take(4)
        const memberPreviews = memberRows.slice(0, 3)
        const members = await Promise.all(memberPreviews.map(async (projectMember) => {
          const user = await ctx.db.get(projectMember.userId)
          if (!user) return null
          return {
            id: user._id,
            name: projectMember.userDisplayNameSnapshot ?? user.displayName,
            avatarUrl: user.avatarStorageId ? await ctx.storage.getUrl(user.avatarStorageId) : null,
          }
        }))
        const groupMemberships = membership.companyId
          ? membership.status === 'archived'
            ? []
            : await ctx.db.query('groupMembers').withIndex('by_project_member_status', (q) =>
                q.eq('projectMemberId', membership._id).eq('status', 'active'),
              ).collect()
          : await ctx.db.query('groupMembers').withIndex('by_user', (q) => q.eq('userId', args.userId)).collect()
        const entitlement = membership.status === 'archived'
          ? await ctx.db.query('projectArchiveEntitlements').withIndex('by_member', (q) => q.eq('projectMemberId', membership._id)).unique()
          : null
        if (membership.status === 'archived' && entitlement?.retentionStatus !== 'active') return null
        const archiveOperationId = entitlement?.snapshotOperationId
        const projectGroupMemberships = entitlement
          ? archiveOperationId
            ? await ctx.db.query('projectExitChannelVisibility').withIndex('by_operation_member', (q) =>
                q.eq('operationId', archiveOperationId).eq('projectMemberId', membership._id)).collect()
            : entitlement.channelIds.map((groupId) => ({ groupId }))
          : groupMemberships.filter((item) => item.projectId === project._id)
        const unreadCount = (
          await Promise.all(
            projectGroupMemberships.map((item) =>
              getGroupUnreadCount(
                ctx,
                item.groupId,
                args.userId,
                membership.companyId ? membership._id : undefined,
                entitlement?.exitAt,
              ),
            ),
          )
        ).reduce((total, count) => total + count, 0)

        return {
          project: {
            _id: project._id,
            name: entitlement ? decodeLegacyArchivedProject(entitlement.projectSnapshot).name : project.name,
            markIconKey: entitlement ? undefined : project.markIconKey,
            markColorKey: entitlement ? undefined : project.markColorKey,
          },
          membership,
          groupCount: entitlement?.channelCount ?? projectGroupMemberships.length,
          memberCount: memberRows.length,
          memberCountTruncated: memberRows.length > 3,
          members: members.filter((member): member is NonNullable<typeof member> => Boolean(member)),
          unreadCount,
        }
      }),
    )

    return { ...memberships, page: rows.filter((row) => row !== null) }
  },
})

/** Project strip data for My Tasks without conversation unread-count fan-out. */
export const listTaskProjects = query({
  args: {
    userId: v.id('users'),
    actingCompanyId: v.id('companies'),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    assertActorMatches(actor, args.userId)
    requireCompanyModelEnabled()
    await requireActiveCompanyMembership(ctx, actor, args.actingCompanyId)

    const memberships = await ctx.db.query('projectMembers')
      .withIndex('by_user_company_status', (q) => q.eq('userId', args.userId).eq('companyId', args.actingCompanyId).eq('status', 'active'))
      .paginate(args.paginationOpts)
    const page = await Promise.all(memberships.page.map(async (membership) => {
      const project = await ctx.db.get(membership.projectId)
      if (!project) return null
      const [memberRows, channelRows, assignedTasks] = await Promise.all([
        ctx.db.query('projectMembers').withIndex('by_project_status', (q) => q.eq('projectId', project._id).eq('status', 'active')).take(4),
        ctx.db.query('groupMembers').withIndex('by_project_member_status', (q) => q.eq('projectMemberId', membership._id).eq('status', 'active')).take(101),
        ctx.db.query('tasks').withIndex('by_assignee_archived', (q) => q.eq('assigneeProjectMemberId', membership._id).eq('archivedAt', undefined)).take(101),
      ])
      let assignedTaskCount = 0
      for (const task of assignedTasks.slice(0, 100)) {
        try {
          await requireTaskAccess(ctx, actor, task._id, membership.companyId
            ? { actingCompanyId: membership.companyId, projectMemberId: membership._id }
            : {})
          assignedTaskCount += 1
        } catch {
          // A task can become inaccessible while a legacy or archived membership is being read.
        }
      }
      const members = await Promise.all(memberRows.slice(0, 3).map(async (projectMember) => {
        const user = await ctx.db.get(projectMember.userId)
        if (!user) return null
        return {
          id: user._id,
          name: projectMember.userDisplayNameSnapshot ?? user.displayName,
          avatarUrl: user.avatarStorageId ? await ctx.storage.getUrl(user.avatarStorageId) : null,
        }
      }))
      return {
        project: { _id: project._id, name: project.name, markColorKey: project.markColorKey, markIconKey: project.markIconKey },
        membership,
        assignedTaskCount,
        assignedTaskCountPartial: assignedTasks.length > 100,
        groupCount: Math.min(channelRows.length, 100),
        groupCountTruncated: channelRows.length > 100,
        memberCount: memberRows.length,
        memberCountTruncated: memberRows.length > 3,
        members: members.filter((member): member is NonNullable<typeof member> => Boolean(member)),
      }
    }))
    return { ...memberships, page: page.filter((item) => item !== null) }
  },
})

/** Lightweight identity-scoped Project count for compact workspace selectors. */
export const countProjects = query({
  args: {
    userId: v.id('users'),
    actingCompanyId: v.optional(v.id('companies')),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    assertActorMatches(actor, args.userId)
    if (args.actingCompanyId) {
      requireCompanyModelEnabled()
      await requireActiveCompanyMembership(ctx, actor, args.actingCompanyId)
    }
    const companyId = args.actingCompanyId
    const [activeMemberships, legacyMemberships] = await Promise.all([
      ctx.db
        .query('projectMembers')
        .withIndex('by_user_company_status', (q) =>
          q.eq('userId', args.userId).eq('companyId', companyId).eq('status', 'active'),
        )
        .take(101),
      ctx.db
        .query('projectMembers')
        .withIndex('by_user_company_status', (q) =>
          q.eq('userId', args.userId).eq('companyId', companyId).eq('status', undefined),
        )
        .take(101),
    ])
    const count = activeMemberships.length + legacyMemberships.length
    return count > 100 ? '100+' : count
  },
})

/** Global unread work feed consumed by the mobile Home/Inbox surfaces. */
export const listAttention = query({
  args: {
    userId: v.id('users'),
    actingCompanyId: v.optional(v.id('companies')),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    assertActorMatches(actor, args.userId)
    const tasksEnabled = resolveReleaseFeatureFlag(process.env.TRACK_TASKS_ENABLED)
    if (args.actingCompanyId) {
      requireCompanyModelEnabled()
      await requireActiveCompanyMembership(ctx, actor, args.actingCompanyId)
    }
    let membershipQuery = ctx.db.query('projectMembers').withIndex('by_user', (q) => q.eq('userId', args.userId))
    membershipQuery = args.actingCompanyId
      ? membershipQuery.filter((q) => q.and(q.eq(q.field('companyId'), args.actingCompanyId), q.eq(q.field('status'), 'active')))
      : membershipQuery.filter((q) => q.eq(q.field('status'), 'active'))
    const memberships = await membershipQuery.order('desc').paginate(args.paginationOpts)
    const pendingInvitations = resolveReleaseFeatureFlag(process.env.TRACK_COMPANY_MODEL_ENABLED) && args.paginationOpts.cursor === null
      ? await ctx.db.query('companyInvitations').withIndex('by_email_status', (q) => q.eq('normalizedEmail', normalizeEmail(actor.user.email)).eq('status', 'pending')).collect()
      : []
    const invitationRows = (await Promise.all(pendingInvitations.map(async (invitation) => {
      if (args.actingCompanyId && invitation.companyId !== args.actingCompanyId) return null
      const company = await ctx.db.get(invitation.companyId)
      if (!company || company.status !== 'active') return null
      return {
        kind: 'invitation' as const,
        id: invitation._id,
        invitationId: invitation._id,
        companyId: company._id,
        companyName: company.displayName,
        projectName: company.displayName,
        title: `Join ${company.displayName}`,
        preview: `Invitation to join as ${invitation.role}`,
        eventType: 'company_invitation' as const,
        createdAt: invitation.createdAt,
      }
    }))).filter((invitation): invitation is NonNullable<typeof invitation> => invitation !== null)
    const taskRows = tasksEnabled ? (await Promise.all(memberships.page.map(async (membership) => {
      if (args.actingCompanyId && membership.companyId !== args.actingCompanyId) return []
      const project = await ctx.db.get(membership.projectId)
      if (!project) return []
      const notifications = await ctx.db.query('taskNotifications').withIndex('by_member_read', (q) => q.eq('recipientProjectMemberId', membership._id).eq('readAt', undefined)).order('desc').take(50)
      const rows = []
      for (const notification of notifications) {
        const task = await ctx.db.get(notification.taskId)
        if (!task || task.archivedAt || notification.recipientUserId !== args.userId) continue
        try { await requireTaskAccess(ctx, actor, task._id, membership.companyId ? { actingCompanyId: membership.companyId, projectMemberId: membership._id } : {}) } catch { continue }
        rows.push({ kind: 'task' as const, id: notification._id, projectId: project._id, projectName: project.name, companyId: membership.companyId, companyName: membership.companyDisplayNameSnapshot, membershipId: membership._id, taskId: task._id, taskKey: task.publicKey, taskTitle: task.title, eventType: notification.eventType, createdAt: notification.createdAt })
      }
      return rows
    }))).flat() : []
    const suggestionRows = tasksEnabled ? (await Promise.all(memberships.page.map(async (membership) => {
      const project = await ctx.db.get(membership.projectId)
      if (!project) return []
      const suggestions = await ctx.db.query('taskSuggestions').withIndex('by_project_status', (q) => q.eq('projectId', project._id).eq('status', 'pending').eq('archivedAt', undefined)).take(20)
      const rows = []
      for (const suggestion of suggestions) {
        try {
          const access = await suggestionAccess(ctx, actor, suggestion, membership.companyId ? { actingCompanyId: membership.companyId, projectMemberId: membership._id } : {})
          const hidden = await ctx.db.query('taskSuggestionHides').withIndex('by_member_suggestion', (q) => q.eq('projectMemberId', access.projectMember._id).eq('suggestionId', suggestion._id)).unique()
          const references = await ctx.db.query('taskSuggestionReferences').withIndex('by_suggestion_rank', (q) => q.eq('suggestionId', suggestion._id)).collect()
          if (hidden || !references.length || !(await Promise.all(references.map((reference) => suggestionReferenceVisible(ctx, reference)))).every(Boolean)) continue
          rows.push({ kind: 'suggestion' as const, id: suggestion._id, projectId: project._id, projectName: project.name, companyId: membership.companyId, companyName: membership.companyDisplayNameSnapshot, membershipId: membership._id, groupId: suggestion.groupId, suggestionId: suggestion._id, title: suggestion.proposedTitle, preview: suggestion.proposedDescription ?? suggestion.groundingReason, eventType: 'task_suggestion', createdAt: suggestion.createdAt })
        } catch { continue }
      }
      return rows
    }))).flat() : []
    const messageRows = []
    for (const membership of memberships.page.slice(0, 60)) {
      if (args.actingCompanyId && membership.companyId !== args.actingCompanyId) continue
      const groupMemberships = membership.companyId
        ? await ctx.db.query('groupMembers').withIndex('by_project_member_status', (q) => q.eq('projectMemberId', membership._id).eq('status', 'active')).take(20)
        : (await ctx.db.query('groupMembers').withIndex('by_user', (q) => q.eq('userId', args.userId)).take(100)).filter((item) => item.projectId === membership.projectId)
      for (const groupMembership of groupMemberships) {
        const group = await ctx.db.get(groupMembership.groupId)
        const project = await ctx.db.get(membership.projectId)
        if (!group || group.status !== 'active' || !project) continue
        try { await authorizeScopedRequest(ctx, { projectId: project._id, groupId: group._id, claimedUserId: args.userId, ...(membership.companyId ? { actingCompanyId: membership.companyId, projectMemberId: membership._id } : {}) }, 'readChannel') } catch { continue }
        const readState = membership.companyId
          ? await ctx.db.query('groupReadStates').withIndex('by_project_member_group', (q) => q.eq('projectMemberId', membership._id).eq('groupId', group._id)).unique()
          : await ctx.db.query('groupReadStates').withIndex('by_user_group', (q) => q.eq('userId', args.userId).eq('groupId', group._id)).unique()
        const messages = await ctx.db.query('messages').withIndex('by_group_created_at', (q) => q.eq('groupId', group._id)).order('desc').take(100)
        let discussionAdded = false
        const followedThreadIds = new Set((await ctx.db.query('channelThreadFollowers').withIndex('by_group_project_member_preference', (q) => q.eq('groupId', group._id).eq('projectMemberId', membership._id).eq('preference', 'following')).take(100)).map((follower) => String(follower.channelThreadId)))
        const threadActivityAdded = new Set<string>()
        for (const message of messages) {
          if (message.authorId === args.userId) continue
          const mentioned = message.mentionedProjectMemberIds ? message.mentionedProjectMemberIds.includes(membership._id) : message.mentions.includes(args.userId)
          const replyTarget = message.replyToMessageId ? await ctx.db.get(message.replyToMessageId) : null
          const directReply = replyTarget?.authorId === args.userId
          const threadReadState = message.channelThreadId
            ? await ctx.db.query('channelThreadReadStates').withIndex('by_thread_project_member', (q) => q.eq('channelThreadId', message.channelThreadId!).eq('projectMemberId', membership._id)).unique()
            : null
          const unread = message.channelThreadId
            ? (message.channelSequence ?? 0) > (threadReadState?.lastReadChannelSequence ?? 0)
            : !readState || message.createdAt > readState.lastReadAt
          if (!unread) continue
          const ordinary: boolean = !message.channelThreadId && !discussionAdded && !directReply
          const threadActivity = Boolean(message.channelThreadId && followedThreadIds.has(String(message.channelThreadId)) && !threadActivityAdded.has(String(message.channelThreadId)))
          if (!mentioned && !directReply && !ordinary && !threadActivity) continue
          const author = await ctx.db.get(message.authorId)
          discussionAdded = discussionAdded || ordinary
          if (threadActivity && message.channelThreadId) threadActivityAdded.add(String(message.channelThreadId))
          messageRows.push({ kind: 'message' as const, id: message._id, projectId: project._id, projectName: project.name, membershipId: membership._id, companyId: membership.companyId, companyName: membership.companyDisplayNameSnapshot, groupId: group._id, groupName: group.name, messageId: message._id, threadId: message.channelThreadId, senderName: author?.displayName ?? 'A teammate', preview: message.body || message.notificationPreview || 'Sent an attachment.', eventType: directReply ? 'direct_reply' : mentioned ? 'mention' : threadActivity ? 'thread_activity' : 'discussion', createdAt: message.createdAt })
        }
      }
    }
    const rows = [...invitationRows, ...taskRows, ...suggestionRows, ...messageRows]
      .sort((a, b) => attentionPriority(a) - attentionPriority(b) || b.createdAt - a.createdAt)
    return { ...memberships, page: rows.slice(0, 100) }
  },
})

/** Global assigned task list consumed by the mobile Tasks surface. */
export const listMyTasks = query({
  args: {
    userId: v.id('users'),
    actingCompanyId: v.optional(v.id('companies')),
    openOnly: v.optional(v.boolean()),
    dueDateStart: v.optional(v.string()),
    dueDateEnd: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    assertActorMatches(actor, args.userId)
    const assigneeNameCache = new Map<string, string | null>([
      [String(args.userId), (await ctx.db.get(args.userId))?.displayName ?? null],
    ])
    if (args.dueDateStart && args.dueDateEnd && args.dueDateStart > args.dueDateEnd) {
      throw new Error('invalid_due_date_range')
    }
    const dueDateStart = args.dueDateStart
    const dueDateEnd = args.dueDateEnd
    if (args.actingCompanyId) {
      requireCompanyModelEnabled()
      await requireActiveCompanyMembership(ctx, actor, args.actingCompanyId)
    }
    const memberships = args.actingCompanyId
      ? await ctx.db.query('projectMembers').withIndex('by_user_company_status', (q) =>
          q.eq('userId', args.userId).eq('companyId', args.actingCompanyId).eq('status', 'active'),
        ).order('desc').paginate(args.paginationOpts)
      : await ctx.db.query('projectMembers').withIndex('by_user', (q) => q.eq('userId', args.userId)).filter((q) => q.eq(q.field('status'), 'active')).order('desc').paginate(args.paginationOpts)
    const rows = []
    const groupById = new Map<string, Doc<'groups'> | null>()
    for (const membership of memberships.page) {
      if (args.actingCompanyId && membership.companyId !== args.actingCompanyId) continue
      const project = await ctx.db.get(membership.projectId)
      if (!project) continue
      const taskCandidates = dueDateStart && dueDateEnd
        ? await ctx.db.query('tasks').withIndex('by_assignee_archived_due_date', (q) =>
            q.eq('assigneeProjectMemberId', membership._id)
              .eq('archivedAt', undefined)
              .gte('dueDate', dueDateStart)
              .lte('dueDate', dueDateEnd),
          ).take(501)
        : await ctx.db.query('tasks').withIndex('by_assignee_archived', (q) => q.eq('assigneeProjectMemberId', membership._id).eq('archivedAt', undefined)).order('desc').take(501)
      const hasMoreAssignedTasks = !dueDateStart && !dueDateEnd && taskCandidates.length > 500
      const hasMoreDueTasks = Boolean(dueDateStart && dueDateEnd && taskCandidates.length > 500)
      for (const task of taskCandidates.slice(0, 500)) {
        try {
          const access = await requireTaskAccess(ctx, actor, task._id, membership.companyId ? { actingCompanyId: membership.companyId, projectMemberId: membership._id } : {})
          if (!access.taskCapabilities.canView) continue
          const view = await taskView(ctx, task)
          if (args.openOnly && (!view.state || isTerminalTaskState(view.state.category))) continue
          let group: Doc<'groups'> | null = null
          if (task.groupId) {
            const cached = groupById.get(String(task.groupId))
            group = cached === undefined ? await ctx.db.get(task.groupId) : cached
            groupById.set(String(task.groupId), group)
          }
          const taskAssignee = view.assignee
          const assigneeUserId = taskAssignee ? String(taskAssignee.userId) : null
          let assigneeName = assigneeUserId ? assigneeNameCache.get(assigneeUserId) : null
          if (taskAssignee && assigneeUserId && !assigneeNameCache.has(assigneeUserId)) {
            assigneeName = (await ctx.db.get(taskAssignee.userId))?.displayName ?? null
            assigneeNameCache.set(assigneeUserId, assigneeName)
          }
          rows.push({
            ...view,
            assigneeName: assigneeName ?? null,
            group: group ? { _id: group._id, name: group.name } : null,
            project: {
              _id: project._id,
              name: project.name,
              markColorKey: project.markColorKey,
              markIconKey: project.markIconKey,
            },
            companyId: membership.companyId,
            companyName: membership.companyDisplayNameSnapshot,
            projectMemberId: membership._id,
            hasMoreAssignedTasks,
            hasMoreDueTasks,
          })
        } catch { /* stale memberships are skipped */ }
      }
    }
    return { ...memberships, page: rows.sort((a, b) => b.task.updatedAt - a.task.updatedAt) }
  },
})

/** Bounded attention candidates avoid hiding older urgent or overdue work. */
export const listMyTaskAttention = query({
  args: {
    userId: v.id('users'),
    actingCompanyId: v.optional(v.id('companies')),
    beforeDate: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    assertActorMatches(actor, args.userId)
    const parsedBeforeDate = new Date(`${args.beforeDate}T00:00:00.000Z`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.beforeDate) || Number.isNaN(parsedBeforeDate.getTime()) || parsedBeforeDate.toISOString().slice(0, 10) !== args.beforeDate) {
      throw new Error('invalid_attention_date')
    }
    if (args.actingCompanyId) {
      requireCompanyModelEnabled()
      await requireActiveCompanyMembership(ctx, actor, args.actingCompanyId)
    }
    const memberships = args.actingCompanyId
      ? await ctx.db.query('projectMembers').withIndex('by_user_company_status', (q) =>
          q.eq('userId', args.userId).eq('companyId', args.actingCompanyId).eq('status', 'active'),
        ).order('desc').paginate(args.paginationOpts)
      : await ctx.db.query('projectMembers').withIndex('by_user', (q) => q.eq('userId', args.userId)).filter((q) => q.eq(q.field('status'), 'active')).order('desc').paginate(args.paginationOpts)
    const assigneeName = (await ctx.db.get(args.userId))?.displayName ?? null
    const rows = []
    for (const membership of memberships.page) {
      if (args.actingCompanyId && membership.companyId !== args.actingCompanyId) continue
      const project = await ctx.db.get(membership.projectId)
      if (!project) continue
      const identity = membership.companyId
        ? { actingCompanyId: membership.companyId, projectMemberId: membership._id }
        : {}
      const taskPriorities = ['urgent', 'high', 'medium', 'low', 'none'] as const
      // Dated partitions use the due-date index in ascending order, so their
      // first four rows preserve the most overdue or nearest-due candidates.
      // Equal dates have equal rank; unscheduled work uses newest updates below.
      const [dueByPriority, futureUrgent, unscheduledUrgent] = await Promise.all([
        Promise.all(taskPriorities.map((priority) => ctx.db.query('tasks')
          .withIndex('by_assignee_priority_archived_due_date_updated', (q) =>
            q.eq('assigneeProjectMemberId', membership._id).eq('priority', priority).eq('archivedAt', undefined).lte('dueDate', args.beforeDate),
          ).take(4))),
        Promise.all((['urgent', 'high'] as const).map((priority) => ctx.db.query('tasks')
          .withIndex('by_assignee_priority_archived_due_date_updated', (q) =>
            q.eq('assigneeProjectMemberId', membership._id).eq('priority', priority).eq('archivedAt', undefined).gt('dueDate', args.beforeDate),
          ).take(4))),
        Promise.all((['urgent', 'high'] as const).map((priority) => ctx.db.query('tasks')
          .withIndex('by_assignee_priority_archived_due_date_updated', (q) =>
            q.eq('assigneeProjectMemberId', membership._id).eq('priority', priority).eq('archivedAt', undefined).eq('dueDate', undefined),
          ).order('desc').take(4))),
      ])
      const candidates = new Map<string, (typeof dueByPriority)[number][number]>()
      for (const task of [...dueByPriority.flat(), ...futureUrgent.flat(), ...unscheduledUrgent.flat()]) candidates.set(String(task._id), task)
      for (const task of candidates.values()) {
        try {
          const access = await requireTaskAccess(ctx, actor, task._id, identity)
          if (!access.taskCapabilities.canView) continue
          const view = await taskView(ctx, task)
          if (!view.state || isTerminalTaskState(view.state.category)) continue
          rows.push({
            ...view,
            assigneeName,
            group: task.groupId ? await ctx.db.get(task.groupId) : null,
            project: { _id: project._id, name: project.name },
            companyId: membership.companyId,
            companyName: membership.companyDisplayNameSnapshot,
            projectMemberId: membership._id,
            hasMoreAssignedTasks: false,
            hasMoreDueTasks: false,
          })
        } catch {
          // Membership or Channel access can change while this query runs.
        }
      }
    }
    return { ...memberships, page: rows.sort((left, right) => right.task.updatedAt - left.task.updatedAt) }
  },
})

export const resolveNavigation = query({
  args: {
    projectId: v.id('projects'),
    groupId: v.optional(v.id('groups')),
    userId: v.id('users'),
    actingCompanyId: v.optional(v.id('companies')),
    projectMemberId: v.optional(v.id('projectMembers')),
  },
  handler: async (ctx, args) => {
    try {
      const access = await authorizeScopedRequest(ctx, {
        projectId: args.projectId,
        groupId: args.groupId,
        claimedUserId: args.userId,
        actingCompanyId: args.actingCompanyId,
        projectMemberId: args.projectMemberId,
      }, args.groupId ? 'readChannel' : 'readProject')
      const group = args.groupId ? await ctx.db.get(args.groupId) : null
      if (args.groupId && (!group || group.projectId !== args.projectId)) {
        return {
          available: false,
          archived: false,
          readStateImmutable: false,
          membership: null,
          project: null,
          company: null,
          channel: null,
          archiveDetails: null,
        }
      }
      const readStateImmutable = access.companyAccess?.projectMember.status === 'archived'
      const company = access.companyAccess?.company ?? null
      const entitlement = access.companyAccess?.entitlement
      const archivedChannel = group && entitlement?.snapshotOperationId
        ? await getArchivedChannelSnapshot(ctx, entitlement.snapshotOperationId, group._id)
        : group && entitlement?.channelSnapshots
          .map((value: unknown) => decodeLegacyArchivedChannel(ctx, value))
          .find((snapshot) => snapshot._id === group._id)
      const channel = group ? archivedChannel ?? group : null
      const archiveDetails = readStateImmutable
        ? {
            kind: 'company_exit' as const,
            cutoffAt: access.companyAccess?.entitlement?.exitAt ?? access.projectMember.endedAt ?? null,
            reason: null,
          }
        : access.project.status === 'archived'
          ? {
              kind: 'project' as const,
              cutoffAt: access.project.archivedAt ?? null,
              reason: access.project.archiveReason ?? null,
            }
          : group?.status && group.status !== 'active'
            ? {
                kind: 'channel' as const,
                cutoffAt: group.archivedAt ?? null,
                reason: null,
              }
            : null
      return {
        available: true,
        archived:
          readStateImmutable ||
           access.project.status === 'archived' ||
           Boolean(group?.status && group.status !== 'active'),
        readStateImmutable,
        membership: access.projectMember,
        project: access.project,
        channel: channel ? {
          _id: channel._id,
          name: channel.name,
          kind: channel.kind,
          status: channel.status,
        } : null,
        archiveDetails,
        company: company ? {
          _id: company._id,
          displayName: company.displayName,
          logoUrl: company.logoStorageId ? await ctx.storage.getUrl(company.logoStorageId) : null,
        } : null,
      }
    } catch {
      return {
        available: false,
        archived: false,
          readStateImmutable: false,
          membership: null,
          project: null,
          company: null,
          channel: null,
          archiveDetails: null,
        }
    }
  },
})

export const listProjectMembers = query({
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
      const operationId = access.companyAccess.entitlement.snapshotOperationId
      if (operationId) {
        const rows = await ctx.db.query('projectExitSnapshotStaging').withIndex('by_operation_scope', (q) =>
          q.eq('operationId', operationId).eq('scope', 'member')).collect()
        return rows.flatMap((row) => row.payload.kind === 'member' ? [row.payload.snapshot] : [])
      }
      return access.companyAccess.entitlement.memberSnapshots ?? []
    }
    const memberships = await ctx.db.query('projectMembers').withIndex('by_project', (q) => q.eq('projectId', args.projectId)).collect()
    const visible = access.companyAccess
      ? memberships.filter((membership) => membership.status === 'active')
      : memberships.filter((membership) => !membership.companyId)
    return await Promise.all(visible.map(async (membership) => {
      const [user, company] = await Promise.all([
        ctx.db.get(membership.userId),
        membership.companyId ? ctx.db.get(membership.companyId) : null,
      ])
      return {
        membership,
        user,
        company: company ? { _id: company._id, displayName: company.displayName } : null,
      }
    }))
  },
})

export const listGroups = query({
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
    const memberships = access.companyAccess
      ? access.companyAccess.projectMember.status === 'archived'
        ? []
        : await ctx.db.query('groupMembers').withIndex('by_project_member_status', (q) =>
            q.eq('projectMemberId', access.companyAccess!.projectMember._id).eq('status', 'active'),
          ).collect()
      : await ctx.db.query('groupMembers').withIndex('by_user', (q) => q.eq('userId', args.userId)).collect()
    const archiveOperationId = access.companyAccess?.entitlement?.snapshotOperationId
    const archivedProjectMemberId = access.companyAccess?.projectMember._id
    const visibleMemberships = access.companyAccess?.entitlement
      ? archiveOperationId && archivedProjectMemberId
        ? await ctx.db.query('projectExitChannelVisibility').withIndex('by_operation_member', (q) =>
            q.eq('operationId', archiveOperationId).eq('projectMemberId', archivedProjectMemberId)).collect()
        : access.companyAccess.entitlement.channelIds.map((groupId) => ({ groupId, projectId: args.projectId, _id: groupId }))
      : memberships.filter((membership) => membership.projectId === args.projectId)

    const rows = await Promise.all(
      visibleMemberships.map(async (membership) => {
        const group = await ctx.db.get(membership.groupId)
        if (!group) return null
        const cutoff = access.companyAccess?.entitlement?.exitAt
        const lastMessage = await ctx.db
          .query('messages')
          .withIndex('by_group_thread_created_at', (q) => cutoff
            ? q.eq('groupId', group._id).eq('channelThreadId', undefined).lte('createdAt', cutoff)
            : q.eq('groupId', group._id).eq('channelThreadId', undefined))
          .order('desc')
          .first()
        const unreadCount = await getGroupUnreadCount(ctx, group._id, args.userId, args.projectMemberId, cutoff)
        const snapshot = archiveOperationId
          ? await getArchivedChannelSnapshot(ctx, archiveOperationId, group._id)
          : access.companyAccess?.entitlement?.channelSnapshots
            .map((value: unknown) => decodeLegacyArchivedChannel(ctx, value))
            .find((item) => item._id === group._id)
        return { group: snapshot ?? group, membership, lastMessage, unreadCount }
      }),
    )

    return rows.filter((row) => row !== null)
  },
})

export const getLastActiveContext = query({
  args: {
    userId: v.id('users'),
    deviceId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    assertActorMatches(actor, args.userId)
    const byDevice = args.deviceId
      ? await ctx.db
          .query('lastActiveContexts')
          .withIndex('by_user_device', (q) =>
            q.eq('userId', args.userId).eq('deviceId', args.deviceId),
          )
          .unique()
      : null
    if (byDevice) return byDevice

    return await ctx.db
      .query('lastActiveContexts')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .order('desc')
      .first()
  },
})

export const setLastActiveContext = mutation({
  args: {
    userId: v.id('users'),
    projectId: v.optional(v.id('projects')),
    groupId: v.optional(v.id('groups')),
    deviceId: v.optional(v.string()),
    platform: v.optional(platform),
    actingCompanyId: v.optional(v.id('companies')),
    projectMemberId: v.optional(v.id('projectMembers')),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    assertActorMatches(actor, args.userId)
    if (args.projectId) await authorizeScopedRequest(ctx, {
      projectId: args.projectId,
      groupId: args.groupId,
      claimedUserId: args.userId,
      actingCompanyId: args.actingCompanyId,
      projectMemberId: args.projectMemberId,
    }, args.groupId ? 'readChannel' : 'readProject')

    const now = Date.now()
    const existing = args.deviceId
      ? await ctx.db
          .query('lastActiveContexts')
          .withIndex('by_user_device', (q) =>
            q.eq('userId', args.userId).eq('deviceId', args.deviceId),
          )
          .unique()
      : await ctx.db
          .query('lastActiveContexts')
          .withIndex('by_user', (q) => q.eq('userId', args.userId))
          .first()

    const payload = {
      projectId: args.projectId,
      groupId: args.groupId,
      deviceId: args.deviceId,
      platform: args.platform,
      actingCompanyId: args.actingCompanyId,
      projectMemberId: args.projectMemberId,
      updatedAt: now,
    }
    if (existing) {
      await ctx.db.patch(existing._id, payload)
      return existing._id
    }
    return await ctx.db.insert('lastActiveContexts', {
      userId: args.userId,
      ...payload,
    })
  },
})

export const markGroupRead = mutation({
  args: {
    groupId: v.id('groups'),
    userId: v.id('users'),
    actingCompanyId: v.optional(v.id('companies')),
    projectMemberId: v.optional(v.id('projectMembers')),
    lastReadMessageId: v.optional(v.id('messages')),
  },
  handler: async (ctx, args) => {
    const group = await ctx.db.get(args.groupId)
    if (!group) throw new Error('group_not_found')
    const access = await authorizeScopedRequest(ctx, {
      projectId: group.projectId,
      groupId: group._id,
      claimedUserId: args.userId,
      actingCompanyId: args.actingCompanyId,
      projectMemberId: args.projectMemberId,
    }, 'readChannel')
    if (access.companyAccess?.projectMember.status === 'archived') throw new Error('archive_read_state_immutable')
    if (args.lastReadMessageId) {
      const message = await ctx.db.get(args.lastReadMessageId)
      if (!message || message.groupId !== args.groupId || message.channelThreadId) {
        throw new Error('message_not_found')
      }
    }

    const now = Date.now()
    const existing = args.projectMemberId
      ? await ctx.db.query('groupReadStates').withIndex('by_project_member_group', (q) =>
          q.eq('projectMemberId', args.projectMemberId).eq('groupId', args.groupId),
        ).unique()
      : await ctx.db.query('groupReadStates').withIndex('by_user_group', (q) =>
          q.eq('userId', args.userId).eq('groupId', args.groupId),
        ).unique()
    const payload = {
      projectId: group.projectId,
      groupId: args.groupId,
      userId: args.userId,
      projectMemberId: args.projectMemberId,
      lastReadMessageId: args.lastReadMessageId,
      lastReadAt: now,
      updatedAt: now,
    }
    if (existing) {
      await ctx.db.patch(existing._id, payload)
      return existing._id
    }

    return await ctx.db.insert('groupReadStates', {
      ...payload,
      createdAt: now,
    })
  },
})
