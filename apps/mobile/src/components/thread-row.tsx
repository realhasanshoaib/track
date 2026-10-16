import { parseMentions } from '@track/shared';
import type { FunctionReturnType } from 'convex/server';
import { memo, useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { interpolate, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { api } from '../../../../convex/_generated/api';
import type { Doc, Id } from '../../../../convex/_generated/dataModel';
import { AssistantMessage } from '@/components/chat/assistant-message';
import { MessageBubble } from '@/components/chat/message-bubble';
import type { DetailedMessage } from '@/components/chat/types';
import type { MessageAction } from '@/components/message-actions';
import { PlatformIcon } from '@/components/platform-icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { messageSwipeCancelIntent, messageSwipeIntent } from '@/lib/message-swipe';
import { hapticLight } from '@/lib/haptics';
import { hasPlayableAudioAttachment } from '@/lib/attachment-presentation';

export type { AttachmentWithUrl, DetailedMessage } from '@/components/chat/types';

export type ThreadItem =
  | { kind: 'message'; key: string; at: number; item: DetailedMessage }
  | { kind: 'assistant'; key: string; at: number; stream: Doc<'assistantStreams'> };

export type GroupedThreadItem =
  | { kind: 'message'; key: string; at: number; item: DetailedMessage; isFirstInGroup: boolean }
  | { kind: 'assistant'; key: string; at: number; stream: Doc<'assistantStreams'>; isFirstInGroup: boolean }
  | { kind: 'date-sep'; key: string; at: number; label: string };

export type ProjectMemberRow = FunctionReturnType<typeof api.mobile.listProjectMembersPage>['page'][number];

const SWIPE_LIMIT = 72;
const SWIPE_THRESHOLD = 56;
const SWIPE_ACTIVATION_DISTANCE = 16;
const SWIPE_VERTICAL_FAILURE_DISTANCE = 14;
const SWIPE_ACTION_WIDTH = TouchTarget;
const SWIPE_ACTION_GAP = Spacing.one;
const SWIPE_ACTION_ENTER_OFFSET = 24;

type Props = {
  highlighted?: boolean;
  item: Exclude<GroupedThreadItem, { kind: 'date-sep' }>;
  isFirstInGroup: boolean;
  isOwnMessage?: boolean;
  contextActions?: MessageAction[];
  onLongPress: () => void;
  /** Opens the source of a forwarded snapshot when still authorized. */
  onOpenForwardSource?: () => void;
  /** Opens the Channel thread attached to this message. */
  onOpenThread?: () => void;
  /** Jumps to the message this one quotes. */
  onPressReply?: () => void;
  onSwipeReply?: () => void;
  onSwipeForward?: () => void;
  onSwipeReport?: () => void;
  readReceipts?: { recipientCount: number; readThroughSequences: number[] };
  selected?: boolean;
  selectionMode?: boolean;
  onPressMessage?: (item: GroupedThreadItem) => void;
  variant?: 'conversation' | 'thread';
};

export const ThreadRow = memo(function ThreadRow({
  highlighted = false,
  item,
  isFirstInGroup,
  isOwnMessage,
  contextActions,
  onLongPress,
  onOpenForwardSource,
  onOpenThread,
  onPressReply,
  onSwipeReply,
  onSwipeForward,
  onSwipeReport,
  readReceipts,
  selected = false,
  selectionMode = false,
  onPressMessage,
  variant = 'conversation',
}: Props) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const [actionsExposed, setActionsExposed] = useState(false);
  const actionWidth = useSharedValue(0);
  const replyProgress = useSharedValue(0);
  const trayOpenAtStart = useSharedValue(false);
  useEffect(() => {
    if (!selectionMode) return;
    actionWidth.value = 0;
    replyProgress.value = 0;
    setActionsExposed(false);
  }, [actionWidth, replyProgress, selectionMode]);
  const hasSwipeActions = item.kind === 'message' && Boolean(onSwipeForward && onSwipeReport);
  const inlinePlayback = item.kind === 'message' && !item.item.message.deletedAt
    && hasPlayableAudioAttachment(item.item.attachments);
  const readReceipt = item.kind === 'message' && isOwnMessage
    ? {
        readCount: readReceipts?.readThroughSequences.filter((sequence) =>
          sequence >= (item.item.message.channelSequence ?? Number.MAX_SAFE_INTEGER),
        ).length ?? 0,
        recipientCount: readReceipts?.recipientCount ?? 0,
      }
    : undefined;
  const messageBubble = item.kind === 'message' ? <MessageBubble
    highlighted={highlighted}
    isFirstInGroup={isFirstInGroup}
    isOwnMessage={Boolean(isOwnMessage)}
    message={item.item}
    readReceipt={readReceipt}
    selected={selected}
    selectionMode={selectionMode}
    contextActions={selectionMode ? undefined : contextActions}
    onLongPress={Platform.OS === 'android' || (Platform.OS === 'ios' && contextActions?.length && !inlinePlayback) ? undefined : onLongPress}
    onPressSelection={onPressMessage ? () => onPressMessage(item) : undefined}
    onOpenForwardSource={onOpenForwardSource}
    onForwardMedia={onSwipeForward}
    onOpenThread={onOpenThread}
    onPressReply={onPressReply}
    timeLabel={fmtTime(item.item.message.createdAt)}
  /> : null;
  const assistantBubble = item.kind === 'assistant' ? <AssistantMessage
    isFirstInGroup={isFirstInGroup}
    onLongPress={Platform.OS === 'android' ? undefined : onLongPress}
    stream={item.stream}
    timeLabel={fmtTime(item.stream.createdAt)}
  /> : null;
  const messageContent = messageBubble ?? assistantBubble;

  const gesture = Gesture.Pan()
    .enabled(!selectionMode && Boolean(onSwipeReply || hasSwipeActions))
    .activeOffsetX([-SWIPE_ACTIVATION_DISTANCE, SWIPE_ACTIVATION_DISTANCE])
    .failOffsetY([-SWIPE_VERTICAL_FAILURE_DISTANCE, SWIPE_VERTICAL_FAILURE_DISTANCE])
    .onBegin(() => {
      trayOpenAtStart.value = actionWidth.value >= SWIPE_ACTION_WIDTH - 1;
    })
    .onUpdate((e) => {
      const actionDistance = -e.translationX;
      if (trayOpenAtStart.value) {
        actionWidth.value = Math.min(SWIPE_ACTION_WIDTH, Math.max(0, SWIPE_ACTION_WIDTH + actionDistance));
        replyProgress.value = 0;
      } else if (actionDistance > 0 && hasSwipeActions) {
        actionWidth.value = Math.min(actionDistance, SWIPE_ACTION_WIDTH);
        replyProgress.value = 0;
      } else if (actionDistance < 0) {
        actionWidth.value = 0;
        replyProgress.value = onSwipeReply ? Math.min(-actionDistance, SWIPE_LIMIT) : 0;
      } else {
        actionWidth.value = 0;
        replyProgress.value = 0;
      }
    })
    .onEnd((e) => {
      const intent = messageSwipeIntent(e.translationX, Boolean(onSwipeReply), hasSwipeActions, trayOpenAtStart.value);
      if (intent === 'open-menu') {
        scheduleOnRN(setActionsExposed, false);
        actionWidth.value = reducedMotion ? 0 : withSpring(0, { damping: 20 });
        scheduleOnRN(onLongPress);
      } else if (intent === 'actions') {
        scheduleOnRN(hapticLight);
        scheduleOnRN(setActionsExposed, true);
        actionWidth.value = reducedMotion ? SWIPE_ACTION_WIDTH : withSpring(SWIPE_ACTION_WIDTH, { damping: 22, stiffness: 240 });
      } else if (intent === 'reply' && onSwipeReply) {
        scheduleOnRN(setActionsExposed, false);
        scheduleOnRN(onSwipeReply);
        actionWidth.value = reducedMotion ? 0 : withSpring(0, { damping: 20 });
      } else {
        scheduleOnRN(setActionsExposed, false);
        actionWidth.value = reducedMotion ? 0 : withSpring(0, { damping: 20 });
      }
      replyProgress.value = reducedMotion ? 0 : withSpring(0, { damping: 20 });
    })
    .onFinalize((event, success) => {
      // A tap fails the pan recognizer. Keep an exposed tray available so its
      // button can receive the tap instead of closing before onPress runs.
      if (success || Math.abs(event.translationX) < 10) return;
      const intent = messageSwipeCancelIntent(trayOpenAtStart.value);
      const shouldKeepActionsOpen = intent === 'actions';
      scheduleOnRN(setActionsExposed, shouldKeepActionsOpen);
      actionWidth.value = reducedMotion
        ? shouldKeepActionsOpen ? SWIPE_ACTION_WIDTH : 0
        : withSpring(shouldKeepActionsOpen ? SWIPE_ACTION_WIDTH : 0, { damping: 20 });
      replyProgress.value = reducedMotion ? 0 : withSpring(0, { damping: 20 });
    });

  const longPressGesture = Gesture.LongPress()
    .enabled(!selectionMode && Platform.OS === 'android')
    .minDuration(500)
    .maxDistance(16)
    .onStart(() => scheduleOnRN(onLongPress));
  const rowGesture = Platform.OS === 'android' ? Gesture.Race(gesture, longPressGesture) : gesture;

  const replyIconStyle = useAnimatedStyle(() => ({
    opacity: interpolate(replyProgress.value, [0, SWIPE_THRESHOLD], [0, 1], 'clamp'),
    transform: [{ scale: interpolate(replyProgress.value, [0, SWIPE_THRESHOLD], [0.7, 1], 'clamp') }],
  }));
  const actionsStyle = useAnimatedStyle(() => ({
    opacity: interpolate(actionWidth.value, [0, SWIPE_ACTION_WIDTH], [0, 1], 'clamp'),
    transform: [{ translateX: interpolate(actionWidth.value, [0, SWIPE_ACTION_WIDTH], [SWIPE_ACTION_ENTER_OFFSET, 0], 'clamp') }],
  }));
  const messageSwipeStyle = useAnimatedStyle(() => ({
    transform: [{
      translateX: selectionMode ? 0 : -actionWidth.value - interpolate(actionWidth.value, [0, SWIPE_ACTION_WIDTH], [0, SWIPE_ACTION_GAP], 'clamp'),
    }],
  }));
  const actionTray = !selectionMode && hasSwipeActions ? <Animated.View
    accessibilityElementsHidden={!actionsExposed}
    accessibilityLabel="Message actions"
    importantForAccessibility={actionsExposed ? 'auto' : 'no-hide-descendants'}
    pointerEvents={actionsExposed ? 'auto' : 'none'}
    style={[styles.messageActions, actionsStyle]}
  >
    <Pressable accessibilityHint="Opens the available actions for this message" accessibilityLabel="More message actions" accessibilityRole="button" onPress={() => {
      setActionsExposed(false);
      actionWidth.value = reducedMotion ? 0 : withSpring(0, { damping: 20 });
      onLongPress();
    }} style={({ pressed }) => [styles.swipeAction, { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElevated, borderColor: theme.hairline }]}>
      <PlatformIcon color={theme.accentStrong} name="dots-horizontal" size={19} weight="regular" />
    </Pressable>
  </Animated.View> : null;

  return (
    <GestureDetector gesture={rowGesture}>
      <View style={styles.swipeContainer}>
        <Animated.View style={[styles.replyHint, replyIconStyle]}>
          <View style={[styles.replyHintBadge, { backgroundColor: theme.backgroundElevated, borderColor: theme.hairline }]}>
            <PlatformIcon color={theme.textSecondary} name="reply" size={16} />
          </View>
        </Animated.View>
        <View style={styles.messageAndActions}>
          {actionTray}
          <Animated.View pointerEvents="box-none" style={[
          styles.messageContent,
          messageSwipeStyle,
          isFirstInGroup ? (variant === 'thread' ? styles.threadGroupStart : styles.groupStart) : styles.grouped,
        ]}>
          {messageContent}
          </Animated.View>
        </View>
      </View>
    </GestureDetector>
  );
}, areThreadRowPropsEqual);

function areThreadRowPropsEqual(previous: Props, next: Props) {
  if (!previous.selectionMode || !next.selectionMode) return false;
  return previous.item === next.item
    && previous.highlighted === next.highlighted
    && previous.isFirstInGroup === next.isFirstInGroup
    && previous.isOwnMessage === next.isOwnMessage
    && previous.readReceipts === next.readReceipts
    && previous.selected === next.selected
    && previous.selectionMode === next.selectionMode
    && previous.onPressMessage === next.onPressMessage
    && previous.variant === next.variant;
}

export function DateSeparator({ label }: { label: string }) {
  const theme = useTheme();
  return (
    <View style={styles.dateSep}>
      <View style={[styles.dateSepPill, { backgroundColor: theme.backgroundElement, borderColor: theme.hairline }]}>
        <ThemedText themeColor="textSecondary" type="captionBold">
          {label}
        </ThemedText>
      </View>
    </View>
  );
}

export function fmtTime(ts: number) {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', hourCycle: 'h23', minute: '2-digit' }).format(ts);
}

export function resolveMentionIds(body: string, members: ProjectMemberRow[]) {
  return resolveMentionMembers(body, members).map((member) => member.userId);
}

export function resolveMentionProjectMemberIds(body: string, members: ProjectMemberRow[]) {
  return resolveMentionMembers(body, members).map((member) => member.projectMemberId);
}

function resolveMentionMembers(body: string, members: ProjectMemberRow[]) {
  const tokens = parseMentions(body).filter((t) => t !== 'track');
  if (!tokens.length) return [];
  const tokenSet = new Set(tokens.map(norm));
  const matches = new Map<string, Array<{ projectMemberId: Id<'projectMembers'>; userId: Id<'users'> }>>();
  for (const { membership, user } of members) {
    if (!user) continue;
    const keys = new Set([norm(user.displayName)]);
    for (const key of keys) {
      if (!tokenSet.has(key)) continue;
      matches.set(key, [
        ...(matches.get(key) ?? []),
        { projectMemberId: membership._id, userId: user._id },
      ]);
    }
  }
  const resolved = new Map<string, { projectMemberId: Id<'projectMembers'>; userId: Id<'users'> }>();
  for (const candidates of matches.values()) {
    if (candidates.length === 1) resolved.set(String(candidates[0].projectMemberId), candidates[0]);
  }
  return [...resolved.values()];
}

function norm(v: string) {
  return v.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
}

const styles = StyleSheet.create({
  dateSep: {
    alignSelf: 'stretch',
    alignItems: 'center',
    marginTop: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  dateSepPill: {
    borderCurve: 'continuous',
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  groupStart: {
    paddingTop: Spacing.two,
  },
  grouped: {
    paddingTop: 2,
  },
  replyHint: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    top: 0,
    width: 32,
  },
  replyHintBadge: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  messageActions: {
    alignItems: 'center',
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'absolute',
    right: 0,
    top: 0,
    width: SWIPE_ACTION_WIDTH,
    elevation: 2,
    zIndex: 2,
  },
  messageAndActions: { alignItems: 'stretch', flexDirection: 'row', overflow: 'hidden', paddingBottom: Spacing.half, position: 'relative', width: '100%' },
  messageContent: { minWidth: 0, width: '100%', zIndex: 1 },
  swipeAction: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderColor: 'transparent',
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: TouchTarget,
    justifyContent: 'center',
    width: TouchTarget,
  },
  swipeContainer: {
    overflow: 'visible',
    position: 'relative',
    width: '100%',
  },
  threadGroupStart: {
    paddingTop: Spacing.two,
  },
});
