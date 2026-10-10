import { describe, expect, it } from 'vitest'

import { mergeConversationActivity } from './conversation-activity'

describe('combined Chats activity', () => {
  it('keeps Channels and Threads together in most-recent activity order', () => {
    const rows = mergeConversationActivity(
      [
        { activityAt: 10, item: 'channel-old' },
        { activityAt: 30, item: 'channel-new' },
      ],
      [
        { activityAt: 20, item: 'thread-middle' },
        { activityAt: 40, item: 'thread-new' },
      ],
    )

    expect(rows).toEqual([
      { activityAt: 40, item: 'thread-new', type: 'thread' },
      { activityAt: 30, item: 'channel-new', type: 'channel' },
      { activityAt: 20, item: 'thread-middle', type: 'thread' },
      { activityAt: 10, item: 'channel-old', type: 'channel' },
    ])
  })
})
