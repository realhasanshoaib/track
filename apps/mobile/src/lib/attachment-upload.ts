/**
 * Upload pipeline for composer attachments.
 *
 * The helpers here never touch Convex directly: the screen injects the three
 * mutation callers it already owns, so this module stays testable and free of
 * hooks. New messages attach all uploaded files atomically; retry sends add
 * only the files that failed the first time.
 */

import type { Id } from '../../../../convex/_generated/dataModel';
import { releasePreparedAttachment, resolvePreparedAttachment } from './attachment-preview-flow';
import { withOperationTimeout } from './promise-timeout';

export type AttachmentKind = 'file' | 'voice_note';

export type UploadableFile = {
  contentType: string;
  durationMs?: number;
  filename: string;
  height?: number;
  id: string;
  kind?: AttachmentKind;
  /** Keep the displayed local image stable while `uri` changes to its upload-optimized copy. */
  previewUri?: string;
  size?: number;
  uri: string;
  width?: number;
};

export type AttachmentUploadTarget = {
  attachFile: (input: {
    contentType: string;
    durationMs?: number;
    filename: string;
    kind?: AttachmentKind;
    messageId: Id<'messages'>;
    uploadIntentId: Id<'messageUploadIntents'>;
    size: number;
    storageId: Id<'_storage'>;
  }) => Promise<unknown>;
  /** Persist uploaded bytes if message attachment creation fails, enabling retry without re-upload. */
  claimUploadIntent: (input: { intentId: Id<'messageUploadIntents'>; storageId: string }) => Promise<{
    storageId: Id<'_storage'> | null;
  }>;
  generateUploadUrl: (input: {
    contentType: string;
    durationMs?: number;
    filename: string;
    intentKey: string;
    kind?: AttachmentKind;
    size: number;
  }) => Promise<UploadIntentResponse>;
  sendMessage: (input: {
    attachments?: Array<{
      contentType: string;
      durationMs?: number;
      filename: string;
      kind?: AttachmentKind;
      size: number;
      storageId: Id<'_storage'>;
      uploadIntentId: Id<'messageUploadIntents'>;
    }>;
    body: string;
    idempotencyKey?: string;
    replyToMessageId?: Id<'messages'>;
  }) => Promise<Id<'messages'>>;
  /** Read size without loading the file bytes into the JavaScript heap. */
  getFileSize?: (file: UploadableFile) => number | Promise<number>;
  /** Stream the local file through a platform-native uploader when available. */
  uploadFile?: (input: {
    contentType: string;
    file: UploadableFile;
    onProgress: (fraction: number) => void;
    url: string;
  }) => Promise<string>;
};

export type UploadIntentResponse = {
  expiresAt: number;
  intentId: Id<'messageUploadIntents'>;
  status: 'issued' | 'uploaded' | 'claimed';
  storageId: Id<'_storage'> | null;
  uploadUrl: string | null;
};

export type ComposerSubmission = {
  attachments: UploadableFile[];
  body: string;
  idempotencyKey?: string;
  /** Set when retrying: reuses the message created by the first attempt. */
  messageId?: Id<'messages'> | null;
  replyToMessageId?: Id<'messages'>;
  reportProgress: (attachmentId: string, progress: number) => void;
};

export type ComposerSubmissionResult = {
  failedIds: string[];
  messageId: Id<'messages'> | null;
};

type PreparedAttachment = {
  contentType: string;
  durationMs?: number;
  file: UploadableFile;
  kind: AttachmentKind;
  size: number;
  storageId: Id<'_storage'>;
  uploadIntentId: Id<'messageUploadIntents'>;
};

/** Progress updates land in React state, so only report meaningful steps. */
const ProgressStep = 0.05;
const UploadTimeoutMs = 120_000;
const BackendMutationTimeoutMs = 30_000;
const UploadRetryRecoveryTimeoutMs = 5_000;
const MaxConcurrentUploads = 3;

async function mapConcurrent<Result>(
  count: number,
  task: (index: number) => Promise<Result>,
): Promise<Result[]> {
  const results: Result[] = [];
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < count) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await task(index);
    }
  };

  await Promise.all(Array.from({ length: Math.min(count, MaxConcurrentUploads) }, worker));
  return results;
}

function fallbackBody(attachments: PreparedAttachment[]) {
  const [first] = attachments;
  if (first?.kind === 'voice_note') return 'Voice note';
  if (attachments.length > 0 && attachments.every(({ contentType }) => contentType.startsWith('image/'))) {
    return `Attached ${attachments.length} image${attachments.length === 1 ? '' : 's'}`;
  }
  return attachments.length === 1 ? 'Attached file' : `Attached ${attachments.length} files`;
}

function putBlob(input: {
  blob: Blob;
  contentType: string;
  onProgress: (fraction: number) => void;
  url: string;
}) {
  return new Promise<string>((resolve, reject) => {
    let reported = 0;
    const request = new XMLHttpRequest();
    request.open('POST', input.url);
    request.setRequestHeader('Content-Type', input.contentType);
    request.upload.onprogress = (event) => {
      if (!event.lengthComputable || event.total === 0) return;
      const fraction = Math.min(1, event.loaded / event.total);
      if (fraction - reported < ProgressStep && fraction < 1) return;
      reported = fraction;
      input.onProgress(fraction);
    };
    request.onload = () => {
      if (request.status < 200 || request.status >= 300) {
        reject(new Error('upload_failed'));
        return;
      }
      try {
        const payload: unknown = JSON.parse(request.responseText);
        if (!isStoragePayload(payload)) {
          reject(new Error('upload_failed'));
          return;
        }
        resolve(payload.storageId);
      } catch {
        reject(new Error('upload_failed'));
      }
    };
    request.onerror = () => reject(new Error('upload_failed'));
    request.ontimeout = () => reject(new Error('upload_timeout'));
    request.timeout = UploadTimeoutMs;
    request.send(input.blob);
  });
}

function isStoragePayload(value: unknown): value is { storageId: string } {
  return typeof value === 'object' && value !== null && 'storageId' in value && typeof value.storageId === 'string' && value.storageId.length > 0;
}

async function uploadOne(input: {
  file: UploadableFile;
  intentKey: string;
  onProgress: (fraction: number) => void;
  target: AttachmentUploadTarget;
}): Promise<PreparedAttachment> {
  const file = await resolvePreparedAttachment(input.file);
  let blob: Blob | undefined;
  let size: number;
  if (input.target.uploadFile && input.target.getFileSize) {
    size = await input.target.getFileSize(file);
  } else {
    blob = await (await fetch(file.uri)).blob();
    size = blob.size;
  }
  if (!Number.isFinite(size) || size < 0) throw new Error('file_size_unavailable');
  const contentType = file.contentType || blob?.type || 'application/octet-stream';
  const intent = await withOperationTimeout(input.target.generateUploadUrl({
    contentType,
    durationMs: file.durationMs,
    filename: file.filename,
    intentKey: input.intentKey,
    kind: file.kind,
    size,
  }), BackendMutationTimeoutMs, 'attachment_upload_intent');
  let storageId: Id<'_storage'> | null = intent.storageId;
  if (!storageId) {
    if (!intent.uploadUrl) throw new Error('upload_intent_unavailable');
    const uploadedStorageId = input.target.uploadFile
      ? await input.target.uploadFile({
          contentType,
          file,
          onProgress: input.onProgress,
          url: intent.uploadUrl,
        })
      : await putBlob({
          blob: blob!,
          contentType,
          onProgress: input.onProgress,
          url: intent.uploadUrl,
        });
    // The send or retry mutation validates and claims this server-issued ID
    // atomically, so the upload path does not need another network round trip.
    storageId = uploadedStorageId as Id<'_storage'>;
  }
  return {
    contentType,
    durationMs: file.durationMs,
    file,
    kind: file.kind ?? 'file',
    size,
    storageId,
    uploadIntentId: intent.intentId,
  };
}

async function persistUploadedBytesForRetry(
  attachments: PreparedAttachment[],
  target: AttachmentUploadTarget,
) {
  await Promise.all(attachments.map(async ({ storageId, uploadIntentId }) => {
    try {
      await withOperationTimeout(target.claimUploadIntent({
        intentId: uploadIntentId,
        storageId,
      }), UploadRetryRecoveryTimeoutMs, 'attachment_upload_retry_recovery');
    } catch {
      // Preserve the send failure. A later retry can safely upload the source again.
    }
  }));
}

/** Upload files first, then create one message with every successful upload. */
export async function sendComposerMessage(
  input: ComposerSubmission & {
    onMessageCreated?: (messageId: Id<'messages'>) => void;
    replyToMessageId?: Id<'messages'>;
    target: AttachmentUploadTarget;
  },
): Promise<ComposerSubmissionResult> {
  const { attachments, body, replyToMessageId, reportProgress, target } = input;

  if (attachments.length === 0) {
    const messageId = await withOperationTimeout(target.sendMessage({
      body,
      idempotencyKey: input.idempotencyKey,
      replyToMessageId,
    }), BackendMutationTimeoutMs, 'message_send');
    input.onMessageCreated?.(messageId);
    return { failedIds: [], messageId };
  }

  const uploadResults = await mapConcurrent(attachments.length, async (index) => {
    const file = attachments[index];
    if (!file) return { failedId: null, prepared: null };
    try {
      reportProgress(file.id, 0);
      const prepared = await uploadOne({
        file,
        intentKey: `${input.idempotencyKey ?? 'attachment'}:attachment:${file.id}`,
        onProgress: (fraction) => reportProgress(file.id, fraction),
        target,
      });
      return { failedId: null, prepared };
    } catch {
      reportProgress(file.id, 0);
      return { failedId: file.id, prepared: null };
    }
  });
  const prepared = uploadResults.flatMap(({ prepared }) => prepared ? [prepared] : []);
  const failedIds = uploadResults.flatMap(({ failedId }) => failedId ? [failedId] : []);

  let messageId = input.messageId ?? null;
  if (!messageId && (body || prepared.length > 0)) {
    try {
      messageId = await withOperationTimeout(target.sendMessage({
        attachments: prepared.map(({ contentType, durationMs, file, kind, size, storageId, uploadIntentId }) => ({
          contentType,
          durationMs,
          filename: file.filename,
          kind,
          size,
          storageId,
          uploadIntentId,
        })),
        body: body || fallbackBody(prepared),
        idempotencyKey: input.idempotencyKey,
        replyToMessageId,
      }), BackendMutationTimeoutMs, 'message_send');
    } catch (error) {
      await persistUploadedBytesForRetry(prepared, target);
      throw error;
    }
    input.onMessageCreated?.(messageId);
    for (const attachment of prepared) {
      releasePreparedAttachment(attachment.file.id);
      reportProgress(attachment.file.id, 1);
    }
  } else if (messageId) {
    const retryMessageId = messageId;
    input.onMessageCreated?.(retryMessageId);
    const attachmentFailures = await mapConcurrent(prepared.length, async (index) => {
      const attachment = prepared[index];
      if (!attachment) return null;
      try {
        await withOperationTimeout(target.attachFile({
          contentType: attachment.contentType,
          durationMs: attachment.durationMs,
          filename: attachment.file.filename,
          kind: attachment.kind,
          messageId: retryMessageId,
          size: attachment.size,
          storageId: attachment.storageId,
          uploadIntentId: attachment.uploadIntentId,
        }), BackendMutationTimeoutMs, 'attachment_attach');
        releasePreparedAttachment(attachment.file.id);
        reportProgress(attachment.file.id, 1);
        return null;
      } catch {
        await persistUploadedBytesForRetry([attachment], target);
        reportProgress(attachment.file.id, 0);
        return attachment.file.id;
      }
    });
    failedIds.push(...attachmentFailures.filter((id): id is string => id !== null));
  }

  return { failedIds, messageId };
}
