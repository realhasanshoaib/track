import type { Id } from '../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../_generated/server'
import { assertActorMatches, requireAuthenticatedActor } from './actorContext'
import { requireGroupMember } from './permissions'
export async function authorizeGroupRequest(
  ctx: QueryCtx | MutationCtx,
  input: { groupId: Id<'groups'>; claimedUserId: Id<'users'> },
  capability: 'readChannel' | 'writeChannel' = 'readChannel',
) {
  const actor = await requireAuthenticatedActor(ctx)
  assertActorMatches(actor, input.claimedUserId)
  const membership = await requireGroupMember(ctx, input.groupId, actor.userId)
  const group = await ctx.db.get(input.groupId)
  if (!group) throw new Error('group_not_found')
  if (capability === 'writeChannel' && group.status === 'archived') throw new Error('group_archived')
  return { actor, group, membership }
}
