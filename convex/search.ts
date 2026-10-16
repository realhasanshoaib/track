import { v } from 'convex/values'
import { query } from './_generated/server'
import { authorizeScopedRequest } from './lib/requestAuthorization'
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
export const project = query({
  args: {
    filter: v.optional(searchScope),
    limit: v.optional(v.number()),
    projectId: v.id('projects'),
    query: v.string(),
    userId: v.id('users'),
    projectMemberId: v.optional(v.id('projectMembers')),
  },
  handler: async (ctx, args) => {
    await authorizeScopedRequest(
      ctx,
      {
        projectId: args.projectId,
        claimedUserId: args.userId,
        projectMemberId: args.projectMemberId,
      },
      'readProject',
    )
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
    const groupMemberships = await ctx.db
      .query('groupMembers')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .collect()
    const visibleGroupIdValues = groupMemberships
      .filter((membership) => membership.projectId === args.projectId)
      .map((membership) => membership.groupId)
    const messages =
      enabled(filter, 'messages') && visibleGroupIdValues.length > 0
        ? await ctx.db
            .query('messages')
            .withSearchIndex('search_body_by_project', (q) =>
              q.search('body', term).eq('projectId', args.projectId),
            )
            .filter((q) =>
              q.and(
                q.or(...visibleGroupIdValues.map((groupId) => q.eq(q.field('groupId'), groupId))),
              ),
            )
            .take(perSectionLimit)
        : []
    const messageResults = (
      await Promise.all(
        messages.map(async (message) => {
          const [liveAuthor, group] = await Promise.all([
            ctx.db.get(message.authorId),
            ctx.db.get(message.groupId),
          ])
          const authorName = liveAuthor?.displayName ?? 'Unknown member'
          const groupName = group?.name ?? 'Unknown channel'
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
    const files =
      enabled(filter, 'files') && visibleGroupIdValues.length > 0
        ? await ctx.db
            .query('attachments')
            .withSearchIndex('search_filename_by_project', (q) =>
              q.search('filename', term).eq('projectId', args.projectId),
            )
            .filter((q) =>
              q.and(
                q.or(...visibleGroupIdValues.map((groupId) => q.eq(q.field('groupId'), groupId))),
              ),
            )
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
          const groupName = group?.name ?? 'Unknown channel'
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
    const groups =
      enabled(filter, 'groups') && visibleGroupIdValues.length > 0
        ? await ctx.db
            .query('groups')
            .withSearchIndex('search_name_by_project', (q) =>
              q.search('name', term).eq('projectId', args.projectId),
            )
            .filter((q) =>
              q.or(...visibleGroupIdValues.map((groupId) => q.eq(q.field('_id'), groupId))),
            )
            .take(perSectionLimit)
        : []
    const groupResults = groups.map((group) => ({
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
