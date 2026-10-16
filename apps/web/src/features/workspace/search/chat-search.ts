import type { Id } from '../../../../../../convex/_generated/dataModel'
import type { GroupMessageItem } from '#/features/workspace/thread-items'

export type ChatThreadItem =
  | {
      at: number
      item: GroupMessageItem
      kind: 'message'
      key: string
    }
  | {
      at: number
      draft: {
        title: string
        description: string
      }
      kind: 'draft'
      key: string
    }

export type ChatSearchMatch = {
  key: string
  kind: 'draft' | 'message'
  messageId?: Id<'messages'>
}

export function buildChatSearchMatches(
  threadItems: Array<ChatThreadItem>,
  searchTerm: string,
): Array<ChatSearchMatch> {
  const query = searchTerm.trim().toLowerCase()
  if (!query) return []

  const matches: Array<ChatSearchMatch> = []
  for (const threadItem of threadItems) {
    if (threadItem.kind === 'message') {
      const body = threadItem.item.message.body.toLowerCase()
      const author = threadItem.item.author?.displayName.toLowerCase() ?? ''
      if (body.includes(query) || author.includes(query)) {
        matches.push({
          key: threadItem.key,
          kind: threadItem.kind,
          messageId: threadItem.item.message._id,
        })
      }
      continue
    }
    const draftText = `${threadItem.draft.title} ${threadItem.draft.description}`.toLowerCase()
    if (draftText.includes(query)) {
      matches.push({ key: threadItem.key, kind: threadItem.kind })
    }
  }

  return matches
}
