import type { CompanyProjectRole } from './company'
import type { ProjectRole as LegacyProjectRole } from './domain'
import type { ProjectAccessProfile } from './feature-flags'

export const projectAccessModes = ['active', 'archive'] as const
export type ProjectAccessMode = (typeof projectAccessModes)[number]

type PolicyScope = {
  accessMode: ProjectAccessMode
  channelMember: boolean
  channelActive?: boolean
  channelSteward?: boolean
}

export type ProjectChannelPolicyInput =
  | (PolicyScope & {
      accessProfile: 'legacy'
      projectRole: LegacyProjectRole
    })
  | (PolicyScope & {
      accessProfile: 'company'
      projectRole: CompanyProjectRole
    })

export type ProjectChannelCapabilities = Readonly<{
  accessProfile: ProjectAccessProfile
  accessMode: ProjectAccessMode
  canReadProject: boolean
  canWriteProject: boolean
  canManageProject: boolean
  canReadChannel: boolean
  canWriteChannel: boolean
  canStewardChannel: boolean
}>

export function resolveProjectChannelCapabilities(
  input: ProjectChannelPolicyInput,
): ProjectChannelCapabilities {
  const readOnly = input.accessMode === 'archive'
  const manager =
    input.accessProfile === 'legacy'
      ? input.projectRole === 'owner' || input.projectRole === 'admin'
      : input.projectRole === 'manager'
  const channelActive = input.channelActive ?? true
  const authorizedSteward =
    input.accessProfile === 'legacy' ? manager : manager && input.channelSteward === true

  return {
    accessProfile: input.accessProfile,
    accessMode: input.accessMode,
    canReadProject: true,
    canWriteProject: !readOnly,
    canManageProject: !readOnly && manager,
    canReadChannel: input.channelMember,
    canWriteChannel: !readOnly && input.channelMember && channelActive,
    canStewardChannel: !readOnly && input.channelMember && authorizedSteward,
  }
}
