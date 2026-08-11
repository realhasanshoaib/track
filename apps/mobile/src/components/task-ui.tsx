import type { TaskPriority, TaskStateCategory } from '@track/shared/tasks';
import { Pressable, StyleSheet, View } from 'react-native';

import { ColoredAvatar } from '@/components/colored-avatar';
import { PlatformIcon } from '@/components/platform-icon';
import { ThemedText } from '@/components/themed-text';
import { Spacing, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { hapticLight } from '@/lib/haptics';
import { formatDate, useLocale } from '@/i18n';
import { useTranslation } from 'react-i18next';
import {
  taskDueLabel,
  localTaskDate,
  taskPriorityGlyph,
  taskPriorityLabel,
  taskStateTone,
} from '@/lib/task-presentation';

type Segment<T extends string> = { label: string; value: T };

export function TaskSegmentedControl<T extends string>({
  onChange,
  segments,
  value,
}: {
  onChange: (value: T) => void;
  segments: Array<Segment<T>>;
  value: T;
}) {
  const theme = useTheme();
  return (
    <View accessibilityRole="tablist" style={[styles.segmented, { backgroundColor: theme.backgroundElement }]}>
      {segments.map((segment) => {
        const selected = value === segment.value;
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            key={segment.value}
            onPress={() => {
              hapticLight();
              onChange(segment.value);
            }}
            style={[styles.segment, selected && { backgroundColor: theme.background }]}>
            <ThemedText style={{ color: selected ? theme.text : theme.textSecondary }} type="smallBold">
              {segment.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

export function TaskStatusPill({
  category,
  label,
}: {
  category?: TaskStateCategory;
  label: string;
}) {
  const theme = useTheme();
  const dark = theme.background === '#1b1917';
  const tone = taskStateTone(category);
  const palette = tone === 'success'
    ? dark
      ? { background: '#214a2c', foreground: '#b7f7c8' }
      : { background: '#dcfce7', foreground: '#166534' }
    : tone === 'active'
      ? { background: theme.accentSoft, foreground: theme.text }
      : tone === 'muted'
        ? { background: theme.backgroundSelected, foreground: theme.textSecondary }
        : { background: theme.backgroundElement, foreground: theme.textSecondary };

  return (
    <View style={[styles.pill, { backgroundColor: palette.background }]}>
      <View style={[styles.pillDot, { backgroundColor: palette.foreground }]} />
      <ThemedText contentDirection="auto" numberOfLines={1} style={{ color: palette.foreground }} type="code">{label}</ThemedText>
    </View>
  );
}

export function TaskPriorityBadge({ priority }: { priority: TaskPriority }) {
  const theme = useTheme();
  const { t } = useTranslation('work');
  if (priority === 'none') return null;
  const color = priority === 'urgent' ? theme.danger : priority === 'high' ? theme.warning : theme.textSecondary;
  return (
    <View accessibilityLabel={t('priority.accessibility', { label: taskPriorityLabel(priority, t) })} style={styles.priority}>
      <ThemedText style={{ color, fontWeight: '800' }} type="code">{taskPriorityGlyph(priority)}</ThemedText>
      <ThemedText style={{ color }} type="code">{taskPriorityLabel(priority, t)}</ThemedText>
    </View>
  );
}

export function TaskCard({
  assignee,
  category,
  compact,
  dueDate,
  linkedContext,
  onPress,
  priority,
  publicKey,
  stateName,
  title,
}: {
  assignee?: string;
  category?: TaskStateCategory;
  compact?: boolean;
  dueDate?: string;
  linkedContext?: string;
  onPress: () => void;
  priority: TaskPriority;
  publicKey: string;
  stateName: string;
  title: string;
}) {
  const theme = useTheme();
  const { locale } = useLocale();
  const { t } = useTranslation('work');
  const due = taskDueLabel(dueDate, undefined, category, { formatDate, locale, t });
  const overdue = Boolean(dueDate && dueDate < localTaskDate() && category !== 'completed' && category !== 'canceled');

  return (
    <Pressable
      accessibilityRole="button"
      android_ripple={{ color: theme.backgroundSelected }}
      onPress={onPress}
      style={[styles.card, compact && styles.cardCompact, {
        backgroundColor: theme.backgroundElement,
        borderColor: theme.hairline,
      ]}>
      <View style={styles.cardMeta}>
        <ThemedText contentDirection="ltr" style={{ color: theme.textSecondary }} type="code">{publicKey}</ThemedText>
        <TaskPriorityBadge priority={priority} />
      </View>
      <ThemedText contentDirection="auto" numberOfLines={compact ? 3 : 2} style={styles.cardTitle} type="smallBold">{title}</ThemedText>
      <View style={styles.cardDetails}>
        <TaskStatusPill category={category} label={stateName} />
        {due ? (
          <View style={styles.inlineMeta}>
            <PlatformIcon color={overdue ? theme.danger : theme.textSecondary} name="calendar" size={14} />
            <ThemedText contentDirection="auto" style={{ color: overdue ? theme.danger : theme.textSecondary }} type="code">{due}</ThemedText>
          </View>
        ) : null}
      </View>
      {assignee || linkedContext ? (
        <View style={[styles.cardFooter, { borderTopColor: theme.hairline }]}>
          {assignee ? (
            <View style={styles.assignee}>
              <ColoredAvatar label={assignee} seed={assignee} size={22} />
              <ThemedText contentDirection="auto" numberOfLines={1} style={{ color: theme.textSecondary }} type="small">{assignee}</ThemedText>
            </View>
          ) : <View />}
          {linkedContext ? (
            <View style={styles.linked}>
              <PlatformIcon color={theme.textSecondary} name="link" size={14} />
              <ThemedText contentDirection="auto" numberOfLines={1} style={{ color: theme.textSecondary }} type="code">{linkedContext}</ThemedText>
            </View>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}

export function TaskStateBanner({
  action,
  icon,
  message,
  tone = 'neutral',
}: {
  action?: { label: string; onPress: () => void };
  icon: React.ComponentProps<typeof PlatformIcon>['name'];
  message: string;
  tone?: 'neutral' | 'danger' | 'offline';
}) {
  const theme = useTheme();
  const dark = theme.background === '#1b1917';
  const danger = tone === 'danger';
  const backgroundColor = danger
    ? dark ? '#4c1d1d' : '#fee2e2'
    : tone === 'offline' ? theme.accentSoft : theme.backgroundElement;
  const foreground = danger ? dark ? '#fecaca' : '#991b1b' : theme.text;
  return (
    <View style={[styles.banner, { backgroundColor }]}>
      <PlatformIcon color={foreground} name={icon} size={18} />
      <ThemedText style={[styles.bannerText, { color: foreground }]} type="smallBold">{message}</ThemedText>
      {action ? (
        <Pressable hitSlop={10} onPress={action.onPress}>
          <ThemedText style={{ color: foreground, textDecorationLine: 'underline' }} type="smallBold">{action.label}</ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

export function TaskCardSkeletons({ count = 3 }: { count?: number }) {
  const theme = useTheme();
  return (
    <View style={styles.skeletonList}>
      {Array.from({ length: count }, (_, index) => (
        <View key={index} style={[styles.skeletonCard, { backgroundColor: theme.backgroundElement }]}>
          <View style={[styles.skeletonKey, { backgroundColor: theme.hairline }]} />
          <View style={[styles.skeletonTitle, { backgroundColor: theme.hairline }]} />
          <View style={[styles.skeletonTitleShort, { backgroundColor: theme.hairline }]} />
          <View style={styles.skeletonBottom}>
            <View style={[styles.skeletonPill, { backgroundColor: theme.hairline }]} />
            <View style={[styles.skeletonAvatar, { backgroundColor: theme.hairline }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function TaskAction({
  disabled,
  label,
  onPress,
  primary,
}: {
  disabled?: boolean;
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={() => {
        hapticLight();
        onPress();
      }}
      style={[styles.action, {
        backgroundColor: primary ? theme.accent : theme.backgroundSelected,
        opacity: disabled ? 0.5 : 1,
      }]}>
      <ThemedText style={primary ? styles.actionPrimaryText : undefined} type="smallBold">{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  action: { alignItems: 'center', borderRadius: 9, minHeight: 42, paddingHorizontal: Spacing.four, paddingVertical: Spacing.two },
  actionPrimaryText: { color: '#1b1917' },
  assignee: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: Spacing.two },
  banner: { alignItems: 'center', borderRadius: 10, flexDirection: 'row', gap: Spacing.two, minHeight: TouchTarget, paddingHorizontal: Spacing.three },
  bannerText: { flex: 1 },
  card: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, gap: Spacing.two, padding: Spacing.three },
  cardCompact: { minHeight: 146 },
  cardDetails: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  cardFooter: { alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: Spacing.two, justifyContent: 'space-between', marginTop: Spacing.one, paddingTop: Spacing.two },
  cardMeta: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 20 },
  cardTitle: { fontSize: 15, lineHeight: 21 },
  inlineMeta: { alignItems: 'center', flexDirection: 'row', gap: Spacing.one },
  linked: { alignItems: 'center', flexDirection: 'row', gap: Spacing.one, maxWidth: '48%' },
  pill: { alignItems: 'center', borderRadius: 999, flexDirection: 'row', gap: 5, maxWidth: 150, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one },
  pillDot: { borderRadius: 3, height: 6, width: 6 },
  priority: { alignItems: 'center', flexDirection: 'row', gap: Spacing.one },
  segment: { alignItems: 'center', borderRadius: 8, flex: 1, justifyContent: 'center', minHeight: 38, paddingHorizontal: Spacing.two },
  segmented: { borderRadius: 10, flexDirection: 'row', padding: 3 },
  skeletonAvatar: { borderRadius: 12, height: 24, width: 24 },
  skeletonBottom: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.one },
  skeletonCard: { borderRadius: 12, gap: Spacing.two, padding: Spacing.three },
  skeletonKey: { borderRadius: 4, height: 9, width: 54 },
  skeletonList: { gap: Spacing.three },
  skeletonPill: { borderRadius: 8, height: 22, width: 84 },
  skeletonTitle: { borderRadius: 4, height: 13, width: '84%' },
  skeletonTitleShort: { borderRadius: 4, height: 13, width: '52%' },
});
