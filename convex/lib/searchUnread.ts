import type { Id } from '../_generated/dataModel'

export function isUnreadChannelMessage(input: {
  authorProjectMemberId?: Id<'projectMembers'>
  authorId: Id<'users'>
  createdAt: number
  lastReadAt: number
  projectMemberId: Id<'projectMembers'>
  userId: Id<'users'>
}) {
  const authoredByCurrentMember = input.authorProjectMemberId
    ? input.authorProjectMemberId === input.projectMemberId
    : input.authorId === input.userId
  return !authoredByCurrentMember && input.createdAt > input.lastReadAt
}

export function isUnreadThreadMessage(input: {
  authorProjectMemberId?: Id<'projectMembers'>
  authorId: Id<'users'>
  channelSequence?: number
  following: boolean
  lastReadChannelSequence: number
  projectMemberId: Id<'projectMembers'>
  userId: Id<'users'>
}) {
  const authoredByCurrentMember = input.authorProjectMemberId
    ? input.authorProjectMemberId === input.projectMemberId
    : input.authorId === input.userId
  return input.following
    && !authoredByCurrentMember
    && (input.channelSequence ?? 0) > input.lastReadChannelSequence
}

export function isUnreadThread(input: {
  following: boolean
  latestChannelSequence: number
  lastReadChannelSequence: number
}) {
  return input.following && input.latestChannelSequence > input.lastReadChannelSequence
}
