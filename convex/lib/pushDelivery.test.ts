import { describe, expect, it } from 'vitest'

import { messagePushCopy, safePushLabel } from './pushDelivery'

describe('privacy-safe push delivery helpers', () => {
  it('keeps message previews scoped to the selected privacy mode', () => {
    const messageCases = [
      {
        input: {
          eventKind: 'mention' as const,
          senderName: 'Bilal',
          groupName: '#launch-readiness',
          messagePreview: 'The rollout is ready.',
          previewMode: 'context' as const,
        },
        expected: { title: 'Track', body: 'Bilal mentioned you in #launch-readiness' },
      },
      {
        input: {
          eventKind: 'message' as const,
          senderName: 'Bilal',
          groupName: '#launch',
          messagePreview: 'Sensitive plan',
          previewMode: 'hidden' as const,
        },
        expected: { title: 'Track', body: 'New conversation activity' },
      },
      {
        input: {
          eventKind: 'message' as const,
          senderName: 'Bilal',
          groupName: '#launch',
          messagePreview: ' Ship   the\nrelease tonight. ',
          previewMode: 'full' as const,
        },
        expected: { title: 'Bilal · #launch', body: 'Ship the release tonight.' },
      },
    ]
    for (const testCase of messageCases) {
      expect(messagePushCopy(testCase.input)).toEqual(testCase.expected)
    }

    expect(safePushLabel(' Launch\n readiness ', 'Channel')).toBe('Launch readiness')
  })
})
