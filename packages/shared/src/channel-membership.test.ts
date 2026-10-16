import { describe, expect, it } from 'vitest'
import { isActiveChannelMembership } from './channel-membership'
describe('group membership', () => {
  it('rejects removed and ended memberships', () => {
    expect(isActiveChannelMembership({ status: 'active' })).toBe(true)
    expect(isActiveChannelMembership({ status: 'removed' })).toBe(false)
    expect(isActiveChannelMembership({ status: 'active', endedAt: 1 })).toBe(false)
  })
})
