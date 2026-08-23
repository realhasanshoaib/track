import { resolveProjectAccessProfile } from '@track/shared/feature-flags'
import type { Id } from '../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../_generated/server'

import { assertActorMatches, requireAuthenticatedActor } from './actorContext'
import { resolveCompanyProjectAccess } from './companyPolicy'
import { requireGroupMember, requireProjectManager, requireProjectMember } from './permissions'

type RequestCtx = QueryCtx | MutationCtx
type RequiredCapability = 'readProject' | 'writeProject' | 'manageProject' | 'readChannel' | 'writeChannel' | 'stewardChannel'

export type ScopedRequest = {
  projectId: Id<'projects'>
  claimedUserId: Id<'users'>
  groupId?: Id<'groups'>
  actingCompanyId?: Id<'companies'>
  projectMemberId?: Id<'projectMembers'>
}

export async function authorizeScopedRequest(
  ctx: RequestCtx,
  input: ScopedRequest,
  required: RequiredCapability,
) {
  const actor = await requireAuthenticatedActor(ctx)
  assertActorMatches(actor, input.claimedUserId)
  const project = await ctx.db.get(input.projectId)
  if (!project) throw new Error('project_unavailable')

  const channelCapability = required === 'readChannel' || required === 'writeChannel' || required === 'stewardChannel'
  if (channelCapability) {
    const group = input.groupId ? await ctx.db.get(input.groupId) : null
    if (!group || group.projectId !== project._id) throw new Error('channel_unavailable')
  }

  if (resolveProjectAccessProfile(project.accessProfile) === 'legacy') {
    if (required === 'manageProject' || required === 'stewardChannel') {
      await requireProjectManager(ctx, project._id, actor.userId)
    } else {
      await requireProjectMember(ctx, project._id, actor.userId)
    }
    if (input.groupId && channelCapability) {
      await requireGroupMember(ctx, input.groupId, actor.userId)
    }
    return { actor, project, companyAccess: null }
  }

  if (!input.actingCompanyId || !input.projectMemberId) throw new Error('actor_context_required')
  const companyAccess = await resolveCompanyProjectAccess(ctx, actor, {
    projectId: project._id,
    groupId: input.groupId,
    actingCompanyId: input.actingCompanyId,
    projectMemberId: input.projectMemberId,
  })
  const allowed = {
    readProject: companyAccess.capabilities.canReadProject,
    writeProject: companyAccess.capabilities.canWriteProject,
    manageProject: companyAccess.capabilities.canManageProject,
    readChannel: companyAccess.capabilities.canReadChannel,
    writeChannel: companyAccess.capabilities.canWriteChannel,
    stewardChannel: companyAccess.capabilities.canStewardChannel,
  }[required]
  if (!allowed) throw new Error(required.includes('Channel') ? 'channel_unavailable' : 'project_unavailable')
  return { actor, project, companyAccess }
}
