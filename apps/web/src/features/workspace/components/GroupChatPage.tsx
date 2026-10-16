import { Fragment } from 'react'
import type { ClipboardEvent, RefObject } from 'react'
import { ChevronDown, MessagesSquare } from 'lucide-react'

import type { Doc, Id } from '../../../../../../convex/_generated/dataModel'
import { Button } from '#/components/ui/button'
import type { createPendingAttachment } from '#/features/workspace/attachments/pending-attachments'
import {
  ConversationComposer,
  type ConversationComposerProps,
} from '#/features/workspace/components/ConversationComposer'
import { formatThreadDayLabel, getThreadDayKey } from '#/features/workspace/lib/thread-date'
import { MessageRow } from '#/features/workspace/thread-items'
import type { GroupMessageItem } from '#/features/workspace/thread-items'
import type { GroupReference } from '#/features/workspace/group-types'
import { ThreadDaySeparator } from '#/features/workspace/components/ThreadDaySeparator'
import type { ChatSearchMatch } from '#/features/workspace/search/chat-search'
import type { WorkspaceThreadItem } from '#/features/workspace/search/chat-thread-data'
import { ChannelTaskPanel } from '#/features/tasks/ConversationTaskActions'
import { TaskLinkBatchProvider } from '#/features/tasks/task-link-context'
import { ChannelThreadBrowser } from '#/features/threads/ChannelThreadBrowser'
import { useReleaseConfig } from '#/lib/release-config'

type PendingAttachment = ReturnType<typeof createPendingAttachment>
type ActiveTypingIndicator = NonNullable<ConversationComposerProps['activeTypingIndicators']>[number]
type MentionOption = ConversationComposerProps['filteredMentionOptions'][number]
type MentionSection = ConversationComposerProps['mentionSections'][number]

type GroupChatPageProps = {
  activeGroup: Doc<'groups'> | undefined
  activeGroupId: Id<'groups'> | null
  activeProjectId: Id<'projects'> | null
  activeTypingIndicators: Array<ActiveTypingIndicator>
  busyAction: string | null
  chatSearchMatchKeys: Set<string>
  chatSearchMatches: Array<ChatSearchMatch>
  chatSearchTerm: string
  composer: string
  composerPlaceholder: string
  composerRef: RefObject<HTMLTextAreaElement | null>
  emojiGroups: ReadonlyArray<{
    label: string
    emojis: ReadonlyArray<string>
  }>
  emojiPickerOpen: boolean
  fileInputRef: RefObject<HTMLInputElement | null>
  filteredMentionOptions: Array<MentionOption>
  flashingMessageId: string | null
  hasMoreMessages: boolean
  loadingOlderMessages: boolean
  mentionGroups: Map<string, GroupReference>
  mentionIndex: number
  mentionOptionRefs: RefObject<Array<HTMLButtonElement | null>>
  mentionSections: Array<MentionSection>
  messageAuthorAvatarUrlById: Map<string, string>
  messagesLoaded: boolean
  currentUserId: Id<'users'>
  onDeleteMessage: (messageId: Id<'messages'>) => Promise<boolean>
  onComposerBlur: () => void
  onComposerChange: (value: string, cursor: number) => void
  onComposerFocus: () => void
  onComposerKeyUp: () => void
  onComposerPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void
  onComposerSelect: () => void
  onEmojiPickerOpenChange: (open: boolean) => void
  onForwardMessage: (input: {
    sourceMessageId: Id<'messages'>
    targetGroupId: Id<'groups'>
    body: string
  }) => Promise<boolean>
  onInsertComposerText: (text: string) => void
  onMentionIndexChange: (updater: (index: number) => number) => void
  onMentionSelect: (option: MentionOption) => void
  onOpenGroup: (groupId: Id<'groups'>) => void
  onOpenMessageSource: (groupId: Id<'groups'>, messageId: Id<'messages'>) => void
  onLoadOlderMessages: () => void
  onRecordingChange: (recording: boolean) => void
  onReplyMessage: (item: GroupMessageItem) => void
  onReplyToMessageChange: (item: GroupMessageItem | null) => void
  onSendMessage: () => void
  onShowMentionMenuClose: () => void
  onThreadScroll: () => void
  onVoiceNoteRecorded: (recording: { file: File; durationMs: number; previewUrl: string }) => void
  pendingAttachments: Array<PendingAttachment>
  projectMemberRoleByUserId: Map<string, Doc<'projectMembers'>['role']>
  removePendingAttachment: (id: string) => void
  replyToMessage: GroupMessageItem | null
  scrollThreadToLatest: () => void
  setComposerCursorFromRef: () => void
  showJumpToLatest: boolean
  showMentionMenu: boolean
  threadItems: Array<WorkspaceThreadItem>
  threadScrollRef: RefObject<HTMLDivElement | null>
  visibleGroups: Array<Doc<'groups'>>
  visibleMessages: Array<GroupMessageItem>
  voiceRecordingActive: boolean
}

export function GroupChatPage({
  activeGroup,
  activeGroupId,
  activeProjectId,
  activeTypingIndicators,
  busyAction,
  chatSearchMatchKeys,
  chatSearchMatches,
  chatSearchTerm,
  composer,
  composerPlaceholder,
  composerRef,
  emojiGroups,
  emojiPickerOpen,
  fileInputRef,
  filteredMentionOptions,
  flashingMessageId,
  hasMoreMessages,
  loadingOlderMessages,
  mentionGroups,
  mentionIndex,
  mentionOptionRefs,
  mentionSections,
  messageAuthorAvatarUrlById,
  messagesLoaded,
  currentUserId,
  onDeleteMessage,
  onComposerBlur,
  onComposerChange,
  onComposerFocus,
  onComposerKeyUp,
  onComposerPaste,
  onComposerSelect,
  onEmojiPickerOpenChange,
  onForwardMessage,
  onInsertComposerText,
  onMentionIndexChange,
  onMentionSelect,
  onOpenGroup,
  onOpenMessageSource,
  onLoadOlderMessages,
  onRecordingChange,
  onReplyMessage,
  onReplyToMessageChange,
  onSendMessage,
  onShowMentionMenuClose,
  onThreadScroll,
  onVoiceNoteRecorded,
  pendingAttachments,
  projectMemberRoleByUserId,
  removePendingAttachment,
  replyToMessage,
  scrollThreadToLatest,
  setComposerCursorFromRef,
  showJumpToLatest,
  showMentionMenu,
  threadItems,
  threadScrollRef,
  visibleGroups,
  visibleMessages,
  voiceRecordingActive,
}: GroupChatPageProps) {
  const releaseConfig = useReleaseConfig()
  const readOnly = activeGroup?.status === 'archived'
  const taskLinkMessageIds = threadItems.map((entry) => entry.item.message._id)
  const content = (
    <>
      <div className="track-chat-mobile-context">
        {releaseConfig.tasks && activeGroup ? <ChannelTaskPanel group={activeGroup} variant="rail" /> : null}
        {releaseConfig.threads && activeGroupId && activeProjectId ? (
          <ChannelThreadBrowser
            groupId={activeGroupId}
            projectId={activeProjectId}
            readOnly={activeGroup?.status === 'archived'}
            timelineMessages={visibleMessages}
            userId={currentUserId}
            variant="rail"
          />
        ) : null}
      </div>
      <div
        className="track-thread-scroll"
        onScroll={onThreadScroll}
        ref={threadScrollRef}
      >
        <div className="track-thread">
          {hasMoreMessages ? (
            <button
              className="track-button"
              disabled={loadingOlderMessages}
              onClick={onLoadOlderMessages}
              type="button"
            >
              {loadingOlderMessages ? 'Loading older messages…' : 'Load older messages'}
            </button>
          ) : null}
          {activeGroup && messagesLoaded && visibleMessages.length === 0 ? (
            <div className="track-empty-conversation">
              <span className="track-empty-conversation-icon">
                <MessagesSquare size={22} />
              </span>
              <h2>{activeGroup.name} is ready</h2>
              <p>
                Start the conversation with a message.
              </p>
            </div>
          ) : null}

          {chatSearchTerm && chatSearchMatches.length === 0 ? (
            <div className="track-empty">
              <p className="mono-label m-0">No matches</p>
              <p>No chat items match "{chatSearchTerm}".</p>
            </div>
          ) : null}

          {threadItems.map((threadItem, index) => {
            const previousThreadItem = threadItems[index - 1]
            const dayKey = getThreadDayKey(threadItem.at)
            const shouldShowDaySeparator =
              !previousThreadItem || getThreadDayKey(previousThreadItem.at) !== dayKey
            const searchQuery = chatSearchMatchKeys.has(threadItem.key) ? chatSearchTerm : undefined
              return (
                <Fragment key={threadItem.key}>
                  {shouldShowDaySeparator ? (
                    <ThreadDaySeparator label={formatThreadDayLabel(threadItem.at)} />
                  ) : null}
                  <MessageRow
                    activeGroupId={activeGroupId}
                    avatarUrl={messageAuthorAvatarUrlById.get(threadItem.item.author?._id ?? '')}
                    busyAction={busyAction}
                    canCreateTasks={!readOnly}
                    canDeleteMessages={!readOnly}
                    canForwardMessages={!readOnly}
                    canReply={!readOnly}
                    currentUserId={currentUserId}
                    groups={visibleGroups}
                    isFlashing={flashingMessageId === threadItem.item.message._id}
                    item={{
                      ...threadItem.item,
                      authorRole:
                        projectMemberRoleByUserId.get(threadItem.item.author?._id ?? '') ??
                        threadItem.item.authorRole,
                    }}
                    mentionGroups={mentionGroups}
                    onDeleteMessage={onDeleteMessage}
                    onForwardMessage={onForwardMessage}
                    onOpenGroup={onOpenGroup}
                    onOpenMessageSource={onOpenMessageSource}
                    onReplyMessage={onReplyMessage}
                    searchQuery={searchQuery}
                  />
                </Fragment>
              )
          })}
        </div>
        {showJumpToLatest ? (
          <Button
            aria-label="Jump to latest message"
            className="track-jump-latest"
            onClick={scrollThreadToLatest}
            type="button"
          >
            <ChevronDown aria-hidden="true" size={18} />
          </Button>
        ) : null}
      </div>

      {readOnly ? (
        <output className="track-thread-archived">This Channel is archived and read-only.</output>
      ) : (
        <ConversationComposer
          activeTypingIndicators={activeTypingIndicators}
          ariaLabel={`Message ${activeGroup?.name ?? 'Group'}`}
          available={Boolean(activeGroupId)}
          busyAction={busyAction}
          composer={composer}
          composerRef={composerRef}
          emojiGroups={emojiGroups}
          emojiPickerOpen={emojiPickerOpen}
          filteredMentionOptions={filteredMentionOptions}
          mentionIndex={mentionIndex}
          mentionOptionRefs={mentionOptionRefs}
          mentionSections={mentionSections}
          onAddAttachment={() => fileInputRef.current?.click()}
          onComposerBlur={onComposerBlur}
          onComposerChange={onComposerChange}
          onComposerFocus={onComposerFocus}
          onComposerKeyUp={onComposerKeyUp}
          onComposerPaste={onComposerPaste}
          onComposerSelect={onComposerSelect}
          onEmojiPickerOpenChange={onEmojiPickerOpenChange}
          onInsertComposerText={onInsertComposerText}
          onMentionIndexChange={onMentionIndexChange}
          onMentionSelect={onMentionSelect}
          onRecordingChange={onRecordingChange}
          onReplyChange={(reply) => {
            if (!reply) onReplyToMessageChange(null)
          }}
          onSendMessage={onSendMessage}
          onShowMentionMenuClose={onShowMentionMenuClose}
          onVoiceNoteRecorded={onVoiceNoteRecorded}
          pendingAttachments={pendingAttachments}
          placeholder={composerPlaceholder}
          removePendingAttachment={removePendingAttachment}
          replyTo={replyToMessage
              ? {
                  authorName: replyToMessage.author?.displayName ?? 'Unknown Member',
                  body: replyToMessage.message.body || 'Attachment message',
                  messageId: replyToMessage.message._id,
              }
              : null}

          setComposerCursorFromRef={setComposerCursorFromRef}
          showMentionMenu={showMentionMenu}
          voiceRecordingActive={voiceRecordingActive}
        />
      )}
    </>
  )
  return releaseConfig.tasks ? (
    <TaskLinkBatchProvider
      messageIds={taskLinkMessageIds}
    >
      {content}
    </TaskLinkBatchProvider>
  ) : content
}
