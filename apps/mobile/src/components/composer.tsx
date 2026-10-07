import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type NativeSyntheticEvent,
  type TextInput,
  type TextInputSelectionChangeEventData,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { GlassContainer, GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import { useKeyboardState, useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  FadeOutUp,
  LinearTransition,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import {
  ChatAttachMenu,
  PendingAttachmentStrip,
  type PendingAttachment,
} from '@/components/chat-attach-menu';
import { MentionSuggestions } from '@/components/chat/mention-suggestions';
import { OptionsSheet, SheetNote, SheetRow } from '@/components/options-sheet';
import { PlatformIcon } from '@/components/platform-icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedTextInput } from '@/components/themed-text-input';
import type { DetailedMessage } from '@/components/thread-row';
import { MaxFontScale, Radius, Spacing, TouchTarget, Typography } from '@/constants/theme';
import { useBottomTabBarInset } from '@/hooks/use-bottom-tab-inset';
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
import {
  nextVoiceGestureOutcome,
  VoiceGestureCancelDistance as CancelDistance,
  VoiceGestureLockDistance as LockDistance,
  type VoiceGestureOutcome,
} from '@/lib/voice-recording-gesture';
import type { Id } from '../../../../convex/_generated/dataModel';

export type ComposerProps = {
  activeGroupName: string | null;
  /** Screen-level busy flag; disables sending while another write is in flight. */
  busy: boolean;
  /**
   * Everyone who can be mentioned here, assistant included. Omitting it turns
   * the autocomplete off; mentions still send, they just are not suggested.
   */
  mentionCandidatesHasMore?: boolean;
  mentionCandidatesLoading?: boolean;
  mentionCandidates?: MentionCandidate[];
  onLoadMoreMentionCandidates?: () => void;
  onCancelReply: () => void;
  onChangeText: (value: string) => void;
  onExpandedChange?: (expanded: boolean) => void;
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
const BarFactors = [0.5, 0.85, 1, 0.7, 0.45];
const ComposerLayoutTransition = LinearTransition.duration(200);
const ComposerPartEntering = FadeInDown.duration(150);
const ComposerPartExiting = FadeOutUp.duration(120);
const SendStateEntering = FadeIn.duration(110);
const SendStateExiting = FadeOut.duration(80);

type FailedSubmission = {
  attachments: PendingAttachment[];
  body: string;
  draftRevision: number;
  replyToMessageId?: Id<'messages'>;
};

function safeGlassAvailable() {
  try {
    return isGlassEffectAPIAvailable();
  } catch {
    return false;
  }
}

function RecordingDot({ color }: { color: string }) {
  const reducedMotion = useReducedMotion();
  const opacity = useSharedValue(1);
  useEffect(() => {
    if (reducedMotion) {
      cancelAnimation(opacity);
      opacity.value = 1;
      return;
    }
    opacity.value = withRepeat(withTiming(0.25, { duration: 700 }), -1, true);
    return () => cancelAnimation(opacity);
  }, [opacity, reducedMotion]);
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
  onExpandedChange,
  onFocus,
  onLoadMoreMentionCandidates,
  onSendMessage,
  replyTo,
  value,
}: ComposerProps) {
  const theme = useTheme();
  const isIOS = Platform.OS === 'ios';
  const hasLiquidGlass = isIOS && safeGlassAvailable();
  const bottomTabBarInset = useBottomTabBarInset();
  const keyboardVisible = useKeyboardState((state) => state.isVisible);
  const keyboard = useReanimatedKeyboardAnimation();
  const reducedMotion = useReducedMotion();
  const inputRef = useRef<TextInput>(null);

  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [caret, setCaret] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [inputFocused, setInputFocused] = useState(false);
  const [measuredInputHeight, setMeasuredInputHeight] = useState(0);
  const [microphoneCanAskAgain, setMicrophoneCanAskAgain] = useState<boolean | null>(null);
  const [retryMessageId, setRetryMessageId] = useState<Id<'messages'> | null>(null);
  const [failedSubmission, setFailedSubmission] = useState<FailedSubmission | null>(null);
  /** Set for one commit after inserting a mention, to place the caret after it. */
  const [selection, setSelection] = useState<{ end: number; start: number } | null>(null);
  const [sending, setSending] = useState(false);
  const draftRevisionRef = useRef(0);
  const replyToRef = useRef(replyTo);
  replyToRef.current = replyTo;
  const keyboardReady = inputFocused && keyboardVisible;
  // iOS needs the focused TextInput to keep its layout while the native
  // keyboard is presenting. Expanding the composer during that transition can
  // make UIKit drop focus before the person can type.
  const inputExpanded = !isIOS && keyboardReady;
  const iosInputHeight = Math.min(120, Math.max(36, measuredInputHeight));
  const iosPillHeight = Math.min(120, Math.max(56, measuredInputHeight + 16));

  useEffect(() => {
    onExpandedChange?.(inputExpanded);
    if (keyboardReady) onFocus?.();
  }, [inputExpanded, keyboardReady, onExpandedChange, onFocus]);

  const voice = useVoiceRecorder({
    onCapture: handleCapture,
    onNotice: setNotice,
    onPermissionDenied: setMicrophoneCanAskAgain,
  });
  const mode = voice.mode;

  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const outcome = useSharedValue<VoiceGestureOutcome>(0);
  const micScale = useSharedValue(1);

  const hasContent = Boolean(value.trim()) || attachments.length > 0;
  const canSend = hasContent && !sending && !busy && !failedSubmission;
  const hasFailedSubmission = Boolean(failedSubmission);
  const attachmentsLocked = sending || Boolean(failedSubmission) || Boolean(retryMessageId);
  /** Keep the recording control mounted until the hold gesture has ended. */
  const showSend = mode === 'idle' && (hasContent || sending);

  const mentionRange = mode === 'idle' ? findMentionQuery(value, caret) : null;
  const mentions = mentionRange ? filterMentionCandidates(mentionCandidates, mentionRange.query) : [];

  const surfaceStyle = useAnimatedStyle(() => ({
    // The tab navigator owns the closed-keyboard safe area. The composer owns
    // only its visual padding and the live keyboard displacement.
    paddingBottom: Math.max(Spacing.three, -keyboard.height.value),
  }));
  const cancelHintStyle = useAnimatedStyle(() => ({
    opacity: 1 + dragX.value / CancelDistance / 2,
    transform: [{ translateX: dragX.value / 2 }],
  }));
  const lockStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, dragY.value / LockDistance + 0.4),
    transform: [{ translateY: dragY.value / 2 }],
  }));
  const micPressStyle = useAnimatedStyle(() => ({ transform: [{ scale: micScale.value }] }));

  function reportProgress(id: string, progress: number) {
    setAttachments((prev) => prev.map((item) => (item.id === id ? { ...item, progress } : item)));
  }

  function changeDraft(nextValue: string) {
    draftRevisionRef.current += 1;
    onChangeText(nextValue);
  }

  async function submit(
    files: PendingAttachment[],
    body: string,
    replyToMessageId = replyTo?.message._id,
    draftRevision = draftRevisionRef.current,
  ) {
    setNotice(null);
    setSending(true);
    const replyId = replyToMessageId;
    const retryingAttachments = Boolean(retryMessageId);
    try {
      const result = await onSendMessage({
        attachments: files,
        body: retryingAttachments ? '' : body,
        messageId: retryMessageId,
        replyToMessageId: retryingAttachments ? undefined : replyToMessageId,
        reportProgress,
      });
      if (!result.messageId) throw new Error('message_send_without_id');
      if (!retryingAttachments && draftRevisionRef.current === draftRevision) changeDraft('');
      if (!retryingAttachments && replyId && replyToRef.current?.message._id === replyId) onCancelReply();
      if (result.failedIds.length === 0) {
        setAttachments([]);
        setRetryMessageId(null);
        setFailedSubmission(null);
        return;
      }
      setFailedSubmission(null);
      setRetryMessageId(result.messageId);
      setAttachments((prev) =>
        prev
          .filter((item) => result.failedIds.includes(item.id))
          .map((item) => ({ ...item, failed: true, progress: 0 })),
      );
      setNotice('Your message was sent. Retry or remove the failed files before writing another message.');
    } catch {
      setAttachments((prev) => prev.map((item) => ({ ...item, failed: true, progress: 0 })));
      if (!retryingAttachments) {
        setFailedSubmission({ attachments: files, body, draftRevision, replyToMessageId });
        setNotice('Message not sent. Your draft is saved.');
      } else {
        setNotice('Your message is sent. Retry the failed files or remove them.');
      }
    } finally {
      setSending(false);
    }
  }

  function handleSend() {
    if (!canSend) return;
    hapticMedium();
    setCaret(0);
    void submit(attachments, retryMessageId ? '' : value.trim(), replyTo?.message._id);
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
            changeDraft(next.text);
    setCaret(next.caret);
    setSelection({ end: next.caret, start: next.caret });
    inputRef.current?.focus();
  }

  /** A finished recording joins the strip, then sends unless a write is in flight. */
  function handleCapture(file: UploadableFile) {
    if (failedSubmission) return;
    const next = [...attachments, file];
    setAttachments(next);
    if (!busy && !sending) void submit(next, value.trim(), replyTo?.message._id);
  }

  function openMicrophoneSettings() {
    setMicrophoneCanAskAgain(null);
    void Linking.openSettings().catch(() => {
      setNotice('Could not open device settings. Enable microphone access for Track in Settings.');
    });
  }

  const micPan = Gesture.Pan()
    .enabled(!hasFailedSubmission)
    .activateAfterLongPress(HoldDelay)
    .onStart(() => {
      if (mode !== 'idle' || hasFailedSubmission) return;
      outcome.value = 0;
      if (isIOS) micScale.value = withSpring(0.96, { dampingRatio: 0.7, duration: reducedMotion ? 0 : 150 });
      scheduleOnRN(voice.start, false);
    })
    .onUpdate((event) => {
      const nextOutcome = nextVoiceGestureOutcome(outcome.value, event.translationX, event.translationY);
      if (nextOutcome === outcome.value) {
        if (outcome.value === 0) {
          dragX.value = Math.min(0, event.translationX);
          dragY.value = Math.min(0, event.translationY);
        }
        return;
      }
      dragX.value = Math.min(0, event.translationX);
      dragY.value = Math.min(0, event.translationY);
      outcome.value = nextOutcome;
      if (nextOutcome === 1) {
        scheduleOnRN(voice.cancel);
      } else if (nextOutcome === 2) {
        scheduleOnRN(voice.lock);
      }
    })
    .onFinalize(() => {
      const settleDuration = reducedMotion ? 0 : 140;
      dragX.value = withTiming(0, { duration: settleDuration });
      dragY.value = withTiming(0, { duration: settleDuration });
      if (isIOS) micScale.value = withSpring(1, { dampingRatio: 0.8, duration: reducedMotion ? 0 : 200 });
      scheduleOnRN(voice.release, outcome.value);
    });

  const micTap = Gesture.Tap()
    .enabled(!hasFailedSubmission)
    .onBegin(() => { if (isIOS) micScale.value = withSpring(0.96, { dampingRatio: 0.7, duration: reducedMotion ? 0 : 150 }); })
    .onEnd(() => {
      if (hasFailedSubmission) return;
      outcome.value = 2;
      if (mode === 'locked') scheduleOnRN(voice.finish);
      else if (mode === 'idle') scheduleOnRN(voice.start, true);
    })
    .onFinalize(() => { if (isIOS) micScale.value = withSpring(1, { dampingRatio: 0.8, duration: reducedMotion ? 0 : 200 }); });

  const voiceControl = <GestureDetector gesture={Gesture.Exclusive(micPan, micTap)}>
    <Animated.View
      accessibilityActions={mode === 'idle'
        ? [{ name: 'activate', label: 'Start voice recording' }]
        : [{ name: 'activate', label: mode === 'locked' ? 'Send voice note' : 'Finish voice recording' }, { name: 'cancel', label: 'Discard voice note' }]}
      accessibilityHint={mode === 'idle'
        ? 'Hold to record, slide up to lock, slide left to cancel. Tap to record hands-free.'
        : mode === 'locked'
          ? 'Tap or activate to send this voice note. Use the cancel action to discard it.'
          : 'Recording voice note. Release to send, or use the cancel action to discard it.'}
      accessibilityLabel={mode === 'locked' ? 'Send voice note' : mode === 'recording' ? `Recording voice note, ${formatDuration(voice.durationMs)}` : 'Record a voice note'}
      accessibilityState={{ disabled: hasFailedSubmission }}
      accessibilityRole="button"
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'cancel') void voice.cancel();
        else if (mode === 'idle') void voice.start(true);
        else void voice.finish();
      }}
      onAccessibilityTap={() => {
        if (mode === 'idle') void voice.start(true);
        else void voice.finish();
      }}
      style={[styles.circle, Platform.OS === 'ios' && styles.iosMicButton, Platform.OS === 'ios' && micPressStyle,
        { backgroundColor: mode === 'locked' ? theme.accent : mode === 'recording' ? theme.dangerSoft : theme.backgroundElement },
      ]}>
      {Platform.OS === 'ios' ? hasLiquidGlass ? <GlassView colorScheme={theme.background === '#1b1917' ? 'dark' : 'light'} glassEffectStyle="regular" isInteractive={false} pointerEvents="none" style={[StyleSheet.absoluteFill, styles.iosGlassMaterial]} tintColor={mode === 'locked' ? theme.accent : mode === 'recording' ? theme.dangerSoft : theme.backgroundElement} /> : <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.iosFallbackMaterial, { backgroundColor: mode === 'locked' ? theme.accent : mode === 'recording' ? theme.dangerSoft : theme.backgroundSelected }]} /> : null}
      <PlatformIcon
        color={mode === 'locked' ? theme.accentInk : mode === 'recording' ? theme.danger : theme.textSecondary}
        name={mode === 'locked' ? 'send' : 'waveform'}
        size={20}
      />
    </Animated.View>
  </GestureDetector>;

  return (
    <Animated.View
      style={[
        styles.surface,
        inputExpanded && styles.expandedSurface,
        Platform.OS === 'ios' && styles.iosSurface,
        {
          backgroundColor: theme.background === '#1b1917' ? 'rgba(27,25,23,0.16)' : 'rgba(250,249,247,0.1)',
          marginBottom: keyboardVisible ? 0 : bottomTabBarInset,
        },
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
            <View style={styles.replyLabelRow}>
              <ThemedText themeColor="textSecondary" type="caption">Replying to</ThemedText>
              <View style={[styles.replyAuthorPill, { backgroundColor: theme.backgroundSelected }]}>
                <ThemedText numberOfLines={1} type="captionBold">{replyTo.author?.displayName ?? 'Member'}</ThemedText>
              </View>
            </View>
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
        disabled={sending || Boolean(failedSubmission)}
        items={attachments}
        onRemove={(id) => {
          if (attachments.length === 1 && retryMessageId) setRetryMessageId(null);
          setAttachments((prev) => prev.filter((item) => item.id !== id));
        }}
      />

      {failedSubmission ? (
        <View accessibilityLiveRegion="polite" style={styles.notice}>
          <PlatformIcon color={theme.danger} name="alert-circle" size={14} />
          <ThemedText style={styles.noticeText} themeColor="danger" type="caption">Message not sent. Your draft is saved.</ThemedText>
          <Pressable
            accessibilityLabel={sending ? 'Retrying saved message' : 'Retry sending saved message'}
            accessibilityRole="button"
            accessibilityState={{ disabled: sending || busy }}
            disabled={sending || busy}
            onPress={() => void submit(failedSubmission.attachments, failedSubmission.body, failedSubmission.replyToMessageId, failedSubmission.draftRevision)}
            style={({ pressed }) => [styles.retryNoticeButton, { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement, opacity: sending || busy ? 0.5 : 1 }]}
          >
            <ThemedText type="captionBold">{sending ? 'Sending' : 'Retry'}</ThemedText>
          </Pressable>
        </View>
      ) : notice ? (
        <View accessibilityLiveRegion="polite" style={styles.notice}>
          <PlatformIcon color={theme.textSecondary} name="information-outline" size={14} />
          <ThemedText style={styles.noticeText} themeColor="textSecondary" type="caption">
            {notice}
          </ThemedText>
        </View>
      ) : null}

      {inputExpanded ? <Animated.View
        entering={reducedMotion ? undefined : ComposerPartEntering}
        exiting={reducedMotion ? undefined : ComposerPartExiting}
        layout={reducedMotion ? undefined : ComposerLayoutTransition}
        style={styles.expandedHeader}
      >
        <View style={styles.expandedHeaderCopy}>
          <ThemedText type="smallBold">New message</ThemedText>
          <ThemedText numberOfLines={1} themeColor="textSecondary" type="caption">{activeGroupName ? `#${activeGroupName}` : 'Channel'}</ThemedText>
        </View>
        <Pressable accessibilityLabel="Close expanded composer" accessibilityRole="button" onPress={() => inputRef.current?.blur()} style={({ pressed }) => [styles.expandedClose, { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement }]}>
          <PlatformIcon color={theme.textSecondary} name="chevron-down" size={20} />
        </Pressable>
      </Animated.View> : null}

      <Animated.View
        layout={reducedMotion ? undefined : ComposerLayoutTransition}
        style={[styles.row, inputExpanded && styles.expandedRow, Platform.OS === 'ios' && styles.iosComposerShell]}
      >
        {mode !== 'idle' ? (
          <Animated.View
            accessibilityLabel={`Recording voice note, ${formatDuration(voice.durationMs)}`}
            accessibilityLiveRegion="polite"
            accessible
            entering={reducedMotion ? undefined : ComposerPartEntering}
            exiting={reducedMotion ? undefined : ComposerPartExiting}
            layout={reducedMotion ? undefined : ComposerLayoutTransition}
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
          </Animated.View>
        ) : (
          <Animated.View
            layout={reducedMotion ? undefined : ComposerLayoutTransition}
            style={[styles.messageField, inputExpanded && styles.expandedMessageField, Platform.OS === 'ios' && styles.iosMessageField]}
          >
            {Platform.OS === 'ios' ? <GlassContainer spacing={Spacing.two} style={[styles.iosActionGroup, inputExpanded && styles.expandedActionGroup]}>
              <Pressable
                accessibilityLabel="Add to message"
                accessibilityRole="button"
                accessibilityState={{ disabled: attachmentsLocked }}
                disabled={attachmentsLocked}
                hitSlop={6}
                onPress={() => { hapticLight(); setMenuOpen(true); }}
                style={({ pressed }) => [styles.iosGlassButton, { opacity: pressed ? 0.78 : 1, transform: [{ scale: pressed ? 0.96 : 1 }] }]}>
                {hasLiquidGlass ? <GlassView colorScheme={theme.background === '#1b1917' ? 'dark' : 'light'} glassEffectStyle="regular" isInteractive={false} pointerEvents="none" style={[StyleSheet.absoluteFill, styles.iosGlassMaterial]} tintColor={theme.backgroundElement} /> : <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.iosFallbackMaterial, { backgroundColor: theme.backgroundSelected }]} />}
                <PlatformIcon color={theme.textSecondary} name="plus" size={19} />
              </Pressable>
            </GlassContainer> : <Animated.View layout={reducedMotion ? undefined : ComposerLayoutTransition} style={inputExpanded && styles.expandedActionButton}>
              <Pressable
                accessibilityLabel="Add a photo or document"
                accessibilityRole="button"
                android_ripple={{ borderless: true, color: theme.backgroundSelected }}
                disabled={attachmentsLocked}
                hitSlop={6}
                onPress={() => { hapticLight(); setMenuOpen(true); }}
                style={[styles.circle, { backgroundColor: theme.backgroundElement }]}
              >
                <PlatformIcon color={theme.textSecondary} name="plus" size={20} />
              </Pressable>
            </Animated.View>}
            <Animated.View
              layout={reducedMotion ? undefined : ComposerLayoutTransition}
              style={[styles.inputPill, inputExpanded && styles.expandedInputPill, isIOS && { height: iosPillHeight }, { borderColor: inputExpanded ? theme.accentStrong : theme.homeBorder, paddingRight: !showSend ? TouchTarget + Spacing.one : 0 }]}
            >
              {Platform.OS === 'ios' && hasLiquidGlass ? (
                <GlassView
                  colorScheme={theme.background === '#1b1917' ? 'dark' : 'light'}
                  glassEffectStyle="regular"
                  isInteractive={false}
                  pointerEvents="none"
                  style={[StyleSheet.absoluteFill, styles.inputPillGlass]}
                  tintColor={theme.backgroundElement}
                />
              ) : (
                <View
                  pointerEvents="none"
                  style={[StyleSheet.absoluteFill, styles.inputPillFallback, { backgroundColor: theme.backgroundElement }]}
                />
              )}
              <ThemedTextInput
                accessibilityLabel={`Message ${activeGroupName ?? 'channel'}`}
                accessibilityHint="Type @Track to ask Track in this Project."
                allowFontScaling
                cursorColor={theme.accent}
                keyboardAppearance={theme.background === '#1b1917' ? 'dark' : 'light'}
                maxLength={10_000}
                maxFontSizeMultiplier={MaxFontScale}
                multiline
                editable={!retryMessageId}
                showSoftInputOnFocus
                onContentSizeChange={isIOS ? ({ nativeEvent }) => {
                  const nextHeight = Math.ceil(nativeEvent.contentSize.height);
                  setMeasuredInputHeight((current) => current === nextHeight ? current : nextHeight);
                } : undefined}
                onChangeText={(next) => {
                  if (notice) setNotice(null);
                  // Typing always wins back the caret, even if no selection event lands.
                  if (selection) setSelection(null);
                  changeDraft(next);
                }}
                onBlur={() => setInputFocused(false)}
                onFocus={() => {
                  setInputFocused(true);
                }}
                onSelectionChange={handleSelectionChange}
                ref={inputRef}
                selection={selection ?? undefined}
                selectionColor={theme.accent}
                selectionHandleColor={theme.accent}
                style={[styles.input, isIOS && styles.iosCenteredInput, isIOS && { height: iosInputHeight }, inputExpanded && styles.expandedInput, { color: theme.text }]}
                value={value}
              />
              {value.length === 0 ? <View pointerEvents="none" style={[styles.placeholderContainer, inputExpanded && styles.expandedPlaceholderContainer]}>
                <ThemedText accessible={false} numberOfLines={1} style={styles.placeholderText} themeColor="textTertiary" type="small">Message or ask @Track</ThemedText>
              </View> : null}
              {!showSend && mode === 'idle' ? <View style={[styles.inlineVoiceOverlay, inputExpanded && styles.expandedVoiceOverlay]}>
                {voiceControl}
              </View> : null}
            </Animated.View>
          </Animated.View>
        )}

        {showSend ? (
          <Animated.View
            entering={reducedMotion ? undefined : FadeIn.duration(130)}
            exiting={reducedMotion ? undefined : FadeOut.duration(90)}
            layout={reducedMotion ? undefined : ComposerLayoutTransition}
          >
            <Pressable
              accessibilityLabel={sending ? 'Sending message' : retryMessageId ? 'Retry failed attachments' : 'Send message'}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSend, busy: sending }}
              android_ripple={{ borderless: true, color: theme.backgroundSelected }}
              disabled={!canSend}
              hitSlop={6}
              onPress={handleSend}
              style={({ pressed }) => Platform.OS === 'ios'
                ? [styles.circle, { backgroundColor: theme.accent, opacity: !canSend ? 0.5 : pressed ? 0.82 : 1, transform: [{ scale: pressed ? 0.96 : 1 }] }]
                : [styles.circle, { backgroundColor: theme.accent, opacity: !canSend ? 0.5 : 1 }]}
            >
              <Animated.View
                key={sending ? 'sending' : 'ready'}
                entering={reducedMotion ? undefined : SendStateEntering}
                exiting={reducedMotion ? undefined : SendStateExiting}
                style={styles.sendState}
              >
                {sending ? <ActivityIndicator color={theme.accentInk} size="small" /> : <PlatformIcon color={theme.accentInk} name="send" size={19} />}
              </Animated.View>
            </Pressable>
          </Animated.View>
        ) : mode !== 'idle' ? (
          <View>
            {mode === 'recording' ? (
              <Animated.View
                pointerEvents="none"
                style={[styles.lockChip, { backgroundColor: theme.backgroundSelected }, lockStyle]}>
                <PlatformIcon color={theme.textSecondary} name="chevron-up" size={14} />
              </Animated.View>
            ) : null}
            {voiceControl}
          </View>
        ) : null}
      </Animated.View>

      <ChatAttachMenu
        onClose={() => setMenuOpen(false)}
        onError={setNotice}
        onPicked={(files: UploadableFile[]) => setAttachments((prev) => [...prev, ...files])}
        visible={menuOpen}
      />

      <OptionsSheet
        onClose={() => setMicrophoneCanAskAgain(null)}
        title="Microphone access needed"
        visible={microphoneCanAskAgain !== null}
      >
        <SheetNote state="error">
          Track isn’t allowed to use the microphone, so voice messages can’t record.
        </SheetNote>
        {microphoneCanAskAgain ? (
          <SheetRow
            detail="Allow microphone access to record a voice message."
            icon="microphone-outline"
            label="Try again"
            onPress={() => {
              setMicrophoneCanAskAgain(null);
              void voice.start(true);
            }}
          />
        ) : (
          <SheetRow
            detail="Enable microphone access for Track in your device settings, then try again."
            icon="tune"
            label="Open device settings"
            onPress={openMicrophoneSettings}
          />
        )}
        <SheetRow
          icon="close"
          label="Not now"
          onPress={() => setMicrophoneCanAskAgain(null)}
        />
      </OptionsSheet>
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
  expandedActionButton: { bottom: Spacing.two, left: Spacing.two, position: 'absolute', zIndex: 2 },
  expandedActionGroup: { bottom: Spacing.two, left: Spacing.two, position: 'absolute', zIndex: 2 },
  expandedClose: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.pill, height: TouchTarget, justifyContent: 'center', width: TouchTarget },
  expandedHeader: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two, justifyContent: 'space-between', paddingHorizontal: Spacing.four, paddingVertical: Spacing.two },
  expandedHeaderCopy: { flex: 1, gap: Spacing.half, minWidth: 0 },
  expandedInput: { maxHeight: undefined, minHeight: 0, paddingBottom: Spacing.two, paddingHorizontal: Spacing.three, paddingTop: Spacing.three, textAlignVertical: 'top' },
  expandedInputPill: { borderRadius: Radius.large, flex: 1, minHeight: 0 },
  expandedVoiceOverlay: { bottom: Spacing.two, top: undefined },
  expandedMessageField: { alignItems: 'stretch', flex: 1, height: '100%', position: 'relative' },
  expandedRow: { alignItems: 'flex-end', flex: 1 },
  expandedSurface: { flex: 1 },
  input: {
    flex: 1,
    ...Typography.message,
    maxHeight: 120,
    minHeight: 48,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.one,
    paddingBottom: Spacing.one,
    textAlign: 'left',
    textAlignVertical: 'center',
  },
  iosCenteredInput: { flex: 0, minHeight: 0, paddingBottom: 0, paddingTop: 0 },
  inlineVoiceOverlay: { bottom: 0, justifyContent: 'center', position: 'absolute', right: Spacing.one, top: 0, zIndex: 2 },
  placeholderContainer: { bottom: 0, justifyContent: 'center', left: Spacing.three, position: 'absolute', right: TouchTarget + Spacing.two, top: 0 },
  expandedPlaceholderContainer: { justifyContent: 'flex-start', paddingTop: Spacing.three },
  placeholderText: { ...Typography.message },
  inputPill: {
    alignItems: 'stretch',
    borderCurve: 'continuous',
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    justifyContent: 'center',
    minHeight: 56,
    overflow: 'hidden',
  },
  inputPillFallback: { borderRadius: Radius.pill },
  inputPillGlass: { borderRadius: Radius.pill },
  iosComposerShell: {
    alignItems: 'center',
    marginHorizontal: Spacing.three,
    minHeight: 60,
    paddingHorizontal: Spacing.one,
  },
  iosActionGroup: { alignItems: 'center', flexDirection: 'row', gap: Spacing.one },
  iosFallbackMaterial: { borderRadius: Radius.pill },
  iosGlassButton: { alignItems: 'center', borderRadius: Radius.pill, height: 42, justifyContent: 'center', overflow: 'hidden', width: 42 },
  iosGlassMaterial: { borderRadius: Radius.pill },
  iosInlineAttach: { height: TouchTarget - Spacing.two, width: TouchTarget - Spacing.two },
  iosMicButton: { overflow: 'hidden' },
  iosMessageField: { borderRadius: 0, paddingHorizontal: 0 },
  inlineAttach: { alignItems: 'center', borderRadius: Radius.pill, height: 40, justifyContent: 'center', width: 40 },
  messageField: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: Radius.xlarge,
    flex: 1,
    flexDirection: 'row',
    gap: Spacing.two,
    minHeight: TouchTarget,
    paddingLeft: Spacing.one,
    paddingRight: Spacing.one,
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
  retryNoticeButton: { alignItems: 'center', borderRadius: Radius.pill, justifyContent: 'center', minHeight: TouchTarget, minWidth: TouchTarget, paddingHorizontal: Spacing.three },
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
  replyAuthorPill: { borderRadius: Radius.pill, flexShrink: 1, paddingHorizontal: Spacing.two, paddingVertical: 3 },
  replyBody: { flex: 1, gap: 1 },
  replyLabelRow: { alignItems: 'center', flexDirection: 'row', gap: Spacing.one, minWidth: 0 },
  row: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: Spacing.two,
    paddingLeft: Spacing.four,
    paddingRight: Spacing.three,
  },
  slideHint: { alignItems: 'center', flexDirection: 'row', gap: Spacing.one },
  sendState: { alignItems: 'center', height: 24, justifyContent: 'center', width: 24 },
  surface: { gap: Spacing.two, paddingTop: Spacing.two },
  iosSurface: { borderTopWidth: 0 },
  timer: { minWidth: 34 },
  wave: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 3 },
});
