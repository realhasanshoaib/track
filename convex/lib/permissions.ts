import type { Id } from '../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../_generated/server'
export async function requireGroupMember(ctx: MutationCtx | QueryCtx, groupId: Id<'groups'>, userId: Id<'users'>) {
  const membership = await ctx.db.query('groupMembers')
    .withIndex('by_group_user', q => q.eq('groupId', groupId).eq('userId', userId)).unique()
  if (!membership || membership.status !== 'active') throw new Error('not_group_member')
  return membership
}
