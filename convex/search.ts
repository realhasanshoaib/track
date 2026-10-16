import { v } from 'convex/values'

import type { Id } from './_generated/dataModel'
import { query } from './_generated/server'
import { authorizeScopedRequest } from './lib/requestAuthorization'
import { searchNormalizedProjectArchive } from './lib/archivedProjectSearch'

const searchScope = v.union(
  v.literal('all'),
  v.literal('messages'),
  v.literal('files'),
  v.literal('groups'),
)

function compactPreview(value: string, fallback = 'No preview available') {
  const preview = value.replace(/\s+/g, ' ').trim()
  if (!preview) return fallback
  return preview.length > 160 ? `${preview.slice(0, 157)}...` : preview
}

function enabled(scope: string, candidate: string) {
  return scope === 'all' || scope === candidate
}

type ArchivedChannelSnapshot = {
  _id: Id<'groups'>
  createdAt?: number
  kind?: string
  name: string
}

type ArchivedMemberSnapshot = {
  membership: { _id: Id<'projectMembers'>; userId: Id<'users'> }
  user: { displayName: string }
}

export const project = query({
  args: {
    filter: v.optional(searchScope),
    limit: v.optional(v.number()),
    projectId: v.id('projects'),
    query: v.string(),
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

    const term = args.query.trim()
    const filter = args.filter ?? 'all'
    const perSectionLimit = Math.max(3, Math.min(args.limit ?? 8, 12))

    if (term.length < 2) {
      return {
        files: [],
        groups: [],
        messages: [],
      }
    }

    if (access.companyAccess?.entitlement?.snapshotOperationId) {
      return await searchNormalizedProjectArchive(ctx, {
        entitlement: access.companyAccess.entitlement,
        projectMember: access.companyAccess.projectMember,
        term, filter, limit: perSectionLimit,
      })
    }

    const groupMemberships = access.companyAccess
      ? access.companyAccess.projectMember.status === 'archived'
        ? []
        : await ctx.db.query('groupMembers').withIndex('by_project_member_status', (q) =>
            q.eq('projectMemberId', access.companyAccess!.projectMember._id).eq('status', 'active'),
          ).collect()
      : await ctx.db.query('groupMembers').withIndex('by_user', (q) => q.eq('userId', args.userId)).collect()
    const visibleGroupIdValues = access.companyAccess?.entitlement?.channelIds ?? groupMemberships
        .filter((membership) => membership.projectId === args.projectId)
        .map((membership) => membership.groupId)
    const cutoff = access.companyAccess?.entitlement?.exitAt
    const channelSnapshotValues = (access.companyAccess?.entitlement?.channelSnapshots ?? []) as Array<ArchivedChannelSnapshot>
    const memberSnapshotValues = (access.companyAccess?.entitlement?.memberSnapshots ?? []) as Array<ArchivedMemberSnapshot>
    const channelSnapshots = new Map(channelSnapshotValues.map((channel) => [String(channel._id), channel]))

    const messages = enabled(filter, 'messages')
      && visibleGroupIdValues.length > 0
      ? await ctx.db
          .query('messages')
          .withSearchIndex('search_body_by_project', (q) =>
            q.search('body', term).eq('projectId', args.projectId),
          )
          .filter((q) => q.and(
            q.or(...visibleGroupIdValues.map((groupId) => q.eq(q.field('groupId'), groupId))),
            ...(cutoff ? [q.lte(q.field('createdAt'), cutoff)] : []),
          ))
          .take(perSectionLimit)
      : []
    const messageResults = (
      await Promise.all(
        messages.map(async (message) => {
            const archivedAuthor = cutoff
              ? memberSnapshotValues.find((snapshot) => message.authorProjectMemberId
                  ? snapshot.membership._id === message.authorProjectMemberId
                  : snapshot.membership.userId === message.authorId)
              : undefined
            const [liveAuthor, group] = await Promise.all([
              cutoff ? null : ctx.db.get(message.authorId),
              ctx.db.get(message.groupId),
            ])
            const authorName = archivedAuthor?.user.displayName ?? liveAuthor?.displayName ?? 'Unknown member'
            const groupName = channelSnapshots.get(String(message.groupId))?.name ?? group?.name ?? 'Unknown channel'
            return {
              createdAt: message.createdAt,
              groupId: message.groupId,
              groupName,
              id: message._id,
              kind: 'message' as const,
              messageId: message._id,
              preview: compactPreview(message.body, 'Attachment message'),
              subtitle: `${authorName} in ${groupName}`,
              title: authorName,
            }
          }),
      )
    ).filter((result) => result !== null)

    const files = enabled(filter, 'files')
      && visibleGroupIdValues.length > 0
      ? await ctx.db
          .query('attachments')
          .withSearchIndex('search_filename_by_project', (q) =>
            q.search('filename', term).eq('projectId', args.projectId),
          )
          .filter((q) => q.and(
            q.or(...visibleGroupIdValues.map((groupId) => q.eq(q.field('groupId'), groupId))),
            ...(cutoff ? [q.lte(q.field('createdAt'), cutoff)] : []),
          ))
          .take(perSectionLimit)
      : []
    const fileResults = (
      await Promise.all(
        files.map(async (file) => {
            const [group, message] = await Promise.all([
              ctx.db.get(file.groupId),
              ctx.db.get(file.messageId),
            ])

            if (!message) return null
            const groupName = channelSnapshots.get(String(file.groupId))?.name ?? group?.name ?? 'Unknown channel'
            return {
              attachmentId: file._id,
              contentType: file.contentType,
              createdAt: file.createdAt,
              groupId: file.groupId,
              groupName,
              id: file._id,
              kind: 'file' as const,
              messageId: file.messageId,
              preview: `${file.contentType || 'file'} · ${file.size.toLocaleString()} bytes`,
              subtitle: groupName,
              title: file.filename,
            }
          }),
      )
    ).filter((result) => result !== null)

    const groups = !cutoff && enabled(filter, 'groups')
      && visibleGroupIdValues.length > 0
      ? await ctx.db
          .query('groups')
          .withSearchIndex('search_name_by_project', (q) =>
            q.search('name', term).eq('projectId', args.projectId),
          )
          .filter((q) => q.or(
            ...visibleGroupIdValues.map((groupId) => q.eq(q.field('_id'), groupId)),
          ))
          .take(perSectionLimit)
      : []
    const visibleGroupIds = new Set(visibleGroupIdValues.map(String))
    const groupResults = cutoff
      ? enabled(filter, 'groups')
        ? channelSnapshotValues
            .filter((group) =>
              visibleGroupIds.has(String(group._id)) &&
              group.name.toLowerCase().includes(term.toLowerCase()),
            )
            .slice(0, perSectionLimit)
            .map((group) => ({
              createdAt: group.createdAt ?? cutoff,
              groupId: group._id,
              groupName: group.name,
              id: group._id,
              kind: 'group' as const,
              preview: `${(group.kind ?? 'channel').replaceAll('_', ' ')} group`,
              subtitle: 'Channel',
              title: group.name,
            }))
        : []
      : groups.map((group) => ({
          createdAt: group.createdAt,
          groupId: group._id,
          groupName: group.name,
          id: group._id,
          kind: 'group' as const,
          preview: `${group.kind.replaceAll('_', ' ')} group`,
          subtitle: 'Channel',
          title: group.name,
        }))

    return {
      files: fileResults,
      groups: groupResults,
      messages: messageResults,
    }
  },
})
