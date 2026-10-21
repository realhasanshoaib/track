import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { Image } from 'expo-image';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { AttachmentReference } from '@/components/chat/types';
import { PlatformIcon } from '@/components/platform-icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { chatMessageMediaWidth } from '@/lib/message-selection-layout';
import { formatDuration } from '@/lib/attachment-presentation';
import { hapticLight } from '@/lib/haptics';
import { chatVideoAspectRatio, chatVideoFrameSize, DefaultChatVideoAspectRatio, videoGeometryKey } from '@/lib/video-layout';
import { rememberVideoFrameRatio, rememberedVideoFrameRatio } from '@/lib/video-geometry-cache';
import { cachedVideoThumbnail, videoThumbnail, type VideoFrameSource } from '@/lib/video-thumbnail';
import { ChatImagePlaceholder } from '@/components/chat/message-motion';

type VideoPlaybackProps = {
  aspectRatio: number;
  attachment: AttachmentReference['attachment'];
  onClose: () => void;
  onForward?: () => void;
  thumbnail?: VideoFrameSource;
  url: string;
};

let playbackModulePromise: Promise<ComponentType<VideoPlaybackProps>> | undefined;
function loadPlaybackModule() {
  playbackModulePromise ??= import('./video-playback')
    .then((module) => module.VideoPlayback)
    .catch((error: unknown) => {
      playbackModulePromise = undefined;
      throw error;
    });
  return playbackModulePromise;
}

/** A video is inert while browsing; create a native player only after Play. */
export function VideoAttachment({
  attachment,
  captionAttached = false,
  deliveryAccessibilityLabel,
  deliveryMeta,
  onLongPress,
  onForward,
  previewUrl,
  selectionMode = false,
  url,
}: AttachmentReference & {
  captionAttached?: boolean;
  deliveryAccessibilityLabel?: string;
  deliveryMeta?: ReactNode;
  onLongPress?: () => void;
  onForward?: () => void;
  previewUrl?: string | null;
  selectionMode?: boolean;
}) {
  const [VideoPlayback, setVideoPlayback] = useState<ComponentType<VideoPlaybackProps> | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const viewerOpenRef = useRef(false);
  const [viewerThumbnail, setViewerThumbnail] = useState<VideoFrameSource | undefined>(() => cachedVideoThumbnail(videoGeometryKey(attachment)));
  const insets = useSafeAreaInsets();
  const { height: screenHeight, width: screenWidth } = useWindowDimensions();
  const geometryKey = videoGeometryKey(attachment);
  const posterSource = useMemo<VideoFrameSource | undefined>(() => previewUrl ? {
    uri: previewUrl,
    // Signed preview URLs rotate. Cache by the immutable stored poster so a
    // reopened chat can display the already-downloaded JPEG immediately.
    cacheKey: `track-video-poster:${attachment.previewStorageId ?? attachment.storageId}`,
    width: attachment.previewWidth ?? attachment.width ?? 512,
    height: attachment.previewHeight ?? attachment.height ?? 288,
  } : undefined, [attachment.height, attachment.previewHeight, attachment.previewStorageId, attachment.previewWidth, attachment.storageId, attachment.width, previewUrl]);
  const aspectRatio = rememberedVideoFrameRatio(geometryKey) ?? chatVideoAspectRatio({
    height: attachment.height,
    width: attachment.width,
  });
  const thumbnail = cachedVideoThumbnail(geometryKey) ?? posterSource ?? viewerThumbnail;
  const playerWidth = Math.max(1, Math.min(screenWidth - Spacing.six, (screenHeight - insets.top - insets.bottom - 120) * aspectRatio, 900));

  useEffect(() => {
    // Warm the JS module once for the chat, without mounting a decoder for
    // every row. A missing native module still cannot take down the screen.
    if (url) void loadPlaybackModule().catch(() => undefined);
  }, [url]);

  function closeVideo() {
    viewerOpenRef.current = false;
    setViewerOpen(false);
    setVideoPlayback(null);
  }

  function openVideo() {
    if (selectionMode) return;
    if (!url) {
      Alert.alert('Video unavailable', 'This video is not available to play right now. Try again after the message finishes loading.');
      return;
    }
    hapticLight();
    viewerOpenRef.current = true;
    setViewerOpen(true);
  }

  function attachPlayer() {
    void loadPlaybackModule().then((playbackComponent) => {
      if (viewerOpenRef.current) setVideoPlayback(() => playbackComponent);
    }).catch(() => {
      if (!viewerOpenRef.current) return;
      closeVideo();
      Alert.alert(
        'Video playback unavailable',
        'This app build does not include native video playback. Rebuild the development app with expo-video to play videos.',
      );
    });
  }

  return (
    <>
      <VideoAttachmentPreview
        available={Boolean(url)}
        captionAttached={captionAttached}
        deliveryAccessibilityLabel={deliveryAccessibilityLabel}
        deliveryMeta={deliveryMeta}
        durationMs={attachment.durationMs}
        height={attachment.height}
        filename={attachment.filename}
        geometryKey={geometryKey}
        thumbnail={thumbnail}
        thumbnailUri={url ?? undefined}
        onLongPress={onLongPress}
        onPress={!selectionMode ? openVideo : undefined}
        onThumbnailReady={setViewerThumbnail}
        selectionMode={selectionMode}
        width={attachment.width}
      />
      {viewerOpen ? <Modal animationType="fade" onRequestClose={closeVideo} onShow={attachPlayer} statusBarTranslucent transparent visible>
        {viewerOpen && VideoPlayback && url ? (
          <VideoPlayback
            aspectRatio={aspectRatio}
            attachment={attachment}
            onForward={onForward}
            onClose={closeVideo}
            thumbnail={thumbnail}
            url={url}
          />
        ) : (
          <View style={styles.viewerBackdrop}>
            <View style={[styles.viewerHeader, { paddingTop: insets.top + Spacing.two }]}>
              <Pressable accessibilityLabel="Close video playback" accessibilityRole="button" onPress={closeVideo} style={styles.viewerClose}>
                <PlatformIcon color="white" name="close" size={21} />
              </Pressable>
            </View>
            <View style={[styles.viewerFrame, { aspectRatio, width: playerWidth }]}>
              {thumbnail ? <Image contentFit="contain" source={thumbnail} style={StyleSheet.absoluteFill} /> : null}
              <ActivityIndicator color="white" size="large" style={styles.viewerLoading} />
            </View>
          </View>
        )}
      </Modal> : null}
    </>
  );
}

/** The pending and confirmed rows share this exact frame, so send acknowledgement cannot resize media. */
export function VideoAttachmentPreview({
  available = false,
  captionAttached = false,
  deliveryAccessibilityLabel,
  deliveryMeta,
  durationMs,
  geometryKey,
  filename,
  height,
  onLongPress,
  onPress,
  onThumbnailReady,
  pendingStatus,
  progress,
  selectionMode = false,
  showFilename = false,
  showPlayButton = true,
  thumbnail: initialThumbnail,
  thumbnailUri,
  width,
}: {
  available?: boolean;
  captionAttached?: boolean;
  deliveryAccessibilityLabel?: string;
  deliveryMeta?: ReactNode;
  durationMs?: number;
  geometryKey?: string;
  filename: string;
  height?: number | null;
  onLongPress?: () => void;
  onPress?: () => void;
  onThumbnailReady?: (thumbnail: VideoFrameSource) => void;
  pendingStatus?: string;
  progress?: number;
  selectionMode?: boolean;
  showFilename?: boolean;
  showPlayButton?: boolean;
  thumbnail?: VideoFrameSource;
  thumbnailUri?: string;
  width?: number | null;
}) {
  const theme = useTheme();
  const [thumbnail, setThumbnail] = useState<VideoFrameSource | undefined>(() => initialThumbnail ?? cachedVideoThumbnail(geometryKey));
  const visibleThumbnail = initialThumbnail ?? thumbnail;
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const previewWidth = chatMessageMediaWidth(windowWidth);
  // Older messages may lack dimensions because their upload endpoint did not
  // accept them. Use the decoded frame once available, then retain its ratio
  // for this video across pending and confirmed rows and later list mounts.
  const hasMetadataSize = typeof width === 'number' && width > 0 && typeof height === 'number' && height > 0;
  const measuredRatio = hasMetadataSize
    ? chatVideoAspectRatio({ height, width })
    : visibleThumbnail ? chatVideoAspectRatio(visibleThumbnail) : undefined;
  const aspectRatio = measuredRatio
    ?? (geometryKey ? rememberedVideoFrameRatio(geometryKey) : undefined)
    ?? DefaultChatVideoAspectRatio;
  const frameSize = chatVideoFrameSize(previewWidth, windowHeight, aspectRatio);
  const duration = typeof durationMs === 'number' && durationMs > 0 ? formatDuration(durationMs) : null;
  const status = pendingStatus ?? (!available ? 'Unavailable' : undefined);

  useEffect(() => {
    if (!geometryKey) return;
    if (measuredRatio !== undefined) rememberVideoFrameRatio(geometryKey, measuredRatio);
  }, [geometryKey, measuredRatio]);

  useEffect(() => {
    if (initialThumbnail) {
      setThumbnail(initialThumbnail);
      return;
    }
    const ready = cachedVideoThumbnail(geometryKey);
    if (ready) {
      setThumbnail(ready);
      return;
    }
    if (!thumbnailUri) return;
    let active = true;
    void videoThumbnail(thumbnailUri, geometryKey).then((frame) => {
      if (active && frame) setThumbnail(frame);
    });
    return () => { active = false; };
  }, [geometryKey, initialThumbnail, thumbnailUri]);
  useEffect(() => {
    if (visibleThumbnail) onThumbnailReady?.(visibleThumbnail);
  }, [onThumbnailReady, visibleThumbnail]);
  const accessibleName = [
    'Video',
    filename,
    duration,
    deliveryAccessibilityLabel,
    status,
    available && !pendingStatus ? 'Use the play button to watch' : undefined,
  ].filter(Boolean).join(', ');

  return (
    <Pressable
      accessibilityHint={onLongPress ? 'Hold for message actions' : undefined}
      accessibilityLabel={accessibleName}
      accessibilityRole={pendingStatus ? 'progressbar' : 'image'}
      accessibilityState={{ busy: Boolean(pendingStatus), disabled: selectionMode }}
      accessibilityValue={pendingStatus && progress !== undefined
        ? { max: 100, min: 0, now: Math.round(Math.max(0, Math.min(1, progress)) * 100) }
        : undefined}
      disabled={selectionMode}
      onLongPress={onLongPress}
      style={[
        styles.preview,
        captionAttached && styles.previewWithCaption,
        {
          aspectRatio,
          backgroundColor: theme.backgroundElement,
          borderColor: theme.hairline,
          width: frameSize.width,
          opacity: available || pendingStatus ? 1 : 0.65,
        },
      ]}
    >
      {visibleThumbnail ? (
        <Image
          accessibilityElementsHidden
          cachePolicy="memory-disk"
          contentFit="cover"
          placeholder={ChatImagePlaceholder}
          placeholderContentFit="cover"
          recyclingKey={geometryKey}
          source={visibleThumbnail}
          style={styles.thumbnail}
          transition={0}
        />
      ) : null}
      <View pointerEvents="none" style={styles.innerGlass} />
      {pendingStatus ? (
        <View style={[styles.play, styles.pendingState, { backgroundColor: theme.overlay }]}>
          {pendingStatus === 'Sent'
            ? <PlatformIcon color="white" name="check" size={18} />
            : pendingStatus === 'Waiting for connection'
              ? <PlatformIcon color="white" name="cloud-off" size={18} />
              : <ActivityIndicator color="white" size="small" />}
        </View>
      ) : showPlayButton ? (
        <Pressable
          accessibilityLabel="Play video"
          accessibilityRole="button"
          accessibilityState={{ disabled: !onPress || selectionMode }}
          disabled={!onPress || selectionMode}
          hitSlop={8}
          onLongPress={onLongPress}
          onPress={onPress}
          style={[styles.play, { backgroundColor: theme.accent }]}>
          <PlatformIcon color={theme.accentInk} name="play" size={18} />
        </Pressable>
      ) : null}
      <View style={styles.footer}>
        {showFilename ? <ThemedText ellipsizeMode="middle" numberOfLines={1} style={styles.filename} type="captionBold">
          {filename}
        </ThemedText> : null}
        {duration ? <View style={styles.durationGroup}>
          <PlatformIcon color="#000000" name="video" size={13} />
          <ThemedText style={styles.duration} type="caption">{duration}</ThemedText>
        </View> : null}
        {deliveryMeta ? <View pointerEvents="none" style={styles.deliveryInline}>{deliveryMeta}</View> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  viewerBackdrop: { backgroundColor: '#000000', flex: 1, paddingHorizontal: Spacing.three },
  viewerClose: { alignItems: 'center', backgroundColor: 'rgba(72, 72, 72, 0.86)', borderRadius: Radius.pill, height: TouchTarget, justifyContent: 'center', width: TouchTarget },
  viewerFrame: { alignSelf: 'center', backgroundColor: '#000000', borderRadius: Radius.medium, overflow: 'hidden' },
  viewerHeader: { paddingBottom: Spacing.three, paddingHorizontal: Spacing.one },
  viewerLoading: { alignSelf: 'center', position: 'absolute', top: '50%' },
  duration: { color: '#000000' },
  durationGroup: { alignItems: 'center', flexDirection: 'row', gap: Spacing.half },
  filename: { color: 'white', flex: 1, minWidth: 0 },
  footer: {
    alignItems: 'center',
    bottom: 0,
    flexDirection: 'row',
    gap: Spacing.two,
    left: 0,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    position: 'absolute',
    right: 0,
  },
  // Keep duration, timestamp, and read receipt on the video without adding a
  // full-width shaded strip behind them.
  deliveryInline: { alignItems: 'center', flexShrink: 0, marginLeft: 'auto' },
  play: {
    alignItems: 'center',
    borderRadius: Radius.pill,
    height: TouchTarget,
    justifyContent: 'center',
    position: 'absolute',
    width: TouchTarget,
  },
  thumbnail: StyleSheet.absoluteFill,
  innerGlass: {
    ...StyleSheet.absoluteFill,
    borderColor: 'rgba(255,255,255,0.22)',
    borderRadius: Radius.large,
    borderWidth: StyleSheet.hairlineWidth,
    boxShadow: 'inset 0 1px 12px rgba(255,255,255,0.14)',
  },
  preview: {
    alignItems: 'center',
    borderRadius: Radius.large,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  pendingState: { height: TouchTarget, width: TouchTarget },
  previewWithCaption: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderBottomWidth: 0 },
});
