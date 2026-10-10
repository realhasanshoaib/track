import type { UploadableFile } from '@/lib/attachment-upload';
import { isImageAttachment } from './attachment-presentation';

export type PendingMessageAttachment = UploadableFile & { progress?: number };

export type PendingMessage = {
  at: number;
  attachments?: PendingMessageAttachment[];
  body: string;
  id: string;
  messageId?: string;
};

/** Stable across upload-progress changes so screens can keep confirmed list data memoized. */
export function pendingMessageAcknowledgementKey(pending: readonly PendingMessage[]): string {
  return pending.flatMap(({ messageId }) => messageId ? [messageId] : []).join('\0');
}

export type ReceivedMessageAttachmentState = {
  count: number;
  ready: boolean;
};

export function receivedMessageAttachmentStates(messages: Array<{
  attachments: Array<{ attachment: { contentType: string; previewStatus?: string }; previewUrl?: string | null; url: string | null }>;
  message: { _id: string };
}>) {
  return new Map<string, ReceivedMessageAttachmentState>(messages.map(({ attachments, message }) => [
    message._id,
    {
      count: attachments.length,
      ready: attachments.every(({ attachment, previewUrl, url }) => {
        const image = isImageAttachment(attachment.contentType);
        const hasSource = Boolean(url || (image && previewUrl));
        return hasSource && (!image || attachment.previewStatus !== 'pending');
      }),
    },
  ]));
}

/** Keep optimistic rows until their exact server message appears in the live page. */
export function reconcilePendingMessages(
  pending: PendingMessage[],
  receivedMessageIds: ReadonlySet<string>,
  attachmentStates: ReadonlyMap<string, ReceivedMessageAttachmentState> = new Map(),
): PendingMessage[] {
  const next = pending.filter((message) => {
    if (!message.messageId || !receivedMessageIds.has(message.messageId)) return true;
    if (!message.attachments?.length) return false;
    const state = attachmentStates.get(message.messageId);
    return !state || state.count < message.attachments.length || !state.ready;
  });
  return next.length === pending.length ? pending : next;
}
