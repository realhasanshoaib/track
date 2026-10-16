import type { Doc, Id } from '../_generated/dataModel'
import type { MutationCtx } from '../_generated/server'


const memberBatchSize = 25
const channelBatchSize = 50
const threadBatchSize = 25

export type ExitCaptureCursor =
  | { phase: 'members' | 'channels'; cursor: string | null }
  | {
      phase: 'threads'
      memberCursor: string | null
      memberId?: Id<'projectMembers'>
      memberDone?: boolean
      channelCursor?: string | null
      threadCursor?: string | null
    }

type ExitSnapshotRow =
  | { scope: 'member'; sourceId: string; projectMemberId: Id<'projectMembers'>; payload: {
      kind: 'member'
      snapshot: {
        membership: {
          _id: Id<'projectMembers'>
          companyId?: Id<'companies'>
          role: 'manager' | 'member'
          status?: 'active' | 'suspended' | 'removed' | 'archived'
          userId: Id<'users'>
          userDisplayNameSnapshot?: string
          companyDisplayNameSnapshot?: string
        }
        user: { _id: Id<'users'>; displayName: string }
        company?: { _id: Id<'companies'>; displayName: string }
      }
    } }
  | { scope: 'channel'; sourceId: string; payload: {
      kind: 'channel'
      snapshot: {
        _id: Id<'groups'>
        createdAt: number
        kind: string
        name: string
        status?: string
      }
    } }
  | { scope: 'thread'; sourceId: string; projectMemberId: Id<'projectMembers'>; threadId: Id<'channelThreads'>; payload: {
      kind: 'thread'
      snapshot: {
        _id: Id<'channelThreads'>
        createdAt: number
        groupId: Id<'groups'>
        name: string
        status: 'active' | 'archived'
        revision: number
        sourceAvailable: boolean
        following: boolean
        lastReadChannelSequence: number
        replyCount?: number
        latestReplyAt?: number
        latestChannelSequence?: number
      }
    } }

type OperationInput = {
  projectCompanyId: Id<'projectCompanies'>
  projectId: Id<'projects'>
  operationId: string
  cutoff: number
}

type ExitProjectSnapshot = Pick<Doc<'projects'>, 'name'> &
  Partial<Pick<Doc<'projects'>, '_id' | 'description' | 'owningCompanyId' | 'origin' | 'status'>> & {
    owningCompanyDisplayName?: string
  }

function decodeExitProjectSnapshot(
  ctx: MutationCtx,
  value: unknown,
): ExitProjectSnapshot | undefined {
  if (!value || typeof value !== 'object' || !('name' in value) || typeof value.name !== 'string') {
    return undefined
  }
  const snapshot: ExitProjectSnapshot = { name: value.name }
  if ('_id' in value && typeof value._id === 'string') {
    const projectId = ctx.db.normalizeId('projects', value._id)
    if (projectId) snapshot._id = projectId
  }
  if ('description' in value && typeof value.description === 'string') {
    snapshot.description = value.description
  }
  if ('owningCompanyId' in value && typeof value.owningCompanyId === 'string') {
    const companyId = ctx.db.normalizeId('companies', value.owningCompanyId)
    if (companyId) snapshot.owningCompanyId = companyId
  }
  if ('owningCompanyDisplayName' in value && typeof value.owningCompanyDisplayName === 'string') {
    snapshot.owningCompanyDisplayName = value.owningCompanyDisplayName
  }
  if ('origin' in value && (value.origin === 'single_company' || value.origin === 'shared')) {
    snapshot.origin = value.origin
  }
  if (
    'status' in value &&
    (value.status === 'proposed' || value.status === 'active' ||
      value.status === 'archive_pending' || value.status === 'archived')
  ) {
    snapshot.status = value.status
  }
  return snapshot
}

function encodeCursor(cursor: ExitCaptureCursor) {
  return JSON.stringify(cursor)
}

function normalizeSnapshotSearchText(value: string) {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase()
}

function snapshotSearchText(row: ExitSnapshotRow): string | undefined {
  if (row.payload.kind === 'channel' || row.payload.kind === 'thread') {
    return normalizeSnapshotSearchText(row.payload.snapshot.name)
  }
  return undefined
}

function isPhase(value: unknown): value is ExitCaptureCursor['phase'] {
  return value === 'members' || value === 'channels' || value === 'threads'
}

function isExitCaptureCursor(value: unknown): value is ExitCaptureCursor {
  if (typeof value !== 'object' || value === null || !('phase' in value)) return false
  const phase = value.phase
  if (!isPhase(phase)) return false
  if (phase === 'threads') {
    if (!('memberCursor' in value)) return false
    const memberCursor = value.memberCursor
    const channelCursor = 'channelCursor' in value ? value.channelCursor : undefined
    const threadCursor = 'threadCursor' in value ? value.threadCursor : undefined
    const memberId = 'memberId' in value ? value.memberId : undefined
    const memberDone = 'memberDone' in value ? value.memberDone : undefined
    return (
      (memberCursor === null || typeof memberCursor === 'string') &&
      (memberDone === undefined || typeof memberDone === 'boolean') &&
      (channelCursor === undefined || channelCursor === null || typeof channelCursor === 'string') &&
      (threadCursor === undefined || threadCursor === null || typeof threadCursor === 'string') &&
      (memberId === undefined || typeof memberId === 'string')
    )
  }
  if (!('cursor' in value)) return false
  const cursor = value.cursor
  return cursor === null || typeof cursor === 'string'
}

export function decodeExitCaptureCursor(value: string | null | undefined): ExitCaptureCursor {
  if (!value) return { phase: 'members', cursor: null }
  try {
    const parsed: unknown = JSON.parse(value)
    if (isExitCaptureCursor(parsed)) return parsed
  } catch {
    return { phase: 'members', cursor: null }
  }
  return { phase: 'members', cursor: null }
}

async function insertSnapshotRow(
  ctx: MutationCtx,
  input: OperationInput,
  row: ExitSnapshotRow,
) {
  const existing = await ctx.db
    .query('projectExitSnapshotStaging')
    .withIndex('by_operation_source', (q) =>
      q
        .eq('operationId', input.operationId)
        .eq('sourceKind', row.scope)
        .eq('sourceId', row.sourceId)
        .eq('projectMemberId', 'projectMemberId' in row ? row.projectMemberId : undefined),
    )
    .unique()
  if (existing) return false
  await ctx.db.insert('projectExitSnapshotStaging', {
    projectCompanyId: input.projectCompanyId,
    projectId: input.projectId,
    operationId: input.operationId,
    scope: row.scope,
    projectMemberId: 'projectMemberId' in row ? row.projectMemberId : undefined,
    groupId: row.scope === 'channel' ? row.payload.snapshot._id : row.scope === 'thread' ? row.payload.snapshot.groupId : undefined,
    threadId: row.scope === 'thread' ? row.threadId : undefined,
    sourceKind: row.scope,
    sourceId: row.sourceId,
    searchText: snapshotSearchText(row),
    cutoff: input.cutoff,
    payload: row.payload,
    createdAt: Date.now(),
  })
  return true
}

async function ensureStagingEntitlement(
  ctx: MutationCtx,
  input: OperationInput,
  participation: Doc<'projectCompanies'>,
  projectMemberId: Id<'projectMembers'>,
) {
  const current = await ctx.db
    .query('projectArchiveEntitlements')
    .withIndex('by_member_operation', (q) =>
      q.eq('projectMemberId', projectMemberId).eq('snapshotOperationId', input.operationId),
    )
    .unique()
  if (current) return current._id
  const projectSnapshot = decodeExitProjectSnapshot(ctx, participation.exitProjectSnapshot) ?? {}
  return await ctx.db.insert('projectArchiveEntitlements', {
    projectId: input.projectId,
    projectCompanyId: input.projectCompanyId,
    companyId: participation.companyId,
    projectMemberId,
    exitAt: input.cutoff,
    owningCompanyId: participation.exitOwningCompanyId,
    owningCompanyDisplayName: participation.exitOwningCompanyDisplayName,
    channelIds: [],
    channelCount: 0,
    projectSnapshot,
    channelSnapshots: [],
    retentionStatus: 'active',
    manifestHash: `pending:${input.operationId}`,
    snapshotOperationId: input.operationId,
    visibilityStatus: 'staging',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  })
}

async function captureMembers(
  ctx: MutationCtx,
  input: OperationInput,
  cursor: string | null,
) {
  const result = await ctx.db
    .query('projectMembers')
    .withIndex('by_project', (q) => q.eq('projectId', input.projectId))
    .paginate({ cursor, numItems: memberBatchSize })
  let stagedCount = 0
  for (const member of result.page) {
    if (
      member.status !== 'active' ||
      member.createdAt > input.cutoff ||
      (member.role !== 'manager' && member.role !== 'member')
    ) continue
    const company = member.companyId ? await ctx.db.get(member.companyId) : null
    const base = {
      membership: {
        _id: member._id,
        companyId: member.companyId,
        role: member.role,
        status: member.status,
        userId: member.userId,
        userDisplayNameSnapshot: member.userDisplayNameSnapshot,
        companyDisplayNameSnapshot: member.companyDisplayNameSnapshot,
      },
      user: {
        _id: member.userId,
        displayName: member.userDisplayNameSnapshot ?? 'Former member',
      },
    }
    const payload = company
      ? { kind: 'member' as const, snapshot: { ...base, company: {
          _id: company._id,
          displayName: member.companyDisplayNameSnapshot ?? company.displayName,
        } } }
      : { kind: 'member' as const, snapshot: base }
    if (await insertSnapshotRow(ctx, input, {
      scope: 'member',
      sourceId: String(member._id),
      projectMemberId: member._id,
      payload,
    })) stagedCount += 1
  }
  return {
    cursor: result.isDone
      ? encodeCursor({ phase: 'channels', cursor: null })
      : encodeCursor({ phase: 'members', cursor: result.continueCursor }),
    nextPhase: result.isDone ? 'channels' as const : 'members' as const,
    stagedCount,
  }
}

async function captureChannels(
  ctx: MutationCtx,
  input: OperationInput,
  cursor: string | null,
) {
  const result = await ctx.db
    .query('groups')
    .withIndex('by_project', (q) => q.eq('projectId', input.projectId))
    .paginate({ cursor, numItems: channelBatchSize })
  let stagedCount = 0
  for (const group of result.page) {
    if (group.createdAt > input.cutoff) continue
    const payload = {
      kind: 'channel' as const,
      snapshot: {
        _id: group._id,
        createdAt: group.createdAt,
        kind: group.kind,
        name: group.name,
        status: group.status,
      },
    }
    if (await insertSnapshotRow(ctx, input, {
      scope: 'channel',
      sourceId: String(group._id),
      payload,
    })) stagedCount += 1
  }
  return {
    cursor: result.isDone
      ? encodeCursor({ phase: 'threads', memberCursor: null })
      : encodeCursor({ phase: 'channels', cursor: result.continueCursor }),
    nextPhase: result.isDone ? 'threads' as const : 'channels' as const,
    stagedCount,
  }
}

async function stageChannelVisibilityPage(
  ctx: MutationCtx,
  input: OperationInput,
  memberId: Id<'projectMembers'>,
  cursor: string | null,
) {
  const result = await ctx.db
    .query('groupMembers')
    .withIndex('by_project_member_status', (q) =>
      q.eq('projectMemberId', memberId).eq('status', 'active'),
    )
    .paginate({ cursor, numItems: channelBatchSize })
  let stagedCount = 0
  for (const membership of result.page) {
    const existing = await ctx.db
      .query('projectExitChannelVisibility')
      .withIndex('by_operation_member', (q) =>
        q
          .eq('operationId', input.operationId)
          .eq('projectMemberId', memberId)
          .eq('groupId', membership.groupId),
      )
      .unique()
    if (existing) continue
    await ctx.db.insert('projectExitChannelVisibility', {
      projectCompanyId: input.projectCompanyId,
      projectId: input.projectId,
      operationId: input.operationId,
      projectMemberId: memberId,
      groupId: membership.groupId,
      createdAt: Date.now(),
    })
    const entitlement = await ctx.db
      .query('projectArchiveEntitlements')
      .withIndex('by_member_operation', (q) =>
        q.eq('projectMemberId', memberId).eq('snapshotOperationId', input.operationId),
      )
      .unique()
    if (!entitlement) throw new Error('exit_archive_entitlement_missing')
    await ctx.db.patch(entitlement._id, {
      channelCount: (entitlement.channelCount ?? 0) + 1,
      updatedAt: Date.now(),
    })
    stagedCount += 1
  }
  return {
    cursor: result.isDone ? null : result.continueCursor,
    done: result.isDone,
    stagedCount,
  }
}

async function captureThreads(
  ctx: MutationCtx,
  input: OperationInput,
  participation: Doc<'projectCompanies'>,
  cursor: Extract<ExitCaptureCursor, { phase: 'threads' }>,
) {
  let memberId = cursor.memberId
  let memberCursor = cursor.memberCursor
  let channelCursor = cursor.channelCursor
  let threadCursor = cursor.threadCursor ?? null
  let stagedCount = 0
  if (!memberId) {
    if (cursor.memberDone) {
      return {
        cursor: null,
        nextPhase: 'complete' as const,
        stagedCount,
      }
    }
    const memberPage = await ctx.db
      .query('projectMembers')
      .withIndex('by_project_company_status', (q) =>
        q
          .eq('projectId', input.projectId)
          .eq('companyId', participation.companyId)
          .eq('status', 'active'),
      )
      .paginate({ cursor: memberCursor, numItems: 1 })
    if (memberPage.page.length === 0) {
      return {
        cursor: null,
        nextPhase: 'complete' as const,
        stagedCount,
      }
    }
    const member = memberPage.page[0]
    memberId = member._id
    memberCursor = memberPage.continueCursor
    const memberDone = memberPage.isDone
    channelCursor = null
    threadCursor = null
    await ensureStagingEntitlement(ctx, input, participation, memberId)
    return {
      cursor: encodeCursor({ phase: 'threads', memberCursor, memberId, memberDone, channelCursor, threadCursor }),
      nextPhase: 'threads' as const,
      stagedCount,
    }
  }
  if (channelCursor !== undefined) {
    const visibility = await stageChannelVisibilityPage(ctx, input, memberId, channelCursor)
    stagedCount += visibility.stagedCount
    return {
      cursor: visibility.done
        ? encodeCursor({ phase: 'threads', memberCursor, memberId, memberDone: cursor.memberDone, threadCursor: null })
        : encodeCursor({
            phase: 'threads',
            memberCursor,
            memberId,
            memberDone: cursor.memberDone,
            channelCursor: visibility.cursor,
            threadCursor: null,
          }),
      nextPhase: 'threads' as const,
      stagedCount,
    }
  }
  const threads = await ctx.db
    .query('channelThreads')
    .withIndex('by_project', (q) => q.eq('projectId', input.projectId))
    .paginate({ cursor: threadCursor, numItems: threadBatchSize })
  for (const thread of threads.page) {
    if (thread.createdAt > input.cutoff) continue
    const membership = await ctx.db
      .query('groupMembers')
      .withIndex('by_group_project_member', (q) =>
        q.eq('groupId', thread.groupId).eq('projectMemberId', memberId),
      )
      .unique()
    if (!membership || membership.status !== 'active') continue
    const [sourceMessage, follower, readState] = await Promise.all([
      thread.sourceMessageId ? ctx.db.get(thread.sourceMessageId) : null,
      ctx.db
        .query('channelThreadFollowers')
        .withIndex('by_thread_project_member', (q) =>
          q.eq('channelThreadId', thread._id).eq('projectMemberId', memberId),
        )
        .unique(),
      ctx.db
        .query('channelThreadReadStates')
        .withIndex('by_thread_project_member', (q) =>
          q.eq('channelThreadId', thread._id).eq('projectMemberId', memberId),
        )
        .unique(),
    ])
    const payload = {
      kind: 'thread' as const,
      snapshot: {
        _id: thread._id,
        createdAt: thread.createdAt,
        groupId: thread.groupId,
        name: thread.name,
        status: thread.status,
        revision: thread.revision,
        sourceAvailable: Boolean(sourceMessage && sourceMessage.createdAt <= input.cutoff),
        following: follower?.preference === 'following',
        lastReadChannelSequence: readState?.lastReadChannelSequence ?? 0,
        replyCount: thread.replyCount,
        latestReplyAt: thread.latestReplyAt,
        latestChannelSequence: thread.latestChannelSequence,
      },
    }
    if (await insertSnapshotRow(ctx, input, {
      scope: 'thread',
      sourceId: String(thread._id),
      projectMemberId: memberId,
      threadId: thread._id,
      payload,
    })) stagedCount += 1
  }
  if (!threads.isDone) {
    return {
      cursor: encodeCursor({ phase: 'threads', memberCursor, memberId, memberDone: cursor.memberDone, threadCursor: threads.continueCursor }),
      nextPhase: 'threads' as const,
      stagedCount,
    }
  }
  if (cursor.memberDone) {
    return {
      cursor: null,
      nextPhase: 'complete' as const,
      stagedCount,
    }
  }
  return {
    cursor: encodeCursor({ phase: 'threads', memberCursor, threadCursor: null }),
    nextPhase: 'threads' as const,
    stagedCount,
  }
}

export async function captureExitBatch(
  ctx: MutationCtx,
  input: OperationInput & { cursor?: string | null },
) {
  const participation = await ctx.db.get(input.projectCompanyId)
  if (!participation || participation.projectId !== input.projectId) {
    throw new Error('project_participation_unavailable')
  }
  const cursor = decodeExitCaptureCursor(input.cursor)
  switch (cursor.phase) {
    case 'members': {
      const result = await captureMembers(ctx, input, cursor.cursor)
      return { ...result, phase: result.nextPhase, cursor: result.cursor }
    }
    case 'channels': {
      const result = await captureChannels(ctx, input, cursor.cursor)
      return { ...result, phase: result.nextPhase, cursor: result.cursor }
    }
    case 'threads': {
      const result = await captureThreads(ctx, input, participation, cursor)
      return {
        phase: result.nextPhase,
        cursor: result.cursor,
        stagedCount: result.stagedCount,
      }
    }
  }
  throw new Error('snapshot_capture_cursor_invalid')
}
