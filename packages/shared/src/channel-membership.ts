export type ChannelMembershipState = {
  endedAt?: number
  status?: 'active' | 'removed'
}
export function isActiveChannelMembership(membership: ChannelMembershipState) {
  return (
    membership.endedAt === undefined &&
    (membership.status === undefined || membership.status === 'active')
  )
}
