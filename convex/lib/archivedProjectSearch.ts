
import type { Doc, Id } from '../_generated/dataModel'
import type { QueryCtx } from '../_generated/server'
import { threadsEnabled } from './channelThreadPolicy'
import {
  getArchivedChannelSnapshot,
  getArchivedMemberSnapshot,
  getArchivedThreadSnapshot,
} from './projectExitArchive'

function preview(value: string, fallback: string) {
  const compact = value.replace(/\s+/g, ' ').trim()
  return compact ? compact.slice(0, 160) : fallback
}

export async function searchNormalizedProjectArchive(
  ctx: QueryCtx,
  input: {
    entitlement: Doc<'projectArchiveEntitlements'>
    projectMember: Doc<'projectMembers'>
    term: string
    filter: string
    limit: number
  },
) {
  const { entitlement, projectMember, term, limit } = input
  const operationId = entitlement.snapshotOperationId
  if (!operationId) throw new Error('archive_snapshot_unavailable')
  const operation = await ctx.db.query('projectExitOperations').withIndex('by_operation_status', (q) =>
    q.eq('operationId', operationId).eq('status', 'verified')).unique()
  if (!operation || operation.projectId !== entitlement.projectId
    || operation.projectCompanyId !== entitlement.projectCompanyId) throw new Error('archive_snapshot_unavailable')

  // Project-wide search needs the Channel ACL, not the archive's message payloads.
  const visibility = await ctx.db.query('projectExitChannelVisibility').withIndex('by_operation_member', (q) =>
    q.eq('operationId', operationId).eq('projectMemberId', projectMember._id)).collect()
  const channelIds = visibility.map((row) => row.groupId)
  const includes = (kind: string) => input.filter === 'all' || input.filter === kind
  const channelCache = new Map<Id<'groups'>, ReturnType<typeof getArchivedChannelSnapshot>>()
  const threadCache = new Map<Id<'channelThreads'>, ReturnType<typeof getArchivedThreadSnapshot>>()
  const memberCache = new Map<Id<'projectMembers'>, ReturnType<typeof getArchivedMemberSnapshot>>()
  const channel = (groupId: Id<'groups'>) => {
    const cached = channelCache.get(groupId)
    if (cached) return cached
    const result = getArchivedChannelSnapshot(ctx, operationId, groupId)
    channelCache.set(groupId, result)
    return result
  }
  const thread = (threadId: Id<'channelThreads'>) => {
    const cached = threadCache.get(threadId)
    if (cached) return cached
    const result = getArchivedThreadSnapshot(ctx, operationId, projectMember._id, threadId)
    threadCache.set(threadId, result)
    return result
  }
  const member = (memberId: Id<'projectMembers'>) => {
    const cached = memberCache.get(memberId)
    if (cached) return cached
    const result = getArchivedMemberSnapshot(ctx, operationId, memberId)
    memberCache.set(memberId, result)
    return result
  }
  const [messageRows, fileRows, channelRows, threadRows] = await Promise.all([
    includes('messages') && channelIds.length
      ? ctx.db.query('messages').withSearchIndex('search_body_by_project', (q) =>
          q.search('body', term).eq('projectId', entitlement.projectId))
          .filter((q) => q.and(
            q.or(...channelIds.map((groupId) => q.eq(q.field('groupId'), groupId))),
            q.lte(q.field('createdAt'), entitlement.exitAt),
            // eslint-disable-next-line unicorn/no-useless-undefined -- reason: Convex compares absent optional fields explicitly.
            ...(threadsEnabled() ? [] : [q.eq(q.field('channelThreadId'), undefined)]),
          )).take(limit)
      : [],
    includes('files') && channelIds.length
      ? ctx.db.query('attachments').withSearchIndex('search_filename_by_project', (q) =>
          q.search('filename', term).eq('projectId', entitlement.projectId))
          .filter((q) => q.and(
            q.or(...channelIds.map((groupId) => q.eq(q.field('groupId'), groupId))),
            q.lte(q.field('createdAt'), entitlement.exitAt),
            // eslint-disable-next-line unicorn/no-useless-undefined -- reason: Convex compares absent optional fields explicitly.
            ...(threadsEnabled() ? [] : [q.eq(q.field('channelThreadId'), undefined)]),
          )).take(limit)
      : [],
    includes('groups') && channelIds.length
      ? ctx.db.query('projectExitSnapshotStaging').withSearchIndex('search_name_by_operation', (q) =>
          q.search('searchText', term).eq('operationId', operationId).eq('scope', 'channel'))
          .filter((q) => q.or(...channelIds.map((groupId) => q.eq(q.field('groupId'), groupId)))).take(limit)
      : [],
    includes('threads') && threadsEnabled()
      ? ctx.db.query('projectExitSnapshotStaging').withSearchIndex('search_name_by_operation', (q) =>
          q.search('searchText', term).eq('operationId', operationId).eq('scope', 'thread')
            .eq('projectMemberId', projectMember._id)).take(limit)
      : [],
  ])
  const messages = await Promise.all(messageRows.map(async (message) => {
    const [group, focusedThread, author] = await Promise.all([
      channel(message.groupId),
      message.channelThreadId ? thread(message.channelThreadId) : null,
      message.authorProjectMemberId ? member(message.authorProjectMemberId) : null,
    ])
    if (!group || (message.channelThreadId && !focusedThread)) return null
    const authorName = author?.user.displayName ?? 'Former member'
    return {
      createdAt: message.createdAt, groupId: group._id, groupName: group.name,
      id: message._id, kind: 'message' as const, messageId: message._id,
      threadId: message.channelThreadId, threadName: focusedThread?.name,
      preview: preview(message.body, 'Attachment message'),
      subtitle: `${authorName} in ${focusedThread ? `${focusedThread.name} · ` : ''}${group.name}`,
      title: authorName,
    }
  }))
  const files = await Promise.all(fileRows.map(async (file) => {
    const message = await ctx.db.get(file.messageId)
    if (!message || message.createdAt > entitlement.exitAt) return null
    if (!threadsEnabled() && message.channelThreadId) return null
    const [group, focusedThread] = await Promise.all([
      channel(file.groupId), message.channelThreadId ? thread(message.channelThreadId) : null,
    ])
    if (!group || (message.channelThreadId && !focusedThread)) return null
    return {
      attachmentId: file._id, createdAt: file.createdAt,
      groupId: group._id, groupName: group.name, id: file._id, kind: 'file' as const,
      messageId: file.messageId, threadId: message.channelThreadId, threadName: focusedThread?.name,
      preview: file.contentType, subtitle: focusedThread ? `${focusedThread.name} · ${group.name}` : group.name,
      title: file.filename,
    }
  }))
  const groups = channelRows.flatMap((row) => row.payload.kind === 'channel' ? [{
    createdAt: row.payload.snapshot.createdAt, groupId: row.payload.snapshot._id,
    groupName: row.payload.snapshot.name, id: row.payload.snapshot._id, kind: 'group' as const,
    preview: `${row.payload.snapshot.kind.replaceAll('_', ' ')} group`, subtitle: 'Channel',
    title: row.payload.snapshot.name,
  }] : [])
  const threads = await Promise.all(threadRows.map(async (row) => {
    if (row.payload.kind !== 'thread') return null
    const snapshot = row.payload.snapshot
    const group = await channel(snapshot.groupId)
    if (!group) return null
    return {
      createdAt: snapshot.createdAt, groupId: group._id, groupName: group.name,
      id: snapshot._id, kind: 'thread' as const,
      preview: snapshot.status === 'archived' ? 'Archived thread' : 'Active thread',
      subtitle: group.name, threadId: snapshot._id, threadName: snapshot.name, title: snapshot.name,
    }
  }))
  return {
    messages: messages.filter((row) => row !== null),
    files: files.filter((row) => row !== null), groups,
    threads: threads.filter((row) => row !== null),
  }
}
