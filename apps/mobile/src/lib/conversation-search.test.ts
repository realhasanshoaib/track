import { describe, expect, it } from 'vitest'

import { channelSearchMessages, hasChannelMessageMatches } from './conversation-search'

describe('Chats message search', () => {
  it('keeps channel messages while excluding thread replies', () => {
    const messages = [
      { id: 'channel-message', threadId: undefined },
      { id: 'thread-message', threadId: 'thread' },
    ]
    expect(channelSearchMessages(messages)).toEqual([{ id: 'channel-message', threadId: undefined }])
    expect(hasChannelMessageMatches(messages)).toBe(true)
  })

  it('does not treat Channel-only or thread-only search results as a message match', () => {
    expect(hasChannelMessageMatches([])).toBe(false)
    expect(hasChannelMessageMatches([{ threadId: 'thread' }])).toBe(false)
  })
})
