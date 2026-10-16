import { isActiveChannelMembership } from '@track/shared/channel-membership'
import type { Id } from '../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../_generated/server'
export async function listActiveChannelMemberships(
  ctx: QueryCtx | MutationCtx,
  groupId: Id<'groups'>,
) {
  const memberships = await ctx.db
    .query('groupMembers')
    .withIndex('by_group', (query) => query.eq('groupId', groupId))
    .collect()
  return memberships.filter((membership) => isActiveChannelMembership(membership))
}
