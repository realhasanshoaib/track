import { parseMentions } from '@track/shared'
import { useMutation, useQuery } from 'convex/react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { api } from '../../../../../../convex/_generated/api'
import type { Id } from '../../../../../../convex/_generated/dataModel'
import {
  getAttachmentNotificationPreview,
  type UploadedPendingAttachment,
  uploadPendingAttachment,
} from '#/features/workspace/chat/message-send'
import {
  createMessageSendAttempt,
  runMessageSendAttempt,
  type MessageSendAttempt,
} from '#/features/workspace/chat/message-send-retry'
import {
  readComposerDraft,
  writeComposerDraft,
} from '#/features/workspace/chat/composer-drafts'
import type { ScopedComposerContext } from '#/features/workspace/chat/composer-scope'
import { resolveScopedMentionRecipients } from '#/features/workspace/chat/scoped-message-send'
import {
  ConversationComposer,
  type ConversationComposerReply,
} from '#/features/workspace/components/ConversationComposer'
import { usePendingAttachments } from '#/features/workspace/hooks/usePendingAttachments'
import type { GroupReference } from '#/features/workspace/group-types'
import { getActiveMention } from '#/features/workspace/identity'
import {
  buildMentionSections,
  buildWorkspaceMentionOptions,
  filterMentionOptions,
} from '#/features/workspace/lib/mentions'
import { emojiGroups } from '#/features/workspace/workspace-page-config'

export type { ScopedComposerContext } from '#/features/workspace/chat/composer-scope'

export type ScopedConversationComposerProps = {
  actorId: Id<'users'>
  channelThreadId?: Id<'channelThreads'>
  className?: string
  context?: ScopedComposerContext
  group: Pick<GroupReference, '_id' | 'name'>
  onBusyChange?: (busyAction: string | null) => void
  onError?: (error: unknown) => void
  onReplyChange: (reply: ConversationComposerReply | null) => void
  onSent?: () => void
  placeholder?: string
  projectId: Id<'projects'>
  replyTo: ConversationComposerReply | null
  visibleGroups: Array<GroupReference>
}

export function ScopedConversationComposer(props: ScopedConversationComposerProps) {
  const scopeKey = [
    props.actorId,
    props.projectId,
    props.group._id,
    props.channelThreadId ?? 'channel',
    props.context?.actingCompanyId ?? 'legacy',
    props.context?.projectMemberId ?? 'legacy',
  ].join(':')
  return <ScopedConversationComposerSession key={scopeKey} {...props} />
}

function ScopedConversationComposerSession({
  actorId,
  channelThreadId,
  className,
  context,
  group,
  onBusyChange,
  onError,
  onReplyChange,
  onSent,
  placeholder,
  projectId,
  replyTo,
  visibleGroups,
}: ScopedConversationComposerProps) {
  const sendMessage = useMutation(api.messages.send)
  const generateUploadUrl = useMutation(api.messages.generateUploadUrl)
  const claimUploadIntent = useMutation(api.messages.claimUploadIntent)
  const attachFile = useMutation(api.messages.attachFile)
  const channelMembers = useQuery(api.groups.listMembers, {
    actingCompanyId: context?.actingCompanyId,
    groupId: group._id,
    projectMemberId: context?.projectMemberId,
    userId: actorId,
  })
  const composerDraftScope = useMemo(() => ({
    actorId,
    actingCompanyId: context?.actingCompanyId,
    projectMemberId: context?.projectMemberId,
    projectId,
    groupId: group._id,
    threadId: channelThreadId,
  }), [actorId, channelThreadId, context?.actingCompanyId, context?.projectMemberId, group._id, projectId])
  const [composer, setComposer] = useState(() => readComposerDraft(composerDraftScope)?.composer ?? '')
  const [composerCursor, setComposerCursor] = useState(0)
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false)
  const [mentionIndex, setMentionIndex] = useState(0)
  const [voiceRecordingActive, setVoiceRecordingActive] = useState(false)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const composerRef = useRef<HTMLTextAreaElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const mentionOptionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const mountedRef = useRef(true)
  const onBusyChangeRef = useRef(onBusyChange)
  const sendAttemptRef = useRef<
    MessageSendAttempt<Id<'messages'>, UploadedPendingAttachment> | null
  >(null)
  const attachments = usePendingAttachments({
    activeGroupId: group._id,
    composerRef,
    onAfterAdd: () => setEmojiPickerOpen(false),
  })
  const activeChannelMembers = useMemo(
    () =>
      (channelMembers ?? []).flatMap((member) =>
        member.user ? [{ membership: member.membership, user: member.user }] : [],
      ),
    [channelMembers],
  )
  const mentionOptions = useMemo(
    () => buildWorkspaceMentionOptions(activeChannelMembers, visibleGroups),
    [activeChannelMembers, visibleGroups],
  )
  const activeMention = useMemo(
    () => getActiveMention(composer, composerCursor),
    [composer, composerCursor],
  )
  const filteredMentionOptions = useMemo(
    () => (activeMention ? filterMentionOptions(mentionOptions, activeMention.query) : []),
    [activeMention, mentionOptions],
  )
  const mentionSections = useMemo(
    () => buildMentionSections(filteredMentionOptions),
    [filteredMentionOptions],
  )
  const showMentionMenu = activeMention !== null && filteredMentionOptions.length > 0

  useEffect(() => {
    onBusyChangeRef.current = onBusyChange
  }, [onBusyChange])

  useEffect(() => {
    writeComposerDraft(composerDraftScope, {
      composer,
      replyToMessageId: replyTo?.messageId ?? null,
    })
  }, [composer, composerDraftScope, replyTo?.messageId])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      onBusyChangeRef.current?.(null)
    }
  }, [])

  useEffect(() => {
    setMentionIndex(0)
  }, [activeMention?.query])

  useEffect(() => {
    mentionOptionRefs.current[mentionIndex]?.scrollIntoView({ block: 'nearest' })
  }, [mentionIndex])

  function changeBusyAction(next: string | null) {
    if (!mountedRef.current) return
    setBusyAction(next)
    onBusyChange?.(next)
  }

  function reportError(error: unknown) {
    if (!mountedRef.current) return
    if (onError) {
      onError(error)
      return
    }
    setLocalError(error instanceof Error ? error.message.replaceAll('_', ' ') : 'The action failed.')
  }

  function handleComposerSelection() {
    setComposerCursor(composerRef.current?.selectionStart ?? composer.length)
  }

  function handleMentionSelect(option: { handle: string }) {
    if (!activeMention) return
    const nextComposer = `${composer.slice(0, activeMention.start)}@${option.handle} ${composer.slice(activeMention.end)}`
    const nextCursor = activeMention.start + option.handle.length + 2
    setComposer(nextComposer)
    setComposerCursor(nextCursor)
    setMentionIndex(0)
    requestAnimationFrame(() => {
      composerRef.current?.focus()
      composerRef.current?.setSelectionRange(nextCursor, nextCursor)
    })
  }

  function insertComposerText(text: string) {
    const cursor = composerRef.current?.selectionStart ?? composerCursor
    const nextComposer = `${composer.slice(0, cursor)}${text}${composer.slice(cursor)}`
    const nextCursor = cursor + text.length
    setComposer(nextComposer)
    setComposerCursor(nextCursor)
    requestAnimationFrame(() => {
      composerRef.current?.focus()
      composerRef.current?.setSelectionRange(nextCursor, nextCursor)
    })
  }

  async function handleSendMessage() {
    if (busyAction) return
    const body = composer.trim()
    const pendingAttachments = attachments.pendingAttachments
    if (!body && pendingAttachments.length === 0) return

    changeBusyAction('send-message')
    setLocalError(null)
    try {
      const mentionHandles = parseMentions(body)
      const recipients = resolveScopedMentionRecipients(
        mentionHandles,
        mentionOptions,
        activeChannelMembers,
      )
      const sendSignature = JSON.stringify({
        attachmentIds: pendingAttachments.map((attachment) => attachment.id),
        body,
        replyToMessageId: replyTo?.messageId ?? null,
      })
      let attempt = sendAttemptRef.current
      if (!attempt || attempt.signature !== sendSignature) {
        attempt = createMessageSendAttempt<Id<'messages'>, UploadedPendingAttachment>(
          sendSignature,
          crypto.randomUUID(),
        )
        sendAttemptRef.current = attempt
      }
      await runMessageSendAttempt({
        attach: async (messageId, attachment) => {
          await attachFile({
            ...context,
            contentType: attachment.contentType,
            durationMs: attachment.durationMs,
            filename: attachment.filename,
            groupId: group._id,
            kind: attachment.kind,
            messageId,
            projectId,
            size: attachment.size,
            storageId: attachment.storageId,
            uploadIntentId: attachment.uploadIntentId,
            userId: actorId,
          })
        },
        attempt,
        pendingAttachments,
        send: async (idempotencyKey) =>
          await sendMessage({
            ...context,
            authorId: actorId,
            body,
            channelThreadId,
            groupId: group._id,
            idempotencyKey,
            mentionedProjectMemberIds: context
              ? recipients.mentionedProjectMemberIds
              : undefined,
            mentions: recipients.mentionedUserIds,
            notificationPreview: getAttachmentNotificationPreview({
              body,
              pendingAttachments,
            }),
            projectId,
            replyToMessageId: replyTo?.messageId,
          }),
        upload: async (pendingAttachment) =>
          await uploadPendingAttachment({
            activeGroupId: group._id,
            claimUploadIntent: async (input) =>
              await claimUploadIntent({
                ...input,
                ...context,
              }),
            generateUploadUrl: async (input) =>
              await generateUploadUrl({
                ...input,
                ...context,
                channelThreadId,
              }),
            intentKey: attempt.idempotencyKey,
            pendingAttachment,
            trackUserId: actorId,
          }),
      })
      if (!mountedRef.current) return
      sendAttemptRef.current = null
      setComposer('')
      setComposerCursor(0)
      attachments.clearPendingAttachments()
      onReplyChange(null)
      onSent?.()
      requestAnimationFrame(() => composerRef.current?.focus({ preventScroll: true }))
    } catch (error) {
      reportError(error)
    } finally {
      changeBusyAction(null)
    }
  }

  return (
    <>
      {localError ? (
        <div className="track-error" role="alert">
          {localError}
        </div>
      ) : null}
      <input
        aria-label="Attach files"
        className="sr-only"
        multiple
        onChange={attachments.handleFileSelected}
        ref={fileInputRef}
        type="file"
      />
      <ConversationComposer
        ariaLabel={channelThreadId ? `Reply in ${group.name}` : `Message ${group.name}`}
        available={!busyAction}
        busyAction={busyAction}
        className={className}
        composer={composer}
        composerRef={composerRef}
        emojiGroups={emojiGroups}
        emojiPickerOpen={emojiPickerOpen}
        filteredMentionOptions={filteredMentionOptions}
        mentionIndex={mentionIndex}
        mentionOptionRefs={mentionOptionRefs}
        mentionSections={mentionSections}
        onAddAttachment={() => fileInputRef.current?.click()}
        onComposerBlur={handleComposerSelection}
        onComposerChange={(value, cursor) => {
          setComposer(value)
          setComposerCursor(cursor)
        }}
        onComposerFocus={handleComposerSelection}
        onComposerKeyUp={handleComposerSelection}
        onComposerPaste={attachments.handleComposerPaste}
        onComposerSelect={handleComposerSelection}
        onEmojiPickerOpenChange={setEmojiPickerOpen}
        onInsertComposerText={insertComposerText}
        onMentionIndexChange={setMentionIndex}
        onMentionSelect={handleMentionSelect}
        onRecordingChange={setVoiceRecordingActive}
        onReplyChange={onReplyChange}
        onSendMessage={() => void handleSendMessage()}
        onShowMentionMenuClose={() => setComposerCursor(0)}
        onVoiceNoteRecorded={attachments.handleVoiceNoteRecorded}
        pendingAttachments={attachments.pendingAttachments}
        placeholder={placeholder ?? (channelThreadId ? 'Reply in thread' : `Message #${group.name}`)}
        removePendingAttachment={attachments.removePendingAttachment}
        replyTo={replyTo}
                setComposerCursorFromRef={handleComposerSelection}
        showMentionMenu={showMentionMenu}
        voiceRecordingActive={voiceRecordingActive}
      />
    </>
  )
}
