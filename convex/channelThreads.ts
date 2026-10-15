import { validateChannelThreadName } from '@track/shared/threads'
import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'

import type { Doc, Id } from './_generated/dataModel'
import { mutation, query } from './_generated/server'
import type { MutationCtx, QueryCtx } from './_generated/server'
import { appendAuditEvent } from './lib/audit'
import {
  requireThreadsEnabled,
  threadsEnabled,
  upsertThreadFollower,
} from './lib/channelThreadPolicy'
import { authorizeScopedRequest } from './lib/requestAuthorization'
import {
  getArchivedThreadSnapshot,
  hasArchivedChannelVisibility,
} from './lib/projectExitArchive'
import { buildMessageDetail, hiddenMessageIdsForUser, visibleMessages } from './messages'

const threadStatus = v.union(v.literal('active'), v.literal('archived'))
type ThreadCtx = QueryCtx | MutationCtx
type ThreadSnapshot = {
  _id: Id<'channelThreads'>
  name: string
  status: 'active' | 'archived'
  revision: number
  sourceAvailable: boolean
  following: boolean
  lastReadChannelSequence: number
  replyCount?: number
  latestReplyAt?: number
  latestChannelSequence?: number
}

function decodeLegacyThreadSnapshot(ctx: QueryCtx, value: unknown): ThreadSnapshot {
  if (
    !value ||
    typeof value !== 'object' ||
    !('_id' in value) ||
    typeof value._id !== 'string' ||
    !('name' in value) ||
    typeof value.name !== 'string' ||
    !('status' in value) ||
    (value.status !== 'active' && value.status !== 'archived') ||
    !('revision' in value) ||
    typeof value.revision !== 'number' ||
    !('sourceAvailable' in value) ||
    typeof value.sourceAvailable !== 'boolean' ||
    !('following' in value) ||
    typeof value.following !== 'boolean' ||
    !('lastReadChannelSequence' in value) ||
    typeof value.lastReadChannelSequence !== 'number'
  ) {
    throw new Error('archive_thread_snapshot_invalid')
  }
  const threadId = ctx.db.normalizeId('channelThreads', value._id)
  if (!threadId) throw new Error('archive_thread_snapshot_invalid')
  return {
    _id: threadId,
    name: value.name,
    status: value.status,
    revision: value.revision,
    sourceAvailable: value.sourceAvailable,
    following: value.following,
    lastReadChannelSequence: value.lastReadChannelSequence,
    replyCount: 'replyCount' in value && typeof value.replyCount === 'number'
      ? value.replyCount
      : undefined,
    latestReplyAt: 'latestReplyAt' in value && typeof value.latestReplyAt === 'number'
      ? value.latestReplyAt
      : undefined,
    latestChannelSequence: 'latestChannelSequence' in value && typeof value.latestChannelSequence === 'number'
      ? value.latestChannelSequence
      : undefined,
  }
}

function boundedThreadMessageLimit(limit: number | undefined) {
  return Math.min(Math.max(limit ?? 80, 1), 100)
}

async function getArchiveThreadSnapshots(
  ctx: ThreadCtx,
  operationId: string,
  projectMemberId: Id<'projectMembers'>,
  threadIds: Array<Id<'channelThreads'>>,
) {
  const entries = await Promise.all(threadIds.map(async (threadId) => {
    const snapshot = await getArchivedThreadSnapshot(ctx, operationId, projectMemberId, threadId)
    return snapshot ? { snapshot, threadId } : null
  }))
  const snapshots = new Map<string, ThreadSnapshot>()
  for (const entry of entries) {
    if (entry) snapshots.set(String(entry.threadId), entry.snapshot)
  }
  return snapshots
}

async function authorizeThread(
  ctx: ThreadCtx,
  input: {
    threadId: Id<'channelThreads'>
    userId: Id<'users'>
    actingCompanyId?: Id<'companies'>
    projectMemberId?: Id<'projectMembers'>
  },
  capability: 'readChannel' | 'writeChannel' = 'readChannel',
) {
  const unavailable = capability === 'readChannel' ? 'thread_unavailable' : 'thread_access_changed'
  const thread = await ctx.db.get(input.threadId)
  if (!thread) throw new Error(unavailable)
  let access
  try {
    access = await authorizeScopedRequest(ctx, {
      projectId: thread.projectId,
      groupId: thread.groupId,
      claimedUserId: input.userId,
      actingCompanyId: input.actingCompanyId,
      projectMemberId: input.projectMemberId,
    }, capability)
  } catch {
    throw new Error(unavailable)
  }
  if (capability === 'writeChannel') {
    const group = await ctx.db.get(thread.groupId)
    if (
      !group ||
      (group.status && group.status !== 'active') ||
      (access.project.status && access.project.status !== 'active')
    ) {
      throw new Error('thread_parent_read_only')
    }
  }
  const projectMember = access.projectMember
  const cutoff = access.companyAccess?.entitlement?.exitAt
  if (cutoff && thread.createdAt > cutoff) throw new Error('thread_unavailable')
  return { access, cutoff, projectMember, thread }
}

async function canManageThread(
  ctx: ThreadCtx,
  thread: Doc<'channelThreads'>,
  projectMember: Doc<'projectMembers'>,
) {
  if (thread.creatorProjectMemberId === projectMember._id) return true
  const manager = projectMember.role === 'owner' ||
    projectMember.role === 'admin' ||
    projectMember.role === 'manager'
  if (!manager) return false
  if (!projectMember.companyId) return true
  const membership = await ctx.db
    .query('groupMembers')
    .withIndex('by_group_project_member', (q) =>
      q.eq('groupId', thread.groupId).eq('projectMemberId', projectMember._id),
    )
    .unique()
  return membership?.status === 'active' && membership.isSteward === true
}

async function buildThreadSummary(
  ctx: ThreadCtx,
  thread: Doc<'channelThreads'>,
  projectMember: Doc<'projectMembers'>,
  cutoff?: number,
  snapshot?: ThreadSnapshot,
) {
  const [follower, readState, sourceMessage, recentMessages] = await Promise.all([
    ctx.db
      .query('channelThreadFollowers')
      .withIndex('by_thread_project_member', (q) =>
        q.eq('channelThreadId', thread._id).eq('projectMemberId', projectMember._id),
      )
      .unique(),
    ctx.db
      .query('channelThreadReadStates')
      .withIndex('by_thread_project_member', (q) =>
        q.eq('channelThreadId', thread._id).eq('projectMemberId', projectMember._id),
      )
      .unique(),
    thread.sourceMessageId ? ctx.db.get(thread.sourceMessageId) : null,
    ctx.db
      .query('messages')
      .withIndex('by_thread_created_at', (q) => q.eq('channelThreadId', thread._id))
      .order('desc')
      .take(3),
  ])
  const following = snapshot?.following ?? follower?.preference === 'following'
  const latestChannelSequence = snapshot?.latestChannelSequence ?? thread.latestChannelSequence ?? 0
  const unread = following && latestChannelSequence >
    (snapshot?.lastReadChannelSequence ?? readState?.lastReadChannelSequence ?? 0)
  const sourceAvailable = snapshot?.sourceAvailable ?? Boolean(
    sourceMessage &&
    sourceMessage.projectId === thread.projectId &&
    sourceMessage.groupId === thread.groupId &&
    (sourceMessage.channelThreadId === undefined || sourceMessage.channelThreadId === thread._id) &&
    (!cutoff || sourceMessage.createdAt <= cutoff),
  )

  return {
    thread: snapshot
      ? { ...thread, name: snapshot.name, revision: snapshot.revision, status: snapshot.status }
      : thread,
    canManage: cutoff ? false : await canManageThread(ctx, thread, projectMember),
    following,
    unread,
    replyCount: snapshot?.replyCount ?? thread.replyCount ?? 0,
    latestReplyAt: snapshot?.latestReplyAt ?? thread.latestReplyAt ?? null,
    latestReplyPreview: snapshot
      ? null
      : recentMessages.find((message) => message._id !== thread.sourceMessageId)?.body ?? null,
    source: sourceAvailable && sourceMessage
      ? {
          messageId: sourceMessage._id,
          body: sourceMessage.body,
          createdAt: sourceMessage.createdAt,
        }
      : thread.sourceMessageId
        ? { unavailable: true as const }
        : null,
  }
}

async function getVisibleProjectGroupIds(
  ctx: QueryCtx,
  access: Awaited<ReturnType<typeof authorizeScopedRequest>>,
  projectId: Id<'projects'>,
  userId: Id<'users'>,
) {
  const entitlement = access.companyAccess?.entitlement
  if (access.companyAccess) {
    if (entitlement?.snapshotOperationId) {
      const visibility = await ctx.db
        .query('projectExitChannelVisibility')
        .withIndex('by_operation_member', (q) =>
          q.eq('operationId', entitlement.snapshotOperationId!).eq('projectMemberId', access.projectMember._id),
        )
        .collect()
      return new Set(visibility.map((row) => String(row.groupId)))
    }
    if (entitlement) return new Set(entitlement.channelIds.map(String))
    const memberships = await ctx.db
      .query('groupMembers')
      .withIndex('by_project_member_status', (q) =>
        q.eq('projectMemberId', access.projectMember._id).eq('status', 'active'),
      )
      .collect()
    return new Set(memberships.map((membership) => String(membership.groupId)))
  }
  const memberships = await ctx.db
    .query('groupMembers')
    .withIndex('by_project_user', (q) => q.eq('projectId', projectId).eq('userId', userId))
    .collect()
  return new Set(
    memberships
      .filter((membership) => !membership.status || membership.status === 'active')
      .map((membership) => String(membership.groupId)),
  )
}

export const list = query({
  args: {
    groupId: v.id('groups'),
    userId: v.id('users'),
    actingCompanyId: v.optional(v.id('companies')),
    projectMemberId: v.optional(v.id('projectMembers')),
    status: v.optional(threadStatus),
  },
  handler: async (ctx, args) => {
    if (!threadsEnabled()) return []
    const group = await ctx.db.get(args.groupId)
    if (!group) throw new Error('channel_unavailable')
    const access = await authorizeScopedRequest(ctx, {
      projectId: group.projectId,
      groupId: group._id,
      claimedUserId: args.userId,
      actingCompanyId: args.actingCompanyId,
      projectMemberId: args.projectMemberId,
    }, 'readChannel')
    const projectMember = access.projectMember
    const cutoff = access.companyAccess?.entitlement?.exitAt
    const status = args.status ?? 'active'
    const entitlement = access.companyAccess?.entitlement
    const snapshotOperationId = entitlement?.snapshotOperationId
    const legacySnapshots = (entitlement?.threadSnapshots ?? [])
      .map((snapshot) => decodeLegacyThreadSnapshot(ctx, snapshot))
    const threads = cutoff
      ? [
          ...(await ctx.db
            .query('channelThreads')
            .withIndex('by_group_status_updated_at', (q) =>
              q.eq('groupId', group._id).eq('status', 'active'),
            )
            .collect()),
          ...(await ctx.db
            .query('channelThreads')
            .withIndex('by_group_status_updated_at', (q) =>
              q.eq('groupId', group._id).eq('status', 'archived'),
            )
            .collect()),
        ]
      : await ctx.db
          .query('channelThreads')
          .withIndex('by_group_status_updated_at', (q) =>
            q.eq('groupId', group._id).eq('status', status),
          )
          .order('desc')
          .collect()
    const snapshots = snapshotOperationId
      ? await getArchiveThreadSnapshots(
          ctx,
          snapshotOperationId,
          projectMember._id,
          threads.map((thread) => thread._id),
        )
      : new Map<string, ThreadSnapshot>(
          legacySnapshots.map((snapshot) => [String(snapshot._id), snapshot]),
        )
    return await Promise.all(
      threads
        .filter((thread) => {
          if (!cutoff) return true
          const snapshot = snapshots.get(String(thread._id))
          return Boolean(snapshot && snapshot.status === status)
        })
        .map((thread) => buildThreadSummary(
          ctx,
          thread,
          projectMember,
          cutoff,
          snapshots.get(String(thread._id)),
        )),
    )
  },
})

export const listPage = query({
  args: {
    groupId: v.id('groups'),
    userId: v.id('users'),
    actingCompanyId: v.optional(v.id('companies')),
    projectMemberId: v.optional(v.id('projectMembers')),
    status: v.optional(threadStatus),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    if (!threadsEnabled()) return { page: [], isDone: true, continueCursor: '' }
    const group = await ctx.db.get(args.groupId)
    if (!group) throw new Error('channel_unavailable')
    const access = await authorizeScopedRequest(ctx, {
      projectId: group.projectId,
      groupId: group._id,
      claimedUserId: args.userId,
      actingCompanyId: args.actingCompanyId,
      projectMemberId: args.projectMemberId,
    }, 'readChannel')
    const status = args.status ?? 'active'
    const result = await ctx.db.query('channelThreads')
      .withIndex('by_group_status_updated_at', (q) => q.eq('groupId', group._id).eq('status', status))
      .order('desc')
      .paginate(args.paginationOpts)
    const cutoff = access.companyAccess?.entitlement?.exitAt
    const snapshotOperationId = access.companyAccess?.entitlement?.snapshotOperationId
    const snapshots = snapshotOperationId
      ? await getArchiveThreadSnapshots(ctx, snapshotOperationId, access.projectMember._id, result.page.map((thread) => thread._id))
      : new Map<string, ThreadSnapshot>((access.companyAccess?.entitlement?.threadSnapshots ?? [])
          .map((snapshot) => decodeLegacyThreadSnapshot(ctx, snapshot))
          .map((snapshot) => [String(snapshot._id), snapshot]))
    const page = await Promise.all(result.page
      .filter((thread) => !cutoff || (thread.createdAt <= cutoff && (snapshots.get(String(thread._id))?.status ?? thread.status) === status))
      .map((thread) => buildThreadSummary(ctx, thread, access.projectMember, cutoff, snapshots.get(String(thread._id)))))
    return { ...result, page }
  },
})

type ProjectThreadListArgs = {
  projectId: Id<'projects'>
  userId: Id<'users'>
  actingCompanyId?: Id<'companies'>
  projectMemberId?: Id<'projectMembers'>
  status?: 'active' | 'archived'
  limit?: number
}

async function buildProjectThreadItems(
  ctx: QueryCtx,
  args: ProjectThreadListArgs,
  candidates: Array<Doc<'channelThreads'>>,
) {
  const access = await authorizeScopedRequest(ctx, {
    projectId: args.projectId,
    claimedUserId: args.userId,
    actingCompanyId: args.actingCompanyId,
    projectMemberId: args.projectMemberId,
  }, 'readProject')
  const visibleGroupIds = await getVisibleProjectGroupIds(ctx, access, args.projectId, args.userId)
  const cutoff = access.companyAccess?.entitlement?.exitAt
  const status = args.status ?? 'active'
  const limit = Math.min(Math.max(args.limit ?? candidates.length, 1), 100)
  const visibleThreads = candidates.filter((thread) =>
    visibleGroupIds.has(String(thread.groupId)) && (!cutoff || thread.createdAt <= cutoff),
  )
  const snapshotOperationId = access.companyAccess?.entitlement?.snapshotOperationId
  const snapshots = snapshotOperationId
    ? await getArchiveThreadSnapshots(
        ctx,
        snapshotOperationId,
        access.projectMember._id,
        visibleThreads.map((thread) => thread._id),
      )
    : new Map<string, ThreadSnapshot>(
        (access.companyAccess?.entitlement?.threadSnapshots ?? [])
          .map((snapshot) => decodeLegacyThreadSnapshot(ctx, snapshot))
          .map((snapshot) => [String(snapshot._id), snapshot]),
      )
  const filtered = visibleThreads.filter((thread) => {
    const snapshot = snapshots.get(String(thread._id))
    return (snapshot?.status ?? thread.status) === status
  }).slice(0, limit)
  return await Promise.all(filtered.map(async (thread) => {
    const [summary, group] = await Promise.all([
      buildThreadSummary(ctx, thread, access.projectMember, cutoff, snapshots.get(String(thread._id))),
      ctx.db.get(thread.groupId),
    ])
    return {
      ...summary,
      channel: group ? { _id: group._id, name: group.name } : null,
    }
  }))
}

export const listProject = query({
  args: {
    projectId: v.id('projects'),
    userId: v.id('users'),
    actingCompanyId: v.optional(v.id('companies')),
    projectMemberId: v.optional(v.id('projectMembers')),
    status: v.optional(threadStatus),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (!threadsEnabled()) return []
    const candidates = await ctx.db
      .query('channelThreads')
      .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
      .order('desc')
      .collect()
    return buildProjectThreadItems(ctx, args, candidates)
  },
})

export const listProjectPage = query({
  args: {
    projectId: v.id('projects'),
    userId: v.id('users'),
    actingCompanyId: v.optional(v.id('companies')),
    projectMemberId: v.optional(v.id('projectMembers')),
    status: v.optional(threadStatus),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    if (!threadsEnabled()) return { page: [], isDone: true, continueCursor: '' }
    const result = await ctx.db
      .query('channelThreads')
      .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
      .order('desc')
      .paginate(args.paginationOpts)
    const page = await buildProjectThreadItems(ctx, {
      projectId: args.projectId,
      userId: args.userId,
      actingCompanyId: args.actingCompanyId,
      projectMemberId: args.projectMemberId,
      status: args.status,
    }, result.page)
    return { ...result, page }
  },
})

export const listGroupUnread = query({
  args: {
    projectId: v.id('projects'),
    userId: v.id('users'),
    actingCompanyId: v.optional(v.id('companies')),
    projectMemberId: v.optional(v.id('projectMembers')),
  },
  handler: async (ctx, args) => {
    if (!threadsEnabled()) return []
    const access = await authorizeScopedRequest(ctx, {
      projectId: args.projectId,
      claimedUserId: args.userId,
      actingCompanyId: args.actingCompanyId,
      projectMemberId: args.projectMemberId,
    }, 'readProject')
    const projectMember = access.projectMember
    const cutoff = access.companyAccess?.entitlement?.exitAt
    const entitlement = access.companyAccess?.entitlement
    const followers = await ctx.db
      .query('channelThreadFollowers')
      .withIndex('by_project_member_preference', (q) =>
        q.eq('projectMemberId', projectMember._id).eq('preference', 'following'),
      )
      .collect()
    let visibleGroupIds: Set<string>
    if (entitlement?.snapshotOperationId) {
      const snapshotOperationId = entitlement.snapshotOperationId
      const candidateGroupIds = [...new Map(
        followers.map((follower) => [String(follower.groupId), follower.groupId]),
      ).values()]
      const visibleGroupIdValues = await Promise.all(candidateGroupIds.map(async (groupId) => {
        const visible = await hasArchivedChannelVisibility(ctx, {
          operationId: snapshotOperationId,
          projectMemberId: projectMember._id,
          groupId,
        })
        return visible ? String(groupId) : null
      }))
      visibleGroupIds = new Set(
        visibleGroupIdValues.filter((groupId): groupId is string => groupId !== null),
      )
    } else if (entitlement) {
      visibleGroupIds = new Set(entitlement.channelIds.map(String))
    } else if (access.companyAccess) {
      const memberships = await ctx.db
        .query('groupMembers')
        .withIndex('by_project_member_status', (q) =>
          q.eq('projectMemberId', projectMember._id).eq('status', 'active'),
        )
        .collect()
      visibleGroupIds = new Set(memberships.map((membership) => String(membership.groupId)))
    } else {
      const memberships = await ctx.db
        .query('groupMembers')
        .withIndex('by_user', (q) => q.eq('userId', args.userId))
        .collect()
      visibleGroupIds = new Set(
        memberships
          .filter((membership) =>
            membership.projectId === args.projectId &&
            (!membership.status || membership.status === 'active'),
          )
          .map((membership) => String(membership.groupId)),
      )
    }
    const legacySnapshots = (entitlement?.threadSnapshots ?? [])
      .map((snapshot) => decodeLegacyThreadSnapshot(ctx, snapshot))
    const snapshots = entitlement?.snapshotOperationId
      ? await getArchiveThreadSnapshots(
          ctx,
          entitlement.snapshotOperationId,
          projectMember._id,
          followers.map((follower) => follower.channelThreadId),
        )
      : new Map<string, ThreadSnapshot>(
          legacySnapshots.map((snapshot) => [String(snapshot._id), snapshot]),
        )
    const counts = new Map<string, number>()
    for (const follower of followers) {
      if (!visibleGroupIds.has(String(follower.groupId))) continue
      const snapshot = snapshots.get(String(follower.channelThreadId))
      if (cutoff && !snapshot) continue
      const [readState, thread] = await Promise.all([
        ctx.db.query('channelThreadReadStates').withIndex('by_thread_project_member', (q) =>
          q.eq('channelThreadId', follower.channelThreadId).eq('projectMemberId', projectMember._id),
        ).unique(),
        ctx.db.get(follower.channelThreadId),
      ])
      const latestChannelSequence = snapshot?.latestChannelSequence ?? thread?.latestChannelSequence ?? 0
      if (latestChannelSequence > (readState?.lastReadChannelSequence ?? 0)) {
        counts.set(String(follower.groupId), (counts.get(String(follower.groupId)) ?? 0) + 1)
      }
    }
    return [...counts].map(([groupId, unreadCount]) => ({
      groupId: groupId as Id<'groups'>,
      unreadCount,
    }))
  },
})

export const get = query({
  args: {
    threadId: v.id('channelThreads'),
    userId: v.id('users'),
    actingCompanyId: v.optional(v.id('companies')),
    projectMemberId: v.optional(v.id('projectMembers')),
  },
  handler: async (ctx, args) => {
    if (!threadsEnabled()) return null
    try {
      const { access, cutoff, projectMember, thread } = await authorizeThread(ctx, args)
      const snapshotOperationId = access.companyAccess?.entitlement?.snapshotOperationId
      const legacySnapshots = (access.companyAccess?.entitlement?.threadSnapshots ?? [])
        .map((snapshot) => decodeLegacyThreadSnapshot(ctx, snapshot))
      const snapshot = snapshotOperationId
        ? await getArchivedThreadSnapshot(
            ctx,
            snapshotOperationId,
            projectMember._id,
            thread._id,
          )
        : legacySnapshots.find((item) => item._id === thread._id)
      if (cutoff && !snapshot) return null
      return await buildThreadSummary(ctx, thread, projectMember, cutoff, snapshot ?? undefined)
    } catch {
      return null
    }
  },
})

/** Returns aggregate read positions for replies in this thread. */
export const readReceiptSequences = query({
  args: {
    threadId: v.id('channelThreads'),
    userId: v.id('users'),
    actingCompanyId: v.optional(v.id('companies')),
    projectMemberId: v.optional(v.id('projectMembers')),
  },
  handler: async (ctx, args) => {
    if (!threadsEnabled()) return { recipientCount: 0, readThroughSequences: [] }
    const { cutoff, projectMember, thread } = await authorizeThread(ctx, args)
    if (cutoff || thread.status !== 'active') return { recipientCount: 0, readThroughSequences: [] }

    const [followers, memberships, states] = await Promise.all([
      ctx.db.query('channelThreadFollowers').withIndex('by_thread_project_member', (q) =>
        q.eq('channelThreadId', thread._id),
      ).collect(),
      ctx.db.query('groupMembers').withIndex('by_group', (q) => q.eq('groupId', thread.groupId)).collect(),
      ctx.db.query('channelThreadReadStates').withIndex('by_thread_project_member', (q) =>
        q.eq('channelThreadId', thread._id),
      ).collect(),
    ])
    const activeMemberIds = new Set(memberships
      .filter((membership) => !membership.status || membership.status === 'active')
      .map((membership) => String(membership.projectMemberId)))
    const recipients = new Set(followers
      .filter((follower) =>
        follower.projectMemberId !== projectMember._id &&
        activeMemberIds.has(String(follower.projectMemberId)),
      )
      .map((follower) => String(follower.projectMemberId)))
    return {
      recipientCount: recipients.size,
      readThroughSequences: states
        .filter((state) => recipients.has(String(state.projectMemberId)))
        .map((state) => state.lastReadChannelSequence),
    }
  },
})

export const listMessages = query({
  args: {
    threadId: v.id('channelThreads'),
    userId: v.id('users'),
    actingCompanyId: v.optional(v.id('companies')),
    projectMemberId: v.optional(v.id('projectMembers')),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (!threadsEnabled()) return []
    const { access, cutoff, thread } = await authorizeThread(ctx, args)
      const archivedThread = cutoff && access.companyAccess?.entitlement?.snapshotOperationId
        ? await getArchivedThreadSnapshot(
            ctx,
            access.companyAccess.entitlement.snapshotOperationId,
            access.projectMember._id,
            thread._id,
          )
        : null
      const snapshots = access.companyAccess?.entitlement?.snapshotOperationId
        ? archivedThread ? [archivedThread] : []
        : access.companyAccess?.entitlement?.threadSnapshots ?? []
      if (cutoff && !snapshots.some((snapshot: { _id?: Id<'channelThreads'> }) => snapshot._id === thread._id)) {
        return []
      }
      const messages = await ctx.db
        .query('messages')
        .withIndex('by_thread_created_at', (q) => cutoff
          ? q.eq('channelThreadId', thread._id).lte('createdAt', cutoff)
          : q.eq('channelThreadId', thread._id))
        .order('desc')
        .take(boundedThreadMessageLimit(args.limit))
      const hiddenIds = await hiddenMessageIdsForUser(ctx, args.userId, messages)
    return await Promise.all(visibleMessages(messages, hiddenIds).filter((message) =>
      message._id !== thread.sourceMessageId,
    ).map(async (message) =>
        await buildMessageDetail(
          ctx,
          message,
          args.userId,
          args.projectMemberId,
          cutoff,
          access.companyAccess?.entitlement?.channelSnapshots,
          snapshots,
          access.companyAccess?.entitlement?.memberSnapshots,
          access.companyAccess?.entitlement?.snapshotOperationId,
        ),
    ))
  },
})

export const listMessagePage = query({
  args: {
    threadId: v.id('channelThreads'),
    userId: v.id('users'),
    actingCompanyId: v.optional(v.id('companies')),
    projectMemberId: v.optional(v.id('projectMembers')),
    targetMessageId: v.optional(v.id('messages')),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    if (!threadsEnabled()) {
      return { page: [], isDone: true, continueCursor: '' }
    }
    const { access, cutoff, thread } = await authorizeThread(ctx, args)
      const archivedThread = cutoff && access.companyAccess?.entitlement?.snapshotOperationId
        ? await getArchivedThreadSnapshot(
            ctx,
            access.companyAccess.entitlement.snapshotOperationId,
            access.projectMember._id,
            thread._id,
          )
        : null
      const snapshots = access.companyAccess?.entitlement?.snapshotOperationId
        ? archivedThread ? [archivedThread] : []
        : access.companyAccess?.entitlement?.threadSnapshots ?? []
      if (cutoff && !snapshots.some((snapshot: { _id?: Id<'channelThreads'> }) => snapshot._id === thread._id)) {
        return { page: [], isDone: true, continueCursor: '' }
      }
      const pageSize = Math.min(Math.max(args.paginationOpts.numItems, 1), 100)
      const result = await ctx.db
        .query('messages')
        .withIndex('by_thread_created_at', (q) => cutoff
          ? q.eq('channelThreadId', thread._id).lte('createdAt', cutoff)
          : q.eq('channelThreadId', thread._id))
        .order('desc')
        .paginate({ ...args.paginationOpts, numItems: pageSize })
      const hiddenIds = await hiddenMessageIdsForUser(ctx, args.userId, [...result.page])
      const page = visibleMessages([...result.page], hiddenIds).filter((message) => message._id !== thread.sourceMessageId)
      if (args.paginationOpts.cursor === null && args.targetMessageId) {
        const target = await ctx.db.get(args.targetMessageId)
        if (
          target?.channelThreadId === thread._id &&
          target.projectId === thread.projectId &&
          target.groupId === thread.groupId &&
          !(await hiddenMessageIdsForUser(ctx, args.userId, [target])).has(String(target._id)) &&
          (!cutoff || target.createdAt <= cutoff) &&
          !page.some((message) => message._id === target._id)
        ) {
          const contextSize = Math.max(1, Math.floor((pageSize - 1) / 2))
          const [older, newer] = await Promise.all([
            ctx.db
              .query('messages')
              .withIndex('by_thread_created_at', (q) => q
                .eq('channelThreadId', thread._id)
                .lt('createdAt', target.createdAt))
              .order('desc')
              .take(contextSize),
            ctx.db
              .query('messages')
              .withIndex('by_thread_created_at', (q) => cutoff
                ? q.eq('channelThreadId', thread._id)
                  .gt('createdAt', target.createdAt)
                  .lte('createdAt', cutoff)
                : q.eq('channelThreadId', thread._id)
                  .gt('createdAt', target.createdAt))
              .order('asc')
              .take(contextSize),
          ])
          const reversedNewer = [...newer]
          // eslint-disable-next-line unicorn/no-array-reverse -- reason: ES2022 compatibility; operates on a fresh local array.
          reversedNewer.reverse()
          const targetContext = [...reversedNewer, target, ...older]
          const hiddenTargetContextIds = await hiddenMessageIdsForUser(ctx, args.userId, targetContext)
          page.splice(0, page.length, ...visibleMessages(targetContext, hiddenTargetContextIds))
        }
      }
    return {
        ...result,
        page: await Promise.all(page.map(async (message) =>
          await buildMessageDetail(
            ctx,
            message,
            args.userId,
            args.projectMemberId,
            cutoff,
            access.companyAccess?.entitlement?.channelSnapshots,
            snapshots,
            access.companyAccess?.entitlement?.memberSnapshots,
            access.companyAccess?.entitlement?.snapshotOperationId,
          ),
        )),
    }
  },
})

export const create = mutation({
  args: {
    projectId: v.id('projects'),
    groupId: v.id('groups'),
    creatorId: v.id('users'),
    actingCompanyId: v.optional(v.id('companies')),
    projectMemberId: v.optional(v.id('projectMembers')),
    name: v.string(),
    sourceMessageId: v.optional(v.id('messages')),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    requireThreadsEnabled()
    const access = await authorizeScopedRequest(ctx, {
      projectId: args.projectId,
      groupId: args.groupId,
      claimedUserId: args.creatorId,
      actingCompanyId: args.actingCompanyId,
      projectMemberId: args.projectMemberId,
    }, 'writeChannel')
    const group = await ctx.db.get(args.groupId)
    const projectMember = access.projectMember
    if (!group || group.projectId !== args.projectId) throw new Error('thread_access_changed')
    if (
      (group.status && group.status !== 'active') ||
      (access.project.status && access.project.status !== 'active')
    ) {
      throw new Error('thread_parent_read_only')
    }
    const existing = await ctx.db
      .query('channelThreads')
      .withIndex('by_creator_idempotency', (q) =>
        q
          .eq('creatorProjectMemberId', projectMember._id)
          .eq('idempotencyKey', args.idempotencyKey),
      )
      .unique()
    if (existing) {
      if (existing.projectId !== args.projectId || existing.groupId !== args.groupId) {
        throw new Error('idempotency_scope_mismatch')
      }
      return existing._id
    }
    if (args.sourceMessageId) {
      const sourceMessage = await ctx.db.get(args.sourceMessageId)
      if (
        !sourceMessage ||
        sourceMessage.projectId !== args.projectId ||
        sourceMessage.groupId !== args.groupId ||
        sourceMessage.channelThreadId
      ) {
        throw new Error('thread_source_unavailable')
      }
      const sourceThread = await ctx.db
        .query('channelThreads')
        .withIndex('by_group_source', (q) =>
          q.eq('groupId', args.groupId).eq('sourceMessageId', args.sourceMessageId),
        )
        .unique()
      if (sourceThread) return sourceThread._id
    }
    const now = Date.now()
    const threadId = await ctx.db.insert('channelThreads', {
      projectId: args.projectId,
      groupId: args.groupId,
      name: validateChannelThreadName(args.name),
      sourceMessageId: args.sourceMessageId,
      creatorUserId: args.creatorId,
      creatorProjectMemberId: projectMember._id,
      actingCompanyId: access.companyAccess?.company._id,
      status: 'active',
      revision: 1,
      replyCount: 0,
      latestChannelSequence: 0,
      idempotencyKey: args.idempotencyKey,
      createdAt: now,
      updatedAt: now,
    })
    const thread = (await ctx.db.get(threadId))!
    await upsertThreadFollower(ctx, {
      thread,
      userId: args.creatorId,
      projectMember,
      actingCompanyId: access.companyAccess?.company._id,
      reason: 'created',
    })
    await appendAuditEvent(ctx, {
      projectId: args.projectId,
      groupId: args.groupId,
      channelThreadId: threadId,
      actorId: args.creatorId,
      actorProjectMemberId: projectMember._id,
      actingCompanyId: access.companyAccess?.company._id,
      entityType: 'channelThread',
      entityId: threadId,
      action: 'channel_thread.created',
      after: { name: thread.name, sourceMessageId: args.sourceMessageId },
    })
    return threadId
  },
})

export const setFollowing = mutation({
  args: {
    threadId: v.id('channelThreads'),
    userId: v.id('users'),
    actingCompanyId: v.optional(v.id('companies')),
    projectMemberId: v.optional(v.id('projectMembers')),
    following: v.boolean(),
  },
  handler: async (ctx, args) => {
    requireThreadsEnabled()
    const { access, projectMember, thread } = await authorizeThread(ctx, args, 'writeChannel')
    await upsertThreadFollower(ctx, {
      thread,
      userId: args.userId,
      projectMember,
      actingCompanyId: access.companyAccess?.company._id,
      reason: 'explicit',
      preference: args.following ? 'following' : 'unfollowed',
    })
    return args.following
  },
})

export const markRead = mutation({
  args: {
    threadId: v.id('channelThreads'),
    userId: v.id('users'),
    actingCompanyId: v.optional(v.id('companies')),
    projectMemberId: v.optional(v.id('projectMembers')),
    viewedChannelSequence: v.number(),
  },
  handler: async (ctx, args) => {
    requireThreadsEnabled()
    const { access, cutoff, projectMember, thread } = await authorizeThread(ctx, args)
    if (cutoff) throw new Error('archive_read_state_immutable')
    if (!Number.isInteger(args.viewedChannelSequence) || args.viewedChannelSequence < 0) {
      throw new Error('read_sequence_invalid')
    }
    const existing = await ctx.db
      .query('channelThreadReadStates')
      .withIndex('by_thread_project_member', (q) =>
        q.eq('channelThreadId', thread._id).eq('projectMemberId', projectMember._id),
      )
      .unique()
    if (existing && args.viewedChannelSequence <= existing.lastReadChannelSequence) {
      return existing._id
    }
    if (args.viewedChannelSequence === 0) return existing?._id ?? null
    const viewedMessage = await ctx.db
      .query('messages')
      .withIndex('by_group_channel_sequence', (q) =>
        q.eq('groupId', thread.groupId).eq('channelSequence', args.viewedChannelSequence),
      )
      .filter((q) => q.eq(q.field('channelThreadId'), thread._id))
      .first()
    const latestVisibleMessage = await ctx.db
      .query('messages')
      .withIndex('by_thread_created_at', (q) => q.eq('channelThreadId', thread._id))
      .order('desc')
      .first()
    if (
      !viewedMessage ||
      viewedMessage.channelSequence !== args.viewedChannelSequence ||
      !latestVisibleMessage ||
      (latestVisibleMessage.channelSequence ?? 0) < args.viewedChannelSequence
    ) {
      throw new Error('read_sequence_unavailable')
    }
    const now = Date.now()
    if (existing) {
      await ctx.db.patch(existing._id, {
        lastReadChannelSequence: args.viewedChannelSequence,
        updatedAt: now,
      })
      return existing._id
    }
    return await ctx.db.insert('channelThreadReadStates', {
      projectId: thread.projectId,
      groupId: thread.groupId,
      channelThreadId: thread._id,
      userId: args.userId,
      projectMemberId: projectMember._id,
      actingCompanyId: access.companyAccess?.company._id,
      lastReadChannelSequence: args.viewedChannelSequence,
      createdAt: now,
      updatedAt: now,
    })
  },
})

async function updateThreadLifecycle(
  ctx: MutationCtx,
  args: {
    threadId: Id<'channelThreads'>
    userId: Id<'users'>
    actingCompanyId?: Id<'companies'>
    projectMemberId?: Id<'projectMembers'>
    expectedRevision: number
    status: 'active' | 'archived'
  },
) {
  const { access, projectMember, thread } = await authorizeThread(ctx, args, 'writeChannel')
  if (!await canManageThread(ctx, thread, projectMember)) throw new Error('thread_steward_required')
  if (thread.revision !== args.expectedRevision) {
    return { conflict: true, revision: thread.revision, status: thread.status, threadId: thread._id }
  }
  if (thread.status === args.status) {
    return { conflict: false, revision: thread.revision, status: thread.status, threadId: thread._id }
  }
  const now = Date.now()
  await ctx.db.patch(thread._id, {
    status: args.status,
    revision: thread.revision + 1,
    archivedAt: args.status === 'archived' ? now : undefined,
    updatedAt: now,
  })
  await appendAuditEvent(ctx, {
    projectId: thread.projectId,
    groupId: thread.groupId,
    channelThreadId: thread._id,
    actorId: args.userId,
    actorProjectMemberId: projectMember._id,
    actingCompanyId: access.companyAccess?.company._id,
    entityType: 'channelThread',
    entityId: thread._id,
    action: args.status === 'archived' ? 'channel_thread.archived' : 'channel_thread.reopened',
    before: { revision: thread.revision, status: thread.status },
    after: { revision: thread.revision + 1, status: args.status },
  })
  return { conflict: false, revision: thread.revision + 1, status: args.status, threadId: thread._id }
}

export const setStatus = mutation({
  args: {
    threadId: v.id('channelThreads'),
    userId: v.id('users'),
    actingCompanyId: v.optional(v.id('companies')),
    projectMemberId: v.optional(v.id('projectMembers')),
    expectedRevision: v.number(),
    status: threadStatus,
  },
  handler: async (ctx, args) => {
    requireThreadsEnabled()
    return await updateThreadLifecycle(ctx, args)
  },
})

export const rename = mutation({
  args: {
    threadId: v.id('channelThreads'),
    userId: v.id('users'),
    actingCompanyId: v.optional(v.id('companies')),
    projectMemberId: v.optional(v.id('projectMembers')),
    expectedRevision: v.number(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    requireThreadsEnabled()
    const { access, projectMember, thread } = await authorizeThread(ctx, args, 'writeChannel')
    if (!await canManageThread(ctx, thread, projectMember)) throw new Error('thread_steward_required')
    if (thread.revision !== args.expectedRevision) {
      return { conflict: true, name: thread.name, revision: thread.revision }
    }
    const name = validateChannelThreadName(args.name)
    const now = Date.now()
    await ctx.db.patch(thread._id, { name, revision: thread.revision + 1, updatedAt: now })
    await appendAuditEvent(ctx, {
      projectId: thread.projectId,
      groupId: thread.groupId,
      channelThreadId: thread._id,
      actorId: args.userId,
      actorProjectMemberId: projectMember._id,
      actingCompanyId: access.companyAccess?.company._id,
      entityType: 'channelThread',
      entityId: thread._id,
      action: 'channel_thread.renamed',
      before: { name: thread.name, revision: thread.revision },
      after: { name, revision: thread.revision + 1 },
    })
    return { conflict: false, name, revision: thread.revision + 1 }
  },
})
