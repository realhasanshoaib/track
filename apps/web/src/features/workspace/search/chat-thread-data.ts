import type { GroupMessageItem } from '#/features/workspace/thread-items'

export type WorkspaceThreadItem = {
  at: number
  item: GroupMessageItem
  kind: 'message'
  key: string
}

export function buildWorkspaceThreadItems({ messages }: {
  messages: Array<GroupMessageItem>
}): Array<WorkspaceThreadItem> {
  const items = messages.map((item) => ({
    at: item.message.createdAt,
    item,
    kind: 'message' as const,
    key: item.message._id,
  }))
  // eslint-disable-next-line unicorn/no-array-sort -- reason: Sort the fresh array while supporting the web ES2022 target.
  items.sort((a, b) => a.at - b.at)
  return items
}
