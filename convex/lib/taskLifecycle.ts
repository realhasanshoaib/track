import { normalizeTaskText } from '@track/shared/tasks'

import type { Doc, Id } from '../_generated/dataModel'
import type { MutationCtx } from '../_generated/server'
import {
  isTaskArchiveActivityPayload,
  isTaskArchiveBoardPayload,
  isTaskArchiveCommentPayload,
  isTaskArchiveLabelLinkPayload,
  isTaskArchiveLabelPayload,
  isTaskArchivePayload,
  isTaskArchiveReferencePayload,
  isTaskArchiveStatePayload,
  isTaskArchiveSuggestionPayload,
  isTaskArchiveSuggestionReferencePayload,
} from './taskData'

const snapshotTables = [
  'taskBoards',
  'taskWorkflowStates',
  'tasks',
  'taskLabels',
  'taskLabelLinks',
  'taskReferences',
  'taskComments',
  'taskActivities',
  'taskSuggestions',
  'taskSuggestionReferences',
] as const

type SnapshotTable = (typeof snapshotTables)[number]

type SnapshotRow =
  | { table: 'taskBoards'; row: Doc<'taskBoards'> }
  | { table: 'taskWorkflowStates'; row: Doc<'taskWorkflowStates'> }
  | { table: 'tasks'; row: Doc<'tasks'> }
  | { table: 'taskLabels'; row: Doc<'taskLabels'> }
  | { table: 'taskLabelLinks'; row: Doc<'taskLabelLinks'> }
  | { table: 'taskReferences'; row: Doc<'taskReferences'> }
  | { table: 'taskComments'; row: Doc<'taskComments'> }
  | { table: 'taskActivities'; row: Doc<'taskActivities'> }
  | { table: 'taskSuggestions'; row: Doc<'taskSuggestions'> }
  | { table: 'taskSuggestionReferences'; row: Doc<'taskSuggestionReferences'> }

type TaskCaptureCursor = {
  table: SnapshotTable
  cursor: string | null
}

type TaskStageMetadata = Pick<
  Doc<'taskExitSnapshotStaging'>,
  'taskId' | 'taskPublicKey' | 'taskSearchText' | 'groupId' |
  'messageId' | 'attachmentId'
>

type TaskArchivePayload =
  | Doc<'taskBoards'>
  | Doc<'taskWorkflowStates'>
  | Doc<'tasks'>
  | Doc<'taskLabels'>
  | Doc<'taskLabelLinks'>
  | Doc<'taskReferences'>
  | Doc<'taskComments'>
  | Doc<'taskActivities'>
  | Doc<'taskSuggestions'>
  | Doc<'taskSuggestionReferences'>

function decodeTaskArchivePayload(sourceTable: string, payload: unknown): TaskArchivePayload {
  switch (sourceTable) {
    case 'taskBoards':
      if (isTaskArchiveBoardPayload(payload)) return payload
      break
    case 'taskWorkflowStates':
      if (isTaskArchiveStatePayload(payload)) return payload
      break
    case 'tasks':
      if (isTaskArchivePayload(payload)) return payload
      break
    case 'taskLabels':
      if (isTaskArchiveLabelPayload(payload)) return payload
      break
    case 'taskLabelLinks':
      if (isTaskArchiveLabelLinkPayload(payload)) return payload
      break
    case 'taskReferences':
      if (isTaskArchiveReferencePayload(payload)) return payload
      break
    case 'taskComments':
      if (isTaskArchiveCommentPayload(payload)) return payload
      break
    case 'taskActivities':
      if (isTaskArchiveActivityPayload(payload)) return payload
      break
    case 'taskSuggestions':
      if (isTaskArchiveSuggestionPayload(payload)) return payload
      break
    case 'taskSuggestionReferences':
      if (isTaskArchiveSuggestionReferencePayload(payload)) return payload
      break
  }
  throw new Error(`task_archive_payload_invalid:${sourceTable}`)
}

const taskExitBatchSize = 100
const archiveSearchBackfillBatchSize = 100

function taskArchiveSearchFields(
  payload: unknown,
  existing: {
    taskPublicKey?: string
    taskSearchText?: string
  } = {},
) {
  const task = isTaskArchivePayload(payload) ? payload : null
  const searchText = existing.taskSearchText ?? (task ? task.searchText : '')
  return {
    taskPublicKey: existing.taskPublicKey ?? (task ? task.publicKey : undefined),
    taskSearchText: normalizeTaskText(searchText),
  }
}

function archiveSearchPatch(
  row: {
    taskPublicKey?: string
    taskSearchText?: string
    payload: unknown
  },
) {
  const fields = taskArchiveSearchFields(row.payload, row)
  const patch: {
    taskPublicKey?: string
    taskSearchText?: string
  } = {}
  if (row.taskPublicKey !== fields.taskPublicKey) patch.taskPublicKey = fields.taskPublicKey
  if (row.taskSearchText !== fields.taskSearchText) patch.taskSearchText = fields.taskSearchText
  return patch
}

export async function backfillTaskArchiveSearchFieldsBatch(
  ctx: MutationCtx,
  input: {
    entitlementId: Id<'projectArchiveEntitlements'>
    cursor?: string | null
  },
) {
  const result = await ctx.db
    .query('taskArchiveSnapshots')
    .withIndex('by_entitlement', (q) => q.eq('entitlementId', input.entitlementId))
    .paginate({ cursor: input.cursor ?? null, numItems: archiveSearchBackfillBatchSize })
  let patched = 0
  for (const row of result.page) {
    const patch = archiveSearchPatch(row)
    if (Object.keys(patch).length === 0) continue
    await ctx.db.patch(row._id, patch)
    patched += 1
  }
  return {
    cursor: result.isDone ? null : result.continueCursor,
    done: result.isDone,
    patched,
  }
}

export async function backfillTaskExitSnapshotSearchFieldsBatch(
  ctx: MutationCtx,
  input: {
    projectCompanyId: Id<'projectCompanies'>
    operationId: string
    cursor?: string | null
  },
) {
  const result = await ctx.db
    .query('taskExitSnapshotStaging')
    .withIndex('by_project_company_operation', (q) =>
      q.eq('projectCompanyId', input.projectCompanyId).eq('operationId', input.operationId),
    )
    .paginate({ cursor: input.cursor ?? null, numItems: archiveSearchBackfillBatchSize })
  let patched = 0
  for (const row of result.page) {
    const patch = archiveSearchPatch(row)
    if (Object.keys(patch).length === 0) continue
    await ctx.db.patch(row._id, patch)
    patched += 1
  }
  return {
    cursor: result.isDone ? null : result.continueCursor,
    done: result.isDone,
    patched,
  }
}

export async function deleteTaskProjectData(
  ctx: MutationCtx,
  projectId: Id<'projects'>,
) {
  const [
    boards,
    tasks,
    labels,
    suggestions,
    activities,
    notificationSettings,
    notifications,
    reminderJobs,
    detectionSettings,
    detectionRuns,
    archiveSnapshots,
    exitStaging,
  ] = await Promise.all([
    ctx.db.query('taskBoards').withIndex('by_project_archived', (q) => q.eq('projectId', projectId)).collect(),
    ctx.db.query('tasks').withIndex('by_project_archived', (q) => q.eq('projectId', projectId)).collect(),
    ctx.db.query('taskLabels').withIndex('by_project_archived', (q) => q.eq('projectId', projectId)).collect(),
    ctx.db.query('taskSuggestions').withIndex('by_project_status', (q) => q.eq('projectId', projectId)).collect(),
    ctx.db.query('taskActivities').withIndex('by_project_created_at', (q) => q.eq('projectId', projectId)).collect(),
    ctx.db.query('taskNotificationSettings').withIndex('by_project', (q) => q.eq('projectId', projectId)).collect(),
    ctx.db.query('taskNotifications').withIndex('by_project', (q) => q.eq('projectId', projectId)).collect(),
    ctx.db.query('taskReminderJobs').withIndex('by_project', (q) => q.eq('projectId', projectId)).collect(),
    ctx.db.query('taskDetectionSettings').withIndex('by_project', (q) => q.eq('projectId', projectId)).collect(),
    ctx.db.query('taskDetectionRuns').withIndex('by_project', (q) => q.eq('projectId', projectId)).collect(),
    ctx.db.query('taskArchiveSnapshots').withIndex('by_project', (q) => q.eq('projectId', projectId)).collect(),
    ctx.db.query('taskExitSnapshotStaging').withIndex('by_project', (q) => q.eq('projectId', projectId)).collect(),
  ])
  const workflowStates = (await Promise.all(boards.map((board) =>
    ctx.db.query('taskWorkflowStates').withIndex('by_board_rank', (q) => q.eq('boardId', board._id)).collect(),
  ))).flat()
  const [labelLinks, references, comments, followers] = await Promise.all([
    Promise.all(tasks.map((task) => ctx.db.query('taskLabelLinks')
      .withIndex('by_task', (q) => q.eq('taskId', task._id)).collect())).then((rows) => rows.flat()),
    Promise.all(tasks.map((task) => ctx.db.query('taskReferences')
      .withIndex('by_task_rank', (q) => q.eq('taskId', task._id)).collect())).then((rows) => rows.flat()),
    Promise.all(tasks.map((task) => ctx.db.query('taskComments')
      .withIndex('by_task_created_at', (q) => q.eq('taskId', task._id)).collect())).then((rows) => rows.flat()),
    Promise.all(tasks.map((task) => ctx.db.query('taskFollowers')
      .withIndex('by_task_enabled', (q) => q.eq('taskId', task._id)).collect())).then((rows) => rows.flat()),
  ])
  const [suggestionReferences, suggestionHides] = await Promise.all([
    Promise.all(suggestions.map((suggestion) => ctx.db.query('taskSuggestionReferences')
      .withIndex('by_suggestion_rank', (q) => q.eq('suggestionId', suggestion._id)).collect()))
      .then((rows) => rows.flat()),
    Promise.all(suggestions.map((suggestion) => ctx.db.query('taskSuggestionHides')
      .withIndex('by_suggestion', (q) => q.eq('suggestionId', suggestion._id)).collect()))
      .then((rows) => rows.flat()),
  ])

  for (const job of reminderJobs) {
    if (job.status === 'scheduled' && job.scheduledJobId) {
      await ctx.scheduler.cancel(job.scheduledJobId).catch(() => undefined)
    }
  }
  for (const setting of detectionSettings) {
    if (setting.scheduledJobId) await ctx.scheduler.cancel(setting.scheduledJobId).catch(() => undefined)
  }
  for (const row of labelLinks) await ctx.db.delete(row._id)
  for (const row of references) await ctx.db.delete(row._id)
  for (const row of comments) await ctx.db.delete(row._id)
  for (const row of followers) await ctx.db.delete(row._id)
  for (const row of activities) await ctx.db.delete(row._id)
  for (const row of notifications) await ctx.db.delete(row._id)
  for (const row of reminderJobs) await ctx.db.delete(row._id)
  for (const row of tasks) await ctx.db.delete(row._id)
  for (const row of suggestionReferences) await ctx.db.delete(row._id)
  for (const row of suggestionHides) await ctx.db.delete(row._id)
  for (const row of suggestions) await ctx.db.delete(row._id)
  for (const row of workflowStates) await ctx.db.delete(row._id)
  for (const row of boards) await ctx.db.delete(row._id)
  for (const row of labels) await ctx.db.delete(row._id)
  for (const row of notificationSettings) await ctx.db.delete(row._id)
  for (const row of detectionRuns) await ctx.db.delete(row._id)
  for (const row of detectionSettings) await ctx.db.delete(row._id)
  for (const row of archiveSnapshots) await ctx.db.delete(row._id)
  for (const row of exitStaging) await ctx.db.delete(row._id)
}

export async function removeTaskMemberFromScope(
  ctx: MutationCtx,
  input: {
    projectMemberId: Id<'projectMembers'>
    projectId: Id<'projects'>
    groupId?: Id<'groups'>
  },
) {
  const now = Date.now()
  const assigned = await ctx.db
    .query('tasks')
    .withIndex('by_assignee_archived', (q) =>
      q.eq('assigneeProjectMemberId', input.projectMemberId),
    )
    .collect()
  for (const task of assigned.filter(
    (candidate) =>
      candidate.projectId === input.projectId &&
      (!input.groupId || candidate.groupId === input.groupId),
  )) {
    await ctx.db.patch(task._id, {
      assigneeProjectMemberId: undefined,
      revision: task.revision + 1,
      updatedAt: now,
    })
    await ctx.db.insert('taskActivities', {
      projectId: task.projectId,
      taskId: task._id,
      originalGroupId: task.groupId,
      action: 'assignee_changed',
      before: input.projectMemberId,
      after: null,
      correlationId: `membership-loss:${input.projectMemberId}:${now}`,
      createdAt: now,
    })
    const followers = await ctx.db
      .query('taskFollowers')
      .withIndex('by_task_enabled', (q) =>
        q.eq('taskId', task._id).eq('enabled', true),
      )
      .collect()
    for (const follower of followers.filter(
      (candidate) => candidate.projectMemberId !== input.projectMemberId,
    )) {
      const existing = await ctx.db
        .query('taskNotifications')
        .withIndex('by_member_idempotency', (q) =>
          q
            .eq('recipientProjectMemberId', follower.projectMemberId)
            .eq(
              'idempotencyKey',
              `assignment-lost:${task._id}:${input.projectMemberId}:${task.revision + 1}`,
            ),
        )
        .unique()
      if (!existing)
        await ctx.db.insert('taskNotifications', {
          projectId: task.projectId,
          taskId: task._id,
          recipientProjectMemberId: follower.projectMemberId,
          recipientUserId: follower.userId,
          originalGroupId: task.groupId,
          eventType: 'assignment_lost',
          payload: { publicKey: task.publicKey },
          idempotencyKey: `assignment-lost:${task._id}:${input.projectMemberId}:${task.revision + 1}`,
          createdAt: now,
        })
    }
  }
  const follows = await ctx.db
    .query('taskFollowers')
    .withIndex('by_member_enabled', (q) =>
      q.eq('projectMemberId', input.projectMemberId).eq('enabled', true),
    )
    .collect()
  for (const follow of follows) {
    const task = await ctx.db.get(follow.taskId)
    if (
      task?.projectId === input.projectId &&
      (!input.groupId || task.groupId === input.groupId)
    ) {
      await ctx.db.patch(follow._id, { enabled: false, updatedAt: now })
    }
  }
}

type TaskPage =
  | { table: 'taskBoards'; page: Array<Doc<'taskBoards'>>; isDone: boolean; continueCursor: string }
  | { table: 'taskWorkflowStates'; page: Array<Doc<'taskWorkflowStates'>>; isDone: boolean; continueCursor: string }
  | { table: 'tasks'; page: Array<Doc<'tasks'>>; isDone: boolean; continueCursor: string }
  | { table: 'taskLabels'; page: Array<Doc<'taskLabels'>>; isDone: boolean; continueCursor: string }
  | { table: 'taskLabelLinks'; page: Array<Doc<'taskLabelLinks'>>; isDone: boolean; continueCursor: string }
  | { table: 'taskReferences'; page: Array<Doc<'taskReferences'>>; isDone: boolean; continueCursor: string }
  | { table: 'taskComments'; page: Array<Doc<'taskComments'>>; isDone: boolean; continueCursor: string }
  | { table: 'taskActivities'; page: Array<Doc<'taskActivities'>>; isDone: boolean; continueCursor: string }
  | { table: 'taskSuggestions'; page: Array<Doc<'taskSuggestions'>>; isDone: boolean; continueCursor: string }
  | { table: 'taskSuggestionReferences'; page: Array<Doc<'taskSuggestionReferences'>>; isDone: boolean; continueCursor: string }

function encodeTaskCursor(cursor: TaskCaptureCursor) {
  return JSON.stringify(cursor)
}

function isSnapshotTable(value: unknown): value is SnapshotTable {
  return (
    value === 'taskBoards' ||
    value === 'taskWorkflowStates' ||
    value === 'tasks' ||
    value === 'taskLabels' ||
    value === 'taskLabelLinks' ||
    value === 'taskReferences' ||
    value === 'taskComments' ||
    value === 'taskActivities' ||
    value === 'taskSuggestions' ||
    value === 'taskSuggestionReferences'
  )
}

function isTaskCaptureCursor(value: unknown): value is TaskCaptureCursor {
  if (typeof value !== 'object' || value === null) return false
  if (!('table' in value) || !('cursor' in value)) return false
  const table = value.table
  const cursor = value.cursor
  return (
    isSnapshotTable(table) &&
    (cursor === null || typeof cursor === 'string')
  )
}

function decodeTaskCursor(value: string | null | undefined): TaskCaptureCursor {
  if (!value) return { table: snapshotTables[0], cursor: null }
  try {
    const parsed: unknown = JSON.parse(value)
    if (isTaskCaptureCursor(parsed)) {
      return parsed
    }
  } catch {
    return { table: snapshotTables[0], cursor: null }
  }
  return { table: snapshotTables[0], cursor: null }
}

async function taskPage(
  ctx: MutationCtx,
  projectId: Id<'projects'>,
  state: TaskCaptureCursor,
): Promise<TaskPage> {
  const options = { cursor: state.cursor, numItems: taskExitBatchSize }
  switch (state.table) {
    case 'taskBoards': {
      const result = await ctx.db.query('taskBoards')
        .withIndex('by_project_archived', (q) => q.eq('projectId', projectId))
        .paginate(options)
      return { table: state.table, ...result }
    }
    case 'taskWorkflowStates': {
      const result = await ctx.db.query('taskWorkflowStates')
        .withIndex('by_project_category', (q) => q.eq('projectId', projectId))
        .paginate(options)
      return { table: state.table, ...result }
    }
    case 'tasks': {
      const result = await ctx.db.query('tasks')
        .withIndex('by_project_archived', (q) => q.eq('projectId', projectId))
        .paginate(options)
      return { table: state.table, ...result }
    }
    case 'taskLabels': {
      const result = await ctx.db.query('taskLabels')
        .withIndex('by_project_archived', (q) => q.eq('projectId', projectId))
        .paginate(options)
      return { table: state.table, ...result }
    }
    case 'taskLabelLinks': {
      const result = await ctx.db.query('taskLabelLinks')
        .withIndex('by_project_created_at', (q) => q.eq('projectId', projectId))
        .paginate(options)
      return { table: state.table, ...result }
    }
    case 'taskReferences': {
      const result = await ctx.db.query('taskReferences')
        .withIndex('by_project_created_at', (q) => q.eq('projectId', projectId))
        .paginate(options)
      return { table: state.table, ...result }
    }
    case 'taskComments': {
      const result = await ctx.db.query('taskComments')
        .withIndex('by_project_created_at', (q) => q.eq('projectId', projectId))
        .paginate(options)
      return { table: state.table, ...result }
    }
    case 'taskActivities': {
      const result = await ctx.db.query('taskActivities')
        .withIndex('by_project_created_at', (q) => q.eq('projectId', projectId))
        .paginate(options)
      return { table: state.table, ...result }
    }
    case 'taskSuggestions': {
      const result = await ctx.db.query('taskSuggestions')
        .withIndex('by_project_status', (q) => q.eq('projectId', projectId))
        .paginate(options)
      return { table: state.table, ...result }
    }
    case 'taskSuggestionReferences': {
      const result = await ctx.db.query('taskSuggestionReferences')
        .withIndex('by_project_created_at', (q) => q.eq('projectId', projectId))
        .paginate(options)
      return { table: state.table, ...result }
    }
  }
  throw new Error('task_capture_table_invalid')
}

function nextTaskState(
  state: TaskCaptureCursor,
  result: TaskPage,
): { done: boolean; cursor: string | null } {
  if (!result.isDone) {
    return {
      done: false,
      cursor: encodeTaskCursor({ table: state.table, cursor: result.continueCursor }),
    }
  }
  const index = snapshotTables.indexOf(state.table)
  if (index === snapshotTables.length - 1) return { done: true, cursor: null }
  return {
    done: false,
    cursor: encodeTaskCursor({ table: snapshotTables[index + 1], cursor: null }),
  }
}

type RelatedTaskRows = {
  taskGroups: ReadonlyMap<Id<'tasks'>, Id<'groups'> | undefined>
  suggestionGroups: ReadonlyMap<Id<'taskSuggestions'>, Id<'groups'> | undefined>
  boardGroups: ReadonlyMap<Id<'taskBoards'>, Id<'groups'> | undefined>
}

async function relatedTaskRows(
  ctx: MutationCtx,
  items: ReadonlyArray<SnapshotRow>,
): Promise<RelatedTaskRows> {
  const taskIds = new Set<Id<'tasks'>>()
  const suggestionIds = new Set<Id<'taskSuggestions'>>()
  const boardIds = new Set<Id<'taskBoards'>>()
  for (const item of items) {
    switch (item.table) {
      case 'taskWorkflowStates':
        boardIds.add(item.row.boardId)
        break
      case 'taskLabelLinks':
      case 'taskReferences':
      case 'taskComments':
      case 'taskActivities':
        taskIds.add(item.row.taskId)
        break
      case 'taskSuggestionReferences':
        suggestionIds.add(item.row.suggestionId)
        break
      case 'taskBoards':
      case 'taskLabels':
      case 'taskSuggestions':
      case 'tasks':
        break
    }
  }
  const [tasks, suggestions, boards] = await Promise.all([
    Promise.all(Array.from(taskIds, (taskId) => ctx.db.get(taskId))),
    Promise.all(Array.from(suggestionIds, (suggestionId) => ctx.db.get(suggestionId))),
    Promise.all(Array.from(boardIds, (boardId) => ctx.db.get(boardId))),
  ])
  return {
    taskGroups: new Map(tasks.filter((task): task is Doc<'tasks'> => task !== null)
      .map((task) => [task._id, task.groupId])),
    suggestionGroups: new Map(suggestions.filter((suggestion): suggestion is Doc<'taskSuggestions'> => suggestion !== null)
      .map((suggestion) => [suggestion._id, suggestion.groupId])),
    boardGroups: new Map(boards.filter((board): board is Doc<'taskBoards'> => board !== null)
      .map((board) => [board._id, board.groupId])),
  }
}

function stageMetadata(item: SnapshotRow, related: RelatedTaskRows): TaskStageMetadata {
  switch (item.table) {
    case 'tasks':
      return {
        taskId: item.row._id,
        taskPublicKey: item.row.publicKey,
        taskSearchText: item.row.searchText,
        groupId: item.row.groupId,
      }
    case 'taskWorkflowStates':
      return { groupId: related.boardGroups.get(item.row.boardId) }
    case 'taskLabelLinks':
      return { taskId: item.row.taskId, groupId: related.taskGroups.get(item.row.taskId) }
    case 'taskReferences':
      return {
        taskId: item.row.taskId,
        groupId: item.row.groupId ?? related.taskGroups.get(item.row.taskId),
        messageId: item.row.messageId,
        attachmentId: item.row.attachmentId,
      }
    case 'taskComments':
      return { taskId: item.row.taskId, groupId: item.row.originalGroupId ?? related.taskGroups.get(item.row.taskId) }
    case 'taskActivities':
      return { taskId: item.row.taskId, groupId: item.row.originalGroupId ?? related.taskGroups.get(item.row.taskId) }
    case 'taskSuggestionReferences':
      return {
        groupId: item.row.groupId ?? related.suggestionGroups.get(item.row.suggestionId),
        messageId: item.row.messageId,
        attachmentId: item.row.attachmentId,
      }
    case 'taskBoards':
      return { groupId: item.row.groupId }
    case 'taskSuggestions':
      return { groupId: item.row.groupId }
    case 'taskLabels':
      return {}
  }
  throw new Error('task_stage_metadata_invalid')
}

function rowForStage(result: TaskPage): Array<SnapshotRow> {
  switch (result.table) {
    case 'taskBoards': return result.page.map((row) => ({ table: result.table, row }))
    case 'taskWorkflowStates': return result.page.map((row) => ({ table: result.table, row }))
    case 'tasks': return result.page.map((row) => ({ table: result.table, row }))
    case 'taskLabels': return result.page.map((row) => ({ table: result.table, row }))
    case 'taskLabelLinks': return result.page.map((row) => ({ table: result.table, row }))
    case 'taskReferences': return result.page.map((row) => ({ table: result.table, row }))
    case 'taskComments': return result.page.map((row) => ({ table: result.table, row }))
    case 'taskActivities': return result.page.map((row) => ({ table: result.table, row }))
    case 'taskSuggestions': return result.page.map((row) => ({ table: result.table, row }))
    case 'taskSuggestionReferences': return result.page.map((row) => ({ table: result.table, row }))
  }
  throw new Error('task_stage_table_invalid')
}

async function legacyTaskRows(
  ctx: MutationCtx,
  projectId: Id<'projects'>,
): Promise<Array<SnapshotRow>> {
  const [boards, workflowStates, tasks, labels, labelLinks, references, comments, activities, suggestions, suggestionReferences] = await Promise.all([
    ctx.db.query('taskBoards').withIndex('by_project_archived', (q) => q.eq('projectId', projectId)).collect(),
    ctx.db.query('taskWorkflowStates').withIndex('by_project_category', (q) => q.eq('projectId', projectId)).collect(),
    ctx.db.query('tasks').withIndex('by_project_archived', (q) => q.eq('projectId', projectId)).collect(),
    ctx.db.query('taskLabels').withIndex('by_project_archived', (q) => q.eq('projectId', projectId)).collect(),
    ctx.db.query('taskLabelLinks').withIndex('by_project_created_at', (q) => q.eq('projectId', projectId)).collect(),
    ctx.db.query('taskReferences').withIndex('by_project_created_at', (q) => q.eq('projectId', projectId)).collect(),
    ctx.db.query('taskComments').withIndex('by_project_created_at', (q) => q.eq('projectId', projectId)).collect(),
    ctx.db.query('taskActivities').withIndex('by_project_created_at', (q) => q.eq('projectId', projectId)).collect(),
    ctx.db.query('taskSuggestions').withIndex('by_project_status', (q) => q.eq('projectId', projectId)).collect(),
    ctx.db.query('taskSuggestionReferences').withIndex('by_project_created_at', (q) => q.eq('projectId', projectId)).collect(),
  ])
  return [
    ...boards.map((row) => ({ table: 'taskBoards' as const, row })),
    ...workflowStates.map((row) => ({ table: 'taskWorkflowStates' as const, row })),
    ...tasks.map((row) => ({ table: 'tasks' as const, row })),
    ...labels.map((row) => ({ table: 'taskLabels' as const, row })),
    ...labelLinks.map((row) => ({ table: 'taskLabelLinks' as const, row })),
    ...references.map((row) => ({ table: 'taskReferences' as const, row })),
    ...comments.map((row) => ({ table: 'taskComments' as const, row })),
    ...activities.map((row) => ({ table: 'taskActivities' as const, row })),
    ...suggestions.map((row) => ({ table: 'taskSuggestions' as const, row })),
    ...suggestionReferences.map((row) => ({ table: 'taskSuggestionReferences' as const, row })),
  ]
}

async function stageTaskRows(
  ctx: MutationCtx,
  input: {
    projectCompanyId: Id<'projectCompanies'>
    projectId: Id<'projects'>
    operationId?: string
    cutoff: number
  },
  items: ReadonlyArray<SnapshotRow>,
) {
  const related = await relatedTaskRows(ctx, items)
  let stagedCount = 0
  for (const item of items) {
    if (item.row.createdAt > input.cutoff) continue
    const metadata = stageMetadata(item, related)
    const existing = input.operationId
      ? await ctx.db.query('taskExitSnapshotStaging').withIndex('by_project_company_operation_source', (q) =>
          q.eq('projectCompanyId', input.projectCompanyId)
            .eq('operationId', input.operationId)
            .eq('sourceTable', item.table)
            .eq('sourceId', String(item.row._id)),
        ).unique()
      : null
    if (existing) continue
    await ctx.db.insert('taskExitSnapshotStaging', {
      projectCompanyId: input.projectCompanyId,
      projectId: input.projectId,
      operationId: input.operationId,
      ...metadata,
      taskSearchText: normalizeTaskText(metadata.taskSearchText ?? ''),
      sourceTable: item.table,
      sourceId: String(item.row._id),
      payload: item.row,
      cutoff: input.cutoff,
      createdAt: Date.now(),
    })
    stagedCount += 1
  }
  return stagedCount
}

export async function clearTaskExitStagingBatch(
  ctx: MutationCtx,
  input: {
    projectCompanyId: Id<'projectCompanies'>
    operationId?: string
    cursor?: string | null
  },
) {
  const source = input.operationId
    ? ctx.db.query('taskExitSnapshotStaging').withIndex('by_project_company_operation', (q) =>
        q.eq('projectCompanyId', input.projectCompanyId).eq('operationId', input.operationId),
      )
    : ctx.db.query('taskExitSnapshotStaging').withIndex('by_project_company', (q) =>
        q.eq('projectCompanyId', input.projectCompanyId),
      )
  const result = await source.paginate({ cursor: input.cursor ?? null, numItems: taskExitBatchSize })
  for (const row of result.page) await ctx.db.delete(row._id)
  return { cursor: result.isDone ? null : result.continueCursor, done: result.isDone }
}

export async function clearTaskExitStaging(
  ctx: MutationCtx,
  projectCompanyId: Id<'projectCompanies'>,
  operationId?: string,
) {
  const rows = operationId
    ? await ctx.db.query('taskExitSnapshotStaging')
      .withIndex('by_project_company_operation', (q) =>
        q.eq('projectCompanyId', projectCompanyId).eq('operationId', operationId),
      )
      .collect()
    : await ctx.db.query('taskExitSnapshotStaging')
      .withIndex('by_project_company', (q) => q.eq('projectCompanyId', projectCompanyId))
      .collect()
  for (const row of rows) await ctx.db.delete(row._id)
}

export async function captureTaskExitStagingBatch(
  ctx: MutationCtx,
  input: {
    projectCompanyId: Id<'projectCompanies'>
    projectId: Id<'projects'>
    operationId?: string
    cutoff: number
    cursor?: string | null
  },
) {
  const state = decodeTaskCursor(input.cursor)
  const result = await taskPage(ctx, input.projectId, state)
  const items = rowForStage(result)
  const stagedCount = await stageTaskRows(ctx, input, items)
  return { ...nextTaskState(state, result), stagedCount }
}

export async function captureTaskExitStaging(
  ctx: MutationCtx,
  input: {
    projectCompanyId: Id<'projectCompanies'>
    projectId: Id<'projects'>
    operationId?: string
    cutoff: number
  },
) {
  await clearTaskExitStaging(ctx, input.projectCompanyId, input.operationId)
  await stageTaskRows(ctx, input, await legacyTaskRows(ctx, input.projectId))
}

export async function materializeTaskArchiveSnapshotsBatch(
  ctx: MutationCtx,
  input: {
    entitlementId: Id<'projectArchiveEntitlements'>
    projectCompanyId: Id<'projectCompanies'>
    projectId: Id<'projects'>
    channelIds: ReadonlyArray<Id<'groups'>>
    operationId?: string
    cursor?: string | null
  },
) {
  const allowed = new Set(input.channelIds)
  const source = input.operationId
    ? ctx.db.query('taskExitSnapshotStaging').withIndex('by_project_company_operation', (q) =>
        q.eq('projectCompanyId', input.projectCompanyId).eq('operationId', input.operationId),
      )
    : ctx.db.query('taskExitSnapshotStaging').withIndex('by_project_company', (q) =>
        q.eq('projectCompanyId', input.projectCompanyId),
      )
  const result = await source.paginate({ cursor: input.cursor ?? null, numItems: taskExitBatchSize })
  for (const row of result.page) {
    if (row.groupId && !allowed.has(row.groupId)) continue
    const searchFields = taskArchiveSearchFields(row.payload, row)
    const existing = await ctx.db.query('taskArchiveSnapshots').withIndex('by_entitlement_source', (q) =>
      q.eq('entitlementId', input.entitlementId)
        .eq('sourceTable', row.sourceTable)
        .eq('sourceId', row.sourceId),
    ).unique()
    if (existing) {
      const patch: {
        taskPublicKey?: string
        taskSearchText?: string
      } = {}
      if (existing.taskPublicKey !== searchFields.taskPublicKey) patch.taskPublicKey = searchFields.taskPublicKey
      if (existing.taskSearchText !== searchFields.taskSearchText) patch.taskSearchText = searchFields.taskSearchText
      if (Object.keys(patch).length > 0) await ctx.db.patch(existing._id, patch)
      continue
    }
    await ctx.db.insert('taskArchiveSnapshots', {
      entitlementId: input.entitlementId,
      projectId: input.projectId,
      sourceTable: row.sourceTable,
      sourceId: row.sourceId,
      taskId: row.taskId,
      ...searchFields,
      groupId: row.groupId,
      messageId: row.messageId,
      attachmentId: row.attachmentId,
      payload: decodeTaskArchivePayload(row.sourceTable, row.payload),
      createdAt: Date.now(),
    })
  }
  return { cursor: result.isDone ? null : result.continueCursor, done: result.isDone }
}

export async function materializeTaskArchiveSnapshots(
  ctx: MutationCtx,
  input: {
    entitlementId: Id<'projectArchiveEntitlements'>
    projectCompanyId: Id<'projectCompanies'>
    projectId: Id<'projects'>
    channelIds: ReadonlyArray<Id<'groups'>>
    operationId?: string
  },
) {
  const allowed = new Set(input.channelIds)
  const staged = input.operationId
    ? await ctx.db.query('taskExitSnapshotStaging')
      .withIndex('by_project_company_operation', (q) =>
        q.eq('projectCompanyId', input.projectCompanyId).eq('operationId', input.operationId),
      )
      .collect()
    : await ctx.db.query('taskExitSnapshotStaging')
      .withIndex('by_project_company', (q) => q.eq('projectCompanyId', input.projectCompanyId))
      .collect()
  for (const row of staged) {
    if (row.groupId && !allowed.has(row.groupId)) continue
    const searchFields = taskArchiveSearchFields(row.payload, row)
    const existing = await ctx.db.query('taskArchiveSnapshots').withIndex('by_entitlement_source', (q) =>
      q.eq('entitlementId', input.entitlementId)
        .eq('sourceTable', row.sourceTable)
        .eq('sourceId', row.sourceId),
    ).unique()
    if (existing) {
      const patch: {
        taskPublicKey?: string
        taskSearchText?: string
      } = {}
      if (existing.taskPublicKey !== searchFields.taskPublicKey) patch.taskPublicKey = searchFields.taskPublicKey
      if (existing.taskSearchText !== searchFields.taskSearchText) patch.taskSearchText = searchFields.taskSearchText
      if (Object.keys(patch).length > 0) await ctx.db.patch(existing._id, patch)
      continue
    }
    await ctx.db.insert('taskArchiveSnapshots', {
      entitlementId: input.entitlementId,
      projectId: input.projectId,
      sourceTable: row.sourceTable,
      sourceId: row.sourceId,
      taskId: row.taskId,
      ...searchFields,
      groupId: row.groupId,
      messageId: row.messageId,
      attachmentId: row.attachmentId,
      payload: decodeTaskArchivePayload(row.sourceTable, row.payload),
      createdAt: Date.now(),
    })
  }
}
