import { parseMentions } from '@track/shared';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { interpolate, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSpring, withTiming } from 'react-native-reanimated';

import type { Doc, Id } from '../../../../convex/_generated/dataModel';
import { ColoredAvatar } from '@/components/colored-avatar';
import { PlatformIcon } from '@/components/platform-icon';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { formatDuration, formatFileSize, formatNumber, formatTime, useLocale } from '@/i18n';
import { hapticLight } from '@/lib/haptics';
import { useTheme } from '@/hooks/use-theme';
import { useTranslation } from 'react-i18next';

export type DetailedMessage = {
  message: Doc<'messages'>;
  author: Doc<'users'> | null;
  authorRole?: Doc<'projectMembers'>['role'] | null;
  authorCompany?: { companyId: Id<'companies'>; displayName: string } | null;
  attachments: Array<{ attachment: Doc<'attachments'>; url: string | null }>;
  replyTo?: { messageId: Id<'messages'>; authorName: string; body: string; createdAt: number } | null;
  channelThread?: {
    threadId: Id<'channelThreads'>;
    name: string;
    status: 'active' | 'archived';
    replyCount: number;
    latestReplyAt: number | null;
  } | null;
};

export type ThreadItem =
  | { kind: 'message'; key: string; at: number; item: DetailedMessage }
  | { kind: 'assistant'; key: string; at: number; stream: Doc<'assistantStreams'> };

export type GroupedThreadItem =
  | { kind: 'message'; key: string; at: number; item: DetailedMessage; isFirstInGroup: boolean }
  | { kind: 'assistant'; key: string; at: number; stream: Doc<'assistantStreams'>; isFirstInGroup: boolean }
  | { kind: 'date-sep'; key: string; at: number; label: string };

export type ProjectMemberRow = { membership: Doc<'projectMembers'>; user: Doc<'users'> | null };

type Props = {
  item: Exclude<GroupedThreadItem, { kind: 'date-sep' }>;
  isFirstInGroup: boolean;
  isOwnMessage?: boolean;
  onLongPress: () => void;
  onSwipeReply?: () => void;
};

function AnimatedDot({ delay }: { delay: number }) {
  const opacity = useSharedValue(0.2);

  useEffect(() => {
    opacity.value = withDelay(delay, withRepeat(withTiming(1, { duration: 400 }), -1, true));
  }, [delay, opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return <Animated.View style={[styles.dot, style]} />;
}

function AnimatedDots() {
  return (
    <View style={styles.dotsRow}>
      <AnimatedDot delay={0} />
      <AnimatedDot delay={200} />
      <AnimatedDot delay={400} />
    </View>
  );
}

function HighlightedText({ body }: { body: string }) {
  const theme = useTheme();
  const parts = body.split(/(@[\w.-]+|https?:\/\/\S+|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,})/g);
  return (
    <ThemedText contentDirection="auto" type="small">
      {parts.map((part, i) =>
        part.startsWith('@') || part.startsWith('http://') || part.startsWith('https://') || /^[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}$/.test(part) ? (
          <ThemedText contentDirection="ltr" key={i} style={{ color: theme.accent, fontWeight: '600' }} type="small">
            {part}
          </ThemedText>
        ) : (
          part
        )
      )}
    </ThemedText>
  );
}

export function ThreadRow({ item, isFirstInGroup, isOwnMessage, onLongPress, onSwipeReply }: Props) {
  const theme = useTheme();
  const { direction, locale } = useLocale();
  const { t } = useTranslation('chat');
  const isRtl = direction === 'rtl';
  const translateX = useSharedValue(0);

  const gesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .onUpdate((e) => {
      const logicalTranslation = isRtl ? -e.translationX : e.translationX;
      if (logicalTranslation > 0) {
        translateX.value = Math.min(logicalTranslation, 80);
      } else {
        translateX.value = 0;
      }
    })
    .onEnd((e) => {
      const logicalTranslation = isRtl ? -e.translationX : e.translationX;
      if (logicalTranslation > 60 && onSwipeReply) {
        translateX.value = withSpring(0, { damping: 20 });
        runOnJS(onSwipeReply)();
      } else {
        translateX.value = withSpring(0, { damping: 20 });
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: isRtl ? -translateX.value : translateX.value }],
  }));

  const replyIconStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, 60], [0, 1], 'clamp'),
  }));

  const rowStyle = [
    styles.row,
    isRtl && styles.rtlRow,
    !isFirstInGroup && styles.rowGrouped,
  ];

  function renderContent() {
    if (item.kind === 'assistant') {
      return (
        <Pressable hitSlop={4} onLongPress={onLongPress} style={rowStyle}>
          {isFirstInGroup ? (
            <View style={[styles.avatar, { backgroundColor: theme.accent }]}>
              <ThemedText style={[styles.avatarLabel, { color: '#1b1917' }]}>T</ThemedText>
            </View>
          ) : (
            <View style={styles.avatarSpacer} />
          )}
          <View style={styles.body}>
            {isFirstInGroup && (
              <View style={[styles.meta, isRtl && styles.rtlRow]}>
                <ThemedText type="smallBold">{t('assistant.name')}</ThemedText>
                <ThemedText contentDirection="ltr" style={{ color: theme.textSecondary }} type="code">
                  {formatTime(locale, item.stream.createdAt)}
                </ThemedText>
              </View>
            )}
            {(item.stream.status === 'queued' || item.stream.status === 'running') && !item.stream.answer ? (
              <View style={styles.thinkingWrap}>
                <AnimatedDots />
                <ThemedText style={styles.thinkingLabel} themeColor="textSecondary" type="code">
                  {t('assistant.thinking')}
                </ThemedText>
              </View>
            ) : (
              <HighlightedText body={item.stream.answer || (item.stream.status === 'failed' ? t('assistant.failed') : t('assistant.completed'))} />
            )}
            {item.stream.evidence.length > 0 ? (
              <View style={[styles.evidenceRow, isRtl && styles.rtlRow]}>
                {item.stream.evidence.slice(0, 3).map((_, i) => (
                  <View key={i} style={[styles.evidenceChip, { backgroundColor: theme.accentSoft }]}>
                    <ThemedText contentDirection="ltr" style={{ color: theme.accent }} type="code">
                      {t('assistant.reference', { count: formatNumber(locale, i + 1) })}
                    </ThemedText>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        </Pressable>
      );
    }

    const name = item.item.author?.displayName ?? t('composer.member');
    const authorId = item.item.author?._id ?? name;
    return (
      <Pressable hitSlop={4} onLongPress={onLongPress} style={rowStyle}>
        {isFirstInGroup ? (
          <ColoredAvatar label={name} seed={authorId} size={36} />
        ) : (
          <View style={styles.avatarSpacer} />
        )}
        <View style={[
          styles.messageSurface,
          { backgroundColor: isOwnMessage ? theme.backgroundSelected : theme.backgroundElement },
          !isFirstInGroup && styles.messageSurfaceGrouped,
        ]}>
          <View style={styles.body}>
            {isFirstInGroup && (
              <View style={[styles.meta, isRtl && styles.rtlRow]}>
                <View style={[styles.metaLeft, isRtl && styles.rtlRow]}>
                <ThemedText contentDirection="auto" numberOfLines={1} style={styles.authorName} type="smallBold">{name}</ThemedText>
                  {item.item.authorRole ? (
                    <View style={[styles.roleChip, { backgroundColor: theme.backgroundElement }]}>
                  <ThemedText contentDirection="auto" numberOfLines={1} style={{ color: theme.textSecondary }} type="code">
                        {item.item.authorRole}
                      </ThemedText>
                    </View>
                  ) : null}
                  {item.item.authorCompany ? (
                    <View style={[styles.roleChip, { backgroundColor: theme.accentSoft }]}>
                      <ThemedText contentDirection="auto" numberOfLines={1} style={{ color: theme.accent }} type="code">
                        {item.item.authorCompany.displayName}
                      </ThemedText>
                    </View>
                  ) : null}
                </View>
                <ThemedText contentDirection="ltr" style={{ color: theme.textSecondary }} type="code">
                  {formatTime(locale, item.item.message.createdAt)}
                </ThemedText>
              </View>
            )}

            {item.item.replyTo ? (
              <View style={[styles.quote, isRtl ? styles.quoteRtl : styles.quoteLtr, { borderLeftColor: isRtl ? undefined : theme.accent, borderRightColor: isRtl ? theme.accent : undefined }]}>
                <ThemedText contentDirection="auto" style={{ color: theme.textSecondary }} type="code">
                  {item.item.replyTo.authorName}
                </ThemedText>
                <ThemedText contentDirection="auto" numberOfLines={2} type="small">{item.item.replyTo.body}</ThemedText>
              </View>
            ) : null}

            <HighlightedText body={item.item.message.body} />

            {item.item.channelThread ? (
              <View style={[styles.threadChip, { backgroundColor: theme.accentSoft }, isRtl && styles.rtlRow]}>
                <PlatformIcon color={theme.accent} name="forum-outline" size={14} />
                <ThemedText contentDirection="auto" numberOfLines={1} style={{ color: theme.accent }} type="code">
                  {item.item.channelThread.name} · {t('threads.replyCount', { count: item.item.channelThread.replyCount, formattedCount: formatNumber(locale, item.item.channelThread.replyCount) })}
                </ThemedText>
              </View>
            ) : null}

            {item.item.attachments.map(({ attachment, url }) =>
              attachment.kind === 'voice_note' && url ? (
                <VoiceRow attachment={attachment} key={attachment._id} url={url} />
              ) : (
                <View key={attachment._id} style={[styles.fileChip, { backgroundColor: theme.backgroundElement }, isRtl && styles.rtlRow]}>
                  <PlatformIcon color={theme.textSecondary} name="paperclip" size={14} />
                  <ThemedText contentDirection="ltr" numberOfLines={1} style={{ color: theme.textSecondary }} type="code">
                    {attachment.filename} · {formatFileSize(locale, attachment.size)}
                  </ThemedText>
                </View>
              )
            )}
          </View>
        </View>
      </Pressable>
    );
  }

  return (
    <GestureDetector gesture={gesture}>
      <View style={styles.swipeContainer}>
        <Animated.View style={[styles.replyIconContainer, isRtl ? styles.replyIconRight : styles.replyIconLeft, replyIconStyle]}>
          <PlatformIcon color={theme.accent} name="arrow-up" size={20} />
        </Animated.View>
        <Animated.View style={animatedStyle}>
          {renderContent()}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

export function DateSeparator({ label }: { label: string }) {
  const theme = useTheme();
  return (
    <View style={styles.dateSep}>
      <ThemedText style={[styles.dateSepLabel, { color: theme.textSecondary }]} type="code">
        {label.toLocaleUpperCase()}
      </ThemedText>
    </View>
  );
}

function VoiceRow({ attachment, url }: { attachment: Doc<'attachments'>; url: string }) {
  const theme = useTheme();
  const { direction, locale } = useLocale();
  const { t } = useTranslation('chat');
  const player = useAudioPlayer(url);
  const status = useAudioPlayerStatus(player);
  const playing = status.playing;
  return (
    <Pressable
      android_ripple={{ color: theme.backgroundSelected }}
      hitSlop={4}
      onPress={() => {
        hapticLight();
        if (playing) {
          player.pause();
        } else {
          player.play();
        }
      }}
      style={[styles.voiceChip, { backgroundColor: theme.accentSoft }, direction === 'rtl' && styles.rtlRow]}>
      <PlatformIcon color={theme.accent} name={playing ? 'stop' : 'microphone-outline'} size={16} />
      <ThemedText contentDirection="ltr" style={{ color: theme.accent }} type="code">
        {attachment.durationMs
          ? t('voice.duration', { count: Math.max(0, Math.round(attachment.durationMs / 1000)), duration: formatDuration(locale, Math.max(0, Math.round(attachment.durationMs / 1000))) })
          : t('composer.voiceNote')}
      </ThemedText>
    </Pressable>
  );
}

export function fmtTime(ts: number): string;
export function fmtTime(locale: string, ts: number): string;
export function fmtTime(localeOrTimestamp: string | number, timestamp?: number) {
  const locale = typeof localeOrTimestamp === 'string' ? localeOrTimestamp : 'en';
  const ts = typeof localeOrTimestamp === 'number' ? localeOrTimestamp : timestamp ?? 0;
  return formatTime(locale as Parameters<typeof formatTime>[0], ts);
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
    const keys = new Set(
      [user.displayName, user.email, user.email?.split('@')[0]]
        .filter(Boolean)
        .map((v) => norm(String(v))),
    );
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
  avatarLabel: { fontSize: 14, fontWeight: '700', textAlign: 'center', lineHeight: 36 },
  avatar: { alignItems: 'center', borderRadius: 18, height: 36, justifyContent: 'center', width: 36 },
  avatarSpacer: { width: 36 },
  dot: { backgroundColor: '#f0b100', borderRadius: 3, height: 6, width: 6 },
  dotsRow: { alignItems: 'center', flexDirection: 'row', gap: Spacing.one },
  thinkingLabel: { marginTop: 2 },
  thinkingWrap: { gap: 4 },
  threadChip: { alignItems: 'center', alignSelf: 'flex-start', borderRadius: 8, flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two, maxWidth: '100%', paddingHorizontal: Spacing.two, paddingVertical: 4 },
  body: { flex: 1, gap: 4, minWidth: 0 },
  dateSep: { alignItems: 'center', marginVertical: Spacing.four, paddingHorizontal: Spacing.four },
  dateSepLabel: { fontSize: 11, letterSpacing: 0.5 },
  evidenceChip: { borderRadius: 6, paddingHorizontal: Spacing.two, paddingVertical: 2 },
  evidenceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.two },
  authorName: { flexShrink: 1, minWidth: 0 },
  fileChip: {
    alignItems: 'center', alignSelf: 'flex-start', borderRadius: 8,
    flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two,
    paddingHorizontal: Spacing.two, paddingVertical: 4,
  },
  messageSurface: {
    flex: 1,
    borderRadius: 6,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    gap: 4,
  },
  messageSurfaceGrouped: {
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },
  meta: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two, justifyContent: 'space-between', minWidth: 0 },
  metaLeft: { alignItems: 'center', flex: 1, flexDirection: 'row', flexShrink: 1, gap: Spacing.two, minWidth: 0 },
  quote: {
    borderRadius: 4, gap: 2,
    marginTop: Spacing.one, paddingHorizontal: Spacing.two, paddingVertical: 4,
  },
  quoteLtr: { borderLeftWidth: 3 },
  quoteRtl: { borderRightWidth: 3 },
  roleChip: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1 },
  row: {
    flexDirection: 'row', gap: Spacing.three,
    paddingHorizontal: Spacing.three, paddingVertical: Spacing.two,
  },
  rtlRow: { flexDirection: 'row-reverse' },
  rowGrouped: { paddingVertical: Spacing.one },
  replyIconContainer: { position: 'absolute', top: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', width: 40 },
  replyIconLeft: { left: Spacing.three },
  replyIconRight: { right: Spacing.three },
  swipeContainer: { position: 'relative' },
  voiceChip: {
    alignItems: 'center', alignSelf: 'flex-start', borderRadius: 8,
    flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two,
    paddingHorizontal: Spacing.three, paddingVertical: 6,
  },
});
