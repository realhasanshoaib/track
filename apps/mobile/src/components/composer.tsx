import { memo, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type NativeSyntheticEvent,
  type TextInput,
  type TextInputSelectionChangeEventData,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import { useKeyboardState } from 'react-native-keyboard-controller';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
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
import { IOSGlassContainer, IOSGlassMaterial } from '@/components/ios-glass-material';
import { ChatPartEntering, ChatPartExiting, PendingMessageLayout } from '@/components/chat/message-motion';
import { MentionSuggestions } from '@/components/chat/mention-suggestions';
import { OptionsSheet, SheetNote, SheetRow } from '@/components/options-sheet';
import { PlatformIcon } from '@/components/platform-icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedTextInput } from '@/components/themed-text-input';
import type { DetailedMessage } from '@/components/thread-row';
import { MaxFontScale, Radius, Spacing, TouchTarget, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDuration } from '@/lib/attachment-presentation';
import { ComposerVisibleLineLimit, composerControlVisibility, composerInputMultilineThreshold, composerSurfaceBackgroundColor, composerTextMaxHeight } from '@/lib/composer-layout';
import type {
  ComposerSubmission,
  ComposerSubmissionResult,
  UploadableFile,
} from '@/lib/attachment-upload';
import { releasePreparedAttachment } from '@/lib/attachment-preview-flow';
import { hapticLight, hapticMedium } from '@/lib/haptics';
import {
  applyMention,
  filterMentionCandidates,
  findMentionQuery,
  type MentionCandidate,
} from '@/lib/mention-autocomplete';
import { useVoiceRecorder } from '@/lib/media-capture';
import { idempotencyKey } from '@/lib/idempotency';
import {
  nextVoiceGestureOutcome,
  shouldFinishVoiceOnRelease,
  VoiceGestureCancelDistance as CancelDistance,
  VoiceGestureLockDistance as LockDistance,
  type VoiceGestureOutcome,
} from '@/lib/voice-recording-gesture';
import type { Id } from '../../../../convex/_generated/dataModel';

export type ComposerProps = {
  actionNotice?: {
    actionLabel?: string;
    busy?: boolean;
    label: string;
    onAction?: () => void;
    tone?: 'neutral' | 'danger' | 'accent';
  };
  activeGroupName: string | null;
  /** Screen-level send activity, used for status feedback outside this composer. */
  busy: boolean;
  /**
   * Everyone who can be mentioned here, assistant included. Omitting it turns
   * the autocomplete off; mentions still send, they just are not suggested.
   */
  mentionCandidatesHasMore?: boolean;
  mentionCandidatesLoading?: boolean;
  mentionCandidates?: MentionCandidate[];
  expandOnKeyboard?: boolean;
  onLoadMoreMentionCandidates?: () => void;
  onCancelReply: () => void;
  onChangeText: (value: string) => void;
  onActivityChange?: (activity: 'typing' | 'attaching' | 'recording' | null) => void;
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
const ComposerVerticalChrome = Spacing.four + StyleSheet.hairlineWidth * 2;
const ComposerLayoutTransition = PendingMessageLayout;
const ComposerPartEntering = ChatPartEntering;
const ComposerPartExiting = ChatPartExiting;

type FailedSubmission = {
  attachments: PendingAttachment[];
  body: string;
  draftRevision: number;
  idempotencyKey: string;
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

function ComposerImpl({
  actionNotice,
  activeGroupName,
  mentionCandidatesHasMore = false,
  mentionCandidatesLoading = false,
  mentionCandidates = [],
  expandOnKeyboard = false,
  onCancelReply,
  onChangeText,
  onActivityChange,
  onExpandedChange,
  onFocus,
  onLoadMoreMentionCandidates,
  onSendMessage,
  replyTo,
  value,
}: ComposerProps) {
  const theme = useTheme();
  const { fontScale } = useWindowDimensions();
  const isIOS = Platform.OS === 'ios';
  const reducedMotion = useReducedMotion();
  // Text entry is a high-frequency interaction. On iOS, UIKit already
  // animates the keyboard; a 200 ms layout transition on each content-size
  // change makes the composer trail the text as lines wrap. Let the measured
  // TextInput height commit directly while retaining Android layout motion.
  const composerLayoutTransition = !isIOS && !reducedMotion
    ? ComposerLayoutTransition
    : undefined;
  const hasLiquidGlass = isIOS && safeGlassAvailable();
  const maxComposerTextHeight = composerTextMaxHeight(Typography.message.lineHeight, fontScale, MaxFontScale);
  const maxComposerHeight = maxComposerTextHeight + ComposerVerticalChrome;
  const keyboardVisible = useKeyboardState((state) => state.isVisible);
  const inputRef = useRef<TextInput>(null);
  const activeSubmissionsRef = useRef(new Set<string>());
  const cancelledAttachmentIdsRef = useRef(new Set<string>());
  const sendingRef = useRef(false);
  const sendingCountRef = useRef(0);
  const actionPillScale = useSharedValue(1);
  const actionPillOffset = useSharedValue(0);
  const actionPillOpacity = useSharedValue(1);
  const actionPillWasVisible = useRef(false);

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
  const [retryingFailure, setRetryingFailure] = useState(false);
  const [voiceActivationBlocked, setVoiceActivationBlocked] = useState(false);
  const [draftValue, setDraftValue] = useState(value);
  const draftRevisionRef = useRef(0);
  const voiceActivationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const replyToRef = useRef(replyTo);
  replyToRef.current = replyTo;
  const keyboardReady = inputFocused && keyboardVisible;
  // iOS needs the focused TextInput to keep its layout while the native
  // keyboard is presenting. Expanding the composer during that transition can
  // make UIKit drop focus before the person can type.
  const inputExpanded = expandOnKeyboard && !isIOS && keyboardReady;
  const scaledLineHeight = Math.ceil(Typography.message.lineHeight * Math.min(fontScale, MaxFontScale));
  // TextInput can report its old multiline content size after submit clears
  // the controlled value. Ignore that stale measurement for an empty draft
  // so the composer returns to one line in the same render as the send.
  const visibleMeasuredInputHeight = draftValue.length === 0 ? scaledLineHeight : measuredInputHeight;
  const inputMultiline = draftValue.includes('\n')
    || visibleMeasuredInputHeight > composerInputMultilineThreshold(Typography.message.lineHeight, Spacing.two);
  const explicitLineCount = Math.max(1, draftValue.split('\n').length);
  const explicitLineHeight = scaledLineHeight * explicitLineCount;
  const inputContentHeight = Math.min(maxComposerTextHeight, Math.max(scaledLineHeight, explicitLineHeight, visibleMeasuredInputHeight));
  const iosPillHeight = Math.min(
    maxComposerHeight,
    Math.max(56, inputContentHeight + ComposerVerticalChrome + (inputMultiline ? Spacing.two : 0)),
  );
  const hasActionNotice = Boolean(actionNotice);
  const noticeIsError = Boolean(notice && /could not|failed|exceeds|not sent/i.test(notice));
  const actionPillMotionStyle = useAnimatedStyle(() => ({
    opacity: actionPillOpacity.value,
    transform: [{ translateY: actionPillOffset.value }, { scale: actionPillScale.value }],
  }));

  useEffect(() => {
    const entering = hasActionNotice && !actionPillWasVisible.current;
    actionPillWasVisible.current = hasActionNotice;
    if (!entering || !isIOS || reducedMotion) {
      actionPillScale.value = 1;
      actionPillOffset.value = 0;
      actionPillOpacity.value = 1;
      return;
    }

    actionPillScale.value = 0.88;
    actionPillOffset.value = 7;
    actionPillOpacity.value = 0;
    actionPillScale.value = withSequence(
      withSpring(1.045, { dampingRatio: 0.68, duration: 230 }),
      withSpring(1, { dampingRatio: 0.86, duration: 180 }),
    );
    actionPillOffset.value = withSpring(0, { dampingRatio: 0.78, duration: 250 });
    actionPillOpacity.value = withTiming(1, { duration: 120 });
  }, [actionPillOffset, actionPillOpacity, actionPillScale, hasActionNotice, isIOS, reducedMotion]);

  useEffect(() => {
    setDraftValue(value);
  }, [value]);

  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice((current) => current === notice ? null : current), 4_000);
    return () => clearTimeout(timeout);
  }, [notice]);

  useEffect(() => () => {
    if (voiceActivationTimerRef.current !== null) clearTimeout(voiceActivationTimerRef.current);
  }, []);

  useEffect(() => {
    onExpandedChange?.(inputExpanded);
  }, [inputExpanded, onExpandedChange]);

  const voice = useVoiceRecorder({
    onCapture: handleCapture,
    onNotice: setNotice,
    onPermissionDenied: setMicrophoneCanAskAgain,
  });
  const mode = voice.mode;
  useEffect(() => {
    if (mode === 'recording' || mode === 'locked') onActivityChange?.('recording');
    else if (mode === 'idle') onActivityChange?.(null);
  }, [mode, onActivityChange]);

  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const outcome = useSharedValue<VoiceGestureOutcome>(0);
  const micScale = useSharedValue(1);

  const hasContent = Boolean(draftValue.trim()) || attachments.length > 0;
  const hasSendableContent = Boolean(draftValue.trim()) || attachments.length > 0;
  // A failed send stays in the retry pill, but it must not lock the composer:
  // people can write and send a fresh text while retrying the older item later.
  const canSend = hasSendableContent;
  const sendPending = false;
  const hasFailedSubmission = Boolean(failedSubmission);
  const attachmentsLocked = false;
  /** Keep the recording control mounted until the hold gesture has ended. */
  // Reserve the send action slot for every idle composer state so the input
  // never expands/contracts when typing starts or the keyboard changes state.
  const { sendAction: showSend, voiceControl: showInlineVoiceControl } = composerControlVisibility(mode, keyboardVisible, hasContent);

  function blockVoiceActivationForTransition() {
    setVoiceActivationBlocked(true);
    if (voiceActivationTimerRef.current !== null) clearTimeout(voiceActivationTimerRef.current);
    voiceActivationTimerRef.current = setTimeout(() => {
      voiceActivationTimerRef.current = null;
      setVoiceActivationBlocked(false);
    }, 240);
  }

  function cancelVoiceWithTransitionLock() {
    blockVoiceActivationForTransition();
    void voice.cancel().finally(blockVoiceActivationForTransition);
  }

  function finishVoiceWithTransitionLock() {
    blockVoiceActivationForTransition();
    void voice.finish().finally(blockVoiceActivationForTransition);
  }

  function releaseVoiceWithTransitionLock(outcomeValue: VoiceGestureOutcome) {
    if (shouldFinishVoiceOnRelease(mode, outcomeValue)) {
      blockVoiceActivationForTransition();
      void voice.finish().finally(blockVoiceActivationForTransition);
      return;
    }
    void voice.release(outcomeValue);
  }

  const mentionRange = mode === 'idle' ? findMentionQuery(draftValue, caret) : null;
  const mentions = mentionRange ? filterMentionCandidates(mentionCandidates, mentionRange.query) : [];

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
    // Progress is rendered in the optimistic message while sending. Updating
    // hidden composer chips would re-render the text input for every upload
    // event and makes typing feel sticky on large files.
    if (sendingRef.current) return;
    setAttachments((prev) => prev.map((item) => (item.id === id ? { ...item, progress } : item)));
  }

  function changeDraft(nextValue: string) {
    draftRevisionRef.current += 1;
    if (nextValue.length === 0) setMeasuredInputHeight(0);
    setDraftValue(nextValue);
    onChangeText(nextValue);
  }

  async function submit(
    files: PendingAttachment[],
    body: string,
    replyToMessageId = replyTo?.message._id,
    draftRevision = draftRevisionRef.current,
    retryTargetId: Id<'messages'> | null = null,
    retryKey?: string,
  ) {
    for (const file of files) cancelledAttachmentIdsRef.current.delete(file.id);
    const signature = JSON.stringify({
      attachmentIds: files.map((file) => file.id),
      body,
      draftRevision,
      replyToMessageId: replyToMessageId ?? null,
      retryMessageId: retryTargetId ?? null,
    });
    if (activeSubmissionsRef.current.has(signature)) return;
    activeSubmissionsRef.current.add(signature);
    const submissionKey = retryKey ?? idempotencyKey();
    const retainInputFocus = inputFocused || keyboardVisible;
    setNotice(null);
    sendingRef.current = true;
    sendingCountRef.current += 1;
    if (retryKey) setRetryingFailure(true);
    const replyId = replyToMessageId;
    const retryingAttachments = Boolean(retryTargetId);
    if (!retryingAttachments && draftRevisionRef.current === draftRevision) {
      // Keep the composer responsive while the optimistic bubble is sent.
      // Restore this exact draft if sending fails and the user hasn't typed again.
      setDraftValue('');
      setMeasuredInputHeight(0);
      onChangeText('');
    }
    if (!retryingAttachments && files.length > 0) {
      const submittedIds = new Set(files.map((file) => file.id));
      setAttachments((current) => current.filter((file) => !submittedIds.has(file.id)));
    }
    try {
      const result = await onSendMessage({
        attachments: files,
        body: retryingAttachments ? '' : body,
        idempotencyKey: submissionKey,
        messageId: retryTargetId,
        replyToMessageId: retryingAttachments ? undefined : replyToMessageId,
        reportProgress,
      });
      if (!result.messageId) throw new Error('message_send_without_id');
      if (!retryingAttachments && draftRevisionRef.current === draftRevision) {
        setDraftValue('');
        setMeasuredInputHeight(0);
        onChangeText('');
      }
      if (!retryingAttachments && replyId && replyToRef.current?.message._id === replyId) onCancelReply();
      if (result.failedIds.length === 0) {
        if (retryingAttachments) {
          setRetryMessageId(null);
          setFailedSubmission(null);
        }
        return;
      }
      if (retryingAttachments) setFailedSubmission(null);
      setRetryMessageId(result.messageId);
      setFailedSubmission({
        attachments: files.filter((file) => result.failedIds.includes(file.id)),
        body: '',
        draftRevision,
        idempotencyKey: submissionKey,
      });
      setNotice(result.failedIds.some((id) => result.failedReasons?.[id] === 'attachment_too_large')
        ? 'Attachment exceeds the 100 MiB limit. Remove it or choose a smaller file.'
        : 'Your message was sent. Retry the failed media when ready.');
    } catch (error) {
      const activeFiles = files.filter((file) => !cancelledAttachmentIdsRef.current.has(file.id));
      if (files.length > 0 && activeFiles.length === 0) {
        for (const file of files) releasePreparedAttachment(file.id);
        if (!retryingAttachments && draftRevisionRef.current === draftRevision) {
          setDraftValue(body);
          setMeasuredInputHeight(0);
          onChangeText(body);
        }
        setFailedSubmission(null);
        setNotice(null);
        return;
      }
      const attachmentTooLarge = error instanceof Error && error.message === 'attachment_too_large';
      if (attachmentTooLarge) {
        setNotice('Attachment exceeds the 100 MiB limit. Remove it or choose a smaller file.');
      }
      if (!retryingAttachments) {
        setRetryMessageId(null);
        setFailedSubmission({ attachments: activeFiles, body, draftRevision, idempotencyKey: submissionKey, replyToMessageId });
        if (!attachmentTooLarge) setNotice('Message not sent. Your draft is saved.');
      } else {
        if (!attachmentTooLarge) setNotice('Your message is sent. Retry the failed files or remove them.');
      }
    } finally {
      sendingCountRef.current = Math.max(0, sendingCountRef.current - 1);
      sendingRef.current = sendingCountRef.current > 0;
      if (retryKey) setRetryingFailure(false);
      blockVoiceActivationForTransition();
      activeSubmissionsRef.current.delete(signature);
      if (retainInputFocus) requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  function handleSend() {
    if (!canSend) return;
    blockVoiceActivationForTransition();
    hapticMedium();
    setCaret(0);
    const body = draftValue.trim();
    // The submitted draft and media move to their own optimistic row. New
    // content remains free to use this composer while the upload finishes.
    void submit(attachments, body, replyTo?.message._id, draftRevisionRef.current);
  }

  function handleSelectionChange(event: NativeSyntheticEvent<TextInputSelectionChangeEventData>) {
    const { end, start } = event.nativeEvent.selection;
    setCaret(start === end ? start : end);
    // The native side has taken the forced caret; hand selection back to it.
    if (selection) setSelection(null);
  }

  function insertMention(candidate: MentionCandidate) {
    if (!mentionRange) return;
    const next = applyMention(draftValue, mentionRange, candidate.handle);
            changeDraft(next.text);
    setCaret(next.caret);
    setSelection({ end: next.caret, start: next.caret });
    inputRef.current?.focus();
  }

  /** A finished recording joins the strip, then sends unless a write is in flight. */
  function handleCapture(file: UploadableFile) {
    const next = [...attachments, file];
    setAttachments(next);
    void submit(next, draftValue.trim(), replyTo?.message._id);
  }

  function openMicrophoneSettings() {
    setMicrophoneCanAskAgain(null);
    void Linking.openSettings().catch(() => {
      setNotice('Could not open device settings. Enable microphone access for Track in Settings.');
    });
  }

  const micPan = Gesture.Pan()
    .enabled(!hasFailedSubmission && !voiceActivationBlocked)
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
        scheduleOnRN(cancelVoiceWithTransitionLock);
      } else if (nextOutcome === 2) {
        scheduleOnRN(voice.lock);
      }
    })
    .onFinalize(() => {
      const settleDuration = reducedMotion ? 0 : 140;
      dragX.value = withTiming(0, { duration: settleDuration });
      dragY.value = withTiming(0, { duration: settleDuration });
      if (isIOS) micScale.value = withSpring(1, { dampingRatio: 0.8, duration: reducedMotion ? 0 : 200 });
      scheduleOnRN(releaseVoiceWithTransitionLock, outcome.value);
    });

  const micTap = Gesture.Tap()
    .enabled(!hasFailedSubmission && !voiceActivationBlocked)
    .onBegin(() => { if (isIOS) micScale.value = withSpring(0.96, { dampingRatio: 0.7, duration: reducedMotion ? 0 : 150 }); })
    .onEnd(() => {
      if (hasFailedSubmission) return;
      outcome.value = 2;
      if (mode === 'locked' || mode === 'recording') scheduleOnRN(finishVoiceWithTransitionLock);
      else if (mode === 'idle') scheduleOnRN(voice.start, true);
    })
    .onFinalize(() => { if (isIOS) micScale.value = withSpring(1, { dampingRatio: 0.8, duration: reducedMotion ? 0 : 200 }); });

  const voiceControl = <GestureDetector gesture={Gesture.Exclusive(micPan, micTap)}>
    <Animated.View
      testID="composer-voice-control"
      accessibilityActions={mode === 'idle'
        ? [{ name: 'activate', label: 'Start voice recording' }]
        : [{ name: 'activate', label: mode === 'locked' ? 'Send voice note' : 'Finish voice recording' }, { name: 'cancel', label: 'Discard voice note' }]}
      accessibilityHint={mode === 'idle'
        ? 'Hold to record, slide up to lock, slide left to cancel. Tap to record hands-free.'
        : mode === 'locked'
          ? 'Tap or activate to send this voice note. Use the cancel action to discard it.'
          : 'Recording voice note. Release to send, or use the cancel action to discard it.'}
      accessibilityLabel={mode === 'locked' ? 'Send voice note' : mode === 'recording' ? `Recording voice note, ${formatDuration(voice.durationMs)}` : 'Record a voice note'}
      accessibilityState={{ disabled: hasFailedSubmission || voiceActivationBlocked }}
      accessibilityRole="button"
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'cancel') cancelVoiceWithTransitionLock();
        else if (mode === 'idle') void voice.start(true);
        else finishVoiceWithTransitionLock();
      }}
      onAccessibilityTap={() => {
        if (mode === 'idle') void voice.start(true);
        else finishVoiceWithTransitionLock();
      }}
      style={[styles.voiceButton, Platform.OS === 'ios' && micPressStyle]}>
      <PlatformIcon
        color={mode === 'locked' ? theme.accent : mode === 'recording' ? theme.danger : theme.textSecondary}
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
          backgroundColor: composerSurfaceBackgroundColor(
            Platform.OS,
            theme.background,
            theme.background === '#1b1917' ? 'rgba(27,25,23,0.16)' : 'rgba(250,249,247,0.1)',
          ),
        },
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
        collapseSpacing={Spacing.two}
        disabled={false}
        items={attachments}
        onRemove={(id) => {
          cancelledAttachmentIdsRef.current.add(id);
          releasePreparedAttachment(id);
          const remaining = attachments.filter((item) => item.id !== id);
          // Removing the failed attachment is the user's cancellation. Drop its
          // stale send-error notice and unlock the preserved text draft.
          setNotice(null);
          setAttachments(remaining);
          setFailedSubmission((current) => {
            if (!current) return null;
            const retained = current.attachments.filter((item) => item.id !== id);
            return retained.length === 0 ? null : { ...current, attachments: retained };
          });
        }}
      />

      {actionNotice ? (
        <Animated.View
          accessibilityLiveRegion="polite"
          entering={reducedMotion ? undefined : ComposerPartEntering}
          layout={composerLayoutTransition}
          style={[
          styles.actionPill,
          actionPillMotionStyle,
          {
            backgroundColor: actionNotice.tone === 'danger'
              ? theme.dangerSoft
              : actionNotice.tone === 'accent'
                ? theme.accentSoft
              : isIOS
                ? 'transparent'
                : theme.backgroundElevated,
            borderColor: actionNotice.tone === 'danger' ? theme.danger : actionNotice.tone === 'accent' ? theme.accent : theme.hairline,
          },
        ]}>
          {isIOS && actionNotice.tone !== 'danger' && actionNotice.tone !== 'accent' ? <IOSGlassMaterial style={styles.actionPillMaterial} /> : null}
          <ThemedText numberOfLines={1} style={styles.actionPillLabel} themeColor={actionNotice.tone === 'danger' ? 'danger' : actionNotice.tone === 'accent' ? 'accentInk' : 'textSecondary'} type="caption">
            {actionNotice.label}
          </ThemedText>
          {actionNotice.actionLabel && actionNotice.onAction ? <Pressable
            accessibilityLabel={actionNotice.actionLabel}
            accessibilityRole="button"
            accessibilityState={{ disabled: actionNotice.busy }}
            disabled={actionNotice.busy}
            hitSlop={8}
            onPress={() => { hapticLight(); actionNotice.onAction?.(); }}
            style={({ pressed }) => [styles.actionPillButton, { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElevated, opacity: actionNotice.busy ? 0.55 : 1 }]}
          >
            <ThemedText type="captionBold">{actionNotice.actionLabel}</ThemedText>
          </Pressable> : null}
        </Animated.View>
      ) : null}

      {failedSubmission || retryMessageId ? (
        <View accessibilityLiveRegion="polite" style={[styles.failurePill, { backgroundColor: theme.dangerSoft, borderColor: theme.danger, bottom: TouchTarget + Spacing.six + (actionNotice ? 54 : 0) }]}>
          <ThemedText numberOfLines={1} style={styles.failureText} themeColor="danger" type="caption">
            {retryingFailure
              ? 'Retrying…'
              : notice?.startsWith('Attachment exceeds')
                ? 'Attachment exceeds 100 MiB'
                : failedSubmission ? 'Message not sent' : 'Media not sent'}
          </ThemedText>
          <Pressable
            accessibilityLabel={retryingFailure ? 'Retrying message' : 'Retry sending message'}
            accessibilityRole="button"
            accessibilityState={{ disabled: retryingFailure }}
            disabled={retryingFailure}
            onPress={() => {
              if (failedSubmission) {
                void submit(failedSubmission.attachments, failedSubmission.body, failedSubmission.replyToMessageId, failedSubmission.draftRevision, retryMessageId, failedSubmission.idempotencyKey);
              } else {
                void submit(attachments, '', undefined, draftRevisionRef.current);
              }
            }}
            style={({ pressed }) => [styles.retryNoticeButton, { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement, opacity: retryingFailure ? 0.5 : 1 }]}
          >
            <ThemedText type="captionBold">{retryingFailure ? 'Retrying' : 'Retry'}</ThemedText>
          </Pressable>
          <Pressable
            accessibilityLabel="Dismiss failed message"
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => {
              if (failedSubmission?.body && !draftValue.trim()) {
                changeDraft(failedSubmission.body);
              }
              for (const file of failedSubmission?.attachments ?? []) releasePreparedAttachment(file.id);
              setFailedSubmission(null);
              setRetryMessageId(null);
              setNotice(null);
              hapticLight();
            }}
            style={styles.dismissFailure}>
            <PlatformIcon color={theme.danger} name="close" size={16} />
          </Pressable>
        </View>
      ) : notice ? (
        <View accessibilityLiveRegion="polite" style={[styles.noticePill, { bottom: TouchTarget + Spacing.six + (actionNotice ? 54 : 0), backgroundColor: noticeIsError ? theme.dangerSoft : theme.accentSoft, borderColor: noticeIsError ? theme.danger : theme.accent }]}>
          <PlatformIcon color={noticeIsError ? theme.danger : theme.accentInk} name={noticeIsError ? 'alert-circle' : 'information-outline'} size={15} />
          <ThemedText style={styles.noticeText} themeColor={noticeIsError ? 'danger' : 'accentInk'} type="caption">
            {notice}
          </ThemedText>
        </View>
      ) : null}

      {inputExpanded ? <Animated.View
        entering={reducedMotion ? undefined : ComposerPartEntering}
        exiting={reducedMotion ? undefined : ComposerPartExiting}
        layout={composerLayoutTransition}
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
        layout={composerLayoutTransition}
        style={[styles.row, inputExpanded && styles.expandedRow, Platform.OS === 'ios' && styles.iosComposerShell, inputMultiline && styles.multilineRow]}
      >
        {mode !== 'idle' ? (
          <Animated.View
            accessibilityLabel={`Recording voice note, ${formatDuration(voice.durationMs)}`}
            accessibilityLiveRegion="polite"
            accessible
            entering={reducedMotion ? undefined : ComposerPartEntering}
            exiting={reducedMotion ? undefined : ComposerPartExiting}
            layout={composerLayoutTransition}
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
                onPress={cancelVoiceWithTransitionLock}
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
            layout={composerLayoutTransition}
            style={[
              styles.messageField,
              !isIOS && !inputExpanded && [styles.androidMessageField, { backgroundColor: theme.backgroundElement, borderColor: theme.homeBorder }],
              inputExpanded && styles.expandedMessageField,
              isIOS && styles.iosMessageField,
              !isIOS && inputMultiline && styles.multilineMessageField,
              !isIOS && inputMultiline && styles.androidMultilineMessageField,
            ]}
          >
            {Platform.OS === 'ios' ? <IOSGlassContainer spacing={Spacing.two} style={[styles.iosActionGroup, inputExpanded && styles.expandedActionGroup]}>
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
            </IOSGlassContainer> : <Animated.View layout={composerLayoutTransition} style={inputExpanded && styles.expandedActionButton}>
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
              layout={composerLayoutTransition}
              style={[styles.inputPill, { maxHeight: maxComposerHeight }, !isIOS && styles.androidInputPill, inputExpanded && styles.expandedInputPill, inputMultiline && styles.multilineInputPill, isIOS && styles.iosCenteredInputPill, isIOS && { height: iosPillHeight }, { borderColor: inputExpanded ? theme.accentStrong : theme.homeBorder }]}
            >
              {isIOS && hasLiquidGlass ? (
                <GlassView
                  colorScheme={theme.background === '#1b1917' ? 'dark' : 'light'}
                  glassEffectStyle="regular"
                  isInteractive={false}
                  pointerEvents="none"
                  style={[StyleSheet.absoluteFill, styles.inputPillGlass, inputMultiline && styles.multilineInputMaterial]}
                  tintColor={theme.backgroundElement}
                />
              ) : isIOS || inputExpanded ? (
                <View
                  pointerEvents="none"
                  style={[StyleSheet.absoluteFill, styles.inputPillFallback, inputMultiline && styles.multilineInputMaterial, { backgroundColor: theme.backgroundElement }]}
                />
              ) : null}
              <ThemedTextInput
                accessibilityLabel={`Message ${activeGroupName ?? 'channel'}`}
                accessibilityHint="Type @Track to ask Track in this Project."
                allowFontScaling
                cursorColor={theme.accent}
                keyboardAppearance={theme.background === '#1b1917' ? 'dark' : 'light'}
                maxLength={10_000}
                maxFontSizeMultiplier={MaxFontScale}
                multiline
                editable
                showSoftInputOnFocus
                onContentSizeChange={({ nativeEvent }) => {
                  // Preserve the natural content height: the composer grows to
                  // four lines, then the TextInput itself becomes scrollable.
                  const nextHeight = draftValue ? Math.ceil(nativeEvent.contentSize.height) : 0;
                  setMeasuredInputHeight((current) => current === nextHeight ? current : nextHeight);
                }}
                onChangeText={(next) => {
                  if (notice) setNotice(null);
                  // Typing always wins back the caret, even if no selection event lands.
                  if (selection) setSelection(null);
                  onActivityChange?.(next.trim() ? 'typing' : null);
                  changeDraft(next);
                }}
                onBlur={() => setInputFocused(false)}
                onFocus={() => {
                  setInputFocused(true);
                  onFocus?.();
                }}
                onSelectionChange={handleSelectionChange}
                ref={inputRef}
                selection={selection ?? undefined}
                selectionColor={theme.accent}
                selectionHandleColor={theme.accent}
                // Turn on native scrolling as soon as the four-line viewport
                // is full. iOS can clamp contentSize to maxHeight, so waiting
                // for a strictly larger measurement leaves overflow trapped.
                scrollEnabled={visibleMeasuredInputHeight >= maxComposerTextHeight || explicitLineCount > ComposerVisibleLineLimit}
                style={[
                  styles.input,
                  inputExpanded && styles.expandedInput,
                  inputMultiline && styles.multilineInput,
                  isIOS && styles.iosCenteredInput,
                  {
                    // On iOS, size the surrounding pill from the measured
                    // content and let UITextView fill it. Setting the same
                    // measured height on both the pill and UITextView can
                    // constrain UIKit to one line and suppress its next size
                    // change. Android needs an explicit input height to grow.
                    ...(isIOS ? {} : { height: inputMultiline ? inputContentHeight : 48 }),
                    color: theme.text,
                    maxHeight: maxComposerTextHeight,
                  },
                ]}
                value={draftValue}
              />
              <View pointerEvents="box-none" style={styles.inputContentOverlay}>
                {draftValue.length === 0 && !inputFocused ? <View pointerEvents="none" style={[styles.placeholderContainer, inputExpanded && styles.expandedPlaceholderContainer]}>
                  <ThemedText accessible={false} numberOfLines={1} style={styles.placeholderText} themeColor="textTertiary" type="small">Message or ask @Track</ThemedText>
                </View> : null}
              </View>
              {showInlineVoiceControl ? voiceControl : null}
            </Animated.View>
          </Animated.View>
        )}

        {showSend ? (
          <View style={styles.actionSlot}>
            <View style={styles.actionLayer}>
              <Pressable
                accessibilityLabel={sendPending && !hasSendableContent ? 'Sending message' : retryMessageId ? 'Retry failed attachments' : 'Send message'}
                accessibilityRole="button"
                accessibilityState={{ disabled: !canSend, busy: sendPending }}
                android_ripple={{ borderless: true, color: theme.backgroundSelected }}
                disabled={!canSend}
                hitSlop={6}
                onPress={handleSend}
                style={({ pressed }) => Platform.OS === 'ios'
                  ? [styles.circle, { backgroundColor: theme.accent, opacity: !canSend ? 0.72 : pressed ? 0.82 : 1, transform: [{ scale: pressed ? 0.96 : 1 }] }]
                  : [styles.circle, { backgroundColor: theme.accent, opacity: !canSend ? 0.72 : 1 }]}
              >
                <Animated.View style={styles.sendState}>
                  {sendPending && !hasSendableContent ? (
                    <ActivityIndicator
                      accessibilityLabel="Sending message"
                      accessibilityRole="progressbar"
                      color={theme.accentInk}
                      size="small"
                      testID="composer-send-progress"
                    />
                  ) : (
                    <PlatformIcon color={theme.accentInk} name="send" size={19} />
                  )}
                </Animated.View>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.actionSlot}>
            <View style={styles.actionLayer}>
              {mode === 'recording' ? (
                <Animated.View
                  pointerEvents="none"
                  style={[styles.lockChip, { backgroundColor: theme.backgroundSelected }, lockStyle]}>
                  <PlatformIcon color={theme.textSecondary} name="chevron-up" size={14} />
                </Animated.View>
              ) : null}
              {voiceControl}
            </View>
          </View>
        )}
      </Animated.View>

      <ChatAttachMenu
        onClose={() => setMenuOpen(false)}
        onError={setNotice}
        onPicked={(files: UploadableFile[]) => {
          onActivityChange?.('attaching');
          setAttachments((prev) => [...prev, ...files]);
        }}
        onPrepared={(prepared) => {
          // The upload pipeline awaits the same preparation promise. Avoid a
          // composer rerender while sending; it can hitch the focused input.
          if (sendingRef.current) return;
          setAttachments((prev) => prev.map((item) => item.id === prepared.id
            ? { ...item, ...prepared, failed: item.failed, progress: item.progress }
            : item));
        }}
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

export const Composer = memo(ComposerImpl);

const styles = StyleSheet.create({
  actionSlot: { height: TouchTarget, width: TouchTarget, flexShrink: 0 },
  actionLayer: { ...StyleSheet.absoluteFill },
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
  expandedMessageField: { alignItems: 'stretch', flex: 1, height: '100%', position: 'relative' },
  expandedRow: { alignItems: 'flex-end', flex: 1 },
  expandedSurface: { flex: 1 },
  androidInputPill: { backgroundColor: 'transparent', borderRadius: 0, borderWidth: 0 },
  androidMessageField: { borderCurve: 'continuous', borderRadius: Radius.pill, borderWidth: 1, paddingHorizontal: Spacing.one },
  androidMultilineMessageField: { borderRadius: Radius.large },
  multilineInput: { flex: 1, minHeight: 0, paddingBottom: 0, paddingTop: 0, textAlignVertical: 'center' },
  multilineInputMaterial: { borderRadius: Radius.large },
  multilineInputPill: { borderRadius: Radius.large, justifyContent: 'flex-start', paddingVertical: Spacing.two },
  multilineMessageField: { alignItems: 'flex-end' },
  multilineRow: { alignItems: 'flex-end' },
  input: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    position: 'relative',
    ...Typography.message,
    minHeight: 48,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.one,
    paddingBottom: Spacing.one,
    textAlign: 'left',
    textAlignVertical: 'center',
  },
  inputContentOverlay: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0, zIndex: 2 },
  iosCenteredInput: { alignSelf: 'center', flex: 1, minHeight: 0, paddingBottom: 0, paddingTop: 0, textAlignVertical: 'center' },
  iosCenteredInputPill: { justifyContent: 'center' },
  placeholderContainer: { bottom: 0, justifyContent: 'center', left: Spacing.three, position: 'absolute', right: TouchTarget + Spacing.two, top: 0 },
  expandedPlaceholderContainer: { justifyContent: 'flex-start', paddingTop: Spacing.three },
  placeholderText: { ...Typography.message },
  inputPill: {
    alignItems: 'stretch',
    borderCurve: 'continuous',
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    flexDirection: 'row',
    gap: Spacing.two,
    justifyContent: 'center',
    minHeight: 56,
    minWidth: 0,
    overflow: 'hidden',
  },
  inputPillFallback: { borderRadius: Radius.pill },
  inputPillGlass: { borderRadius: Radius.pill },
  iosComposerShell: {
    alignItems: 'center',
    minHeight: 60,
    paddingHorizontal: Spacing.three,
  },
  iosActionGroup: { alignItems: 'center', flexDirection: 'row', gap: Spacing.one },
  iosFallbackMaterial: { borderRadius: Radius.pill },
  iosGlassButton: { alignItems: 'center', borderRadius: Radius.pill, height: 42, justifyContent: 'center', overflow: 'hidden', width: 42 },
  iosGlassMaterial: { borderRadius: Radius.pill },
  iosInlineAttach: { height: TouchTarget - Spacing.two, width: TouchTarget - Spacing.two },
  iosMessageField: { borderRadius: 0, paddingHorizontal: 0 },
  inlineAttach: { alignItems: 'center', borderRadius: Radius.pill, height: 40, justifyContent: 'center', width: 40 },
  messageField: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: Radius.xlarge,
    flex: 1,
    flexShrink: 1,
    flexDirection: 'row',
    gap: Spacing.two,
    minHeight: TouchTarget,
    minWidth: 0,
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
  noticePill: { alignItems: 'center', alignSelf: 'center', borderCurve: 'continuous', borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: Spacing.two, maxWidth: '92%', minHeight: 38, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one, position: 'absolute', zIndex: 11 },
  failurePill: { alignItems: 'center', alignSelf: 'center', borderCurve: 'continuous', borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: Spacing.two, maxWidth: '92%', minHeight: 38, paddingHorizontal: Spacing.three, paddingVertical: Spacing.half, position: 'absolute', zIndex: 11 },
  failureText: { flexShrink: 1 },
  dismissFailure: { alignItems: 'center', justifyContent: 'center', minHeight: 28, minWidth: 28 },
  // Delete/retry feedback floats above the input instead of adding height to
  // the keyboard-sticky composer. Measuring this transient pill used to resize
  // the chat viewport and leave a blank strip while its exit state settled.
  actionPill: { alignItems: 'center', alignSelf: 'center', borderCurve: 'continuous', borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth, bottom: TouchTarget + Spacing.six, flexDirection: 'row', gap: Spacing.two, justifyContent: 'center', maxWidth: '92%', minHeight: 42, overflow: 'hidden', paddingLeft: Spacing.three, paddingRight: Spacing.one, paddingVertical: Spacing.one, position: 'absolute', zIndex: 10 },
  actionPillMaterial: { borderCurve: 'continuous', borderRadius: Radius.pill },
  actionPillLabel: { flexShrink: 1 },
  actionPillButton: { alignItems: 'center', borderRadius: Radius.pill, justifyContent: 'center', minHeight: 34, minWidth: 56, paddingHorizontal: Spacing.three },
  noticeText: { flex: 1 },
  retryNoticeButton: { alignItems: 'center', borderRadius: Radius.pill, justifyContent: 'center', minHeight: 28, minWidth: 52, paddingHorizontal: Spacing.three },
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
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  slideHint: { alignItems: 'center', flexDirection: 'row', gap: Spacing.one },
  sendState: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  surface: { gap: Spacing.two, paddingVertical: Spacing.two, position: 'relative' },
  iosSurface: { borderTopWidth: 0 },
  timer: { minWidth: 34 },
  voiceButton: { alignItems: 'center', alignSelf: 'center', flexShrink: 0, height: TouchTarget, justifyContent: 'center', width: TouchTarget, zIndex: 3 },
  wave: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 3 },
});
