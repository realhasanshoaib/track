import {
  resolveProjectAccessProfile,
  resolveReleaseFeatureFlag,
} from '@track/shared/feature-flags'
import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'

import { internalMutation, mutation, query } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'
import { internal } from './_generated/api'
import { appendAuditEvent } from './lib/audit'
import { listActiveChannelMemberships } from './lib/channelMembership'
import { rateLimiter } from './lib/rateLimit'
import { authorizeScopedRequest } from './lib/requestAuthorization'
import { invalidateTaskEvidence } from './lib/taskEvidence'
import {
  getArchivedChannelSnapshot,
  getArchivedMemberSnapshot,
  getArchivedThreadSnapshot,
} from './lib/projectExitArchive'
import {
  claimMessageUploadIntent,
  markMessageUploadAsUploaded,
  resolveMessageUploadIntent,
  type MessageUploadMetadata,
  type MessageUploadScope,
} from './lib/messageUpload'
import { assertProjectSnapshotWritable } from './lib/projectSnapshotLock'
import {
  allocateChannelSequence,
  assertReplyScope,
  followMentionedThreadMembers,
  requireThreadsEnabled,
  threadsEnabled,
  upsertThreadFollower,
} from './lib/channelThreadPolicy'

const attachmentKind = v.union(v.literal('file'), v.literal('voice_note'))
const previewErrorCode = v.union(
  v.literal('image_too_large'),
  v.literal('missing_source'),
  v.literal('not_an_image'),
  v.literal('processor_failed'),
)
const messageAttachment = v.object({
  uploadIntentId: v.id('messageUploadIntents'),
  filename: v.string(),
  contentType: v.string(),
  size: v.number(),
  kind: v.optional(attachmentKind),
  durationMs: v.optional(v.number()),
})
type MessageDetailCtx = QueryCtx | MutationCtx
type MessageAttachmentInput = {
  uploadIntentId: Id<'messageUploadIntents'>
  filename: string
  contentType: string
  size: number
  kind?: 'file' | 'voice_note'
  durationMs?: number
}

const UPLOAD_INTENT_TTL_MS = 15 * 60 * 1000

function validateUploadMetadata(input: {
  filename: string
  contentType: string
  size: number
  durationMs?: number
}) {
  if (input.filename.trim().length === 0 || input.contentType.trim().length === 0) {
    throw new Error('attachment_metadata_invalid')
  }
  if (!Number.isInteger(input.size) || input.size < 0) {
    throw new Error('attachment_metadata_invalid')
  }
  if (input.durationMs !== undefined && (!Number.isInteger(input.durationMs) || input.durationMs < 0)) {
    throw new Error('attachment_metadata_invalid')
  }
}

async function deleteStorageBestEffort(ctx: MutationCtx, storageId: Id<'_storage'>) {
  try {
    await ctx.storage.delete(storageId)
    return true
  } catch {
    return false
  }
}

async function scheduleMediaPreview(
  ctx: MutationCtx,
  input: {
    attachmentId: Id<'attachments'>
    contentType: string
    storageId: Id<'_storage'>
    previewStatus?: Doc<'attachments'>['previewStatus']
  },
) {
  if (!input.contentType.toLowerCase().startsWith('image/')) return
  if (input.previewStatus === 'ready' || input.previewStatus === 'failed') return
  await ctx.db.patch(input.attachmentId, {
    previewStatus: 'pending',
    previewErrorCode: undefined,
  })
  await ctx.scheduler.runAfter(0, internal.mediaPreview.generate, {
    attachmentId: input.attachmentId,
    contentType: input.contentType,
    sourceStorageId: input.storageId,
  })
}
type ArchivedMemberSnapshot = {
  membership: {
    _id: Id<'projectMembers'>
    companyId?: Id<'companies'>
    role: Doc<'projectMembers'>['role']
    userId: Id<'users'>
    companyDisplayNameSnapshot?: string
  }
  user: { _id: Id<'users'>; displayName: string }
  company: { _id: Id<'companies'>; displayName: string } | null
}

function boundedMessageLimit(limit: number | undefined) {
  return Math.min(Math.max(limit ?? 50, 1), 100)
}

type ResolvedMessageAttachment = {
  input: MessageAttachmentInput
  intent: Doc<'messageUploadIntents'>
}

function uploadMetadata(input: MessageAttachmentInput): MessageUploadMetadata {
  return {
    filename: input.filename,
    contentType: input.contentType,
    size: input.size,
    kind: input.kind,
    durationMs: input.durationMs,
  }
}

async function resolveMessageAttachments(
  ctx: MutationCtx,
  attachments: Array<MessageAttachmentInput>,
  scope: MessageUploadScope,
  messageId?: Id<'messages'>,
) {
  const seenIntentIds = new Set<string>()
  const seenStorageIds = new Set<string>()
  const resolved: Array<ResolvedMessageAttachment> = []
  for (const attachment of attachments) {
    if (!Number.isInteger(attachment.size) || attachment.size < 0) {
      throw new Error('attachment_metadata_invalid')
    }
    if (attachment.filename.trim().length === 0) throw new Error('attachment_metadata_invalid')
    if (seenIntentIds.has(String(attachment.uploadIntentId))) {
      throw new Error('attachment_intent_duplicate')
    }
    seenIntentIds.add(String(attachment.uploadIntentId))
    const intent = await resolveMessageUploadIntent(ctx, {
      intentId: attachment.uploadIntentId,
      scope,
      metadata: uploadMetadata(attachment),
      messageId,
    })
    const storageId = intent.storageId
    if (!storageId) throw new Error('upload_intent_not_uploaded')
    if (seenStorageIds.has(String(storageId))) {
      throw new Error('attachment_storage_duplicate')
    }
    seenStorageIds.add(String(storageId))
    if (messageId === undefined) {
      const existingClaims = await ctx.db
        .query('attachments')
        .withIndex('by_storage', (q) => q.eq('storageId', storageId))
        .collect()
      if (existingClaims.length > 0) throw new Error('attachment_storage_already_claimed')
    }
    resolved.push({ input: attachment, intent })
  }
  return resolved
}

async function attachmentSetMatches(
  ctx: MutationCtx,
  message: Doc<'messages'>,
  attachments: Array<MessageAttachmentInput>,
  scope: MessageUploadScope,
) {
  if (message.attachmentIds.length !== attachments.length) return false
  const resolved = await resolveMessageAttachments(ctx, attachments, scope, message._id)
  const stored = await Promise.all(message.attachmentIds.map(async (attachmentId) => await ctx.db.get(attachmentId)))
  return resolved.every(({ input, intent }) => stored.some((candidate) =>
    candidate !== null &&
    candidate.storageId === intent.storageId &&
    candidate.filename === input.filename &&
    candidate.contentType === input.contentType &&
    candidate.size === input.size &&
    candidate.kind === input.kind &&
    candidate.durationMs === input.durationMs,
  ))
}

function archivedMemberForMessage(
  message: Pick<Doc<'messages'>, 'authorId' | 'authorProjectMemberId'>,
  snapshots?: Array<ArchivedMemberSnapshot>,
) {
  return snapshots?.find((snapshot) => message.authorProjectMemberId
    ? snapshot.membership._id === message.authorProjectMemberId
    : snapshot.membership.userId === message.authorId)
}

async function getGroupMembership(
  ctx: MessageDetailCtx,
  groupId: Id<'groups'>,
  userId: Id<'users'>,
) {
  return await ctx.db
    .query('groupMembers')
    .withIndex('by_group_user', (q) => q.eq('groupId', groupId).eq('userId', userId))
    .unique()
}

async function markThreadAuthorRead(
  ctx: MutationCtx,
  thread: Doc<'channelThreads'>,
  projectMember: Doc<'projectMembers'>,
  userId: Id<'users'>,
  channelSequence: number,
  actingCompanyId?: Id<'companies'>,
) {
  const existing = await ctx.db
    .query('channelThreadReadStates')
    .withIndex('by_thread_project_member', (q) =>
      q.eq('channelThreadId', thread._id).eq('projectMemberId', projectMember._id),
    )
    .unique()
  const now = Date.now()
  if (existing) {
    await ctx.db.patch(existing._id, {
      lastReadChannelSequence: Math.max(existing.lastReadChannelSequence, channelSequence),
      updatedAt: now,
    })
    return
  }
  await ctx.db.insert('channelThreadReadStates', {
    projectId: thread.projectId,
    groupId: thread.groupId,
    channelThreadId: thread._id,
    userId,
    projectMemberId: projectMember._id,
    actingCompanyId,
    lastReadChannelSequence: channelSequence,
    createdAt: now,
    updatedAt: now,
  })
}

export const commitMediaPreview = internalMutation({
  args: {
    attachmentId: v.id('attachments'),
    sourceStorageId: v.id('_storage'),
    status: v.union(v.literal('ready'), v.literal('failed')),
    reason: v.optional(previewErrorCode),
    previewStorageId: v.optional(v.id('_storage')),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    previewWidth: v.optional(v.number()),
    previewHeight: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ committed: boolean; deferred?: boolean }> => {
    const attachment = await ctx.db.get(args.attachmentId)
    if (
      !attachment ||
      attachment.storageId !== args.sourceStorageId ||
      !attachment.contentType.toLowerCase().startsWith('image/')
    ) {
      if (args.previewStorageId) {
        await deleteStorageBestEffort(ctx, args.previewStorageId)
      }
      return { committed: false }
    }
    try {
      await assertProjectSnapshotWritable(ctx, attachment.projectId)
    } catch (error) {
      if (error instanceof Error && error.message === 'project_snapshot_in_progress') {
        return { committed: false, deferred: true }
      }
      throw error
    }

    if (args.status === 'ready') {
      if (
        !args.previewStorageId ||
        args.width === undefined ||
        args.height === undefined ||
        args.previewWidth === undefined ||
        args.previewHeight === undefined
      ) {
        throw new Error('preview_metadata_missing')
      }
      const previousPreviewStorageId = attachment.previewStorageId
      await ctx.db.patch(attachment._id, {
        height: args.height,
        previewErrorCode: undefined,
        previewHeight: args.previewHeight,
        previewStatus: 'ready',
        previewStorageId: args.previewStorageId,
        previewWidth: args.previewWidth,
        width: args.width,
      })
      if (previousPreviewStorageId && previousPreviewStorageId !== args.previewStorageId) {
        await deleteStorageBestEffort(ctx, previousPreviewStorageId)
      }
      return { committed: true }
    }

    const previousPreviewStorageId = attachment.previewStorageId
    await ctx.db.patch(attachment._id, {
      height: undefined,
      previewErrorCode: args.reason,
      previewHeight: undefined,
      previewStatus: 'failed',
      previewStorageId: undefined,
      previewWidth: undefined,
      width: undefined,
    })
    if (previousPreviewStorageId) {
      await deleteStorageBestEffort(ctx, previousPreviewStorageId)
    }
    if (args.previewStorageId) {
      await deleteStorageBestEffort(ctx, args.previewStorageId)
    }
    return { committed: true }
  },
})

export async function buildMessageDetail(
  ctx: MessageDetailCtx,
  message: Doc<'messages'>,
  viewerId: Id<'users'>,
  viewerProjectMemberId?: Id<'projectMembers'>,
  cutoff?: number,
  archivedChannelSnapshots?: Array<{ _id: Id<'groups'>; name: string }>,
  archivedThreadSnapshots?: Array<{
    _id: Id<'channelThreads'>
    name: string
    status: 'active' | 'archived'
    replyCount?: number
    latestReplyAt?: number
  }>,
  archivedMemberSnapshots?: Array<ArchivedMemberSnapshot>,
  archiveSnapshotOperationId?: string,
) {
  const archiveAuthorSnapshot = cutoff && archiveSnapshotOperationId && message.authorProjectMemberId
    ? await getArchivedMemberSnapshot(ctx, archiveSnapshotOperationId, message.authorProjectMemberId)
    : null
  const archivedAuthor = cutoff
    ? archiveAuthorSnapshot ?? archivedMemberForMessage(message, archivedMemberSnapshots)
    : undefined
  const author = cutoff ? archivedAuthor?.user ?? null : await ctx.db.get(message.authorId)
  const authorProjectMember = cutoff
    ? archivedAuthor?.membership ?? null
    : message.authorProjectMemberId
      ? await ctx.db.get(message.authorProjectMemberId)
      : await ctx.db.query('projectMembers').withIndex('by_project_user', (q) =>
          q.eq('projectId', message.projectId).eq('userId', message.authorId),
        ).first()
  const attachments = await Promise.all(
    message.attachmentIds.map(async (attachmentId) => {
      const attachment = await ctx.db.get(attachmentId)
      if (!attachment || (cutoff && attachment.createdAt > cutoff)) return null
      const [url, previewUrl] = await Promise.all([
        ctx.storage.getUrl(attachment.storageId),
        attachment.previewStatus === 'ready' && attachment.previewStorageId
          ? ctx.storage.getUrl(attachment.previewStorageId)
          : Promise.resolve(null),
      ])
      return {
        attachment,
        height: attachment.height,
        previewHeight: attachment.previewHeight,
        previewUrl,
        previewWidth: attachment.previewWidth,
        url,
        width: attachment.width,
      }
    }),
  )
  const replyToMessage = message.replyToMessageId ? await ctx.db.get(message.replyToMessageId) : null
  const archiveReplyAuthorSnapshot = cutoff && archiveSnapshotOperationId && replyToMessage?.authorProjectMemberId
    ? await getArchivedMemberSnapshot(ctx, archiveSnapshotOperationId, replyToMessage.authorProjectMemberId)
    : null
  const archivedReplyAuthor = cutoff && replyToMessage
    ? archiveReplyAuthorSnapshot ?? archivedMemberForMessage(replyToMessage, archivedMemberSnapshots)
    : undefined
  const replyToAuthor = cutoff
    ? archivedReplyAuthor?.user ?? null
    : replyToMessage ? await ctx.db.get(replyToMessage.authorId) : null
  const archiveSourceGroupSnapshot = cutoff && archiveSnapshotOperationId && message.forwardedFrom
    ? await getArchivedChannelSnapshot(ctx, archiveSnapshotOperationId, message.forwardedFrom.sourceGroupId)
    : null
  const normalizedChannelSnapshots = cutoff && archiveSnapshotOperationId
    ? [...(archivedChannelSnapshots ?? []), ...(archiveSourceGroupSnapshot ? [archiveSourceGroupSnapshot] : [])]
    : archiveSourceGroupSnapshot
      ? [...(archivedChannelSnapshots ?? []), archiveSourceGroupSnapshot]
      : archivedChannelSnapshots
  const forwardedFrom = message.forwardedFrom
  const sourceMembership = forwardedFrom && !normalizedChannelSnapshots
    ? viewerProjectMemberId
      ? await ctx.db.query('groupMembers').withIndex('by_group_project_member', (q) =>
          q.eq('groupId', forwardedFrom.sourceGroupId).eq('projectMemberId', viewerProjectMemberId),
        ).unique()
      : await getGroupMembership(ctx, forwardedFrom.sourceGroupId, viewerId)
    : null
  const sourceGroupAccess = forwardedFrom
    ? normalizedChannelSnapshots
      ? normalizedChannelSnapshots.some((channel) => channel._id === forwardedFrom.sourceGroupId)
      : Boolean(sourceMembership && (!sourceMembership.status || sourceMembership.status === 'active'))
    : false
  const sourceGroupSnapshot = forwardedFrom
    ? normalizedChannelSnapshots?.find((channel) => channel._id === forwardedFrom.sourceGroupId)
    : undefined
  const sourceGroup = forwardedFrom && sourceGroupAccess && !normalizedChannelSnapshots
    ? await ctx.db.get(forwardedFrom.sourceGroupId)
    : null
  const sourceThread = threadsEnabled() && !message.channelThreadId
    ? await ctx.db
        .query('channelThreads')
        .withIndex('by_group_source', (q) =>
          q.eq('groupId', message.groupId).eq('sourceMessageId', message._id),
        )
        .unique()
    : null
  const archiveSourceThreadSnapshot = cutoff && archiveSnapshotOperationId && sourceThread && viewerProjectMemberId
    ? await getArchivedThreadSnapshot(ctx, archiveSnapshotOperationId, viewerProjectMemberId, sourceThread._id)
    : null
  const normalizedThreadSnapshots = archiveSourceThreadSnapshot
    ? [...(archivedThreadSnapshots ?? []), archiveSourceThreadSnapshot]
    : archivedThreadSnapshots
  const sourceThreadSnapshot = sourceThread
    ? normalizedThreadSnapshots?.find((snapshot) => snapshot._id === sourceThread._id)
    : undefined
  return {
    message: message.forwardedFrom ? { ...message, forwardedFrom: undefined } : message,
    author,
    authorRole: authorProjectMember?.role ?? null,
    authorCompany: authorProjectMember?.companyId
      ? {
          companyId: authorProjectMember.companyId,
          displayName: authorProjectMember.companyDisplayNameSnapshot ?? 'Company',
        }
      : null,
    attachments: attachments.filter((attachment) => attachment !== null),
    replyTo:
      replyToMessage &&
      replyToMessage.groupId === message.groupId &&
      replyToMessage.channelThreadId === message.channelThreadId &&
      (!cutoff || replyToMessage.createdAt <= cutoff)
        ? {
            messageId: replyToMessage._id,
            authorName: replyToAuthor?.displayName ?? 'Unknown Member',
            body: replyToMessage.body,
            createdAt: replyToMessage.createdAt,
          }
        : null,
    forwardedFrom: message.forwardedFrom
      ? {
          originalAuthorName: message.forwardedFrom.originalAuthorName,
          originalBody: message.forwardedFrom.originalBody,
          originalCreatedAt: message.forwardedFrom.originalCreatedAt,
          attachmentSnapshots: message.forwardedFrom.attachmentSnapshots,
          forwardedAt: message.forwardedFrom.forwardedAt,
          canOpenSource: sourceGroupAccess,
          sourceGroupId: sourceGroupAccess ? message.forwardedFrom.sourceGroupId : null,
          sourceMessageId: sourceGroupAccess ? message.forwardedFrom.sourceMessageId : null,
          sourceGroupName: sourceGroupSnapshot?.name ?? sourceGroup?.name ?? null,
        }
      : null,
    channelThread: sourceThread && (!cutoff || sourceThreadSnapshot)
      ? {
          threadId: sourceThread._id,
          name: sourceThreadSnapshot?.name ?? sourceThread.name,
          status: sourceThreadSnapshot?.status ?? sourceThread.status,
          replyCount: sourceThreadSnapshot?.replyCount ?? sourceThread.replyCount ?? 0,
          latestReplyAt: sourceThreadSnapshot?.latestReplyAt ?? sourceThread.latestReplyAt ?? null,
        }
      : null,
  }
}

export const list = query({
  args: {
    groupId: v.id('groups'),
    userId: v.id('users'),
    actingCompanyId: v.optional(v.id('companies')),
    projectMemberId: v.optional(v.id('projectMembers')),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const group = await ctx.db.get(args.groupId)
    if (!group) throw new Error('channel_unavailable')
    const access = await authorizeScopedRequest(ctx, {
      projectId: group.projectId,
      groupId: group._id,
      claimedUserId: args.userId,
      actingCompanyId: args.actingCompanyId,
      projectMemberId: args.projectMemberId,
    }, 'readChannel')
    const cutoff = access.companyAccess?.entitlement?.exitAt
    return await ctx.db
      .query('messages')
      .withIndex('by_group_thread_created_at', (q) => cutoff
        ? q.eq('groupId', args.groupId)
          // eslint-disable-next-line unicorn/no-useless-undefined -- reason: Convex compares absent optional fields explicitly.
          .eq('channelThreadId', undefined)
          .lte('createdAt', cutoff)
        : q.eq('groupId', args.groupId)
          // eslint-disable-next-line unicorn/no-useless-undefined -- reason: Convex compares absent optional fields explicitly.
          .eq('channelThreadId', undefined))
      .order('desc')
      .take(boundedMessageLimit(args.limit))
  },
})

export const listDetailed = query({
  args: {
    groupId: v.id('groups'),
    userId: v.id('users'),
    actingCompanyId: v.optional(v.id('companies')),
    projectMemberId: v.optional(v.id('projectMembers')),
    limit: v.optional(v.number()),
    targetMessageId: v.optional(v.id('messages')),
  },
  handler: async (ctx, args) => {
    const group = await ctx.db.get(args.groupId)
    if (!group) throw new Error('channel_unavailable')
    const access = await authorizeScopedRequest(ctx, {
      projectId: group.projectId,
      groupId: group._id,
      claimedUserId: args.userId,
      actingCompanyId: args.actingCompanyId,
      projectMemberId: args.projectMemberId,
    }, 'readChannel')
    const cutoff = access.companyAccess?.entitlement?.exitAt
    const messages = await ctx.db
      .query('messages')
      .withIndex('by_group_thread_created_at', (q) => cutoff
        ? q.eq('groupId', args.groupId)
          // eslint-disable-next-line unicorn/no-useless-undefined -- reason: Convex compares absent optional fields explicitly.
          .eq('channelThreadId', undefined)
          .lte('createdAt', cutoff)
        : q.eq('groupId', args.groupId)
          // eslint-disable-next-line unicorn/no-useless-undefined -- reason: Convex compares absent optional fields explicitly.
          .eq('channelThreadId', undefined))
      .order('desc')
      .take(boundedMessageLimit(args.limit))

    const target = args.targetMessageId ? await ctx.db.get(args.targetMessageId) : null
    const targetIsVisible = target &&
      target.groupId === args.groupId &&
      target.channelThreadId === undefined &&
      (!cutoff || target.createdAt <= cutoff)
    let selectedMessages = messages
    if (targetIsVisible && !messages.some((message) => message._id === target._id)) {
      const contextSize = Math.max(1, Math.floor((boundedMessageLimit(args.limit) - 1) / 2))
      const [older, newer] = await Promise.all([
        ctx.db
          .query('messages')
          .withIndex('by_group_thread_created_at', (q) => q
            .eq('groupId', args.groupId)
            // eslint-disable-next-line unicorn/no-useless-undefined -- reason: Convex compares absent optional fields explicitly.
            .eq('channelThreadId', undefined)
            .lt('createdAt', target.createdAt))
          .order('desc')
          .take(contextSize),
        ctx.db
          .query('messages')
          .withIndex('by_group_thread_created_at', (q) => cutoff
            ? q.eq('groupId', args.groupId)
              // eslint-disable-next-line unicorn/no-useless-undefined -- reason: Convex compares absent optional fields explicitly.
              .eq('channelThreadId', undefined)
              .gt('createdAt', target.createdAt).lte('createdAt', cutoff)
            : q.eq('groupId', args.groupId)
              // eslint-disable-next-line unicorn/no-useless-undefined -- reason: Convex compares absent optional fields explicitly.
              .eq('channelThreadId', undefined)
              .gt('createdAt', target.createdAt))
          .order('asc')
          .take(contextSize),
      ])
      const reversedNewer = [...newer]
      // eslint-disable-next-line unicorn/no-array-reverse -- reason: ES2022 compatibility; operates on a fresh local array.
      reversedNewer.reverse()
      selectedMessages = [...reversedNewer, target, ...older]
    }

    return await Promise.all(selectedMessages.map(async (message) =>
      await buildMessageDetail(
        ctx,
        message,
        args.userId,
        args.projectMemberId,
        cutoff,
        access.companyAccess?.entitlement?.channelSnapshots,
        access.companyAccess?.entitlement?.threadSnapshots,
        access.companyAccess?.entitlement?.memberSnapshots,
        access.companyAccess?.entitlement?.snapshotOperationId,
      ),
    ))
  },
})

export const listPage = query({
  args: {
    groupId: v.id('groups'),
    userId: v.id('users'),
    actingCompanyId: v.optional(v.id('companies')),
    projectMemberId: v.optional(v.id('projectMembers')),
    targetMessageId: v.optional(v.id('messages')),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const group = await ctx.db.get(args.groupId)
    if (!group) throw new Error('channel_unavailable')
    const access = await authorizeScopedRequest(ctx, {
      projectId: group.projectId,
      groupId: group._id,
      claimedUserId: args.userId,
      actingCompanyId: args.actingCompanyId,
      projectMemberId: args.projectMemberId,
    }, 'readChannel')
    const cutoff = access.companyAccess?.entitlement?.exitAt
    const pageSize = Math.min(Math.max(args.paginationOpts.numItems, 1), 100)
    const result = await ctx.db
      .query('messages')
      .withIndex('by_group_thread_created_at', (q) => cutoff
        ? q.eq('groupId', args.groupId)
          // eslint-disable-next-line unicorn/no-useless-undefined -- reason: Convex compares absent optional fields explicitly.
          .eq('channelThreadId', undefined)
          .lte('createdAt', cutoff)
        : q.eq('groupId', args.groupId)
          // eslint-disable-next-line unicorn/no-useless-undefined -- reason: Convex compares absent optional fields explicitly.
          .eq('channelThreadId', undefined))
      .order('desc')
      .paginate({ ...args.paginationOpts, numItems: pageSize })
    let page = [...result.page]
    if (args.paginationOpts.cursor === null && args.targetMessageId) {
      const target = await ctx.db.get(args.targetMessageId)
      const targetIsVisible = target &&
        target.projectId === group.projectId &&
        target.groupId === args.groupId &&
        target.channelThreadId === undefined &&
        (!cutoff || target.createdAt <= cutoff)
      if (targetIsVisible && !page.some((message) => message._id === target._id)) {
        const contextSize = Math.max(1, Math.floor((pageSize - 1) / 2))
        const [older, newer] = await Promise.all([
          ctx.db
            .query('messages')
            .withIndex('by_group_thread_created_at', (q) => cutoff
              // eslint-disable-next-line unicorn/no-useless-undefined -- reason: Convex compares absent optional fields explicitly.
              ? q.eq('groupId', args.groupId).eq('channelThreadId', undefined)
                .lt('createdAt', target.createdAt)
              // eslint-disable-next-line unicorn/no-useless-undefined -- reason: Convex compares absent optional fields explicitly.
              : q.eq('groupId', args.groupId).eq('channelThreadId', undefined)
                .lt('createdAt', target.createdAt))
            .order('desc')
            .take(contextSize),
          ctx.db
            .query('messages')
            .withIndex('by_group_thread_created_at', (q) => q
              .eq('groupId', args.groupId)
              // eslint-disable-next-line unicorn/no-useless-undefined -- reason: Convex compares absent optional fields explicitly.
              .eq('channelThreadId', undefined)
              .gt('createdAt', target.createdAt)
              .lte('createdAt', cutoff ?? Number.MAX_SAFE_INTEGER))
            .order('asc')
            .take(contextSize),
        ])
        const reversedNewer = [...newer]
        // eslint-disable-next-line unicorn/no-array-reverse -- reason: ES2022 compatibility; operates on a fresh local array.
        reversedNewer.reverse()
        page = [...reversedNewer, target, ...older]
      }
    }
    return {
      ...result,
      page: await Promise.all(page.map(async (message) =>
        await buildMessageDetail(
          ctx,
          message,
          args.userId,
          args.projectMemberId,
          cutoff,
          access.companyAccess?.entitlement?.channelSnapshots,
          access.companyAccess?.entitlement?.threadSnapshots,
          access.companyAccess?.entitlement?.memberSnapshots,
          access.companyAccess?.entitlement?.snapshotOperationId,
        ),
      )),
    }
  },
})

export const send = mutation({
  args: {
    projectId: v.id('projects'),
    groupId: v.id('groups'),
    authorId: v.id('users'),
    actingCompanyId: v.optional(v.id('companies')),
    projectMemberId: v.optional(v.id('projectMembers')),
    body: v.string(),
    mentions: v.optional(v.array(v.id('users'))),
    mentionedProjectMemberIds: v.optional(v.array(v.id('projectMembers'))),
    replyToMessageId: v.optional(v.id('messages')),
    notificationPreview: v.optional(v.string()),
    channelThreadId: v.optional(v.id('channelThreads')),
    idempotencyKey: v.optional(v.string()),
    attachments: v.optional(v.array(messageAttachment)),
  },
  handler: async (ctx, args) => {
    const access = await authorizeScopedRequest(ctx, {
      projectId: args.projectId,
      groupId: args.groupId,
      claimedUserId: args.authorId,
      actingCompanyId: args.actingCompanyId,
      projectMemberId: args.projectMemberId,
    }, 'writeChannel')
    const group = await ctx.db.get(args.groupId)
    if (!group || group.projectId !== args.projectId) {
      throw new Error('group_project_mismatch')
    }
    const projectMember = access.projectMember
    const uploadScope: MessageUploadScope = {
      projectId: args.projectId,
      groupId: args.groupId,
      channelThreadId: args.channelThreadId,
      uploaderId: args.authorId,
      uploaderProjectMemberId: projectMember._id,
      actingCompanyId: access.companyAccess?.company._id,
    }
    let channelThread = null
    if (args.channelThreadId) {
      requireThreadsEnabled()
      if (
        (group.status && group.status !== 'active') ||
        (access.project.status && access.project.status !== 'active')
      ) {
        throw new Error('thread_parent_read_only')
      }
      channelThread = await ctx.db.get(args.channelThreadId)
      if (
        !channelThread ||
        channelThread.projectId !== args.projectId ||
        channelThread.groupId !== args.groupId
      ) {
        throw new Error('thread_access_changed')
      }
      if (channelThread.status !== 'active') throw new Error('thread_archived')
    }
    if (args.idempotencyKey) {
      const existing = await ctx.db
        .query('messages')
        .withIndex('by_author_idempotency', (q) =>
          q
            .eq('authorProjectMemberId', projectMember._id)
            .eq('idempotencyKey', args.idempotencyKey),
        )
        .unique()
      if (existing) {
        if (
          existing.projectId !== args.projectId ||
          existing.groupId !== args.groupId ||
          existing.channelThreadId !== args.channelThreadId
        ) {
          throw new Error('idempotency_scope_mismatch')
        }
        if (args.attachments && !await attachmentSetMatches(ctx, existing, args.attachments, uploadScope)) {
          throw new Error('idempotency_attachment_mismatch')
        }
        return existing._id
      }
    }
    await rateLimiter.limit(ctx, 'sendMessage', {
      key: args.authorId,
      throws: true,
    })
    await assertReplyScope(ctx, args.replyToMessageId, args)
    const attachments = args.attachments ?? []
    const resolvedAttachments = await resolveMessageAttachments(ctx, attachments, uploadScope)
    const channelSequence = await allocateChannelSequence(ctx, group)
    const messageId = await ctx.db.insert('messages', {
      projectId: args.projectId,
      groupId: args.groupId,
      authorId: args.authorId,
      authorProjectMemberId: projectMember._id,
      actingCompanyId: access.companyAccess?.company._id,
      channelThreadId: args.channelThreadId,
      channelSequence,
      idempotencyKey: args.idempotencyKey,
      body: args.body,
      mentions: args.mentions ?? [],
      mentionedProjectMemberIds: args.mentionedProjectMemberIds,
      attachmentIds: [],
      replyToMessageId: args.replyToMessageId,
      notificationPreview: args.notificationPreview,
      createdAt: Date.now(),
    })
    const attachmentIds = await Promise.all(resolvedAttachments.map(async ({ input, intent }) => {
      if (!intent.storageId) throw new Error('upload_intent_not_uploaded')
      const attachmentId = await ctx.db.insert('attachments', {
        projectId: args.projectId,
        groupId: args.groupId,
        messageId,
        channelThreadId: args.channelThreadId,
        storageId: intent.storageId,
        filename: input.filename,
        contentType: input.contentType,
        size: input.size,
        kind: input.kind,
        durationMs: input.durationMs,
        uploadedBy: args.authorId,
        uploadedByProjectMemberId: projectMember._id,
        actingCompanyId: access.companyAccess?.company._id,
        createdAt: Date.now(),
      })
      await scheduleMediaPreview(ctx, {
        attachmentId,
        contentType: input.contentType,
        storageId: intent.storageId,
      })
      return attachmentId
    }))
    await Promise.all(resolvedAttachments.map(async ({ input }) =>
      await claimMessageUploadIntent(ctx, {
        intentId: input.uploadIntentId,
        scope: uploadScope,
        metadata: uploadMetadata(input),
        messageId,
      }),
    ))
    if (attachmentIds.length > 0) {
      await ctx.db.patch(messageId, { attachmentIds })
      await Promise.all(attachmentIds.map(async (attachmentId, index) =>
        await appendAuditEvent(ctx, {
          projectId: args.projectId,
          groupId: args.groupId,
          actorId: args.authorId,
          actorProjectMemberId: projectMember._id,
          actingCompanyId: access.companyAccess?.company._id,
          channelThreadId: args.channelThreadId,
          entityType: 'attachment',
          entityId: attachmentId,
          action: 'attachment.preserved',
          after: {
            filename: resolvedAttachments[index]?.input.filename,
            contentType: resolvedAttachments[index]?.input.contentType,
            size: resolvedAttachments[index]?.input.size,
            kind: resolvedAttachments[index]?.input.kind ?? 'file',
            durationMs: resolvedAttachments[index]?.input.durationMs,
          },
        }),
      ))
    }

    if (channelThread) {
      const createdAt = Date.now()
      await ctx.db.patch(channelThread._id, {
        replyCount: (channelThread.replyCount ?? 0) + 1,
        latestReplyAt: createdAt,
        latestChannelSequence: channelSequence,
        updatedAt: createdAt,
      })
      await upsertThreadFollower(ctx, {
        thread: channelThread,
        userId: args.authorId,
        projectMember,
        actingCompanyId: access.companyAccess?.company._id,
        reason: 'replied',
      })
      await followMentionedThreadMembers(
        ctx,
        channelThread,
        args.mentions ?? [],
        args.mentionedProjectMemberIds,
      )
      await markThreadAuthorRead(ctx, channelThread, projectMember, args.authorId, channelSequence, access.companyAccess?.company._id)
    }

    await appendAuditEvent(ctx, {
      projectId: args.projectId,
      groupId: args.groupId,
      actorId: args.authorId,
      actorProjectMemberId: projectMember._id,
      actingCompanyId: access.companyAccess?.company._id,
      channelThreadId: args.channelThreadId,
      entityType: 'message',
      entityId: messageId,
      action: 'message.sent',
      after: {
        bodyPreview: args.body.slice(0, 180),
        mentionCount: args.mentions?.length ?? 0,
        replyToMessageId: args.replyToMessageId,
        channelSequence,
        channelThreadId: args.channelThreadId,
      },
    })

    await ctx.scheduler.runAfter(0, internal.pushNotifications.deliverMessageNotifications, {
      messageId,
    })
    if (resolveReleaseFeatureFlag(process.env.TRACK_TASKS_ENABLED)) {
      await ctx.scheduler.runAfter(0, (internal as any).taskDetection.queueForMessage, { messageId })
    }

    return messageId
  },
})

export const forwardMessage = mutation({
  args: {
    projectId: v.id('projects'),
    sourceMessageId: v.id('messages'),
    targetGroupId: v.id('groups'),
    targetChannelThreadId: v.optional(v.id('channelThreads')),
    actorId: v.id('users'),
    actingCompanyId: v.optional(v.id('companies')),
    projectMemberId: v.optional(v.id('projectMembers')),
    audienceExpansionConfirmed: v.optional(v.boolean()),
    body: v.optional(v.string()),
    mentions: v.optional(v.array(v.id('users'))),
    mentionedProjectMemberIds: v.optional(v.array(v.id('projectMembers'))),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const sourceMessage = await ctx.db.get(args.sourceMessageId)
    if (!sourceMessage || sourceMessage.projectId !== args.projectId) {
      throw new Error('source_message_not_found')
    }
    if (sourceMessage.channelThreadId) requireThreadsEnabled()
    await authorizeScopedRequest(ctx, {
      projectId: args.projectId,
      groupId: sourceMessage.groupId,
      claimedUserId: args.actorId,
      actingCompanyId: args.actingCompanyId,
      projectMemberId: args.projectMemberId,
    }, 'readChannel')
    const access = await authorizeScopedRequest(ctx, {
      projectId: args.projectId,
      groupId: args.targetGroupId,
      claimedUserId: args.actorId,
      actingCompanyId: args.actingCompanyId,
      projectMemberId: args.projectMemberId,
    }, 'writeChannel')
    const targetGroup = await ctx.db.get(args.targetGroupId)
    if (!targetGroup || targetGroup.projectId !== args.projectId) {
      throw new Error('target_group_mismatch')
    }
    const targetMemberships = await listActiveChannelMemberships(
      ctx,
      args.targetGroupId,
      resolveProjectAccessProfile(access.project.accessProfile),
    )
    const projectMember = access.projectMember
    let targetThread = null
    if (args.targetChannelThreadId) {
      requireThreadsEnabled()
      if (
        (targetGroup.status && targetGroup.status !== 'active') ||
        (access.project.status && access.project.status !== 'active')
      ) {
        throw new Error('thread_parent_read_only')
      }
      targetThread = await ctx.db.get(args.targetChannelThreadId)
      if (!targetThread || targetThread.groupId !== args.targetGroupId || targetThread.projectId !== args.projectId) {
        throw new Error('thread_access_changed')
      }
      if (targetThread.status !== 'active') throw new Error('thread_archived')
    }
    if (
      sourceMessage.groupId === args.targetGroupId &&
      sourceMessage.channelThreadId === args.targetChannelThreadId
    ) {
      throw new Error('forward_target_same_group')
    }
    if (args.idempotencyKey) {
      const existing = await ctx.db
        .query('messages')
        .withIndex('by_author_idempotency', (q) =>
          q
            .eq('authorProjectMemberId', projectMember._id)
            .eq('idempotencyKey', args.idempotencyKey),
        )
        .unique()
      if (existing) return existing._id
    }
    if (access.companyAccess) {
      const sourceMemberships = await listActiveChannelMemberships(
        ctx,
        sourceMessage.groupId,
        'company',
      )
      const [sourceMembers, targetMembers] = await Promise.all([
        Promise.all(sourceMemberships.filter((item) => item.status === 'active' && item.projectMemberId).map(async (item) => await ctx.db.get(item.projectMemberId!))),
        Promise.all(targetMemberships.filter((item) => item.status === 'active' && item.projectMemberId).map(async (item) => await ctx.db.get(item.projectMemberId!))),
      ])
      const sourceMemberIds = new Set(sourceMembers.flatMap((member) =>
        member?.status === 'active' ? [String(member._id)] : [],
      ))
      const expandsAudience = targetMembers.some((member) =>
        member?.status === 'active' && !sourceMemberIds.has(String(member._id)),
      )
      if (expandsAudience && !args.audienceExpansionConfirmed) throw new Error('audience_expansion_confirmation_required')
    }
    await rateLimiter.limit(ctx, 'sendMessage', {
      key: args.actorId,
      throws: true,
    })

    const [originalAuthor, sourceAttachments] = await Promise.all([
      ctx.db.get(sourceMessage.authorId),
      Promise.all(
        sourceMessage.attachmentIds.map(async (attachmentId) => {
          const attachment = await ctx.db.get(attachmentId)
          return attachment
        }),
      ),
    ])
    const attachmentsToCopy = sourceAttachments.filter((attachment) => attachment !== null)
    const body = args.body?.trim() ?? ''
    const targetUserIds = new Set(targetMemberships.map((membership) => String(membership.userId)))
    const targetProjectMemberIds = new Set(targetMemberships.flatMap((membership) =>
      membership.projectMemberId ? [String(membership.projectMemberId)] : [],
    ))
    const mentions = Array.from(new Set(args.mentions ?? []))
      .filter((userId) => targetUserIds.has(String(userId)))
    const mentionedProjectMemberIds = args.mentionedProjectMemberIds
      ? Array.from(new Set(args.mentionedProjectMemberIds))
        .filter((memberId) => targetProjectMemberIds.has(String(memberId)))
      : undefined
    const channelSequence = await allocateChannelSequence(ctx, targetGroup)
    const messageId = await ctx.db.insert('messages', {
      projectId: args.projectId,
      groupId: args.targetGroupId,
      authorId: args.actorId,
      authorProjectMemberId: projectMember._id,
      actingCompanyId: access.companyAccess?.company._id,
      channelThreadId: args.targetChannelThreadId,
      channelSequence,
      idempotencyKey: args.idempotencyKey,
      body,
      mentions,
      mentionedProjectMemberIds,
      attachmentIds: [],
      forwardedFrom: {
        sourceProjectId: sourceMessage.projectId,
        sourceGroupId: sourceMessage.groupId,
        sourceMessageId: sourceMessage._id,
        originalAuthorId: sourceMessage.authorId,
        originalAuthorName: originalAuthor?.displayName ?? 'Unknown Member',
        originalBody: sourceMessage.body,
        originalCreatedAt: sourceMessage.createdAt,
        attachmentSnapshots: attachmentsToCopy.map((attachment) => ({
          filename: attachment.filename,
          contentType: attachment.contentType,
          size: attachment.size,
          kind: attachment.kind,
          durationMs: attachment.durationMs,
        })),
        forwardedAt: Date.now(),
      },
      notificationPreview: body || 'Forwarded a message.',
      createdAt: Date.now(),
    })
    if (targetThread) {
      const createdAt = Date.now()
      await ctx.db.patch(targetThread._id, {
        replyCount: (targetThread.replyCount ?? 0) + 1,
        latestReplyAt: createdAt,
        latestChannelSequence: channelSequence,
        updatedAt: createdAt,
      })
      await upsertThreadFollower(ctx, {
        thread: targetThread,
        userId: args.actorId,
        projectMember,
        actingCompanyId: access.companyAccess?.company._id,
        reason: 'replied',
      })
      await followMentionedThreadMembers(
        ctx,
        targetThread,
        mentions,
        mentionedProjectMemberIds,
      )
      await markThreadAuthorRead(ctx, targetThread, projectMember, args.actorId, channelSequence, access.companyAccess?.company._id)
    }

    const copiedAttachmentIds = await Promise.all(
      attachmentsToCopy.map(async (attachment) =>
        await ctx.db.insert('attachments', {
          projectId: args.projectId,
          groupId: args.targetGroupId,
          messageId,
          channelThreadId: args.targetChannelThreadId,
          storageId: attachment.storageId,
          filename: attachment.filename,
          contentType: attachment.contentType,
          size: attachment.size,
          kind: attachment.kind,
          durationMs: attachment.durationMs,
          uploadedBy: args.actorId,
          uploadedByProjectMemberId: projectMember._id,
          actingCompanyId: access.companyAccess?.company._id,
          createdAt: Date.now(),
        }),
      ),
    )
    if (copiedAttachmentIds.length > 0) {
      await ctx.db.patch(messageId, {
        attachmentIds: copiedAttachmentIds,
      })
    }

    await appendAuditEvent(ctx, {
      projectId: args.projectId,
      groupId: args.targetGroupId,
      actorId: args.actorId,
      actorProjectMemberId: projectMember._id,
      actingCompanyId: access.companyAccess?.company._id,
      channelThreadId: args.targetChannelThreadId,
      entityType: 'message',
      entityId: messageId,
      action: 'message.forwarded',
      after: {
        sourceGroupId: sourceMessage.groupId,
        sourceMessageId: sourceMessage._id,
        copiedAttachmentCount: copiedAttachmentIds.length,
        bodyPreview: body.slice(0, 180),
        channelSequence,
        channelThreadId: args.targetChannelThreadId,
      },
    })

    await ctx.scheduler.runAfter(0, internal.pushNotifications.deliverMessageNotifications, {
      messageId,
    })

    return messageId
  },
})

export const remove = mutation({
  args: {
    messageId: v.id('messages'),
    actorId: v.id('users'),
    actingCompanyId: v.optional(v.id('companies')),
    projectMemberId: v.optional(v.id('projectMembers')),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId)
    if (!message) throw new Error('message_not_found')
    const access = await authorizeScopedRequest(ctx, {
      projectId: message.projectId,
      groupId: message.groupId,
      claimedUserId: args.actorId,
      actingCompanyId: args.actingCompanyId,
      projectMemberId: args.projectMemberId,
    }, 'writeChannel')
    const projectMember = access.projectMember
    const channelThread = message.channelThreadId
      ? await ctx.db.get(message.channelThreadId)
      : null
    if (message.channelThreadId) {
      requireThreadsEnabled()
      if (
        !channelThread ||
        channelThread.projectId !== message.projectId ||
        channelThread.groupId !== message.groupId
      ) {
        throw new Error('thread_access_changed')
      }
      if (channelThread.status !== 'active') throw new Error('thread_archived')
    }
    const isAuthor = message.authorProjectMemberId
      ? message.authorProjectMemberId === projectMember._id
      : message.authorId === args.actorId
    if (!isAuthor) throw new Error('message_delete_forbidden')

    const attachments = await Promise.all(
      message.attachmentIds.map(async (attachmentId) => await ctx.db.get(attachmentId)),
    )
    const deletingAttachmentIds = new Set(message.attachmentIds.map(String))
    const storageIds = [
      ...new Map(
        attachments.flatMap((attachment) =>
          attachment ? [[String(attachment.storageId), attachment.storageId] as const] : [],
        ),
      ).values(),
    ]
    const unsharedStorageIds = (
      await Promise.all(storageIds.map(async (storageId) => {
        const storageReferences = await ctx.db
          .query('attachments')
          .withIndex('by_storage', (q) => q.eq('storageId', storageId))
          .collect()
        return storageReferences.some((candidate) =>
          !deletingAttachmentIds.has(String(candidate._id)),
        ) ? null : storageId
      }))
    ).filter((storageId) => storageId !== null)

    await appendAuditEvent(ctx, {
      projectId: message.projectId,
      groupId: message.groupId,
      channelThreadId: message.channelThreadId,
      actorId: args.actorId,
      actorProjectMemberId: projectMember._id,
      actingCompanyId: access.companyAccess?.company._id,
      entityType: 'message',
      entityId: message._id,
      action: 'message.deleted',
      before: {
        attachmentCount: attachments.filter(Boolean).length,
        channelSequence: message.channelSequence,
        createdAt: message.createdAt,
      },
    })

    await invalidateTaskEvidence(ctx, { messageId: message._id })
    for (const attachment of attachments) {
      if (!attachment) continue
      await invalidateTaskEvidence(ctx, { attachmentId: attachment._id })
      await ctx.db.delete(attachment._id)
    }
    await ctx.db.delete(message._id)
    await Promise.all(
      unsharedStorageIds.map(async (storageId) =>
        await ctx.storage.delete(storageId).catch(() => undefined),
      ),
    )

    if (channelThread) {
      const remainingReplies = await ctx.db
        .query('messages')
        .withIndex('by_thread_created_at', (q) => q.eq('channelThreadId', channelThread._id))
        .order('desc')
        .collect()
      const latestReply = remainingReplies[0]
      await ctx.db.patch(channelThread._id, {
        replyCount: remainingReplies.length,
        latestReplyAt: latestReply?.createdAt,
        latestChannelSequence: latestReply?.channelSequence,
        updatedAt: Date.now(),
      })
    }
  },
})

export const generateUploadUrl = mutation({
  args: {
    groupId: v.id('groups'),
    userId: v.id('users'),
    actingCompanyId: v.optional(v.id('companies')),
    projectMemberId: v.optional(v.id('projectMembers')),
    channelThreadId: v.optional(v.id('channelThreads')),
    intentKey: v.string(),
    filename: v.string(),
    contentType: v.string(),
    size: v.number(),
    kind: v.optional(attachmentKind),
    durationMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    validateUploadMetadata(args)
    if (args.intentKey.trim().length === 0) throw new Error('upload_intent_key_invalid')
    const group = await ctx.db.get(args.groupId)
    if (!group) throw new Error('channel_unavailable')
    const access = await authorizeScopedRequest(ctx, {
      projectId: group.projectId,
      groupId: group._id,
      claimedUserId: args.userId,
      actingCompanyId: args.actingCompanyId,
      projectMemberId: args.projectMemberId,
    }, 'writeChannel')
    if (args.channelThreadId) {
      requireThreadsEnabled()
      if (
        (group.status && group.status !== 'active') ||
        (access.project.status && access.project.status !== 'active')
      ) {
        throw new Error('thread_parent_read_only')
      }
      const thread = await ctx.db.get(args.channelThreadId)
      if (!thread || thread.groupId !== group._id || thread.status !== 'active') {
        throw new Error(thread?.status === 'archived' ? 'thread_archived' : 'thread_access_changed')
      }
    }
    const projectMember = access.projectMember
    const actingCompanyId = access.companyAccess?.company._id
    const existing = await ctx.db
      .query('messageUploadIntents')
      .withIndex('by_uploader_intent_key', (q) =>
        q.eq('uploaderProjectMemberId', projectMember._id).eq('intentKey', args.intentKey),
      )
      .first()
    const now = Date.now()
    if (existing) {
      if (
        existing.projectId !== group.projectId ||
        existing.groupId !== group._id ||
        existing.channelThreadId !== args.channelThreadId ||
        existing.uploaderId !== args.userId ||
        existing.actingCompanyId !== actingCompanyId ||
        existing.filename !== args.filename ||
        existing.contentType !== args.contentType ||
        existing.size !== args.size ||
        existing.kind !== args.kind ||
        existing.durationMs !== args.durationMs
      ) {
        throw new Error('upload_intent_key_mismatch')
      }
      if (existing.status === 'claimed') {
        return {
          intentId: existing._id,
          uploadUrl: null,
          status: existing.status,
          storageId: existing.storageId ?? null,
          expiresAt: existing.expiresAt,
        }
      }
      if (existing.status === 'uploaded' && existing.storageId) {
        return {
          intentId: existing._id,
          uploadUrl: null,
          status: existing.status,
          storageId: existing.storageId,
          expiresAt: existing.expiresAt,
        }
      }
      if (existing.expiresAt > now && existing.status === 'issued') {
        return {
          intentId: existing._id,
          uploadUrl: await ctx.storage.generateUploadUrl(),
          status: existing.status,
          storageId: null,
          expiresAt: existing.expiresAt,
        }
      }
      if (existing.storageId) {
        const storageId = existing.storageId
        const claims = await ctx.db
          .query('attachments')
          .withIndex('by_storage', (q) => q.eq('storageId', storageId))
          .first()
        if (!claims) await deleteStorageBestEffort(ctx, storageId)
      }
      await ctx.db.patch(existing._id, {
        status: 'abandoned',
        updatedAt: now,
      })
    }
    const intentId = await ctx.db.insert('messageUploadIntents', {
      projectId: group.projectId,
      groupId: group._id,
      channelThreadId: args.channelThreadId,
      uploaderId: args.userId,
      uploaderProjectMemberId: projectMember._id,
      actingCompanyId,
      intentKey: args.intentKey,
      filename: args.filename,
      contentType: args.contentType,
      size: args.size,
      kind: args.kind,
      durationMs: args.durationMs,
      status: 'issued',
      createdAt: now,
      updatedAt: now,
      expiresAt: now + UPLOAD_INTENT_TTL_MS,
    })
    return {
      intentId,
      uploadUrl: await ctx.storage.generateUploadUrl(),
      status: 'issued' as const,
      storageId: null,
      expiresAt: now + UPLOAD_INTENT_TTL_MS,
    }
  },
})

export const claimUploadIntent = mutation({
  args: {
    intentId: v.id('messageUploadIntents'),
    storageId: v.string(),
    userId: v.id('users'),
    actingCompanyId: v.optional(v.id('companies')),
    projectMemberId: v.optional(v.id('projectMembers')),
  },
  handler: async (ctx, args) => {
    const storageId = ctx.db.system.normalizeId('_storage', args.storageId)
    if (!storageId) throw new Error('upload_storage_id_invalid')
    const intent = await ctx.db.get(args.intentId)
    if (!intent) throw new Error('upload_intent_not_found')
    const access = await authorizeScopedRequest(ctx, {
      projectId: intent.projectId,
      groupId: intent.groupId,
      claimedUserId: args.userId,
      actingCompanyId: args.actingCompanyId,
      projectMemberId: args.projectMemberId,
    }, 'writeChannel')
    const group = await ctx.db.get(intent.groupId)
    if (!group || group.projectId !== intent.projectId) throw new Error('group_project_mismatch')
    if (intent.uploaderId !== args.userId || intent.uploaderProjectMemberId !== access.projectMember._id) {
      throw new Error('upload_intent_scope_mismatch')
    }
    if (intent.actingCompanyId !== access.companyAccess?.company._id) {
      throw new Error('upload_intent_scope_mismatch')
    }
    if (intent.channelThreadId) {
      requireThreadsEnabled()
      if (
        (group.status && group.status !== 'active') ||
        (access.project.status && access.project.status !== 'active')
      ) {
        throw new Error('thread_parent_read_only')
      }
      const thread = await ctx.db.get(intent.channelThreadId)
      if (!thread || thread.groupId !== group._id || thread.status !== 'active') {
        throw new Error(thread?.status === 'archived' ? 'thread_archived' : 'thread_access_changed')
      }
    }
    const uploaded = await markMessageUploadAsUploaded(ctx, {
      intentId: intent._id,
      scope: {
        projectId: intent.projectId,
        groupId: intent.groupId,
        channelThreadId: intent.channelThreadId,
        uploaderId: args.userId,
        uploaderProjectMemberId: access.projectMember._id,
        actingCompanyId: access.companyAccess?.company._id,
      },
      storageId,
    })
    return {
      intentId: uploaded._id,
      status: uploaded.status,
      storageId,
      expiresAt: uploaded.expiresAt,
    }
  },
})

export const abandonUploadIntent = mutation({
  args: {
    intentId: v.id('messageUploadIntents'),
    userId: v.id('users'),
    actingCompanyId: v.optional(v.id('companies')),
    projectMemberId: v.optional(v.id('projectMembers')),
  },
  handler: async (ctx, args) => {
    const intent = await ctx.db.get(args.intentId)
    if (!intent) return null
    const access = await authorizeScopedRequest(ctx, {
      projectId: intent.projectId,
      groupId: intent.groupId,
      claimedUserId: args.userId,
      actingCompanyId: args.actingCompanyId,
      projectMemberId: args.projectMemberId,
    }, 'writeChannel')
    if (intent.uploaderId !== args.userId || intent.uploaderProjectMemberId !== access.projectMember._id) {
      throw new Error('upload_intent_scope_mismatch')
    }
    if (intent.actingCompanyId !== access.companyAccess?.company._id) {
      throw new Error('upload_intent_scope_mismatch')
    }
    if (intent.status === 'claimed') return intent
    if (intent.storageId) {
      const storageId = intent.storageId
      const attachment = await ctx.db
        .query('attachments')
        .withIndex('by_storage', (q) => q.eq('storageId', storageId))
        .first()
      if (!attachment) await deleteStorageBestEffort(ctx, storageId)
    }
    const now = Date.now()
    await ctx.db.patch(intent._id, { status: 'abandoned', updatedAt: now })
    return await ctx.db.get(intent._id)
  },
})

export const cleanupExpiredUploadIntents = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now()
    let cleaned = 0
    for (const status of ['issued', 'uploaded'] as const) {
      const intents = await ctx.db
        .query('messageUploadIntents')
        .withIndex('by_status_expires_at', (q) => q.eq('status', status).lt('expiresAt', now))
        .collect()
      for (const intent of intents) {
        if (intent.storageId) {
          const storageId = intent.storageId
          const attachment = await ctx.db
            .query('attachments')
            .withIndex('by_storage', (q) => q.eq('storageId', storageId))
            .first()
          if (!attachment) await deleteStorageBestEffort(ctx, storageId)
        }
        await ctx.db.patch(intent._id, { status: 'abandoned', updatedAt: now })
        cleaned += 1
      }
    }
    return cleaned
  },
})

export const attachFile = mutation({
  args: {
    projectId: v.id('projects'),
    groupId: v.id('groups'),
    messageId: v.id('messages'),
    userId: v.id('users'),
    actingCompanyId: v.optional(v.id('companies')),
    projectMemberId: v.optional(v.id('projectMembers')),
    uploadIntentId: v.id('messageUploadIntents'),
    storageId: v.id('_storage'),
    filename: v.string(),
    contentType: v.string(),
    size: v.number(),
    kind: v.optional(attachmentKind),
    durationMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const access = await authorizeScopedRequest(ctx, {
      projectId: args.projectId,
      groupId: args.groupId,
      claimedUserId: args.userId,
      actingCompanyId: args.actingCompanyId,
      projectMemberId: args.projectMemberId,
    }, 'writeChannel')
    const projectMember = access.projectMember
    const group = await ctx.db.get(args.groupId)
    if (!group || group.projectId !== args.projectId) {
      throw new Error('group_project_mismatch')
    }
    const message = await ctx.db.get(args.messageId)
    if (
      !message ||
      message.projectId !== args.projectId ||
      message.groupId !== args.groupId
    ) {
      throw new Error('message_scope_mismatch')
    }
    const representedCompanyId = access.companyAccess?.company._id
    const messageAuthorMatches = message.authorProjectMemberId
      ? message.authorProjectMemberId === projectMember._id
      : message.authorId === args.userId
    if (!messageAuthorMatches) throw new Error('attachment_author_mismatch')
    if (message.actingCompanyId !== representedCompanyId) {
      throw new Error('attachment_scope_mismatch')
    }
    if (message.channelThreadId) {
      requireThreadsEnabled()
      if (
        (group.status && group.status !== 'active') ||
        (access.project.status && access.project.status !== 'active')
      ) {
        throw new Error('thread_parent_read_only')
      }
      const thread = await ctx.db.get(message.channelThreadId)
      if (!thread || thread.status !== 'active') {
        throw new Error(thread?.status === 'archived' ? 'thread_archived' : 'thread_access_changed')
      }
    }
    validateUploadMetadata(args)
    const uploadScope: MessageUploadScope = {
      projectId: args.projectId,
      groupId: args.groupId,
      channelThreadId: message.channelThreadId,
      uploaderId: args.userId,
      uploaderProjectMemberId: projectMember._id,
      actingCompanyId: representedCompanyId,
    }
    await markMessageUploadAsUploaded(ctx, {
      intentId: args.uploadIntentId,
      scope: uploadScope,
      storageId: args.storageId,
    })
    const intent = await resolveMessageUploadIntent(ctx, {
      intentId: args.uploadIntentId,
      scope: uploadScope,
      metadata: {
        filename: args.filename,
        contentType: args.contentType,
        size: args.size,
        kind: args.kind,
        durationMs: args.durationMs,
      },
      messageId: args.messageId,
    })
    const storageId = intent.storageId
    if (!storageId || storageId !== args.storageId) {
      throw new Error('upload_intent_storage_mismatch')
    }
    const storageClaims = await ctx.db
      .query('attachments')
      .withIndex('by_storage', (q) => q.eq('storageId', storageId))
      .collect()
    const existing = storageClaims.find((attachment) =>
      attachment.projectId === args.projectId &&
      attachment.groupId === args.groupId &&
      attachment.messageId === args.messageId &&
      attachment.uploadedBy === args.userId &&
      attachment.uploadedByProjectMemberId === projectMember._id &&
      attachment.actingCompanyId === representedCompanyId,
    )
    if (existing) {
      if (
        existing.filename !== args.filename ||
        existing.contentType !== args.contentType ||
        existing.size !== args.size ||
        existing.kind !== args.kind ||
        existing.durationMs !== args.durationMs
      ) {
        throw new Error('attachment_metadata_mismatch')
      }
      if (!message.attachmentIds.some((attachmentId) => attachmentId === existing._id)) {
        await ctx.db.patch(args.messageId, {
          attachmentIds: [...message.attachmentIds, existing._id],
        })
      }
      await claimMessageUploadIntent(ctx, {
        intentId: args.uploadIntentId,
        scope: uploadScope,
        metadata: {
          filename: args.filename,
          contentType: args.contentType,
          size: args.size,
          kind: args.kind,
          durationMs: args.durationMs,
        },
        messageId: args.messageId,
      })
      return existing._id
    }
    if (storageClaims.length > 0) throw new Error('attachment_storage_already_claimed')
    const attachmentId = await ctx.db.insert('attachments', {
      projectId: args.projectId,
      groupId: args.groupId,
      messageId: args.messageId,
      channelThreadId: message.channelThreadId,
      storageId,
      filename: args.filename,
      contentType: args.contentType,
      size: args.size,
      kind: args.kind,
      durationMs: args.durationMs,
      uploadedBy: args.userId,
      uploadedByProjectMemberId: projectMember._id,
      actingCompanyId: representedCompanyId,
      createdAt: Date.now(),
    })
    await scheduleMediaPreview(ctx, {
      attachmentId,
      contentType: args.contentType,
      storageId,
    })
    await ctx.db.patch(args.messageId, {
      attachmentIds: [...message.attachmentIds, attachmentId],
    })
    await appendAuditEvent(ctx, {
      projectId: args.projectId,
      groupId: args.groupId,
      actorId: args.userId,
      actorProjectMemberId: projectMember._id,
      actingCompanyId: access.companyAccess?.company._id,
      entityType: 'attachment',
      entityId: attachmentId,
      action: 'attachment.preserved',
      after: {
        filename: args.filename,
        contentType: args.contentType,
        size: args.size,
        kind: args.kind ?? 'file',
        durationMs: args.durationMs,
      },
    })
    await claimMessageUploadIntent(ctx, {
      intentId: args.uploadIntentId,
      scope: uploadScope,
      metadata: {
        filename: args.filename,
        contentType: args.contentType,
        size: args.size,
        kind: args.kind,
        durationMs: args.durationMs,
      },
      messageId: args.messageId,
    })
    return attachmentId
  },
})
