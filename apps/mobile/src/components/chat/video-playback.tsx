import { useEffect, useState } from 'react';
import { Image } from 'expo-image';
import { VideoView, useVideoPlayer } from 'expo-video';
import { ActivityIndicator, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { AttachmentReference } from '@/components/chat/types';
import { PlatformIcon } from '@/components/platform-icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, TouchTarget } from '@/constants/theme';
import { attachmentActionError, saveAttachment, shareAttachment } from '@/lib/attachment-actions';
import { hapticLight } from '@/lib/haptics';
import type { VideoFrameSource } from '@/lib/video-thumbnail';

export function VideoPlayback({ aspectRatio, attachment, onClose, onForward, thumbnail, url }: {
  aspectRatio: number;
  attachment?: AttachmentReference['attachment'];
  onClose: () => void;
  onForward?: () => void;
  thumbnail?: VideoFrameSource;
  url: string;
}) {
  const insets = useSafeAreaInsets();
  const { height: screenHeight, width: screenWidth } = useWindowDimensions();
  const playerWidth = Math.max(1, Math.min(screenWidth - Spacing.six, (screenHeight - insets.top - insets.bottom - 120) * aspectRatio, 900));
  const [actionError, setActionError] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState(false);
  const [busyAction, setBusyAction] = useState<'share' | 'download' | null>(null);
  const target = attachment ? {
    cacheKey: String(attachment._id),
    contentType: attachment.contentType,
    filename: attachment.filename,
    url,
  } : null;
  const player = useVideoPlayer(url, (videoPlayer) => {
    videoPlayer.loop = false;
  });
  const [playbackStatus, setPlaybackStatus] = useState(player.status);
  const [retrying, setRetrying] = useState(false);
  const [firstFrameRendered, setFirstFrameRendered] = useState(false);

  // The player can still be loading when the modal first mounts. Start only
  // after the native source is ready, and surface native failures instead of
  // leaving the user on a black screen.
  useEffect(() => {
    const subscription = player.addListener('statusChange', ({ status }) => {
      setPlaybackStatus(status);
      if (status === 'readyToPlay') {
        setRetrying(false);
        player.play();
      } else if (status === 'error') {
        setRetrying(false);
      }
    });

    setPlaybackStatus(player.status);
    if (player.status === 'readyToPlay') player.play();
    return () => {
      subscription.remove();
    };
  }, [player]);

  async function retryPlayback() {
    if (retrying) return;
    setRetrying(true);
    try {
      await player.replaceAsync(url);
      setPlaybackStatus(player.status);
    } catch {
      setRetrying(false);
      setPlaybackStatus('error');
    }
  }

  async function runAction(action: 'share' | 'download') {
    if (busyAction || !target) return;
    hapticLight();
    setBusyAction(action);
    setActionError(null);
    try {
      if (action === 'share') await shareAttachment(target);
      else {
        await saveAttachment(target);
        setDownloaded(true);
      }
    } catch (error) {
      setActionError(attachmentActionError(error));
    } finally {
      setBusyAction(null);
    }
  }

  return (
      <View style={styles.playerBackdrop}>
        <View style={[styles.playerHeader, { paddingTop: insets.top + Spacing.two }]}>
          <Pressable accessibilityLabel="Close video playback" accessibilityRole="button" hitSlop={8} onPress={() => {
            player.pause();
            onClose();
          }} style={styles.headerButton}>
            <PlatformIcon color="white" name="close" size={21} />
          </Pressable>
          <View style={styles.headerActions}>
            {target ? <Pressable accessibilityLabel="Share video" accessibilityRole="button" disabled={Boolean(busyAction)} hitSlop={8} onPress={() => { void runAction('share'); }} style={styles.headerButton}>
              {busyAction === 'share' ? <ActivityIndicator color="white" size="small" /> : <PlatformIcon color="white" name="share" size={20} />}
            </Pressable> : null}
            {onForward ? <Pressable accessibilityLabel="Forward video" accessibilityRole="button" hitSlop={8} onPress={() => {
              player.pause();
              onClose();
              onForward();
            }} style={styles.headerButton}>
              <PlatformIcon color="white" name="forward" size={20} />
            </Pressable> : null}
            {target ? <Pressable accessibilityLabel={downloaded ? 'Video downloaded' : 'Download video'} accessibilityRole="button" disabled={Boolean(busyAction) || downloaded} hitSlop={8} onPress={() => { void runAction('download'); }} style={styles.headerButton}>
              {busyAction === 'download' ? <ActivityIndicator color="white" size="small" /> : <PlatformIcon color="white" name={downloaded ? 'check' : 'download'} size={20} />}
            </Pressable> : null}
          </View>
        </View>
        <View style={[styles.player, { aspectRatio, backgroundColor: 'black', width: playerWidth }]}>
          <VideoView
            contentFit="contain"
            nativeControls
            onFirstFrameRender={() => setFirstFrameRendered(true)}
            player={player}
            style={StyleSheet.absoluteFill}
            {...(Platform.OS === 'android' ? { surfaceType: 'textureView' as const } : {})}
          />
          {!firstFrameRendered && thumbnail ? (
            <Image contentFit="contain" pointerEvents="none" source={thumbnail} style={StyleSheet.absoluteFill} />
          ) : null}
          {!firstFrameRendered && (playbackStatus === 'loading' || playbackStatus === 'idle') ? (
            <View pointerEvents="none" style={styles.loading}>
              <ActivityIndicator color="white" size="large" />
            </View>
          ) : null}
          {playbackStatus === 'error' ? (
            <View style={styles.playbackError}>
              <ThemedText style={styles.playbackErrorText} type="smallBold">Video couldn’t play</ThemedText>
              <Pressable accessibilityRole="button" disabled={retrying} onPress={() => { void retryPlayback(); }} style={styles.retryButton}>
                {retrying ? <ActivityIndicator color="white" size="small" /> : <ThemedText style={styles.retryText} type="label">Try again</ThemedText>}
              </Pressable>
            </View>
          ) : null}
        </View>
        {actionError || downloaded ? <View accessibilityLiveRegion="polite" style={styles.actionNotice}>
          <ThemedText numberOfLines={2} style={styles.actionNoticeText} type="caption">
            {actionError ?? 'Video saved to the selected folder.'}
          </ThemedText>
        </View> : null}
        <View style={{ height: insets.bottom + Spacing.two }} />
      </View>
  );
}

const styles = StyleSheet.create({
  actionNotice: { alignSelf: 'center', backgroundColor: 'rgba(80, 80, 80, 0.94)', borderRadius: Radius.pill, marginTop: Spacing.three, maxWidth: '88%', paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  actionNoticeText: { color: 'white', textAlign: 'center' },
  headerButton: { alignItems: 'center', backgroundColor: 'rgba(72, 72, 72, 0.86)', borderRadius: Radius.pill, height: TouchTarget, justifyContent: 'center', width: TouchTarget },
  headerActions: { flexDirection: 'row', gap: Spacing.two, marginLeft: 'auto' },
  loading: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  playbackError: { ...StyleSheet.absoluteFill, alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.72)', justifyContent: 'center', padding: Spacing.four },
  playbackErrorText: { color: 'white', textAlign: 'center' },
  player: { borderRadius: Radius.medium, overflow: 'hidden' },
  playerBackdrop: { alignItems: 'stretch', backgroundColor: '#000000', flex: 1, justifyContent: 'flex-start', paddingHorizontal: Spacing.three },
  playerHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingBottom: Spacing.three, paddingHorizontal: Spacing.one },
  retryButton: { alignItems: 'center', backgroundColor: 'rgba(255, 255, 255, 0.22)', borderRadius: Radius.pill, marginTop: Spacing.three, minHeight: TouchTarget, justifyContent: 'center', minWidth: 112, paddingHorizontal: Spacing.three },
  retryText: { color: 'white' },
});
