import { MessageSquare } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { Doc, Id } from '../../../../../../convex/_generated/dataModel'
import { Avatar, AvatarFallback, AvatarImage } from '#/components/ui/avatar'
import { AttachmentTypeIcon } from '../attachment-ui'
import { AvatarNameTooltip } from '../avatar-tooltip'
import { MarkdownText } from '../markdown'
import { MentionInline } from '../thread-item-components'
import type { MessageCitationPreview } from '../thread-item-components'
import { AssistantInlineTasks, CreateTaskFromAssistant } from '#/features/tasks/ConversationTaskActions'
import { formatNumber, formatTime } from '#/i18n'

export function AssistantAnswer({
  messageCitations,
  mentionGroups,
  onOpenGroup,
  onOpenMessageCitation,
  searchQuery,
  stream,
  threadItemKey,
}: {
  messageCitations: Map<string, MessageCitationPreview>
  mentionGroups: Map<string, Doc<'groups'>>
  onOpenGroup: (groupId: Id<'groups'>) => void
  onOpenMessageCitation: (messageId: Id<'messages'> | string) => void
  searchQuery?: string
  stream: Doc<'assistantStreams'>
  threadItemKey: string
}) {
  const { t } = useTranslation('workspace')
  const isThinking = (stream.status === 'queued' || stream.status === 'running') && !stream.answer
  const answer = stream.answer || (
    stream.status === 'failed'
      ? t('assistant.failed')
      : stream.status === 'completed'
        ? t('assistant.noAnswer')
        : t('assistant.queued')
  )
  const sources = buildAssistantSourcePreviews(stream.evidence, messageCitations, {
    messageFrom: t('assistant.messageFrom'),
  })
  return (
    <article className="track-assistant-row" data-thread-item-key={threadItemKey}>
      <AvatarNameTooltip
        avatarUrl="/track-assistant-avatar.png"
        bannerStyle="silk"
        bio={t('assistant.bio')}
        detail={t('assistant.detail')}
        name={t('assistant.name')}
        side="right"
      >
        <Avatar className="track-message-avatar bot">
          <AvatarImage src="/track-assistant-avatar.png" />
          <AvatarFallback>T</AvatarFallback>
        </Avatar>
      </AvatarNameTooltip>
      <div className="track-assistant-body">
        <div className="track-message-meta">
          <strong>{t('assistant.name')}</strong>
          <time>{formatTime(stream.createdAt)}</time>
          <CreateTaskFromAssistant stream={stream} />
        </div>
        {isThinking ? (
          <TextShimmer>{t('assistant.thinking')}</TextShimmer>
        ) : (
          <MarkdownText
            className="track-markdown"
            highlightQuery={searchQuery}
            renderCitation={(citationId, index) => (
              <MessageCitation
                citationId={citationId}
                index={index}
                key={`${citationId}-${index}`}
                message={messageCitations.get(citationId)}
                onOpen={onOpenMessageCitation}
              />
            )}
            renderMention={(handle, index) => (
              <MentionInline
                handle={handle}
                index={index}
                key={`${handle}-${index}`}
                mentionGroups={mentionGroups}
                onOpenGroup={onOpenGroup}
              />
            )}
            text={answer}
          />
        )}
        {!isThinking && sources.length > 0 ? (
          <AssistantSourceList
            onOpen={onOpenMessageCitation}
            sources={sources}
          />
        ) : null}
        <AssistantInlineTasks stream={stream} />
      </div>
    </article>
  )
}

type AssistantSourcePreview = {
  messageId: string
  key: string
  title: string
  meta: string
  attachment?: MessageCitationPreview['attachments'][number]
}

function buildAssistantSourcePreviews(
  evidence: Array<{ attachmentId?: string; messageId?: string; quote: string; reason?: string }>,
  messageCitations: Map<string, MessageCitationPreview>,
  labels: { messageFrom: string },
) {
  const sources: Array<AssistantSourcePreview> = []
  const seen = new Set<string>()

  for (const item of evidence) {
    if (!item.messageId) continue

    const message = messageCitations.get(item.messageId)
    if (!message) continue

    const attachment = item.attachmentId
      ? message.attachments.find((candidate) => candidate.id === item.attachmentId)
      : message.body
        ? undefined
        : message.attachments[0]
    const key = `${item.messageId}:${attachment?.id ?? 'message'}`
    if (seen.has(key)) continue
    seen.add(key)

    if (attachment) {
      sources.push({
        attachment,
        key,
        messageId: item.messageId,
        meta: formatSourceMeta(message.author, item.quote || attachment.contentType),
        title: formatAttachmentSourceTitle(attachment, message.attachments.length),
      })
      continue
    }

    const preview = item.quote || message.body
    sources.push({
      key,
      messageId: item.messageId,
      meta: formatSourceMeta(
        formatTime(message.createdAt),
        preview,
      ),
      title: `${labels.messageFrom} ${message.author}`,
    })
  }

  return sources.slice(0, 6)
}

function formatAttachmentSourceTitle(
  attachment: MessageCitationPreview['attachments'][number],
  attachmentCount: number,
) {
  const suffix = attachmentCount > 1 ? ` + ${formatNumber(attachmentCount - 1)}` : ''
  return `${attachment.filename}${suffix}`
}

function formatSourceMeta(label: string, detail: string) {
  const compactDetail = detail.replace(/\s+/g, ' ').trim()
  return compactDetail ? `${label} · ${compactDetail}` : label
}

function AssistantSourceList({
  onOpen,
  sources,
}: {
  onOpen: (messageId: Id<'messages'> | string) => void
  sources: Array<AssistantSourcePreview>
}) {
  const { t } = useTranslation('workspace')
  return (
    <div className="track-assistant-sources" aria-label={t('assistant.sources')}>
      <span className="track-assistant-sources-label">{t('assistant.sources')}</span>
      <div className="track-assistant-source-list">
        {sources.map((source) => (
          <button
            className="track-assistant-source-card"
            key={source.key}
            onClick={() => onOpen(source.messageId)}
            type="button"
          >
            <span className="track-assistant-source-icon">
              {source.attachment ? (
                <AttachmentTypeIcon
                  contentType={source.attachment.contentType}
                  filename={source.attachment.filename}
                  size={15}
                />
              ) : (
                <MessageSquare size={15} />
              )}
            </span>
            <span className="track-assistant-source-main">
              <strong>{source.title}</strong>
              <small>{source.meta}</small>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

function TextShimmer({ children }: { children: string }) {
  return (
    <span className="track-text-shimmer" aria-label={children}>
      {children}
    </span>
  )
}

function MessageCitation({
  citationId,
  index,
  message,
  onOpen,
}: {
  citationId: string
  index: number
  message?: MessageCitationPreview
  onOpen: (messageId: Id<'messages'> | string) => void
}) {
  const { t } = useTranslation('workspace')
  if (!message) {
    return (
      <span className="track-citation-chip" key={`${citationId}-${index}`}>
        {t('assistant.source')}
      </span>
    )
  }

  return (
    <button
      className="track-citation-chip"
      key={`${citationId}-${index}`}
      onClick={() => onOpen(citationId)}
      type="button"
    >
      <span className="track-citation-source">
        {message.author} ·{' '}
        {formatTime(message.createdAt)}
      </span>
      <span className="track-citation-preview">{message.body || formatCitationAttachmentLabel(message.attachments, t('assistant.attachmentMessage'))}</span>
    </button>
  )
}

function formatCitationAttachmentLabel(attachments: MessageCitationPreview['attachments'], attachmentMessage: string) {
  if (attachments.length === 0) return attachmentMessage
  if (attachments.length === 1) return attachments[0]?.filename ?? attachmentMessage
  return `${attachments[0]?.filename ?? attachmentMessage} + ${formatNumber(attachments.length - 1)}`
}
