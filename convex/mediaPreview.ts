"use node"

import sharp from 'sharp'
import { v } from 'convex/values'

import { internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { internalAction } from './_generated/server'
import {
  calculatePreviewDimensions,
  maxPreviewDimension,
  maxPreviewPixels,
  maxPreviewSourceBytes,
  validateImageDimensions,
} from './lib/mediaPreview'

const maxPreviewOutputBytes = 2 * 1024 * 1024
const previewQuality = 78
type PreviewFailureCommitArgs = {
  attachmentId: Id<'attachments'>
  reason: 'image_too_large' | 'missing_source' | 'not_an_image' | 'processor_failed'
  sourceStorageId: Id<'_storage'>
  status: 'failed'
}

type PreviewReadyCommitArgs = {
  attachmentId: Id<'attachments'>
  height: number
  previewHeight: number
  previewStorageId: Id<'_storage'>
  previewWidth: number
  sourceStorageId: Id<'_storage'>
  status: 'ready'
  width: number
}

type PreviewCommitArgs = PreviewFailureCommitArgs | PreviewReadyCommitArgs

export type MediaPreviewResult =
  | {
      attachmentId: Id<'attachments'>
      height: number
      previewHeight: number
      previewStorageId: Id<'_storage'>
      previewWidth: number
      sourceStorageId: Id<'_storage'>
      status: 'ready'
      width: number
    }
  | {
      attachmentId: Id<'attachments'>
      reason: 'image_too_large' | 'missing_source' | 'not_an_image' | 'processor_failed'
      sourceStorageId: Id<'_storage'>
      status: 'failed'
    }

export const generate = internalAction({
  args: {
    attachmentId: v.id('attachments'),
    contentType: v.string(),
    sourceStorageId: v.id('_storage'),
  },
  handler: async (ctx, args): Promise<MediaPreviewResult> => {
    const commitFailure = async (
      reason: 'image_too_large' | 'missing_source' | 'not_an_image' | 'processor_failed',
    ): Promise<MediaPreviewResult> => {
      const commitArgs: PreviewCommitArgs = {
        attachmentId: args.attachmentId,
        reason,
        sourceStorageId: args.sourceStorageId,
        status: 'failed',
      }
      await ctx.runMutation(internal.messages.commitMediaPreview, commitArgs)
      return {
        attachmentId: args.attachmentId,
        reason,
        sourceStorageId: args.sourceStorageId,
        status: 'failed',
      }
    }

    if (!args.contentType.toLowerCase().startsWith('image/')) {
      return await commitFailure('not_an_image')
    }

    const source = await ctx.storage.get(args.sourceStorageId)
    if (!source) return await commitFailure('missing_source')
    if (source.size > maxPreviewSourceBytes) {
      return await commitFailure('image_too_large')
    }

    let bytes: Uint8Array
    try {
      bytes = new Uint8Array(await source.arrayBuffer())
    } catch {
      return await commitFailure('missing_source')
    }
    if (bytes.byteLength > maxPreviewSourceBytes) {
      return await commitFailure('image_too_large')
    }

    try {
      const image = sharp(bytes, {
        failOn: 'error',
        limitInputPixels: maxPreviewPixels,
        sequentialRead: true,
      })
      const metadata = await image.metadata()
      if (!metadata.width || !metadata.height) {
        return await commitFailure('processor_failed')
      }
      const dimensions = validateImageDimensions(
        { height: metadata.height, width: metadata.width },
        { maxDimension: maxPreviewDimension, maxPixels: maxPreviewPixels },
      )
      if (!dimensions.ok) return await commitFailure('image_too_large')

      const previewDimensions = calculatePreviewDimensions({ height: metadata.height, width: metadata.width })
      const output = await image
        .resize({
          fit: 'inside',
          height: previewDimensions.height,
          withoutEnlargement: true,
          width: previewDimensions.width,
        })
        .webp({ effort: 4, quality: previewQuality })
        .toBuffer()
      if (output.byteLength > maxPreviewOutputBytes) {
        return await commitFailure('processor_failed')
      }

      const previewStorageId = await ctx.storage.store(new Blob([output], { type: 'image/webp' }))
      const result: Extract<MediaPreviewResult, { status: 'ready' }> = {
        attachmentId: args.attachmentId,
        height: metadata.height,
        previewHeight: previewDimensions.height,
        previewStorageId,
        previewWidth: previewDimensions.width,
        sourceStorageId: args.sourceStorageId,
        status: 'ready',
        width: metadata.width,
      }
      try {
        const commitArgs: PreviewCommitArgs = {
          attachmentId: result.attachmentId,
          height: result.height,
          previewHeight: result.previewHeight,
          previewStorageId: result.previewStorageId,
          previewWidth: result.previewWidth,
          sourceStorageId: result.sourceStorageId,
          status: 'ready',
          width: result.width,
        }
        const outcome = await ctx.runMutation(internal.messages.commitMediaPreview, commitArgs)
        if (!outcome.committed) {
            await ctx.storage.delete(previewStorageId).catch(() => {
              // Cleanup is best effort after the commit outcome is known.
            })
        }
      } catch {
        await ctx.storage.delete(previewStorageId).catch(() => {
          // Cleanup is best effort after processing failed.
        })
        return await commitFailure('processor_failed')
      }
      return result
    } catch {
      return await commitFailure('processor_failed')
    }
  },
})
