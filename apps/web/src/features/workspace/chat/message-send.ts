import type { Id } from '../../../../../../convex/_generated/dataModel'
import type { PendingWorkspaceAttachment } from '#/features/workspace/hooks/usePendingAttachments'

export type UploadedPendingAttachment = {
  contentType: string
  durationMs?: number
  filename: string
  kind: PendingWorkspaceAttachment['kind']
  size: number
  storageId: Id<'_storage'>
  uploadIntentId: Id<'messageUploadIntents'>
}

export type UploadIntentResponse = {
  expiresAt: number
  intentId: Id<'messageUploadIntents'>
  status: 'issued' | 'uploaded' | 'claimed'
  storageId: Id<'_storage'> | null
  uploadUrl: string | null
}

export type GenerateUploadUrlInput = {
  actingCompanyId?: Id<'companies'>
  channelThreadId?: Id<'channelThreads'>
  contentType: string
  durationMs?: number
  filename: string
  groupId: Id<'groups'>
  intentKey: string
  kind?: PendingWorkspaceAttachment['kind']
  projectMemberId?: Id<'projectMembers'>
  size: number
  userId: Id<'users'>
}

export type ClaimUploadIntentInput = {
  actingCompanyId?: Id<'companies'>
  intentId: Id<'messageUploadIntents'>
  projectMemberId?: Id<'projectMembers'>
  storageId: Id<'_storage'>
  userId: Id<'users'>
}

export function isUploadResponse(value: unknown): value is { storageId: Id<'_storage'> } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'storageId' in value &&
    typeof value.storageId === 'string' &&
    value.storageId.length > 0
  )
}

export function resolveMentionedUserIds<UserId>(
  mentionHandles: Array<string>,
  mentionOptions: ReadonlyArray<
    | { kind: 'member'; handle: string; id: UserId }
    | { kind: 'group'; handle: string }
  >,
) {
  const mentionedUserIds: Array<UserId> = []
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
}) {
  if (body) return undefined
  if (pendingAttachments.some((attachment) => attachment.kind === 'voice_note')) return 'Sent a voice note.'
  if (pendingAttachments.length > 0) return 'Sent an attachment.'
  return undefined
}

export async function uploadPendingAttachments({
  activeGroupId,
  claimUploadIntent,
  generateUploadUrl,
  intentKey,
  pendingAttachments,
  trackUserId,
}: {
  activeGroupId: Id<'groups'>
  claimUploadIntent: (input: ClaimUploadIntentInput) => Promise<unknown>
  generateUploadUrl: (input: GenerateUploadUrlInput) => Promise<UploadIntentResponse>
  intentKey: string
  pendingAttachments: Array<PendingWorkspaceAttachment>
  trackUserId: Id<'users'>
}): Promise<Array<UploadedPendingAttachment>> {
  return await Promise.all(
    pendingAttachments.map(
      async (pendingAttachment) =>
        await uploadPendingAttachment({
          activeGroupId,
          claimUploadIntent,
          generateUploadUrl,
          intentKey,
          pendingAttachment,
          trackUserId,
        }),
    ),
  )
}

export async function uploadPendingAttachment({
  activeGroupId,
  claimUploadIntent,
  generateUploadUrl,
  intentKey,
  pendingAttachment,
  trackUserId,
}: {
  activeGroupId: Id<'groups'>
  claimUploadIntent: (input: ClaimUploadIntentInput) => Promise<unknown>
  generateUploadUrl: (input: GenerateUploadUrlInput) => Promise<UploadIntentResponse>
  intentKey: string
  pendingAttachment: PendingWorkspaceAttachment
  trackUserId: Id<'users'>
}): Promise<UploadedPendingAttachment> {
  const contentType = pendingAttachment.file.type || 'application/octet-stream'
  const intent = await generateUploadUrl({
    contentType,
    durationMs: pendingAttachment.durationMs,
    filename: pendingAttachment.file.name,
    groupId: activeGroupId,
    intentKey: `${intentKey}:${pendingAttachment.id}`,
    kind: pendingAttachment.kind,
    size: pendingAttachment.file.size,
    userId: trackUserId,
  })
  let storageId = intent.storageId
  if (!storageId) {
    if (!intent.uploadUrl) throw new Error('upload_intent_unavailable')
    const uploadResponse = await fetch(intent.uploadUrl, {
      method: 'POST',
      headers: { 'Content-Type': contentType },
      body: pendingAttachment.file,
    })
    if (!uploadResponse.ok) throw new Error('upload_failed')
    const uploadResult: unknown = await uploadResponse.json()
    if (!isUploadResponse(uploadResult)) throw new Error('upload_response_invalid')
    storageId = uploadResult.storageId
    await claimUploadIntent({
      intentId: intent.intentId,
      storageId,
      userId: trackUserId,
    })
  }
  return {
    contentType,
    durationMs: pendingAttachment.durationMs,
    filename: pendingAttachment.file.name,
    kind: pendingAttachment.kind,
    size: pendingAttachment.file.size,
    storageId,
    uploadIntentId: intent.intentId,
  }
}
