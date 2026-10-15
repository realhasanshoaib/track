import { v } from 'convex/values'

import type { Doc, Id } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'
import { mutation } from './_generated/server'
import { devAuthBypassUser } from './lib/devAuth'
import { createUniqueTaskPublicKey } from './lib/taskData'

const fixtureNamePrefix = 'E2E '
const fixtureTokenArgument = v.string()
const performanceHistoryMessageCount = 24

const workflow = [
  { name: 'Backlog', category: 'backlog', visualToken: 'neutral', isDefault: false },
  { name: 'To do', category: 'unstarted', visualToken: 'blue', isDefault: true },
  { name: 'In progress', category: 'started', visualToken: 'amber', isDefault: false },
  { name: 'Done', category: 'completed', visualToken: 'green', isDefault: false },
  { name: 'Canceled', category: 'canceled', visualToken: 'neutral', isDefault: false },
] as const

type FixtureProject = {
  projectId: Id<'projects'>
  projectMemberId: Id<'projectMembers'>
  activeGroupId: Id<'groups'>
  archivedGroupId?: Id<'groups'>
}

function validNamespace(namespace: string) {
  if (!/^[a-z0-9-]{1,48}$/.test(namespace)) throw new Error('e2e_fixture_namespace_invalid')
  return namespace
}

function isLocalSiteUrl(value: string | undefined) {
  if (!value) return false
  try {
    const url = new URL(value)
    return url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost')
  } catch {
    return false
  }
}

function assertFixtureAccess(token: string) {
  if (
    process.env.TRACK_E2E_FIXTURE !== '1' ||
    !token ||
    token !== process.env.TRACK_E2E_FIXTURE_TOKEN ||
    !isLocalSiteUrl(process.env.SITE_URL)
  ) {
    throw new Error('e2e_fixture_disabled')
  }
}

async function fixtureUser(ctx: MutationCtx) {
  const identity = await ctx.auth.getUserIdentity()
  if (
    !identity ||
    identity.email?.trim().toLowerCase() !== devAuthBypassUser.email ||
    identity.subject !== devAuthBypassUser.googleSubject
  ) {
    throw new Error('e2e_fixture_identity_required')
  }

  const existing = await ctx.db
    .query('users')
    .withIndex('by_google_subject', (query) => query.eq('googleSubject', devAuthBypassUser.googleSubject))
    .unique()
  const now = Date.now()
  if (existing) {
    await ctx.db.patch(existing._id, {
      // The first seed runs before Better Auth creates its local user, so use
      // the fixture identity as a bootstrap value only. Subsequent resets run
      // after browser sign-in and must preserve the real Better Auth subject.
      authUserId: existing.authUserId ?? identity.subject,
      normalizedEmail: devAuthBypassUser.email,
      email: devAuthBypassUser.email,
      displayName: devAuthBypassUser.displayName,
      profileDesignation: existing.profileDesignation ?? 'E2E fixture user',
      profileBannerStyle: existing.profileBannerStyle ?? 'silk',
      timezone: existing.timezone ?? 'UTC',
      profileCompletedAt: existing.profileCompletedAt ?? now,
      updatedAt: now,
    })
    return await ctx.db.get(existing._id)
  }

  const userId = await ctx.db.insert('users', {
    googleSubject: devAuthBypassUser.googleSubject,
    authUserId: identity.subject,
    normalizedEmail: devAuthBypassUser.email,
    email: devAuthBypassUser.email,
    displayName: devAuthBypassUser.displayName,
    profileDesignation: 'E2E fixture user',
    profileBannerStyle: 'silk',
    timezone: 'UTC',
    profileCompletedAt: now,
    twoFactorEnabled: false,
    createdAt: now,
    updatedAt: now,
  })
  return await ctx.db.get(userId)
}

async function deleteProjectData(ctx: MutationCtx, projectId: Id<'projects'>) {
  const [groups, members, boards, tasks, messages, threads] = await Promise.all([
    ctx.db.query('groups').withIndex('by_project', (query) => query.eq('projectId', projectId)).collect(),
    ctx.db.query('projectMembers').withIndex('by_project', (query) => query.eq('projectId', projectId)).collect(),
    ctx.db.query('taskBoards').withIndex('by_project_archived', (query) => query.eq('projectId', projectId)).collect(),
    ctx.db.query('tasks').withIndex('by_project_archived', (query) => query.eq('projectId', projectId)).collect(),
    ctx.db.query('messages').withIndex('by_project_created_at', (query) => query.eq('projectId', projectId)).collect(),
    ctx.db.query('channelThreads').withIndex('by_project', (query) => query.eq('projectId', projectId)).collect(),
  ])
  const groupIds = new Set(groups.map((group) => String(group._id)))

  const [groupMembers, groupReads, groupSettings, typing, threadFollowers, threadReads, attachments, taskReferences, taskActivities, taskComments, taskFollowers, taskLabels, taskLabelLinks, taskNotifications, taskReminders, auditEvents, invitations] = await Promise.all([
    Promise.all(groups.map((group) => ctx.db.query('groupMembers').withIndex('by_group', (query) => query.eq('groupId', group._id)).collect())).then((rows) => rows.flat()),
    ctx.db.query('groupReadStates').collect().then((rows) => rows.filter((row) => row.projectId === projectId)),
    ctx.db.query('groupNotificationSettings').collect(),
    Promise.all(groups.map((group) => ctx.db.query('typingIndicators').withIndex('by_group_updated_at', (query) => query.eq('groupId', group._id)).collect())).then((rows) => rows.flat()),
    ctx.db.query('channelThreadFollowers').withIndex('by_project', (query) => query.eq('projectId', projectId)).collect(),
    ctx.db.query('channelThreadReadStates').withIndex('by_project', (query) => query.eq('projectId', projectId)).collect(),
    Promise.all(groups.map((group) => ctx.db.query('attachments').withIndex('by_group', (query) => query.eq('groupId', group._id)).collect())).then((rows) => rows.flat()),
    ctx.db.query('taskReferences').withIndex('by_project_created_at', (query) => query.eq('projectId', projectId)).collect(),
    ctx.db.query('taskActivities').withIndex('by_project_created_at', (query) => query.eq('projectId', projectId)).collect(),
    ctx.db.query('taskComments').withIndex('by_project_created_at', (query) => query.eq('projectId', projectId)).collect(),
    ctx.db.query('taskFollowers').collect().then((rows) => rows.filter((row) => row.projectId === projectId)),
    ctx.db.query('taskLabels').withIndex('by_project_archived', (query) => query.eq('projectId', projectId)).collect(),
    ctx.db.query('taskLabelLinks').withIndex('by_project_created_at', (query) => query.eq('projectId', projectId)).collect(),
    ctx.db.query('taskNotifications').withIndex('by_project', (query) => query.eq('projectId', projectId)).collect(),
    ctx.db.query('taskReminderJobs').withIndex('by_project', (query) => query.eq('projectId', projectId)).collect(),
    ctx.db.query('auditEvents').withIndex('by_project_created_at', (query) => query.eq('projectId', projectId)).collect(),
    Promise.all((['pending', 'accepted', 'revoked', 'expired'] as const).map((status) => ctx.db.query('invitations').withIndex('by_project_status', (query) => query.eq('projectId', projectId).eq('status', status)).collect())).then((rows) => rows.flat()),
  ])

  for (const row of groupSettings) {
    if (groupIds.has(String(row.groupId))) await ctx.db.delete(row._id)
  }
  for (const row of groupMembers) await ctx.db.delete(row._id)
  for (const row of groupReads) await ctx.db.delete(row._id)
  for (const row of typing) await ctx.db.delete(row._id)
  for (const row of threadFollowers) await ctx.db.delete(row._id)
  for (const row of threadReads) await ctx.db.delete(row._id)
  for (const row of threads) await ctx.db.delete(row._id)
  for (const row of attachments) {
    await ctx.db.delete(row._id)
  }
  for (const row of messages) {
    const hides = await ctx.db.query('messageHides')
      .withIndex('by_message', (query) => query.eq('messageId', row._id))
      .collect()
    for (const hide of hides) await ctx.db.delete(hide._id)
    await ctx.db.delete(row._id)
  }
  for (const row of taskReferences) await ctx.db.delete(row._id)
  for (const row of taskActivities) await ctx.db.delete(row._id)
  for (const row of taskComments) await ctx.db.delete(row._id)
  for (const row of taskFollowers) await ctx.db.delete(row._id)
  for (const row of taskLabelLinks) await ctx.db.delete(row._id)
  for (const row of taskLabels) await ctx.db.delete(row._id)
  for (const row of taskNotifications) await ctx.db.delete(row._id)
  for (const row of taskReminders) await ctx.db.delete(row._id)
  for (const row of tasks) await ctx.db.delete(row._id)
  for (const row of boards) {
    const states = await ctx.db.query('taskWorkflowStates').withIndex('by_board_rank', (query) => query.eq('boardId', row._id)).collect()
    for (const state of states) await ctx.db.delete(state._id)
    await ctx.db.delete(row._id)
  }
  for (const row of auditEvents) await ctx.db.delete(row._id)
  for (const row of invitations) await ctx.db.delete(row._id)
  for (const row of members) await ctx.db.delete(row._id)
  for (const row of groups) await ctx.db.delete(row._id)
  await ctx.db.delete(projectId)

}

async function clearFixture(ctx: MutationCtx, userId: Id<'users'>, namespace: string) {
  const memberships = await ctx.db.query('projectMembers').withIndex('by_user', (query) => query.eq('userId', userId)).collect()
  const fixtureProjects = []
  for (const membership of memberships) {
    const project = await ctx.db.get(membership.projectId)
    if (project?.createdBy === userId && project.name.startsWith(`${fixtureNamePrefix}${namespace} `)) fixtureProjects.push(project)
  }
  for (const project of fixtureProjects) await deleteProjectData(ctx, project._id)
}

async function createGroup(
  ctx: MutationCtx,
  input: { projectId: Id<'projects'>; projectMemberId: Id<'projectMembers'>; userId: Id<'users'>; name: string; status: 'active' | 'archived'; now: number },
) {
  const groupId = await ctx.db.insert('groups', {
    projectId: input.projectId,
    kind: 'custom',
    name: input.name,
    status: input.status,
    archivedAt: input.status === 'archived' ? input.now : undefined,
    revision: 1,
    nextChannelSequence: 0,
    createdBy: input.userId,
    createdAt: input.now,
    updatedAt: input.now,
  })
  await ctx.db.insert('groupMembers', {
    projectId: input.projectId,
    groupId,
    userId: input.userId,
    projectMemberId: input.projectMemberId,
    status: 'active',
    createdAt: input.now,
    updatedAt: input.now,
  })
  return groupId
}

async function createMessage(
  ctx: MutationCtx,
  input: { projectId: Id<'projects'>; groupId: Id<'groups'>; projectMemberId: Id<'projectMembers'>; userId: Id<'users'>; body: string; sequence: number; now: number },
) {
  return await ctx.db.insert('messages', {
    projectId: input.projectId,
    groupId: input.groupId,
    authorId: input.userId,
    authorProjectMemberId: input.projectMemberId,
    channelSequence: input.sequence,
    body: input.body,
    mentions: [],
    attachmentIds: [],
    createdAt: input.now + input.sequence,
  })
}

async function createBoardAndTask(
  ctx: MutationCtx,
  input: { projectId: Id<'projects'>; groupId: Id<'groups'>; projectMemberId: Id<'projectMembers'>; sourceMessageId: Id<'messages'>; now: number; namespace: string },
) {
  const boardId = await ctx.db.insert('taskBoards', {
    projectId: input.projectId,
    groupId: input.groupId,
    name: 'E2E conversation tasks',
    rank: '00000001',
    isDefault: true,
    createdByProjectMemberId: input.projectMemberId,
    createdAt: input.now,
    updatedAt: input.now,
  })
  const workflowStates = new Map<string, Id<'taskWorkflowStates'>>()
  for (const [index, state] of workflow.entries()) {
    const stateId = await ctx.db.insert('taskWorkflowStates', {
      projectId: input.projectId,
      boardId,
      name: state.name,
      category: state.category,
      visualToken: state.visualToken,
      rank: String(index + 1).padStart(4, '0'),
      isDefault: state.isDefault,
      createdAt: input.now,
      updatedAt: input.now,
    })
    workflowStates.set(state.name, stateId)
  }
  const todoState = workflowStates.get('To do')
  if (!todoState) throw new Error('e2e_fixture_workflow_missing')
  const taskId = await ctx.db.insert('tasks', {
    projectId: input.projectId,
    publicKey: await createUniqueTaskPublicKey(ctx, input.projectId),
    boardId,
    groupId: input.groupId,
    workflowStateId: todoState,
    rank: '0001',
    title: 'E2E source-linked task',
    description: 'A task created from the seeded conversation evidence.',
    searchText: 'e2e source-linked task a task created from the seeded conversation evidence.',
    assigneeProjectMemberId: input.projectMemberId,
    priority: 'high',
    createdByProjectMemberId: input.projectMemberId,
    revision: 1,
    createIdempotencyKey: `e2e-${input.namespace}-task`,
    createdAt: input.now,
    updatedAt: input.now,
  })
  await ctx.db.insert('taskReferences', {
    projectId: input.projectId,
    taskId,
    type: 'message',
    groupId: input.groupId,
    messageId: input.sourceMessageId,
    quote: 'E2E source message: assign an owner before launch.',
    availability: 'available',
    isPrimary: true,
    actorProjectMemberId: input.projectMemberId,
    rank: '0001',
    createdAt: input.now,
    updatedAt: input.now,
  })
  return { boardId, taskId }
}

async function seedFixture(ctx: MutationCtx, user: Doc<'users'>, namespace: string, historyMessageCount = 0) {
  const now = Date.now()
  const projectSpecs = [
    { name: `${fixtureNamePrefix}${namespace} Primary`, secondary: false },
    { name: `${fixtureNamePrefix}${namespace} Secondary`, secondary: true },
  ] as const
  const result: FixtureProject[] = []

  for (const [index, spec] of projectSpecs.entries()) {
    const projectId = await ctx.db.insert('projects', {
      name: spec.name,
      clientLabel: 'Isolated browser fixture',
      accessProfile: 'legacy',
      origin: 'single_company',
      status: 'active',
      participantRevision: 0,
      revision: 1,
      createdBy: user._id,
      createdAt: now + index,
      updatedAt: now + index,
    })
    const projectMemberId = await ctx.db.insert('projectMembers', {
      projectId,
      userId: user._id,
      role: 'owner',
      status: 'active',
      term: 1,
      createdAt: now + index,
      updatedAt: now + index,
    })
    const activeGroupId = await createGroup(ctx, {
      projectId,
      projectMemberId,
      userId: user._id,
      name: spec.secondary ? 'scope-check' : 'browser-journeys',
      status: 'active',
      now: now + index,
    })
    if (!spec.secondary && historyMessageCount > 0) {
      for (let historyIndex = 1; historyIndex <= historyMessageCount; historyIndex += 1) {
        await createMessage(ctx, {
          projectId,
          groupId: activeGroupId,
          projectMemberId,
          userId: user._id,
          body: `E2E performance history message ${historyIndex}`,
          sequence: historyIndex,
          now: now + index - historyMessageCount,
        })
      }
    }
    const sourceSequence = historyMessageCount + 1
    const sourceMessageId = await createMessage(ctx, {
      projectId,
      groupId: activeGroupId,
      projectMemberId,
      userId: user._id,
      body: spec.secondary ? 'Secondary project scope stays isolated.' : 'E2E source message: assign an owner before launch.',
      sequence: spec.secondary ? 1 : sourceSequence,
      now: now + index,
    })
    await createMessage(ctx, {
      projectId,
      groupId: activeGroupId,
      projectMemberId,
      userId: user._id,
      body: spec.secondary ? 'Only the secondary project evidence belongs here.' : 'Conversation evidence remains linked to the source task.',
      sequence: spec.secondary ? 2 : sourceSequence + 1,
      now: now + index,
    })
    let archivedGroupId: Id<'groups'> | undefined
    if (!spec.secondary) {
      archivedGroupId = await createGroup(ctx, {
        projectId,
        projectMemberId,
        userId: user._id,
        name: 'archived-review',
        status: 'archived',
        now: now + index,
      })
      await createMessage(ctx, {
        projectId,
        groupId: archivedGroupId,
        projectMemberId,
        userId: user._id,
        body: 'Archived evidence remains available for review.',
        sequence: 1,
        now: now + index,
      })
      await createBoardAndTask(ctx, {
        projectId,
        groupId: activeGroupId,
        projectMemberId,
        sourceMessageId,
        now: now + index,
        namespace,
      })
    }
    result.push({ projectId, projectMemberId, activeGroupId, archivedGroupId })
  }
  return { namespace, userId: user._id, projects: result }
}

const fixtureArgs = {
  namespace: v.string(),
  token: fixtureTokenArgument,
}

export const seed = mutation({
  args: fixtureArgs,
  handler: async (ctx, args) => {
    assertFixtureAccess(args.token)
    const namespace = validNamespace(args.namespace)
    const user = await fixtureUser(ctx)
    if (!user) throw new Error('e2e_fixture_user_missing')
    await clearFixture(ctx, user._id, namespace)
    return await seedFixture(ctx, user, namespace)
  },
})

export const reset = mutation({
  args: fixtureArgs,
  handler: async (ctx, args) => {
    assertFixtureAccess(args.token)
    const namespace = validNamespace(args.namespace)
    const user = await fixtureUser(ctx)
    if (!user) throw new Error('e2e_fixture_user_missing')
    await clearFixture(ctx, user._id, namespace)
    return await seedFixture(ctx, user, namespace)
  },
})

export const performanceReset = mutation({
  args: fixtureArgs,
  handler: async (ctx, args) => {
    assertFixtureAccess(args.token)
    const namespace = validNamespace(args.namespace)
    const user = await fixtureUser(ctx)
    if (!user) throw new Error('e2e_fixture_user_missing')
    await clearFixture(ctx, user._id, namespace)
    return await seedFixture(ctx, user, namespace, performanceHistoryMessageCount)
  },
})
