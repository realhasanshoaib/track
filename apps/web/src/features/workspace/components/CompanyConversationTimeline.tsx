import { Hash } from 'lucide-react'
import { Fragment, useMemo } from 'react'
import { useQuery } from 'convex/react'

import { api } from '../../../../../../convex/_generated/api'
import type { Id } from '../../../../../../convex/_generated/dataModel'
import { useReleaseConfig } from '#/lib/release-config'
import {
  MessageRow,
  type GroupMessageItem,
} from '#/features/workspace/thread-items'
import { ThreadDaySeparator } from '#/features/workspace/components/ThreadDaySeparator'
import type { ScopedComposerContext } from '#/features/workspace/chat/composer-scope'
import type { GroupReference } from '#/features/workspace/group-types'
import { formatThreadDayLabel, getThreadDayKey } from '#/features/workspace/lib/thread-date'
import { buildMentionGroups } from '#/features/workspace/lib/mentions'
import { TaskLinkBatchProvider } from '#/features/tasks/task-link-context'
import {
  buildWorkspaceThreadItems,
} from '#/features/workspace/search/chat-thread-data'

export type CompanyConversationTimelineProps = {
  actorId: Id<'users'>
  busyAction: string | null
  context: ScopedComposerContext
  group: Pick<GroupReference, '_id'>
  historyState?: 'loading' | 'ready' | 'unavailable' | 'error'
  messagePageStatus?: 'LoadingFirstPage' | 'CanLoadMore' | 'LoadingMore' | 'Exhausted'
  messages: Array<GroupMessageItem> | undefined
  onDeleteMessage: (messageId: Id<'messages'>) => Promise<boolean>
  onForwardMessage: (input: {
    sourceMessageId: Id<'messages'>
    targetGroupId: Id<'groups'>
    body: string
  }) => Promise<boolean>
  onOpenGroup: (groupId: Id<'groups'>) => void
  onOpenMessageSource: (groupId: Id<'groups'>, messageId: Id<'messages'>) => void
  onReplyMessage: (item: GroupMessageItem) => void
  onLoadMoreMessages?: (count: number) => void
  onRetryHistory?: () => void
  readOnly: boolean
  targetMessageId?: Id<'messages'>
  visibleGroups: Array<GroupReference>
}

export function CompanyConversationTimeline({
  actorId,
  busyAction,
  context,
  group,
  historyState,
  messagePageStatus,
  messages,
  onDeleteMessage,
  onForwardMessage,
  onOpenGroup,
  onOpenMessageSource,
  onReplyMessage,
  onLoadMoreMessages,
  onRetryHistory,
  readOnly,
  visibleGroups,
}: CompanyConversationTimelineProps) {
  const release = useReleaseConfig()
  const messageStatus = messagePageStatus ?? 'Exhausted'
  const combinedPageStatus = messageStatus
  const channelMembers = useQuery(
    api.groups.listMembers,
    readOnly
      ? 'skip'
      : {
          ...context,
          groupId: group._id,
          userId: actorId,
        },
  )
  const activeChannelMembers = useMemo(
    () =>
      (channelMembers ?? []).flatMap((member) =>
        member.user ? [{ membership: member.membership, user: member.user }] : [],
      ),
    [channelMembers],
  )
  const mentionGroups = useMemo(
    () => buildMentionGroups(activeChannelMembers, visibleGroups),
    [activeChannelMembers, visibleGroups],
  )
  const threadItems = useMemo(
    () =>
      buildWorkspaceThreadItems({
        messages: messages ?? [],
      }),
    [messages],
  )
  const forwardGroups = useMemo(
    () => visibleGroups.filter((candidate) => !candidate.status || candidate.status === 'active'),
    [visibleGroups],
  )

  if (historyState === 'unavailable') {
    return (
      <output className="company-message-state">
        <strong>Channel history unavailable</strong>
        <span>This Channel was removed or your access changed.</span>
      </output>
    )
  }
  if (historyState === 'error') {
    return (
      <div className="company-message-state" role="alert">
        <strong>Couldn’t load Channel history</strong>
        <span>Try again when the connection is available.</span>
        {onRetryHistory ? (
          <button onClick={onRetryHistory} type="button">
            Retry
          </button>
        ) : null}
      </div>
    )
  }
  if (historyState === 'loading' || messages === undefined) {
    return <div className="company-message-state">Loading messages…</div>
  }
  if (threadItems.length === 0) {
    return (
      <div className="company-message-state">
        <Hash aria-hidden="true" size={18} />
        <strong>No messages yet</strong>
        <span>Start this Channel’s conversation below.</span>
      </div>
    )
  }

  const taskLinkMessageIds = threadItems.map((entry) => entry.item.message._id)
  const content = (
    <div className="track-thread">
      {combinedPageStatus === 'CanLoadMore' || combinedPageStatus === 'LoadingMore' ? (
        <div className="company-history-pagination">
          <button
            disabled={combinedPageStatus === 'LoadingMore'}
            onClick={() => {
              if (messageStatus === 'CanLoadMore') onLoadMoreMessages?.(50)
            }}
            type="button"
          >
            {combinedPageStatus === 'LoadingMore' ? 'Loading older messages…' : 'Load older messages'}
          </button>
        </div>
      ) : null}
      {threadItems.map((threadItem, index) => {
        const previousThreadItem = threadItems[index - 1]
        const showDay =
          !previousThreadItem ||
          getThreadDayKey(previousThreadItem.at) !== getThreadDayKey(threadItem.at)
        return (
          <Fragment key={threadItem.key}>
            {showDay ? (
              <ThreadDaySeparator label={formatThreadDayLabel(threadItem.at)} />
            ) : null}
            {(
              <MessageRow
                activeGroupId={group._id}
                busyAction={busyAction}
                canCreateTasks={release.tasks && !readOnly}
                canDeleteMessages={
                  !readOnly &&
                  (threadItem.item.message.authorProjectMemberId
                    ? threadItem.item.message.authorProjectMemberId === context.projectMemberId
                    : threadItem.item.message.authorId === actorId)
                }
                canForwardMessages={!readOnly}
                canReply={!readOnly}
                currentUserId={actorId}
                groups={forwardGroups}
                identity={context}
                item={threadItem.item}
                mentionGroups={mentionGroups}
                onDeleteMessage={onDeleteMessage}
                onForwardMessage={onForwardMessage}
                onOpenGroup={onOpenGroup}
                onOpenMessageSource={onOpenMessageSource}
                onReplyMessage={onReplyMessage}
                threadContext={context}
              />
            )}
          </Fragment>
        )
      })}
    </div>
  )
  return release.tasks ? (
    <TaskLinkBatchProvider
      identity={context}
      messageIds={taskLinkMessageIds}
    >
      {content}
    </TaskLinkBatchProvider>
  ) : content
}
