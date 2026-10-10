export type ConversationActivityItem<TChannel, TThread> =
  | { activityAt: number; item: TChannel; type: 'channel' }
  | { activityAt: number; item: TThread; type: 'thread' }

export function mergeConversationActivity<TChannel, TThread>(
  channels: readonly { activityAt: number; item: TChannel }[],
  threads: readonly { activityAt: number; item: TThread }[],
): ConversationActivityItem<TChannel, TThread>[] {
  return [
    ...channels.map(({ activityAt, item }) => ({ activityAt, item, type: 'channel' as const })),
    ...threads.map(({ activityAt, item }) => ({ activityAt, item, type: 'thread' as const })),
  ].sort((left, right) => right.activityAt - left.activityAt)
}
