
import type { Doc, Id } from '../_generated/dataModel'
import type { QueryCtx } from '../_generated/server'
import {
  getArchivedChannelSnapshot,
  getArchivedMemberSnapshot,
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
  const memberCache = new Map<Id<'projectMembers'>, ReturnType<typeof getArchivedMemberSnapshot>>()
  const channel = (groupId: Id<'groups'>) => {
    const cached = channelCache.get(groupId)
    if (cached) return cached
    const result = getArchivedChannelSnapshot(ctx, operationId, groupId)
    channelCache.set(groupId, result)
    return result
  }
  const member = (memberId: Id<'projectMembers'>) => {
    const cached = memberCache.get(memberId)
    if (cached) return cached
    const result = getArchivedMemberSnapshot(ctx, operationId, memberId)
    memberCache.set(memberId, result)
    return result
  }
  const [messageRows, fileRows, channelRows] = await Promise.all([
    includes('messages') && channelIds.length
      ? ctx.db.query('messages').withSearchIndex('search_body_by_project', (q) =>
          q.search('body', term).eq('projectId', entitlement.projectId))
          .filter((q) => q.and(
            q.or(...channelIds.map((groupId) => q.eq(q.field('groupId'), groupId))),
            q.lte(q.field('createdAt'), entitlement.exitAt),
            // eslint-disable-next-line unicorn/no-useless-undefined -- reason: Convex compares absent optional fields explicitly.
          )).take(limit)
      : [],
    includes('files') && channelIds.length
      ? ctx.db.query('attachments').withSearchIndex('search_filename_by_project', (q) =>
          q.search('filename', term).eq('projectId', entitlement.projectId))
          .filter((q) => q.and(
            q.or(...channelIds.map((groupId) => q.eq(q.field('groupId'), groupId))),
            q.lte(q.field('createdAt'), entitlement.exitAt),
            // eslint-disable-next-line unicorn/no-useless-undefined -- reason: Convex compares absent optional fields explicitly.
          )).take(limit)
      : [],
    includes('groups') && channelIds.length
      ? ctx.db.query('projectExitSnapshotStaging').withSearchIndex('search_name_by_operation', (q) =>
          q.search('searchText', term).eq('operationId', operationId).eq('scope', 'channel'))
          .filter((q) => q.or(...channelIds.map((groupId) => q.eq(q.field('groupId'), groupId)))).take(limit)
      : [],
  ])
  const messages = await Promise.all(messageRows.map(async (message) => {
    const [group, author] = await Promise.all([
      channel(message.groupId),
      message.authorProjectMemberId ? member(message.authorProjectMemberId) : null,
    ])

    if (!group) return null
    const authorName = author?.user.displayName ?? 'Former member'
    return {
      createdAt: message.createdAt, groupId: group._id, groupName: group.name,
      id: message._id, kind: 'message' as const, messageId: message._id,
      preview: preview(message.body, 'Attachment message'),
      subtitle: `${authorName} in ${group.name}`,
      title: authorName,
    }
  }))
  const files = await Promise.all(fileRows.map(async (file) => {
    const message = await ctx.db.get(file.messageId)
    if (!message || message.createdAt > entitlement.exitAt) return null

    const group = await channel(file.groupId)

    if (!group) return null
    return {
      attachmentId: file._id, createdAt: file.createdAt,
      groupId: group._id, groupName: group.name, id: file._id, kind: 'file' as const,
      preview: file.contentType, subtitle: group.name,
      messageId: file.messageId,
      title: file.filename,
    }
  }))
  const groups = channelRows.flatMap((row) => row.payload.kind === 'channel' ? [{
    createdAt: row.payload.snapshot.createdAt, groupId: row.payload.snapshot._id,
    groupName: row.payload.snapshot.name, id: row.payload.snapshot._id, kind: 'group' as const,
    preview: `${row.payload.snapshot.kind.replaceAll('_', ' ')} group`, subtitle: 'Channel',
    title: row.payload.snapshot.name,
  }] : [])
  return {
    messages: messages.filter((row) => row !== null),
    files: files.filter((row) => row !== null), groups,
  }
}
