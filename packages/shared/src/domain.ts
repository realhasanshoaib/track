export const notificationModes = ['all', 'mentions', 'none'] as const
export type NotificationMode = (typeof notificationModes)[number]

export const groupNotificationModes = ['inherit', ...notificationModes] as const
export type GroupNotificationMode = (typeof groupNotificationModes)[number]

export function groupPairKey(first: string, second: string) {
  return JSON.stringify([first, second].sort())
}

export function parseMentions(body: string) {
  return Array.from(
    new Set(
      body
        .match(/@[a-z0-9._-]+/gi)
        ?.map((mention) => mention.slice(1).toLowerCase()) ?? [],
    ),
  )
}

export function shouldNotifyForMessage(input: {
  globalMode: NotificationMode
  groupMode: GroupNotificationMode
  mentioned: boolean
}) {
  const mode = input.groupMode === 'inherit' ? input.globalMode : input.groupMode
  if (mode === 'none') return false
  if (mode === 'all') return true
  return input.mentioned
}
