import type { Doc, Id } from '../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../_generated/server'

type ArchiveReadCtx = QueryCtx | MutationCtx

export type ArchivedMemberSnapshot = {
  membership: {
    _id: Id<'projectMembers'>
    companyId?: Id<'companies'>
    role: 'manager' | 'member'
    status?: 'active' | 'suspended' | 'removed' | 'archived'
    userId: Id<'users'>
    userDisplayNameSnapshot?: string
    companyDisplayNameSnapshot?: string
  }
  user: {
    _id: Id<'users'>
    displayName: string
  }
  company?: {
    _id: Id<'companies'>
    displayName: string
  }
}

export type ArchivedChannelSnapshot = {
  _id: Id<'groups'>
  createdAt: number
  kind: string
  name: string
  status?: string
}

type SnapshotRow = Doc<'projectExitSnapshotStaging'>

async function isVerified(
  ctx: ArchiveReadCtx,
  operationId: string,
) {
  const operation = await ctx.db
    .query('projectExitOperations')
    .withIndex('by_operation_status', (q) =>
      q.eq('operationId', operationId).eq('status', 'verified'),
    )
    .first()
  return operation !== null
}

export async function hasArchivedChannelVisibility(
  ctx: ArchiveReadCtx,
  input: {
    operationId: string
    projectMemberId: Id<'projectMembers'>
    groupId: Id<'groups'>
  },
) {
  if (!(await isVerified(ctx, input.operationId))) return false
  const row = await ctx.db
    .query('projectExitChannelVisibility')
    .withIndex('by_operation_member', (q) =>
      q
        .eq('operationId', input.operationId)
        .eq('projectMemberId', input.projectMemberId)
        .eq('groupId', input.groupId),
    )
    .unique()
  return row !== null
}

export async function listArchivedChannelVisibilityPage(
  ctx: ArchiveReadCtx,
  input: {
    operationId: string
    projectMemberId: Id<'projectMembers'>
    cursor: string | null
    numItems: number
  },
) {
  if (!(await isVerified(ctx, input.operationId))) {
    return { page: [], isDone: true, continueCursor: '' }
  }
  return await ctx.db
    .query('projectExitChannelVisibility')
    .withIndex('by_operation_member', (q) =>
      q
        .eq('operationId', input.operationId)
        .eq('projectMemberId', input.projectMemberId),
    )
    .paginate({ cursor: input.cursor, numItems: input.numItems })
}

function memberSnapshotFromRow(row: SnapshotRow) {
  return row.payload.kind === 'member' ? row.payload.snapshot : null
}

function channelSnapshotFromRow(row: SnapshotRow) {
  return row.payload.kind === 'channel' ? row.payload.snapshot : null
}

export async function getArchivedMemberSnapshot(
  ctx: ArchiveReadCtx,
  operationId: string,
  projectMemberId: Id<'projectMembers'>,
) {
  if (!(await isVerified(ctx, operationId))) return null
  const row = await ctx.db
    .query('projectExitSnapshotStaging')
    .withIndex('by_operation_member_scope', (q) =>
      q
        .eq('operationId', operationId)
        .eq('projectMemberId', projectMemberId)
        .eq('scope', 'member'),
    )
    .first()
  return row ? memberSnapshotFromRow(row) : null
}

export async function getArchivedChannelSnapshot(
  ctx: ArchiveReadCtx,
  operationId: string,
  groupId: Id<'groups'>,
) {
  if (!(await isVerified(ctx, operationId))) return null
  const row = await ctx.db
    .query('projectExitSnapshotStaging')
    .withIndex('by_operation_scope', (q) =>
      q
        .eq('operationId', operationId)
        .eq('scope', 'channel')
        .eq('sourceId', String(groupId)),
    )
    .first()
  return row ? channelSnapshotFromRow(row) : null
}

export async function listArchivedMemberSnapshotsPage(
  ctx: ArchiveReadCtx,
  input: {
    operationId: string
    cursor: string | null
    numItems: number
  },
) {
  if (!(await isVerified(ctx, input.operationId))) {
    return { page: [], isDone: true, continueCursor: '' }
  }
  const result = await ctx.db
    .query('projectExitSnapshotStaging')
    .withIndex('by_operation_scope', (q) =>
      q.eq('operationId', input.operationId).eq('scope', 'member'),
    )
    .paginate({ cursor: input.cursor, numItems: input.numItems })
  return {
    ...result,
    page: result.page.flatMap((row) => {
      const snapshot = memberSnapshotFromRow(row)
      return snapshot ? [snapshot] : []
    }),
  }
}

export async function listArchivedChannelSnapshotsPage(
  ctx: ArchiveReadCtx,
  input: {
    operationId: string
    cursor: string | null
    numItems: number
  },
) {
  if (!(await isVerified(ctx, input.operationId))) {
    return { page: [], isDone: true, continueCursor: '' }
  }
  const result = await ctx.db
    .query('projectExitSnapshotStaging')
    .withIndex('by_operation_scope', (q) =>
      q.eq('operationId', input.operationId).eq('scope', 'channel'),
    )
    .paginate({ cursor: input.cursor, numItems: input.numItems })
  return {
    ...result,
    page: result.page.flatMap((row) => {
      const snapshot = channelSnapshotFromRow(row)
      return snapshot ? [snapshot] : []
    }),
  }
}
