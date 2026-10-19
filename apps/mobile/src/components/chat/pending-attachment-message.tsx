import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { useReducedMotion } from 'react-native-reanimated';
import { ActivityIndicator, StyleSheet, useWindowDimensions, View } from 'react-native';

import { MessageBubbleFrame } from '@/components/chat/message-bubble';
import { MESSAGE_MAX_WIDTH_RATIO } from '@/components/chat/message-layout';
import { MESSAGE_ROW_VERTICAL_PADDING, PENDING_MESSAGE_BOTTOM_PADDING } from '@/lib/message-row-layout';
import { MessageDeliveryMeta } from '@/components/chat/message-delivery-meta';
import { ChatImagePlaceholder, ChatImageTransition } from '@/components/chat/message-motion';
import { MessageText } from '@/components/chat/message-text';
import { PlatformIcon } from '@/components/platform-icon';
import { ThemedText } from '@/components/themed-text';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { attachmentIcon, fileTypeLabel, formatFileSize, isAutoAttachmentBody, isImageAttachment } from '@/lib/attachment-presentation';
import type { PendingMessageAttachment } from '@/lib/pending-messages';
import { chatImageAspectRatio } from '@/lib/chat-image-layout';
import { usePendingMessageProgress } from '@/lib/pending-message-progress';

const GAP = 2;
const MAX_TILES = 4;

export function PendingMessageBubble({ attachments = [], at, body: rawBody, isFirstInGroup = true, offline = false, pendingId, sent = false }: {
  attachments?: PendingMessageAttachment[];
  at: number;
  body: string;
  isFirstInGroup?: boolean;
  offline?: boolean;
  pendingId: string;
  sent?: boolean;
}) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const { width } = useWindowDimensions();
  const progressByAttachment = usePendingMessageProgress(pendingId);
  const visibleAttachments = attachments.map((file) => {
    const progress = progressByAttachment[file.id];
    return progress === undefined ? file : { ...file, progress };
  });
  const body = visibleAttachments.length && isAutoAttachmentBody(rawBody, visibleAttachments.map(({ filename }) => filename)) ? '' : rawBody;
  const images = visibleAttachments.filter((file) => isImageAttachment(file.contentType));
  const files = visibleAttachments.filter((file) => !isImageAttachment(file.contentType));
  const imageProgress = images.some((file) => file.progress !== undefined)
    ? images.reduce((total, file) => total + clampProgress(file.progress), 0) / Math.max(images.length, 1)
    : undefined;
  const maxWidth = Math.min(width * 0.72, 320, width * MESSAGE_MAX_WIDTH_RATIO);
  const fileListWidth = Math.min(maxWidth, Math.max(208, Math.min(width * 0.58, 260)));
  const visibleImages = images.slice(0, MAX_TILES);
  const overflow = images.length - visibleImages.length;
  const hasImages = visibleImages.length > 0;
  const deliveryState = visibleAttachments.length && !sent ? (offline ? 'waiting' : 'sending') : undefined;
  const inlineTextMeta = visibleAttachments.length === 0 && Boolean(body);
  const deliveryMeta = hasImages ? (
    <MessageDeliveryMeta
      deliveryState={deliveryState}
      isOwnMessage
      timeLabel={formatPendingTime(at)}
      tone="media"
    />
  ) : null;
  const tileWidth = (maxWidth - GAP) / 2;
  const rows: PendingMessageAttachment[][] = visibleImages.length === 3
    ? [[visibleImages[0]], visibleImages.slice(1)]
    : Array.from({ length: Math.ceil(visibleImages.length / 2) }, (_, index) => visibleImages.slice(index * 2, index * 2 + 2));

  return (
    <View style={[styles.timelineRow, isFirstInGroup ? styles.groupStart : styles.grouped]}>
      <View testID="pending-message-row" style={styles.row}>
      <MessageBubbleFrame bareMedia={hasImages && !body && !files.length} hasMedia={hasImages} isOwnMessage>
        {visibleAttachments.length === 0 ? (
          inlineTextMeta ? (
            <View style={styles.inlineTextRow}>
              <MessageText body={body} style={styles.inlineText} />
              <MessageDeliveryMeta deliveryState={deliveryState} isOwnMessage timeLabel={formatPendingTime(at)} />
            </View>
          ) : null
        ) : <>
          {visibleImages.length === 1 ? (
            <PendingImage deliveryMeta={deliveryMeta} file={visibleImages[0]} offline={offline} sent={sent} width={maxWidth} />
          ) : visibleImages.length > 1 ? (
            <View style={[styles.grid, { width: maxWidth }]}>
              {rows.map((row) => (
                <View key={row[0].id} style={styles.gridRow}>
                  {row.map((file) => {
                    const tileOverflow = overflow > 0 && file.id === visibleImages.at(-1)?.id ? overflow : 0;
                    const tileSize = row.length === 1 ? maxWidth : tileWidth;
                    return (
                      <View key={file.id} style={[styles.gridTile, { height: tileSize, width: tileSize }]}>
                        <Image
                          accessibilityLabel={sent ? 'Image attachment, sent' : 'Image attachment, sending'}
                          accessible
                          cachePolicy="memory-disk"
                          contentFit="cover"
                          placeholder={ChatImagePlaceholder}
                          placeholderContentFit="cover"
                          transition={reducedMotion ? 0 : ChatImageTransition}
                          recyclingKey={file.id}
                          source={{ uri: file.previewUri ?? file.uri }}
                          style={styles.fill}
                        />
                        {tileOverflow ? <View style={[styles.overflow, { backgroundColor: theme.overlay }]}><ThemedText style={styles.overflowText} type="subtitle">+{tileOverflow}</ThemedText></View> : null}
                      </View>
                    );
                  })}
                </View>
              ))}
              {!sent ? <PendingImageOverlay imageCount={images.length} offline={offline} progress={imageProgress} /> : null}
              {deliveryMeta ? <View pointerEvents="none" style={styles.deliveryMeta}>{deliveryMeta}</View> : null}
            </View>
          ) : null}
          {files.length ? <View style={[styles.fileList, { width: fileListWidth }, hasImages && styles.fileListAfterImage]}>
            {files.map((file) => <PendingFileCard file={file} key={file.id} offline={offline} sent={sent} />)}
          </View> : null}
          {body ? <View style={styles.body}><MessageText body={body} /></View> : null}
        </>}
        {!hasImages && !inlineTextMeta ? (
          <View style={styles.textMeta}>
            <MessageDeliveryMeta deliveryState={deliveryState} isOwnMessage timeLabel={formatPendingTime(at)} />
          </View>
        ) : null}
      </MessageBubbleFrame>
      </View>
    </View>
  );
}

function PendingImage({ deliveryMeta, file, offline, sent, width }: {
  deliveryMeta: ReactNode;
  file: PendingMessageAttachment;
  offline: boolean;
  sent: boolean;
  width: number;
}) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const ratio = chatImageAspectRatio(file);

  return (
    <View style={[styles.singleImage, { aspectRatio: ratio, backgroundColor: theme.skeleton, width }]}>
      <Image
        accessibilityLabel={sent ? 'Image attachment, sent' : 'Image attachment, sending'}
        accessible
        cachePolicy="memory-disk"
        contentFit={file.width && file.height ? 'cover' : 'contain'}
        placeholder={ChatImagePlaceholder}
        placeholderContentFit="cover"
        transition={reducedMotion ? 0 : ChatImageTransition}
        recyclingKey={file.id}
        source={{ uri: file.previewUri ?? file.uri }}
        style={styles.fill}
      />
      {!sent ? <PendingImageOverlay imageCount={1} offline={offline} progress={file.progress} /> : null}
      {deliveryMeta ? <View pointerEvents="none" style={styles.deliveryMeta}>{deliveryMeta}</View> : null}
    </View>
  );
}

function PendingImageOverlay({ imageCount, offline, progress }: { imageCount: number; offline: boolean; progress?: number }) {
  const noun = imageCount === 1 ? 'image' : `${imageCount} images`;
  const percent = progress === undefined ? null : Math.round(clampProgress(progress) * 100);
  const label = offline
    ? 'Waiting for connection'
    : percent === null || percent === 0
      ? `Preparing ${noun}`
      : percent >= 100
        ? `Finishing ${noun}`
        : `Sending ${noun} · ${percent}%`;
  return (
    <View
      accessibilityLabel={label}
      accessibilityLiveRegion="polite"
      accessibilityRole="progressbar"
      accessibilityState={{ busy: true }}
      accessibilityValue={percent === null ? undefined : { max: 100, min: 0, now: percent }}
      accessible
      pointerEvents="none"
      style={styles.imageOverlay}
    >
      <View style={styles.imageStatus}>
        {offline
          ? <PlatformIcon color={Colors.dark.text} name="cloud-off" size={17} />
          : <ActivityIndicator color={Colors.dark.text} size="small" />}
        <ThemedText style={styles.imageStatusText} type="captionBold">{label}</ThemedText>
      </View>
    </View>
  );
}

function PendingFileCard({ file, offline, sent }: { file: PendingMessageAttachment; offline: boolean; sent: boolean }) {
  const theme = useTheme();
  const progress = clampProgress(file.progress);
  const hasProgress = file.progress !== undefined && !offline && !sent;
  const isUploading = hasProgress && progress > 0 && progress < 1;
  const status = sent
    ? 'Sent'
    : offline
      ? 'Waiting for connection'
      : file.progress === undefined || progress === 0
        ? 'Preparing to send'
        : progress >= 1
          ? 'Finishing up'
          : 'Sending';
  const detail = `${fileTypeLabel(file)}${typeof file.size === 'number' ? ` · ${formatFileSize(file.size)}` : ''}`;
  const progressLabel = `${file.filename}, ${detail}, ${status}${isUploading ? `, ${Math.round(progress * 100)} percent` : ''}`;

  return (
    <View
      accessibilityLabel={progressLabel}
      accessibilityLiveRegion="polite"
      accessibilityRole={hasProgress ? 'progressbar' : undefined}
      accessible
      accessibilityValue={hasProgress ? { max: 100, min: 0, now: Math.round(progress * 100) } : undefined}
      style={[styles.fileCard, { backgroundColor: theme.backgroundElement, borderColor: theme.hairline }]}
    >
      <View style={[styles.fileIcon, { backgroundColor: theme.homeSurface }]}>
        <PlatformIcon color={theme.textSecondary} name={attachmentIcon(file)} size={18} />
      </View>
      <View style={styles.fileContent}>
        <ThemedText ellipsizeMode="middle" numberOfLines={2} style={styles.fileName} type="smallBold">{file.filename}</ThemedText>
        <ThemedText numberOfLines={1} themeColor="textSecondary" type="caption">{detail}</ThemedText>
        <View style={styles.fileStatus}>
          {sent
            ? <PlatformIcon color={theme.accentStrong} name="check" size={13} />
            : offline
              ? <PlatformIcon color={theme.textSecondary} name="cloud-off" size={13} />
            : !isUploading
              ? <ActivityIndicator color={theme.textSecondary} size="small" />
              : null}
          <ThemedText style={styles.fileStatusText} themeColor="textSecondary" type="caption">
            {isUploading ? `${status} · ${Math.round(progress * 100)}%` : status}
          </ThemedText>
        </View>
        {hasProgress ? (
          <View
            style={[styles.progressTrack, { backgroundColor: theme.backgroundSelected }]}
          >
            <View style={[styles.progressFill, { backgroundColor: theme.accentStrong, width: `${progress * 100}%` }]} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

function clampProgress(progress: number | undefined) {
  if (typeof progress !== 'number' || !Number.isFinite(progress)) return 0;
  return Math.min(Math.max(progress, 0), 1);
}

function formatPendingTime(at: number) {
  return new Date(at).toLocaleTimeString([], { hour: '2-digit', hourCycle: 'h23', minute: '2-digit' });
}

const styles = StyleSheet.create({
  body: { marginTop: Spacing.one, paddingHorizontal: Spacing.two },
  deliveryMeta: { bottom: 7, position: 'absolute', right: 8 },
  fileCard: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.medium, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: Spacing.two, paddingHorizontal: Spacing.two, paddingVertical: Spacing.two },
  fileContent: { flex: 1, gap: Spacing.half, minWidth: 0 },
  fileIcon: { alignItems: 'center', borderRadius: Radius.small, height: 36, justifyContent: 'center', width: 36 },
  fileList: { gap: Spacing.two, paddingHorizontal: Spacing.one },
  fileListAfterImage: { paddingTop: Spacing.two },
  fileName: { flexShrink: 1, minWidth: 0 },
  fileStatus: { alignItems: 'center', flexDirection: 'row', gap: Spacing.one, minHeight: 14 },
  fileStatusText: { flexShrink: 1 },
  fill: { height: '100%', width: '100%' },
  grid: { borderCurve: 'continuous', borderRadius: Radius.medium, overflow: 'hidden', position: 'relative', gap: GAP },
  gridRow: { flexDirection: 'row', gap: GAP },
  gridTile: { borderCurve: 'continuous', borderRadius: Radius.medium, overflow: 'hidden' },
  imageOverlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  imageStatus: { alignItems: 'center', backgroundColor: Colors.dark.overlay, borderRadius: Radius.pill, flexDirection: 'row', gap: Spacing.two, justifyContent: 'center', paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  imageStatusText: { color: Colors.dark.text, textShadowColor: 'rgba(0,0,0,0.55)', textShadowOffset: { height: 1, width: 0 }, textShadowRadius: 2 },
  overflow: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  overflowText: { color: '#fff' },
  progressFill: { borderRadius: Radius.pill, height: '100%' },
  progressTrack: { borderRadius: Radius.pill, height: 3, overflow: 'hidden' },
  // Use the same outer group and row gutters as ThreadRow/MessageBubble so
  // reconciliation does not change scroll extent when the server row arrives.
  row: { alignItems: 'flex-end', paddingHorizontal: Spacing.three, paddingVertical: MESSAGE_ROW_VERTICAL_PADDING, width: '100%' },
  timelineRow: { paddingBottom: PENDING_MESSAGE_BOTTOM_PADDING, width: '100%' },
  groupStart: { paddingTop: Spacing.two },
  grouped: { paddingTop: 2 },
  singleImage: { borderCurve: 'continuous', borderRadius: Radius.large, overflow: 'hidden' },
  textMeta: { alignItems: 'center', alignSelf: 'flex-end', flexDirection: 'row', marginTop: Spacing.half },
  inlineText: { flexShrink: 1, minWidth: 0 },
  inlineTextRow: { alignItems: 'flex-end', flexDirection: 'row', gap: Spacing.one, maxWidth: '100%', minWidth: 0 },
});
