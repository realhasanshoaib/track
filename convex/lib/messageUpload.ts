import type { Doc, Id } from '../_generated/dataModel'
import type { MutationCtx } from '../_generated/server'

export type MessageUploadMetadata = {
  filename: string
  contentType: string
  size: number
  kind?: Doc<'messageUploadIntents'>['kind']
  durationMs?: number
}

export type MessageUploadScope = {
  projectId: Id<'projects'>
  groupId: Id<'groups'>

  uploaderId: Id<'users'>
  uploaderProjectMemberId: Id<'projectMembers'>
  actingCompanyId?: Id<'companies'>
}

function matchesScope(
  intent: Doc<'messageUploadIntents'>,
  scope: MessageUploadScope,
) {
  return intent.projectId === scope.projectId &&
    intent.groupId === scope.groupId &&
    intent.uploaderId === scope.uploaderId &&
    intent.uploaderProjectMemberId === scope.uploaderProjectMemberId &&
    intent.actingCompanyId === scope.actingCompanyId
}

function matchesMetadata(
  intent: Doc<'messageUploadIntents'>,
  metadata: MessageUploadMetadata,
) {
  return intent.filename === metadata.filename &&
    intent.contentType === metadata.contentType &&
    intent.size === metadata.size &&
    intent.kind === metadata.kind &&
    intent.durationMs === metadata.durationMs
}

async function requireIntent(
  ctx: MutationCtx,
  intentId: Id<'messageUploadIntents'>,
  scope: MessageUploadScope,
  metadata: MessageUploadMetadata,
  messageId?: Id<'messages'>,
) {
  const intent = await ctx.db.get(intentId)
  if (!intent) throw new Error('upload_intent_not_found')
  if (!matchesScope(intent, scope)) throw new Error('upload_intent_scope_mismatch')
  if (intent.expiresAt <= Date.now() && intent.status !== 'claimed') {
    throw new Error('upload_intent_expired')
  }
  if (!matchesMetadata(intent, metadata)) throw new Error('upload_intent_metadata_mismatch')
  if (
    intent.status !== 'uploaded' &&
    !(intent.status === 'claimed' && intent.messageId === messageId)
  ) {
    throw new Error('upload_intent_not_ready')
  }
  if (!intent.storageId) throw new Error('upload_intent_not_uploaded')
  const storage = await ctx.db.system.get('_storage', intent.storageId)
  if (!storage) throw new Error('attachment_storage_missing')
  if (
    storage.size !== intent.size ||
    (storage.contentType !== undefined && storage.contentType !== intent.contentType)
  ) {
    throw new Error('attachment_metadata_mismatch')
  }
  return intent
}

export async function markMessageUploadAsUploaded(
  ctx: MutationCtx,
  input: {
    intentId: Id<'messageUploadIntents'>
    scope: MessageUploadScope
    storageId: Id<'_storage'>
  },
) {
  const intent = await ctx.db.get(input.intentId)
  if (!intent) throw new Error('upload_intent_not_found')
  if (!matchesScope(intent, input.scope)) throw new Error('upload_intent_scope_mismatch')
  if (intent.status === 'abandoned') throw new Error('upload_intent_expired')
  if (intent.storageId) {
    if (intent.storageId !== input.storageId) throw new Error('upload_intent_storage_mismatch')
    return intent
  }
  if (intent.status !== 'issued') throw new Error('upload_intent_not_ready')
  if (intent.expiresAt <= Date.now()) throw new Error('upload_intent_expired')
  const metadata = await ctx.db.system.get('_storage', input.storageId)
  if (!metadata) throw new Error('attachment_storage_missing')
  if (
    metadata.size !== intent.size ||
    (metadata.contentType !== undefined && metadata.contentType !== intent.contentType)
  ) {
    throw new Error('attachment_metadata_mismatch')
  }
  const [intentClaim, attachmentClaim] = await Promise.all([
    ctx.db
      .query('messageUploadIntents')
      .withIndex('by_storage', (q) => q.eq('storageId', input.storageId))
      .first(),
    ctx.db
      .query('attachments')
      .withIndex('by_storage', (q) => q.eq('storageId', input.storageId))
      .first(),
  ])
  if (intentClaim && intentClaim._id !== intent._id) {
    throw new Error('attachment_storage_already_claimed')
  }
  if (attachmentClaim) throw new Error('attachment_storage_already_claimed')
  await ctx.db.patch(intent._id, {
    storageId: input.storageId,
    status: 'uploaded',
    updatedAt: Date.now(),
  })
  const uploaded = await ctx.db.get(intent._id)
  if (!uploaded) throw new Error('upload_intent_not_found')
  return uploaded
}

export async function resolveMessageUploadIntent(
  ctx: MutationCtx,
  input: {
    intentId: Id<'messageUploadIntents'>
    scope: MessageUploadScope
    metadata: MessageUploadMetadata
    messageId?: Id<'messages'>
  },
) {
  return await requireIntent(ctx, input.intentId, input.scope, input.metadata, input.messageId)
}

export async function claimMessageUploadIntent(
  ctx: MutationCtx,
  input: {
    intentId: Id<'messageUploadIntents'>
    scope: MessageUploadScope
    metadata: MessageUploadMetadata
    messageId: Id<'messages'>
  },
) {
  const intent = await requireIntent(
    ctx,
    input.intentId,
    input.scope,
    input.metadata,
    input.messageId,
  )
  if (intent.status === 'claimed') return intent
  const now = Date.now()
  await ctx.db.patch(intent._id, {
    status: 'claimed',
    messageId: input.messageId,
    claimedAt: now,
    updatedAt: now,
  })
  const claimed = await ctx.db.get(intent._id)
  if (!claimed) throw new Error('upload_intent_not_found')
  return claimed
}
