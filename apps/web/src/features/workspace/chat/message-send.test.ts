import { describe, expect, it } from 'vitest'

import { resolveMentionedUserIds } from './message-send'

describe('workspace message send helpers', () => {
  it('resolves mention handles to member user ids only', () => {
    expect(
      resolveMentionedUserIds(
        ['unknown', 'general', 'hasan'],
        [
          { kind: 'group', handle: 'general' },
          { id: 'user-1', kind: 'member', handle: 'hasan' },
        ],
      ),
    ).toEqual(['user-1'])
  })
})
