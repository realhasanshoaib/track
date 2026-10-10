import type { IconName } from '@/components/platform-icon';

export type MessageReadReceipt = { readCount: number; recipientCount: number };

export function messageReceiptPresentation(receipt?: MessageReadReceipt): {
  accessibilityLabel: string;
  icon: Extract<IconName, 'check' | 'check-all'>;
  seen: boolean;
} {
  const recipientCount = Math.max(0, receipt?.recipientCount ?? 0);
  const readCount = Math.min(recipientCount, Math.max(0, receipt?.readCount ?? 0));
  const seen = readCount > 0;

  return {
    accessibilityLabel: !seen
      ? 'Sent. No read receipt yet.'
      : readCount === recipientCount
        ? 'Seen by everyone.'
        : `Seen by ${readCount} of ${recipientCount} ${recipientCount === 1 ? 'person' : 'people'}.`,
    icon: seen ? 'check-all' : 'check',
    seen,
  };
}
