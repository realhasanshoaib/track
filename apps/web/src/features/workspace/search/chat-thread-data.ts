import type { Doc } from '../../../../../../convex/_generated/dataModel'
import type { GroupMessageItem, MessageCitationPreview } from '#/features/workspace/thread-items'

export type WorkspaceThreadItem =
  | {
      at: number
      item: GroupMessageItem
      kind: 'message'
      key: string
    }
  | {
      at: number
      stream: Doc<'assistantStreams'>
      kind: 'assistant'
      key: string
    }

export function buildWorkspaceThreadItems({
  assistantStreams,
  messages,
}: {
  assistantStreams: Array<Doc<'assistantStreams'>>
  messages: Array<GroupMessageItem>
}): Array<WorkspaceThreadItem> {
  return [
    ...messages.map((item) => ({
      at: item.message.createdAt,
      item,
      kind: 'message' as const,
      key: item.message._id,
    })),
    ...assistantStreams.map((stream) => ({
      at: stream.createdAt,
      stream,
      kind: 'assistant' as const,
      key: stream._id,
    })),
  ].sort((a, b) => a.at - b.at)
}

export function buildMessageCitations(
  messages: Array<GroupMessageItem>,
  labels: { unknownMember: string } = { unknownMember: 'Unknown Member' },
): Map<string, MessageCitationPreview> {
  return new Map(
    messages.map((item) => [
      String(item.message._id),
      {
        author: item.author?.displayName ?? labels.unknownMember,
        body: item.message.body.slice(0, 90),
        createdAt: item.message.createdAt,
        attachments: item.attachments.map(({ attachment }) => ({
          id: String(attachment._id),
          contentType: attachment.contentType,
          filename: attachment.filename,
          kind: attachment.kind,
          size: attachment.size,
        })),
      },
    ]),
  )
}
