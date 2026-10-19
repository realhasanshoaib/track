import type { UploadableFile } from './attachment-upload';
import { withOperationTimeout } from './promise-timeout';

type ImageDimensions = { id?: string; width?: number | null; height?: number | null };
// Session-only geometry, bounded independently of image bytes and signed URLs.
const sentImageRatios = new Map<string, number>();
const MaxRememberedImages = 200;
export const MaxImageEdge = 1600;

type OptimizedImageFile = { height: number; uri: string; width: number } &
  Partial<Pick<UploadableFile, 'contentType' | 'filename' | 'size'>>;
type ImageTransformer = (
  uri: string,
  dimensions: { width: number; height: number },
) => Promise<OptimizedImageFile>;

function resizedDimensions(width: number, height: number, maxEdge: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) ||
      !Number.isFinite(maxEdge) || width < 1 || height < 1 || maxEdge < 1) return null;
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  if (scale === 1) return null;
  return {
    height: Math.max(1, Math.round(height * scale)),
    width: Math.max(1, Math.round(width * scale)),
  };
}

/** Prepare oversized photos before they enter the composer or upload queue. */
export async function prepareChatImageForUpload(
  file: UploadableFile,
  transform: ImageTransformer,
  maxEdge = MaxImageEdge,
): Promise<UploadableFile> {
  if (!file.contentType.toLowerCase().startsWith('image/') || !file.width || !file.height) return file;
  const dimensions = resizedDimensions(file.width, file.height, maxEdge);
  if (!dimensions) return file;

  try {
    const optimized = await withOperationTimeout(
      transform(file.uri, dimensions),
      20_000,
      'image_upload_preparation',
    );
    if (
      !optimized.uri ||
      !Number.isFinite(optimized.width) || !Number.isFinite(optimized.height) ||
      optimized.width < 1 || optimized.height < 1 ||
      Math.max(optimized.width, optimized.height) > maxEdge
    ) return file;
    const prepared = { ...file };
    // The source size belongs to the original image, not the transformed cache file.
    delete prepared.size;
    return { ...prepared, ...optimized };
  } catch {
    // Keep the original attachment usable if a platform image codec fails.
    return file;
  }
}

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
