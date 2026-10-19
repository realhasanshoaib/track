import { Image } from 'expo-image';
import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';

import type { DetailedMessage } from '../components/chat/types';
import { isImageAttachment } from '../lib/attachment-presentation';
import { rememberChatImageDimensions } from '../lib/chat-image-layout';
import { correlatePendingMessageIds, reconcilePendingMessages, receivedMessageAttachmentStates, type PendingMessage } from '../lib/pending-messages';

/** Keep local thumbnails visible while the confirmed image enters the memory cache. */
export function usePendingMessageReconciliation(
  messages: DetailedMessage[] | undefined,
  pendingMessages: PendingMessage[],
  setPendingMessages: Dispatch<SetStateAction<PendingMessage[]>>,
) {
  const warming = useRef(new Map<string, Promise<boolean>>());
  useEffect(() => {
    if (!pendingMessages.length) {
      warming.current.clear();
      return;
    }
    if (!messages) return;
    const receivedIds = new Set(messages.map(({ message }) => String(message._id)));
    const states = receivedMessageAttachmentStates(messages);
    const correlatedPendingMessages = correlatePendingMessageIds(pendingMessages, messages);
    const remaining = reconcilePendingMessages(correlatedPendingMessages, receivedIds, states);
    const remainingIds = new Set(remaining.map(({ id }) => id));
    const handoffIds = new Set(correlatedPendingMessages.filter(({ id }) => !remainingIds.has(id)).map(({ messageId }) => messageId));
    const urls = messages.filter(({ message }) => handoffIds.has(String(message._id)))
      .flatMap(({ attachments, message }) => attachments.flatMap((entry, index) => {
        if (!isImageAttachment(entry.attachment.contentType)) return [];
        const localAttachments = correlatedPendingMessages.find(({ messageId }) => messageId === String(message._id))?.attachments;
        const local = localAttachments?.[index];
        // Initial sends preserve attachment order. Preparation may change a
        // HEIC/PNG file's encoding and filename, so match geometry only when
        // the full arrays align and both entries at this position are images.
        if (local && localAttachments?.length === attachments.length &&
            isImageAttachment(local.contentType) && isImageAttachment(entry.attachment.contentType)) {
          rememberChatImageDimensions(String(entry.attachment._id), local);
        }
        const url = ('previewUrl' in entry ? entry.previewUrl : null) ?? entry.url;
        return url ? [url] : [];
      }));
    const reconcile = () => setPendingMessages((current) => reconcilePendingMessages(
      correlatePendingMessageIds(current, messages),
      receivedIds,
      states,
    ));
    if (!urls.length) {
      reconcile();
      return;
    }
    let active = true;
    // A failed or slow cache warm must not leave a sent message marked Sending.
    const timeout = setTimeout(() => { if (active) reconcile(); }, 2000);
    void Promise.allSettled(urls.map((url) => {
      let request = warming.current.get(url);
      if (!request) {
        request = Image.prefetch(url, { cachePolicy: 'memory-disk' });
        warming.current.set(url, request);
      }
      return request;
    })).then(() => {
      clearTimeout(timeout);
      if (active) reconcile();
    });
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [messages, pendingMessages, setPendingMessages]);
}
