import { useMutation } from 'convex/react'
import { useRef } from 'react'

import { api } from '../../../../../../convex/_generated/api'
import type { Id } from '../../../../../../convex/_generated/dataModel'
import { parseMentions } from '@track/shared'
import {
  getAttachmentNotificationPreview,
  resolveMentionedUserIds,
  type UploadedPendingAttachment,
  uploadPendingAttachment,
} from '#/features/workspace/chat/message-send'
import {
  createMessageSendAttempt,
  runMessageSendAttempt,
  type MessageSendAttempt,
} from '#/features/workspace/chat/message-send-retry'
import type { WorkspaceMentionOption } from '#/features/workspace/lib/mentions'
import type { GroupMessageItem } from '#/features/workspace/thread-items'
import type { PendingWorkspaceAttachment } from '#/features/workspace/hooks/usePendingAttachments'

export function useWorkspaceMessageActions({
  activeGroupId,
  activeProjectId,
  composer,
  forwardMentionOptions,
  mentionOptions,
  onAfterSend,
  onAfterDelete,
  onBusyChange,
  onClearError,
  onError,
  pendingAttachments,
  replyToMessage,
  trackUserId,
}: {
  activeGroupId: Id<'groups'> | null
  activeProjectId: Id<'projects'> | null
  composer: string
  forwardMentionOptions: Array<WorkspaceMentionOption>
  mentionOptions: Array<WorkspaceMentionOption>
  onAfterSend: () => void
  onAfterDelete: (messageId: Id<'messages'>) => void
  onBusyChange: (label: string | null) => void
  onClearError: () => void
  onError: (error: unknown) => void
  pendingAttachments: Array<PendingWorkspaceAttachment>
  replyToMessage: GroupMessageItem | null
  trackUserId: Id<'users'> | null
}) {
  const sendMessageMutation = useMutation(api.messages.send)
  const forwardMessageMutation = useMutation(api.messages.forwardMessage)
  const deleteMessageMutation = useMutation(api.messages.remove)
  const generateUploadUrl = useMutation(api.messages.generateUploadUrl)
  const claimUploadIntent = useMutation(api.messages.claimUploadIntent)
  const attachFileMutation = useMutation(api.messages.attachFile)
  const sendAttemptRef = useRef<MessageSendAttempt<Id<'messages'>, UploadedPendingAttachment> | null>(null)

  async function withMessageBusy(label: string, action: () => Promise<void>) {
    onBusyChange(label)
    onClearError()
    try {
      await action()
    } catch (error) {
      onError(error)
    } finally {
      onBusyChange(null)
    }
  }

  async function handleSendMessage() {
    if (!trackUserId || !activeProjectId || !activeGroupId) return
    const body = composer.trim()
    if (!body && pendingAttachments.length === 0) return
    await withMessageBusy('send-message', async () => {
      const mentionHandles = parseMentions(body)
      const mentionedUserIds = resolveMentionedUserIds(mentionHandles, mentionOptions)
      const sendSignature = JSON.stringify({
        activeGroupId,
        activeProjectId,
        attachmentIds: pendingAttachments.map((attachment) => attachment.id),
        body,
        replyToMessageId: replyToMessage?.message._id ?? null,
        trackUserId,
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
          await attachFileMutation({
            projectId: activeProjectId,
            groupId: activeGroupId,
            messageId,
            userId: trackUserId,
            uploadIntentId: attachment.uploadIntentId,
            storageId: attachment.storageId,
            filename: attachment.filename,
            contentType: attachment.contentType,
            size: attachment.size,
            kind: attachment.kind,
            durationMs: attachment.durationMs,
          })
        },
        attempt,
        pendingAttachments,
        send: async (idempotencyKey) =>
          await sendMessageMutation({
            projectId: activeProjectId,
            groupId: activeGroupId,
            authorId: trackUserId,
            body,
            idempotencyKey,
            mentions: mentionedUserIds,
            replyToMessageId: replyToMessage?.message._id,
            notificationPreview: getAttachmentNotificationPreview({
              body,
              pendingAttachments,
            }),
          }),
        upload: async (pendingAttachment) =>
          await uploadPendingAttachment({
            activeGroupId,
            claimUploadIntent: async (input) =>
              await claimUploadIntent({
                ...input,
                actingCompanyId: undefined,
                projectMemberId: undefined,
              }),
            generateUploadUrl: async (input) =>
              await generateUploadUrl(input),
            intentKey: attempt.idempotencyKey,
            pendingAttachment,
            trackUserId,
          }),
      })
      sendAttemptRef.current = null
      onAfterSend()
    })
  }

  async function handleForwardMessage(input: {
    sourceMessageId: Id<'messages'>
    targetGroupId: Id<'groups'>
    body: string
  }) {
    if (!trackUserId || !activeProjectId || !activeGroupId) return false
    onBusyChange(`forward-${input.sourceMessageId}`)
    onClearError()
    try {
      const body = input.body.trim()
      const mentionHandles = parseMentions(body)
      const mentionedUserIds = resolveMentionedUserIds(mentionHandles, forwardMentionOptions)
      await forwardMessageMutation({
        projectId: activeProjectId,
        sourceMessageId: input.sourceMessageId,
        targetGroupId: input.targetGroupId,
        actorId: trackUserId,
        body,
        mentions: mentionedUserIds,
      })
      return true
    } catch (error) {
      onError(error)
      return false
    } finally {
      onBusyChange(null)
    }
  }

  async function handleDeleteMessage(messageId: Id<'messages'>) {
    if (!trackUserId) return false
    onBusyChange(`delete-${messageId}`)
    onClearError()
    try {
      await deleteMessageMutation({ messageId, actorId: trackUserId })
      onAfterDelete(messageId)
      return true
    } catch (error) {
      onError(error)
      return false
    } finally {
      onBusyChange(null)
    }
  }

  return {
    handleDeleteMessage,
    handleForwardMessage,
    handleSendMessage,
  }
}
