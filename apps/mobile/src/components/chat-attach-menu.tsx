import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import Animated, { FadeIn, FadeOut, LinearTransition, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { OptionsSheet, SheetRow, SheetSection } from '@/components/options-sheet';
import { ChatImagePlaceholder, ChatImageTransition, ChatMotionDuration, ChatMotionEasing } from '@/components/chat/message-motion';
import { PlatformIcon } from '@/components/platform-icon';
import { ThemedText } from '@/components/themed-text';
import { Colors, Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { attachmentIcon, formatFileSize, isImageAttachment } from '@/lib/attachment-presentation';
import { hapticLight } from '@/lib/haptics';
import type { UploadableFile } from '@/lib/attachment-upload';
import { capturePhoto, pickDocuments, pickImages } from '@/lib/media-capture';

export type PendingAttachment = UploadableFile & {
  failed?: boolean;
  progress?: number;
};

type MenuProps = {
  onClose: () => void;
  onError: (message: string) => void;
  onPicked: (files: UploadableFile[]) => void;
  visible: boolean;
};

export function ChatAttachMenu({ onClose, onError, onPicked, visible }: MenuProps) {
  const pendingPicker = useRef<{ run: () => Promise<UploadableFile[]>; failureMessage: string } | null>(null);
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
          if (files.length) onPicked(files);
        }).catch(() => onError(picker.failureMessage));
      }}
      title="Add to message"
      visible={visible}>
      <SheetSection>
        <SheetRow icon="camera" label="Camera" onPress={() => choose(capturePhoto, 'Could not open the camera. Try again or choose a photo.')} />
        <SheetRow icon="image-multiple" label="Photo library" onPress={() => choose(pickImages, 'Could not open the photo library. Try again.')} />
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
    height: (TileSize + Spacing.one * 2) * reveal.value,
    marginBottom: -collapseSpacing * (1 - reveal.value),
    opacity: reveal.value,
  }));

  return (
    <Animated.View accessibilityElementsHidden={!visible} importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'} pointerEvents={visible ? 'auto' : 'none'} testID="composer-pending-attachments" style={[styles.stripClip, revealStyle]}>
      <ScrollView
        contentContainerStyle={styles.strip}
        horizontal
        keyboardShouldPersistTaps="handled"
        showsHorizontalScrollIndicator={false}
        style={{ height: TileSize + Spacing.one * 2, flexGrow: 0 }}>
        {items.map((item) => {
          const isImage = isImageAttachment(item.contentType);
          const key = isImage ? `${item.id}:${item.uri}` : item.id;
          return (
            <Animated.View
              entering={reducedMotion ? undefined : AttachmentEnter}
              exiting={reducedMotion ? undefined : AttachmentExit}
              key={key}
              layout={reducedMotion ? undefined : AttachmentReflow}
            >
              {isImage
                ? <ImageAttachmentTile disabled={disabled} item={item} onRemove={onRemove} />
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
        source={{ uri: item.uri }}
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
      accessibilityLabel={isImageAttachment(item.contentType) ? 'Remove selected image' : `Remove ${item.filename}`}
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
        isImageAttachment(item.contentType) && styles.imageRemove,
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
    paddingVertical: Spacing.one,
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
