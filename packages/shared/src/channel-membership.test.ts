import { describe, expect, it } from 'vitest'
import { isActiveChannelMembership } from './channel-membership'
describe('group membership', () => {
  it('rejects former memberships', () => {
    expect(isActiveChannelMembership({ status: 'active' })).toBe(true)
    expect(isActiveChannelMembership({ status: 'removed' })).toBe(false)
  })
})
