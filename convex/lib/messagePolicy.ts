import type { Doc, Id } from '../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../_generated/server'

type MessagePolicyCtx = QueryCtx | MutationCtx

export async function resolveActorProjectMember(
  ctx: MessagePolicyCtx,
  projectId: Id<'projects'>,
  userId: Id<'users'>,
  companyProjectMember?: Doc<'projectMembers'>,
) {
  if (companyProjectMember) return companyProjectMember
  const projectMember = await ctx.db
    .query('projectMembers')
    .withIndex('by_project_user', (q) =>
      q.eq('projectId', projectId).eq('userId', userId),
    )
    .unique()
  if (!projectMember || (projectMember.status && projectMember.status !== 'active')) {
    throw new Error('project_membership_unavailable')
  }
  return projectMember
}

export async function allocateChannelSequence(
  ctx: MutationCtx,
  group: Doc<'groups'>,
) {
  const latestMessage = group.nextChannelSequence === undefined
    ? await ctx.db
        .query('messages')
        .withIndex('by_group_channel_sequence', (q) => q.eq('groupId', group._id))
        .order('desc')
        .first()
    : null
  const nextSequence = (group.nextChannelSequence ?? latestMessage?.channelSequence ?? 0) + 1
  await ctx.db.patch(group._id, { nextChannelSequence: nextSequence })
  return nextSequence
}

export async function assertReplyScope(
  ctx: MessagePolicyCtx,
  replyToMessageId: Id<'messages'> | undefined,
  input: {
    projectId: Id<'projects'>
    groupId: Id<'groups'>
  },
) {
  if (!replyToMessageId) return
  const replyToMessage = await ctx.db.get(replyToMessageId)
  if (
    !replyToMessage ||
    replyToMessage.projectId !== input.projectId ||
    replyToMessage.groupId !== input.groupId
  ) {
    throw new Error('reply_scope_mismatch')
  }
}
