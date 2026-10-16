import type { Id } from '../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../_generated/server'
import { assertActorMatches, requireAuthenticatedActor } from './actorContext'
import { requireGroupMember, requireProjectManager, requireProjectMember } from './permissions'

type RequiredCapability =
  | 'readProject'
  | 'writeProject'
  | 'manageProject'
  | 'readChannel'
  | 'writeChannel'
  | 'stewardChannel'
export async function authorizeScopedRequest(
  ctx: QueryCtx | MutationCtx,
  input: {
    projectId: Id<'projects'>
    claimedUserId: Id<'users'>
    groupId?: Id<'groups'>
    projectMemberId?: Id<'projectMembers'>
  },
  required: RequiredCapability,
) {
  const actor = await requireAuthenticatedActor(ctx)
  assertActorMatches(actor, input.claimedUserId)
  const project = await ctx.db.get(input.projectId)
  if (!project) throw new Error('project_unavailable')
  const projectMember =
    required === 'manageProject' || required === 'stewardChannel'
      ? await requireProjectManager(ctx, project._id, actor.userId)
      : await requireProjectMember(ctx, project._id, actor.userId)
  if (input.groupId) {
    const group = await ctx.db.get(input.groupId)
    if (!group || group.projectId !== project._id) throw new Error('group_project_mismatch')
    await requireGroupMember(ctx, input.groupId, actor.userId)
    if (
      (required === 'writeChannel' || required === 'stewardChannel') &&
      group.status === 'archived'
    )
      throw new Error('group_archived')
  }
  if (input.projectMemberId && input.projectMemberId !== projectMember._id)
    throw new Error('actor_context_mismatch')
  return { actor, project, projectMember }
}
