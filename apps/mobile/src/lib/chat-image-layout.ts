import type { UploadableFile } from './attachment-upload';
import { withOperationTimeout } from './promise-timeout';

type ImageDimensions = { id?: string; width?: number | null; height?: number | null };
// Session-only geometry, bounded independently of image bytes and signed URLs.
const sentImageRatios = new Map<string, number>();
const MaxRememberedImages = 200;

/** Resolve document-picker image bounds before the first composer render. */
export async function prepareChatImageDimensions(
  file: UploadableFile,
  readSize: (uri: string) => Promise<{ width: number; height: number }>,
): Promise<UploadableFile> {
  if (!file.contentType.startsWith('image/') || (file.width && file.height)) return file;
  try {
    const dimensions = await withOperationTimeout(readSize(file.uri), 1500, 'image_dimensions');
    if (!Number.isFinite(dimensions.width) || !Number.isFinite(dimensions.height) || dimensions.width < 1 || dimensions.height < 1) return file;
    return { ...file, ...dimensions };
  } catch {
    // Unsupported files remain sendable and use a stable, uncropped placeholder.
    return file;
  }
}

export function rememberChatImageDimensions(id: string, image: ImageDimensions) {
  if (!image.width || !image.height || !Number.isFinite(image.width) || !Number.isFinite(image.height) || image.width < 1 || image.height < 1) return;
  sentImageRatios.delete(id);
  sentImageRatios.set(id, chatImageAspectRatio(image));
  if (sentImageRatios.size > MaxRememberedImages) {
    const oldestId = sentImageRatios.keys().next().value;
    if (oldestId !== undefined) sentImageRatios.delete(oldestId);
  }
}

/** Reserve identical bounds before decoding optimistic and confirmed images. */
export function chatImageAspectRatio(image: ImageDimensions): number {
  const rememberedRatio = image.id ? sentImageRatios.get(image.id) : undefined;
  if (rememberedRatio !== undefined) return rememberedRatio;
  const { width, height } = image;
  if (typeof width !== 'number' || typeof height !== 'number' ||
      !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return 4 / 3;
  return Math.min(Math.max(width / height, 0.56), 1.9);
}
