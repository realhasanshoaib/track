import { platformStorage } from './platform-storage';
import { rememberVideoAspectRatio, rememberedVideoAspectRatio } from './video-layout';

const StorageKey = 'track.chat.video-geometry.v1';
const MaxStoredLength = 1800;
const persistedRatios = new Map<string, number>();
let restored = false;
let writeTimer: ReturnType<typeof setTimeout> | null = null;

function restore() {
  if (restored) return;
  restored = true;
  try {
    const raw = platformStorage.getItem(StorageKey);
    if (!raw) return;
    const entries: unknown = JSON.parse(raw);
    if (!Array.isArray(entries)) return;
    for (const entry of entries) {
      if (!Array.isArray(entry) || typeof entry[0] !== 'string' || typeof entry[1] !== 'number') continue;
      if (!Number.isFinite(entry[1]) || entry[1] <= 0) continue;
      persistedRatios.set(entry[0], entry[1]);
      rememberVideoAspectRatio(entry[0], entry[1]);
    }
  } catch {
    // A missing native store or invalid old cache must never block chat rendering.
  }
}

function persist() {
  writeTimer = null;
  const entries = [...persistedRatios.entries()];
  let serialized = JSON.stringify(entries);
  while (serialized.length > MaxStoredLength && entries.length > 0) {
    entries.shift();
    serialized = JSON.stringify(entries);
  }
  try {
    platformStorage.setItem(StorageKey, serialized);
  } catch {
    // Geometry is recoverable from the video itself on the next mount.
  }
}

export function rememberedVideoFrameRatio(key: string) {
  restore();
  return rememberedVideoAspectRatio(key);
}

export function rememberVideoFrameRatio(key: string, ratio: number) {
  restore();
  if (!Number.isFinite(ratio) || ratio <= 0) return;
  rememberVideoAspectRatio(key, ratio);
  persistedRatios.delete(key);
  persistedRatios.set(key, ratio);
  if (writeTimer !== null) clearTimeout(writeTimer);
  writeTimer = setTimeout(persist, 250);
}
