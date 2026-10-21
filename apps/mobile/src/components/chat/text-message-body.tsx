import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { MessageDeliveryMeta } from '@/components/chat/message-delivery-meta';
import { MessageText } from '@/components/chat/message-text';
import { Spacing } from '@/constants/theme';
import { shouldPlaceTextMetaInline } from '@/lib/text-message-layout';

/** One geometry for optimistic and acknowledged text bubbles. */
export function TextMessageBody({
  body,
  deliveryState,
  isOwnMessage,
  readReceipt,
  timeLabel,
}: {
  body: string;
  deliveryState?: 'sending' | 'waiting';
  isOwnMessage: boolean;
  readReceipt?: { readCount: number; recipientCount: number };
  timeLabel: string;
}) {
  const { fontScale, width } = useWindowDimensions();
  const inline = shouldPlaceTextMetaInline(body, width, fontScale);

  return (
    <View style={[styles.body, isOwnMessage ? styles.own : styles.other]}>
      <View style={inline ? styles.inline : styles.stacked}>
        <MessageText body={body} style={inline ? styles.inlineText : undefined} />
        <MessageDeliveryMeta
          deliveryState={deliveryState}
          isOwnMessage={isOwnMessage}
          readReceipt={readReceipt}
          timeLabel={timeLabel}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { maxWidth: '100%', minWidth: 0 },
  own: { alignSelf: 'flex-end' },
  other: { alignSelf: 'flex-start' },
  inline: { alignItems: 'flex-end', flexDirection: 'row', gap: Spacing.one, maxWidth: '100%', minWidth: 0 },
  inlineText: { flexShrink: 1, minWidth: 0 },
  stacked: { alignItems: 'flex-end', maxWidth: '100%', minWidth: 0 },
});
