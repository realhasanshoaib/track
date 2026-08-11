import { useAction, useMutation } from 'convex/react'
import { useTranslation } from 'react-i18next'

import { api } from '../../../../../../convex/_generated/api'
import type { Id } from '../../../../../../convex/_generated/dataModel'
import { parseMentions } from '@track/shared'
import {
  getAttachmentNotificationPreview,
  resolveMentionedUserIds,
  uploadPendingAttachments,
} from '#/features/workspace/chat/message-send'
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
  const { t } = useTranslation('workspace')
  const sendMessageMutation = useMutation(api.messages.send)
  const forwardMessageMutation = useMutation(api.messages.forwardMessage)
  const deleteMessageMutation = useMutation(api.messages.remove)
  const generateUploadUrl = useMutation(api.messages.generateUploadUrl)
  const attachFileMutation = useMutation(api.messages.attachFile)
  const askTrackAction = useAction(api.assistant.ask)

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
      const uploadedAttachments = await uploadPendingAttachments({
        activeGroupId,
        generateUploadUrl,
        pendingAttachments,
        trackUserId,
      })
      const messageId = await sendMessageMutation({
        projectId: activeProjectId,
        groupId: activeGroupId,
        authorId: trackUserId,
        body,
        mentions: mentionedUserIds,
        replyToMessageId: replyToMessage?.message._id,
        notificationPreview: getAttachmentNotificationPreview({
          body,
          pendingAttachments,
        }, {
          attachment: t('notifications.sentAttachment'),
          voiceNote: t('notifications.sentVoiceNote'),
        }),
      })
      for (const attachment of uploadedAttachments) {
        await attachFileMutation({
          projectId: activeProjectId,
          groupId: activeGroupId,
          messageId,
          userId: trackUserId,
          storageId: attachment.storageId,
          filename: attachment.filename,
          contentType: attachment.contentType,
          size: attachment.size,
          kind: attachment.kind,
          durationMs: attachment.durationMs,
        })
      }
      if (mentionHandles.includes('track')) {
        await askTrackAction({
          projectId: activeProjectId,
          groupId: activeGroupId,
          requesterId: trackUserId,
          promptMessageId: messageId,
          question: body,
        })
      }
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
      const messageId = await forwardMessageMutation({
        projectId: activeProjectId,
        sourceMessageId: input.sourceMessageId,
        targetGroupId: input.targetGroupId,
        actorId: trackUserId,
        body,
        mentions: mentionedUserIds,
      })
      if (mentionHandles.includes('track')) {
        await askTrackAction({
          projectId: activeProjectId,
          groupId: input.targetGroupId,
          requesterId: trackUserId,
          promptMessageId: messageId,
          question: body,
        })
      }
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
