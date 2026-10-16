import { describe, expect, it } from 'vitest'

import { resolvePushHref } from './push-routing'

describe('mobile push routing', () => {
  it('accepts safe internal URLs and rejects external URL schemes', () => {
    expect(
      resolvePushHref({ url: 'https://evil.example/conversation?projectId=p&groupId=g' }),
    ).toBeNull()
    expect(resolvePushHref({ url: '//evil.example/conversation?projectId=p&groupId=g' })).toBeNull()
  })
})
