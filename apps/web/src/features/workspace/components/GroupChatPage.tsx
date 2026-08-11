import { Fragment } from 'react'
import type { ComponentProps } from 'react'
import type { ClipboardEvent, RefObject } from 'react'
import { AtSign, Bot, ChevronDown, CornerUpLeft, Import, MessagesSquare, Paperclip, Smile, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { Doc, Id } from '../../../../../../convex/_generated/dataModel'
import { Avatar, AvatarFallback } from '#/components/ui/avatar'
import { Button } from '#/components/ui/button'
import { Textarea } from '#/components/ui/textarea'
import { AttachmentTypeIcon } from '#/features/workspace/attachment-ui'
import type { createPendingAttachment } from '#/features/workspace/attachments/pending-attachments'
import { getInitials } from '#/features/workspace/identity'
import { formatThreadDayLabel, getThreadDayKey } from '#/features/workspace/lib/thread-date'
import { AssistantAnswer, MessageRow } from '#/features/workspace/thread-items'
import type { GroupMessageItem, MessageCitationPreview } from '#/features/workspace/thread-items'
import { ThreadDaySeparator } from '#/features/workspace/components/ThreadDaySeparator'
import { TypingIndicatorLine } from '#/features/workspace/typing-indicators'
import {
  VoiceNoteReview,
  VoiceRecorder,
  isVoiceNoteAttachment,
} from '#/features/workspace/voice-notes'
import type { ChatSearchMatch } from '#/features/workspace/search/chat-search'
import type { WorkspaceThreadItem } from '#/features/workspace/search/chat-thread-data'
import { ChannelTaskPanel } from '#/features/tasks/ConversationTaskActions'
import { ChannelThreadBrowser } from '#/features/threads/ChannelThreadBrowser'
import { useReleaseConfig } from '#/lib/release-config'
import { formatDate, formatDuration, formatFileSize } from '#/i18n'

type PendingAttachment = ReturnType<typeof createPendingAttachment>
type ActiveTypingIndicator = ComponentProps<typeof TypingIndicatorLine>['indicators'][number]

type MentionOption = {
  id: string
  kind: 'assistant' | 'group' | 'member'
  label: string
  sublabel: string
  handle: string
  tone: string
}

type MentionSection = {
  label: string
  options: Array<MentionOption>
}

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
  mentionGroups: Map<string, Doc<'groups'>>
  mentionIndex: number
  mentionOptionRefs: RefObject<Array<HTMLButtonElement | null>>
  mentionSections: Array<MentionSection>
  messageAuthorAvatarUrlById: Map<string, string>
  messageCitations: Map<string, MessageCitationPreview>
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
  onOpenMemoryImport: () => void
  onOpenGroup: (groupId: Id<'groups'>) => void
  onOpenMessageCitation: (messageId: Id<'messages'> | string) => void
  onOpenMessageSource: (groupId: Id<'groups'>, messageId: Id<'messages'>) => void
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
  mentionGroups,
  mentionIndex,
  mentionOptionRefs,
  mentionSections,
  messageAuthorAvatarUrlById,
  messageCitations,
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
  onOpenMemoryImport,
  onOpenGroup,
  onOpenMessageCitation,
  onOpenMessageSource,
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
  const { t } = useTranslation('workspace')
  const releaseConfig = useReleaseConfig()
  return (
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
          {activeGroup && messagesLoaded && visibleMessages.length === 0 ? (
            <div className="track-empty-conversation">
              <span className="track-empty-conversation-icon">
                <MessagesSquare size={22} />
              </span>
              <h2>{t('chat.groupReady', { group: activeGroup.name })}</h2>
              <p>
                {t('chat.groupReadyDescription')}
              </p>
            </div>
          ) : null}

          {chatSearchTerm && chatSearchMatches.length === 0 ? (
            <div className="track-empty">
              <p className="mono-label m-0">{t('search.noMatches')}</p>
              <p>{t('search.noChatMatches', { query: chatSearchTerm })}</p>
            </div>
          ) : null}

          {threadItems.map((threadItem, index) => {
            const previousThreadItem = threadItems[index - 1]
            const dayKey = getThreadDayKey(threadItem.at)
            const shouldShowDaySeparator =
              !previousThreadItem || getThreadDayKey(previousThreadItem.at) !== dayKey
            const searchQuery = chatSearchMatchKeys.has(threadItem.key) ? chatSearchTerm : undefined
            if (threadItem.kind === 'message') {
              return (
                <Fragment key={threadItem.key}>
                  {shouldShowDaySeparator ? (
                    <ThreadDaySeparator label={formatThreadDayLabel(threadItem.at, {
                      formatDate,
                      today: t('dates.today'),
                      yesterday: t('dates.yesterday'),
                    })} />
                  ) : null}
                  <MessageRow
                    activeGroupId={activeGroupId}
                    avatarUrl={messageAuthorAvatarUrlById.get(threadItem.item.author?._id ?? '')}
                    busyAction={busyAction}
                    canDeleteMessages={activeGroup?.status !== 'archived'}
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
            }
            if (threadItem.kind === 'assistant') {
              return (
                <Fragment key={threadItem.key}>
                  {shouldShowDaySeparator ? (
                    <ThreadDaySeparator label={formatThreadDayLabel(threadItem.at, {
                      formatDate,
                      today: t('dates.today'),
                      yesterday: t('dates.yesterday'),
                    })} />
                  ) : null}
                  <AssistantAnswer
                    mentionGroups={mentionGroups}
                    messageCitations={messageCitations}
                    onOpenGroup={onOpenGroup}
                    onOpenMessageCitation={onOpenMessageCitation}
                    searchQuery={searchQuery}
                    stream={threadItem.stream}
                    threadItemKey={threadItem.key}
                  />
                </Fragment>
              )
            }
            return null
          })}
        </div>
        {showJumpToLatest ? (
          <Button
            aria-label={t('chat.jumpToLatest')}
            className="track-jump-latest"
            onClick={scrollThreadToLatest}
            type="button"
          >
            <ChevronDown aria-hidden="true" size={18} />
          </Button>
        ) : null}
      </div>

      <div className="track-composer-wrap">
        <TypingIndicatorLine indicators={activeTypingIndicators} />
        <div className={voiceRecordingActive ? 'track-composer recording' : 'track-composer'}>
          {!voiceRecordingActive && replyToMessage ? (
            <div className="track-composer-quote" aria-label={t('chat.replyingToMessage')}>
              <CornerUpLeft size={14} />
              <span>
                <strong>{t('chat.replyingTo', { name: replyToMessage.author?.displayName ?? t('chat.unknownMember') })}</strong>
                <small>{replyToMessage.message.body || t('chat.attachmentMessage')}</small>
              </span>
              <button
                aria-label={t('chat.cancelReply')}
                onClick={() => onReplyToMessageChange(null)}
                type="button"
              >
                <X size={13} />
              </button>
            </div>
          ) : null}
          {!voiceRecordingActive && pendingAttachments.length > 0 ? (
            <div className="track-composer-attachments" aria-label={t('chat.pendingAttachments')}>
              {pendingAttachments.map((attachment) => (
                <div
                  className={
                    attachment.kind === 'voice_note'
                      ? 'track-composer-attachment voice'
                      : 'track-composer-attachment'
                  }
                  key={attachment.id}
                >
                  {attachment.kind === 'voice_note' && attachment.previewUrl ? (
                    <VoiceNoteReview
                      durationMs={attachment.durationMs}
                      file={attachment.file}
                      onRemove={() => removePendingAttachment(attachment.id)}
                      previewUrl={attachment.previewUrl}
                    />
                  ) : attachment.previewUrl ? (
                    <img alt="" src={attachment.previewUrl} />
                  ) : (
                    <span className="track-composer-file-icon">
                      <AttachmentTypeIcon
                        contentType={attachment.file.type}
                        filename={attachment.file.name}
                        size={18}
                      />
                    </span>
                  )}
                  {attachment.kind === 'voice_note' ? null : (
                    <>
                      <span className="track-composer-attachment-meta">
                        <strong>{attachment.file.name}</strong>
                        <small>
                          {isVoiceNoteAttachment({
                            contentType: attachment.file.type,
                            filename: attachment.file.name,
                            kind: attachment.kind,
                          })
                            ? formatDuration(attachment.durationMs ?? 0)
                            : formatFileSize(attachment.file.size)}
                        </small>
                      </span>
                      <button
                        aria-label={t('chat.removeAttachment', { name: attachment.file.name })}
                        className="track-composer-attachment-remove"
                        onClick={() => removePendingAttachment(attachment.id)}
                        type="button"
                      >
                        <X size={13} />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          ) : null}
          {!voiceRecordingActive ? (
            <Textarea
              aria-label={t('chat.messageChannel', { channel: activeGroup?.name ?? t('common.channel') })}
              disabled={!activeGroupId || busyAction === 'send-message'}
              onBlur={onComposerBlur}
              onChange={(event) => {
                onComposerChange(event.currentTarget.value, event.currentTarget.selectionStart)
                onEmojiPickerOpenChange(false)
              }}
              onFocus={onComposerFocus}
              onKeyDown={(event) => {
                if (emojiPickerOpen && event.key === 'Escape') {
                  event.preventDefault()
                  onEmojiPickerOpenChange(false)
                  return
                }
                if (showMentionMenu) {
                  if (event.key === 'ArrowDown') {
                    event.preventDefault()
                    onMentionIndexChange((index) => (index + 1) % filteredMentionOptions.length)
                    return
                  }
                  if (event.key === 'ArrowUp') {
                    event.preventDefault()
                    onMentionIndexChange((index) => (index - 1 + filteredMentionOptions.length) % filteredMentionOptions.length)
                    return
                  }
                  if (event.key === 'Enter' || event.key === 'Tab') {
                    event.preventDefault()
                    const option = filteredMentionOptions[mentionIndex] ?? filteredMentionOptions[0]
                    if (option) onMentionSelect(option)
                    return
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    onShowMentionMenuClose()
                    return
                  }
                }
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  onSendMessage()
                }
              }}
              onKeyUp={onComposerKeyUp}
              onPaste={onComposerPaste}
              onSelect={onComposerSelect}
              placeholder={composerPlaceholder}
              ref={composerRef}
              autoFocus
              value={composer}
            />
          ) : null}
          {!voiceRecordingActive && showMentionMenu ? (
            <div className="track-mention-menu" role="listbox" aria-label={t('chat.mentionSomeone')}>
              {mentionSections.map((section) => (
                <div className="track-mention-section" key={section.label}>
                  <p className="track-mention-section-label">{section.label}</p>
                  {section.options.map((option) => {
                    const index = filteredMentionOptions.findIndex((item) => item.id === option.id)
                    return (
                      <button
                        aria-selected={index === mentionIndex}
                        className={index === mentionIndex ? 'track-mention-option active' : 'track-mention-option'}
                        key={option.id}
                        onMouseDown={(event) => {
                          event.preventDefault()
                          onMentionSelect(option)
                        }}
                        ref={(element) => {
                          mentionOptionRefs.current[index] = element
                        }}
                        role="option"
                        type="button"
                      >
                        <Avatar className={option.tone === 'bot' ? 'track-mention-avatar bot' : `track-mention-avatar ${option.tone}`}>
                          <AvatarFallback>
                            {option.kind === 'assistant' ? (
                              <Bot size={13} />
                            ) : option.kind === 'group' ? (
                              <MessagesSquare size={13} />
                            ) : (
                              getInitials(option.label)
                            )}
                          </AvatarFallback>
                        </Avatar>
                        <span>
                          <strong>@{option.handle}</strong>
                          <small>{option.label} · {option.sublabel}</small>
                        </span>
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          ) : null}
          {!voiceRecordingActive && emojiPickerOpen ? (
            <div className="track-emoji-picker" role="dialog" aria-label={t('chat.emojiPicker')}>
              {emojiGroups.map((group) => (
                <div className="track-emoji-group" key={group.label}>
                  <p className="mono-label m-0">{group.label}</p>
                  <div className="track-emoji-grid">
                    {group.emojis.map((emoji) => (
                      <button
                        aria-label={t('chat.insertEmoji', { emoji })}
                        className="track-emoji-option"
                        key={`${group.label}-${emoji}`}
                        onMouseDown={(event) => {
                          event.preventDefault()
                          onInsertComposerText(emoji)
                          onEmojiPickerOpenChange(false)
                        }}
                        type="button"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          <div className="track-composer-bar">
            {!voiceRecordingActive ? (
              <Button
                className="icon-button"
                disabled={!activeGroupId || busyAction === 'memory-import'}
                onClick={onOpenMemoryImport}
                title={t('chat.importMemory')}
                type="button"
              >
                <Import size={15} />
              </Button>
            ) : null}
            {!voiceRecordingActive ? (
              <Button
                className="icon-button"
                disabled={!activeGroupId || busyAction === 'send-message'}
                onClick={() => fileInputRef.current?.click()}
                title={t('chat.addAttachment')}
                type="button"
              >
                <Paperclip size={15} />
              </Button>
            ) : null}
            <VoiceRecorder
              disabled={!activeGroupId || busyAction === 'send-message'}
              onRecordingChange={onRecordingChange}
              onRecorded={onVoiceNoteRecorded}
            />
            {!voiceRecordingActive ? (
              <>
                <Button
                  className="icon-button"
                  disabled={!activeGroupId || busyAction === 'send-message'}
                  onClick={() => {
                    onEmojiPickerOpenChange(false)
                    const cursor = composerRef.current?.selectionStart ?? composer.length
                    const spacer = cursor > 0 && !/\s$/.test(composer.slice(0, cursor)) ? ' @' : '@'
                    const nextComposer = `${composer.slice(0, cursor)}${spacer}${composer.slice(cursor)}`
                    const nextCursor = cursor + spacer.length
                    onComposerChange(nextComposer, nextCursor)
                    requestAnimationFrame(() => {
                      composerRef.current?.focus()
                      composerRef.current?.setSelectionRange(nextCursor, nextCursor)
                    })
                  }}
                  title={t('chat.mention')}
                  type="button"
                >
                  <AtSign size={15} />
                </Button>
                <Button
                  className="icon-button"
                  disabled={!activeGroupId}
                  onClick={() => {
                    setComposerCursorFromRef()
                    onEmojiPickerOpenChange(!emojiPickerOpen)
                  }}
                  title={t('chat.emoji')}
                  type="button"
                >
                  <Smile size={15} />
                </Button>
                <span className="track-composer-spacer" />
                <Button
                  className="track-button track-button-primary"
                  disabled={
                    (!composer.trim() && pendingAttachments.length === 0) ||
                    !activeGroupId ||
                    busyAction === 'send-message'
                  }
                  onClick={onSendMessage}
                  type="button"
                >
                  {t('common.send')}
                  <span className="track-send-key">↵</span>
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </>
  )
}
