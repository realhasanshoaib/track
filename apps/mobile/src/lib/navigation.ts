export function projectChannelsHref(projectId: string) { return { pathname: '/groups' as const, params: { projectId } } }
export function channelHref(projectId: string, groupId: string) { return { pathname: '/conversation' as const, params: { projectId, groupId } } }
export function navigationUnavailableCopy() { return 'You no longer have access. Choose another conversation.' }
