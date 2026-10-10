import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, useWindowDimensions, View } from 'react-native';

import { MessageBubbleFrame } from '@/components/chat/message-bubble';
import { MessageText } from '@/components/chat/message-text';
import { PlatformIcon } from '@/components/platform-icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { attachmentIcon, isImageAttachment } from '@/lib/attachment-presentation';
import type { PendingMessageAttachment } from '@/lib/pending-messages';

const GAP = 2;
const MAX_TILES = 4;
const MIN_RATIO = 0.56;
const MAX_RATIO = 1.9;

export function PendingMessageBubble({ attachments = [], body }: {
  attachments?: PendingMessageAttachment[];
  body: string;
}) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const images = attachments.filter((file) => isImageAttachment(file.contentType));
  const files = attachments.filter((file) => !isImageAttachment(file.contentType));
  const maxWidth = Math.min(width * 0.72, 320);
  const visibleImages = images.slice(0, MAX_TILES);
  const overflow = images.length - visibleImages.length;
  const tileWidth = (maxWidth - GAP) / 2;
  const rows: PendingMessageAttachment[][] = visibleImages.length === 3
    ? [[visibleImages[0]], visibleImages.slice(1)]
    : Array.from({ length: Math.ceil(visibleImages.length / 2) }, (_, index) => visibleImages.slice(index * 2, index * 2 + 2));

  return (
    <View style={styles.row}>
      <MessageBubbleFrame hasMedia={visibleImages.length > 0} isOwnMessage>
        {attachments.length === 0 ? (
          <View style={styles.pendingCopy}>
            {body ? <ThemedText style={styles.pendingText} type="small">{body}</ThemedText> : null}
          </View>
        ) : <>
        {body ? <View style={styles.body}><MessageText body={body} /></View> : null}
        {visibleImages.length === 1 ? (
          <PendingImage file={visibleImages[0]} width={maxWidth} />
        ) : visibleImages.length > 1 ? (
          <View style={[styles.grid, { width: maxWidth }]}>{rows.map((row) => (
            <View key={row[0].id} style={styles.gridRow}>
              {row.map((file) => {
                const tileOverflow = overflow > 0 && file.id === visibleImages.at(-1)?.id ? overflow : 0;
                const tileSize = row.length === 1 ? maxWidth : tileWidth;
                return (
                  <View key={file.id} style={[styles.gridTile, { height: tileSize, width: tileSize }]}>
                    <Image
                      accessibilityLabel="Image attachment, sending"
                      accessible
                      cachePolicy="memory-disk"
                      contentFit="cover"
                      recyclingKey={file.id}
                      source={{ uri: file.uri }}
                      style={styles.fill}
                    />
                    {tileOverflow ? <View style={[styles.overflow, { backgroundColor: theme.overlay }]}><ThemedText style={styles.overflowText} type="subtitle">+{tileOverflow}</ThemedText></View> : null}
                  </View>
                );
              })}
            </View>
          ))}</View>
        ) : null}
        {files.length ? <View style={styles.fileList}>
          {files.map((file) => (
            <View accessibilityLabel="File attachment, sending" accessible key={file.id} style={[styles.file, { backgroundColor: theme.backgroundElement }]}>
              <PlatformIcon color={theme.textSecondary} name={attachmentIcon(file)} size={17} />
              <ThemedText style={styles.fileName} themeColor="textSecondary" type="caption">File attachment</ThemedText>
            </View>
          ))}
        </View> : null}
        </>}
        <View accessibilityLiveRegion="polite" style={styles.status}>
          <ActivityIndicator color={theme.textSecondary} size="small" />
          <ThemedText themeColor="textSecondary" type="caption">Sending</ThemedText>
        </View>
      </MessageBubbleFrame>
    </View>
  );
}

function PendingImage({ file, width }: { file: PendingMessageAttachment; width: number }) {
  const theme = useTheme();
  const [ratio, setRatio] = useState(() => file.width && file.height
    ? Math.min(Math.max(file.width / file.height, MIN_RATIO), MAX_RATIO)
    : 4 / 3);

  return (
    <Image
      accessibilityLabel="Image attachment, sending"
      accessible
      cachePolicy="memory-disk"
      contentFit="cover"
      onLoad={({ source }) => {
        if ((file.width && file.height) || !source.width || !source.height) return;
        setRatio(Math.min(Math.max(source.width / source.height, MIN_RATIO), MAX_RATIO));
      }}
      recyclingKey={file.id}
      source={{ uri: file.uri }}
      style={[styles.singleImage, { aspectRatio: ratio, backgroundColor: theme.skeleton, width }]}
    />
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: Spacing.three, paddingTop: Spacing.three },
  file: { alignItems: 'center', borderRadius: Radius.medium, flexDirection: 'row', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  fileList: { gap: Spacing.one, paddingHorizontal: Spacing.one, paddingTop: Spacing.two },
  fileName: { flex: 1, minWidth: 0 },
  fill: { height: '100%', width: '100%' },
  grid: { gap: GAP, marginTop: Spacing.one },
  gridRow: { flexDirection: 'row', gap: GAP },
  gridTile: { borderCurve: 'continuous', borderRadius: Radius.medium, overflow: 'hidden' },
  overflow: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  overflowText: { color: '#fff' },
  pendingCopy: { alignItems: 'flex-start', gap: Spacing.half, minWidth: 0 },
  pendingText: { flexShrink: 1 },
  row: { alignItems: 'flex-end', paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
  singleImage: { borderCurve: 'continuous', borderRadius: Radius.medium, marginTop: Spacing.one },
  status: { alignItems: 'center', alignSelf: 'flex-end', flexDirection: 'row', gap: Spacing.one, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
});
