import { CornerUpRight, ExternalLink, Paperclip, X } from 'lucide-react'

import type { Doc, Id } from '../../../../../convex/_generated/dataModel'
import { Avatar, AvatarFallback, AvatarImage } from '#/components/ui/avatar'
import { Card } from '#/components/ui/card'
import { AttachmentTypeIcon, formatFileSize } from './attachment-ui'
import { AvatarNameTooltip } from './avatar-tooltip'
import { getGroupAvatar } from './group-avatar'
import type { GroupReference } from './group-types'
import { getAvatarTone, getInitials } from './identity'
import { MarkdownText } from './markdown'
import { VoiceNotePlayer, isAudioAttachment } from './voice-notes'

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

type MessageAuthor = Pick<Doc<'users'>, '_id' | 'displayName'> &
  Partial<
    Pick<
      Doc<'users'>,
      'email' | 'profileBannerStyle' | 'profileBio' | 'profileDesignation' | 'timezone'
    >
  >

export type GroupMessageItem = {
  message: Doc<'messages'>
  author: MessageAuthor | null
  authorRole: Doc<'projectMembers'>['role'] | null
  authorCompany?: {
    companyId: Id<'companies'>
    displayName: string
  } | null
  attachments: Array<{ attachment: Doc<'attachments'>; url: string | null }>
  replyTo: ReplyToMessagePreview | null
  forwardedFrom: ForwardedMessagePreview | null

}

export function getForwardedSourceLabel(forwarded: Pick<ForwardedMessagePreview, 'sourceGroupName'>) {
  return forwarded.sourceGroupName ? `Forwarded from ${forwarded.sourceGroupName}` : 'Forwarded message'
}

export function formatCopiedAttachmentCount(count: number) {
  return `${count} attachment${count === 1 ? '' : 's'} copied`
}

export function MessageRow({
  activeGroupId,
  busyAction,
  canDeleteMessages,
  canForwardMessages = true,
  canReply,
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
  canForwardMessages?: boolean
  canReply?: boolean
  currentUserId: Id<'users'>
  groups: Array<GroupReference>
  isFlashing?: boolean
  item: GroupMessageItem
  avatarUrl?: string | null
  mentionGroups: Map<string, GroupReference>
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
  const authorName = item.author?.displayName ?? 'Unknown Member'
  const canForward = canForwardMessages && groups.some((group) => group._id !== item.message.groupId)
  return (
    <article
      className={isFlashing ? 'track-message-row flashing' : 'track-message-row'}
      data-thread-item-key={item.message._id}
      data-channel-sequence={item.message.channelSequence}
      id={`message-${item.message._id}`}
      tabIndex={-1}
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

          canReply={canReply}
          groups={groups}
          item={item}
          canDelete={canDeleteMessages && item.message.authorId === currentUserId}
          onDeleteMessage={onDeleteMessage}
          onForwardMessage={onForwardMessage}
          onReplyMessage={onReplyMessage}
        />
        <div className="track-message-meta">
          <strong>{authorName}</strong>
          {item.authorCompany ? (
            <span className="track-author-company">{item.authorCompany.displayName}</span>
          ) : null}
          {/*<Badge className="track-role-chip" variant="outline">
            {visibleRole}
          </Badge>*/}
          <time>{new Date(item.message.createdAt).toLocaleTimeString()}</time>
        </div>
        {item.replyTo ? <QuotedMessageBlock quote={item.replyTo} onOpen={(messageId) => onOpenMessageSource(item.message.groupId, messageId)} /> : null}
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
        {null}
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
  const attachmentCount = forwarded.attachmentSnapshots.length
  const sourceLabel = getForwardedSourceLabel(forwarded)
  return (
    <div className="track-forwarded-block">
      <div className="track-forwarded-label">
        <CornerUpRight size={13} />
        <span>{sourceLabel}</span>
      </div>
      <div className="track-forwarded-card">
        <span>{forwarded.originalAuthorName} · {new Date(forwarded.originalCreatedAt).toLocaleTimeString()}</span>
        <p>{forwarded.originalBody || 'Attachment message'}</p>
        {attachmentCount > 0 ? (
          <small>
            <Paperclip size={12} />
            {formatCopiedAttachmentCount(attachmentCount)}
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
          View source
        </button>
      ) : (
        <span className="track-forwarded-source muted">
          <X size={12} />
          Source restricted
        </span>
      )}
    </div>
  )
}

export function MentionInline({
  handle,
  index,
  mentionGroups,
  onOpenGroup,
}: {
  handle: string
  index: number
  mentionGroups: Map<string, GroupReference>
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
      className={'track-mention-inline'}
      key={`${handle}-${index}`}
    >
      @{handle}
    </span>
  )
}
