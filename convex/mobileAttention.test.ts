import { describe, expect, it } from 'vitest'
import { convexTest } from 'convex-test'

import { api, internal } from './_generated/api'
import schema from './schema'

const modules = (import.meta as ImportMeta & {
  glob: (patterns: Array<string>) => Record<string, () => Promise<unknown>>
}).glob(['./**/*.{ts,js}', '!./**/*.test.{ts,js}'])

describe('mobile attention queue', () => {
  it('counts only active personal Project memberships without hydrating Project rows', async () => {
    const t = convexTest(schema, modules)
    const userId = await t.run(async (ctx) => await ctx.db.insert('users', {
      authUserId: 'project-count-owner',
      googleSubject: 'project-count-owner',
      normalizedEmail: 'project-count-owner@track.local',
      email: 'project-count-owner@track.local',
      displayName: 'Project Count Owner',
      twoFactorEnabled: false,
      createdAt: 1,
      updatedAt: 1,
    }))
    await t.run(async (ctx) => {
      for (const [index, status] of ([undefined, 'archived', 'removed'] as const).entries()) {
        const projectId = await ctx.db.insert('projects', {
          name: `Counted Project ${index}`,
          accessProfile: 'legacy',
          createdBy: userId,
          createdAt: index + 1,
          updatedAt: index + 1,
        })
        await ctx.db.insert('projectMembers', {
          projectId,
          userId,
          role: 'manager',
          status,
          createdAt: index + 1,
          updatedAt: index + 1,
        })
      }
    })

    await expect(t.withIdentity({ subject: 'project-count-owner' }).query(api.mobile.countProjects, {
      userId,
    })).resolves.toBe(1)
  })

  it('paginates every accessible Project membership instead of truncating at 100', async () => {
    const t = convexTest(schema, modules)
    const userId = await t.run(async (ctx) => await ctx.db.insert('users', {
      authUserId: 'many-projects-owner',
      googleSubject: 'many-projects-owner',
      normalizedEmail: 'many-projects-owner@track.local',
      email: 'many-projects-owner@track.local',
      displayName: 'Many Projects Owner',
      twoFactorEnabled: false,
      createdAt: 1,
      updatedAt: 1,
    }))
    await t.run(async (ctx) => {
      for (let index = 0; index < 101; index += 1) {
        const projectId = await ctx.db.insert('projects', {
          name: `Project ${index}`,
          accessProfile: 'legacy',
          createdBy: userId,
          createdAt: index + 1,
          updatedAt: index + 1,
        })
        await ctx.db.insert('projectMembers', {
          projectId,
          userId,
          role: 'manager',
          status: 'active',
          createdAt: index + 1,
          updatedAt: index + 1,
        })
      }
    })

    const actor = t.withIdentity({ subject: 'many-projects-owner' })
    const first = await actor.query(api.mobile.listProjects, {
      userId,
      paginationOpts: { cursor: null, numItems: 50 },
    })
    const second = await actor.query(api.mobile.listProjects, {
      userId,
      paginationOpts: { cursor: first.continueCursor, numItems: 60 },
    })

    expect(first.isDone).toBe(false)
    expect(first.page[0]?.members).toEqual([{ id: userId, name: 'Many Projects Owner', avatarUrl: null }])
    expect(first.page[0]?.memberCount).toBe(1)
    expect(first.page[0]?.memberCountTruncated).toBe(false)
    const membershipIds = [...first.page, ...second.page]
      .flatMap((row) => row ? [row.membership._id] : [])
    expect(new Set(membershipIds).size).toBe(101)
    expect(second.isDone).toBe(true)
  })

  it('finds attention and assigned tasks beyond the first 100 Project memberships', async () => {
    process.env.TRACK_TASKS_ENABLED = 'true'
    const t = convexTest(schema, modules)
    const userId = await t.run(async (ctx) => await ctx.db.insert('users', {
      authUserId: 'deep-membership-owner',
      googleSubject: 'deep-membership-owner',
      normalizedEmail: 'deep-membership-owner@track.local',
      email: 'deep-membership-owner@track.local',
      displayName: 'Deep Membership Owner',
      twoFactorEnabled: false,
      createdAt: 1,
      updatedAt: 1,
    }))
    const seeded = await t.mutation(internal.demoSeed.seed, { email: 'deep-membership-owner@track.local' })
    const fixture = await t.run(async (ctx) => {
      const member = await ctx.db.query('projectMembers').withIndex('by_project_user', (q) =>
        q.eq('projectId', seeded.projectId).eq('userId', userId),
      ).unique()
      const task = await ctx.db.query('tasks').withIndex('by_project_archived', (q) =>
        q.eq('projectId', seeded.projectId).eq('archivedAt', undefined),
      ).first()
      if (!member || !task) throw new Error('deep_membership_fixture_incomplete')
      await ctx.db.insert('taskNotifications', {
        projectId: seeded.projectId,
        taskId: task._id,
        recipientProjectMemberId: member._id,
        recipientUserId: userId,
        eventType: 'assignment',
        payload: {},
        idempotencyKey: 'deep-membership-assignment',
        createdAt: 2,
      })
      const { _id: _taskId, _creationTime: _taskCreationTime, ...taskFields } = task
      for (let index = 0; index < 101; index += 1) {
        await ctx.db.insert('tasks', {
          ...taskFields,
          publicKey: `DEEP-${index + 2}`,
          title: `Deep assigned task ${index + 2}`,
          rank: `deep-${String(index).padStart(4, '0')}`,
          createIdempotencyKey: `deep-task-${index}`,
          createdAt: index + 3,
          updatedAt: index + 3,
        })
      }
      for (let index = 0; index < 100; index += 1) {
        const projectId = await ctx.db.insert('projects', {
          name: `Later Project ${index}`,
          accessProfile: 'legacy',
          createdBy: userId,
          createdAt: index + 10,
          updatedAt: index + 10,
        })
        await ctx.db.insert('projectMembers', {
          projectId,
          userId,
          role: 'manager',
          status: 'active',
          createdAt: index + 10,
          updatedAt: index + 10,
        })
      }
      return { taskId: task._id }
    })

    const actor = t.withIdentity({ subject: 'deep-membership-owner' })
    const attentionFirst = await actor.query(api.mobile.listAttention, {
      userId,
      paginationOpts: { cursor: null, numItems: 50 },
    })
    const attentionSecond = await actor.query(api.mobile.listAttention, {
      userId,
      paginationOpts: { cursor: attentionFirst.continueCursor, numItems: 50 },
    })
    const attentionThird = await actor.query(api.mobile.listAttention, {
      userId,
      paginationOpts: { cursor: attentionSecond.continueCursor, numItems: 50 },
    })
    expect(attentionThird.page).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'task', taskId: fixture.taskId }),
    ]))

    const tasksFirst = await actor.query(api.mobile.listMyTasks, {
      userId,
      openOnly: true,
      paginationOpts: { cursor: null, numItems: 50 },
    })
    const tasksSecond = await actor.query(api.mobile.listMyTasks, {
      userId,
      openOnly: true,
      paginationOpts: { cursor: tasksFirst.continueCursor, numItems: 50 },
    })
    const tasksThird = await actor.query(api.mobile.listMyTasks, {
      userId,
      openOnly: true,
      paginationOpts: { cursor: tasksSecond.continueCursor, numItems: 50 },
    })
    expect(tasksThird.page).toEqual(expect.arrayContaining([
      expect.objectContaining({ task: expect.objectContaining({ _id: fixture.taskId }) }),
    ]))
    expect(tasksThird.page.length).toBeGreaterThan(100)
  })

  it('keeps older urgent tasks visible when the general task query reaches its per-Project cap', async () => {
    process.env.TRACK_TASKS_ENABLED = 'true'
    const t = convexTest(schema, modules)
    const userId = await t.run(async (ctx) => await ctx.db.insert('users', {
      authUserId: 'capped-attention-owner',
      googleSubject: 'capped-attention-owner',
      normalizedEmail: 'capped-attention-owner@track.local',
      email: 'capped-attention-owner@track.local',
      displayName: 'Capped Attention Owner',
      twoFactorEnabled: false,
      createdAt: 1,
      updatedAt: 1,
    }))
    const seeded = await t.mutation(internal.demoSeed.seed, { email: 'capped-attention-owner@track.local' })
    const urgentTaskId = await t.run(async (ctx) => {
      const member = await ctx.db.query('projectMembers').withIndex('by_project_user', (q) =>
        q.eq('projectId', seeded.projectId).eq('userId', userId),
      ).unique()
      const original = await ctx.db.query('tasks').withIndex('by_project_archived', (q) =>
        q.eq('projectId', seeded.projectId).eq('archivedAt', undefined),
      ).first()
      if (!member || !original) throw new Error('capped_attention_fixture_incomplete')
      const openState = (await ctx.db.query('taskWorkflowStates').withIndex('by_board_rank', (q) =>
        q.eq('boardId', original.boardId),
      ).collect()).find((state) => state.category === 'unstarted' || state.category === 'started')
      if (!openState) throw new Error('capped_attention_state_incomplete')
      await ctx.db.patch(original._id, { assigneeProjectMemberId: member._id, workflowStateId: openState._id, priority: 'urgent', dueDate: '2026-09-30' })
      const { _id: _taskId, _creationTime: _taskCreationTime, ...fields } = original
      for (let index = 0; index < 501; index += 1) {
        await ctx.db.insert('tasks', {
          ...fields,
          publicKey: `CAP-${index}`,
          title: `Recent medium task ${index}`,
          priority: 'medium',
          dueDate: '2026-12-31',
          rank: `cap-${String(index).padStart(4, '0')}`,
          createIdempotencyKey: `cap-task-${index}`,
          createdAt: index + 10,
          updatedAt: index + 10,
        })
      }
      return original._id
    })
    const actor = t.withIdentity({ subject: 'capped-attention-owner' })
    const generalTasks = await actor.query(api.mobile.listMyTasks, {
      userId,
      openOnly: true,
      paginationOpts: { cursor: null, numItems: 10 },
    })
    expect(generalTasks.page.some((item) => item.task._id === urgentTaskId)).toBe(false)

    const attention = await actor.query(api.mobile.listMyTaskAttention, {
      userId,
      beforeDate: '2026-10-01',
      paginationOpts: { cursor: null, numItems: 10 },
    })
    expect(attention.page).toEqual(expect.arrayContaining([
      expect.objectContaining({ task: expect.objectContaining({ _id: urgentTaskId, priority: 'urgent' }) }),
    ]))
  })

  it('aggregates Company-scoped mentions and assigned work when no Company filter is supplied', async () => {
    process.env.TRACK_COMPANY_MODEL_ENABLED = 'true'
    process.env.TRACK_TASKS_ENABLED = 'true'
    const t = convexTest(schema, modules)
    const userId = await t.run(async (ctx) => await ctx.db.insert('users', {
      authUserId: 'global-attention-owner',
      googleSubject: 'global-attention-owner',
      normalizedEmail: 'global-attention-owner@track.local',
      email: 'global-attention-owner@track.local',
      displayName: 'Global Attention Owner',
      twoFactorEnabled: false,
      createdAt: 1,
      updatedAt: 1,
    }))
    const seeded = await t.mutation(internal.demoSeed.seed, { email: 'global-attention-owner@track.local' })
    const authorId = await t.run(async (ctx) => await ctx.db.insert('users', {
      authUserId: 'global-attention-author',
      googleSubject: 'global-attention-author',
      normalizedEmail: 'global-attention-author@track.local',
      email: 'global-attention-author@track.local',
      displayName: 'Global Attention Author',
      twoFactorEnabled: false,
      createdAt: 1,
      updatedAt: 1,
    }))

    const fixture = await t.run(async (ctx) => {
      const now = Date.now()
      const member = await ctx.db.query('projectMembers').withIndex('by_project_user', (q) =>
        q.eq('projectId', seeded.projectId).eq('userId', userId),
      ).unique()
      const group = await ctx.db.query('groups').withIndex('by_project', (q) =>
        q.eq('projectId', seeded.projectId),
      ).first()
      const task = await ctx.db.query('tasks').withIndex('by_project_archived', (q) =>
        q.eq('projectId', seeded.projectId),
      ).first()
      if (!member || !group || !task) throw new Error('global_attention_fixture_incomplete')

      const companyId = await ctx.db.insert('companies', {
        displayName: 'Company A',
        normalizedHandle: 'global-attention-company-a',
        status: 'active',
        revision: 1,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      })
      await ctx.db.insert('companyMembers', {
        companyId,
        userId,
        role: 'owner',
        status: 'active',
        userDisplayNameSnapshot: 'Global Attention Owner',
        companyDisplayNameSnapshot: 'Company A',
        createdAt: now,
        updatedAt: now,
      })
      const projectCompanyId = await ctx.db.insert('projectCompanies', {
        projectId: seeded.projectId,
        companyId,
        term: 1,
        status: 'active',
        acceptedBy: userId,
        acceptedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      await ctx.db.patch(seeded.projectId, {
        accessProfile: 'company',
        origin: 'single_company',
        status: 'active',
        participantRevision: 1,
      })
      await ctx.db.patch(member._id, {
        companyId,
        companyDisplayNameSnapshot: 'Company A',
        projectCompanyId,
        role: 'manager',
        status: 'active',
        term: 1,
        userDisplayNameSnapshot: 'Global Attention Owner',
      })
      await ctx.db.patch(task._id, { dueDate: '2026-09-24' })
      const groupMember = await ctx.db.query('groupMembers').withIndex('by_user', (q) =>
        q.eq('userId', userId),
      ).filter((q) => q.eq(q.field('groupId'), group._id)).unique()
      if (!groupMember) throw new Error('global_attention_group_member_missing')
      await ctx.db.patch(groupMember._id, { projectMemberId: member._id, status: 'active' })
      await ctx.db.insert('taskNotifications', {
        projectId: seeded.projectId,
        taskId: task._id,
        recipientProjectMemberId: member._id,
        recipientUserId: userId,
        eventType: 'assignment',
        payload: {},
        idempotencyKey: 'global-attention-task-event',
        createdAt: 10,
      })
      await ctx.db.insert('messages', {
        projectId: seeded.projectId,
        groupId: group._id,
        authorId,
        channelSequence: 99,
        body: 'Please review this Company-scoped decision.',
        mentions: [userId],
        mentionedProjectMemberIds: [member._id],
        attachmentIds: [],
        createdAt: 20,
      })
      return { companyId, memberId: member._id, projectId: seeded.projectId, taskId: task._id }
    })

    const identity = { subject: 'global-attention-owner' }
    const globalItems = await t.withIdentity(identity).query(api.mobile.listAttention, {
      userId,
      paginationOpts: { cursor: null, numItems: 50 },
    })
    expect(globalItems.page.map((item) => item.kind)).toEqual(['message', 'task'])
    expect(globalItems.page).toEqual(expect.arrayContaining([
      expect.objectContaining({ companyId: fixture.companyId, companyName: 'Company A', projectId: fixture.projectId }),
    ]))

    const scopedItems = await t.withIdentity(identity).query(api.mobile.listAttention, {
      userId,
      actingCompanyId: fixture.companyId,
      paginationOpts: { cursor: null, numItems: 50 },
    })
    expect(scopedItems.page).toHaveLength(2)

    const foreignInvitation = await t.run(async (ctx) => {
      const now = Date.now()
      const companyId = await ctx.db.insert('companies', {
        displayName: 'Company B', normalizedHandle: 'global-attention-company-b', status: 'active',
        revision: 1, createdBy: userId, createdAt: now, updatedAt: now,
      })
      await ctx.db.insert('companyInvitations', {
        companyId,
        normalizedEmail: 'global-attention-owner@track.local',
        role: 'member',
        status: 'pending',
        invitedBy: userId,
        tokenHash: 'foreign-company-invitation',
        expiresAt: now + 60_000,
        createdAt: now,
        updatedAt: now,
      })
      return companyId
    })
    const scopedAfterForeignInvite = await t.withIdentity(identity).query(api.mobile.listAttention, {
      userId,
      actingCompanyId: fixture.companyId,
      paginationOpts: { cursor: null, numItems: 50 },
    })
    expect(scopedAfterForeignInvite.page.some((item) => item.kind === 'invitation' && item.companyId === foreignInvitation)).toBe(false)

    const globalProjects = await t.withIdentity(identity).query(api.mobile.listProjects, {
      userId,
      paginationOpts: { cursor: null, numItems: 50 },
    })
    expect(globalProjects.page).toEqual(expect.arrayContaining([
      expect.objectContaining({ membership: expect.objectContaining({ companyId: fixture.companyId }) }),
    ]))

    const scopedProjects = await t.withIdentity(identity).query(api.mobile.listProjects, {
      userId,
      actingCompanyId: fixture.companyId,
      paginationOpts: { cursor: null, numItems: 50 },
    })
    expect(scopedProjects.page).toHaveLength(1)
    expect(scopedProjects.page[0]?.membership.companyId).toBe(fixture.companyId)

    const taskProjects = await t.withIdentity(identity).query(api.mobile.listTaskProjects, {
      userId,
      actingCompanyId: fixture.companyId,
      paginationOpts: { cursor: null, numItems: 50 },
    })
    expect(taskProjects.page).toHaveLength(1)
    expect(taskProjects.page[0]?.membership.companyId).toBe(fixture.companyId)
    expect(taskProjects.page[0]).not.toHaveProperty('unreadCount')
    expect(taskProjects.page[0]?.assignedTaskCount).toBeGreaterThan(0)
    expect(taskProjects.page[0]?.assignedTaskCountPartial).toBe(false)

    const globalTasks = await t.withIdentity(identity).query(api.mobile.listMyTasks, {
      userId,
      openOnly: true,
      paginationOpts: { cursor: null, numItems: 50 },
    })
    expect(globalTasks.page).toEqual(expect.arrayContaining([
      expect.objectContaining({ companyId: fixture.companyId, companyName: 'Company A', projectMemberId: fixture.memberId }),
    ]))

    const personal = await t.run(async (ctx) => {
      const projectId = await ctx.db.insert('projects', {
        name: 'Personal delivery', accessProfile: 'legacy', status: 'active',
        createdBy: userId, createdAt: 1, updatedAt: 1,
      })
      const memberId = await ctx.db.insert('projectMembers', {
        projectId, userId, role: 'owner', status: 'active', createdAt: 1, updatedAt: 1,
      })
      return { projectId, memberId }
    })
    const personalBoardId = await t.withIdentity(identity).mutation(api.taskBoards.create, {
      projectId: personal.projectId, name: 'Personal board',
    })
    const personalTask = await t.withIdentity(identity).mutation(api.tasks.create, {
      projectId: personal.projectId, boardId: personalBoardId, title: 'Personal task', priority: 'none',
      assigneeProjectMemberId: personal.memberId, idempotencyKey: 'personal-scope-task',
    })
    const retriedTask = await t.withIdentity(identity).mutation(api.tasks.create, {
      projectId: personal.projectId, boardId: personalBoardId, title: 'Personal task', priority: 'none',
      assigneeProjectMemberId: personal.memberId, idempotencyKey: 'personal-scope-task',
    })
    expect(retriedTask.taskId).toBe(personalTask.taskId)
    const commentInput = { taskId: personalTask.taskId, body: 'Retry this update after a lost response',
      mentionedProjectMemberIds: [], idempotencyKey: 'personal-comment-retry' }
    const commentId = await t.withIdentity(identity).mutation(api.taskComments.create, commentInput)
    expect(await t.withIdentity(identity).mutation(api.taskComments.create, commentInput)).toBe(commentId)
    const commentRows = await t.run(async (ctx) => await ctx.db.query('taskComments')
      .withIndex('by_task_idempotency', (q) => q.eq('taskId', personalTask.taskId)
        .eq('idempotencyKey', commentInput.idempotencyKey)).collect())
    expect(commentRows).toHaveLength(1)
    expect(commentRows[0].body).toBe(commentInput.body)
    const personalProjects = await t.withIdentity(identity).query(api.mobile.listProjects, {
      userId, personalOnly: true, paginationOpts: { cursor: null, numItems: 1 },
    })
    expect(personalProjects.page.map((item) => item.project._id)).toEqual([personal.projectId])
    expect(personalProjects.isDone).toBe(true)
    const personalTasks = await t.withIdentity(identity).query(api.mobile.listMyTasks, {
      userId, personalOnly: true, paginationOpts: { cursor: null, numItems: 1 },
    })
    expect(personalTasks.page.map((item) => item.task._id)).toEqual([personalTask.taskId])
    expect(personalTasks.isDone).toBe(true)
    const personalBoards = await t.withIdentity(identity).query(api.taskBoards.listMine, { personalOnly: true })
    expect(personalBoards.map((item) => item.board._id)).toEqual([personalBoardId])
    for (const query of [api.mobile.listProjects, api.mobile.listMyTasks]) {
      await expect(t.withIdentity(identity).query(query, {
        userId, personalOnly: true, actingCompanyId: fixture.companyId,
        paginationOpts: { cursor: null, numItems: 1 },
      })).rejects.toThrow('invalid_project_scope')
    }
    await expect(t.withIdentity(identity).query(api.taskBoards.listMine, {
      personalOnly: true, actingCompanyId: fixture.companyId,
    })).rejects.toThrow('invalid_project_scope')

    const companyWeekTasks = await t.withIdentity(identity).query(api.mobile.listMyTasks, {
      userId,
      actingCompanyId: fixture.companyId,
      dueDateStart: '2026-09-21',
      dueDateEnd: '2026-09-27',
      paginationOpts: { cursor: null, numItems: 50 },
    })
    expect(companyWeekTasks.page).toEqual(expect.arrayContaining([
      expect.objectContaining({ task: expect.objectContaining({ _id: fixture.taskId, dueDate: '2026-09-24' }), companyId: fixture.companyId }),
    ]))
    expect(companyWeekTasks.page.every((item) => item.task.dueDate !== undefined && item.task.dueDate >= '2026-09-21' && item.task.dueDate <= '2026-09-27')).toBe(true)

    await expect(t.withIdentity(identity).query(api.mobile.listMyTasks, {
      userId,
      actingCompanyId: fixture.companyId,
      dueDateStart: '2026-09-27',
      dueDateEnd: '2026-09-21',
      paginationOpts: { cursor: null, numItems: 50 },
    })).rejects.toThrow('invalid_due_date_range')
  })

  it('combines unread task events and direct mentions in one scoped feed', async () => {
    process.env.TRACK_TASKS_ENABLED = 'true'
    const t = convexTest(schema, modules)
    const userId = await t.run(async (ctx) => await ctx.db.insert('users', {
      authUserId: 'attention-owner',
      googleSubject: 'attention-owner',
      normalizedEmail: 'attention-owner@track.local',
      email: 'attention-owner@track.local',
      displayName: 'Attention Owner',
      twoFactorEnabled: false,
      createdAt: 1,
      updatedAt: 1,
    }))

    const seeded = await t.mutation(internal.demoSeed.seed, { email: 'attention-owner@track.local' })
    const fixture = await t.run(async (ctx) => {
      const member = await ctx.db.query('projectMembers').withIndex('by_project_user', (q) =>
        q.eq('projectId', seeded.projectId).eq('userId', userId),
      ).unique()
      const group = await ctx.db.query('groups').withIndex('by_project', (q) =>
        q.eq('projectId', seeded.projectId),
      ).first()
      const task = await ctx.db.query('tasks').withIndex('by_project_archived', (q) =>
        q.eq('projectId', seeded.projectId),
      ).first()
      if (!member || !group || !task) throw new Error('attention_fixture_incomplete')
      return { groupId: group._id, memberId: member._id, taskId: task._id }
    })

    const myTasks = await t.withIdentity({ subject: 'attention-owner' }).query(api.mobile.listMyTasks, {
      userId,
      openOnly: true,
      paginationOpts: { cursor: null, numItems: 50 },
    })
    expect(myTasks.page.length).toBeGreaterThan(0)
    expect(myTasks.page[0]).toMatchObject({ project: { _id: seeded.projectId }, projectMemberId: fixture.memberId })

    const authorId = await t.run(async (ctx) => await ctx.db.insert('users', {
      authUserId: 'attention-author',
      googleSubject: 'attention-author',
      normalizedEmail: 'attention-author@track.local',
      email: 'attention-author@track.local',
      displayName: 'Attention Author',
      twoFactorEnabled: false,
      createdAt: 1,
      updatedAt: 1,
    }))
    await t.run(async (ctx) => {
      await ctx.db.insert('taskNotifications', {
        projectId: seeded.projectId,
        taskId: fixture.taskId,
        recipientProjectMemberId: fixture.memberId,
        recipientUserId: userId,
        eventType: 'assignment',
        payload: {},
        idempotencyKey: 'attention-task-event',
        createdAt: 10,
      })
      await ctx.db.insert('taskNotifications', {
        projectId: seeded.projectId,
        taskId: fixture.taskId,
        recipientProjectMemberId: fixture.memberId,
        recipientUserId: userId,
        eventType: 'due_soon',
        payload: {},
        idempotencyKey: 'attention-task-due-event',
        createdAt: 11,
      })
      const replyTargetId = await ctx.db.insert('messages', {
        projectId: seeded.projectId,
        groupId: fixture.groupId,
        authorId: userId,
        authorProjectMemberId: fixture.memberId,
        channelSequence: 98,
        body: 'I will review this decision today.',
        mentions: [],
        mentionedProjectMemberIds: [],
        attachmentIds: [],
        createdAt: 15,
      })
      await ctx.db.insert('messages', {
        projectId: seeded.projectId,
        groupId: fixture.groupId,
        authorId,
        authorProjectMemberId: undefined,
        channelSequence: 99,
        body: 'Attention Owner, please review this decision.',
        mentions: [userId],
        mentionedProjectMemberIds: [fixture.memberId],
        attachmentIds: [],
        replyToMessageId: replyTargetId,
        createdAt: 30,
      })
      await ctx.db.insert('messages', {
        projectId: seeded.projectId,
        groupId: fixture.groupId,
        authorId,
        authorProjectMemberId: undefined,
        channelSequence: 100,
        body: 'Attention Owner, please review this decision.',
        mentions: [userId],
        mentionedProjectMemberIds: [fixture.memberId],
        attachmentIds: [],
        createdAt: 20,
      })
      await ctx.db.insert('messages', {
        projectId: seeded.projectId,
        groupId: fixture.groupId,
        authorId,
        authorProjectMemberId: undefined,
        channelSequence: 101,
        body: 'A general unread Channel update.',
        mentions: [],
        mentionedProjectMemberIds: [],
        attachmentIds: [],
        createdAt: 25,
      })
      const source = await ctx.db.query('messages')
        .withIndex('by_group_created_at', (q) => q.eq('groupId', fixture.groupId))
        .order('desc')
        .first()
      if (!source) throw new Error('attention_source_missing')
      const suggestionId = await ctx.db.insert('taskSuggestions', {
        projectId: seeded.projectId,
        groupId: fixture.groupId,
        proposedTitle: 'Review attention source',
        proposedDescription: 'Confirm the decision in the conversation.',
        proposedPriority: 'none',
        status: 'pending',
        confidence: 0.9,
        groundingReason: 'Grounded in the selected conversation.',
        fingerprint: 'attention-suggestion',
        modelVersion: 'test',
        promptVersion: 'test',
        createdAt: 30,
        updatedAt: 30,
      })
      await ctx.db.insert('taskSuggestionReferences', {
        projectId: seeded.projectId,
        suggestionId,
        type: 'message',
        groupId: fixture.groupId,
        messageId: source._id,
        availability: 'available',
        isPrimary: true,
        rank: '00000001',
        createdAt: 30,
        updatedAt: 30,
      })
    })

    const items = await t.withIdentity({ subject: 'attention-owner' }).query(api.mobile.listAttention, {
      userId,
      paginationOpts: { cursor: null, numItems: 50 },
    })
    expect(items.page).toHaveLength(6)
    expect(items.page.map((item) => item.kind)).toEqual(['message', 'message', 'task', 'task', 'suggestion', 'message'])
    expect(items.page[0]).toMatchObject({ eventType: 'mention', projectId: seeded.projectId })
    expect(items.page[1]).toMatchObject({ eventType: 'direct_reply', projectId: seeded.projectId })
    expect(items.page[2]).toMatchObject({ eventType: 'due_soon', projectId: seeded.projectId })
    expect(items.page[3]).toMatchObject({ eventType: 'assignment', projectId: seeded.projectId })
    expect(items.page[4]).toMatchObject({ eventType: 'task_suggestion', projectId: seeded.projectId })
    expect(items.page[5]).toMatchObject({ eventType: 'discussion', projectId: seeded.projectId })

    await t.withIdentity({ subject: 'attention-owner' }).mutation(api.taskNotifications.markTaskRead, {
      taskId: fixture.taskId,
      projectMemberId: fixture.memberId,
    })

    // Legacy projects use user-scoped read states even when the client also
    // knows the project's membership id. Opening the message must remove it
    // from the attention feed rather than creating a parallel membership row.
    await t.withIdentity({ subject: 'attention-owner' }).mutation(api.mobile.markGroupRead, {
      groupId: fixture.groupId,
      userId,
      projectMemberId: fixture.memberId,
    })
    const afterRead = await t.withIdentity({ subject: 'attention-owner' }).query(api.mobile.listAttention, {
      userId,
      paginationOpts: { cursor: null, numItems: 50 },
    })
    expect(afterRead.page.filter((item) => item.kind === 'message')).toEqual([])
    expect(afterRead.page.filter((item) => item.kind === 'task')).toEqual([])
  })

  it('finds a followed thread after 100 follows in another Channel', async () => {
    process.env.TRACK_THREADS_ENABLED = 'true'
    const t = convexTest(schema, modules)
    const userId = await t.run(async (ctx) => await ctx.db.insert('users', {
      authUserId: 'many-followed-threads', googleSubject: 'many-followed-threads',
      normalizedEmail: 'many-followed-threads@track.local', email: 'many-followed-threads@track.local',
      displayName: 'Many Followed Threads', twoFactorEnabled: false, createdAt: 1, updatedAt: 1,
    }))
    const authorId = await t.run(async (ctx) => await ctx.db.insert('users', {
      authUserId: 'many-followed-threads-author', googleSubject: 'many-followed-threads-author',
      normalizedEmail: 'many-followed-threads-author@track.local', email: 'many-followed-threads-author@track.local',
      displayName: 'Thread Author', twoFactorEnabled: false, createdAt: 1, updatedAt: 1,
    }))
    const seeded = await t.mutation(internal.demoSeed.seed, { email: 'many-followed-threads@track.local' })
    const fixture = await t.run(async (ctx) => {
      const member = await ctx.db.query('projectMembers').withIndex('by_project_user', (q) =>
        q.eq('projectId', seeded.projectId).eq('userId', userId),
      ).unique()
      const targetGroup = await ctx.db.query('groups').withIndex('by_project', (q) =>
        q.eq('projectId', seeded.projectId),
      ).first()
      if (!member || !targetGroup) throw new Error('followed_thread_fixture_incomplete')
      const otherGroupId = await ctx.db.insert('groups', {
        projectId: seeded.projectId, kind: 'general', name: 'Other Channel', createdBy: userId,
        createdAt: 2, updatedAt: 2,
      })
      await ctx.db.insert('groupMembers', {
        projectId: seeded.projectId, groupId: otherGroupId, userId, projectMemberId: member._id,
        status: 'active', isSteward: false, createdAt: 2, updatedAt: 2,
      })
      for (let index = 0; index < 100; index += 1) {
        const threadId = await ctx.db.insert('channelThreads', {
          projectId: seeded.projectId, groupId: otherGroupId, name: `Older thread ${index}`,
          creatorUserId: userId, creatorProjectMemberId: member._id, status: 'active', revision: 1,
          idempotencyKey: `older-thread-${index}`, createdAt: index + 3, updatedAt: index + 3,
        })
        await ctx.db.insert('channelThreadFollowers', {
          projectId: seeded.projectId, groupId: otherGroupId, channelThreadId: threadId, userId,
          projectMemberId: member._id, reason: 'explicit', preference: 'following',
          createdAt: index + 3, updatedAt: index + 3,
        })
      }
      const targetThreadId = await ctx.db.insert('channelThreads', {
        projectId: seeded.projectId, groupId: targetGroup._id, name: 'Target followed thread',
        creatorUserId: userId, creatorProjectMemberId: member._id, status: 'active', revision: 1,
        idempotencyKey: 'target-followed-thread', createdAt: 200, updatedAt: 200,
      })
      await ctx.db.insert('channelThreadFollowers', {
        projectId: seeded.projectId, groupId: targetGroup._id, channelThreadId: targetThreadId, userId,
        projectMemberId: member._id, reason: 'explicit', preference: 'following', createdAt: 200, updatedAt: 200,
      })
      await ctx.db.insert('messages', {
        projectId: seeded.projectId, groupId: targetGroup._id, channelThreadId: targetThreadId,
        authorId, channelSequence: 1, body: 'New work in the target thread.', mentions: [],
        attachmentIds: [], createdAt: 201,
      })
      return { targetThreadId }
    })

    const items = await t.withIdentity({ subject: 'many-followed-threads' }).query(api.mobile.listAttention, {
      userId,
      paginationOpts: { cursor: null, numItems: 50 },
    })
    expect(items.page).toEqual(expect.arrayContaining([
      expect.objectContaining({ eventType: 'thread_activity', threadId: fixture.targetThreadId }),
    ]))
  })

  it('does not return another user’s attention events', async () => {
    process.env.TRACK_TASKS_ENABLED = 'true'
    const t = convexTest(schema, modules)
    const userId = await t.run(async (ctx) => await ctx.db.insert('users', {
      authUserId: 'attention-private',
      googleSubject: 'attention-private',
      normalizedEmail: 'attention-private@track.local',
      email: 'attention-private@track.local',
      displayName: 'Private Owner',
      twoFactorEnabled: false,
      createdAt: 1,
      updatedAt: 1,
    }))
    const seeded = await t.mutation(internal.demoSeed.seed, { email: 'attention-private@track.local' })
    const items = await t.withIdentity({ subject: 'attention-private' }).query(api.mobile.listAttention, {
      userId,
      paginationOpts: { cursor: null, numItems: 50 },
    })
    expect(items.page).toEqual([])
    expect(seeded.projectId).toBeDefined()
  })
})
