import { mutation } from './_generated/server'
import { createUniqueTaskPublicKey } from './lib/taskData'
import { getOrCreateDefaultBoard } from './taskBoards'

const hour = 60 * 60 * 1000

const teammates = [
  { name: 'Mia Chen', email: 'mia.chen@demo.example', subject: 'demo:mia-chen' },
  { name: 'Leo Martinez', email: 'leo.martinez@demo.example', subject: 'demo:leo-martinez' },
  { name: 'Priya Nair', email: 'priya.nair@demo.example', subject: 'demo:priya-nair' },
  { name: 'Owen Brooks', email: 'owen.brooks@demo.example', subject: 'demo:owen-brooks' },
]

const channelMessages = [
  { author: 0, hoursAgo: 70, body: 'Morning all. I have the launch checklist open and will keep the decisions here.' },
  { author: 1, hoursAgo: 67, body: 'The release banner is ready for review. I kept the copy focused on the new project timeline.' },
  { author: 2, hoursAgo: 64, body: 'I will run the signup flow on mobile after the next preview build lands.' },
  { author: 3, hoursAgo: 61, body: 'Preview build is green. I am watching the invite dialog because it still clips on narrow screens.' },
  { author: 0, hoursAgo: 58, body: 'What are the biggest launch risks from this channel so far?' },
  { author: 2, hoursAgo: 54, body: 'I pulled the latest prototype into the QA checklist. The empty state copy is now final.' },
  { author: 1, hoursAgo: 50, body: 'The onboarding checklist needs one more pass for the permissions explanation.' },
  { author: 3, hoursAgo: 46, body: 'Found a regression: accepting an invite can leave the project switcher stale until refresh.' },
  { author: 0, hoursAgo: 42, body: 'Thanks. Please keep that fix ahead of the release notes polish.' },
  { author: 2, hoursAgo: 38, body: 'QA is clean on Chrome and Safari. I have one Android pass left for notifications.' },
  { author: 1, hoursAgo: 34, body: 'I updated the release notes draft with the board and thread improvements.' },
  { author: 3, hoursAgo: 30, body: 'The invite fix is in review. It only changes the client cache after confirmation.' },
  { author: 0, hoursAgo: 26, body: 'We need a decision on the release banner before tomorrow. Should we lead with faster project handoffs?' },
  { author: 1, hoursAgo: 22, body: 'Yes. That is the clearest customer outcome and matches the onboarding story.' },
  { author: 2, hoursAgo: 18, body: 'I will add the final banner copy to the review board and tag the updated screenshots.' },
  { author: 3, hoursAgo: 14, body: 'Invite regression is fixed in the preview. I am doing one more cross-project check.' },
  { author: 0, hoursAgo: 10, body: 'Great. Let us aim for a quiet launch morning and keep the support rotation visible.' },
  { author: 2, hoursAgo: 7, body: 'Support rotation is set. I also added the notification checks to the release checklist.' },
  { author: 1, hoursAgo: 4, body: 'Design review is approved. The release banner and empty states are ready to ship.' },
  { author: 3, hoursAgo: 1, body: 'Final preview is stable. I am comfortable calling this ready once release notes are published.' },
]

const threadReplies = [
  { author: 1, hoursAgo: 25, body: 'Yes. Lead with faster handoffs, then support it with the shared task context.' },
  { author: 2, hoursAgo: 24, body: 'I agree. The customer proof point is fewer status meetings after the launch.' },
  { author: 3, hoursAgo: 23, body: 'That framing also gives us room to mention the mobile workflow without overloading the banner.' },
  { author: 0, hoursAgo: 21, body: 'Decision made. Leo owns the final copy and Priya will validate it in the preview.' },
  { author: 1, hoursAgo: 19, body: 'Done. The final headline is in the review board and ready for approval.' },
]

const seededTasks = [
  { title: 'Instrument launch funnel metrics', description: 'Add activation and first-task metrics to the launch dashboard.', assignee: 3, state: 'Backlog', priority: 'medium', messageIndex: undefined },
  { title: 'Publish launch release notes', description: 'Turn the approved draft into the customer-facing release notes.', assignee: 1, state: 'To do', priority: 'high', messageIndex: 10 },
  { title: 'Verify notification copy on Android', description: 'Confirm the notification title and body remain readable on the release build.', assignee: 2, state: 'To do', priority: 'medium', messageIndex: undefined },
  { title: 'Fix stale project switcher after invite', description: 'Refresh the selected project after an invite is accepted without a browser reload.', assignee: 3, state: 'In progress', priority: 'urgent', messageIndex: 7 },
  { title: 'Finalize release banner copy', description: 'Use the approved faster-handoffs headline and attach the final visual review.', assignee: 1, state: 'In progress', priority: 'high', messageIndex: 12 },
  { title: 'Run launch-day support rotation', description: 'Keep the support owner and escalation path visible throughout launch morning.', assignee: 0, state: 'In progress', priority: 'high', messageIndex: undefined },
  { title: 'Refresh onboarding screenshots', description: 'Replace the old project view screenshots in the onboarding checklist.', assignee: 2, state: 'Done', priority: 'low', messageIndex: undefined },
  { title: 'Retire the legacy announcement draft', description: 'Close the old announcement that no longer matches the launch positioning.', assignee: 0, state: 'Canceled', priority: 'none', messageIndex: undefined },
] as const

export const seedLaunchWeek = mutation({
  args: {},
  handler: async (ctx) => {
    if (process.env.DEV_AUTH_BYPASS !== '1') {
      throw new Error('demo_seed_requires_dev_auth_bypass')
    }

    const developer = await ctx.db
      .query('users')
      .withIndex('by_normalized_email', (query) => query.eq('normalizedEmail', 'developer@track.local'))
      .unique()
    if (!developer) throw new Error('demo_seed_developer_missing')

    const memberships = await ctx.db
      .query('projectMembers')
      .withIndex('by_user', (query) => query.eq('userId', developer._id))
      .collect()
    let projectMember = undefined
    let project = undefined
    for (const membership of memberships) {
      const candidate = await ctx.db.get(membership.projectId)
      if (membership.status === 'active' && candidate?.name === 'Default' && candidate.status === 'active') {
        projectMember = membership
        project = candidate
        break
      }
    }
    if (!projectMember || !project) throw new Error('demo_seed_starter_project_missing')

    const existingChannel = (await ctx.db
      .query('groups')
      .withIndex('by_project', (query) => query.eq('projectId', project._id))
      .collect())
      .find((group) => group.name === 'launch-week' && !group.archivedAt)
    if (existingChannel) {
      const [messages, tasks, thread] = await Promise.all([
        ctx.db.query('messages').withIndex('by_group_created_at', (query) => query.eq('groupId', existingChannel._id)).collect(),
        ctx.db.query('tasks').withIndex('by_project_archived', (query) => query.eq('projectId', project._id).eq('archivedAt', undefined)).collect(),
        ctx.db.query('channelThreads').withIndex('by_group_status_updated_at', (query) => query.eq('groupId', existingChannel._id).eq('status', 'active')).first(),
      ])
      return {
        alreadySeeded: true,
        channelId: existingChannel._id,
        messageCount: messages.filter((message) => !message.channelThreadId).length,
        taskCount: tasks.filter((task) => task.createIdempotencyKey?.startsWith('demo-launch-week-task-')).length,
        threadId: thread?._id,
      }
    }

    const now = Date.now()
    const channelId = await ctx.db.insert('groups', {
      projectId: project._id,
      kind: 'custom',
      name: 'launch-week',
      status: 'active',
      revision: 1,
      createdBy: developer._id,
      createdAt: now - 71 * hour,
      updatedAt: now,
    })
    await ctx.db.insert('groupMembers', {
      projectId: project._id,
      groupId: channelId,
      userId: developer._id,
      projectMemberId: projectMember._id,
      status: 'active',
      isSteward: true,
      createdAt: now - 71 * hour,
      updatedAt: now,
    })

    const seededMembers = []
    for (const teammate of teammates) {
      let user = await ctx.db
        .query('users')
        .withIndex('by_google_subject', (query) => query.eq('googleSubject', teammate.subject))
        .unique()
      if (!user) {
        const userId = await ctx.db.insert('users', {
          googleSubject: teammate.subject,
          normalizedEmail: teammate.email,
          email: teammate.email,
          displayName: teammate.name,
          twoFactorEnabled: false,
          createdAt: now - 71 * hour,
          updatedAt: now,
        })
        user = await ctx.db.get(userId)
      }
      if (!user) throw new Error('demo_seed_teammate_missing')

      let member = await ctx.db
        .query('projectMembers')
        .withIndex('by_project_user', (query) => query.eq('projectId', project._id).eq('userId', user._id))
        .unique()
      if (!member) {
        const memberId = await ctx.db.insert('projectMembers', {
          projectId: project._id,
          userId: user._id,
          role: 'staff',
          status: 'active',
          term: 1,
          userDisplayNameSnapshot: teammate.name,
          createdAt: now - 71 * hour,
          updatedAt: now,
        })
        member = await ctx.db.get(memberId)
      }
      if (!member) throw new Error('demo_seed_project_member_missing')

      await ctx.db.insert('groupMembers', {
        projectId: project._id,
        groupId: channelId,
        userId: user._id,
        projectMemberId: member._id,
        status: 'active',
        createdAt: now - 71 * hour,
        updatedAt: now,
      })
      seededMembers.push({ user, member })
    }

    const messageIds = []
    for (const [index, message] of channelMessages.entries()) {
      const author = seededMembers[message.author]
      if (!author) throw new Error('demo_seed_message_author_missing')
      const messageId = await ctx.db.insert('messages', {
        projectId: project._id,
        groupId: channelId,
        authorId: author.user._id,
        authorProjectMemberId: author.member._id,
        channelSequence: index + 1,
        body: message.body,
        mentions: [],
        attachmentIds: [],
        createdAt: now - message.hoursAgo * hour,
      })
      messageIds.push(messageId)
    }

    const threadSourceMessageId = messageIds[12]
    if (!threadSourceMessageId) throw new Error('demo_seed_message_missing')
    const threadId = await ctx.db.insert('channelThreads', {
      projectId: project._id,
      groupId: channelId,
      name: 'Release banner decision',
      sourceMessageId: threadSourceMessageId,
      creatorUserId: seededMembers[0].user._id,
      creatorProjectMemberId: seededMembers[0].member._id,
      status: 'active',
      revision: 1,
      replyCount: threadReplies.length,
      latestReplyAt: now - 19 * hour,
      latestChannelSequence: channelMessages.length + threadReplies.length,
      idempotencyKey: 'demo-launch-week-release-banner-thread',
      createdAt: now - 26 * hour,
      updatedAt: now - 19 * hour,
    })
    for (const [index, reply] of threadReplies.entries()) {
      const author = seededMembers[reply.author]
      if (!author) throw new Error('demo_seed_thread_author_missing')
      await ctx.db.insert('messages', {
        projectId: project._id,
        groupId: channelId,
        authorId: author.user._id,
        authorProjectMemberId: author.member._id,
        channelThreadId: threadId,
        channelSequence: channelMessages.length + index + 1,
        body: reply.body,
        mentions: [],
        attachmentIds: [],
        replyToMessageId: index === 0 ? threadSourceMessageId : undefined,
        createdAt: now - reply.hoursAgo * hour,
      })
    }
    await ctx.db.patch(channelId, { nextChannelSequence: channelMessages.length + threadReplies.length })

    const board = await getOrCreateDefaultBoard(ctx, {
      projectId: project._id,
      groupId: channelId,
      projectMemberId: projectMember._id,
      channelName: 'launch-week',
    })
    const workflowStates = await ctx.db
      .query('taskWorkflowStates')
      .withIndex('by_board_rank', (query) => query.eq('boardId', board._id))
      .collect()
    for (const [index, task] of seededTasks.entries()) {
      const assignee = seededMembers[task.assignee]
      const workflowState = workflowStates.find((state) => state.name === task.state)
      if (!assignee || !workflowState) throw new Error('demo_seed_task_configuration_missing')
      const createdAt = now - (18 - index) * hour
      const taskId = await ctx.db.insert('tasks', {
        projectId: project._id,
        publicKey: await createUniqueTaskPublicKey(ctx, project._id),
        boardId: board._id,
        groupId: channelId,
        workflowStateId: workflowState._id,
        rank: String(index + 1).padStart(4, '0'),
        title: task.title,
        description: task.description,
        searchText: `${task.title} ${task.description}`.toLowerCase(),
        assigneeProjectMemberId: assignee.member._id,
        priority: task.priority,
        createdByProjectMemberId: projectMember._id,
        revision: 1,
        terminalAt: workflowState.category === 'completed' || workflowState.category === 'canceled' ? createdAt : undefined,
        createIdempotencyKey: `demo-launch-week-task-${index + 1}`,
        createdAt,
        updatedAt: createdAt,
      })
      if (task.messageIndex === undefined) continue
      const messageId = messageIds[task.messageIndex]
      if (!messageId) throw new Error('demo_seed_task_message_missing')
      await ctx.db.insert('taskReferences', {
        projectId: project._id,
        taskId,
        type: 'message',
        groupId: channelId,
        messageId,
        quote: channelMessages[task.messageIndex].body,
        availability: 'available',
        isPrimary: true,
        actorProjectMemberId: projectMember._id,
        rank: '0001',
        createdAt,
        updatedAt: createdAt,
      })
    }

    return {
      alreadySeeded: false,
      projectId: project._id,
      channelId,
      boardId: board._id,
      threadId,
      messageCount: channelMessages.length,
      threadReplyCount: threadReplies.length,
      taskCount: seededTasks.length,
    }
  },
})
