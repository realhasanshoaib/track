import { parseMentions } from '@track/shared';
import type { FunctionReturnType } from 'convex/server';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { interpolate, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { api } from '../../../../convex/_generated/api';
import type { Doc, Id } from '../../../../convex/_generated/dataModel';
import { AssistantMessage } from '@/components/chat/assistant-message';
import { MessageBubble } from '@/components/chat/message-bubble';
import type { DetailedMessage } from '@/components/chat/types';
import { PlatformIcon } from '@/components/platform-icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { messageSwipeCancelIntent, messageSwipeIntent, type MessageActionsSwipeDirection } from '@/lib/message-swipe';

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
const SWIPE_ACTION_WIDTH = TouchTarget;

type Props = {
  highlighted?: boolean;
  item: Exclude<GroupedThreadItem, { kind: 'date-sep' }>;
  isFirstInGroup: boolean;
  isOwnMessage?: boolean;
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
  variant?: 'conversation' | 'thread';
};

export function ThreadRow({
  highlighted = false,
  item,
  isFirstInGroup,
  isOwnMessage,
  onLongPress,
  onOpenForwardSource,
  onOpenThread,
  onPressReply,
  onSwipeReply,
  onSwipeForward,
  onSwipeReport,
  variant = 'conversation',
}: Props) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const actionDirection: MessageActionsSwipeDirection = isOwnMessage ? 'left' : 'right';
  const actionDirectionSign = actionDirection === 'right' ? 1 : -1;
  const [actionsExposed, setActionsExposed] = useState(false);
  const actionWidth = useSharedValue(0);
  const replyProgress = useSharedValue(0);
  const trayOpenAtStart = useSharedValue(false);
  const hasSwipeActions = item.kind === 'message' && Boolean(onSwipeForward && onSwipeReport);

  const gesture = Gesture.Pan()
    .enabled(Boolean(onSwipeReply || hasSwipeActions))
    .activeOffsetX([-10, 10])
    .onBegin(() => {
      trayOpenAtStart.value = actionWidth.value >= SWIPE_ACTION_WIDTH - 1;
    })
    .onUpdate((e) => {
      const actionDistance = e.translationX * actionDirectionSign;
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
      const intent = messageSwipeIntent(e.translationX, Boolean(onSwipeReply), hasSwipeActions, trayOpenAtStart.value, actionDirection);
      if (intent === 'actions') {
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
    .onFinalize((_, success) => {
      if (success) return;
      const intent = messageSwipeCancelIntent(trayOpenAtStart.value);
      const shouldKeepActionsOpen = intent === 'actions';
      scheduleOnRN(setActionsExposed, shouldKeepActionsOpen);
      actionWidth.value = reducedMotion
        ? shouldKeepActionsOpen ? SWIPE_ACTION_WIDTH : 0
        : withSpring(shouldKeepActionsOpen ? SWIPE_ACTION_WIDTH : 0, { damping: 20 });
      replyProgress.value = reducedMotion ? 0 : withSpring(0, { damping: 20 });
    });

  const replyIconStyle = useAnimatedStyle(() => ({
    opacity: interpolate(replyProgress.value, [0, SWIPE_THRESHOLD], [0, 1], 'clamp'),
    transform: [{ scale: interpolate(replyProgress.value, [0, SWIPE_THRESHOLD], [0.7, 1], 'clamp') }],
  }));
  const actionsStyle = useAnimatedStyle(() => ({
    opacity: interpolate(actionWidth.value, [0, SWIPE_ACTION_WIDTH], [0, 1], 'clamp'),
    transform: [{ scale: interpolate(actionWidth.value, [0, SWIPE_ACTION_WIDTH], [0.88, 1], 'clamp') }],
    width: actionWidth.value,
  }));
  const actionTray = hasSwipeActions ? <Animated.View
    accessibilityElementsHidden={!actionsExposed}
    accessibilityLabel="Message actions"
    importantForAccessibility={actionsExposed ? 'auto' : 'no-hide-descendants'}
    pointerEvents={actionsExposed ? 'auto' : 'none'}
    style={[styles.messageActions, isOwnMessage && styles.messageActionsLeading, actionsStyle]}
  >
    <Pressable accessibilityHint="Opens the available actions for this message" accessibilityLabel="More message actions" accessibilityRole="button" onPress={() => {
      setActionsExposed(false);
      actionWidth.value = reducedMotion ? 0 : withSpring(0, { damping: 20 });
      onLongPress();
    }} style={({ pressed }) => [styles.swipeAction, { backgroundColor: pressed ? theme.backgroundSelected : theme.accentSoft }]}>
      <PlatformIcon color={theme.accentStrong} name="dots-horizontal" size={19} weight="regular" />
    </Pressable>
  </Animated.View> : null;

  return (
    <GestureDetector gesture={gesture}>
      <View style={styles.swipeContainer}>
        <Animated.View style={[styles.replyHint, replyIconStyle]}>
          <View style={[styles.replyHintBadge, { backgroundColor: theme.backgroundElement }]}>
            <PlatformIcon color={theme.textSecondary} name="reply" size={16} />
          </View>
        </Animated.View>
        <View style={styles.messageAndActions}>
          {actionTray}
          <Animated.View pointerEvents="box-none" style={[
          styles.messageContent,
          isFirstInGroup ? (variant === 'thread' ? styles.threadGroupStart : styles.groupStart) : styles.grouped,
        ]}>
          {item.kind === 'assistant' ? (
            <AssistantMessage
              isFirstInGroup={isFirstInGroup}
              onLongPress={onLongPress}
              stream={item.stream}
              timeLabel={fmtTime(item.stream.createdAt)}
            />
          ) : (
            <MessageBubble
              highlighted={highlighted}
              isFirstInGroup={isFirstInGroup}
              isOwnMessage={Boolean(isOwnMessage)}
              message={item.item}
              onLongPress={onLongPress}
              onOpenForwardSource={onOpenForwardSource}
              onOpenThread={onOpenThread}
              onPressReply={onPressReply}
              timeLabel={fmtTime(item.item.message.createdAt)}
              variant={variant}
            />
          )}
          </Animated.View>
        </View>
      </View>
    </GestureDetector>
  );
}

export function DateSeparator({ label }: { label: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.dateSep, { backgroundColor: theme.homeSurface }]}>
      <View style={[styles.dateSepPill, { backgroundColor: theme.homeSurface }]}>
        <ThemedText themeColor="textSecondary" type="captionBold">
          {label}
        </ThemedText>
      </View>
    </View>
  );
}

export function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
    marginVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  dateSepPill: {
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  groupStart: {
    paddingTop: Spacing.three,
  },
  grouped: {
    paddingTop: 2,
  },
  replyHint: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'center',
    left: Spacing.two,
    position: 'absolute',
    top: 0,
    width: 32,
  },
  replyHintBadge: {
    alignItems: 'center',
    borderRadius: Radius.pill,
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
    elevation: 2,
    zIndex: 2,
  },
  messageActionsLeading: { left: 0, right: undefined },
  messageAndActions: { alignItems: 'stretch', flexDirection: 'row', overflow: 'hidden', position: 'relative', width: '100%' },
  messageContent: { minWidth: 0, width: '100%', zIndex: 1 },
  swipeAction: {
    alignItems: 'center',
    borderRadius: Radius.pill,
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
