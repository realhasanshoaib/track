import { internal } from '../_generated/api'
import type { Doc, Id } from '../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../_generated/server'

type SnapshotLockCtx = QueryCtx | MutationCtx

export type ProjectSnapshotState = Doc<'projectExitOperations'>

/**
 * Capture is a short-lived write freeze. It prevents a later batch from
 * observing a mutable row that existed at the cutoff but changed before its
 * cursor reached it. Verified and cancelled operations deliberately do not
 * hold the lock.
 */
export async function readProjectSnapshotState(
  ctx: SnapshotLockCtx,
  projectId: Id<'projects'>,
) {
  const [capturing, failed] = await Promise.all([
    ctx.db
      .query('projectExitOperations')
      .withIndex('by_project_status', (q) =>
        q.eq('projectId', projectId).eq('status', 'capturing'),
      )
      .first(),
    ctx.db
      .query('projectExitOperations')
      .withIndex('by_project_status', (q) =>
        q.eq('projectId', projectId).eq('status', 'failed'),
      )
      .first(),
  ])
  return capturing ?? failed ?? null
}

export async function assertProjectSnapshotWritable(
  ctx: SnapshotLockCtx,
  projectId: Id<'projects'>,
) {
  const state = await readProjectSnapshotState(ctx, projectId)
  if (state) throw new Error('project_snapshot_in_progress')
}


export async function cancelProjectSnapshotForSourceRemoval(
  ctx: MutationCtx,
  projectId: Id<'projects'>,
) {
  const [capturing, failed] = await Promise.all([
    ctx.db
      .query('projectExitOperations')
      .withIndex('by_project_status', (q) =>
        q.eq('projectId', projectId).eq('status', 'capturing'),
      )
      .collect(),
    ctx.db
      .query('projectExitOperations')
      .withIndex('by_project_status', (q) =>
        q.eq('projectId', projectId).eq('status', 'failed'),
      )
      .collect(),
  ])
  const operations = [...capturing, ...failed]
  for (const operation of operations) {
    // Finalization only publishes already-captured data; do not undo partial membership cleanup.
    if (operation.phase === 'complete') continue
    const participation = await ctx.db.get(operation.projectCompanyId)
    if (!participation || participation.status !== 'exit_pending') continue
    const now = Date.now()
    await ctx.db.patch(operation._id, {
      status: 'cancelled',
      phase: 'complete',
      updatedAt: now,
    })
    await ctx.db.patch(participation._id, {
      status: 'active',
      exitSnapshotStatus: 'cancelled',
      exitSnapshotPhase: 'complete',
      exitSnapshotError: 'source_removed_during_capture',
      updatedAt: now,
    })
    await ctx.scheduler.runAfter(0, internal.projectExit.cleanupCapture, {
      projectCompanyId: participation._id,
      operationId: operation.operationId,
      cursor: undefined,
    })
  }
}
