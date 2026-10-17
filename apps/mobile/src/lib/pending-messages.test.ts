import { describe, expect, it } from 'vitest';

import { correlatePendingMessageIds, pendingMessageAcknowledgementKey, pendingMessageGroupStarts, pendingMessageIdempotencyKey, pendingMessageLayoutKey, reconcilePendingMessages, type PendingMessage } from './pending-messages';

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

describe('pendingMessageIdempotencyKey', () => {
  it('stays stable through upload progress and identifies the optimistic send', () => {
    const pending: PendingMessage = {
      at: 20,
      attachments: [{ contentType: 'image/jpeg', filename: 'photo.jpg', id: 'file-1', progress: 0.2, uri: 'file://photo.jpg' }],
      body: '',
      id: 'pending-1',
      idempotencyKey: 'send-key',
    };
    const progressed = {
      ...pending,
      attachments: pending.attachments?.map((file) => ({ ...file, progress: 0.8 })),
    };

    expect(pendingMessageIdempotencyKey([pending])).toBe('send-key');
    expect(pendingMessageIdempotencyKey([progressed])).toBe('send-key');
  });
});

describe('pendingMessageLayoutKey', () => {
  it('changes for optimistic insertion and server handoff, but ignores upload progress', () => {
    const pending: PendingMessage = {
      at: 20,
      attachments: [{ contentType: 'image/jpeg', filename: 'photo.jpg', id: 'file-1', progress: 0.2, uri: 'file://photo.jpg' }],
      body: '',
      id: 'pending-1',
    };
    const progressed = {
      ...pending,
      attachments: pending.attachments?.map((file) => ({ ...file, progress: 0.8 })),
    };
    const acknowledged = { ...pending, messageId: 'message-1' };

    expect(pendingMessageLayoutKey([])).not.toBe(pendingMessageLayoutKey([pending]));
    expect(pendingMessageLayoutKey([progressed])).toBe(pendingMessageLayoutKey([pending]));
    expect(pendingMessageLayoutKey([acknowledged])).not.toBe(pendingMessageLayoutKey([pending]));
    expect(pendingMessageLayoutKey([])).not.toBe(pendingMessageLayoutKey([acknowledged]));
  });
});

describe('correlatePendingMessageIds', () => {
  it('links a live query row before the send mutation returns its ID', () => {
    const pending: PendingMessage[] = [{
      at: 20,
      body: 'Sent optimistically',
      id: 'pending-send-key',
      idempotencyKey: 'send-key',
    }];
    const messages = [{ message: { _id: 'messages:confirmed', idempotencyKey: 'send-key' } }];

    expect(correlatePendingMessageIds(pending, messages)).toEqual([{
      ...pending[0],
      messageId: 'messages:confirmed',
    }]);
    expect(correlatePendingMessageIds(pending, [{ message: { _id: 'messages:other', idempotencyKey: 'other-key' } }])).toBe(pending);
  });
});

describe('pendingMessageGroupStarts', () => {
  const today = new Date(2026, 9, 17, 19).getTime();

  it('keeps adjacent outgoing optimistic rows in the confirmed message group', () => {
    const starts = pendingMessageGroupStarts(
      [{ at: today + 1_000, id: 'pending-1' }, { at: today + 2_000, id: 'pending-2' }],
      'author-1',
      { at: today, authorId: 'author-1', key: 'previous-message', kind: 'message' },
    );

    expect([...starts]).toEqual([['pending-1', false], ['pending-2', false]]);
  });

  it('starts a fresh row group after another author, an assistant, a long gap, a new day, or a task card', () => {
    const sameTime = today + 1_000;
    const cases = [
      { previous: { at: today, authorId: 'author-2', key: 'other', kind: 'message' as const } },
      { previous: { at: today, authorId: null, key: 'assistant', kind: 'assistant' as const } },
      { previous: { at: today - 6 * 60_000, authorId: 'author-1', key: 'old', kind: 'message' as const } },
      { previous: { at: new Date(2026, 9, 16, 23, 59).getTime(), authorId: 'author-1', key: 'yesterday', kind: 'message' as const } },
    ];

    for (const { previous } of cases) {
      expect(pendingMessageGroupStarts([{ at: sameTime, id: 'pending' }], 'author-1', previous).get('pending')).toBe(true);
    }
    expect(pendingMessageGroupStarts(
      [{ at: sameTime, id: 'pending' }],
      'author-1',
      { at: today, authorId: 'author-1', key: 'task-linked', kind: 'message' },
      new Set(['task-linked']),
    ).get('pending')).toBe(true);
  });
});
