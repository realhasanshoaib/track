import { describe, expect, it } from 'vitest'

import type { Id } from '../_generated/dataModel'
import { isUnreadChannelMessage, isUnreadThread, isUnreadThreadMessage } from './searchUnread'

const authorId = 'users:author' as Id<'users'>
const otherUserId = 'users:other' as Id<'users'>
const memberId = 'projectMembers:member' as Id<'projectMembers'>

describe('search unread state', () => {
  it('marks only matching channel messages after the member read cursor as unread', () => {
    expect(isUnreadChannelMessage({ authorId, createdAt: 30, lastReadAt: 20, projectMemberId: memberId, userId: otherUserId })).toBe(true)
    expect(isUnreadChannelMessage({ authorId, createdAt: 10, lastReadAt: 20, projectMemberId: memberId, userId: otherUserId })).toBe(false)
    expect(isUnreadChannelMessage({ authorId: otherUserId, createdAt: 30, lastReadAt: 20, projectMemberId: memberId, userId: otherUserId })).toBe(false)
  })

  it('requires a followed thread and an unread message sequence', () => {
    const base = { authorId, channelSequence: 8, lastReadChannelSequence: 7, projectMemberId: memberId, userId: otherUserId }
    expect(isUnreadThreadMessage({ ...base, following: true })).toBe(true)
    expect(isUnreadThreadMessage({ ...base, following: false })).toBe(false)
    expect(isUnreadThreadMessage({ ...base, following: true, channelSequence: 7 })).toBe(false)
    expect(isUnreadThreadMessage({ ...base, following: true, authorProjectMemberId: memberId })).toBe(false)
  })

  it('marks a thread row unread only when its followed cursor trails its latest sequence', () => {
    expect(isUnreadThread({ following: true, latestChannelSequence: 12, lastReadChannelSequence: 11 })).toBe(true)
    expect(isUnreadThread({ following: false, latestChannelSequence: 12, lastReadChannelSequence: 11 })).toBe(false)
    expect(isUnreadThread({ following: true, latestChannelSequence: 11, lastReadChannelSequence: 11 })).toBe(false)
  })
})
