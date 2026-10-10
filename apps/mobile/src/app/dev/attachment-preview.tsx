import { Stack, Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Image as NativeImage, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { PendingMessageBubble } from '@/components/chat/pending-attachment-message';
import { ImageAttachments } from '@/components/chat/image-attachment';
import { MessageBubbleFrame } from '@/components/chat/message-bubble';
import { MessageText } from '@/components/chat/message-text';
import { MessageDeliveryMeta } from '@/components/chat/message-delivery-meta';
import { PlatformIcon } from '@/components/platform-icon';
import type { ViewableImage } from '@/components/chat/types';
import { PendingAttachmentStrip, type PendingAttachment } from '@/components/chat-attach-menu';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const STATES = ['demo', 'worst', 'empty', 'one', 'ten'] as const;
type PreviewState = typeof STATES[number];

const STATE_LABELS: Record<PreviewState, string> = {
  demo: 'Demo',
  empty: 'Empty',
  one: 'One',
  ten: 'Limit 10',
  worst: 'Worst case',
};

const previewUri = NativeImage.resolveAssetSource?.(require('../../../assets/images/project-card-art.webp'))?.uri ?? '';

function selectedState(value?: string): PreviewState {
  return STATES.find((state) => state === value) ?? 'demo';
}

export default function AttachmentPreviewScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { data } = useLocalSearchParams<{ data?: string }>();
  const state = selectedState(data);
  const attachments = useMemo(() => fixtureAttachments(state, previewUri), [state]);
  const body = state === 'worst'
    ? 'Aleksandra Wiśniewska-Kowalczyk shared the revised Q3 handoff plan and asked the Patient Portal team to review the next release steps before Friday.'
    : '';

  if (!__DEV__) return <Redirect href="/" />;

  return (
    <ThemedView style={styles.screen}>
      <Stack.Screen options={{ title: 'Attachment preview' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText accessibilityRole="header" style={styles.title} type="titleLarge">Attachment preview</ThemedText>
        <ThemedText themeColor="textSecondary" type="small">Development-only states for the message image flow.</ThemedText>
        <ThemedText style={styles.sectionLabel} type="captionBold">Composer preview</ThemedText>
        <PendingAttachmentStrip disabled items={attachments} onRemove={() => undefined} />
        <ThemedText style={styles.sectionLabel} type="captionBold">Sending in conversation</ThemedText>
        {attachments.length ? <PendingMessageBubble attachments={attachments} body={body} /> : (
          <View style={[styles.empty, { borderColor: theme.homeBorder }]}>
            <ThemedText themeColor="textSecondary" type="small">No image selected.</ThemedText>
          </View>
        )}
        <ThemedText style={styles.sectionLabel} type="captionBold">Sent time and read receipts</ThemedText>
        <View style={[styles.messagePreview, { backgroundColor: theme.bubbleOwn }]}>
          <ThemedText numberOfLines={state === 'worst' ? 3 : 2} type="message">
            {state === 'worst'
              ? 'Aleksandra Wiśniewska-Kowalczyk shared the revised Patient Portal release plan for review.'
              : 'The latest handoff is ready to review.'}
          </ThemedText>
          <MessageDeliveryMeta
            isOwnMessage
            readReceipt={deliveryReceipt(state)}
            timeLabel={state === 'worst' ? '23:59' : '16:31'}
          />
        </View>
        <View style={[styles.messagePreview, styles.deletedPreview, { backgroundColor: theme.backgroundElement, borderColor: theme.homeBorder }]}>
          <ThemedText themeColor="textSecondary" type="small">You deleted this message</ThemedText>
          <MessageDeliveryMeta isDeleted isOwnMessage timeLabel="16:32" />
        </View>
        <ThemedText style={styles.sectionLabel} type="captionBold">Message bubble wrapping</ThemedText>
        <View style={styles.messageBubbleRow}>
          <MessageBubbleFrame isOwnMessage>
            <MessageText body={state === 'worst'
              ? 'Aleksandra Wisniewska-Kowalczyk shared the revised Patient Portal release plan with 1,283 readers. Please review the next release steps and confirm who owns the handoff before Friday.'
              : 'The latest handoff is ready to review.'} />
            <View style={styles.messageDelivery}>
              <MessageDeliveryMeta isOwnMessage readReceipt={deliveryReceipt(state)} timeLabel={state === 'worst' ? '23:59' : '16:31'} />
            </View>
          </MessageBubbleFrame>
        </View>
        {state === 'worst' ? <>
          <ThemedText style={styles.sectionLabel} type="captionBold">Sent image receipt and forward action</ThemedText>
          <View style={styles.imageActionPreview}>
            <Pressable accessibilityLabel="Forward image message" accessibilityRole="button" onPress={() => undefined} style={[styles.forwardPreview, { backgroundColor: theme.backgroundElevated, borderColor: theme.homeBorder }]}>
              <PlatformIcon color={theme.textSecondary} name="forward" size={17} />
            </Pressable>
            <ImageAttachments
              deliveryMeta={<MessageDeliveryMeta isOwnMessage readReceipt={deliveryReceipt(state)} timeLabel="16:31" tone="media" />}
              images={[extremeImages(previewUri)[0]]}
            />
          </View>
          <ThemedText style={styles.sectionLabel} type="captionBold">Delivered image proportions</ThemedText>
          {extremeImages(previewUri).map((image) => <ImageAttachments images={[image]} key={image.id} />)}
        </> : null}
      </ScrollView>
      <View accessibilityLabel="Attachment data states" accessibilityRole="tablist" style={[styles.toggle, { backgroundColor: theme.backgroundSelected, borderColor: theme.homeBorder }]}>
        {STATES.map((value) => {
          const active = state === value;
          return <Pressable
            aria-selected={active}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            key={value}
            onPress={() => router.setParams({ data: value })}
            style={[styles.toggleButton, active && { backgroundColor: theme.homeSurface }]}
          >
            <ThemedText numberOfLines={1} style={{ color: active ? theme.text : theme.textSecondary }} type="captionBold">{STATE_LABELS[value]}</ThemedText>
          </Pressable>;
        })}
      </View>
    </ThemedView>
  );
}

function fixtureAttachments(state: PreviewState, uri: string): PendingAttachment[] {
  if (state === 'empty') return [];
  const count = state === 'ten' ? 10 : state === 'worst' ? 6 : state === 'demo' ? 2 : 1;
  return Array.from({ length: count }, (_, index) => {
    const wide = state === 'worst' && index === 0;
    const tall = state === 'worst' && index === 1;
    return {
      contentType: 'image/jpeg',
      filename: state === 'worst'
        ? `Q3 Board Deck — Patient Portal handoff image ${index + 1} revised for legal review.jpg`
        : `Photo ${index + 1}.jpg`,
      height: wide ? 200 : tall ? 4000 : 1200,
      id: `${state}-image-${index}`,
      progress: 0.45,
      size: state === 'worst' ? 99 * 1024 * 1024 : 1_240_000,
      uri,
      width: wide ? 4000 : tall ? 200 : 1600,
    };
  });
}

function extremeImages(uri: string): ViewableImage[] {
  return [
    { contentType: 'image/jpeg', filename: 'Q3-wide-image.jpg', height: 200, id: 'wide', originalUrl: null, previewHeight: null, previewUrl: null, previewWidth: null, size: 1200000, url: uri, width: 4000 },
    { contentType: 'image/jpeg', filename: 'Portrait-photo.jpg', height: 4000, id: 'tall', originalUrl: null, previewHeight: null, previewUrl: null, previewWidth: null, size: 1400000, url: uri, width: 200 },
  ];
}

function deliveryReceipt(state: PreviewState) {
  if (state === 'empty') return { readCount: 0, recipientCount: 0 };
  if (state === 'one') return { readCount: 0, recipientCount: 1 };
  if (state === 'ten') return { readCount: 10, recipientCount: 10 };
  if (state === 'worst') return { readCount: 1283, recipientCount: 1284 };
  return { readCount: 2, recipientCount: 6 };
}

const styles = StyleSheet.create({
  content: { gap: Spacing.two, padding: Spacing.four, paddingBottom: 96 },
  empty: { alignItems: 'center', borderRadius: Radius.large, borderWidth: StyleSheet.hairlineWidth, justifyContent: 'center', minHeight: 140 },
  deletedPreview: { borderWidth: StyleSheet.hairlineWidth },
  forwardPreview: { alignItems: 'center', borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth, height: 36, justifyContent: 'center', width: 36 },
  imageActionPreview: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two },
  messagePreview: { alignSelf: 'flex-end', borderRadius: Radius.large, gap: Spacing.one, maxWidth: '84%', paddingHorizontal: Spacing.two, paddingVertical: Spacing.two },
  messageBubbleRow: { alignItems: 'flex-end', width: '100%' },
  messageDelivery: { alignSelf: 'flex-end', marginTop: Spacing.half },
  sectionLabel: { marginTop: Spacing.four },
  screen: { flex: 1 },
  title: { ...Typography.titleLarge },
  toggle: { alignSelf: 'center', borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth, bottom: Spacing.four, flexDirection: 'row', gap: Spacing.half, maxWidth: '96%', padding: Spacing.one, position: 'absolute' },
  toggleButton: { alignItems: 'center', borderRadius: Radius.pill, justifyContent: 'center', minHeight: 36, paddingHorizontal: Spacing.two },
});
