import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { Pressable as GesturePressable } from 'react-native-gesture-handler';

import { ImageViewer } from '@/components/chat/image-viewer';
import { ChatImagePlaceholder, ChatImageTransition } from '@/components/chat/message-motion';
import { chatImageAspectRatio } from '@/lib/chat-image-layout';
import { MESSAGE_SELECTION_RAIL_WIDTH } from '@/components/chat/message-layout';
import type { ViewableImage } from '@/components/chat/types';
import { PlatformIcon } from '@/components/platform-icon';
import { ThemedText } from '@/components/themed-text';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { formatFileSize } from '@/lib/attachment-presentation';
import { hapticLight } from '@/lib/haptics';
import { useTheme } from '@/hooks/use-theme';

const GRID_GAP = 2;
const MAX_TILES = 4;

/** A wide lead tile for three images, otherwise pairs that fill each row. */
function gridRows(images: ViewableImage[]) {
  if (images.length === 3) return [[images[0]], [images[1], images[2]]];
  const rows: ViewableImage[][] = [];
  for (let index = 0; index < images.length; index += 2) rows.push(images.slice(index, index + 2));
  return rows;
}

function imageSource(image: ViewableImage, previewFailed: boolean) {
  if (previewFailed && image.previewUrl) return image.originalUrl ?? image.url;
  return image.previewUrl ?? image.url;
}


type Props = {
  deliveryAccessibilityLabel?: string;
  deliveryMeta?: ReactNode;
  images: ViewableImage[];
  onLongPress?: () => void;
  selectionMode?: boolean;
};

export function ImageAttachments({ deliveryAccessibilityLabel, deliveryMeta, images, onLongPress, selectionMode = false }: Props) {
  const { width } = useWindowDimensions();
  const [openImage, setOpenImage] = useState<ViewableImage | null>(null);
  const maxWidth = Math.max(0, Math.min(width * 0.72, 320) - (selectionMode ? MESSAGE_SELECTION_RAIL_WIDTH : 0));

  function open(image: ViewableImage) {
    hapticLight();
    setOpenImage(image);
  }

  const visible = images.slice(0, MAX_TILES);
  const overflow = images.length - visible.length;
  const half = (maxWidth - GRID_GAP) / 2;
  const rows = gridRows(visible);
  const lastTile = visible[visible.length - 1];

  return (
    <View style={styles.wrap}>
      {visible.length === 1 ? (
        <SingleImage
          image={visible[0]}
          deliveryAccessibilityLabel={deliveryAccessibilityLabel}
          deliveryMeta={deliveryMeta}
          maxWidth={maxWidth}
          onLongPress={onLongPress}
          onPress={open}
        />
      ) : (
        <View style={[styles.grid, { width: maxWidth }]}>
          {rows.map((row) => (
            <View key={row[0].id} style={styles.gridRow}>
              {row.map((image) => (
                <ImageTile
                  height={half}
                  image={image}
                  key={image.id}
                  deliveryMeta={image.id === lastTile.id ? deliveryMeta : undefined}
                  deliveryAccessibilityLabel={image.id === lastTile.id ? deliveryAccessibilityLabel : undefined}
                  onLongPress={onLongPress}
                  onPress={open}
                  overflow={overflow > 0 && image.id === lastTile.id ? overflow : 0}
                  width={row.length === 1 ? maxWidth : half}
                />
              ))}
            </View>
          ))}
        </View>
      )}
      <ImageViewer image={openImage} onClose={() => setOpenImage(null)} />
    </View>
  );
}

function SingleImage({
  image,
  deliveryAccessibilityLabel,
  deliveryMeta,
  maxWidth,
  onLongPress,
  onPress,
}: {
  image: ViewableImage;
  deliveryAccessibilityLabel?: string;
  deliveryMeta?: ReactNode;
  maxWidth: number;
  onLongPress?: () => void;
  onPress: (image: ViewableImage) => void;
}) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const ratio = chatImageAspectRatio(image);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [originalFailed, setOriginalFailed] = useState(false);

  if (originalFailed) {
    return <BrokenImage deliveryAccessibilityLabel={deliveryAccessibilityLabel} deliveryMeta={deliveryMeta} height={maxWidth / ratio} image={image} onLongPress={onLongPress} onPress={() => onPress(image)} width={maxWidth} />;
  }

  return (
    <GesturePressable
      accessibilityHint="Opens the image full screen"
      accessibilityLabel={imageButtonLabel(image, deliveryAccessibilityLabel)}
      accessibilityRole="button"
      onLongPress={onLongPress}
      onPress={() => onPress(image)}
      style={[styles.tile, { backgroundColor: theme.skeleton, width: maxWidth }]}>
      <Image
        cachePolicy="memory-disk"
        contentFit={image.width && image.height ? 'cover' : 'contain'}
        onError={() => {
          if (image.previewUrl && !previewFailed) {
            setPreviewFailed(true);
            return;
          }
          setOriginalFailed(true);
        }}
        placeholder={ChatImagePlaceholder}
        placeholderContentFit="cover"
        recyclingKey={image.id}
        source={{ uri: imageSource(image, previewFailed) }}
        style={{ aspectRatio: ratio, width: maxWidth }}
        transition={reducedMotion ? 0 : ChatImageTransition}
      />
      {deliveryMeta ? <View pointerEvents="none" style={styles.deliveryMeta}>{deliveryMeta}</View> : null}
    </GesturePressable>
  );
}

function ImageTile({
  height,
  image,
  deliveryAccessibilityLabel,
  deliveryMeta,
  onLongPress,
  onPress,
  overflow = 0,
  width,
}: {
  height: number;
  image: ViewableImage;
  deliveryAccessibilityLabel?: string;
  deliveryMeta?: ReactNode;
  onLongPress?: () => void;
  onPress: (image: ViewableImage) => void;
  overflow?: number;
  width: number;
}) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const [previewFailed, setPreviewFailed] = useState(false);
  const [originalFailed, setOriginalFailed] = useState(false);

  if (originalFailed) {
    return <BrokenImage deliveryAccessibilityLabel={deliveryAccessibilityLabel} deliveryMeta={deliveryMeta} height={height} image={image} onLongPress={onLongPress} onPress={() => onPress(image)} width={width} />;
  }

  return (
    <GesturePressable
      accessibilityHint="Opens the image full screen"
      accessibilityLabel={imageButtonLabel(image, deliveryAccessibilityLabel, overflow)}
      accessibilityRole="button"
      onLongPress={onLongPress}
      onPress={() => onPress(image)}
      style={[styles.tile, { backgroundColor: theme.skeleton, height, width }]}>
      <Image
        cachePolicy="memory-disk"
        contentFit="cover"
        onError={() => {
          if (image.previewUrl && !previewFailed) {
            setPreviewFailed(true);
            return;
          }
          setOriginalFailed(true);
        }}
        placeholder={ChatImagePlaceholder}
        placeholderContentFit="cover"
        recyclingKey={image.id}
        source={{ uri: imageSource(image, previewFailed) }}
        style={styles.tileImage}
        transition={reducedMotion ? 0 : ChatImageTransition}
      />
      {overflow ? (
        <View style={[styles.overflow, { backgroundColor: theme.overlay }]}>
          <ThemedText style={styles.overflowLabel} type="subtitle">
            {`+${overflow}`}
          </ThemedText>
        </View>
      ) : null}
      {deliveryMeta ? <View pointerEvents="none" style={styles.deliveryMeta}>{deliveryMeta}</View> : null}
    </GesturePressable>
  );
}

function BrokenImage({ deliveryAccessibilityLabel, deliveryMeta, height, image, onLongPress, onPress, width }: {
  deliveryAccessibilityLabel?: string;
  deliveryMeta?: ReactNode;
  height: number;
  image: ViewableImage;
  onLongPress?: () => void;
  onPress: () => void;
  width: number;
}) {
  const theme = useTheme();
  return (
    <GesturePressable
      accessibilityHint="Opens the image full screen"
      accessibilityLabel={`${imageButtonLabel(image, deliveryAccessibilityLabel)}. Preview could not be loaded. Open full screen`}
      accessibilityRole="button"
      onLongPress={onLongPress}
      onPress={onPress}
      style={[styles.broken, { backgroundColor: theme.backgroundElement, height, width }]}>
      <PlatformIcon color={theme.textSecondary} name="image" size={18} />
      <ThemedText numberOfLines={1} themeColor="textSecondary" type="caption">
        {image.filename}
      </ThemedText>
      {deliveryMeta ? <View pointerEvents="none" style={styles.deliveryMeta}>{deliveryMeta}</View> : null}
    </GesturePressable>
  );
}

function imageButtonLabel(image: ViewableImage, deliveryAccessibilityLabel?: string, overflow = 0) {
  const label = overflow
    ? `Image ${image.filename} and ${overflow} more`
    : `Image ${image.filename}, ${formatFileSize(image.size)}`;
  return deliveryAccessibilityLabel ? `${label}. ${deliveryAccessibilityLabel}` : label;
}

const styles = StyleSheet.create({
  broken: {
    alignItems: 'center',
    borderRadius: Radius.medium,
    gap: Spacing.one,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.five,
  },
  deliveryMeta: { bottom: 7, position: 'absolute', right: 8 },
  grid: {
    gap: GRID_GAP,
  },
  gridRow: {
    flexDirection: 'row',
    gap: GRID_GAP,
  },
  overflow: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overflowLabel: {
    color: Colors.dark.text,
  },
  tile: {
    borderRadius: Radius.medium,
    overflow: 'hidden',
  },
  tileImage: {
    height: '100%',
    width: '100%',
  },
  wrap: {
    gap: Spacing.one,
    position: 'relative',
  },
});
