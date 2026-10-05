import { Image } from 'expo-image';
import { InteractionManager, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { OptionsSheet, SheetRow, SheetSection } from '@/components/options-sheet';
import { PlatformIcon } from '@/components/platform-icon';
import { ThemedText } from '@/components/themed-text';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { attachmentIcon, formatFileSize, isImageAttachment } from '@/lib/attachment-presentation';
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

/** Native pickers cannot be presented while the sheet modal is still on screen. */
function afterSheetCloses(
  run: () => Promise<UploadableFile[]>,
  onPicked: (files: UploadableFile[]) => void,
  onError: (message: string) => void,
  failureMessage: string,
) {
  InteractionManager.runAfterInteractions(() => {
    void run().then((files) => {
      if (files.length) onPicked(files);
    }).catch(() => {
      onError(failureMessage);
    });
  });
}

export function ChatAttachMenu({ onClose, onError, onPicked, visible }: MenuProps) {
  const choose = (run: () => Promise<UploadableFile[]>, failureMessage: string) => {
    onClose();
    afterSheetCloses(run, onPicked, onError, failureMessage);
  };

  return (
    <OptionsSheet onClose={onClose} title="Add to message" visible={visible}>
      <SheetSection>
        <SheetRow icon="camera" label="Camera" onPress={() => choose(capturePhoto, 'Could not open the camera. Try again or choose a photo.')} />
        <SheetRow icon="image-multiple" label="Photo library" onPress={() => choose(pickImages, 'Could not open the photo library. Try again.')} />
        <SheetRow icon="file-document-outline" label="Document" onPress={() => choose(pickDocuments, 'Could not open the document picker. Try again.')} />
      </SheetSection>
    </OptionsSheet>
  );
}

type StripProps = {
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

export function PendingAttachmentStrip({ disabled = false, items, onRemove }: StripProps) {
  const theme = useTheme();
  if (items.length === 0) return null;

  return (
    <ScrollView
      contentContainerStyle={styles.strip}
      horizontal
      keyboardShouldPersistTaps="handled"
      showsHorizontalScrollIndicator={false}>
      {items.map((item) => {
        const uploading = item.progress !== undefined && item.progress > 0 && item.progress < 1;
        return (
          <View
            accessibilityLabel={describe(item)}
            accessible
            key={item.id}
            style={[
              styles.tile,
              {
                backgroundColor: theme.backgroundElement,
                borderColor: item.failed ? theme.danger : theme.hairline,
              },
            ]}>
            {isImageAttachment(item.contentType) ? (
              <Image contentFit="cover" source={{ uri: item.uri }} style={styles.thumb} transition={120} />
            ) : (
              <View style={styles.fileTile}>
                <PlatformIcon
                  color={item.failed ? theme.danger : theme.textSecondary}
                  name={attachmentIcon(item)}
                  size={22}
                />
                <ThemedText numberOfLines={2} themeColor="textSecondary" type="caption">
                  {item.filename}
                </ThemedText>
              </View>
            )}

            {item.failed ? (
              <View style={[styles.status, { backgroundColor: theme.dangerSoft }]}>
                <ThemedText numberOfLines={1} themeColor="danger" type="captionBold">Failed</ThemedText>
              </View>
            ) : uploading ? (
              <View style={[styles.track, { backgroundColor: theme.skeleton }]}>
                <View
                  style={[
                    styles.trackFill,
                    { backgroundColor: theme.accent, width: `${Math.round((item.progress ?? 0) * 100)}%` },
                  ]}
                />
              </View>
            ) : null}

            <Pressable
              accessibilityLabel={`Remove ${item.filename}`}
              accessibilityRole="button"
              accessibilityState={{ disabled }}
              disabled={disabled}
              hitSlop={12}
              onPress={() => onRemove(item.id)}
              style={[styles.remove, { backgroundColor: theme.overlay, opacity: disabled ? 0.5 : 1 }]}>
              <PlatformIcon color={Colors.dark.text} name="close" size={13} />
            </Pressable>
          </View>
        );
      })}
    </ScrollView>
  );
}

const TileSize = 64;

const styles = StyleSheet.create({
  fileTile: {
    alignItems: 'center',
    flex: 1,
    gap: Spacing.one,
    justifyContent: 'center',
    padding: Spacing.one,
  },
  remove: {
    alignItems: 'center',
    borderRadius: Radius.pill,
    height: 22,
    justifyContent: 'center',
    position: 'absolute',
    right: 2,
    top: 2,
    width: 22,
  },
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
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  thumb: {
    height: '100%',
    width: '100%',
  },
  tile: {
    borderRadius: Radius.medium,
    borderWidth: StyleSheet.hairlineWidth,
    height: TileSize,
    overflow: 'hidden',
    width: TileSize,
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
