type VideoDimensions = { height?: number | null; width?: number | null };
type VideoIdentity = { _id?: string; durationMs?: number | null; filename: string; id?: string; size?: number | null; storageId?: string };

const RememberedVideoRatiosLimit = 200;
const rememberedVideoRatios = new Map<string, number>();

export const DefaultChatVideoAspectRatio = 16 / 9;

/** Bound tall previews to the visible chat while keeping the source frame ratio. */
export function chatVideoFrameSize(maxWidth: number, viewportHeight: number, aspectRatio: number) {
  const safeRatio = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : DefaultChatVideoAspectRatio;
  const maxHeight = Math.max(0, Math.min(420, viewportHeight * 0.54));
  const width = Math.max(0, Math.min(maxWidth, maxHeight * safeRatio));
  return { width, height: width / safeRatio };
}

/** Reserve a predictable message frame before a video surface is mounted. */
export function chatVideoAspectRatio(video: VideoDimensions): number {
  const { height, width } = video;
  if (
    typeof width !== 'number' || typeof height !== 'number' ||
    !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0
  ) return DefaultChatVideoAspectRatio;

  return Math.min(Math.max(width / height, 0.56), 1.9);
}

/**
 * Use an immutable identity so size and duration metadata arriving with the
 * confirmed message cannot change the pending video's thumbnail key.
 */
export function videoGeometryKey(video: VideoIdentity) {
  const identity = video.storageId ?? video._id ?? video.id;
  return identity
    ? `video:${identity}`
    : JSON.stringify([null, video.filename, video.size ?? null, video.durationMs ?? null]);
}

export function rememberVideoAspectRatio(key: string, ratio: number) {
  if (!Number.isFinite(ratio) || ratio <= 0) return;
  rememberedVideoRatios.delete(key);
  rememberedVideoRatios.set(key, ratio);
  while (rememberedVideoRatios.size > RememberedVideoRatiosLimit) {
    const oldestKey = rememberedVideoRatios.keys().next().value;
    if (oldestKey === undefined) break;
    rememberedVideoRatios.delete(oldestKey);
  }
}

export function rememberedVideoAspectRatio(key: string) {
  return rememberedVideoRatios.get(key);
}
