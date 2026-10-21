import type { VideoThumbnail } from 'expo-video';
import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import { chatVideoAspectRatio } from './video-layout';
import { rememberVideoFrameRatio } from './video-geometry-cache';

const ThumbnailCacheLimit = 32;
export type VideoFrameSource = VideoThumbnail | { uri: string; width: number; height: number; cacheKey?: string };
type StoredFrame = { key: string; name: string; width: number; height: number };
const thumbnailCache = new Map<string, Promise<VideoFrameSource | undefined>>();
const readyThumbnails = new Map<string, VideoFrameSource>();
const storedFrames = new Map<string, StoredFrame>();
const thumbnailAliases = new Map<string, string>();
const frameDirectory = Platform.OS === 'web' ? null : new Directory(Paths.cache, 'track-video-frames');
let restoredFrames = false;
let frameSequence = 0;
const thumbnailQueues = [Promise.resolve(), Promise.resolve()];
let nextThumbnailQueue = 0;
let storeQueue = Promise.resolve();

function restoreStoredFrames() {
  if (restoredFrames || !frameDirectory) return;
  restoredFrames = true;
  try {
    const index = new File(frameDirectory, 'index.json');
    if (!index.exists) return;
    const entries: unknown = JSON.parse(index.textSync());
    if (!Array.isArray(entries)) return;
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') continue;
      const { key, name, width, height } = entry as Partial<StoredFrame>;
      if (typeof key !== 'string' || typeof name !== 'string' || !/^frame-[\w-]+\.jpg$/.test(name)
        || typeof width !== 'number' || typeof height !== 'number' || width <= 0 || height <= 0) continue;
      if (new File(frameDirectory, name).exists) storedFrames.set(key, { key, name, width, height });
    }
  } catch {
    // A cleared or corrupt cache only means the frame must be generated again.
  }
}

async function storeThumbnail(key: string, thumbnail: VideoThumbnail) {
  if (!frameDirectory) return;
  try {
    const { ImageManipulator, SaveFormat } = await import('expo-image-manipulator');
    const image = await ImageManipulator.manipulate(thumbnail).renderAsync();
    const saved = await image.saveAsync({ compress: 0.76, format: SaveFormat.JPEG });
    frameDirectory.create({ idempotent: true, intermediates: true });
    const name = `frame-${Date.now()}-${frameSequence++}.jpg`;
    await new File(saved.uri).copy(new File(frameDirectory, name));
    const alias = thumbnailAliases.get(key);
    updateStoredFrames([
      { key, name, width: thumbnail.width, height: thumbnail.height },
      ...(alias ? [{ key: alias, name, width: thumbnail.width, height: thumbnail.height }] : []),
    ]);
  } catch {
    // Keep the native in-memory frame even if the optional disk cache fails.
  }
}

function updateStoredFrames(entries: StoredFrame[]) {
  if (!frameDirectory) return;
  restoreStoredFrames();
  const previousNames = new Set([...storedFrames.values()].map(({ name }) => name));
  for (const entry of entries) {
    storedFrames.delete(entry.key);
    storedFrames.set(entry.key, entry);
  }
  while (storedFrames.size > ThumbnailCacheLimit) {
    const oldest = storedFrames.keys().next().value;
    if (oldest === undefined) break;
    storedFrames.delete(oldest);
  }
  const retainedNames = new Set([...storedFrames.values()].map(({ name }) => name));
  for (const name of previousNames) {
    if (!retainedNames.has(name)) {
      try {
        const oldFile = new File(frameDirectory, name);
        if (oldFile.exists) oldFile.delete();
      } catch {
        // Cache cleanup must not prevent the new frame index from being saved.
      }
    }
  }
  const index = new File(frameDirectory, 'index.json');
  if (!index.exists) index.create();
  index.write(JSON.stringify([...storedFrames.values()]));
}

/** Keep a generated frame across local-upload and signed-URL handoffs. */
export function cachedVideoThumbnail(geometryKey?: string) {
  if (!geometryKey) return undefined;
  const ready = readyThumbnails.get(geometryKey);
  if (ready) return ready;
  restoreStoredFrames();
  let stored = storedFrames.get(geometryKey);
  if (!stored && geometryKey.startsWith('video:')) {
    const identity = geometryKey.slice('video:'.length);
    // Earlier app builds included mutable metadata in the key. Reuse those
    // cached frames after the key changes to the video's stable storage ID.
    stored = [...storedFrames.values()].find(({ key }) => {
      if (!key.startsWith('[')) return false;
      try {
        const parsed: unknown = JSON.parse(key);
        return Array.isArray(parsed) && parsed[0] === identity;
      } catch {
        return false;
      }
    });
    if (stored) {
      try { updateStoredFrames([{ ...stored, key: geometryKey }]); } catch { /* The old cache entry is still usable. */ }
    }
  }
  if (!stored || !frameDirectory) return undefined;
  const file = new File(frameDirectory, stored.name);
  if (!file.exists) {
    storedFrames.delete(geometryKey);
    return undefined;
  }
  const source = { uri: file.uri, width: stored.width, height: stored.height };
  rememberVideoFrameRatio(geometryKey, chatVideoAspectRatio(source));
  readyThumbnails.set(geometryKey, source);
  return source;
}

/** Preserve the local thumbnail when the upload receives its stable storage ID. */
export function aliasVideoThumbnail(localKey: string, storedKey: string) {
  thumbnailAliases.set(localKey, storedKey);
  while (thumbnailAliases.size > ThumbnailCacheLimit) {
    const oldest = thumbnailAliases.keys().next().value;
    if (oldest === undefined) break;
    thumbnailAliases.delete(oldest);
  }
  const ready = readyThumbnails.get(localKey);
  if (ready) readyThumbnails.set(storedKey, ready);
  while (readyThumbnails.size > ThumbnailCacheLimit) {
    const oldest = readyThumbnails.keys().next().value;
    if (oldest === undefined) break;
    readyThumbnails.delete(oldest);
  }
  const ratio = ready && chatVideoAspectRatio(ready);
  if (ratio) rememberVideoFrameRatio(storedKey, ratio);
  storeQueue = storeQueue.then(() => {
    restoreStoredFrames();
    const stored = storedFrames.get(localKey);
    if (stored) updateStoredFrames([{ ...stored, key: storedKey }]);
  }).catch(() => undefined);
}

/** Wait until the native player has attached the source before extracting a frame. */
async function waitForVideoSource(
  player: import('expo-video').VideoPlayer,
  timeoutMs = 15_000,
) {
  if (player.status === 'readyToPlay') return true;
  if (player.status === 'error') return false;

  return new Promise<boolean>((resolve) => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const finish = (ready: boolean) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      sourceSubscription.remove();
      statusSubscription.remove();
      resolve(ready);
    };
    const sourceSubscription = player.addListener('sourceLoad', () => finish(true));
    const statusSubscription = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay') finish(true);
      else if (status === 'error') finish(false);
    });
    timeout = setTimeout(() => finish(false), timeoutMs);

    // The source may have loaded between the initial check and listener setup.
    if (player.status === 'readyToPlay') finish(true);
    else if (player.status === 'error') finish(false);
  });
}

/** Bound concurrent decoders so one slow video does not block every thumbnail. */
export function videoThumbnail(uri: string, geometryKey?: string) {
  const ready = cachedVideoThumbnail(geometryKey);
  if (ready) return Promise.resolve(ready);
  const cached = thumbnailCache.get(uri);
  if (cached) {
    if (geometryKey) void cached.then((frame) => {
      if (!frame) return;
      if ('uri' in frame) readyThumbnails.set(geometryKey, frame);
      else rememberThumbnail(geometryKey, frame);
    });
    return cached;
  }

  const queueIndex = nextThumbnailQueue++ % thumbnailQueues.length;
  const pending = thumbnailQueues[queueIndex].then(async () => {
    let player: ReturnType<typeof import('expo-video').createVideoPlayer> | undefined;
    try {
      const { createVideoPlayer } = await import('expo-video');
      player = createVideoPlayer(uri);
      // A newly created player can still have no native asset attached. Asking
      // for a frame at that point returns an empty array on iOS and Android.
      if (!await waitForVideoSource(player)) return undefined;

      // Use a frame near the start but within the clip. Fixed 0.5s requests can
      // be outside the duration of short videos.
      const duration = player.duration;
      const frameTime = Number.isFinite(duration) && duration > 0
        ? Math.min(0.5, duration * 0.1)
        : 0;
      const [thumbnail] = await player.generateThumbnailsAsync([frameTime], {
        maxWidth: 512,
        maxHeight: 512,
      });
      if (thumbnail && geometryKey) rememberThumbnail(geometryKey, thumbnail);
      return thumbnail;
    } catch {
      return undefined;
    } finally {
      player?.release();
    }
  });
  thumbnailQueues[queueIndex] = pending.then(() => undefined, () => undefined);
  thumbnailCache.set(uri, pending);
  // A missing native decoder or a transient URL failure should not poison the
  // URI cache for the rest of the session. Later renders can retry thumbnailing.
  void pending.then((thumbnail) => {
    if (!thumbnail && thumbnailCache.get(uri) === pending) thumbnailCache.delete(uri);
  }, () => {
    if (thumbnailCache.get(uri) === pending) thumbnailCache.delete(uri);
  });
  while (thumbnailCache.size > ThumbnailCacheLimit) {
    const oldest = thumbnailCache.keys().next().value;
    if (oldest === undefined) break;
    thumbnailCache.delete(oldest);
  }
  return pending;
}

/** Reuse the cached JPEG when publishing a poster; do not encode the frame twice. */
export async function videoPosterFile(uri: string, geometryKey: string) {
  const frame = await videoThumbnail(uri, geometryKey);
  if (!frame) return undefined;
  if ('uri' in frame) return frame;
  await storeQueue;
  const stored = storedFrames.get(geometryKey);
  if (!stored || !frameDirectory) return undefined;
  const file = new File(frameDirectory, stored.name);
  return file.exists ? { uri: file.uri, width: stored.width, height: stored.height } : undefined;
}

function rememberThumbnail(key: string, thumbnail: VideoThumbnail) {
  rememberVideoFrameRatio(key, chatVideoAspectRatio(thumbnail));
  const alias = thumbnailAliases.get(key);
  if (alias) {
    readyThumbnails.set(alias, thumbnail);
    rememberVideoFrameRatio(alias, chatVideoAspectRatio(thumbnail));
  }
  readyThumbnails.delete(key);
  readyThumbnails.set(key, thumbnail);
  while (readyThumbnails.size > ThumbnailCacheLimit) {
    const oldest = readyThumbnails.keys().next().value;
    if (oldest === undefined) break;
    readyThumbnails.delete(oldest);
  }
  storeQueue = storeQueue.then(() => storeThumbnail(key, thumbnail));
}
