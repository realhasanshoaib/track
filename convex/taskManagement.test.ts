import { convexTest } from 'convex-test'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { api, internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import {
  backfillTaskArchiveSearchFieldsBatch,
  captureTaskExitStaging,
  materializeTaskArchiveSnapshots,
  removeTaskMemberFromScope,
} from './lib/taskLifecycle'
import { searchArchivedTasks } from './lib/taskData'
import schema from './schema'

const modules = (
  import.meta as ImportMeta & {
    glob: (patterns: Array<string>) => Record<string, () => Promise<unknown>>
  }
).glob(['./**/*.{ts,js}', '!./**/*.test.{ts,js}'])

const originalTasksFlag = process.env.TRACK_TASKS_ENABLED

beforeEach(() => {
  process.env.TRACK_TASKS_ENABLED = 'true'
})

afterEach(() => {
  process.env.TRACK_TASKS_ENABLED = originalTasksFlag
})

describe('task management authorization and invariants', () => {
  it('keeps membership-loss cleanup active while task surfaces are disabled', async () => {
    const fixture = await seedLegacyProject()
    const owner = fixture.t.withIdentity({ subject: 'owner' })
    const created = await owner.mutation(api.tasks.create, {
      projectId: fixture.projectId,
      title: 'Survive rollout disablement',
      assigneeProjectMemberId: fixture.staffMemberId,
      priority: 'none',
      idempotencyKey: 'flag-off-cleanup',
    })
    process.env.TRACK_TASKS_ENABLED = 'false'
    await fixture.t.run(
      async (ctx) =>
        await removeTaskMemberFromScope(ctx, {
          projectId: fixture.projectId,
          projectMemberId: fixture.staffMemberId,
        }),
    )
    const state = await fixture.t.run(async (ctx) => ({
      task: await ctx.db.get(created.taskId),
      follower: await ctx.db
        .query('taskFollowers')
        .withIndex('by_task_member', (q) =>
          q
            .eq('taskId', created.taskId)
            .eq('projectMemberId', fixture.staffMemberId),
        )
        .unique(),
    }))
    expect(state.task?.assigneeProjectMemberId).toBeUndefined()
    expect(state.follower?.enabled).toBe(false)
  })

  it('keeps Channel boards invisible to an administrator outside that Channel', async () => {
    const fixture = await seedLegacyProject()
    const owner = fixture.t.withIdentity({ subject: 'owner' })
    const outsider = fixture.t.withIdentity({ subject: 'outsider' })

    const boardId = await owner.mutation(api.taskBoards.create, {
      projectId: fixture.projectId,
      groupId: fixture.groupId,
      name: 'Private delivery',
    })

    const ownerBoards = await owner.query(api.taskBoards.list, {
      projectId: fixture.projectId,
    })
    const outsiderBoards = await outsider.query(api.taskBoards.list, {
      projectId: fixture.projectId,
    })
    expect(ownerBoards.map((item) => item.board.name)).toContain(
      'Private delivery',
    )
    expect(outsiderBoards.map((item) => item.board.name)).not.toContain(
      'Private delivery',
    )
    await expect(outsider.mutation(api.taskBoards.update, {
      boardId,
      name: 'Leaked administration',
    })).rejects.toThrow('task_board_manage_forbidden')
  })

  it('returns bounded task pages, child pages, and history pages', async () => {
    const fixture = await seedLegacyProject()
    const owner = fixture.t.withIdentity({ subject: 'owner' })
    const boardId = await owner.mutation(api.taskBoards.create, {
      projectId: fixture.projectId,
      groupId: fixture.groupId,
      name: 'Paged work',
      description: 'Hidden from card projections',
    })
    const messageId = await fixture.t.run(async (ctx) => await ctx.db.insert('messages', {
      projectId: fixture.projectId,
      groupId: fixture.groupId,
      authorId: fixture.staffId,
      authorProjectMemberId: fixture.staffMemberId,
      channelSequence: 1,
      body: 'Evidence for the paged parent.',
      mentions: [],
      attachmentIds: [],
      createdAt: Date.now(),
    }))
    const parent = await owner.mutation(api.tasks.create, {
      projectId: fixture.projectId,
      boardId,
      title: 'Paged parent',
      description: 'Parent description',
      priority: 'none',
      references: [{ type: 'message', messageId }],
      idempotencyKey: 'paged-parent',
    })
    const child = await owner.mutation(api.tasks.create, {
      projectId: fixture.projectId,
      boardId,
      parentTaskId: parent.taskId,
      title: 'Paged child',
      priority: 'none',
      idempotencyKey: 'paged-child',
    })
    await owner.mutation(api.taskComments.create, {
      taskId: parent.taskId,
      body: 'Bounded history',
      mentionedProjectMemberIds: [],
      idempotencyKey: 'paged-comment',
    })

    const first = await owner.query(api.tasks.listPage, {
      projectId: fixture.projectId,
      boardId,
      paginationOpts: { cursor: null, numItems: 1 },
    })
    expect(first.page).toHaveLength(1)
    expect(first.page[0]?.task).not.toHaveProperty('searchText')
    expect(first.page[0]?.board).not.toHaveProperty('description')
    expect(first.page[0]?.hasEvidence).toBe(true)
    const second = first.isDone ? null : await owner.query(api.tasks.listPage, {
      projectId: fixture.projectId,
      boardId,
      paginationOpts: { cursor: first.continueCursor, numItems: 1 },
    })
    expect([first.page[0]?.task._id, second?.page[0]?.task._id]).toContain(child.taskId)

    const children = await owner.query(api.tasks.listChildren, {
      parentTaskId: parent.taskId,
      paginationOpts: { cursor: null, numItems: 1 },
    })
    expect(children.page.map((item) => item.task._id)).toContain(child.taskId)
    const history = await owner.query(api.tasks.listHistory, {
      taskId: parent.taskId,
      kind: 'comments',
      paginationOpts: { cursor: null, numItems: 1 },
    })
    expect(history.page).toHaveLength(1)
  })

  it('freezes task and board writes during immutable snapshot capture', async () => {
    const fixture = await seedLegacyProject()
    const owner = fixture.t.withIdentity({ subject: 'owner' })
    const boardId = await owner.mutation(api.taskBoards.create, {
      projectId: fixture.projectId,
      name: 'Frozen board',
    })
    const task = await owner.mutation(api.tasks.create, {
      projectId: fixture.projectId,
      boardId,
      title: 'Frozen task',
      priority: 'none',
      idempotencyKey: 'frozen-task',
    })
    const operationId = await fixture.t.run(async (ctx) => {
      const now = Date.now()
      const companyId = await ctx.db.insert('companies', {
        displayName: 'Freeze company',
        normalizedHandle: 'freeze-company',
        status: 'active',
        revision: 1,
        createdBy: fixture.ownerId,
        createdAt: now,
        updatedAt: now,
      })
      const projectCompanyId = await ctx.db.insert('projectCompanies', {
        projectId: fixture.projectId,
        companyId,
        term: 1,
        status: 'exit_pending',
        acceptedBy: fixture.ownerId,
        acceptedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      return await ctx.db.insert('projectExitOperations', {
        projectCompanyId,
        projectId: fixture.projectId,
        operationId: 'freeze-task-writes',
        cutoff: now,
        status: 'capturing',
        phase: 'tasks',
        stagedCount: 0,
        createdAt: now,
        updatedAt: now,
      })
    })

    await expect(owner.mutation(api.tasks.update, {
      taskId: task.taskId,
      expectedRevision: 1,
      title: 'Should fail',
    })).rejects.toThrow('project_snapshot_in_progress')
    await expect(owner.mutation(api.taskBoards.update, {
      boardId,
      name: 'Should fail',
    })).rejects.toThrow('project_snapshot_in_progress')
    await expect(owner.mutation(api.taskComments.create, {
      taskId: task.taskId,
      body: 'Should fail',
      mentionedProjectMemberIds: [],
      idempotencyKey: 'frozen-comment',
    })).rejects.toThrow('project_snapshot_in_progress')
    await expect(owner.mutation(api.taskLabels.create, {
      projectId: fixture.projectId,
      name: 'Should fail',
      colorToken: 'blue',
    })).rejects.toThrow('project_snapshot_in_progress')
    await fixture.t.run(async (ctx) => {
      await ctx.db.patch(operationId, { status: 'cancelled', updatedAt: Date.now() })
    })
  })

  it('enforces scoped-client editing and assignment while staff can triage', async () => {
    const fixture = await seedLegacyProject()
    const client = fixture.t.withIdentity({ subject: 'client' })
    const staff = fixture.t.withIdentity({ subject: 'staff' })
    const owner = fixture.t.withIdentity({ subject: 'owner' })
    const boardId = await owner.mutation(api.taskBoards.create, {
      projectId: fixture.projectId,
      name: 'Delivery',
    })

    const created = await client.mutation(api.tasks.create, {
      projectId: fixture.projectId,
      boardId,
      title: 'Client-created task',
      assigneeProjectMemberId: fixture.clientMemberId,
      priority: 'medium',
      idempotencyKey: 'client-create-1',
    })
    await expect(
      client.mutation(api.tasks.update, {
        taskId: created.taskId,
        expectedRevision: 1,
        assigneeProjectMemberId: fixture.staffMemberId,
      }),
    ).rejects.toThrow('task_assignment_forbidden')
    await staff.mutation(api.tasks.update, {
      taskId: created.taskId,
      expectedRevision: 1,
      assigneeProjectMemberId: fixture.staffMemberId,
    })
    await expect(client.mutation(api.tasks.update, {
      taskId: created.taskId,
      expectedRevision: 2,
      assigneeProjectMemberId: null,
    })).rejects.toThrow('task_assignment_forbidden')

    const ownerCreated = await owner.mutation(api.tasks.create, {
      projectId: fixture.projectId,
      boardId,
      title: 'Owner-created task',
      priority: 'none',
      idempotencyKey: 'owner-create-1',
    })
    await expect(
      client.mutation(api.tasks.update, {
        taskId: ownerCreated.taskId,
        expectedRevision: 1,
        title: 'Unauthorized edit',
      }),
    ).rejects.toThrow('task_edit_forbidden')
  })

  it('restores archived tasks and freezes archived-board writes and reminders', async () => {
    const fixture = await seedLegacyProject()
    const owner = fixture.t.withIdentity({ subject: 'owner' })
    const boardId = await owner.mutation(api.taskBoards.create, {
      projectId: fixture.projectId,
      name: 'Lifecycle board',
    })
    const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000)
      .toISOString().slice(0, 10)
    const created = await owner.mutation(api.tasks.create, {
      projectId: fixture.projectId,
      boardId,
      title: 'Lifecycle task',
      assigneeProjectMemberId: fixture.ownerMemberId,
      dueDate,
      priority: 'none',
      idempotencyKey: 'lifecycle-task',
    })
    const commentId = await owner.mutation(api.taskComments.create, {
      taskId: created.taskId,
      body: 'Immutable while archived',
      mentionedProjectMemberIds: [],
      idempotencyKey: 'lifecycle-comment',
    })

    await owner.mutation(api.tasks.setArchived, {
      taskId: created.taskId,
      archived: true,
    })
    const archived = await owner.query(api.tasks.getByKey, {
      projectId: fixture.projectId,
      publicKey: created.publicKey,
    })
    expect(archived?.capabilities).toMatchObject({ canArchive: true, canComment: false, canEdit: false })
    await expect(owner.mutation(api.taskComments.edit, {
      commentId,
      expectedRevision: 1,
      body: 'Forbidden edit',
    })).rejects.toThrow('task_comment_edit_forbidden')
    await expect(owner.mutation(api.taskComments.archive, { commentId }))
      .rejects.toThrow('task_comment_archive_forbidden')

    await owner.mutation(api.tasks.setArchived, {
      taskId: created.taskId,
      archived: false,
    })
    expect((await fixture.t.run(async (ctx) => await ctx.db.get(created.taskId)))?.archivedAt)
      .toBeUndefined()

    await owner.mutation(api.taskBoards.archive, { boardId })
    const boardArchived = await owner.query(api.tasks.getByKey, {
      projectId: fixture.projectId,
      publicKey: created.publicKey,
    })
    expect(boardArchived?.capabilities).toMatchObject({ canArchive: false, canComment: false, canEdit: false })
    await expect(owner.mutation(api.tasks.update, {
      taskId: created.taskId,
      expectedRevision: 3,
      title: 'Forbidden board edit',
    })).rejects.toThrow('task_edit_forbidden')
    await expect(owner.mutation(api.taskComments.create, {
      taskId: created.taskId,
      body: 'Forbidden board comment',
      mentionedProjectMemberIds: [],
      idempotencyKey: 'archived-board-comment',
    })).rejects.toThrow('task_comment_forbidden')
    expect(await owner.query(api.tasks.list, { projectId: fixture.projectId }))
      .toHaveLength(0)
    expect((await fixture.t.run(async (ctx) => await ctx.db.query('taskReminderJobs')
      .withIndex('by_task_status', (q) => q.eq('taskId', created.taskId).eq('status', 'scheduled'))
      .collect()))).toHaveLength(0)

    await owner.mutation(api.taskBoards.restore, { boardId })
    expect((await fixture.t.run(async (ctx) => await ctx.db.query('taskReminderJobs')
      .withIndex('by_task_status', (q) => q.eq('taskId', created.taskId).eq('status', 'scheduled'))
      .collect()))).toHaveLength(2)
  })

  it('revalidates destination scope and earlier comment scope after task promotion', async () => {
    const fixture = await seedLegacyProject()
    const owner = fixture.t.withIdentity({ subject: 'owner' })
    const outsider = fixture.t.withIdentity({ subject: 'outsider' })
    const client = fixture.t.withIdentity({ subject: 'client' })
    const projectBoardId = await owner.mutation(api.taskBoards.create, {
      projectId: fixture.projectId,
      name: 'Project planning',
    })
    const channelTask = await client.mutation(api.tasks.create, {
      projectId: fixture.projectId,
      groupId: fixture.groupId,
      title: 'Promote this task',
      priority: 'none',
      idempotencyKey: 'promoted-comment-task',
    })
    const commentId = await client.mutation(api.taskComments.create, {
      taskId: channelTask.taskId,
      body: 'Channel-only context',
      mentionedProjectMemberIds: [],
      idempotencyKey: 'promoted-comment',
    })
    await owner.mutation(api.tasks.changeScope, {
      taskId: channelTask.taskId,
      destinationBoardId: projectBoardId,
      declassificationConfirmed: true,
    })
    await fixture.t.run(async (ctx) => {
      const membership = await ctx.db.query('groupMembers')
        .withIndex('by_group_project_member', (q) => q
          .eq('groupId', fixture.groupId)
          .eq('projectMemberId', fixture.clientMemberId))
        .unique()
      if (membership) await ctx.db.delete(membership._id)
    })
    await expect(client.mutation(api.taskComments.edit, {
      commentId,
      expectedRevision: 1,
      body: 'Should stay inaccessible',
    })).rejects.toThrow('task_access_changed')

    const hiddenGroupId = await fixture.t.run(async (ctx) => {
      const now = Date.now()
      const groupId = await ctx.db.insert('groups', {
        projectId: fixture.projectId,
        kind: 'custom',
        name: 'Owner only',
        createdBy: fixture.ownerId,
        createdAt: now,
        updatedAt: now,
      })
      await ctx.db.insert('groupMembers', {
        projectId: fixture.projectId,
        groupId,
        userId: fixture.ownerId,
        projectMemberId: fixture.ownerMemberId,
        createdAt: now,
        updatedAt: now,
      })
      return groupId
    })
    const hiddenBoardId = await owner.mutation(api.taskBoards.create, {
      projectId: fixture.projectId,
      groupId: hiddenGroupId,
      name: 'Hidden destination',
    })
    const projectTask = await outsider.mutation(api.tasks.create, {
      projectId: fixture.projectId,
      boardId: projectBoardId,
      title: 'Do not leak into hidden Channel',
      priority: 'none',
      idempotencyKey: 'hidden-destination-task',
    })
    await expect(outsider.mutation(api.tasks.changeScope, {
      taskId: projectTask.taskId,
      destinationBoardId: hiddenBoardId,
      audienceReductionConfirmed: true,
    })).rejects.toThrow('task_destination_invalid')
  })

  it('creates scoped evidence, live view data, and one-level subtasks idempotently', async () => {
    const fixture = await seedLegacyProject()
    const owner = fixture.t.withIdentity({ subject: 'owner' })
    const messageId = await fixture.t.run(
      async (ctx) =>
        await ctx.db.insert('messages', {
          projectId: fixture.projectId,
          groupId: fixture.groupId,
          authorId: fixture.ownerId,
          authorProjectMemberId: fixture.ownerMemberId,
          channelSequence: 1,
          body: 'Hasan will ship the task release.',
          mentions: [],
          attachmentIds: [],
          createdAt: Date.now(),
        }),
    )
    const created = await owner.mutation(api.tasks.create, {
      projectId: fixture.projectId,
      groupId: fixture.groupId,
      title: 'Ship the task release',
      priority: 'urgent',
      references: [{ type: 'message', messageId, isPrimary: true }],
      idempotencyKey: 'message-task-1',
    })
    const repeated = await owner.mutation(api.tasks.create, {
      projectId: fixture.projectId,
      groupId: fixture.groupId,
      title: 'Ignored retry title',
      priority: 'none',
      idempotencyKey: 'message-task-1',
    })
    expect(repeated.taskId).toBe(created.taskId)

    const detail = await owner.query(api.tasks.getByKey, {
      projectId: fixture.projectId,
      publicKey: created.publicKey,
    })
    expect(detail?.references[0]).toMatchObject({
      quote: 'Hasan will ship the task release.',
      isPrimary: true,
    })
    expect(detail?.task.publicKey).toMatch(/^T-[23456789A-Z]{8}$/)
    await fixture.t.mutation(internal.tasks.invalidateReferences, {
      messageId,
      redacted: true,
    })
    const redacted = await owner.query(api.tasks.getByKey, {
      projectId: fixture.projectId,
      publicKey: created.publicKey,
    })
    expect(redacted?.references[0]?.availability).toBe('redacted')
    expect(redacted?.references[0]?.quote).toBeUndefined()
    expect(
      await owner.query(api.tasks.listForMessage, { messageId }),
    ).toHaveLength(0)

    const subtask = await owner.mutation(api.tasks.create, {
      projectId: fixture.projectId,
      boardId: detail!.task.boardId,
      parentTaskId: created.taskId,
      title: 'Run the gate',
      assigneeProjectMemberId: fixture.ownerMemberId,
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000).toISOString().slice(0, 10),
      priority: 'high',
      idempotencyKey: 'subtask-1',
    })
    await expect(
      owner.mutation(api.tasks.create, {
        projectId: fixture.projectId,
        boardId: detail!.task.boardId,
        parentTaskId: subtask.taskId,
        title: 'Nested too deeply',
        priority: 'none',
        idempotencyKey: 'subtask-2',
      }),
    ).rejects.toThrow('task_parent_invalid')

    const destinationBoardId = await owner.mutation(api.taskBoards.create, {
      projectId: fixture.projectId,
      groupId: fixture.groupId,
      name: 'Release follow-through',
    })
    const sourceBoard = (await owner.query(api.taskBoards.list, {
      projectId: fixture.projectId,
    })).find((item) => item.board._id === detail!.task.boardId)!
    const completedState = sourceBoard.states.find((state) => state.category === 'completed')!
    await owner.mutation(api.tasks.update, {
      taskId: subtask.taskId,
      expectedRevision: 1,
      workflowStateId: completedState._id,
    })
    expect(await fixture.t.run(async (ctx) => await ctx.db.query('taskReminderJobs')
      .withIndex('by_task_status', (q) => q.eq('taskId', subtask.taskId).eq('status', 'scheduled'))
      .collect())).toHaveLength(0)

    await owner.mutation(api.tasks.move, {
      taskId: created.taskId,
      destinationBoardId,
      targetIndex: 0,
      expectedRevision: 1,
    })
    const moved = await fixture.t.run(async (ctx) => ({
      parent: await ctx.db.get(created.taskId),
      reminders: await ctx.db.query('taskReminderJobs')
        .withIndex('by_task_status', (q) => q.eq('taskId', subtask.taskId).eq('status', 'scheduled'))
        .collect(),
      subtask: await ctx.db.get(subtask.taskId),
    }))
    expect(moved.parent?.boardId).toBe(destinationBoardId)
    expect(moved.subtask?.boardId).toBe(destinationBoardId)
    expect(moved.reminders.map((job) => job.kind).sort()).toEqual(['due_soon', 'overdue'])
  })

  it('commits detection candidates only for the current generation and cursor', async () => {
    const fixture = await seedLegacyProject()
    const now = Date.now()
    const { messageId, runId } = await fixture.t.run(async (ctx) => {
      const messageId = await ctx.db.insert('messages', {
        projectId: fixture.projectId,
        groupId: fixture.groupId,
        authorId: fixture.staffId,
        authorProjectMemberId: fixture.staffMemberId,
        channelSequence: 1,
        body: 'Please ship this tomorrow.',
        mentions: [],
        attachmentIds: [],
        createdAt: now,
      })
      await ctx.db.insert('messages', {
        projectId: fixture.projectId,
        groupId: fixture.groupId,
        authorId: fixture.staffId,
        authorProjectMemberId: fixture.staffMemberId,
        channelSequence: 2,
        body: 'Then publish the notes.',
        mentions: [],
        attachmentIds: [],
        createdAt: now + 1,
      })
      await ctx.db.insert('taskDetectionSettings', {
        projectId: fixture.projectId,
        groupId: fixture.groupId,
        enabled: true,
        generation: 2,
        highWaterSequence: 0,
        lastRunStatus: 'running',
        createdAt: now,
        updatedAt: now,
      })
      const runId = await ctx.db.insert('taskDetectionRuns', {
        projectId: fixture.projectId,
        groupId: fixture.groupId,
        generation: 2,
        startSequence: 0,
        endSequence: 1,
        status: 'running',
        leaseToken: 'lease-current',
        leaseExpiresAt: now - 1,
        attempts: 1,
        correlationId: 'run-1',
        createdAt: now,
        updatedAt: now,
      })
      return { messageId, runId }
    })
    await fixture.t.mutation(internal.taskDetection.commitRun, {
      runId,
      leaseToken: 'lease-current',
      model: 'fake-v1',
      candidates: [
        {
          title: 'Ship this',
          priority: 'high',
          sourceMessageIds: [String(messageId)],
          confidence: 0.93,
          groundingReason: 'Explicit request.',
        },
      ],
    })
    const owner = fixture.t.withIdentity({ subject: 'owner' })
    const inbox = await owner.query(api.taskSuggestions.list, {
      projectId: fixture.projectId,
    })
    expect(inbox).toHaveLength(1)
    const continued = await fixture.t.run(async (ctx) => ({
      setting: await ctx.db.query('taskDetectionSettings')
        .withIndex('by_group', (q) => q.eq('groupId', fixture.groupId))
        .unique(),
      runs: await ctx.db.query('taskDetectionRuns')
        .withIndex('by_group_status', (q) => q.eq('groupId', fixture.groupId))
        .collect(),
    }))
    expect(continued.setting?.highWaterSequence).toBe(1)
    expect(continued.runs).toEqual(expect.arrayContaining([
      expect.objectContaining({ startSequence: 1, endSequence: 2 }),
    ]))

    const staleRunId = await fixture.t.run(
      async (ctx) =>
        await ctx.db.insert('taskDetectionRuns', {
          projectId: fixture.projectId,
          groupId: fixture.groupId,
          generation: 1,
          startSequence: 0,
          endSequence: 1,
          status: 'running',
          leaseToken: 'lease-stale',
          leaseExpiresAt: now + 60_000,
          attempts: 1,
          correlationId: 'run-stale',
          createdAt: now,
          updatedAt: now,
        }),
    )
    await expect(
      fixture.t.mutation(internal.taskDetection.commitRun, {
        runId: staleRunId,
        leaseToken: 'lease-stale',
        model: 'fake-v1',
        candidates: [],
      }),
    ).resolves.toBe(false)
    const setting = await fixture.t.run(
      async (ctx) =>
        await ctx.db
          .query('taskDetectionSettings')
          .withIndex('by_group', (q) => q.eq('groupId', fixture.groupId))
          .unique(),
    )
    expect(setting?.highWaterSequence).toBe(1)
  })

  it('reconfigures workflows transactionally and migrates tasks through an explicit replacement', async () => {
    const fixture = await seedLegacyProject()
    const owner = fixture.t.withIdentity({ subject: 'owner' })
    const boardId = await owner.mutation(api.taskBoards.create, {
      projectId: fixture.projectId,
      name: 'Workflow',
    })
    const boards = await owner.query(api.taskBoards.list, {
      projectId: fixture.projectId,
    })
    const board = boards.find((item) => item.board._id === boardId)!
    const todo = board.states.find((state) => state.isDefault)!
    const done = board.states.find((state) => state.category === 'completed')!
    const dueDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1_000)
      .toISOString().slice(0, 10)
    const created = await owner.mutation(api.tasks.create, {
      projectId: fixture.projectId,
      boardId,
      title: 'Migrate me',
      assigneeProjectMemberId: fixture.ownerMemberId,
      dueDate,
      priority: 'none',
      idempotencyKey: 'workflow-task',
    })
    await owner.mutation(api.taskBoards.configureWorkflow, {
      boardId,
      defaultIndex: 0,
      replacementStateId: done._id,
      states: [
        { name: 'Ready', category: 'unstarted', visualToken: 'blue' },
        {
          stateId: done._id,
          name: 'Shipped',
          category: 'completed',
          visualToken: 'green',
        },
      ],
    })
    const task = await fixture.t.run(
      async (ctx) => await ctx.db.get(created.taskId),
    )
    expect(task?.workflowStateId).toBe(done._id)
    expect(task?.terminalAt).toBeTypeOf('number')
    expect(await fixture.t.run(async (ctx) => await ctx.db.query('taskReminderJobs')
      .withIndex('by_task_status', (q) => q.eq('taskId', created.taskId).eq('status', 'scheduled'))
      .collect())).toHaveLength(0)
    expect(
      (await fixture.t.run(async (ctx) => await ctx.db.get(todo._id)))
        ?.archivedAt,
    ).toBeTypeOf('number')

    const reconfigured = (await owner.query(api.taskBoards.list, {
      projectId: fixture.projectId,
    })).find((item) => item.board._id === boardId)!
    const ready = reconfigured.states.find((state) => state.isDefault)!
    await owner.mutation(api.taskBoards.configureWorkflow, {
      boardId,
      defaultIndex: 0,
      states: [
        { stateId: ready._id, name: 'Ready', category: 'unstarted', visualToken: 'blue' },
        { stateId: done._id, name: 'In progress', category: 'started', visualToken: 'amber' },
        { name: 'Completed', category: 'completed', visualToken: 'green' },
      ],
    })
    const reopened = await fixture.t.run(async (ctx) => await ctx.db.get(created.taskId))
    expect(reopened?.terminalAt).toBeUndefined()
    expect(await fixture.t.run(async (ctx) => await ctx.db.query('taskReminderJobs')
      .withIndex('by_task_status', (q) => q.eq('taskId', created.taskId).eq('status', 'scheduled'))
      .collect())).toHaveLength(2)

    const completed = (await owner.query(api.taskBoards.list, {
      projectId: fixture.projectId,
    })).find((item) => item.board._id === boardId)!.states
      .find((state) => state.category === 'completed')!
    await owner.mutation(api.taskBoards.removeWorkflowState, {
      stateId: done._id,
      replacementStateId: completed._id,
    })
    expect((await fixture.t.run(async (ctx) => await ctx.db.get(created.taskId)))?.terminalAt)
      .toBeTypeOf('number')
    expect(await fixture.t.run(async (ctx) => await ctx.db.query('taskReminderJobs')
      .withIndex('by_task_status', (q) => q.eq('taskId', created.taskId).eq('status', 'scheduled'))
      .collect())).toHaveLength(0)
  })

  it('schedules assignment delivery and due reminders for accepted suggestions', async () => {
    const fixture = await seedLegacyProject()
    const owner = fixture.t.withIdentity({ subject: 'owner' })
    const boardId = await owner.mutation(api.taskBoards.create, {
      projectId: fixture.projectId,
      name: 'Suggestion delivery',
    })
    const suggestionId = await fixture.t.run(async (ctx) => {
      const now = Date.now()
      return await ctx.db.insert('taskSuggestions', {
        projectId: fixture.projectId,
        proposedTitle: 'Accept with lifecycle effects',
        proposedPriority: 'high',
        status: 'pending',
        confidence: 0.95,
        groundingReason: 'Grounded test suggestion.',
        fingerprint: 'accepted-lifecycle-effects',
        modelVersion: 'fake-v1',
        promptVersion: 'task-detection-v1',
        createdAt: now,
        updatedAt: now,
      })
    })
    const dueDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1_000)
      .toISOString().slice(0, 10)
    const accepted = await owner.mutation(api.taskSuggestions.accept, {
      suggestionId,
      boardId,
      title: 'Accept with lifecycle effects',
      assigneeProjectMemberId: fixture.staffMemberId,
      priority: 'high',
      dueDate,
      idempotencyKey: 'accept-lifecycle-effects',
    })
    const effects = await fixture.t.run(async (ctx) => ({
      notifications: await ctx.db.query('taskNotifications')
        .withIndex('by_member_created_at', (q) => q.eq('recipientProjectMemberId', fixture.staffMemberId))
        .collect(),
      reminders: accepted.taskId ? await ctx.db.query('taskReminderJobs')
        .withIndex('by_task_status', (q) => q.eq('taskId', accepted.taskId!).eq('status', 'scheduled'))
        .collect() : [],
    }))
    expect(effects.notifications).toEqual(expect.arrayContaining([
      expect.objectContaining({ eventType: 'assignment', taskId: accepted.taskId }),
    ]))
    expect(effects.reminders.map((job) => job.kind).sort()).toEqual(['due_soon', 'overdue'])
  })

  it('keeps explicit history scans independent from the live detection cursor', async () => {
    const fixture = await seedLegacyProject()
    const now = Date.now()
    const { messageId, runId } = await fixture.t.run(async (ctx) => {
      const messageId = await ctx.db.insert('messages', {
        projectId: fixture.projectId,
        groupId: fixture.groupId,
        authorId: fixture.ownerId,
        authorProjectMemberId: fixture.ownerMemberId,
        channelSequence: 5,
        body: 'Publish docs.',
        mentions: [],
        attachmentIds: [],
        createdAt: now,
      })
      await ctx.db.insert('taskDetectionSettings', {
        projectId: fixture.projectId,
        groupId: fixture.groupId,
        enabled: false,
        generation: 4,
        highWaterSequence: 9,
        createdAt: now,
        updatedAt: now,
      })
      const runId = await ctx.db.insert('taskDetectionRuns', {
        projectId: fixture.projectId,
        groupId: fixture.groupId,
        generation: 4,
        mode: 'history',
        requestedByProjectMemberId: fixture.ownerMemberId,
        startSequence: 4,
        endSequence: 5,
        status: 'running',
        leaseToken: 'history',
        leaseExpiresAt: now + 60_000,
        attempts: 1,
        correlationId: 'history-run',
        createdAt: now,
        updatedAt: now,
      })
      return { messageId, runId }
    })
    await expect(
      fixture.t.mutation(internal.taskDetection.commitRun, {
        runId,
        leaseToken: 'history',
        model: 'fake-history',
        candidates: [
          {
            title: 'Publish docs',
            sourceMessageIds: [String(messageId)],
            confidence: 0.9,
            groundingReason: 'Explicit.',
          },
        ],
      }),
    ).resolves.toBe(true)
    const setting = await fixture.t.run(
      async (ctx) =>
        await ctx.db
          .query('taskDetectionSettings')
          .withIndex('by_group', (q) => q.eq('groupId', fixture.groupId))
          .unique(),
    )
    expect(setting?.highWaterSequence).toBe(9)

    const revokedRunId = await fixture.t.run(async (ctx) => {
      await ctx.db.patch(fixture.ownerMemberId, { status: 'suspended', updatedAt: Date.now() })
      return await ctx.db.insert('taskDetectionRuns', {
        projectId: fixture.projectId,
        groupId: fixture.groupId,
        generation: 4,
        mode: 'history',
        requestedByProjectMemberId: fixture.ownerMemberId,
        startSequence: 4,
        endSequence: 5,
        status: 'running',
        leaseToken: 'history-revoked',
        leaseExpiresAt: Date.now() + 60_000,
        attempts: 1,
        correlationId: 'history-revoked-run',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    })
    await expect(fixture.t.mutation(internal.taskDetection.commitRun, {
      runId: revokedRunId,
      leaseToken: 'history-revoked',
      model: 'fake-history',
      candidates: [],
    })).resolves.toBe(false)
  })

  it('cascades all live task data when a legacy Project is deleted', async () => {
    const fixture = await seedLegacyProject()
    const owner = fixture.t.withIdentity({ subject: 'owner' })
    const boardId = await owner.mutation(api.taskBoards.create, {
      projectId: fixture.projectId,
      name: 'Disposable tasks',
    })
    const created = await owner.mutation(api.tasks.create, {
      projectId: fixture.projectId,
      boardId,
      title: 'Delete with Project',
      description: 'No task content may survive.',
      assigneeProjectMemberId: fixture.staffMemberId,
      priority: 'high',
      dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1_000).toISOString().slice(0, 10),
      idempotencyKey: 'project-delete-task',
    })
    await owner.mutation(api.taskComments.create, {
      taskId: created.taskId,
      body: 'Delete this comment too.',
      mentionedProjectMemberIds: [],
      idempotencyKey: 'project-delete-comment',
    })
    await fixture.t.run(async (ctx) => {
      const now = Date.now()
      await ctx.db.insert('taskSuggestions', {
        projectId: fixture.projectId,
        proposedTitle: 'Delete suggestion',
        proposedPriority: 'none',
        status: 'pending',
        confidence: 0.9,
        groundingReason: 'Delete fixture.',
        fingerprint: 'project-delete-suggestion',
        modelVersion: 'fake-v1',
        promptVersion: 'task-detection-v1',
        createdAt: now,
        updatedAt: now,
      })
      await ctx.db.insert('taskDetectionSettings', {
        projectId: fixture.projectId,
        groupId: fixture.groupId,
        enabled: true,
        generation: 1,
        highWaterSequence: 0,
        createdAt: now,
        updatedAt: now,
      })
    })
    await owner.mutation(api.projects.remove, {
      projectId: fixture.projectId,
      userId: fixture.ownerId,
    })
    const taskTables = [
      'taskActivities', 'taskArchiveSnapshots', 'taskBoards', 'taskComments',
      'taskDetectionRuns', 'taskDetectionSettings', 'taskExitSnapshotStaging',
      'taskFollowers', 'taskLabelLinks', 'taskLabels', 'taskNotificationSettings',
      'taskNotifications', 'taskReferences', 'taskReminderJobs', 'tasks',
      'taskSuggestionHides', 'taskSuggestionReferences', 'taskSuggestions',
      'taskWorkflowStates',
    ] as const
    const counts = await fixture.t.run(async (ctx) => await Promise.all(
      taskTables.map(async (table) =>
        (await ctx.db.query(table).collect()).filter((row) => row.projectId === fixture.projectId).length,
      ),
    ))
    expect(counts).toEqual(taskTables.map(() => 0))
  })

  it('materializes Company-exit task archives from the cutoff snapshot and only allowed Channels', async () => {
    const fixture = await seedLegacyProject()
    const owner = fixture.t.withIdentity({ subject: 'owner' })
    const allowed = await owner.mutation(api.tasks.create, {
      projectId: fixture.projectId,
      groupId: fixture.groupId,
      title: 'Visible at exit',
      priority: 'none',
      idempotencyKey: 'exit-visible',
    })
    const hiddenGroupId = await fixture.t.run(
      async (ctx) =>
        await ctx.db.insert('groups', {
          projectId: fixture.projectId,
          kind: 'custom',
          name: 'Unentitled Channel',
          createdBy: fixture.ownerId,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }),
    )
    await fixture.t.run(
      async (ctx) =>
        await ctx.db.insert('groupMembers', {
          projectId: fixture.projectId,
          groupId: hiddenGroupId,
          userId: fixture.ownerId,
          projectMemberId: fixture.ownerMemberId,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }),
    )
    await owner.mutation(api.tasks.create, {
      projectId: fixture.projectId,
      groupId: hiddenGroupId,
      title: 'Hidden at exit',
      priority: 'none',
      idempotencyKey: 'exit-hidden',
    })

    const { entitlementId, projectCompanyId } = await fixture.t.run(
      async (ctx) => {
        const now = Date.now()
        const companyId = await ctx.db.insert('companies', {
          displayName: 'Archive Company',
          normalizedHandle: 'archive-company',
          status: 'active',
          revision: 1,
          createdBy: fixture.ownerId,
          createdAt: now,
          updatedAt: now,
        })
        const projectCompanyId = await ctx.db.insert('projectCompanies', {
          projectId: fixture.projectId,
          companyId,
          term: 1,
          status: 'exit_pending',
          acceptedBy: fixture.ownerId,
          acceptedAt: now,
          exitCutoff: now,
          createdAt: now,
          updatedAt: now,
        })
        await captureTaskExitStaging(ctx, {
          projectCompanyId,
          projectId: fixture.projectId,
          cutoff: now,
        })
        const entitlementId = await ctx.db.insert(
          'projectArchiveEntitlements',
          {
            projectId: fixture.projectId,
            projectCompanyId,
            companyId,
            projectMemberId: fixture.ownerMemberId,
            exitAt: now,
            channelIds: [fixture.groupId],
            projectSnapshot: {},
            channelSnapshots: [],
            retentionStatus: 'active',
            manifestHash: 'task-exit-test',
            createdAt: now,
            updatedAt: now,
          },
        )
        return { entitlementId, projectCompanyId }
      },
    )
    await owner.mutation(api.tasks.update, {
      taskId: allowed.taskId,
      expectedRevision: 1,
      title: 'Edited after cutoff',
    })
    await fixture.t.run(
      async (ctx) =>
        await materializeTaskArchiveSnapshots(ctx, {
          entitlementId,
          projectCompanyId,
          projectId: fixture.projectId,
          channelIds: [fixture.groupId],
        }),
    )
    const archivedTasks = await fixture.t.run(
      async (ctx) =>
        await ctx.db
          .query('taskArchiveSnapshots')
          .withIndex('by_entitlement_table', (q) =>
            q.eq('entitlementId', entitlementId).eq('sourceTable', 'tasks'),
          )
          .collect(),
    )
    expect(archivedTasks).toHaveLength(1)
    expect(archivedTasks[0]?.payload).toMatchObject({
      title: 'Visible at exit',
    })
    const searchResults = await fixture.t.run(async (ctx) => {
      const [entitlement, projectMember] = await Promise.all([
        ctx.db.get(entitlementId),
        ctx.db.get(fixture.ownerMemberId),
      ])
      if (!entitlement || !projectMember) throw new Error('archive_search_fixture_invalid')
      return await searchArchivedTasks(ctx, { entitlement, projectMember }, 'visible at exit', 20)
    })
    expect(searchResults.map((result) => result.task.title)).toEqual(['Visible at exit'])
    const backfilledSearchResults = await fixture.t.run(async (ctx) => {
      const taskSnapshot = archivedTasks[0]
      await ctx.db.patch(taskSnapshot._id, {
        taskPublicKey: undefined,
        taskSearchText: undefined,
      })
      const backfill = await backfillTaskArchiveSearchFieldsBatch(ctx, { entitlementId })
      if (!backfill.done || backfill.patched !== 1) throw new Error('archive_search_backfill_incomplete')
      const [entitlement, projectMember] = await Promise.all([
        ctx.db.get(entitlementId),
        ctx.db.get(fixture.ownerMemberId),
      ])
      if (!entitlement || !projectMember) throw new Error('archive_search_fixture_invalid')
      return await searchArchivedTasks(ctx, { entitlement, projectMember }, 'visible at exit', 20)
    })
    expect(backfilledSearchResults.map((result) => result.task.title)).toEqual(['Visible at exit'])
    const stagedSearchResults = await fixture.t.run(async (ctx) => {
      const operationId = 'archive-search-operation'
      await captureTaskExitStaging(ctx, {
        projectCompanyId,
        projectId: fixture.projectId,
        operationId,
        cutoff: Date.now(),
      })
      await ctx.db.patch(entitlementId, { snapshotOperationId: operationId })
      const [entitlement, projectMember] = await Promise.all([
        ctx.db.get(entitlementId),
        ctx.db.get(fixture.ownerMemberId),
      ])
      if (!entitlement || !projectMember) throw new Error('archive_search_fixture_invalid')
      return await searchArchivedTasks(ctx, { entitlement, projectMember }, 'edited after cutoff', 20)
    })
    expect(stagedSearchResults.map((result) => result.task.title)).toEqual(['Edited after cutoff'])
  })
})

async function seedLegacyProject() {
  const t = convexTest(schema, modules)
  const fixture = await t.run(async (ctx) => {
    const now = Date.now()
    async function user(subject: string) {
      return await ctx.db.insert('users', {
        googleSubject: subject,
        email: `${subject}@example.test`,
        displayName: subject,
        twoFactorEnabled: false,
        createdAt: now,
        updatedAt: now,
      })
    }
    const ownerId = await user('owner')
    const staffId = await user('staff')
    const clientId = await user('client')
    const outsiderId = await user('outsider')
    const projectId = await ctx.db.insert('projects', {
      name: 'Task Project',
      accessProfile: 'legacy',
      createdBy: ownerId,
      createdAt: now,
      updatedAt: now,
    })
    async function member(
      userId: Id<'users'>,
      role: 'owner' | 'admin' | 'staff' | 'client',
    ) {
      return await ctx.db.insert('projectMembers', {
        projectId,
        userId,
        role,
        createdAt: now,
        updatedAt: now,
      })
    }
    const ownerMemberId = await member(ownerId, 'owner')
    const staffMemberId = await member(staffId, 'staff')
    const clientMemberId = await member(clientId, 'client')
    const outsiderMemberId = await member(outsiderId, 'admin')
    const groupId = await ctx.db.insert('groups', {
      projectId,
      kind: 'custom',
      name: 'Private Channel',
      createdBy: ownerId,
      createdAt: now,
      updatedAt: now,
    })
    for (const [userId, projectMemberId] of [
      [ownerId, ownerMemberId],
      [staffId, staffMemberId],
      [clientId, clientMemberId],
    ] as const)
      await ctx.db.insert('groupMembers', {
        projectId,
        groupId,
        userId,
        projectMemberId,
        createdAt: now,
        updatedAt: now,
      })
    return {
      projectId,
      groupId,
      ownerId,
      staffId,
      ownerMemberId,
      staffMemberId,
      clientMemberId,
      outsiderMemberId,
    }
  })
  return { t, ...fixture }
}
