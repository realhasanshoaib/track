import type { Doc, Id } from '../../../../../../convex/_generated/dataModel'
import { getGroupAvatar } from '#/features/workspace/group-avatar'
import { getAvatarTone, getMentionHandle } from '#/features/workspace/identity'

export type WorkspaceChannelMember = {
  membership: Doc<'groupMembers'>
  user: Doc<'users'>
}

export type WorkspaceProjectMember = {
  membership: Doc<'projectMembers'>
  user: Doc<'users'> | null
}

export type WorkspaceMentionOption =
  | {
      id: 'track'
      kind: 'assistant'
      label: string
      sublabel: string
      handle: string
      tone: string
    }
  | {
      id: Id<'groups'>
      kind: 'group'
      label: string
      sublabel: string
      handle: string
      tone: string
    }
  | {
      id: Id<'users'>
      kind: 'member'
      label: string
      sublabel: string
      handle: string
      tone: string
    }

export type WorkspaceMentionSection = {
  label: string
  options: Array<WorkspaceMentionOption>
}

export function buildWorkspaceMentionOptions(
  activeMembers: Array<WorkspaceChannelMember | WorkspaceProjectMember>,
  visibleGroups: Array<Doc<'groups'>>,
  labels?: {
    assistant: string
    channelMember: string
    group: string
    projectMemory: string
  },
): Array<WorkspaceMentionOption> {
  const members = activeMembers
    .filter((item) => item.user !== null)
    .map((item) => {
      const user = item.user as Doc<'users'>
      return {
        id: user._id,
        kind: 'member' as const,
        label: user.displayName,
        sublabel: 'role' in item.membership
          ? item.membership.role
          : labels?.channelMember ?? 'Channel member',
        handle: getMentionHandle(user.displayName) || getMentionHandle(user.email),
        tone: getAvatarTone(user.email),
      }
    })
  const reservedHandles = new Set(['track', ...members.map((member) => member.handle)])
  const groupMentions = visibleGroups
    .map((group) => ({
      id: group._id,
      kind: 'group' as const,
      label: group.name,
      sublabel: labels?.group ?? 'group',
      handle: getMentionHandle(group.name),
      tone: getGroupAvatar(group).tone,
    }))
    .filter((group) => group.handle && !reservedHandles.has(group.handle))

  return [
    {
      id: 'track',
      kind: 'assistant',
      label: labels?.assistant ?? 'Track Assistant',
      sublabel: labels?.projectMemory ?? 'project memory',
      handle: 'track',
      tone: 'bot',
    },
    ...groupMentions,
    ...members,
  ]
}

export function buildMentionGroups(
  activeChannelMembers: Array<WorkspaceChannelMember>,
  visibleGroups: Array<Doc<'groups'>>,
) {
  const groupsByHandle = new Map<string, Doc<'groups'>>()
  const reservedHandles = new Set([
    'track',
    ...activeChannelMembers
      .map((item) => {
        const user = item.user
        return getMentionHandle(user.displayName) || getMentionHandle(user.email)
      }),
  ])
  for (const group of visibleGroups) {
    const handle = getMentionHandle(group.name)
    if (handle && !reservedHandles.has(handle)) groupsByHandle.set(handle, group)
  }
  return groupsByHandle
}

export function filterMentionOptions(
  mentionOptions: Array<WorkspaceMentionOption>,
  query: string,
) {
  const matchesQuery = (option: WorkspaceMentionOption) =>
    option.handle.includes(query) ||
    option.label.toLowerCase().includes(query) ||
    option.sublabel.toLowerCase().includes(query)
  const assistantOptions = mentionOptions
    .filter((option) => option.kind === 'assistant')
    .filter(matchesQuery)
  const groupOptions = mentionOptions
    .filter((option) => option.kind === 'group')
    .filter(matchesQuery)
    .slice(0, 4)
  const memberOptions = mentionOptions
    .filter((option) => option.kind === 'member')
    .filter(matchesQuery)
    .slice(0, 4)
  return [...assistantOptions, ...groupOptions, ...memberOptions].slice(0, 9)
}

export function buildMentionSections(
  mentionOptions: Array<WorkspaceMentionOption>,
  labels: { groups: string; people: string; assistant: string } = {
    assistant: 'Assistant',
    groups: 'Groups',
    people: 'People',
  },
): Array<WorkspaceMentionSection> {
  return [
    {
      label: labels.groups,
      options: mentionOptions.filter((option) => option.kind === 'group'),
    },
    {
      label: labels.people,
      options: mentionOptions.filter((option) => option.kind === 'member'),
    },
    {
      label: labels.assistant,
      options: mentionOptions.filter((option) => option.kind === 'assistant'),
    },
  ].filter((section) => section.options.length > 0)
}

export function buildComposerPlaceholder({
  activeGroupName,
  activeChannelMembers,
  currentUserId,
  labels,
}: {
  activeGroupName: string | undefined
  activeChannelMembers: Array<WorkspaceChannelMember>
  currentUserId: Id<'users'> | null
  labels?: {
    formatCount?: (count: number) => string
    thisChannel: string
    message: (destination: string) => string
    writeTo: (people: string, destination: string) => string
  }
}) {
  const composerPeople = activeChannelMembers
    .filter((item) => item.user._id !== currentUserId)
    .map((item) => item.user.displayName.trim().split(/\s+/)[0])
    .filter(Boolean)
  const destination = activeGroupName ?? labels?.thisChannel ?? 'this Channel'
  if (composerPeople.length === 0) return labels?.message(destination) ?? `Message ${destination} or ask @track...`

  const visiblePeople = composerPeople.slice(0, 2)
  let participantCopy = visiblePeople[0]
  if (composerPeople.length === 2) participantCopy = visiblePeople.join(' and ')
  if (composerPeople.length > 2) {
    const remainingCount = composerPeople.length - visiblePeople.length
    participantCopy = `${visiblePeople.join(', ')}, and ${labels?.formatCount?.(remainingCount) ?? remainingCount} other${remainingCount === 1 ? '' : 's'}`
  }
  return labels?.writeTo(participantCopy, destination) ?? `Write to ${participantCopy} in ${destination} or ask @track...`
}
