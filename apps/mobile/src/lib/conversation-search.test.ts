import { describe, expect, it } from 'vitest'

import { hasConversationMatches } from './conversation-search'

describe('conversation search empty-state matching', () => {
  it('counts only channels and channel messages for the Channels filter', () => {
    expect(hasConversationMatches({ groups: [], messages: [{ threadId: 'thread' }], threads: [] }, 'channels')).toBe(false)
    expect(hasConversationMatches({ groups: [], messages: [{ threadId: undefined }], threads: [] }, 'channels')).toBe(true)
    expect(hasConversationMatches({ groups: [{}], messages: [], threads: [{}] }, 'channels')).toBe(true)
  })

  it('counts only threads and thread messages for the Threads filter', () => {
    expect(hasConversationMatches({ groups: [{}], messages: [{ threadId: undefined }], threads: [] }, 'threads')).toBe(false)
    expect(hasConversationMatches({ groups: [], messages: [{ threadId: 'thread' }], threads: [] }, 'threads')).toBe(true)
    expect(hasConversationMatches({ groups: [], messages: [], threads: [{}] }, 'threads')).toBe(true)
  })

  it('counts every conversation result for All and Unread filters', () => {
    for (const filter of ['all', 'unread'] as const) {
      expect(hasConversationMatches({ groups: [], messages: [{ threadId: undefined }], threads: [] }, filter)).toBe(true)
      expect(hasConversationMatches({ groups: [], messages: [], threads: [{}] }, filter)).toBe(true)
    }
  })
})
