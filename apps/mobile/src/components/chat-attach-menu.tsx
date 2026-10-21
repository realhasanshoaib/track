import { Image } from 'expo-image';
import { useEffect, useRef, useState, type ComponentType } from 'react';
import Animated, { FadeIn, FadeOut, LinearTransition, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { OptionsSheet, SheetRow, SheetSection } from '@/components/options-sheet';
import { ChatImagePlaceholder, ChatImageTransition, ChatMotionDuration, ChatMotionEasing } from '@/components/chat/message-motion';
import { PlatformIcon } from '@/components/platform-icon';
import { ThemedText } from '@/components/themed-text';
import { Colors, Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { attachmentIcon, formatDuration, formatFileSize, isImageAttachment, isVideoAttachment } from '@/lib/attachment-presentation';
import { publishFilesBeforePreparation } from '@/lib/attachment-preview-flow';
import { composerAttachmentStripLayout, composerAttachmentStripMetrics } from '@/lib/composer-layout';
import { hapticLight } from '@/lib/haptics';
import type { UploadableFile } from '@/lib/attachment-upload';
import { capturePhoto, pickDocuments, pickMedia, prepareImageForUpload } from '@/lib/media-capture';
import { videoThumbnail, type VideoFrameSource } from '@/lib/video-thumbnail';
import { chatVideoAspectRatio, videoGeometryKey } from '@/lib/video-layout';

export type PendingAttachment = UploadableFile & {
  failed?: boolean;
  progress?: number;
};

type MenuProps = {
  onClose: () => void;
  onError: (message: string) => void;
  onPicked: (files: UploadableFile[]) => void;
  onPrepared: (file: UploadableFile) => void;
  visible: boolean;
};

export function ChatAttachMenu({ onClose, onError, onPicked, onPrepared, visible }: MenuProps) {
  const pendingPicker = useRef<{ run: () => Promise<UploadableFile[]>; failureMessage: string } | null>(null);
  const preparationTasks = useRef(new Set<ReturnType<typeof publishFilesBeforePreparation>>());
  useEffect(() => () => {
    for (const task of preparationTasks.current) task.cancel();
    preparationTasks.current.clear();
  }, []);

  const choose = (run: () => Promise<UploadableFile[]>, failureMessage: string) => {
    pendingPicker.current = { run, failureMessage };
    onClose();
  };

  return (
    <OptionsSheet
      onClose={onClose}
      onClosed={() => {
        const picker = pendingPicker.current;
        pendingPicker.current = null;
        if (!picker) return;
        void picker.run().then((files) => {
          if (files.length) {
            const task = publishFilesBeforePreparation(files, onPicked, prepareImageForUpload, onPrepared);
            preparationTasks.current.add(task);
            void task.done.then(() => preparationTasks.current.delete(task));
          }
        }).catch(() => onError(picker.failureMessage));
      }}
      title="Add to message"
      visible={visible}>
      <SheetSection>
        <SheetRow icon="camera" label="Camera" onPress={() => choose(capturePhoto, 'Could not open the camera. Try again or choose a photo.')} />
        <SheetRow icon="image-multiple" label="Photos & videos" onPress={() => choose(pickMedia, 'Could not open the photo library. Try again.')} />
        <SheetRow icon="file-document-outline" label="Document" onPress={() => choose(pickDocuments, 'Could not open the document picker. Try again.')} />
      </SheetSection>
    </OptionsSheet>
  );
}

type StripProps = {
  collapseSpacing?: number;
  disabled?: boolean;
  items: PendingAttachment[];
  onRemove: (id: string) => void;
};

function describe(item: PendingAttachment) {
  if (item.failed) return `${item.filename}, upload failed`;
  if (item.progress !== undefined && item.progress > 0 && item.progress < 1) {
    return `${item.filename}, uploading ${Math.round(item.progress * 100)} percent`;
  }
  return item.size ? `${item.filename}, ${formatFileSize(item.size)}` : item.filename;
}

export function PendingAttachmentStrip({ collapseSpacing = 0, disabled = false, items, onRemove }: StripProps) {
  const reducedMotion = useReducedMotion();
  const visible = items.length > 0;
  const reveal = useSharedValue(visible ? 1 : 0);
  useEffect(() => {
    reveal.value = withTiming(visible ? 1 : 0, { duration: reducedMotion ? 0 : ChatMotionDuration, easing: ChatMotionEasing });
  }, [reducedMotion, reveal, visible]);
  const revealStyle = useAnimatedStyle(() => ({
    opacity: reveal.value,
    transform: [{ translateY: (1 - reveal.value) * -collapseSpacing }],
  }));
  // Change the composer/list reservation once per add/remove. Animating this
  // height made the screen update its bottom inset and re-scroll on every
  // frame of the preview reveal.
  const stripLayout = composerAttachmentStripLayout(TileSize, Spacing.one, 0);
  const stripMetrics = composerAttachmentStripMetrics(visible, stripLayout.height, collapseSpacing);

  return (
    <Animated.View accessibilityElementsHidden={!visible} importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'} pointerEvents={visible ? 'auto' : 'none'} testID="composer-pending-attachments" style={[styles.stripClip, stripMetrics, revealStyle]}>
      <ScrollView
        contentContainerStyle={[styles.strip, stripLayout]}
        horizontal
        keyboardShouldPersistTaps="handled"
        showsHorizontalScrollIndicator={false}
        style={{ height: stripLayout.height, flexGrow: 0 }}>
        {items.map((item) => {
          const isImage = isImageAttachment(item.contentType);
          const isVideo = isVideoAttachment(item.contentType);
          return (
            <Animated.View
              entering={reducedMotion ? undefined : AttachmentEnter}
              exiting={reducedMotion ? undefined : AttachmentExit}
              key={item.id}
              layout={reducedMotion ? undefined : AttachmentReflow}
            >
              {isImage
                ? <ImageAttachmentTile disabled={disabled} item={item} onRemove={onRemove} />
                : isVideo
                  ? <VideoAttachmentTile disabled={disabled} item={item} onRemove={onRemove} />
                  : <FileAttachmentTile disabled={disabled} item={item} onRemove={onRemove} />}
            </Animated.View>
          );
        })}
      </ScrollView>
    </Animated.View>
  );
}

function ImageAttachmentTile({ disabled, item, onRemove }: {
  disabled: boolean;
  item: PendingAttachment;
  onRemove: (id: string) => void;
}) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const [previewState, setPreviewState] = useState<'loading' | 'ready' | 'failed'>('loading');

  return (
    <View style={[styles.tile, styles.imageTile, { backgroundColor: theme.skeleton, borderColor: item.failed ? theme.danger : theme.hairline }]}>
      <Image
        accessibilityLabel="Selected image"
        accessible
        cachePolicy="memory-disk"
        contentFit="cover"
        onError={() => setPreviewState('failed')}
        onLoad={() => setPreviewState('ready')}
        placeholder={ChatImagePlaceholder}
        placeholderContentFit="cover"
        recyclingKey={item.id}
        source={{ uri: item.previewUri ?? item.uri }}
        style={styles.thumb}
        transition={reducedMotion ? 0 : ChatImageTransition}
      />
      {previewState === 'loading' ? (
        <View pointerEvents="none" style={styles.previewLoading}>
          <ActivityIndicator color={theme.textSecondary} size="small" />
        </View>
      ) : previewState === 'failed' ? (
        <View pointerEvents="none" style={styles.previewFallback}>
          <PlatformIcon color={theme.textSecondary} name="image" size={20} />
        </View>
      ) : null}
      <AttachmentProgress item={item} />
      <RemoveAttachmentButton disabled={disabled} item={item} onRemove={onRemove} />
    </View>
  );
}

function VideoAttachmentTile({ disabled, item, onRemove }: {
  disabled: boolean;
  item: PendingAttachment;
  onRemove: (id: string) => void;
}) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const [thumbnail, setThumbnail] = useState<VideoFrameSource | undefined>(item.previewThumbnail);
  const [VideoPlayback, setVideoPlayback] = useState<ComponentType<{
    aspectRatio: number;
    onClose: () => void;
    url: string;
  }> | null>(null);

  async function openPreview() {
    try {
      const playback = await import('@/components/chat/video-playback');
      setVideoPlayback(() => playback.VideoPlayback);
    } catch {
      Alert.alert('Video preview unavailable', 'Rebuild this app with native video playback to preview the selected video.');
    }
  }

  useEffect(() => {
    if (item.previewThumbnail) {
      setThumbnail(item.previewThumbnail);
      return;
    }
    let active = true;
    void videoThumbnail(item.previewUri ?? item.uri, videoGeometryKey(item)).then((frame) => {
      if (active && frame) setThumbnail(frame);
    });
    return () => { active = false; };
  }, [item.id, item.previewThumbnail, item.previewUri, item.uri]);

  const previewUri = item.previewUri ?? item.uri;
  return (
    <>
    <View style={[styles.tile, styles.imageTile, { backgroundColor: theme.skeleton, borderColor: item.failed ? theme.danger : theme.hairline }]}>
      {thumbnail ? (
        <Image
          accessibilityLabel={`Video preview for ${item.filename}`}
          accessible
          cachePolicy="memory-disk"
          contentFit="cover"
          source={thumbnail}
          style={styles.thumb}
          transition={reducedMotion ? 0 : ChatImageTransition}
        />
      ) : (
        <View style={styles.videoFallback}>
          <PlatformIcon color={theme.textSecondary} name="video" size={22} />
        </View>
      )}
      <Pressable accessibilityLabel="Preview selected video" accessibilityRole="button" disabled={disabled} onPress={() => { void openPreview(); }} style={styles.videoPreviewButton}>
        <View style={[styles.videoPlay, { backgroundColor: theme.accent }]}>
          <PlatformIcon color={theme.accentInk} name="play" size={14} />
        </View>
      </Pressable>
      {item.durationMs ? <View pointerEvents="none" style={styles.videoDuration}>
        <PlatformIcon color="#000000" name="video" size={11} />
        <ThemedText style={styles.videoDurationText} type="caption">{formatDuration(item.durationMs)}</ThemedText>
      </View> : null}
      <AttachmentProgress item={item} />
      <RemoveAttachmentButton disabled={disabled} item={item} onRemove={onRemove} />
    </View>
    {VideoPlayback ? <VideoPlayback aspectRatio={chatVideoAspectRatio(item)} onClose={() => setVideoPlayback(null)} url={previewUri} /> : null}
    </>
  );
}

function FileAttachmentTile({ disabled, item, onRemove }: {
  disabled: boolean;
  item: PendingAttachment;
  onRemove: (id: string) => void;
}) {
  const theme = useTheme();

  return (
    <View style={[styles.tile, styles.fileTile, { backgroundColor: theme.backgroundElement, borderColor: item.failed ? theme.danger : theme.hairline }]}>
      <View style={[styles.fileIcon, { backgroundColor: theme.homeSurface }]}>
        <PlatformIcon color={item.failed ? theme.danger : theme.textSecondary} name={attachmentIcon(item)} size={20} />
      </View>
      <View accessibilityLabel={describe(item)} accessible style={styles.fileBody}>
        <ThemedText ellipsizeMode="middle" numberOfLines={2} style={styles.fileName} themeColor="textSecondary" type="caption">
          {item.filename}
        </ThemedText>
      </View>
      <RemoveAttachmentButton disabled={disabled} item={item} onRemove={onRemove} />
      <AttachmentProgress item={item} />
    </View>
  );
}

function RemoveAttachmentButton({ disabled, item, onRemove }: {
  disabled: boolean;
  item: PendingAttachment;
  onRemove: (id: string) => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityLabel={isImageAttachment(item.contentType)
        ? 'Remove selected image'
        : isVideoAttachment(item.contentType)
          ? 'Remove selected video'
          : `Remove ${item.filename}`}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={11}
      onPress={() => {
        hapticLight();
        onRemove(item.id);
      }}
      style={[
        styles.remove,
        (isImageAttachment(item.contentType) || isVideoAttachment(item.contentType)) && styles.imageRemove,
        { backgroundColor: theme.overlay, opacity: disabled ? 0.5 : 1 },
      ]}>
      <PlatformIcon color={Colors.dark.text} name="close" size={13} />
    </Pressable>
  );
}

function AttachmentProgress({ item }: { item: PendingAttachment }) {
  const theme = useTheme();
  const uploading = item.progress !== undefined && item.progress > 0 && item.progress < 1;

  if (item.failed) {
    return (
      <View style={[styles.status, { backgroundColor: theme.dangerSoft }]}>
        <ThemedText numberOfLines={1} themeColor="danger" type="captionBold">Failed</ThemedText>
      </View>
    );
  }

  return uploading ? (
    <View style={[styles.track, { backgroundColor: theme.skeleton }]}>
      <View style={[styles.trackFill, { backgroundColor: theme.accent, width: `${Math.round((item.progress ?? 0) * 100)}%` }]} />
    </View>
  ) : null;
}

const TileSize = 76;
const FileTileWidth = 184;
const AttachmentEnter = FadeIn.duration(150).easing(ChatMotionEasing);
const AttachmentExit = FadeOut.duration(120).easing(ChatMotionEasing);
const AttachmentReflow = LinearTransition.duration(170).easing(ChatMotionEasing);

const styles = StyleSheet.create({
  stripClip: { overflow: 'hidden', flexShrink: 0 },
  fileTile: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.two,
    paddingHorizontal: Spacing.two,
    width: FileTileWidth,
  },
  fileBody: {
    flex: 1,
    justifyContent: 'center',
    minWidth: 0,
    paddingBottom: Spacing.one,
  },
  fileIcon: {
    alignItems: 'center',
    borderRadius: Radius.small,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  fileName: {
    minWidth: 0,
  },
  imageTile: {
    width: TileSize,
  },
  videoFallback: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  videoPreviewButton: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  videoPlay: { alignItems: 'center', borderRadius: Radius.pill, height: 32, justifyContent: 'center', width: 32 },
  videoDuration: { alignItems: 'center', bottom: Spacing.one, flexDirection: 'row', gap: 2, left: Spacing.one, position: 'absolute' },
  videoDurationText: { color: '#000000', fontSize: 9, lineHeight: 12 },
  previewFallback: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewLoading: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  remove: {
    alignItems: 'center',
    borderRadius: Radius.pill,
    flexShrink: 0,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  imageRemove: { position: 'absolute', right: Spacing.half, top: Spacing.half },
  status: {
    alignItems: 'center',
    bottom: 0,
    left: 0,
    paddingVertical: 1,
    position: 'absolute',
    right: 0,
  },
  strip: {
    gap: Spacing.two,
    paddingLeft: TouchTarget + Spacing.four,
    paddingRight: Spacing.one,
  },
  thumb: {
    height: '100%',
    width: '100%',
  },
  tile: {
    borderCurve: 'continuous',
    borderRadius: Radius.medium,
    borderWidth: StyleSheet.hairlineWidth,
    height: TileSize,
    overflow: 'hidden',
  },
  track: {
    bottom: 0,
    height: 3,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  trackFill: {
    height: '100%',
  },
});
