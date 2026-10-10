import { StyleSheet, View } from 'react-native';

import { PlatformIcon } from '@/components/platform-icon';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { messageReceiptPresentation } from '@/lib/message-receipt';

export function MessageDeliveryMeta({
  isOwnMessage,
  isDeleted = false,
  readReceipt,
  timeLabel,
  tone = 'default',
}: {
  isOwnMessage: boolean;
  isDeleted?: boolean;
  readReceipt?: { readCount: number; recipientCount: number };
  timeLabel: string;
  tone?: 'default' | 'media' | 'voice';
}) {
  const theme = useTheme();
  const receipt = messageReceiptPresentation(readReceipt);
  const mediaTone = tone !== 'default';
  const imageTone = tone === 'media';
  const color = imageTone ? Colors.dark.text : tone === 'voice' ? theme.textSecondary : theme.textTertiary;
  const receiptColor = !receipt.seen
    ? color
    : imageTone ? '#b5e9ff' : theme.accentStrong;

  return (
    <View
      accessibilityLabel={`Sent at ${timeLabel}${isOwnMessage && !isDeleted ? `. ${receipt.accessibilityLabel}` : ''}`}
      accessible
      style={[styles.meta, imageTone && styles.metaOnMedia]}
    >
      <ThemedText style={[styles.time, imageTone && styles.timeOnMedia, mediaTone && { color }]} themeColor={mediaTone ? undefined : 'textTertiary'} type="caption">{timeLabel}</ThemedText>
      {isOwnMessage && !isDeleted ? <View style={styles.receipt}>
        <PlatformIcon color={receiptColor} name={receipt.icon} size={9} />
      </View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  meta: { alignItems: 'center', flexDirection: 'row', gap: 0 },
  metaOnMedia: { flexShrink: 0 },
  receipt: { marginLeft: -1 },
  time: { alignSelf: 'center', fontSize: 9, fontVariant: ['tabular-nums'], lineHeight: 11 },
  timeOnMedia: { textShadowColor: 'rgba(0,0,0,0.68)', textShadowOffset: { height: 1, width: 0 }, textShadowRadius: 2 },
});
