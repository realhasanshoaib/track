import { resolveReleaseFeatureFlag } from '@track/shared/feature-flags'
import { v } from 'convex/values'

import type { Id } from './_generated/dataModel'
import { query } from './_generated/server'
import { authorizeScopedRequest } from './lib/requestAuthorization'
import { createTaskRequestScope } from './lib/taskPolicy'
import { threadsEnabled } from './lib/channelThreadPolicy'
import { searchArchivedTasks } from './lib/taskData'
import { archivedTaskSearchHit, searchNormalizedProjectArchive } from './lib/archivedProjectSearch'

const searchScope = v.union(
  v.literal('all'),
  v.literal('messages'),
  v.literal('files'),
  v.literal('groups'),
  v.literal('people'),
  v.literal('projects'),
  v.literal('tasks'),
  v.literal('threads'),
)

const searchThreadStatus = v.union(v.literal('active'), v.literal('archived'))

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

type ArchivedThreadSnapshot = {
  _id: Id<'channelThreads'>
  createdAt?: number
  groupId?: Id<'groups'>
  name: string
  status: 'active' | 'archived'
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
    groupId: v.optional(v.id('groups')),
    actingCompanyId: v.optional(v.id('companies')),
    projectMemberId: v.optional(v.id('projectMembers')),
    threadStatus: v.optional(searchThreadStatus),
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
        people: [],
        projects: [],
        tasks: [],
        threads: [],
      }
    }

    if (access.companyAccess?.entitlement?.snapshotOperationId) {
      const archivedResults = await searchNormalizedProjectArchive(ctx, {
        entitlement: access.companyAccess.entitlement,
        projectMember: access.companyAccess.projectMember,
        term, filter, limit: perSectionLimit, threadStatus: args.threadStatus,
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
      return {
        ...archivedResults,
        messages: args.groupId
          ? archivedResults.messages.filter((message) => message.groupId === args.groupId)
          : archivedResults.messages,
        people,
        projects,
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
            const [liveAuthor, group, channelThread] = await Promise.all([
              cutoff ? null : ctx.db.get(message.authorId),
              ctx.db.get(message.groupId),
              message.channelThreadId ? ctx.db.get(message.channelThreadId) : null,
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
          .take(perSectionLimit)
      : []
    const archivedThreadMatches = cutoff && threadsEnabled() && enabled(filter, 'threads')
      ? threadSnapshotValues
          .filter((thread) =>
            (!args.threadStatus || thread.status === args.threadStatus) &&
            thread.name.toLowerCase().includes(term.toLowerCase()),
          )
          .slice(0, perSectionLimit)
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
              kind: 'thread' as const,
              preview: snapshot.status === 'archived' ? 'Archived thread' : 'Active thread',
              subtitle: groupName,
              threadId: snapshot._id,
              threadName: snapshot.name,
              title: snapshot.name,
            }
          })
        : channelThreads.map(async (thread) => {
            const group = await ctx.db.get(thread.groupId)
            const groupName = group?.name ?? 'Unknown channel'
            return {
              createdAt: thread.createdAt,
              groupId: thread.groupId,
              groupName,
              id: thread._id,
              kind: 'thread' as const,
              preview: thread.status === 'archived' ? 'Archived thread' : 'Active thread',
              subtitle: groupName,
              threadId: thread._id,
              threadName: thread.name,
              title: thread.name,
            }
          }))
    ).filter((result) => result !== null)

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
      groups: groupResults,
      messages: messageResults,
      people,
      projects,
      tasks: taskResults,
      threads: threadResults,
    }
  },
})
