import { CornerUpRight, ExternalLink, Paperclip, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { Doc, Id } from '../../../../../convex/_generated/dataModel'
import { Avatar, AvatarFallback, AvatarImage } from '#/components/ui/avatar'
import { Card } from '#/components/ui/card'
import { AttachmentTypeIcon } from './attachment-ui'
import { AvatarNameTooltip } from './avatar-tooltip'
import { getGroupAvatar } from './group-avatar'
import { getAvatarTone, getInitials } from './identity'
import { MarkdownText } from './markdown'
import { VoiceNotePlayer, isAudioAttachment } from './voice-notes'
import { MessageInlineTasks } from '#/features/tasks/ConversationTaskActions'
import { threadHref } from '#/features/threads/thread-navigation'
import { formatFileSize, formatNumber, formatTime } from '#/i18n'

export type ReplyToMessagePreview = {
  messageId: Id<'messages'>
  authorName: string
  body: string
  createdAt: number
}

export type ForwardedMessagePreview = {
  originalAuthorName: string
  originalBody: string
  originalCreatedAt: number
  attachmentSnapshots: Array<{
    filename: string
    contentType: string
    size: number
    kind?: Doc<'attachments'>['kind']
    durationMs?: number
  }>
  forwardedAt: number
  canOpenSource: boolean
  sourceGroupId: Id<'groups'> | null
  sourceMessageId: Id<'messages'> | null
  sourceGroupName: string | null
}

export type GroupMessageItem = {
  message: Doc<'messages'>
  author: Doc<'users'> | null
  authorRole: Doc<'projectMembers'>['role'] | null
  attachments: Array<{ attachment: Doc<'attachments'>; url: string | null }>
  replyTo: ReplyToMessagePreview | null
  forwardedFrom: ForwardedMessagePreview | null
  channelThread: {
    threadId: Id<'channelThreads'>
    name: string
    status: 'active' | 'archived'
    replyCount: number
    latestReplyAt: number | null
  } | null
}

export type MessageCitationPreview = {
  author: string
  body: string
  createdAt: number
  attachments: Array<{
    id: string
    filename: string
    contentType: string
    size: number
    kind?: Doc<'attachments'>['kind']
  }>
}

export function getForwardedSourceLabel(
  forwarded: Pick<ForwardedMessagePreview, 'sourceGroupName'>,
  labels: { from: string; message: string } = { from: 'Forwarded from', message: 'Forwarded message' },
) {
  return forwarded.sourceGroupName ? `${labels.from} ${forwarded.sourceGroupName}` : labels.message
}

export function formatCopiedAttachmentCount(count: number, labels: { one: string; many: string; copied: string; formatCount?: (count: number) => string } = { one: 'attachment', many: 'attachments', copied: 'copied' }) {
  return `${labels.formatCount?.(count) ?? count} ${count === 1 ? labels.one : labels.many} ${labels.copied}`
}

export function MessageRow({
  activeGroupId,
  busyAction,
  canDeleteMessages,
  currentUserId,
  groups,
  isFlashing,
  item,
  avatarUrl,
  mentionGroups,
  onDeleteMessage,
  onForwardMessage,
  onOpenGroup,
  onOpenMessageSource,
  onReplyMessage,
  searchQuery,
}: {
  activeGroupId: Id<'groups'> | null
  busyAction: string | null
  canDeleteMessages: boolean
  currentUserId: Id<'users'>
  groups: Array<Doc<'groups'>>
  isFlashing?: boolean
  item: GroupMessageItem
  avatarUrl?: string | null
  mentionGroups: Map<string, Doc<'groups'>>
  onDeleteMessage: (messageId: Id<'messages'>) => Promise<boolean>
  onForwardMessage: (input: {
    sourceMessageId: Id<'messages'>
    targetGroupId: Id<'groups'>
    body: string
  }) => Promise<boolean>
  onOpenGroup: (groupId: Id<'groups'>) => void
  onOpenMessageSource: (groupId: Id<'groups'>, messageId: Id<'messages'>) => void
  onReplyMessage: (item: GroupMessageItem) => void
  searchQuery?: string
}) {
  const { t } = useTranslation('workspace')
  const authorName = item.author?.displayName ?? t('chat.unknownMember')
  const canForward = groups.some((group) => group._id !== item.message.groupId)
  return (
    <article
      className={isFlashing ? 'track-message-row flashing' : 'track-message-row'}
      data-thread-item-key={item.message._id}
      id={`message-${item.message._id}`}
    >
      <AvatarNameTooltip
        avatarUrl={avatarUrl}
        bannerStyle={item.author?.profileBannerStyle}
        bio={item.author?.profileBio}
        detail={item.author?.profileDesignation ?? (item.authorRole ? item.authorRole.replaceAll('_', ' ') : null)}
        name={authorName}
        side="right"
        toneSource={item.author?.email ?? authorName}
        timezone={item.author?.timezone}
      >
        <Avatar className={`track-message-avatar ${getAvatarTone(item.author?.email ?? authorName)}`}>
          <AvatarImage src={avatarUrl ?? undefined} />
          <AvatarFallback>{getInitials(authorName)}</AvatarFallback>
        </Avatar>
      </AvatarNameTooltip>
      <Card className="track-message-body" size="sm">
        <MessageActions
          activeGroupId={activeGroupId}
          busyAction={busyAction}
          canForward={canForward}
          groups={groups}
          item={item}
          canDelete={canDeleteMessages && item.message.authorId === currentUserId}
          onDeleteMessage={onDeleteMessage}
          onForwardMessage={onForwardMessage}
          onReplyMessage={onReplyMessage}
        />
        <div className="track-message-meta">
          <strong>{authorName}</strong>
          {/*<Badge className="track-role-chip" variant="outline">
            {visibleRole}
          </Badge>*/}
          <time>{formatTime(item.message.createdAt)}</time>
        </div>
        {item.replyTo ? <QuotedMessageBlock quote={item.replyTo} /> : null}
        {item.forwardedFrom ? (
          <ForwardedMessageBlock
            forwarded={item.forwardedFrom}
            onOpenSource={onOpenMessageSource}
          />
        ) : null}
        <MarkdownText
          className="track-markdown"
          highlightQuery={searchQuery}
          renderMention={(handle, index) => (
            <MentionInline
              handle={handle}
              index={index}
              key={`${handle}-${index}`}
              mentionGroups={mentionGroups}
              onOpenGroup={onOpenGroup}
            />
          )}
          text={item.message.body}
        />
        {item.channelThread ? (
          <a
            className="track-source-thread-link"
            href={threadHref(
              item.message.projectId,
              item.message.groupId,
              item.channelThread.threadId,
            )}
          >
            <strong>{item.channelThread.name}</strong>
            <span>{t('thread.replyCount', { count: formatNumber(item.channelThread.replyCount) })}</span>
          </a>
        ) : null}
        {item.attachments.length > 0 ? (
          <div className="track-attachment-list">
            {item.attachments.map(({ attachment, url }) => {
              const isImage = attachment.contentType.startsWith('image/')
              if (isAudioAttachment(attachment)) {
                return (
                  <VoiceNotePlayer
                    contentType={attachment.contentType}
                    durationMs={attachment.durationMs}
                    filename={attachment.filename}
                    kind={attachment.kind}
                    key={attachment._id}
                    size={attachment.size}
                    url={url}
                  />
                )
              }
              const content = isImage ? (
                <>
                  {url ? (
                    <img alt={attachment.filename} src={url} />
                  ) : (
                    <span className="track-attachment-file-icon">
                      <AttachmentTypeIcon
                        contentType={attachment.contentType}
                        filename={attachment.filename}
                        size={16}
                      />
                    </span>
                  )}
                  <span>
                    <strong>{attachment.filename}</strong>
                    <small>{formatFileSize(attachment.size)}</small>
                  </span>
                </>
              ) : (
                <>
                  <span className="track-attachment-file-icon">
                    <AttachmentTypeIcon
                      contentType={attachment.contentType}
                      filename={attachment.filename}
                      size={16}
                    />
                  </span>
                  <span>
                    <strong>{attachment.filename}</strong>
                    <small>{formatFileSize(attachment.size)}</small>
                  </span>
                </>
              )

              return url ? (
                <a
                  className={isImage ? 'track-attachment-card image' : 'track-attachment-card file'}
                  href={url}
                  key={attachment._id}
                  rel="noreferrer"
                  target="_blank"
                >
                  {content}
                </a>
              ) : (
                <span
                  className={isImage ? 'track-attachment-card image' : 'track-attachment-card file'}
                  key={attachment._id}
                >
                  {content}
                </span>
              )
            })}
          </div>
        ) : null}
        <MessageInlineTasks message={item.message} />
      </Card>
    </article>
  )
}

export { MessageActions, QuotedMessageBlock } from './components/MessageActions'
import { MessageActions, QuotedMessageBlock } from './components/MessageActions'
function ForwardedMessageBlock({
  forwarded,
  onOpenSource,
}: {
  forwarded: ForwardedMessagePreview
  onOpenSource: (groupId: Id<'groups'>, messageId: Id<'messages'>) => void
}) {
  const { t } = useTranslation('workspace')
  const attachmentCount = forwarded.attachmentSnapshots.length
  const sourceLabel = getForwardedSourceLabel(forwarded, {
    from: t('message.forwardedFrom'),
    message: t('message.forwardedMessage'),
  })
  return (
    <div className="track-forwarded-block">
      <div className="track-forwarded-label">
        <CornerUpRight size={13} />
        <span>{sourceLabel}</span>
      </div>
      <div className="track-forwarded-card">
        <span>{forwarded.originalAuthorName} · {formatTime(forwarded.originalCreatedAt)}</span>
        <p>{forwarded.originalBody || t('chat.attachmentMessage')}</p>
        {attachmentCount > 0 ? (
          <small>
            <Paperclip size={12} />
            {formatCopiedAttachmentCount(attachmentCount, {
              copied: t('message.copied'),
              formatCount: formatNumber,
              many: t('message.attachments'),
              one: t('message.attachment'),
            })}
          </small>
        ) : null}
      </div>
      {forwarded.canOpenSource && forwarded.sourceGroupId && forwarded.sourceMessageId ? (
        <button
          className="track-forwarded-source"
          onClick={() => onOpenSource(forwarded.sourceGroupId as Id<'groups'>, forwarded.sourceMessageId as Id<'messages'>)}
          type="button"
        >
          <ExternalLink size={12} />
          {t('message.viewSource')}
        </button>
      ) : (
        <span className="track-forwarded-source muted">
          <X size={12} />
          {t('message.sourceRestricted')}
        </span>
      )}
    </div>
  )
}

export { AssistantAnswer } from './components/AssistantAnswer'
export function MentionInline({
  handle,
  index,
  mentionGroups,
  onOpenGroup,
}: {
  handle: string
  index: number
  mentionGroups: Map<string, Doc<'groups'>>
  onOpenGroup: (groupId: Id<'groups'>) => void
}) {
  const group = mentionGroups.get(handle)
  if (group) {
    const { Icon, tone } = getGroupAvatar(group)
    return (
      <button
        className={`track-mention-inline group ${tone}`}
        key={`${handle}-${index}`}
        onClick={() => onOpenGroup(group._id)}
        type="button"
      >
        <Icon size={12} />
        @{handle}
      </button>
    )
  }

  return (
    <span
      className={handle === 'track' ? 'track-mention-inline track' : 'track-mention-inline'}
      key={`${handle}-${index}`}
    >
      @{handle}
    </span>
  )
}
