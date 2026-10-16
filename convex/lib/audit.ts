import type { Id } from '../_generated/dataModel'
import type { MutationCtx } from '../_generated/server'
export async function appendAuditEvent(
  ctx: MutationCtx,
  input: {
    projectId?: Id<'projects'>
    groupId?: Id<'groups'>
    actorId?: Id<'users'>
    actorProjectMemberId?: Id<'projectMembers'>
    entityType: string
    entityId: string
    action: string
    before?: unknown
    after?: unknown
    correlationId?: string
  },
) {
  await ctx.db.insert('auditEvents', {
    ...input,
    createdAt: Date.now(),
  })
}
