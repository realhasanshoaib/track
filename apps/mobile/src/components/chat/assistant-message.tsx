import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withTiming } from 'react-native-reanimated';

import { AssistantMark } from '@/components/chat/assistant-mark';
import { MessageActionShortcut } from '@/components/chat/message-action-shortcut';
import {
  assistantFailureHint,
  assistantProgressLabel,
  type AssistantErrorCode,
  type AssistantProgressStage,
} from '@/components/chat/assistant-progress';
import { MessageText } from '@/components/chat/message-text';
import { PlatformIcon } from '@/components/platform-icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import type { Doc } from '../../../../../convex/_generated/dataModel';

const MARK_SIZE = 32;
const VISIBLE_EVIDENCE = 3;

type Props = {
  isFirstInGroup: boolean;
  onLongPress: () => void;
  stream: Doc<'assistantStreams'>;
  timeLabel: string;
};

/**
 * The assistant answers in the same incoming bubble as everyone else; only the
 * mark and the "Assistant" chip mark it as Track rather than a member.
 */
export function AssistantMessage({ isFirstInGroup, onLongPress, stream, timeLabel }: Props) {
  const theme = useTheme();
  const progressStream: AssistantProgressStream = stream;
  const failed = stream.status === 'failed';
  const answer = failed ? '' : stream.answer.trim();
  const pending = (stream.status === 'queued' || stream.status === 'running') && !answer;
  const progressLabel = assistantProgressLabel(stream.status, progressStream.stage);
  const evidence = stream.evidence.slice(0, VISIBLE_EVIDENCE);
  const hiddenEvidence = stream.evidence.length - evidence.length;
  // Only an answer that closes the bubble can tuck the time into its last line.
  const timeInline = Boolean(answer) && evidence.length === 0;
  return (
    <View style={styles.row}>
      {isFirstInGroup ? <AssistantMark size={MARK_SIZE} /> : <View style={styles.markSpacer} />}
      <Pressable
        accessible={false}
        onLongPress={onLongPress}
        style={[
          styles.bubble,
          { backgroundColor: theme.bubbleOther },
          isFirstInGroup && styles.tail,
        ]}>
        {isFirstInGroup ? (
          <View style={styles.header}>
            <ThemedText numberOfLines={1} style={styles.name} type="smallBold">
              Track
            </ThemedText>
            <View style={[styles.roleChip, { backgroundColor: theme.accentSoft }]}>
              <ThemedText style={{ color: theme.accentStrong }} type="captionBold">
                Assistant
              </ThemedText>
            </View>
          </View>
        ) : null}

        {pending ? (
          <View accessibilityLiveRegion="polite" style={styles.status}>
            <ThinkingDots />
            <ThemedText themeColor="textSecondary" type="caption">
              {`Track is ${progressLabel.toLowerCase()}…`}
            </ThemedText>
          </View>
        ) : failed ? (
          <View accessibilityLiveRegion="polite" style={styles.status}>
            <PlatformIcon color={theme.danger} name="alert-circle" size={16} />
            <ThemedText style={{ color: theme.danger }} type="small">
              {assistantFailureHint(progressStream.errorCode)}
            </ThemedText>
          </View>
        ) : answer ? (
          <View style={styles.bodyWrap}>
            <MessageText
              body={answer}
              suffix={
                timeInline ? (
                  <ThemedText style={styles.timeSpacer} type="caption">
                    {`   ${timeLabel}`}
                  </ThemedText>
                ) : undefined
              }
            />
            {timeInline ? (
              <View style={styles.timeMeta}>
                <ThemedText style={styles.timeInline} themeColor="textSecondary" type="caption">{timeLabel}</ThemedText>
                <MessageActionShortcut authorName="Track Assistant" onPress={onLongPress} timeLabel={timeLabel} />
              </View>
            ) : null}
          </View>
        ) : (
          <ThemedText themeColor="textSecondary" type="small">
            Track returned no answer.
          </ThemedText>
        )}

        {evidence.length ? (
          <View style={styles.references}>
            <ThemedText style={{ color: theme.accentStrong }} type="captionBold">
              {stream.evidence.length === 1 ? 'Reference' : 'References'}
            </ThemedText>
            {evidence.map((item, index) => (
              <View
                key={`${item.messageId ?? item.attachmentId ?? 'evidence'}-${index}`}
                style={[
                  styles.reference,
                  { backgroundColor: theme.backgroundElevated, borderLeftColor: theme.accent },
                ]}>
                <ThemedText numberOfLines={3} themeColor="textSecondary" type="caption">
                  {item.quote}
                </ThemedText>
                {item.reason ? (
                  <ThemedText numberOfLines={2} themeColor="textTertiary" type="caption">
                    {item.reason}
                  </ThemedText>
                ) : null}
              </View>
            ))}
            {hiddenEvidence > 0 ? (
              <ThemedText themeColor="textSecondary" type="caption">
                {`${hiddenEvidence} more reference${hiddenEvidence === 1 ? '' : 's'}`}
              </ThemedText>
            ) : null}
          </View>
        ) : null}

        {timeInline ? null : (
          <View style={styles.timeMeta}>
            <ThemedText style={styles.timeFooter} themeColor="textSecondary" type="caption">{timeLabel}</ThemedText>
            <MessageActionShortcut authorName="Track Assistant" onPress={onLongPress} timeLabel={timeLabel} />
          </View>
        )}
      </Pressable>
    </View>
  );
}

type AssistantProgressStream = Pick<Doc<'assistantStreams'>, 'status'> & {
  errorCode?: AssistantErrorCode;
  stage?: AssistantProgressStage;
};

function ThinkingDots() {
  return (
    <View style={styles.dots}>
      <ThinkingDot delay={0} />
      <ThinkingDot delay={180} />
      <ThinkingDot delay={360} />
    </View>
  );
}

function ThinkingDot({ delay }: { delay: number }) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const opacity = useSharedValue(0.25);

  useEffect(() => {
    if (reducedMotion) return;
    opacity.value = withDelay(delay, withRepeat(withTiming(1, { duration: 420 }), -1, true));
  }, [delay, opacity, reducedMotion]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return <Animated.View style={[styles.dot, { backgroundColor: theme.accentStrong }, style]} />;
}

const styles = StyleSheet.create({
  bodyWrap: {
    position: 'relative',
  },
  bubble: {
    borderRadius: Radius.large,
    flexShrink: 1,
    gap: Spacing.one,
    maxWidth: '84%',
    paddingHorizontal: Spacing.two,
    paddingVertical: 6,
  },
  dot: {
    borderRadius: Radius.pill,
    height: 6,
    width: 6,
  },
  dots: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.one,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.one,
    minWidth: 0,
  },
  markSpacer: {
    width: MARK_SIZE,
  },
  name: {
    flexShrink: 1,
    minWidth: 0,
  },
  reference: {
    borderLeftWidth: 3,
    borderRadius: Radius.small,
    gap: 1,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  references: {
    gap: Spacing.one,
  },
  roleChip: {
    borderRadius: Radius.small,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  row: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: Spacing.two,
    justifyContent: 'flex-start',
    paddingHorizontal: Spacing.three,
  },
  status: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.two,
  },
  tail: {
    borderTopLeftRadius: Radius.small,
  },
  timeFooter: {
    alignSelf: 'center',
  },
  timeMeta: { alignItems: 'center', alignSelf: 'flex-end', flexDirection: 'row', gap: 1 },
  timeInline: {
    bottom: 1,
    position: 'absolute',
    right: 0,
  },
  timeSpacer: {
    color: 'transparent',
  },
});
