import { describe, expect, it } from 'vitest';

import { messageDeliveryAccessibilityLabel, messageReceiptPresentation } from './message-receipt';

describe('messageReceiptPresentation', () => {
  it('shows a single sent check before any recipient has read the message', () => {
    expect(messageReceiptPresentation({ readCount: 0, recipientCount: 4 })).toEqual({
      accessibilityLabel: 'Sent. No read receipt yet.',
      icon: 'check',
      seen: false,
    });
  });

  it('shows a double check and the exact group read count', () => {
    expect(messageReceiptPresentation({ readCount: 2, recipientCount: 4 })).toEqual({
      accessibilityLabel: 'Seen by 2 of 4 people.',
      icon: 'check-all',
      seen: true,
    });
  });

  it('does not show everyone as having read when the conversation has no other recipients', () => {
    expect(messageReceiptPresentation({ readCount: 0, recipientCount: 0 })).toEqual({
      accessibilityLabel: 'Sent. No read receipt yet.',
      icon: 'check',
      seen: false,
    });
  });

  it('clamps inconsistent receipt counts to the recipient count', () => {
    expect(messageReceiptPresentation({ readCount: 8, recipientCount: 1 })).toMatchObject({
      accessibilityLabel: 'Seen by everyone.',
      icon: 'check-all',
      seen: true,
    });
  });
});

describe('messageDeliveryAccessibilityLabel', () => {
  it('includes the read count in the sent image button label', () => {
    expect(messageDeliveryAccessibilityLabel({
      isOwnMessage: true,
      readReceipt: { readCount: 2, recipientCount: 4 },
      timeLabel: '16:31',
    })).toBe('Sent at 16:31. Seen by 2 of 4 people.');
  });
});
