import type { Id } from '../../../../../../convex/_generated/dataModel'
import type { PendingWorkspaceAttachment } from '#/features/workspace/hooks/usePendingAttachments'
import type { WorkspaceMentionOption } from '#/features/workspace/lib/mentions'

export type UploadedPendingAttachment = {
  contentType: string
  durationMs?: number
  filename: string
  kind: PendingWorkspaceAttachment['kind']
  size: number
  storageId: Id<'_storage'>
}

export function resolveMentionedUserIds(
  mentionHandles: Array<string>,
  mentionOptions: Array<WorkspaceMentionOption>,
) {
  const mentionedUserIds: Array<Id<'users'>> = []
  for (const handle of mentionHandles) {
    const option = mentionOptions.find((item) => item.kind === 'member' && item.handle === handle)
    if (option?.kind === 'member') mentionedUserIds.push(option.id)
  }
  return mentionedUserIds
}

export function getAttachmentNotificationPreview({
  body,
  pendingAttachments,
}: {
  body: string
  pendingAttachments: Array<PendingWorkspaceAttachment>
}, labels: { voiceNote: string; attachment: string } = {
  attachment: 'Sent an attachment.',
  voiceNote: 'Sent a voice note.',
}) {
  if (body) return undefined
  if (pendingAttachments.some((attachment) => attachment.kind === 'voice_note')) return labels.voiceNote
  if (pendingAttachments.length > 0) return labels.attachment
  return undefined
}

export async function uploadPendingAttachments({
  activeGroupId,
  generateUploadUrl,
  pendingAttachments,
  trackUserId,
}: {
  activeGroupId: Id<'groups'>
  generateUploadUrl: (input: { groupId: Id<'groups'>; userId: Id<'users'> }) => Promise<string>
  pendingAttachments: Array<PendingWorkspaceAttachment>
  trackUserId: Id<'users'>
}): Promise<Array<UploadedPendingAttachment>> {
  return await Promise.all(pendingAttachments.map(async (pendingAttachment) => {
    const uploadUrl = await generateUploadUrl({
      groupId: activeGroupId,
      userId: trackUserId,
    })
    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: { 'Content-Type': pendingAttachment.file.type || 'application/octet-stream' },
      body: pendingAttachment.file,
    })
    if (!uploadResponse.ok) throw new Error('upload_failed')
    const { storageId } = (await uploadResponse.json()) as { storageId: Id<'_storage'> }
    return {
      contentType: pendingAttachment.file.type || 'application/octet-stream',
      durationMs: pendingAttachment.durationMs,
      filename: pendingAttachment.file.name,
      kind: pendingAttachment.kind,
      size: pendingAttachment.file.size,
      storageId,
    }
  }))
}
