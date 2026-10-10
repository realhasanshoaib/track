import { describe, expect, it } from 'vitest';

import { pendingMessageAcknowledgementKey, reconcilePendingMessages, type PendingMessage } from './pending-messages';

describe('reconcilePendingMessages', () => {
  it('keeps a pending row when an older message has the same body', () => {
    const pending: PendingMessage[] = [{ at: 20, body: 'Looks good', id: 'pending-2' }];

    expect(reconcilePendingMessages(pending, new Set(['message-1']))).toBe(pending);
  });

  it('removes only the pending row whose server message ID has arrived', () => {
    const pending: PendingMessage[] = [
      { at: 20, body: 'Looks good', id: 'pending-2', messageId: 'message-2' },
      { at: 30, body: 'Looks good', id: 'pending-3' },
    ];

    expect(reconcilePendingMessages(pending, new Set(['message-1', 'message-2']))).toEqual([
      { at: 30, body: 'Looks good', id: 'pending-3' },
    ]);
  });

  it('keeps the original array when no acknowledged row needs removal', () => {
    const pending: PendingMessage[] = [
      { at: 20, body: 'New message', id: 'pending-2', messageId: 'message-2' },
    ];

    expect(reconcilePendingMessages(pending, new Set(['message-1']))).toBe(pending);
  });
});

describe('pendingMessageAcknowledgementKey', () => {
  it('stays stable while an acknowledged image upload reports progress', () => {
    const pending: PendingMessage = {
      at: 20,
      attachments: [{ contentType: 'image/jpeg', filename: 'photo.jpg', id: 'file-1', progress: 0.2, uri: 'file://photo.jpg' }],
      body: '',
      id: 'pending-1',
      messageId: 'message-1',
    };
    const progressed: PendingMessage = {
      ...pending,
      attachments: pending.attachments?.map((file) => ({ ...file, progress: 0.8 })),
    };

    expect(pendingMessageAcknowledgementKey([progressed])).toBe(pendingMessageAcknowledgementKey([pending]));
  });

  it('changes when a server message ID is acknowledged', () => {
    const pending: PendingMessage = { at: 20, body: 'Sending', id: 'pending-1' };
    const acknowledged = { ...pending, messageId: 'message-1' };

    expect(pendingMessageAcknowledgementKey([acknowledged])).not.toBe(pendingMessageAcknowledgementKey([pending]));
  });
});
