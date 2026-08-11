import { CornerUpLeft, CornerUpRight, MoreHorizontal, Paperclip, Search, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import '#/i18n'

import type { Doc, Id } from '../../../../../../convex/_generated/dataModel'
import { Button } from '#/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from '#/components/ui/dropdown-menu'
import { Input } from '#/components/ui/input'
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from '#/components/ui/popover'
import { Textarea } from '#/components/ui/textarea'
import { formatNumber } from '#/i18n'
import type { GroupMessageItem, ReplyToMessagePreview } from '../thread-item-components'
import { getGroupAvatar } from '../group-avatar'
import { CreateTaskFromMessage } from '#/features/tasks/ConversationTaskActions'

export function MessageActions({
  activeGroupId,
  busyAction,
  canDelete,
  canForward,
  groups,
  item,
  onDeleteMessage,
  onForwardMessage,
  onReplyMessage,
}: {
  activeGroupId: Id<'groups'> | null
  busyAction: string | null
  canDelete: boolean
  canForward: boolean
  groups: Array<Doc<'groups'>>
  item: GroupMessageItem
  onDeleteMessage: (messageId: Id<'messages'>) => Promise<boolean>
  onForwardMessage: (input: {
    sourceMessageId: Id<'messages'>
    targetGroupId: Id<'groups'>
    body: string
  }) => Promise<boolean>
  onReplyMessage: (item: GroupMessageItem) => void
}) {
  const { t } = useTranslation('workspace')
  return (
    <div className="track-message-actions" aria-label={t('message.actions')}>
      <Button
        aria-label={t('message.replyTo')}
        className="icon-button track-message-action-button"
        onClick={() => onReplyMessage(item)}
        title={t('common.reply')}
        type="button"
      >
        <CornerUpLeft size={14} />
      </Button>
      <ForwardMessagePopover
        activeGroupId={activeGroupId}
        busyAction={busyAction}
        canForward={canForward}
        groups={groups}
        item={item}
        onForwardMessage={onForwardMessage}
      />
      <CreateTaskFromMessage message={item.message} />
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              aria-label={t('message.moreActions')}
              className="icon-button track-message-action-button"
              title={t('common.more')}
              type="button"
            />
          }
        >
          <MoreHorizontal size={14} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="track-message-menu">
          <DropdownMenuGroup>
            <DropdownMenuItem
              onClick={() => {
                const text = item.message.body || item.forwardedFrom?.originalBody || ''
                if (text) void navigator.clipboard?.writeText(text)
              }}
            >
              {t('message.copyText')}
            </DropdownMenuItem>
            {canDelete ? (
              <DropdownMenuItem
                disabled={busyAction === `delete-${item.message._id}`}
                onClick={() => {
                  if (!window.confirm(t('message.deleteConfirm'))) return
                  void onDeleteMessage(item.message._id)
                }}
                variant="destructive"
              >
                <Trash2 />
                {t('message.delete')}
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function ForwardMessagePopover({
  activeGroupId,
  busyAction,
  canForward,
  groups,
  item,
  onForwardMessage,
}: {
  activeGroupId: Id<'groups'> | null
  busyAction: string | null
  canForward: boolean
  groups: Array<Doc<'groups'>>
  item: GroupMessageItem
  onForwardMessage: (input: {
    sourceMessageId: Id<'messages'>
    targetGroupId: Id<'groups'>
    body: string
  }) => Promise<boolean>
}) {
  const { t } = useTranslation('workspace')
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [note, setNote] = useState('')
  const [activeTargetIndex, setActiveTargetIndex] = useState(0)
  const targetButtonRefs = useRef<Array<HTMLButtonElement | null>>([])
  const targetGroups = groups
    .filter((group) => group._id !== item.message.groupId)
    .filter((group) => group.name.toLowerCase().includes(query.trim().toLowerCase()))
  const isForwarding = busyAction === `forward-${item.message._id}`
  useEffect(() => {
    setActiveTargetIndex(0)
  }, [query, open])
  useEffect(() => {
    targetButtonRefs.current = targetButtonRefs.current.slice(0, targetGroups.length)
  }, [targetGroups.length])
  async function handleForward(targetGroupId: Id<'groups'>) {
    const forwarded = await onForwardMessage({
      sourceMessageId: item.message._id,
      targetGroupId,
      body: note,
    })
    if (!forwarded) return
    setOpen(false)
    setQuery('')
    setNote('')
  }
  function focusTargetAt(index: number) {
    if (targetGroups.length === 0) return
    const nextIndex = (index + targetGroups.length) % targetGroups.length
    setActiveTargetIndex(nextIndex)
    targetButtonRefs.current[nextIndex]?.focus()
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={!activeGroupId || !canForward}
        render={
          <Button
            aria-label={t('message.forward')}
            className="icon-button track-message-action-button"
            title={t('message.forward')}
            type="button"
          />
        }
      >
        <CornerUpRight size={14} />
      </PopoverTrigger>
      <PopoverContent align="end" className="track-forward-popover" side="top" sideOffset={8}>
        <PopoverHeader>
          <PopoverTitle>{t('message.forwardToChannel')}</PopoverTitle>
          <PopoverDescription>{t('message.forwardDescription')}</PopoverDescription>
        </PopoverHeader>
        <div className="track-forward-search">
          <Search size={13} />
          <Input
            aria-label={t('message.searchChannels')}
            autoComplete="off"
            onChange={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                focusTargetAt(0)
              }
            }}
            placeholder={t('message.searchChannelsPlaceholder')}
            value={query}
          />
        </div>
        <ForwardPreview item={item} />
        <Textarea
          aria-label={t('message.forwardingNote')}
          className="track-forward-note"
          onChange={(event) => setNote(event.currentTarget.value)}
          placeholder={t('message.forwardingNotePlaceholder')}
          value={note}
        />
        <div
          aria-label={t('message.forwardTargets')}
          className="track-forward-targets"
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              focusTargetAt(activeTargetIndex + 1)
              return
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault()
              focusTargetAt(activeTargetIndex - 1)
              return
            }
            if (event.key === 'Home') {
              event.preventDefault()
              focusTargetAt(0)
              return
            }
            if (event.key === 'End') {
              event.preventDefault()
              focusTargetAt(targetGroups.length - 1)
            }
          }}
          role="listbox"
        >
          {targetGroups.length > 0 ? (
            targetGroups.map((group, index) => {
              const { Icon, tone } = getGroupAvatar(group)
              return (
                <button
                  aria-label={t('message.forwardTo', { channel: group.name })}
                  aria-selected={activeTargetIndex === index}
                  className="track-forward-target"
                  disabled={isForwarding}
                  key={group._id}
                  onClick={() => void handleForward(group._id)}
                  onFocus={() => setActiveTargetIndex(index)}
                  ref={(node) => {
                    targetButtonRefs.current[index] = node
                  }}
                  role="option"
                  tabIndex={index === activeTargetIndex ? 0 : -1}
                  type="button"
                >
                  <span className={`track-nav-group-icon ${tone}`}>
                    <Icon size={14} />
                  </span>
                  <span>
                    <strong>{group.name}</strong>
                    <small>{t('dialogs.channelKind', { kind: group.kind.replaceAll('_', ' ') })}</small>
                  </span>
                  <CornerUpRight size={13} />
                </button>
              )
            })
          ) : (
            <div className="track-forward-empty">
              <strong>{t('message.noForwardChannels')}</strong>
              <span>{t('message.noForwardChannelsDescription')}</span>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function QuotedMessageBlock({ quote }: { quote: ReplyToMessagePreview }) {
  const { t } = useTranslation('workspace')
  return (
    <div className="track-message-quote">
      <span>{quote.authorName}</span>
      <p>{quote.body || t('chat.attachmentMessage')}</p>
    </div>
  )
}

function ForwardPreview({ item }: { item: GroupMessageItem }) {
  const { t } = useTranslation('workspace')
  const authorName = item.author?.displayName ?? t('chat.unknownMember')
  const attachmentCount = item.attachments.length
  return (
    <div className="track-forward-preview">
      <span>{authorName}</span>
      <p>{item.message.body || t('chat.attachmentMessage')}</p>
      {attachmentCount > 0 ? (
        <small>
          <Paperclip size={12} />
          {t('message.attachmentsWillBeCopied', { count: formatNumber(attachmentCount) })}
        </small>
      ) : null}
    </div>
  )
}
