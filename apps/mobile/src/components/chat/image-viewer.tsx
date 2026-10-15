import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ViewableImage } from '@/components/chat/types';
import { PlatformIcon } from '@/components/platform-icon';
import { ThemedText } from '@/components/themed-text';
import { Colors, Radius, Spacing, TouchTarget } from '@/constants/theme';
import { attachmentActionError, shareAttachment } from '@/lib/attachment-actions';
import { formatFileSize } from '@/lib/attachment-presentation';
import { hapticLight } from '@/lib/haptics';

/** The viewer is always dark, so it reads from the dark palette in both themes. */
const viewer = Colors.dark;

const MAX_SCALE = 6;
const ZOOMED_SCALE = 2.5;
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 900;

function clamp(value: number, min: number, max: number) {
  'worklet';
  return Math.min(Math.max(value, min), max);
}

type Props = {
  image: ViewableImage | null;
  onClose: () => void;
};

export function ImageViewer({ image, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const [imageAttempt, setImageAttempt] = useState(0);
  const [usingPreviewFallback, setUsingPreviewFallback] = useState(false);
  const originalUrl = image?.originalUrl ?? image?.url ?? null;
  const previewFallbackUrl = image?.previewUrl && image.previewUrl !== originalUrl ? image.previewUrl : null;
  const downloadAction = Platform.OS === 'web';
  const actionLabel = downloadAction ? 'Download image' : 'Save or share image';
  const loadingActionLabel = downloadAction ? 'Preparing download' : 'Preparing image';

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);
  const backdrop = useSharedValue(1);

  const reset = useCallback(() => {
    scale.value = 1;
    savedScale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    savedX.value = 0;
    savedY.value = 0;
    backdrop.value = 1;
  }, [backdrop, savedScale, savedX, savedY, scale, translateX, translateY]);

  useEffect(() => {
    if (image) {
      reset();
      setShareError(null);
      setImageFailed(false);
      setImageAttempt(0);
      setUsingPreviewFallback(false);
    }
  }, [image, reset]);

  const dismiss = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  const pinch = Gesture.Pinch()
    .onUpdate((event) => {
      scale.value = clamp(savedScale.value * event.scale, 1, MAX_SCALE);
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value > 1) return;
      translateX.value = withTiming(0, { duration: reducedMotion ? 0 : 200 });
      translateY.value = withTiming(0, { duration: reducedMotion ? 0 : 200 });
      savedX.value = 0;
      savedY.value = 0;
    });

  const pan = Gesture.Pan()
    .onUpdate((event) => {
      if (scale.value > 1) {
        translateX.value = savedX.value + event.translationX;
        translateY.value = savedY.value + event.translationY;
        return;
      }
      translateY.value = event.translationY;
      backdrop.value = clamp(1 - Math.abs(event.translationY) / 500, 0.4, 1);
    })
    .onEnd((event) => {
      if (scale.value > 1) {
        savedX.value = translateX.value;
        savedY.value = translateY.value;
        return;
      }
      const shouldDismiss =
        Math.abs(event.translationY) > DISMISS_DISTANCE || Math.abs(event.velocityY) > DISMISS_VELOCITY;
      if (shouldDismiss) {
        scheduleOnRN(dismiss);
        return;
      }
      translateY.value = withTiming(0, { duration: reducedMotion ? 0 : 200 });
      backdrop.value = withTiming(1, { duration: reducedMotion ? 0 : 200 });
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      const zoomed = scale.value > 1;
      scale.value = withTiming(zoomed ? 1 : ZOOMED_SCALE, { duration: reducedMotion ? 0 : 200 });
      savedScale.value = zoomed ? 1 : ZOOMED_SCALE;
      if (!zoomed) return;
      translateX.value = withTiming(0, { duration: reducedMotion ? 0 : 200 });
      translateY.value = withTiming(0, { duration: reducedMotion ? 0 : 200 });
      savedX.value = 0;
      savedY.value = 0;
    });

  const gesture = Gesture.Exclusive(doubleTap, Gesture.Simultaneous(pinch, pan));

  const imageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));

  async function share() {
    if (!image || sharing) return;
    hapticLight();
    setSharing(true);
    setShareError(null);
    try {
      await shareAttachment({
        cacheKey: image.id,
        contentType: image.contentType,
        filename: image.filename,
        url: image.originalUrl ?? image.url,
      });
    } catch (error) {
      setShareError(attachmentActionError(error));
    } finally {
      setSharing(false);
    }
  }

  function retryImage() {
    if (!image) return;
    hapticLight();
    setImageFailed(false);
    setUsingPreviewFallback(false);
    setImageAttempt((attempt) => attempt + 1);
  }

  return (
    <Modal
      animationType="none"
      onRequestClose={dismiss}
      statusBarTranslucent
      transparent
      visible={Boolean(image)}>
      <GestureHandlerRootView style={styles.root}>
        <Animated.View style={[styles.backdrop, backdropStyle]} />
        {image ? (
          <View accessibilityViewIsModal style={styles.root}>
            <GestureDetector gesture={gesture}>
              <Animated.View style={[styles.stage, imageStyle]}>
                {imageFailed ? (
                  <View accessibilityLiveRegion="polite" style={styles.failedImage}>
                    <PlatformIcon color={viewer.textSecondary} name="image" size={24} />
                    <ThemedText style={styles.failedImageText} type="caption">
                      Image could not be loaded.
                    </ThemedText>
                    <Pressable accessibilityLabel="Retry image" accessibilityRole="button" onPress={retryImage}>
                      <ThemedText style={styles.retry} type="captionBold">
                        Retry
                      </ThemedText>
                    </Pressable>
                  </View>
                ) : (
                  <Image
                    accessibilityLabel={`Image ${image.filename}`}
                    contentFit="contain"
                    key={`${image.id}-${imageAttempt}-${usingPreviewFallback}`}
                    onError={() => {
                      if (!usingPreviewFallback && previewFallbackUrl) {
                        setUsingPreviewFallback(true);
                        return;
                      }
                      setImageFailed(true);
                    }}
                    placeholder={image.previewUrl ? { uri: image.previewUrl } : undefined}
                    placeholderContentFit="contain"
                    recyclingKey={image.id}
                    source={{ uri: usingPreviewFallback ? previewFallbackUrl ?? originalUrl ?? image.url : originalUrl ?? image.url }}
                    style={styles.image}
                    transition={0}
                  />
                )}
              </Animated.View>
            </GestureDetector>
            <View style={[styles.header, { paddingTop: insets.top + Spacing.two }]}>
              <Pressable
                accessibilityLabel="Close image"
                accessibilityRole="button"
                hitSlop={8}
                onPress={dismiss}
                style={styles.headerButton}>
                <PlatformIcon color={viewer.text} name="close" size={20} />
              </Pressable>
              <View style={styles.headerText}>
                <ThemedText numberOfLines={1} style={styles.headerTitle} type="title">
                  {image.filename}
                </ThemedText>
                <ThemedText style={styles.headerMeta} type="caption">
                  {formatFileSize(image.size)}
                </ThemedText>
              </View>
              <Pressable
                accessibilityHint={downloadAction ? 'Downloads the image and keeps this conversation open' : 'Opens the system sheet to save or share the image'}
                accessibilityLabel={sharing ? loadingActionLabel : actionLabel}
                accessibilityRole="button"
                accessibilityState={{ busy: sharing, disabled: sharing }}
                disabled={sharing}
                hitSlop={8}
                onPress={share}
                style={[styles.headerButton, sharing && styles.headerButtonBusy]}>
                <PlatformIcon color={viewer.text} name="download" size={20} />
              </Pressable>
            </View>
            {shareError ? (
              <View style={[styles.error, { bottom: insets.bottom + Spacing.five }]}>
                <PlatformIcon color={viewer.danger} name="alert-circle" size={16} />
                <ThemedText style={styles.errorText} type="caption">
                  {shareError}
                </ThemedText>
                <Pressable accessibilityLabel={downloadAction ? 'Retry download' : 'Retry share'} accessibilityRole="button" onPress={share}>
                  <ThemedText style={styles.retry} type="captionBold">
                    Retry
                  </ThemedText>
                </Pressable>
              </View>
            ) : null}
          </View>
        ) : null}
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: viewer.background,
  },
  error: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: viewer.backgroundElement,
    borderRadius: Radius.large,
    flexDirection: 'row',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    position: 'absolute',
  },
  errorText: {
    color: viewer.text,
    flexShrink: 1,
  },
  failedImage: {
    alignItems: 'center',
    gap: Spacing.two,
    justifyContent: 'center',
    padding: Spacing.four,
  },
  failedImageText: {
    color: viewer.textSecondary,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.three,
    left: 0,
    paddingBottom: Spacing.two,
    paddingHorizontal: Spacing.three,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  headerButton: {
    alignItems: 'center',
    backgroundColor: viewer.backgroundElement,
    borderRadius: Radius.pill,
    height: TouchTarget,
    justifyContent: 'center',
    width: TouchTarget,
  },
  headerButtonBusy: {
    opacity: 0.5,
  },
  headerMeta: {
    color: viewer.textSecondary,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    color: viewer.text,
  },
  image: {
    height: '100%',
    width: '100%',
  },
  retry: {
    color: viewer.accentStrong,
  },
  root: {
    flex: 1,
  },
  stage: {
    flex: 1,
  },
});
