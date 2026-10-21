import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { PlatformIcon } from '@/components/platform-icon';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { messageDeliveryAccessibilityLabel, messageReceiptPresentation } from '@/lib/message-receipt';

export function MessageDeliveryMeta({
  isOwnMessage,
  isDeleted = false,
  readReceipt,
  deliveryState,
  timeLabel,
  tone = 'default',
  style,
}: {
  isOwnMessage: boolean;
  isDeleted?: boolean;
  readReceipt?: { readCount: number; recipientCount: number };
  deliveryState?: 'sending' | 'waiting';
  timeLabel: string;
  tone?: 'default' | 'media' | 'voice';
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const receipt = messageReceiptPresentation(readReceipt);
  const mediaTone = tone !== 'default';
  const imageTone = tone === 'media';
  // Media receipts sit directly over the photo. Keep the glyphs and time
  // legible without a translucent backing strip or shadow halo.
  const color = imageTone ? '#000000' : tone === 'voice' ? theme.textSecondary : theme.textTertiary;
  const receiptColor = receipt.seen ? theme.accentStrong : color;
  const accessibilityLabel = messageDeliveryAccessibilityLabel({
    deliveryState,
    isDeleted,
    isOwnMessage,
    readReceipt,
    timeLabel,
  });

  return (
    <View
      testID="message-delivery"
      accessibilityLabel={accessibilityLabel}
      accessible
      style={[styles.meta, imageTone && styles.metaOnMedia, style]}
    >
      <ThemedText style={[styles.time, mediaTone && { color }]} themeColor={mediaTone ? undefined : 'textTertiary'} type="caption">{timeLabel}</ThemedText>
      {isOwnMessage && deliveryState ? <View style={styles.receipt}>
        <PlatformIcon color={color} name={deliveryState === 'waiting' ? 'cloud-off' : 'clock-outline'} size={10} />
      </View> : isOwnMessage && !isDeleted ? <View style={styles.receipt}>
        <PlatformIcon color={receiptColor} name={receipt.icon} size={10} />
      </View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  meta: { alignItems: 'center', alignSelf: 'flex-end', flexDirection: 'row', justifyContent: 'flex-end', gap: 0 },
  metaOnMedia: { flexShrink: 0 },
  receipt: { marginLeft: Spacing.half },
  time: { alignSelf: 'center', fontSize: 10, fontVariant: ['tabular-nums'], lineHeight: 12 },
});
