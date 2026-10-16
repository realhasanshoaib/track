import { useEffect, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputSelectionChangeEventData,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  ChatAttachMenu,
  PendingAttachmentStrip,
  type PendingAttachment,
} from '@/components/chat-attach-menu';
import { MentionSuggestions } from '@/components/chat/mention-suggestions';
import { PlatformIcon } from '@/components/platform-icon';
import { ThemedText } from '@/components/themed-text';
import type { DetailedMessage } from '@/components/thread-row';
import { Colors, MaxFontScale, Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDuration } from '@/lib/attachment-presentation';
import type {
  ComposerSubmission,
  ComposerSubmissionResult,
  UploadableFile,
} from '@/lib/attachment-upload';
import { hapticLight, hapticMedium } from '@/lib/haptics';
import {
  applyMention,
  filterMentionCandidates,
  findMentionQuery,
  type MentionCandidate,
} from '@/lib/mention-autocomplete';
import { useVoiceRecorder } from '@/lib/media-capture';
import type { Id } from '../../../../convex/_generated/dataModel';

export type ComposerProps = {
  activeGroupName: string | null;
  /** Screen-level busy flag; disables sending while another write is in flight. */
  busy: boolean;
  /**
   * Everyone who can be mentioned here. Omitting it turns
   * the autocomplete off; mentions still send, they just are not suggested.
   */
  mentionCandidatesHasMore?: boolean;
  mentionCandidatesLoading?: boolean;
  mentionCandidates?: MentionCandidate[];
  onLoadMoreMentionCandidates?: () => void;
  onCancelReply: () => void;
  onChangeText: (value: string) => void;
  onFocus?: () => void;
  /**
   * Sends body and attachments together. Resolve with the ids that failed so the
   * composer can keep them for a retry, plus the message they were attached to.
   */
  onSendMessage: (submission: ComposerSubmission) => Promise<ComposerSubmissionResult>;
  replyTo: DetailedMessage | null;
  value: string;
};

const HoldDelay = 220;
const CancelDistance = -90;
const LockDistance = -64;
/** Ink on the accent fill: the light-theme ink clears AA on yellow in both themes. */
const AccentInk = Colors.light.text;
const BarFactors = [0.5, 0.85, 1, 0.7, 0.45];

function RecordingDot({ color }: { color: string }) {
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.25, { duration: 700 }), -1, true);
  }, [opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[styles.dot, { backgroundColor: color }, style]} />;
}

function LevelBar({ color, index, level }: { color: string; index: number; level: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({
    transform: [{ scaleY: 0.18 + level.value * BarFactors[index] }],
  }));
  return <Animated.View style={[styles.bar, { backgroundColor: color }, style]} />;
}

export function Composer({
  activeGroupName,
  busy,
  mentionCandidatesHasMore = false,
  mentionCandidatesLoading = false,
  mentionCandidates = [],
  onCancelReply,
  onChangeText,
  onFocus,
  onLoadMoreMentionCandidates,
  onSendMessage,
  replyTo,
  value,
}: ComposerProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const keyboard = useReanimatedKeyboardAnimation();
  const inputRef = useRef<TextInput>(null);

  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [caret, setCaret] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [retryMessageId, setRetryMessageId] = useState<Id<'messages'> | null>(null);
  /** Set for one commit after inserting a mention, to place the caret after it. */
  const [selection, setSelection] = useState<{ end: number; start: number } | null>(null);
  const [sending, setSending] = useState(false);

  const voice = useVoiceRecorder({ onCapture: handleCapture, onNotice: setNotice });
  const mode = voice.mode;

  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const outcome = useSharedValue(0);

  const hasContent = Boolean(value.trim()) || attachments.length > 0;
  const canSend = hasContent && !sending && !busy;
  /** While holding the mic the control must not swap out from under the finger. */
  const showSend = mode === 'locked' || (mode === 'idle' && (hasContent || sending));

  const mentionRange = mode === 'idle' ? findMentionQuery(value, caret) : null;
  const mentions = mentionRange ? filterMentionCandidates(mentionCandidates, mentionRange.query) : [];

  const surfaceStyle = useAnimatedStyle(() => ({
    // Spacing.three keeps the bar off the screen edge on devices that report
    // no bottom inset; the keyboard height wins while it is open.
    paddingBottom: Math.max(insets.bottom + Spacing.two, Spacing.three, -keyboard.height.value),
  }));
  const cancelHintStyle = useAnimatedStyle(() => ({
    opacity: 1 + dragX.value / CancelDistance / 2,
    transform: [{ translateX: dragX.value / 2 }],
  }));
  const lockStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, dragY.value / LockDistance + 0.4),
    transform: [{ translateY: dragY.value / 2 }],
  }));

  function reportProgress(id: string, progress: number) {
    setAttachments((prev) => prev.map((item) => (item.id === id ? { ...item, progress } : item)));
  }

  async function submit(files: PendingAttachment[], body: string) {
    setNotice(null);
    setSending(true);
    const request = onSendMessage({ attachments: files, body, messageId: retryMessageId, reportProgress });
    onChangeText('');
    if (replyTo) onCancelReply();
    try {
      const result = await request;
      if (result.failedIds.length === 0) {
        setAttachments([]);
        setRetryMessageId(null);
        return;
      }
      setRetryMessageId(result.messageId);
      setAttachments((prev) =>
        prev
          .filter((item) => result.failedIds.includes(item.id))
          .map((item) => ({ ...item, failed: true, progress: 0 })),
      );
      setNotice('Some files did not upload. Send again to retry them.');
    } catch {
      if (files.length === 0) onChangeText(body);
      setAttachments((prev) => prev.map((item) => ({ ...item, failed: true, progress: 0 })));
      setNotice('Message not sent. Check your connection and try again.');
    } finally {
      setSending(false);
    }
  }

  function handleSend() {
    if (!canSend) return;
    hapticMedium();
    setCaret(0);
    void submit(attachments, value.trim());
  }

  function handleSelectionChange(event: NativeSyntheticEvent<TextInputSelectionChangeEventData>) {
    const { end, start } = event.nativeEvent.selection;
    setCaret(start === end ? start : end);
    // The native side has taken the forced caret; hand selection back to it.
    if (selection) setSelection(null);
  }

  function insertMention(candidate: MentionCandidate) {
    if (!mentionRange) return;
    const next = applyMention(value, mentionRange, candidate.handle);
    onChangeText(next.text);
    setCaret(next.caret);
    setSelection({ end: next.caret, start: next.caret });
    inputRef.current?.focus();
  }

  /** A finished recording joins the strip, then sends unless a write is in flight. */
  function handleCapture(file: UploadableFile) {
    const next = [...attachments, file];
    setAttachments(next);
    if (!busy && !sending) void submit(next, value.trim());
  }

  const micPan = Gesture.Pan()
    .activateAfterLongPress(HoldDelay)
    .onStart(() => {
      outcome.value = 0;
      runOnJS(voice.start)(false);
    })
    .onUpdate((event) => {
      if (outcome.value !== 0) return;
      dragX.value = Math.min(0, event.translationX);
      dragY.value = Math.min(0, event.translationY);
      if (event.translationX <= CancelDistance) {
        outcome.value = 1;
        runOnJS(voice.cancel)();
      } else if (event.translationY <= LockDistance) {
        outcome.value = 2;
        runOnJS(voice.lock)();
      }
    })
    .onFinalize(() => {
      dragX.value = withTiming(0, { duration: 140 });
      dragY.value = withTiming(0, { duration: 140 });
      runOnJS(voice.release)(outcome.value);
    });

  const micTap = Gesture.Tap().onEnd(() => {
    outcome.value = 2;
    runOnJS(voice.start)(true);
  });

  return (
    <Animated.View
      style={[
        styles.surface,
        { backgroundColor: theme.background, borderTopColor: theme.hairline },
        surfaceStyle,
      ]}>
      <MentionSuggestions
        canLoadMore={Boolean(mentionRange) && mentionCandidatesHasMore}
        candidates={mentions}
        loadingMore={Boolean(mentionRange) && mentionCandidatesLoading}
        onLoadMore={onLoadMoreMentionCandidates}
        onSelect={insertMention}
      />

      {replyTo ? (
        <View style={[styles.reply, { backgroundColor: theme.backgroundElement }]}>
          <View style={[styles.replyAccent, { backgroundColor: theme.accent }]} />
          <View style={styles.replyBody}>
            <ThemedText themeColor="textSecondary" type="captionBold">
              Replying to {replyTo.author?.displayName ?? 'Member'}
            </ThemedText>
            <ThemedText numberOfLines={1} themeColor="textSecondary" type="caption">
              {replyTo.message.body}
            </ThemedText>
          </View>
          <Pressable
            accessibilityLabel="Cancel reply"
            accessibilityRole="button"
            hitSlop={14}
            onPress={() => {
              hapticLight();
              onCancelReply();
            }}>
            <PlatformIcon color={theme.textSecondary} name="close" size={18} />
          </Pressable>
        </View>
      ) : null}

      <PendingAttachmentStrip
        items={attachments}
        onRemove={(id) => setAttachments((prev) => prev.filter((item) => item.id !== id))}
      />

      {notice ? (
        <View accessibilityLiveRegion="polite" style={styles.notice}>
          <PlatformIcon color={theme.textSecondary} name="information-outline" size={14} />
          <ThemedText style={styles.noticeText} themeColor="textSecondary" type="caption">
            {notice}
          </ThemedText>
        </View>
      ) : null}

      <View style={styles.row}>
        {mode !== 'idle' ? (
          <View
            accessibilityLabel={`Recording voice note, ${formatDuration(voice.durationMs)}`}
            accessibilityLiveRegion="polite"
            accessible
            style={[styles.recordBar, { backgroundColor: theme.backgroundElement }]}>
            <RecordingDot color={theme.danger} />
            <ThemedText style={styles.timer} themeColor="danger" type="captionBold">
              {formatDuration(voice.durationMs)}
            </ThemedText>
            <View style={styles.wave}>
              {BarFactors.map((_, index) => (
                <LevelBar color={theme.textSecondary} index={index} key={index} level={voice.level} />
              ))}
            </View>
            {mode === 'locked' ? (
              <Pressable
                accessibilityLabel="Discard voice note"
                accessibilityRole="button"
                hitSlop={10}
                onPress={() => void voice.cancel()}
                style={styles.recordAction}>
                <ThemedText themeColor="danger" type="captionBold">Cancel</ThemedText>
              </Pressable>
            ) : (
              <Animated.View style={[styles.slideHint, cancelHintStyle]}>
                <PlatformIcon color={theme.textSecondary} name="arrow-left" size={14} />
                <ThemedText themeColor="textSecondary" type="caption">Slide to cancel</ThemedText>
              </Animated.View>
            )}
          </View>
        ) : (
          <>
            <Pressable
              accessibilityLabel="Add an attachment"
              accessibilityRole="button"
              android_ripple={{ borderless: true, color: theme.backgroundSelected }}
              hitSlop={6}
              onPress={() => {
                hapticLight();
                setMenuOpen(true);
              }}
              style={[styles.circle, { backgroundColor: theme.backgroundElement }]}>
              <PlatformIcon color={theme.textSecondary} name="paperclip" size={20} />
            </Pressable>
            <TextInput
              accessibilityLabel={`Message ${activeGroupName ?? 'channel'}`}
              allowFontScaling
              cursorColor={theme.accent}
              maxFontSizeMultiplier={MaxFontScale}
              multiline
              onChangeText={(next) => {
                if (notice) setNotice(null);
                // Typing always wins back the caret, even if no selection event lands.
                if (selection) setSelection(null);
                onChangeText(next);
              }}
              onFocus={onFocus}
              onSelectionChange={handleSelectionChange}
              placeholder="Message"
              placeholderTextColor={theme.textTertiary}
              ref={inputRef}
              selection={selection ?? undefined}
              selectionColor={theme.accent}
              selectionHandleColor={theme.accent}
              style={[styles.input, { backgroundColor: theme.backgroundElement, color: theme.text }]}
              value={value}
            />
          </>
        )}

        {showSend ? (
          <Pressable
            accessibilityLabel={mode === 'locked' ? 'Send voice note' : 'Send message'}
            accessibilityRole="button"
            accessibilityState={{ disabled: mode !== 'locked' && !canSend }}
            android_ripple={{ borderless: true, color: theme.backgroundSelected }}
            disabled={mode !== 'locked' && !canSend}
            hitSlop={6}
            onPress={() => (mode === 'locked' ? void voice.finish() : handleSend())}
            style={[
              styles.circle,
              { backgroundColor: theme.accent, opacity: mode !== 'locked' && !canSend ? 0.5 : 1 },
            ]}>
            <PlatformIcon color={AccentInk} name="send" size={19} />
          </Pressable>
        ) : (
          <View>
            {mode === 'recording' ? (
              <Animated.View
                pointerEvents="none"
                style={[styles.lockChip, { backgroundColor: theme.backgroundSelected }, lockStyle]}>
                <PlatformIcon color={theme.textSecondary} name="chevron-up" size={14} />
              </Animated.View>
            ) : null}
            <GestureDetector gesture={Gesture.Exclusive(micPan, micTap)}>
              <View
                accessibilityHint="Hold to record, slide up to lock, slide left to cancel. Tap to record hands-free."
                accessibilityLabel="Record a voice note"
                accessibilityRole="button"
                style={[
                  styles.circle,
                  { backgroundColor: mode === 'recording' ? theme.dangerSoft : theme.backgroundElement },
                ]}>
                <PlatformIcon
                  color={mode === 'recording' ? theme.danger : theme.textSecondary}
                  name="microphone-outline"
                  size={20}
                />
              </View>
            </GestureDetector>
          </View>
        )}
      </View>

      <ChatAttachMenu
        onClose={() => setMenuOpen(false)}
        onPicked={(files: UploadableFile[]) => setAttachments((prev) => [...prev, ...files])}
        visible={menuOpen}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: { borderRadius: Radius.small, height: 18, width: 3 },
  circle: {
    alignItems: 'center',
    borderRadius: Radius.pill,
    height: TouchTarget,
    justifyContent: 'center',
    width: TouchTarget,
  },
  dot: { borderRadius: Radius.pill, height: 9, width: 9 },
  input: {
    borderRadius: Radius.xlarge,
    flex: 1,
    fontSize: 16,
    lineHeight: 21,
    maxHeight: 120,
    minHeight: TouchTarget,
    paddingHorizontal: Spacing.three,
    paddingVertical: Platform.OS === 'ios' ? 11 : 8,
  },
  lockChip: {
    alignItems: 'center',
    alignSelf: 'center',
    borderRadius: Radius.pill,
    bottom: TouchTarget + Spacing.two,
    height: 30,
    justifyContent: 'center',
    position: 'absolute',
    width: 30,
  },
  notice: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two, paddingHorizontal: Spacing.three },
  noticeText: { flex: 1 },
  recordAction: { minHeight: TouchTarget, justifyContent: 'center' },
  recordBar: {
    alignItems: 'center',
    borderRadius: Radius.xlarge,
    flex: 1,
    flexDirection: 'row',
    gap: Spacing.two,
    minHeight: TouchTarget,
    paddingHorizontal: Spacing.three,
  },
  reply: {
    alignItems: 'center',
    borderRadius: Radius.medium,
    flexDirection: 'row',
    gap: Spacing.two,
    marginHorizontal: Spacing.three,
    padding: Spacing.two,
  },
  replyAccent: { alignSelf: 'stretch', borderRadius: Radius.small, width: 3 },
  replyBody: { flex: 1, gap: 1 },
  row: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  slideHint: { alignItems: 'center', flexDirection: 'row', gap: Spacing.one },
  surface: {
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: Spacing.two,
    paddingTop: Spacing.two,
  },
  timer: { minWidth: 34 },
  wave: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 3 },
});
