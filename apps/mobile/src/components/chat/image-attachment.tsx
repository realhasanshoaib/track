import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { ImageViewer } from '@/components/chat/image-viewer';
import type { ViewableImage } from '@/components/chat/types';
import { PlatformIcon } from '@/components/platform-icon';
import { ThemedText } from '@/components/themed-text';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { formatFileSize } from '@/lib/attachment-presentation';
import { hapticLight } from '@/lib/haptics';
import { useTheme } from '@/hooks/use-theme';

/** Warm neutral blur shown while the full image decodes. */
const PLACEHOLDER = 'L6Ptp*~q00%M?bofM{WB00Rj_3M{';

const GRID_GAP = 2;
const MAX_TILES = 4;
const SINGLE_DEFAULT_RATIO = 4 / 3;
const SINGLE_MIN_RATIO = 0.56;
const SINGLE_MAX_RATIO = 1.9;

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

function knownImageRatio(image: ViewableImage) {
  if (!image.width || !image.height || image.width < 1 || image.height < 1) return null;
  return Math.min(Math.max(image.width / image.height, SINGLE_MIN_RATIO), SINGLE_MAX_RATIO);
}

type Props = {
  deliveryMeta?: ReactNode;
  images: ViewableImage[];
  onLongPress?: () => void;
};

export function ImageAttachments({ deliveryMeta, images, onLongPress }: Props) {
  const { width } = useWindowDimensions();
  const [openImage, setOpenImage] = useState<ViewableImage | null>(null);
  const maxWidth = Math.min(width * 0.72, 320);

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
      {deliveryMeta ? <View pointerEvents="none" style={styles.deliveryMeta}>{deliveryMeta}</View> : null}
      <ImageViewer image={openImage} onClose={() => setOpenImage(null)} />
    </View>
  );
}

function SingleImage({
  image,
  maxWidth,
  onLongPress,
  onPress,
}: {
  image: ViewableImage;
  maxWidth: number;
  onLongPress?: () => void;
  onPress: (image: ViewableImage) => void;
}) {
  const theme = useTheme();
  const [ratio, setRatio] = useState(knownImageRatio(image) ?? SINGLE_DEFAULT_RATIO);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [originalFailed, setOriginalFailed] = useState(false);

  if (originalFailed) return <BrokenImage image={image} width={maxWidth} />;

  return (
    <Pressable
      accessibilityHint="Opens the image full screen"
      accessibilityLabel={`Image ${image.filename}, ${formatFileSize(image.size)}`}
      accessibilityRole="imagebutton"
      onLongPress={onLongPress}
      onPress={() => onPress(image)}
      style={[styles.tile, { backgroundColor: theme.skeleton, width: maxWidth }]}>
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
        onLoad={({ source }) =>
          setRatio(knownImageRatio(image) ?? Math.min(Math.max(source.width / source.height, SINGLE_MIN_RATIO), SINGLE_MAX_RATIO))
        }
        placeholder={Platform.OS === 'web' ? undefined : PLACEHOLDER}
        placeholderContentFit="cover"
        recyclingKey={image.id}
        source={{ uri: imageSource(image, previewFailed) }}
        style={{ aspectRatio: ratio, width: maxWidth }}
        transition={90}
      />
    </Pressable>
  );
}

function ImageTile({
  height,
  image,
  onLongPress,
  onPress,
  overflow = 0,
  width,
}: {
  height: number;
  image: ViewableImage;
  onLongPress?: () => void;
  onPress: (image: ViewableImage) => void;
  overflow?: number;
  width: number;
}) {
  const theme = useTheme();
  const [previewFailed, setPreviewFailed] = useState(false);
  const [originalFailed, setOriginalFailed] = useState(false);

  if (originalFailed) return <BrokenImage image={image} width={width} />;

  return (
    <Pressable
      accessibilityHint="Opens the image full screen"
      accessibilityLabel={
        overflow
          ? `Image ${image.filename} and ${overflow} more`
          : `Image ${image.filename}, ${formatFileSize(image.size)}`
      }
      accessibilityRole="imagebutton"
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
        placeholder={Platform.OS === 'web' ? undefined : PLACEHOLDER}
        placeholderContentFit="cover"
        recyclingKey={image.id}
        source={{ uri: imageSource(image, previewFailed) }}
        style={styles.tileImage}
        transition={90}
      />
      {overflow ? (
        <View style={[styles.overflow, { backgroundColor: theme.overlay }]}>
          <ThemedText style={styles.overflowLabel} type="subtitle">
            {`+${overflow}`}
          </ThemedText>
        </View>
      ) : null}
    </Pressable>
  );
}

function BrokenImage({ image, width }: { image: ViewableImage; width: number }) {
  const theme = useTheme();
  return (
    <View
      accessibilityLabel={`Image ${image.filename} could not be loaded`}
      style={[styles.broken, { backgroundColor: theme.backgroundElement, width }]}>
      <PlatformIcon color={theme.textSecondary} name="image" size={18} />
      <ThemedText numberOfLines={1} themeColor="textSecondary" type="caption">
        {image.filename}
      </ThemedText>
    </View>
  );
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
