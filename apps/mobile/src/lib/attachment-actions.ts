import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Linking, Platform } from 'react-native';

/**
 * Attachment downloads land in a dedicated cache directory keyed by attachment
 * id, so repeated opens reuse the local copy and the system may reclaim the
 * space when storage runs low.
 */
const CACHE_DIRECTORY = 'attachments';
const DOWNLOAD_TIMEOUT_MS = 120_000;

const UNSAFE_NAME = /[^a-zA-Z0-9._-]/g;

export type AttachmentTarget = {
  /** Stable id used to namespace the cached copy. */
  cacheKey: string;
  contentType: string;
  filename: string;
  url: string;
};

function localFile({ cacheKey, filename }: AttachmentTarget) {
  const directory = new Directory(Paths.cache, CACHE_DIRECTORY);
  if (!directory.exists) directory.create({ idempotent: true, intermediates: true });
  const safeName = filename.replace(UNSAFE_NAME, '_') || 'file';
  return new File(directory, `${cacheKey}-${safeName}`);
}

/** Downloads the attachment to the cache directory and resolves its local URI. */
export async function downloadAttachment(target: AttachmentTarget) {
  const destination = localFile(target);
  if (destination.exists) return destination.uri;
  try {
    const downloaded = await withDownloadTimeout((signal) =>
      File.downloadFileAsync(target.url, destination, { idempotent: true, signal }),
    );
    return downloaded.uri;
  } catch (error) {
    if (destination.exists) {
      try {
        destination.delete();
      } catch {
        // Keep the download error as the useful failure if partial-file cleanup also fails.
      }
    }
    throw error;
  }
}

/**
 * Web downloads the original filename without leaving chat. Native platforms
 * hand a cached copy to the system share and save sheet.
 */
export async function shareAttachment(target: AttachmentTarget) {
  if (Platform.OS === 'web') {
    await downloadInBrowser(target);
    return;
  }
  if (!(await Sharing.isAvailableAsync())) {
    await Linking.openURL(target.url);
    return;
  }
  const uri = await downloadAttachment(target);
  await Sharing.shareAsync(uri, {
    dialogTitle: target.filename,
    mimeType: target.contentType,
    UTI: target.contentType,
  });
}

async function downloadInBrowser(target: AttachmentTarget) {
  const objectUrl = await withDownloadTimeout(async (signal) => {
    const response = await fetch(target.url, { signal });
    if (!response.ok) throw new Error('attachment_download_failed');
    return URL.createObjectURL(await response.blob());
  });
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = target.filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  }
}

async function withDownloadTimeout<Result>(download: (signal: AbortSignal) => Promise<Result>) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    return await download(controller.signal);
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('attachment_download_timeout', { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Human-readable failure copy for a download or share attempt. */
export function attachmentActionError(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (message === 'attachment_download_timeout') {
    return 'The download took too long. Check your connection and try again.';
  }
  if (/network|fetch|offline|timed?\s*out|connection/i.test(message)) {
    return 'The attachment could not be downloaded. Check your connection and try again.';
  }
  if (/permission|forbidden|unauthori[sz]ed/i.test(message)) {
    return 'You no longer have permission to open this attachment.';
  }
  return 'The attachment could not be downloaded or opened. Please try again.';
}
