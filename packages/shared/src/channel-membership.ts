export type ChannelMembershipState = { status: 'active' | 'removed' }
export function isActiveChannelMembership(membership: ChannelMembershipState) {
  return membership.status === 'active'
}
