/**
 * Upload pipeline for composer attachments.
 *
 * The helpers here never touch Convex directly: the screen injects the three
 * mutation callers it already owns, so this module stays testable and free of
 * hooks. Files upload one at a time against a single message, which keeps a
 * failed file retryable without producing a duplicate message.
 */

import type { Id } from '../../../../convex/_generated/dataModel';

export type AttachmentKind = 'file' | 'voice_note';

export type UploadableFile = {
  contentType: string;
  durationMs?: number;
  filename: string;
  id: string;
  kind?: AttachmentKind;
  size?: number;
  uri: string;
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
    body: string;
    idempotencyKey?: string;
    replyToMessageId?: Id<'messages'>;
  }) => Promise<Id<'messages'>>;
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

/** Progress updates land in React state, so only report meaningful steps. */
const ProgressStep = 0.05;
const UploadTimeoutMs = 120_000;

function fallbackBody(attachments: UploadableFile[]) {
  const [first] = attachments;
  if (first?.kind === 'voice_note') return 'Voice note';
  if (attachments.length === 1 && first) return `Attached ${first.filename}`;
  return `Attached ${attachments.length} files`;
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
  messageId: Id<'messages'>;
  onProgress: (fraction: number) => void;
  target: AttachmentUploadTarget;
}) {
  const blob = await (await fetch(input.file.uri)).blob();
  const contentType = input.file.contentType || blob.type || 'application/octet-stream';
  const intent = await input.target.generateUploadUrl({
    contentType,
    durationMs: input.file.durationMs,
    filename: input.file.filename,
    intentKey: input.intentKey,
    kind: input.file.kind,
    size: blob.size,
  });
  let storageId = intent.storageId;
  if (!storageId) {
    if (!intent.uploadUrl) throw new Error('upload_intent_unavailable');
    const uploadedStorageId = await putBlob({
      blob,
      contentType,
      onProgress: input.onProgress,
      url: intent.uploadUrl,
    });
    const claimed = await input.target.claimUploadIntent({
      intentId: intent.intentId,
      storageId: uploadedStorageId,
    });
    if (!claimed.storageId) throw new Error('upload_intent_unavailable');
    storageId = claimed.storageId;
  }
  await input.target.attachFile({
    contentType,
    durationMs: input.file.durationMs,
    filename: input.file.filename,
    kind: input.file.kind ?? 'file',
    messageId: input.messageId,
    size: blob.size,
    storageId,
    uploadIntentId: intent.intentId,
  });
}

/**
 * Sends the composer payload: one message, then every attachment in order.
 * Returns the ids that failed so the composer can keep them for a retry, along
 * with the message they belong to.
 */
export async function sendComposerMessage(
  input: ComposerSubmission & { replyToMessageId?: Id<'messages'>; target: AttachmentUploadTarget },
): Promise<ComposerSubmissionResult> {
  const { attachments, body, replyToMessageId, reportProgress, target } = input;

  if (attachments.length === 0) {
    const messageId = await target.sendMessage({
      body,
      idempotencyKey: input.idempotencyKey,
      replyToMessageId,
    });
    return { failedIds: [], messageId };
  }

  const messageId =
    input.messageId ??
    (await target.sendMessage({
      body: body || fallbackBody(attachments),
      idempotencyKey: input.idempotencyKey,
      replyToMessageId,
    }));

  const failedIds: string[] = [];
  for (const file of attachments) {
    try {
      reportProgress(file.id, 0);
      await uploadOne({
        file,
        intentKey: `${input.idempotencyKey ?? messageId}:attachment:${file.id}`,
        messageId,
        onProgress: (fraction) => reportProgress(file.id, fraction),
        target,
      });
      reportProgress(file.id, 1);
    } catch {
      failedIds.push(file.id);
      reportProgress(file.id, 0);
    }
  }

  return { failedIds, messageId };
}
