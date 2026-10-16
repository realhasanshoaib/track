import { isTerminalTaskState } from '@track/shared/tasks'

import type { PaginationOptions } from 'convex/server'
import type { Doc, Id, TableNames } from '../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../_generated/server'
import { threadsEnabled } from './channelThreadPolicy'
import { hasArchivedChannelVisibility } from './projectExitArchive'
import type { ResolvedTaskRequestContext } from './taskPolicy'

type TaskDataCtx = QueryCtx | MutationCtx

function isArchiveObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function archiveField(value: object, field: string) {
  const candidate: unknown = Object.getOwnPropertyDescriptor(value, field)?.value
  return candidate
}

function isArchiveId<TableName extends TableNames>(value: unknown): value is Id<TableName> {
  return typeof value === 'string' && value.length > 0
}

function isOptionalArchiveField(
  value: unknown,
  predicate: (candidate: unknown) => boolean,
) {
  return value === undefined || predicate(value)
}

function isTaskPriorityValue(value: unknown): value is Doc<'tasks'>['priority'] {
  return value === 'none' || value === 'urgent' || value === 'high' ||
    value === 'medium' || value === 'low'
}

function isTaskStateCategoryValue(value: unknown): value is Doc<'taskWorkflowStates'>['category'] {
  return value === 'backlog' || value === 'unstarted' || value === 'started' ||
    value === 'completed' || value === 'canceled'
}

function isTaskReferenceTypeValue(value: unknown): value is Doc<'taskReferences'>['type'] {
  return value === 'message' || value === 'attachment'
}

function isTaskReferenceAvailabilityValue(
  value: unknown,
): value is Doc<'taskReferences'>['availability'] {
  return value === 'available' || value === 'unavailable' || value === 'redacted'
}

function isTaskSuggestionStatusValue(
  value: unknown,
): value is Doc<'taskSuggestions'>['status'] {
  return value === 'pending' || value === 'accepted' || value === 'linked' || value === 'dismissed'
}

function isTaskSuggestionDismissalReasonValue(
  value: unknown,
): value is NonNullable<Doc<'taskSuggestions'>['dismissalReason']> {
  return value === 'not_actionable' || value === 'duplicate' || value === 'wrong_details' ||
    value === 'sensitive' || value === 'other'
}

export function isTaskArchiveBoardPayload(value: unknown): value is Doc<'taskBoards'> {
  if (!isArchiveObject(value)) return false
  return isArchiveId(archiveField(value, '_id')) &&
    typeof archiveField(value, '_creationTime') === 'number' &&
    isArchiveId(archiveField(value, 'projectId')) &&
    isOptionalArchiveField(archiveField(value, 'groupId'), (candidate) => isArchiveId(candidate)) &&
    typeof archiveField(value, 'name') === 'string' &&
    isOptionalArchiveField(archiveField(value, 'description'), (candidate) => typeof candidate === 'string') &&
    isOptionalArchiveField(archiveField(value, 'rank'), (candidate) => typeof candidate === 'string') &&
    typeof archiveField(value, 'isDefault') === 'boolean' &&
    isArchiveId(archiveField(value, 'createdByProjectMemberId')) &&
    isOptionalArchiveField(archiveField(value, 'actingCompanyId'), (candidate) => isArchiveId(candidate)) &&
    isOptionalArchiveField(archiveField(value, 'archivedAt'), (candidate) => typeof candidate === 'number') &&
    typeof archiveField(value, 'createdAt') === 'number' &&
    typeof archiveField(value, 'updatedAt') === 'number'
}

export function isTaskArchiveStatePayload(value: unknown): value is Doc<'taskWorkflowStates'> {
  if (!isArchiveObject(value)) return false
  return isArchiveId(archiveField(value, '_id')) &&
    typeof archiveField(value, '_creationTime') === 'number' &&
    isArchiveId(archiveField(value, 'projectId')) &&
    isArchiveId(archiveField(value, 'boardId')) &&
    typeof archiveField(value, 'name') === 'string' &&
    isTaskStateCategoryValue(archiveField(value, 'category')) &&
    typeof archiveField(value, 'visualToken') === 'string' &&
    typeof archiveField(value, 'rank') === 'string' &&
    typeof archiveField(value, 'isDefault') === 'boolean' &&
    isOptionalArchiveField(archiveField(value, 'archivedAt'), (candidate) => typeof candidate === 'number') &&
    typeof archiveField(value, 'createdAt') === 'number' &&
    typeof archiveField(value, 'updatedAt') === 'number'
}

export function isTaskArchiveLabelLinkPayload(value: unknown): value is Doc<'taskLabelLinks'> {
  if (!isArchiveObject(value)) return false
  return isArchiveId(archiveField(value, '_id')) &&
    typeof archiveField(value, '_creationTime') === 'number' &&
    isArchiveId(archiveField(value, 'projectId')) &&
    isArchiveId(archiveField(value, 'taskId')) &&
    isArchiveId(archiveField(value, 'labelId')) &&
    typeof archiveField(value, 'createdAt') === 'number'
}

export function isTaskArchiveLabelPayload(value: unknown): value is Doc<'taskLabels'> {
  if (!isArchiveObject(value)) return false
  return isArchiveId(archiveField(value, '_id')) &&
    typeof archiveField(value, '_creationTime') === 'number' &&
    isArchiveId(archiveField(value, 'projectId')) &&
    typeof archiveField(value, 'name') === 'string' &&
    typeof archiveField(value, 'colorToken') === 'string' &&
    isOptionalArchiveField(archiveField(value, 'archivedAt'), (candidate) => typeof candidate === 'number') &&
    isArchiveId(archiveField(value, 'createdByProjectMemberId')) &&
    typeof archiveField(value, 'createdAt') === 'number' &&
    typeof archiveField(value, 'updatedAt') === 'number'
}

export function isTaskArchiveCommentPayload(value: unknown): value is Doc<'taskComments'> {
  if (!isArchiveObject(value)) return false
  return isArchiveId(archiveField(value, '_id')) &&
    typeof archiveField(value, '_creationTime') === 'number' &&
    isArchiveId(archiveField(value, 'projectId')) &&
    isArchiveId(archiveField(value, 'taskId')) &&
    isOptionalArchiveField(archiveField(value, 'originalGroupId'), (candidate) => isArchiveId(candidate)) &&
    isArchiveId(archiveField(value, 'authorProjectMemberId')) &&
    isOptionalArchiveField(archiveField(value, 'actingCompanyId'), (candidate) => isArchiveId(candidate)) &&
    typeof archiveField(value, 'body') === 'string' &&
    Array.isArray(archiveField(value, 'mentionedProjectMemberIds')) &&
    typeof archiveField(value, 'revision') === 'number' &&
    isOptionalArchiveField(archiveField(value, 'archivedAt'), (candidate) => typeof candidate === 'number') &&
    typeof archiveField(value, 'idempotencyKey') === 'string' &&
    typeof archiveField(value, 'createdAt') === 'number' &&
    typeof archiveField(value, 'updatedAt') === 'number'
}

export function isTaskArchiveActivityPayload(value: unknown): value is Doc<'taskActivities'> {
  if (!isArchiveObject(value)) return false
  return isArchiveId(archiveField(value, '_id')) &&
    typeof archiveField(value, '_creationTime') === 'number' &&
    isArchiveId(archiveField(value, 'projectId')) &&
    isArchiveId(archiveField(value, 'taskId')) &&
    isOptionalArchiveField(archiveField(value, 'originalGroupId'), (candidate) => isArchiveId(candidate)) &&
    isOptionalArchiveField(archiveField(value, 'actorProjectMemberId'), (candidate) => isArchiveId(candidate)) &&
    isOptionalArchiveField(archiveField(value, 'actingCompanyId'), (candidate) => isArchiveId(candidate)) &&
    typeof archiveField(value, 'action') === 'string' &&
    typeof archiveField(value, 'correlationId') === 'string' &&
    typeof archiveField(value, 'createdAt') === 'number'
}

export function isTaskArchiveReferencePayload(value: unknown): value is Doc<'taskReferences'> {
  if (!isArchiveObject(value)) return false
  return isArchiveId(archiveField(value, '_id')) &&
    typeof archiveField(value, '_creationTime') === 'number' &&
    isArchiveId(archiveField(value, 'projectId')) &&
    isArchiveId(archiveField(value, 'taskId')) &&
    typeof archiveField(value, 'type') === 'string' &&
    isOptionalArchiveField(archiveField(value, 'groupId'), (candidate) => isArchiveId(candidate)) &&
    isOptionalArchiveField(archiveField(value, 'channelThreadId'), (candidate) => isArchiveId(candidate)) &&
    isOptionalArchiveField(archiveField(value, 'messageId'), (candidate) => isArchiveId(candidate)) &&
    isOptionalArchiveField(archiveField(value, 'attachmentId'), (candidate) => isArchiveId(candidate)) &&
    isOptionalArchiveField(archiveField(value, 'quote'), (candidate) => typeof candidate === 'string') &&
    typeof archiveField(value, 'availability') === 'string' &&
    typeof archiveField(value, 'isPrimary') === 'boolean' &&
    isArchiveId(archiveField(value, 'actorProjectMemberId')) &&
    isOptionalArchiveField(archiveField(value, 'actingCompanyId'), (candidate) => isArchiveId(candidate)) &&
    typeof archiveField(value, 'rank') === 'string' &&
    typeof archiveField(value, 'createdAt') === 'number' &&
    typeof archiveField(value, 'updatedAt') === 'number'
}

export function isTaskArchiveSuggestionPayload(value: unknown): value is Doc<'taskSuggestions'> {
  if (!isArchiveObject(value)) return false
  return isArchiveId(archiveField(value, '_id')) &&
    typeof archiveField(value, '_creationTime') === 'number' &&
    isArchiveId(archiveField(value, 'projectId')) &&
    isOptionalArchiveField(archiveField(value, 'groupId'), (candidate) => isArchiveId(candidate)) &&
    typeof archiveField(value, 'proposedTitle') === 'string' &&
    isOptionalArchiveField(archiveField(value, 'proposedDescription'), (candidate) => typeof candidate === 'string') &&
    isOptionalArchiveField(archiveField(value, 'proposedAssigneeProjectMemberId'), (candidate) => isArchiveId(candidate)) &&
    isTaskPriorityValue(archiveField(value, 'proposedPriority')) &&
    isOptionalArchiveField(archiveField(value, 'proposedDueDate'), (candidate) => typeof candidate === 'string') &&
    isTaskSuggestionStatusValue(archiveField(value, 'status')) &&
    typeof archiveField(value, 'confidence') === 'number' &&
    typeof archiveField(value, 'groundingReason') === 'string' &&
    typeof archiveField(value, 'fingerprint') === 'string' &&
    isOptionalArchiveField(archiveField(value, 'possibleDuplicateTaskId'), (candidate) => isArchiveId(candidate)) &&
    isOptionalArchiveField(archiveField(value, 'decidedByProjectMemberId'), (candidate) => isArchiveId(candidate)) &&
    isOptionalArchiveField(archiveField(value, 'decisionActingCompanyId'), (candidate) => isArchiveId(candidate)) &&
    isOptionalArchiveField(archiveField(value, 'dismissalReason'), (candidate) => isTaskSuggestionDismissalReasonValue(candidate)) &&
    isOptionalArchiveField(archiveField(value, 'decidedTaskId'), (candidate) => isArchiveId(candidate)) &&
    isOptionalArchiveField(archiveField(value, 'duplicateOverride'), (candidate) => typeof candidate === 'boolean') &&
    isOptionalArchiveField(archiveField(value, 'decisionIdempotencyKey'), (candidate) => typeof candidate === 'string') &&
    isOptionalArchiveField(archiveField(value, 'archivedAt'), (candidate) => typeof candidate === 'number') &&
    typeof archiveField(value, 'modelVersion') === 'string' &&
    typeof archiveField(value, 'promptVersion') === 'string' &&
    typeof archiveField(value, 'createdAt') === 'number' &&
    typeof archiveField(value, 'updatedAt') === 'number' &&
    isOptionalArchiveField(archiveField(value, 'decidedAt'), (candidate) => typeof candidate === 'number')
}

export function isTaskArchiveSuggestionReferencePayload(
  value: unknown,
): value is Doc<'taskSuggestionReferences'> {
  if (!isArchiveObject(value)) return false
  return isArchiveId(archiveField(value, '_id')) &&
    typeof archiveField(value, '_creationTime') === 'number' &&
    isArchiveId(archiveField(value, 'projectId')) &&
    isArchiveId(archiveField(value, 'suggestionId')) &&
    isTaskReferenceTypeValue(archiveField(value, 'type')) &&
    isOptionalArchiveField(archiveField(value, 'groupId'), (candidate) => isArchiveId(candidate)) &&
    isOptionalArchiveField(archiveField(value, 'channelThreadId'), (candidate) => isArchiveId(candidate)) &&
    isOptionalArchiveField(archiveField(value, 'messageId'), (candidate) => isArchiveId(candidate)) &&
    isOptionalArchiveField(archiveField(value, 'attachmentId'), (candidate) => isArchiveId(candidate)) &&
    isOptionalArchiveField(archiveField(value, 'quote'), (candidate) => typeof candidate === 'string') &&
    isTaskReferenceAvailabilityValue(archiveField(value, 'availability')) &&
    typeof archiveField(value, 'isPrimary') === 'boolean' &&
    typeof archiveField(value, 'rank') === 'string' &&
    typeof archiveField(value, 'createdAt') === 'number' &&
    typeof archiveField(value, 'updatedAt') === 'number'
}

/**
 * Validates the fields needed to safely consume a task archive payload. The
 * archive table intentionally stores polymorphic payloads, so callers must
 * reject malformed rows instead of asserting them into live task documents.
 */
export function isTaskArchivePayload(value: unknown): value is Doc<'tasks'> {
  if (!isArchiveObject(value)) return false
  return isArchiveId(archiveField(value, '_id')) &&
    typeof archiveField(value, '_creationTime') === 'number' &&
    isArchiveId(archiveField(value, 'projectId')) &&
    typeof archiveField(value, 'publicKey') === 'string' &&
    isArchiveId(archiveField(value, 'boardId')) &&
    isOptionalArchiveField(archiveField(value, 'groupId'), (candidate) => isArchiveId(candidate)) &&
    isOptionalArchiveField(archiveField(value, 'parentTaskId'), (candidate) => isArchiveId(candidate)) &&
    isArchiveId(archiveField(value, 'workflowStateId')) &&
    typeof archiveField(value, 'rank') === 'string' &&
    typeof archiveField(value, 'title') === 'string' &&
    typeof archiveField(value, 'searchText') === 'string' &&
    isOptionalArchiveField(archiveField(value, 'description'), (candidate) => typeof candidate === 'string') &&
    isOptionalArchiveField(archiveField(value, 'assigneeProjectMemberId'), (candidate) => isArchiveId(candidate)) &&
    isTaskPriorityValue(archiveField(value, 'priority')) &&
    isOptionalArchiveField(archiveField(value, 'dueDate'), (candidate) => typeof candidate === 'string') &&
    isArchiveId(archiveField(value, 'createdByProjectMemberId')) &&
    isOptionalArchiveField(archiveField(value, 'actingCompanyId'), (candidate) => isArchiveId(candidate)) &&
    typeof archiveField(value, 'revision') === 'number' &&
    isOptionalArchiveField(archiveField(value, 'terminalAt'), (candidate) => typeof candidate === 'number') &&
    isOptionalArchiveField(archiveField(value, 'archivedAt'), (candidate) => typeof candidate === 'number') &&
    isOptionalArchiveField(archiveField(value, 'sourceSuggestionId'), (candidate) => isArchiveId(candidate)) &&
    isOptionalArchiveField(archiveField(value, 'createIdempotencyKey'), (candidate) => typeof candidate === 'string') &&
    typeof archiveField(value, 'createdAt') === 'number' &&
    typeof archiveField(value, 'updatedAt') === 'number'
}

export function taskFromArchiveSnapshot(
  row: Doc<'taskArchiveSnapshots'>,
) {
  if (row.sourceTable !== 'tasks' || !isTaskArchivePayload(row.payload)) return null
  return row.payload
}

export function taskFromExitStagingSnapshot(
  row: Doc<'taskExitSnapshotStaging'>,
) {
  if (row.sourceTable !== 'tasks' || !isTaskArchivePayload(row.payload)) return null
  return row.payload
}

export function taskIdFromArchiveSnapshot(
  row: Doc<'taskArchiveSnapshots'>,
) {
  if (row.taskId) return row.taskId
  return taskFromArchiveSnapshot(row)?._id
}

export function taskArchiveSummary(
  task: Doc<'tasks'>,
  board: Doc<'taskBoards'> | null,
  state: Doc<'taskWorkflowStates'> | null,
  hasEvidence = false,
) {
  return {
    task: taskSummaryTask(task),
    board: taskSummaryBoard(board),
    state: taskSummaryState(state),
    assignee: null,
    hasEvidence,
  }
}

const publicKeyAlphabet = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'

export async function createUniqueTaskPublicKey(ctx: MutationCtx, projectId: Id<'projects'>) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const bytes = crypto.getRandomValues(new Uint8Array(8))
    const value = Array.from(bytes, (byte) => publicKeyAlphabet[byte % publicKeyAlphabet.length]).join('')
    const publicKey = `T-${value}`
    const existing = await ctx.db
      .query('tasks')
      .withIndex('by_project_key', (q) => q.eq('projectId', projectId).eq('publicKey', publicKey))
      .unique()
    if (!existing) return publicKey
  }
  throw new Error('task_key_generation_failed')
}

export async function getDefaultWorkflowState(ctx: TaskDataCtx, boardId: Id<'taskBoards'>) {
  const state = await ctx.db
    .query('taskWorkflowStates')
    .withIndex('by_board_default', (q) => q.eq('boardId', boardId).eq('isDefault', true))
    .unique()
  if (!state || state.archivedAt) throw new Error('task_destination_invalid')
  return state
}

export function rankForIndex(index: number) {
  return (index + 1).toString(36).padStart(8, '0')
}

const rankDigits = '0123456789abcdefghijklmnopqrstuvwxyz'
const rankBase = 36n
const rankBaseLength = 8
const rankMaxLength = 16

function rankValue(rank: string, length: number) {
  let value = 0n
  for (let index = 0; index < length; index += 1) {
    const digit = index < rank.length ? rankDigits.indexOf(rank[index]) : 0
    if (digit < 0) return null
    value = value * rankBase + BigInt(digit)
  }
  return value
}

function rankString(value: bigint, length: number) {
  let remaining = value
  let rank = ''
  for (let index = 0; index < length; index += 1) {
    rank = rankDigits[Number(remaining % rankBase)] + rank
    remaining /= rankBase
  }
  return rank
}

/**
 * Allocates an opaque rank strictly between two neighbouring ranks, keeping the
 * zero-padded base36 space `rankForIndex` produces. Ranks compare
 * lexicographically, so a rank is read as a base36 fraction and the midpoint is
 * widened by one digit until a gap opens. Returns `null` when no gap remains,
 * which asks the caller to reindex the column instead.
 */
export function rankBetween(above: string | undefined, below?: string) {
  if (!below) {
    const length = Math.max(above?.length ?? 0, rankBaseLength)
    const value = rankValue(above ?? '', length)
    if (value === null) return null
    const next = value + 1n
    return next < rankBase ** BigInt(length) ? rankString(next, length) : null
  }
  const start = Math.max(above?.length ?? 0, below.length, rankBaseLength)
  for (let length = start; length <= rankMaxLength; length += 1) {
    const low = rankValue(above ?? '', length)
    const high = rankValue(below, length)
    if (low === null || high === null || high <= low) return null
    if (high - low >= 2n) return rankString((low + high) / 2n, length)
  }
  return null
}

export async function appendTaskActivity(
  ctx: MutationCtx,
  input: {
    task: Doc<'tasks'>
    action: Doc<'taskActivities'>['action']
    actorProjectMemberId?: Id<'projectMembers'>
    actingCompanyId?: Id<'companies'>
    before?: unknown
    after?: unknown
    correlationId?: string
  },
) {
  await ctx.db.insert('taskActivities', {
    projectId: input.task.projectId,
    taskId: input.task._id,
    originalGroupId: input.task.groupId,
    actorProjectMemberId: input.actorProjectMemberId,
    actingCompanyId: input.actingCompanyId,
    action: input.action,
    before: input.before,
    after: input.after,
    correlationId: input.correlationId ?? crypto.randomUUID(),
    createdAt: Date.now(),
  })
}

function taskSummaryTask(task: Doc<'tasks'>) {
  const { searchText: _searchText, description: _description, ...summary } = task
  return summary
}

function taskSummaryBoard(board: Doc<'taskBoards'> | null) {
  if (!board) return null
  const { description: _description, ...summary } = board
  return summary
}

function taskSummaryState(state: Doc<'taskWorkflowStates'> | null) {
  return state
}

function taskSummaryAssignee(member: Doc<'projectMembers'> | null) {
  return member
}

export async function taskSummaryPage(
  ctx: TaskDataCtx,
  tasks: Array<Doc<'tasks'>>,
) {
  const boardIds = Array.from(new Set(tasks.map((task) => task.boardId)))
  const stateIds = Array.from(new Set(tasks.map((task) => task.workflowStateId)))
  const assigneeIds = Array.from(new Set(tasks.flatMap((task) =>
    task.assigneeProjectMemberId ? [task.assigneeProjectMemberId] : [])))
  const [boards, states, assignees, evidence] = await Promise.all([
    Promise.all(boardIds.map((boardId) => ctx.db.get(boardId))),
    Promise.all(stateIds.map((stateId) => ctx.db.get(stateId))),
    Promise.all(assigneeIds.map((memberId) => ctx.db.get(memberId))),
    Promise.all(tasks.map((task) => ctx.db.query('taskReferences')
      .withIndex('by_task_rank', (q) => q.eq('taskId', task._id))
      .first())),
  ])
  const boardById = new Map<Id<'taskBoards'>, Doc<'taskBoards'>>()
  for (const [index, board] of boards.entries()) {
    if (board) boardById.set(boardIds[index], board)
  }
  const stateById = new Map<Id<'taskWorkflowStates'>, Doc<'taskWorkflowStates'>>()
  for (const [index, state] of states.entries()) {
    if (state) stateById.set(stateIds[index], state)
  }
  const assigneeById = new Map<Id<'projectMembers'>, Doc<'projectMembers'>>()
  for (const [index, assignee] of assignees.entries()) {
    if (assignee) assigneeById.set(assigneeIds[index], assignee)
  }
  return tasks.map((task, index) => ({
    task: taskSummaryTask(task),
    board: taskSummaryBoard(boardById.get(task.boardId) ?? null),
    state: taskSummaryState(stateById.get(task.workflowStateId) ?? null),
    assignee: task.assigneeProjectMemberId
      ? taskSummaryAssignee(assigneeById.get(task.assigneeProjectMemberId) ?? null)
      : null,
    hasEvidence: Boolean(evidence[index]),
  }))
}

export async function taskView(
  ctx: TaskDataCtx,
  task: Doc<'tasks'>,
  accessibleOriginalGroups: ReadonlySet<string> = new Set(),
  options: { includeReferences?: boolean; maxReferences?: number } = {},
) {
  const [board, state, assignee, creator, labelLinks] = await Promise.all([
    ctx.db.get(task.boardId),
    ctx.db.get(task.workflowStateId),
    task.assigneeProjectMemberId ? ctx.db.get(task.assigneeProjectMemberId) : null,
    ctx.db.get(task.createdByProjectMemberId),
    ctx.db.query('taskLabelLinks').withIndex('by_task', (q) => q.eq('taskId', task._id)).collect(),
  ])
  const labels = await Promise.all(labelLinks.map((link) => ctx.db.get(link.labelId)))
  const referenceQuery = ctx.db.query('taskReferences')
    .withIndex('by_task_rank', (q) => q.eq('taskId', task._id))
  const references = options.includeReferences === false
    ? []
    : options.maxReferences === undefined ? await referenceQuery.collect() : await referenceQuery.take(options.maxReferences)
  const visibleReferences = []
  for (const reference of references.filter((candidate) =>
    !candidate.groupId || candidate.groupId === task.groupId ||
    accessibleOriginalGroups.has(String(candidate.groupId)),
  )) {
    const source = reference.messageId ? await ctx.db.get(reference.messageId)
      : reference.attachmentId ? await ctx.db.get(reference.attachmentId)
        : null
    const sourceScopeMatches = Boolean(source && source.groupId === reference.groupId)
    const sourceThreadId = reference.channelThreadId ?? (source && 'channelThreadId' in source
      ? source.channelThreadId
      : undefined)
    const sourceAvailable = Boolean(source && (!sourceThreadId || threadsEnabled()) &&
      source.projectId === task.projectId && sourceScopeMatches)
    visibleReferences.push({
      ...reference,
      availability: sourceAvailable ? reference.availability : 'unavailable' as const,
      quote: sourceAvailable && reference.availability === 'available' ? reference.quote : undefined,
    })
  }
  return {
    task,
    board,
    state,
    assignee,
    creator,
    labels: labels.filter(Boolean),
    references: visibleReferences,
    terminal: state ? isTerminalTaskState(state.category) : false,
  }
}

type ArchiveTaskSearchAccess = Pick<ResolvedTaskRequestContext, 'entitlement' | 'projectMember'>

export type TaskArchiveSnapshotSource =
  | { kind: 'materialized'; entitlementId: Id<'projectArchiveEntitlements'> }
  | {
      kind: 'staging'
      projectCompanyId: Id<'projectCompanies'>
      operationId: string
    }

export type TaskArchiveSnapshotRow = Doc<'taskArchiveSnapshots'> | Doc<'taskExitSnapshotStaging'>

const archiveSearchResultLimit = 100

export function taskArchiveSourceForEntitlement(
  entitlement: Doc<'projectArchiveEntitlements'>,
): TaskArchiveSnapshotSource {
  if (
    entitlement.snapshotOperationId &&
    (entitlement.visibilityStatus !== 'active' || entitlement.channelIds.length === 0)
  ) {
    return {
      kind: 'staging',
      projectCompanyId: entitlement.projectCompanyId,
      operationId: entitlement.snapshotOperationId,
    }
  }
  return { kind: 'materialized', entitlementId: entitlement._id }
}

function archiveTaskSearchSources(
  entitlement: Doc<'projectArchiveEntitlements'>,
): Array<TaskArchiveSnapshotSource> {
  const sources: Array<TaskArchiveSnapshotSource> = []
  if (entitlement.snapshotOperationId) {
    sources.push({
      kind: 'staging',
      projectCompanyId: entitlement.projectCompanyId,
      operationId: entitlement.snapshotOperationId,
    })
  }
  sources.push({ kind: 'materialized', entitlementId: entitlement._id })
  return sources
}

async function archiveTaskSearchRows(
  ctx: TaskDataCtx,
  source: TaskArchiveSnapshotSource,
  term: string,
  exactKey: string | null,
  limit: number,
) {
  if (source.kind === 'materialized') {
    if (exactKey) {
      const row = await ctx.db
        .query('taskArchiveSnapshots')
        .withIndex('by_entitlement_task_key', (q) =>
          q
            .eq('entitlementId', source.entitlementId)
            .eq('sourceTable', 'tasks')
            .eq('taskPublicKey', exactKey),
        )
        .unique()
      return row ? [row] : []
    }
    return await ctx.db
      .query('taskArchiveSnapshots')
      .withSearchIndex('search_task_text', (q) =>
        q
          .search('taskSearchText', term)
          .eq('entitlementId', source.entitlementId)
          .eq('sourceTable', 'tasks'),
      )
      .take(limit)
  }
  if (exactKey) {
    return await ctx.db
      .query('taskExitSnapshotStaging')
      .withIndex('by_project_company_operation_task_key', (q) =>
        q
          .eq('projectCompanyId', source.projectCompanyId)
          .eq('operationId', source.operationId)
          .eq('sourceTable', 'tasks')
          .eq('taskPublicKey', exactKey),
      )
      .take(limit)
  }
  return await ctx.db
    .query('taskExitSnapshotStaging')
    .withSearchIndex('search_task_text', (q) =>
      q
        .search('taskSearchText', term)
        .eq('projectCompanyId', source.projectCompanyId)
        .eq('operationId', source.operationId)
        .eq('sourceTable', 'tasks'),
    )
    .take(limit)
}

export async function taskArchiveSourceRow(
  ctx: TaskDataCtx,
  source: TaskArchiveSnapshotSource,
  sourceTable: string,
  sourceId: string,
) {
  if (source.kind === 'materialized') {
    return await ctx.db
      .query('taskArchiveSnapshots')
      .withIndex('by_entitlement_source', (q) =>
        q
          .eq('entitlementId', source.entitlementId)
          .eq('sourceTable', sourceTable)
          .eq('sourceId', sourceId),
      )
      .unique()
  }
  return await ctx.db
    .query('taskExitSnapshotStaging')
    .withIndex('by_project_company_operation_source', (q) =>
      q
        .eq('projectCompanyId', source.projectCompanyId)
        .eq('operationId', source.operationId)
        .eq('sourceTable', sourceTable)
        .eq('sourceId', sourceId),
    )
    .unique()
}

export async function taskArchiveTaskByPublicKey(
  ctx: TaskDataCtx,
  source: TaskArchiveSnapshotSource,
  publicKey: string,
) {
  if (source.kind === 'materialized') {
    const indexed = await ctx.db
      .query('taskArchiveSnapshots')
      .withIndex('by_entitlement_task_key', (q) =>
        q
          .eq('entitlementId', source.entitlementId)
          .eq('sourceTable', 'tasks')
          .eq('taskPublicKey', publicKey),
      )
      .unique()
    if (indexed) return indexed
    // Snapshots written before taskPublicKey was introduced remain readable.
    const legacyRows = await ctx.db
      .query('taskArchiveSnapshots')
      .withIndex('by_entitlement_table', (q) =>
        q.eq('entitlementId', source.entitlementId).eq('sourceTable', 'tasks'),
      )
      .take(archiveSearchResultLimit)
    return legacyRows.find((row) => taskFromArchiveSnapshot(row)?.publicKey === publicKey) ?? null
  }
  const rows = await ctx.db
    .query('taskExitSnapshotStaging')
    .withIndex('by_project_company_operation_task_key', (q) =>
      q
        .eq('projectCompanyId', source.projectCompanyId)
        .eq('operationId', source.operationId)
        .eq('sourceTable', 'tasks')
        .eq('taskPublicKey', publicKey),
    )
    .take(1)
  return rows[0] ?? null
}

export async function taskArchiveRowsPage(
  ctx: TaskDataCtx,
  source: TaskArchiveSnapshotSource,
  sourceTable: string,
  paginationOpts: PaginationOptions,
) {
  if (source.kind === 'materialized') {
    return await ctx.db
      .query('taskArchiveSnapshots')
      .withIndex('by_entitlement_table', (q) =>
        q.eq('entitlementId', source.entitlementId).eq('sourceTable', sourceTable),
      )
      .paginate(paginationOpts)
  }
  return await ctx.db
    .query('taskExitSnapshotStaging')
    .withIndex('by_project_company_operation_table', (q) =>
      q
        .eq('projectCompanyId', source.projectCompanyId)
        .eq('operationId', source.operationId)
        .eq('sourceTable', sourceTable),
    )
    .paginate(paginationOpts)
}

export async function taskArchiveTaskRowsPage(
  ctx: TaskDataCtx,
  source: TaskArchiveSnapshotSource,
  taskId: Id<'tasks'>,
  sourceTable: string,
  paginationOpts: PaginationOptions,
) {
  if (source.kind === 'materialized') {
    return await ctx.db
      .query('taskArchiveSnapshots')
      .withIndex('by_entitlement_task', (q) =>
        q
          .eq('entitlementId', source.entitlementId)
          .eq('taskId', taskId)
          .eq('sourceTable', sourceTable),
      )
      .paginate(paginationOpts)
  }
  return await ctx.db
    .query('taskExitSnapshotStaging')
    .withIndex('by_project_company_operation_table_task', (q) =>
      q
        .eq('projectCompanyId', source.projectCompanyId)
        .eq('operationId', source.operationId)
        .eq('sourceTable', sourceTable)
        .eq('taskId', taskId),
    )
    .paginate(paginationOpts)
}

export async function taskArchiveHasEvidence(
  ctx: TaskDataCtx,
  source: TaskArchiveSnapshotSource,
  taskId: Id<'tasks'>,
) {
  if (source.kind === 'materialized') {
    return Boolean(await ctx.db
      .query('taskArchiveSnapshots')
      .withIndex('by_entitlement_task', (q) =>
        q
          .eq('entitlementId', source.entitlementId)
          .eq('taskId', taskId)
          .eq('sourceTable', 'taskReferences'),
      )
      .first())
  }
  return Boolean(await ctx.db
    .query('taskExitSnapshotStaging')
    .withIndex('by_project_company_operation_table_task', (q) =>
      q
        .eq('projectCompanyId', source.projectCompanyId)
        .eq('operationId', source.operationId)
        .eq('sourceTable', 'taskReferences')
        .eq('taskId', taskId),
    )
    .first())
}

export async function taskArchiveHasLabel(
  ctx: TaskDataCtx,
  source: TaskArchiveSnapshotSource,
  taskId: Id<'tasks'>,
  labelId: Id<'taskLabels'>,
) {
  if (source.kind === 'materialized') {
    return Boolean(await ctx.db
      .query('taskArchiveSnapshots')
      .withIndex('by_entitlement_task', (q) =>
        q
          .eq('entitlementId', source.entitlementId)
          .eq('taskId', taskId)
          .eq('sourceTable', 'taskLabelLinks'),
      )
      .filter((q) => q.eq(q.field('payload.labelId'), labelId))
      .first())
  }
  return Boolean(await ctx.db
    .query('taskExitSnapshotStaging')
    .withIndex('by_project_company_operation_table_task', (q) =>
      q
        .eq('projectCompanyId', source.projectCompanyId)
        .eq('operationId', source.operationId)
        .eq('sourceTable', 'taskLabelLinks')
        .eq('taskId', taskId),
    )
    .filter((q) => q.eq(q.field('payload.labelId'), labelId))
    .first())
}

export async function taskArchiveMessageRowsPage(
  ctx: TaskDataCtx,
  source: TaskArchiveSnapshotSource,
  messageId: Id<'messages'>,
  paginationOpts: PaginationOptions,
) {
  if (source.kind === 'materialized') {
    return await ctx.db
      .query('taskArchiveSnapshots')
      .withIndex('by_entitlement_message', (q) =>
        q.eq('entitlementId', source.entitlementId).eq('messageId', messageId),
      )
      .paginate(paginationOpts)
  }
  return await ctx.db
    .query('taskExitSnapshotStaging')
    .withIndex('by_project_company_operation_message', (q) =>
      q
        .eq('projectCompanyId', source.projectCompanyId)
        .eq('operationId', source.operationId)
        .eq('messageId', messageId),
    )
    .paginate(paginationOpts)
}

export function taskFromArchiveRow(row: TaskArchiveSnapshotRow) {
  if (row.sourceTable !== 'tasks') return null
  return 'cutoff' in row
    ? taskFromExitStagingSnapshot(row)
    : taskFromArchiveSnapshot(row)
}

function archiveSearchRowTask(row: TaskArchiveSnapshotRow) {
  if (row.sourceTable !== 'tasks') return null
  return 'cutoff' in row
    ? taskFromExitStagingSnapshot(row)
    : taskFromArchiveSnapshot(row)
}

async function archiveTaskGroupIsVisible(
  ctx: TaskDataCtx,
  access: ArchiveTaskSearchAccess,
  groupId: Id<'groups'>,
) {
  const entitlement = access.entitlement
  if (!entitlement) return false
  if (entitlement.channelIds.includes(groupId)) return true
  if (!entitlement.snapshotOperationId) return false
  return await hasArchivedChannelVisibility(ctx, {
    operationId: entitlement.snapshotOperationId,
    projectMemberId: access.projectMember._id,
    groupId,
  })
}

export async function taskArchiveGroupIsVisible(
  ctx: TaskDataCtx,
  entitlement: Doc<'projectArchiveEntitlements'>,
  projectMemberId: Id<'projectMembers'>,
  groupId: Id<'groups'>,
) {
  if (entitlement.channelIds.includes(groupId)) return true
  if (!entitlement.snapshotOperationId) return false
  return await hasArchivedChannelVisibility(ctx, {
    operationId: entitlement.snapshotOperationId,
    projectMemberId,
    groupId,
  })
}

export async function searchArchivedTasks(
  ctx: TaskDataCtx,
  access: ArchiveTaskSearchAccess,
  term: string,
  limit: number,
) {
  const entitlement = access.entitlement
  if (!entitlement) return []
  const normalizedTerm = term.trim().toLowerCase()
  if (!normalizedTerm) return []
  const exactKey = /^T-[23456789A-Z]{8}$/.test(term.trim().toUpperCase())
    ? term.trim().toUpperCase()
    : null
  const resultLimit = Math.min(Math.max(Math.trunc(limit), 1), archiveSearchResultLimit)
  const sources = archiveTaskSearchSources(entitlement)
  const rowsBySource = await Promise.all(sources.map(async (source) => ({
    source,
    rows: await archiveTaskSearchRows(ctx, source, normalizedTerm, exactKey, resultLimit),
  })))
  const candidates: Array<{ source: TaskArchiveSnapshotSource; row: TaskArchiveSnapshotRow; task: Doc<'tasks'> }> = []
  const seen = new Set<string>()
  for (const { source, rows } of rowsBySource) {
    for (const row of rows) {
      const task = archiveSearchRowTask(row)
      if (!task || task.archivedAt || seen.has(String(task._id))) continue
      if (exactKey ? task.publicKey !== exactKey : !task.searchText.toLowerCase().includes(normalizedTerm)) continue
      if (task.groupId && !await archiveTaskGroupIsVisible(ctx, access, task.groupId)) continue
      seen.add(String(task._id))
      candidates.push({ source, row, task })
      if (candidates.length >= resultLimit) break
    }
    if (candidates.length >= resultLimit) break
  }
  const views = []
  for (const candidate of candidates) {
    const [boardRow, stateRow] = await Promise.all([
      taskArchiveSourceRow(ctx, candidate.source, 'taskBoards', String(candidate.task.boardId)),
      taskArchiveSourceRow(ctx, candidate.source, 'taskWorkflowStates', String(candidate.task.workflowStateId)),
    ])
    const board = boardRow && isTaskArchiveBoardPayload(boardRow.payload) ? boardRow.payload : null
    const state = stateRow && isTaskArchiveStatePayload(stateRow.payload) ? stateRow.payload : null
    if (
      !board || !state ||
      candidate.task.projectId !== entitlement.projectId ||
      board.projectId !== entitlement.projectId ||
      state.projectId !== entitlement.projectId ||
      board._id !== candidate.task.boardId ||
      state._id !== candidate.task.workflowStateId ||
      state.boardId !== board._id ||
      (board.groupId && !await archiveTaskGroupIsVisible(ctx, access, board.groupId))
    ) continue
    views.push(taskArchiveSummary(
      candidate.task,
      board,
      state,
      await taskArchiveHasEvidence(ctx, candidate.source, candidate.task._id),
    ))
  }
  return views
}
