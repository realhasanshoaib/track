import type { UploadableFile } from '@/lib/attachment-upload';
import { isImageAttachment } from './attachment-presentation';

export type PendingMessageAttachment = UploadableFile & { progress?: number };

export type PendingMessage = {
  at: number;
  attachments?: PendingMessageAttachment[];
  body: string;
  id: string;
  idempotencyKey?: string;
  messageId?: string;
};

export type PendingMessageGroupAnchor = {
  at: number;
  authorId: string | null;
  key: string;
  kind: 'assistant' | 'message';
};

const FIVE_MINUTES = 5 * 60 * 1000;

/** Match the row top spacing the confirmed timeline will use after send. */
export function pendingMessageGroupStarts(
  pending: readonly Pick<PendingMessage, 'at' | 'id'>[],
  authorId: string,
  previous: PendingMessageGroupAnchor | null,
  interruptedRowIds: ReadonlySet<string> = new Set(),
): ReadonlyMap<string, boolean> {
  const starts = new Map<string, boolean>();
  let previousItem = previous;

  for (const message of [...pending].sort((left, right) => left.at - right.at)) {
    const sameDay = previousItem !== null && new Date(previousItem.at).toDateString() === new Date(message.at).toDateString();
    const continuesGroup = previousItem?.kind === 'message'
      && previousItem.authorId === authorId
      && sameDay
      && message.at - previousItem.at <= FIVE_MINUTES
      && !interruptedRowIds.has(previousItem.key);
    starts.set(message.id, !continuesGroup);
    previousItem = { at: message.at, authorId, key: message.id, kind: 'message' };
  }

  return starts;
}

/** Stable across upload-progress changes so screens can keep confirmed list data memoized. */
export function pendingMessageAcknowledgementKey(pending: readonly PendingMessage[]): string {
  return pending.flatMap(({ messageId }) => messageId ? [messageId] : []).join('\0');
}

/** Changes only when optimistic rows change or hand off to their server ID. */
export function pendingMessageLayoutKey(pending: readonly PendingMessage[]): string {
  return JSON.stringify(pending.map(({ id, messageId }) => [id, messageId ?? null]));
}

/** Keep a confirmed message hidden until its optimistic row is ready to hand off. */
export function pendingMessageIdempotencyKey(pending: readonly PendingMessage[]): string {
  return pending.flatMap(({ idempotencyKey }) => idempotencyKey ? [idempotencyKey] : []).join('\0');
}

/** Resolve a live query row if it arrives before the mutation promise returns. */
export function correlatePendingMessageIds<
  Message extends { message: { _id: string; idempotencyKey?: string } },
>(pending: PendingMessage[], messages: readonly Message[]): PendingMessage[] {
  const messageIdsByKey = new Map(messages.flatMap(({ message }) => (
    message.idempotencyKey ? [[message.idempotencyKey, message._id] as const] : []
  )));
  let changed = false;
  const next = pending.map((candidate) => {
    if (candidate.messageId || !candidate.idempotencyKey) return candidate;
    const messageId = messageIdsByKey.get(candidate.idempotencyKey);
    if (!messageId) return candidate;
    changed = true;
    return { ...candidate, messageId };
  });
  return changed ? next : pending;
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
