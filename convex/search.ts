import { resolveReleaseFeatureFlag } from '@track/shared/feature-flags'
import { v } from 'convex/values'

import type { Id } from './_generated/dataModel'
import { query, type QueryCtx } from './_generated/server'
import { authorizeScopedRequest } from './lib/requestAuthorization'
import { createTaskRequestScope } from './lib/taskPolicy'
import { threadsEnabled } from './lib/channelThreadPolicy'
import { searchArchivedTasks } from './lib/taskData'
import { archivedTaskSearchHit, searchNormalizedProjectArchive } from './lib/archivedProjectSearch'
import { getGroupUnreadCount } from './lib/groupUnreadCount'
import { isUnreadChannelMessage, isUnreadThread, isUnreadThreadMessage } from './lib/searchUnread'

const searchScope = v.union(
  v.literal('all'),
  v.literal('conversations'),
  v.literal('messages'),
  v.literal('files'),
  v.literal('groups'),
  v.literal('people'),
  v.literal('projects'),
  v.literal('tasks'),
  v.literal('threads'),
)

const searchThreadStatus = v.union(v.literal('active'), v.literal('archived'))

type ProjectSearchResult = {
  files: unknown[]
  groups: Array<{
    createdAt: number
    groupId: Id<'groups'>
    groupName: string
    id: Id<'groups'>
    kind: 'group'
    preview: string
    subtitle: string
    title: string
  }>
  messages: Array<{
    createdAt: number
    groupId: Id<'groups'>
    groupName: string
    id: Id<'messages'>
    kind: 'message'
    messageId: Id<'messages'>
    preview: string
    subtitle: string
    threadId: Id<'channelThreads'> | undefined
    threadName: string | undefined
    title: string
  }>
  people: unknown[]
  projects: unknown[]
  tasks: unknown[]
  threads: Array<{
    createdAt: number
    groupId: Id<'groups'>
    groupName: string
    id: Id<'channelThreads'>
    kind: 'thread'
    preview: string
    subtitle: string
    threadId: Id<'channelThreads'>
    threadName: string
    title: string
  }>
  unreadSearchTruncated: boolean
}

function compactPreview(value: string, fallback = 'No preview available') {
  const preview = value.replace(/\s+/g, ' ').trim()
  if (!preview) return fallback
  return preview.length > 160 ? `${preview.slice(0, 157)}...` : preview
}

function enabled(scope: string, candidate: string) {
  return scope === 'all' || scope === candidate || (scope === 'conversations' && ['messages', 'groups', 'threads'].includes(candidate))
}

type ProjectSearchArgs = {
  actingCompanyId?: Id<'companies'>
  filter?: 'all' | 'conversations' | 'messages' | 'files' | 'groups' | 'people' | 'projects' | 'tasks' | 'threads'
  groupId?: Id<'groups'>
  limit?: number
  projectId: Id<'projects'>
  projectMemberId?: Id<'projectMembers'>
  query: string
  threadStatus?: 'active' | 'archived'
  unreadOnly?: boolean
  userId: Id<'users'>
}

const projectSearchArgs = {
  filter: v.optional(searchScope),
  limit: v.optional(v.number()),
  projectId: v.id('projects'),
  query: v.string(),
  userId: v.id('users'),
  groupId: v.optional(v.id('groups')),
  actingCompanyId: v.optional(v.id('companies')),
  projectMemberId: v.optional(v.id('projectMembers')),
  threadStatus: v.optional(searchThreadStatus),
  unreadOnly: v.optional(v.boolean()),
}

export const project = query({ args: projectSearchArgs, handler: searchProject })

export const conversations = query({
  args: {
    projects: v.array(v.object({
      actingCompanyId: v.optional(v.id('companies')),
      projectId: v.id('projects'),
      projectMemberId: v.id('projectMembers'),
    })),
    query: v.string(),
    unreadOnly: v.boolean(),
    userId: v.id('users'),
  },
  handler: async (ctx, args): Promise<{ projects: Array<{ projectId: Id<'projects'>; results: ProjectSearchResult }> }> => {
    const term = args.query.trim()
    if (term.length < 2) return { projects: [] }
    const projects = await Promise.all(args.projects.map(async (scope) => ({
      projectId: scope.projectId,
      results: await searchProject(ctx, {
        ...scope,
        filter: 'conversations',
        limit: 12,
        query: term,
        unreadOnly: args.unreadOnly,
        userId: args.userId,
      }),
    })))
    return { projects }
  },
})

type ArchivedChannelSnapshot = {
  _id: Id<'groups'>
  createdAt?: number
  kind?: string
  name: string
}

type ArchivedThreadSnapshot = {
  _id: Id<'channelThreads'>
  createdAt?: number
  groupId?: Id<'groups'>
  following?: boolean
  lastReadChannelSequence?: number
  latestChannelSequence?: number
  name: string
  status: 'active' | 'archived'
}

type ArchivedMemberSnapshot = {
  membership: { _id: Id<'projectMembers'>; userId: Id<'users'> }
  user: { displayName: string }
}

async function searchProject(ctx: QueryCtx, args: ProjectSearchArgs): Promise<ProjectSearchResult> {
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
        people: [],
        projects: [],
        tasks: [],
        threads: [],
        unreadSearchTruncated: false,
      }
    }

    if (access.companyAccess?.entitlement?.snapshotOperationId) {
      const unreadCandidateLimit = args.unreadOnly ? 101 : perSectionLimit
      const archivedResults = await searchNormalizedProjectArchive(ctx, {
        entitlement: access.companyAccess.entitlement,
        projectMember: access.companyAccess.projectMember,
        term, filter, limit: unreadCandidateLimit, threadStatus: args.threadStatus, unreadOnly: args.unreadOnly ?? false,
      })
      const normalizedTerm = term.toLowerCase()
      const people = enabled(filter, 'people')
        ? (access.companyAccess.entitlement.memberSnapshots ?? [])
            .filter((snapshot) => snapshot.user.displayName.toLowerCase().includes(normalizedTerm))
            .slice(0, perSectionLimit)
            .map((snapshot) => ({
              createdAt: access.companyAccess!.entitlement!.exitAt,
              groupName: 'Project member',
              id: String(snapshot.membership._id),
              kind: 'person' as const,
              preview: snapshot.membership.role,
              subtitle: 'Former Project member',
              title: snapshot.user.displayName,
            }))
        : []
      const archivedProject = await ctx.db.get(args.projectId)
      const projects = enabled(filter, 'projects') && archivedProject
        && [archivedProject.name, archivedProject.clientLabel, archivedProject.description]
          .some((value) => value?.toLowerCase().includes(normalizedTerm))
        ? [{
            createdAt: archivedProject.createdAt,
            groupName: 'Project',
            id: String(archivedProject._id),
            kind: 'project' as const,
            preview: compactPreview(archivedProject.description ?? '', 'Project workspace'),
            subtitle: archivedProject.status === 'archived' ? 'Archived Project' : 'Project',
            title: archivedProject.name,
          }]
        : []
      let archivedMessages = args.groupId
        ? archivedResults.messages.filter((message) => message.groupId === args.groupId)
        : archivedResults.messages
      let archivedGroups = archivedResults.groups
      let archivedThreads = archivedResults.threads
      if (args.unreadOnly) {
        const groupIds = [...new Set(archivedGroups.map((group) => String(group.groupId)))]
        const unreadCounts = new Map(await Promise.all(groupIds.map(async (groupId) => [
          groupId,
          await getGroupUnreadCount(ctx, groupId as Id<'groups'>, args.userId, access.projectMember._id, access.companyAccess?.entitlement?.exitAt),
        ] as const)))
        archivedMessages = archivedMessages.filter((message) => message.isUnread)
        archivedGroups = archivedGroups.filter((group) => (unreadCounts.get(String(group.groupId)) ?? 0) > 0)
        archivedThreads = archivedThreads.filter((thread) => thread.isUnread)
      }
      const unreadSearchTruncated = args.unreadOnly === true && Object.values(archivedResults.unreadSearchCandidateOverflow).some(Boolean)
      return {
        ...archivedResults,
        groups: args.unreadOnly ? archivedGroups.slice(0, perSectionLimit) : archivedGroups,
        messages: args.unreadOnly ? archivedMessages.slice(0, perSectionLimit) : archivedMessages,
        people,
        projects,
        threads: args.unreadOnly ? archivedThreads.slice(0, perSectionLimit) : archivedThreads,
        unreadSearchTruncated,
      }
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
    const searchableGroupIds = args.groupId
      ? visibleGroupIdValues.filter((groupId) => groupId === args.groupId)
      : visibleGroupIdValues
    const cutoff = access.companyAccess?.entitlement?.exitAt
    const channelSnapshotValues = (access.companyAccess?.entitlement?.channelSnapshots ?? []) as Array<ArchivedChannelSnapshot>
    const threadSnapshotValues = (access.companyAccess?.entitlement?.threadSnapshots ?? []) as Array<ArchivedThreadSnapshot>
    const memberSnapshotValues = (access.companyAccess?.entitlement?.memberSnapshots ?? []) as Array<ArchivedMemberSnapshot>
    const channelSnapshots = new Map(channelSnapshotValues.map((channel) => [String(channel._id), channel]))
    const threadSnapshots = new Map(threadSnapshotValues.map((thread) => [String(thread._id), thread]))
    const candidateLimit = args.unreadOnly ? 101 : perSectionLimit

    const messages = enabled(filter, 'messages')
      && searchableGroupIds.length > 0
      ? await ctx.db
          .query('messages')
          .withSearchIndex('search_body_by_project', (q) =>
            q.search('body', term).eq('projectId', args.projectId),
          )
          .filter((q) => q.and(
            q.or(...searchableGroupIds.map((groupId) => q.eq(q.field('groupId'), groupId))),
            ...(cutoff ? [q.lte(q.field('createdAt'), cutoff)] : []),
            ...(!threadsEnabled()
              ? [q.eq(q.field('channelThreadId'), undefined)]
              : cutoff
                ? [q.or(
                    q.eq(q.field('channelThreadId'), undefined),
                    ...[...threadSnapshots.keys()].map((threadId) =>
                      q.eq(q.field('channelThreadId'), threadId as Id<'channelThreads'>),
                    ),
                  )]
                : []),
          ))
          .take(candidateLimit)
      : []
    const messageResults = (
      await Promise.all(
        messages.map(async (message) => {
            const archivedAuthor = cutoff
              ? memberSnapshotValues.find((snapshot) => message.authorProjectMemberId
                  ? snapshot.membership._id === message.authorProjectMemberId
                  : snapshot.membership.userId === message.authorId)
              : undefined
            const [liveAuthor, group, channelThread, groupReadState, threadFollower, threadReadState] = await Promise.all([
              cutoff ? null : ctx.db.get(message.authorId),
              ctx.db.get(message.groupId),
              message.channelThreadId ? ctx.db.get(message.channelThreadId) : null,
              args.unreadOnly && !message.channelThreadId
                ? ctx.db.query('groupReadStates').withIndex('by_project_member_group', (q) =>
                    q.eq('projectMemberId', access.projectMember._id).eq('groupId', message.groupId),
                  ).unique()
                : null,
              args.unreadOnly && message.channelThreadId
                ? ctx.db.query('channelThreadFollowers').withIndex('by_thread_project_member', (q) =>
                    q.eq('channelThreadId', message.channelThreadId!).eq('projectMemberId', access.projectMember._id),
                  ).unique()
                : null,
              args.unreadOnly && message.channelThreadId
                ? ctx.db.query('channelThreadReadStates').withIndex('by_thread_project_member', (q) =>
                    q.eq('channelThreadId', message.channelThreadId!).eq('projectMemberId', access.projectMember._id),
                  ).unique()
                : null,
            ])
            const authorName = archivedAuthor?.user.displayName ?? liveAuthor?.displayName ?? 'Unknown member'
            const groupName = channelSnapshots.get(String(message.groupId))?.name ?? group?.name ?? 'Unknown channel'
            const isUnread = args.unreadOnly && message.channelThreadId
              ? isUnreadThreadMessage({
                  authorId: message.authorId,
                  authorProjectMemberId: message.authorProjectMemberId,
                  channelSequence: message.channelSequence,
                  following: threadFollower?.preference === 'following',
                  lastReadChannelSequence: threadReadState?.lastReadChannelSequence ?? 0,
                  projectMemberId: access.projectMember._id,
                  userId: args.userId,
                })
              : args.unreadOnly
                ? isUnreadChannelMessage({
                    authorId: message.authorId,
                    authorProjectMemberId: message.authorProjectMemberId,
                    createdAt: message.createdAt,
                    lastReadAt: groupReadState?.lastReadAt ?? 0,
                    projectMemberId: access.projectMember._id,
                    userId: args.userId,
                  })
                : false
            return {
              createdAt: message.createdAt,
              groupId: message.groupId,
              groupName,
              id: message._id,
              isUnread,
              kind: 'message' as const,
              messageId: message._id,
              threadId: message.channelThreadId,
              threadName: message.channelThreadId
                ? threadSnapshots.get(String(message.channelThreadId))?.name ?? channelThread?.name
                : undefined,
              preview: compactPreview(message.body, 'Attachment message'),
              subtitle: channelThread
                ? `${authorName} in ${threadSnapshots.get(String(channelThread._id))?.name ?? channelThread.name} · ${groupName}`
                : `${authorName} in ${groupName}`,
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
            ...(!threadsEnabled()
              ? [q.eq(q.field('channelThreadId'), undefined)]
              : cutoff
                ? [q.or(
                    q.eq(q.field('channelThreadId'), undefined),
                    ...[...threadSnapshots.keys()].map((threadId) =>
                      q.eq(q.field('channelThreadId'), threadId as Id<'channelThreads'>),
                    ),
                  )]
                : []),
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
            if (message?.channelThreadId && !threadsEnabled()) return null
            if (cutoff && message?.channelThreadId && !threadSnapshots.has(String(message.channelThreadId))) return null
            const channelThread = message?.channelThreadId
              ? await ctx.db.get(message.channelThreadId)
              : null
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
              threadId: message?.channelThreadId,
              threadName: channelThread
                ? threadSnapshots.get(String(channelThread._id))?.name ?? channelThread.name
                : undefined,
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
          .take(candidateLimit)
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

    const tasksIncluded = resolveReleaseFeatureFlag(process.env.TRACK_TASKS_ENABLED) && enabled(filter, 'tasks')
    const entitlement = access.companyAccess?.entitlement
    const archivedTaskViews = tasksIncluded && entitlement && access.companyAccess
      ? await searchArchivedTasks(ctx, {
          entitlement, projectMember: access.companyAccess.projectMember,
        }, term, perSectionLimit)
      : []
    const taskCandidates = tasksIncluded && !entitlement
      ? await ctx.db.query('tasks').withSearchIndex('search_tasks', (q) =>
          q.search('searchText', term).eq('projectId', args.projectId),
        ).take(perSectionLimit * 4)
      : []
    const taskScope = taskCandidates.length
      ? await createTaskRequestScope(ctx, access.actor, args.projectId, args)
      : null
    const taskResults = archivedTaskViews.map(archivedTaskSearchHit)
    for (const task of taskCandidates) {
      if (task.archivedAt || !taskScope) continue
      if (task.groupId) {
        if (!visibleGroupIds.has(String(task.groupId))) continue
        const taskAccess = await taskScope.forGroup(task.groupId)
        if (!taskAccess.capabilities.canReadChannel) continue
      }
      const [board, state, assignee] = await Promise.all([
        ctx.db.get(task.boardId),
        ctx.db.get(task.workflowStateId),
        task.assigneeProjectMemberId ? ctx.db.get(task.assigneeProjectMemberId) : null,
      ])
      if (!board || !state) continue
      taskResults.push({
        createdAt: task.createdAt,
        groupId: task.groupId,
        groupName: task.groupId ? 'Channel task' : 'Project task',
        id: String(task._id),
        kind: 'task' as const,
        preview: `${state.name} · ${task.priority}${task.dueDate ? ` · due ${task.dueDate}` : ''}`,
        subtitle: `${board.name}${assignee ? ' · assigned' : ''}`,
        taskKey: task.publicKey,
        title: task.title,
      })
      if (taskResults.length >= perSectionLimit) break
    }

    const channelThreads = !cutoff && threadsEnabled() && enabled(filter, 'threads')
      && visibleGroupIdValues.length > 0
      ? await ctx.db
          .query('channelThreads')
          .withSearchIndex('search_name_by_project', (q) => {
            const projectQuery = q.search('name', term).eq('projectId', args.projectId)
            return args.threadStatus ? projectQuery.eq('status', args.threadStatus) : projectQuery
          })
          .filter((q) => q.or(
            ...visibleGroupIdValues.map((groupId) => q.eq(q.field('groupId'), groupId)),
          ))
          .take(candidateLimit)
      : []
    const archivedThreadMatches = cutoff && threadsEnabled() && enabled(filter, 'threads')
      ? threadSnapshotValues
          .filter((thread) =>
            (!args.threadStatus || thread.status === args.threadStatus) &&
            thread.name.toLowerCase().includes(term.toLowerCase()),
          )
          .slice(0, candidateLimit)
      : []
    const threadResults = (await Promise.all(
      cutoff
        ? archivedThreadMatches.map(async (snapshot) => {
            const liveThread = snapshot.groupId ? null : await ctx.db.get(snapshot._id)
            const groupId = snapshot.groupId ?? liveThread?.groupId
            if (!groupId || !visibleGroupIds.has(String(groupId))) return null
            const groupName = channelSnapshots.get(String(groupId))?.name ?? 'Unknown channel'
            return {
              createdAt: snapshot.createdAt ?? cutoff,
              groupId,
              groupName,
              id: snapshot._id,
              isUnread: args.unreadOnly
                ? isUnreadThread({
                    following: snapshot.following === true,
                    latestChannelSequence: snapshot.latestChannelSequence ?? 0,
                    lastReadChannelSequence: snapshot.lastReadChannelSequence ?? 0,
                  })
                : false,
              kind: 'thread' as const,
              preview: snapshot.status === 'archived' ? 'Archived thread' : 'Active thread',
              subtitle: groupName,
              threadId: snapshot._id,
              threadName: snapshot.name,
              title: snapshot.name,
            }
          })
        : channelThreads.map(async (thread) => {
            const [group, follower, readState] = await Promise.all([
              ctx.db.get(thread.groupId),
              args.unreadOnly
                ? ctx.db.query('channelThreadFollowers').withIndex('by_thread_project_member', (q) =>
                    q.eq('channelThreadId', thread._id).eq('projectMemberId', access.projectMember._id),
                  ).unique()
                : null,
              args.unreadOnly
                ? ctx.db.query('channelThreadReadStates').withIndex('by_thread_project_member', (q) =>
                    q.eq('channelThreadId', thread._id).eq('projectMemberId', access.projectMember._id),
                  ).unique()
                : null,
            ])
            const groupName = group?.name ?? 'Unknown channel'
            return {
              createdAt: thread.createdAt,
              groupId: thread.groupId,
              groupName,
              id: thread._id,
              isUnread: args.unreadOnly && isUnreadThread({
                following: follower?.preference === 'following',
                latestChannelSequence: thread.latestChannelSequence ?? 0,
                lastReadChannelSequence: readState?.lastReadChannelSequence ?? 0,
              }),
              kind: 'thread' as const,
              preview: thread.status === 'archived' ? 'Archived thread' : 'Active thread',
              subtitle: groupName,
              threadId: thread._id,
              threadName: thread.name,
              title: thread.name,
            }
          }))
    ).filter((result) => result !== null)

    const unreadCounts = new Map<string, number>()
    if (args.unreadOnly) {
      const groupIds = [...new Set(groupResults.map((group) => String(group.groupId)))]
      const counts = await Promise.all(groupIds.map(async (groupId) => [
        groupId,
        await getGroupUnreadCount(ctx, groupId as Id<'groups'>, args.userId, access.projectMember._id, cutoff),
      ] as const))
      for (const [groupId, unreadCount] of counts) unreadCounts.set(groupId, unreadCount)
    }
    const unreadSearchTruncated = args.unreadOnly === true && (
      messages.length > 100 || groupResults.length > 100
      || (cutoff ? archivedThreadMatches.length : channelThreads.length) > 100
    )

    const normalizedTerm = term.toLowerCase()
    const activeProject = await ctx.db.get(args.projectId)
    const projects = enabled(filter, 'projects') && activeProject
      && [activeProject.name, activeProject.clientLabel, activeProject.description]
        .some((value) => value?.toLowerCase().includes(normalizedTerm))
      ? [{
          createdAt: activeProject.createdAt,
          groupName: 'Project',
          id: String(activeProject._id),
          kind: 'project' as const,
          preview: compactPreview(activeProject.description ?? '', 'Project workspace'),
          subtitle: activeProject.status === 'archived' ? 'Archived Project' : 'Project',
          title: activeProject.name,
        }]
      : []
    const memberRows = enabled(filter, 'people')
      ? await ctx.db.query('projectMembers')
          .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
          .take(1_001)
      : []
    if (memberRows.length > 1_000) throw new Error('project_member_search_limit_exceeded')
    const people = (await Promise.all(memberRows
      .filter((membership) => membership.status !== 'removed')
      .map(async (membership) => {
        const user = await ctx.db.get(membership.userId)
        const displayName = user?.displayName ?? membership.userDisplayNameSnapshot ?? 'Project member'
        if (!displayName.toLowerCase().includes(normalizedTerm)) return null
        return {
          createdAt: membership.createdAt,
          groupName: 'Project member',
          id: String(membership._id),
          kind: 'person' as const,
          preview: membership.role,
          subtitle: membership.companyDisplayNameSnapshot ?? 'Project member',
          title: displayName,
        }
      })))
      .filter((result) => result !== null)
      .slice(0, perSectionLimit)

    return {
      files: fileResults,
      groups: args.unreadOnly
        ? groupResults.filter((group) => (unreadCounts.get(String(group.groupId)) ?? 0) > 0).slice(0, perSectionLimit)
        : groupResults,
      messages: args.unreadOnly ? messageResults.filter((message) => message.isUnread).slice(0, perSectionLimit) : messageResults,
      people,
      projects,
      tasks: taskResults,
      threads: args.unreadOnly ? threadResults.filter((thread) => thread.isUnread).slice(0, perSectionLimit) : threadResults,
      unreadSearchTruncated,
    }
}
