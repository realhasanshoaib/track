import type { TaskPriority, TaskStateCategory } from '@track/shared/tasks';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ColoredAvatar } from '@/components/colored-avatar';
import { PlatformIcon } from '@/components/platform-icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { hapticLight } from '@/lib/haptics';
import {
  shortTaskKey,
  taskDueDisplay,
  taskPriorityLabel,
} from '@/lib/task-presentation';
import { taskStatePalette } from '@/lib/task-state-palette';

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
    <ScrollView accessibilityRole="tablist" contentContainerStyle={styles.segmentedContent} horizontal showsHorizontalScrollIndicator={false} style={[styles.segmented, { backgroundColor: theme.backgroundElement }]}>
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
            style={({ pressed }) => [styles.segment, {
              backgroundColor: pressed || selected ? theme.backgroundElevated : 'transparent',
            }]}>
            <ThemedText numberOfLines={1} themeColor={selected ? 'text' : 'textSecondary'} type="smallBold">
              {segment.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** State reads by shape as well as color, so the set stays legible without hue. */
function stateGlyph(category?: TaskStateCategory) {
  if (category === 'completed') return 'check-circle' as const;
  if (category === 'canceled') return 'close' as const;
  return 'circle-outline' as const;
}

export function TaskStatusPill({
  appearance = 'soft',
  category,
  label,
  onPress,
}: {
  appearance?: 'plain' | 'soft';
  category?: TaskStateCategory;
  label: string;
  onPress?: () => void;
}) {
  const theme = useTheme();
  const palette = taskStatePalette(theme, category);
  const body = (
    <>
      {category === 'started' ? (
        <View style={[styles.pillDot, { backgroundColor: palette.foreground }]} />
      ) : (
        <PlatformIcon color={palette.foreground} name={stateGlyph(category)} size={13} variant={category === 'completed' ? 'filled' : 'outline'} />
      )}
      <ThemedText numberOfLines={1} style={[styles.pillLabel, { color: palette.foreground }]} type="captionBold">
        {label}
      </ThemedText>
      {onPress ? <PlatformIcon color={palette.foreground} name="selector" size={13} /> : null}
    </>
  );
  const backgroundColor = appearance === 'plain' ? 'transparent' : palette.background;
  if (!onPress) return <View style={[styles.pill, { backgroundColor }]}>{body}</View>;
  return (
    <Pressable
      accessibilityHint="Opens the move menu"
      accessibilityLabel={`Status: ${label}`}
      accessibilityRole="button"
      hitSlop={12}
      onPress={() => {
        hapticLight();
        onPress();
      }}
      style={({ pressed }) => [styles.pill, { backgroundColor }, pressed && styles.pressedControl]}>
      {body}
    </Pressable>
  );
}

export function TaskPriorityBadge({
  compact = false,
  onPress,
  priority,
  showNone = false,
}: {
  compact?: boolean;
  onPress?: () => void;
  priority: TaskPriority;
  showNone?: boolean;
}) {
  const theme = useTheme();
  if (priority === 'none' && !onPress && !showNone) return null;
  const color = priority === 'urgent' ? theme.danger : priority === 'high' ? theme.warning : theme.textSecondary;
  const backgroundColor = priority === 'urgent' ? theme.dangerSoft : priority === 'high' ? theme.accentSoft : theme.backgroundElement;
  const body = (
    <>
      <PlatformIcon color={color} name={priority === 'urgent' ? 'alert-circle' : 'flag'} size={14} weight="medium" />
      <ThemedText style={{ color }} type="caption">{taskPriorityLabel(priority)}</ThemedText>
    </>
  );
  if (!onPress) {
    return (
      <View accessibilityLabel={`${taskPriorityLabel(priority)} priority`} style={[styles.priority, compact && styles.priorityBadge, compact && { backgroundColor }]}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityHint="Changes the priority"
      accessibilityLabel={`Priority: ${taskPriorityLabel(priority)}`}
      accessibilityRole="button"
      hitSlop={12}
      onPress={() => {
        hapticLight();
        onPress();
      }}
      style={({ pressed }) => [styles.priority, compact && styles.priorityBadge, compact && { backgroundColor }, pressed && styles.pressedControl]}>
      {body}
    </Pressable>
  );
}

export function TaskDueChip({
  category,
  dueDate,
  onPress,
  showNoDate = false,
}: {
  category?: TaskStateCategory;
  dueDate?: string;
  onPress?: () => void;
  showNoDate?: boolean;
}) {
  const theme = useTheme();
  const due = taskDueDisplay(dueDate, undefined, category);
  if (!due && !onPress && !showNoDate) return null;
  const color = due?.overdue ? theme.warning : theme.textSecondary;
  const body = (
    <>
      <PlatformIcon color={color} name={due?.overdue ? 'alert-circle' : 'calendar'} size={14} />
      <ThemedText numberOfLines={1} style={{ color }} type={due?.overdue ? 'captionBold' : 'caption'}>
        {due?.label ?? (showNoDate ? 'No due date' : 'Add due date')}
      </ThemedText>
      {onPress ? <PlatformIcon color={color} name="selector" size={13} /> : null}
    </>
  );
  if (!onPress) return <View style={styles.inlineMeta}>{body}</View>;
  return (
    <Pressable
      accessibilityHint="Changes the due date"
      accessibilityLabel={`Due date: ${due?.label ?? 'none'}`}
      accessibilityRole="button"
      hitSlop={12}
      onPress={() => {
        hapticLight();
        onPress();
      }}
      style={({ pressed }) => [styles.inlineMeta, pressed && styles.pressedControl]}>
      {body}
    </Pressable>
  );
}

export function TaskCard({
  assignee,
  category,
  companyName,
  contextLabel,
  description,
  dueDate,
  evidence,
  focused = false,
  onLongPress,
  onPress,
  onCompletionPress,
  onStatusPress,
  priority,
  publicKey,
  glass = false,
  quiet = false,
  groupName,
  projectName,
  referenceCount = 0,
  showKey = true,
  alwaysShowPriority = false,
  stateName,
  title,
  variant = 'list',
  isCompleted = false,
}: {
  assignee?: string;
  category?: TaskStateCategory;
  companyName?: string;
  contextLabel?: string;
  description?: string;
  dueDate?: string;
  evidence?: boolean;
  focused?: boolean;
  onLongPress?: () => void;
  onPress: () => void;
  onCompletionPress?: () => void;
  onStatusPress?: () => void;
  priority: TaskPriority;
  publicKey: string;
  glass?: boolean;
  quiet?: boolean;
  groupName?: string;
  projectName?: string;
  referenceCount?: number;
  showKey?: boolean;
  alwaysShowPriority?: boolean;
  stateName: string;
  title: string;
  variant?: 'list' | 'board';
  isCompleted?: boolean;
}) {
  const theme = useTheme();
  const board = variant === 'board';
  const statePalette = taskStatePalette(theme, category);

  if (quiet && !board) {
    const due = taskDueDisplay(dueDate, undefined, category);
    const taskContext = [projectName, contextLabel ? `Board ${contextLabel}` : null, companyName, groupName ? `Channel ${groupName.replace(/^#/, '')}` : null, taskPriorityLabel(priority)]
      .filter(Boolean)
      .join('. ');
    const dueLabel = due?.label ?? (alwaysShowPriority ? 'No due date' : undefined);
    return <View style={[styles.quietRow, glass && styles.quietGlassRow, { backgroundColor: glass ? theme.navigationSelectionGlass : 'transparent', borderColor: glass ? theme.homeBorder : theme.hairline }]}>
      {onCompletionPress ? <Pressable
        accessibilityHint={isCompleted ? 'Opens status choices so you can reopen this task' : 'Marks this task complete'}
        accessibilityLabel={`${isCompleted ? 'Completed' : 'Mark complete'}: ${title}`}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: isCompleted }}
        hitSlop={8}
        onPress={() => { hapticLight(); onCompletionPress(); }}
        style={styles.quietCheckbox}
      ><PlatformIcon color={isCompleted ? theme.success : theme.textSecondary} name={isCompleted ? 'check-circle' : 'circle-outline'} size={21} /></Pressable> : null}
      <Pressable
        accessibilityLabel={`${title}. ${taskContext}${evidence ? '. Linked to conversation evidence' : ''}. ${stateName}${dueLabel ? `. ${dueLabel}` : ''}`}
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [styles.quietPressable, {
          backgroundColor: pressed ? theme.backgroundSelected : 'transparent',
          borderColor: pressed ? theme.textTertiary : 'transparent',
          borderRadius: Radius.medium,
          borderWidth: pressed ? StyleSheet.hairlineWidth : 0,
          boxShadow: pressed ? '0 2px 8px rgba(0,0,0,0.16)' : undefined,
        }]}
      >
        {assignee ? <ColoredAvatar label={assignee} seed={assignee} size={28} /> : null}
        <View style={styles.quietCopy}>
          <ThemedText numberOfLines={2} type="smallBold">{title}</ThemedText>
          {projectName ? <View style={styles.quietProjectContext}>
            <PlatformIcon color={theme.textSecondary} name="project" size={13} />
            <ThemedText numberOfLines={1} style={styles.quietProjectName} type="captionBold">{projectName}</ThemedText>
            {companyName ? <View style={[styles.companyPill, styles.quietCompanyPill, { backgroundColor: theme.homeSurface, borderColor: theme.homeBorder }]}>
              <ThemedText numberOfLines={1} style={styles.companyPillText} themeColor="textSecondary" type="captionBold">{companyName}</ThemedText>
            </View> : null}
          </View> : null}
          <ThemedText numberOfLines={1} themeColor="textSecondary" type="caption">{[contextLabel ? `Board ${contextLabel}` : null, groupName ? `#${groupName.replace(/^#/, '')}` : null, alwaysShowPriority || priority === 'urgent' || priority === 'high' ? taskPriorityLabel(priority) : null].filter(Boolean).join(' · ')}</ThemedText>
          <TaskDueChip category={category} dueDate={dueDate} showNoDate={alwaysShowPriority} />
        </View>
      </Pressable>
      <View style={styles.quietAction}><TaskStatusPill category={category} label={stateName} onPress={onStatusPress} /></View>
    </View>;
  }

  if (!board) {
    const context = [showKey ? shortTaskKey(publicKey) : null, contextLabel, priority !== 'none' ? taskPriorityLabel(priority) : null, evidence ? 'Linked to conversation evidence' : null]
      .filter(Boolean)
      .join(' · ');
    const due = taskDueDisplay(dueDate, undefined, category);
    return (
      <View style={[styles.listRow, { backgroundColor: theme.backgroundElement, borderColor: theme.hairline }]}>
        <View style={styles.listRowContent}>
          <Pressable
            accessibilityHint="Opens the task"
            accessibilityLabel={`${title}. ${context}. ${stateName}${due ? `. ${due.label}` : ''}`}
            accessibilityRole="button"
            android_ripple={{ color: theme.backgroundSelected }}
            onPress={onPress}
            style={({ pressed }) => [styles.listRowPressable, { opacity: pressed ? 0.7 : 1 }]}>
            <View style={[styles.listLeading, { backgroundColor: statePalette.background }]}>
              {assignee && assignee !== 'You'
                ? <ColoredAvatar label={assignee} seed={assignee} size={32} />
                : <PlatformIcon color={statePalette.foreground} name={stateGlyph(category)} size={19} variant={category === 'completed' ? 'filled' : 'outline'} />}
            </View>
            <View style={styles.listCopy}>
              <ThemedText numberOfLines={2} style={styles.cardTitle} type="title">{title}</ThemedText>
              {projectName ? (
                <View style={styles.listProjectContext}>
                  <PlatformIcon color={theme.textSecondary} name="project" size={13} />
                  <ThemedText numberOfLines={1} style={styles.listProjectName} type="captionBold">{projectName}</ThemedText>
                  {companyName ? <View style={[styles.companyPill, { backgroundColor: theme.backgroundElement, borderColor: theme.hairline }]}><ThemedText numberOfLines={1} style={styles.companyPillText} themeColor="textSecondary" type="captionBold">{companyName}</ThemedText></View> : null}
                </View>
              ) : null}
              <View style={styles.listContext}>
                {evidence ? <View style={[styles.originDot, { borderColor: theme.accent }]} /> : null}
                <ThemedText numberOfLines={1} style={styles.listContextText} themeColor="textSecondary" type="caption">
                  {[showKey ? shortTaskKey(publicKey) : null, groupName ? `#${groupName.replace(/^#/, '')}` : null, contextLabel, priority !== 'none' ? taskPriorityLabel(priority) : null]
                    .filter(Boolean)
                    .join(' · ')}
                </ThemedText>
              </View>
            </View>
          </Pressable>
          <View style={styles.listTrailing}>
            <View style={styles.listTrailingLine}>
              <TaskDueChip category={category} dueDate={dueDate} />
            </View>
            <View style={styles.listTrailingLine}>
              <TaskStatusPill category={category} label={stateName} onPress={onStatusPress} />
            </View>
          </View>
        </View>
      </View>
    );
  }

  return (
    // The themed fill sits outside the pressable: Android folds a background
    // colour and a ripple into one layered drawable whose repaint never reaches
    // the view, so a card styled that way keeps the old theme until it is
    // touched.
    <View style={[styles.card, board && styles.boardCard, {
      backgroundColor: theme.backgroundElevated,
      borderColor: theme.hairline,
      }]}>
      {focused ? (
        <View style={[styles.focusedTask, { backgroundColor: theme.accentSoft }]}>
          <PlatformIcon color={theme.accentStrong} name="star" size={13} />
          <ThemedText themeColor="accentStrong" type="captionBold">Opened task</ThemedText>
        </View>
      ) : null}
      <View style={styles.boardMeta}>
        <View style={styles.cardKey}>
          <View style={[styles.cardKeyBadge, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText themeColor="textSecondary" type="mono">{shortTaskKey(publicKey)}</ThemedText>
          </View>
          {evidence ? <View style={[styles.originDot, { borderColor: theme.accent }]} /> : null}
        </View>
        <TaskPriorityBadge compact priority={priority} />
      </View>
      <Pressable
        accessibilityHint={onLongPress ? 'Opens the task. Touch and hold to move it.' : 'Opens the task'}
        accessibilityLabel={`${focused ? 'Opened task. ' : ''}${title}, ${stateName}${evidence ? ', linked to conversation evidence' : ''}`}
        accessibilityRole="button"
        android_ripple={{ color: theme.backgroundSelected }}
        delayLongPress={350}
        onLongPress={onLongPress ? () => { hapticLight(); onLongPress(); } : undefined}
        onPress={onPress}
        style={({ pressed }) => [styles.cardPressable, board && styles.boardCardPressable, { opacity: pressed ? 0.84 : 1 }]}>
        <View style={styles.titleRow}>
          {board ? <PlatformIcon color={theme.text} name="check-box-outline" size={17} /> : null}
          <ThemedText numberOfLines={2} style={styles.cardTitle} type="smallBold">{title}</ThemedText>
        </View>
        {!board && contextLabel ? (
          <ThemedText numberOfLines={1} themeColor="textSecondary" type="caption">
            {contextLabel}
          </ThemedText>
        ) : null}
        {board && description ? (
          <ThemedText numberOfLines={1} style={styles.cardDescription} themeColor="textSecondary" type="caption">
            {description}
          </ThemedText>
        ) : null}
        {board && referenceCount > 0 ? (
          <View style={[styles.boardReference, { backgroundColor: theme.backgroundElement }]}>
            <PlatformIcon color={theme.accentStrong} name="link" size={14} />
            <ThemedText numberOfLines={1} style={styles.cardDescription} themeColor="accentStrong" type="caption">
              {referenceCount} {referenceCount === 1 ? 'reference' : 'references'} attached
            </ThemedText>
          </View>
        ) : null}
        <View style={styles.cardFooter}>
          {board ? (
            <View style={styles.boardAssignee}>
              {assignee ? <ColoredAvatar label={assignee} seed={assignee} size={24} /> : <PlatformIcon color={theme.textSecondary} name="person" size={16} />}
              <ThemedText numberOfLines={1} style={styles.assigneeName} themeColor="textSecondary" type="caption">{assignee ?? 'Unassigned'}</ThemedText>
            </View>
          ) : <TaskStatusPill category={category} label={stateName} onPress={onStatusPress} />}
          <View style={styles.cardTrailing}>
            {board ? <TaskDueChip category={category} dueDate={dueDate} /> : null}
            {!board ? <TaskDueChip category={category} dueDate={dueDate} /> : null}
            {!board && assignee ? <ColoredAvatar label={assignee} seed={assignee} size={22} /> : null}
          </View>
        </View>
      </Pressable>
    </View>
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
  tone?: 'neutral' | 'danger' | 'offline' | 'success';
}) {
  const theme = useTheme();
  const danger = tone === 'danger';
  const success = tone === 'success';
  const backgroundColor = success
    ? theme.successSoft
    : danger
    ? theme.dangerSoft
    : tone === 'offline' ? theme.accentSoft : theme.backgroundElement;
  const foreground = success ? theme.success : danger ? theme.danger : tone === 'offline' ? theme.accentStrong : theme.text;
  return (
    <View accessibilityLiveRegion="polite" accessibilityRole="alert" style={[styles.banner, { backgroundColor }]}>
      <PlatformIcon color={foreground} name={icon} size={18} />
      <ThemedText style={[styles.bannerText, { color: foreground }]} type="label">{message}</ThemedText>
      {action ? (
        <Pressable accessibilityRole="button" hitSlop={12} onPress={action.onPress}>
          <ThemedText style={{ color: foreground, textDecorationLine: 'underline' }} type="smallBold">
            {action.label}
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

export function TaskCardSkeletons({ count = 3 }: { count?: number }) {
  const theme = useTheme();
  return (
    <View accessibilityLabel="Loading tasks" style={styles.skeletonList}>
      {Array.from({ length: count }, (_, index) => (
        <View key={index} style={[styles.skeletonCard, { backgroundColor: theme.backgroundElement }]}>
          <View style={[styles.skeletonKey, { backgroundColor: theme.skeleton }]} />
          <View style={[styles.skeletonTitle, { backgroundColor: theme.skeleton }]} />
          <View style={[styles.skeletonTitleShort, { backgroundColor: theme.skeleton }]} />
          <View style={styles.skeletonBottom}>
            <View style={[styles.skeletonPill, { backgroundColor: theme.skeleton }]} />
            <View style={[styles.skeletonAvatar, { backgroundColor: theme.skeleton }]} />
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
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={() => {
        hapticLight();
        onPress();
      }}
      style={[styles.action, {
        backgroundColor: primary ? theme.accent : theme.backgroundSelected,
        opacity: disabled ? 0.5 : 1,
      }]}>
      <ThemedText style={primary ? { color: theme.accentInk } : undefined} type="smallBold">{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  quietAction: { alignItems: 'flex-end', paddingBottom: Spacing.two, paddingRight: Spacing.three },
  quietCopy: { flex: 1, gap: 2, minWidth: 0 },
  quietProjectContext: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one, minWidth: 0 },
  quietProjectName: { flexShrink: 1, maxWidth: '100%' },
  quietCompanyPill: { flexShrink: 0, minHeight: 24 },
  quietDue: { maxWidth: 92, textAlign: 'right' },
  quietPressable: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: Spacing.three, minHeight: 62, minWidth: 0, paddingHorizontal: Spacing.two, paddingTop: Spacing.two },
  quietGlassRow: { borderRadius: Radius.medium, borderWidth: StyleSheet.hairlineWidth, marginBottom: Spacing.two, overflow: 'hidden' },
  quietRow: { borderBottomWidth: StyleSheet.hairlineWidth },
  quietStatus: { borderRadius: Radius.pill, borderWidth: 1.5, height: 18, width: 18 },
  quietCheckbox: { alignItems: 'center', alignSelf: 'stretch', justifyContent: 'center', minHeight: 52, paddingLeft: Spacing.two, width: 42 },
  action: { alignItems: 'center', alignSelf: 'stretch', borderCurve: 'continuous', borderRadius: Radius.medium, justifyContent: 'center', minHeight: TouchTarget, paddingHorizontal: Spacing.four },
  banner: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.medium, flexDirection: 'row', gap: Spacing.two, minHeight: TouchTarget, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  bannerText: { flex: 1 },
  boardCard: { minHeight: 0 },
  boardCardPressable: { justifyContent: 'space-between' },
  boardMeta: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two, justifyContent: 'space-between', minHeight: 30, paddingHorizontal: Spacing.three, paddingTop: Spacing.two },
  card: { borderCurve: 'continuous', borderRadius: Radius.medium, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  cardFooter: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two, justifyContent: 'space-between' },
  cardKey: { alignItems: 'center', flex: 1, flexDirection: 'row', flexShrink: 1, gap: Spacing.one, minWidth: 0 },
  cardKeyBadge: { borderRadius: Radius.small, paddingHorizontal: Spacing.one, paddingVertical: 2 },
  cardPressable: { gap: Spacing.two, padding: Spacing.three },
  cardTitle: { flexShrink: 1 },
  cardDescription: { flexShrink: 1 },
  boardAssignee: { alignItems: 'center', flexDirection: 'row', flexShrink: 1, gap: Spacing.one, minWidth: 0 },
  boardReference: { alignItems: 'center', borderRadius: Radius.small, flexDirection: 'row', gap: Spacing.one, minWidth: 0, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one },
  cardTrailing: { alignItems: 'center', flexDirection: 'row', flexShrink: 1, gap: Spacing.two, justifyContent: 'flex-end' },
  assigneeName: { flexShrink: 1, maxWidth: 90 },
  focusedTask: { alignItems: 'center', alignSelf: 'flex-start', borderRadius: Radius.pill, flexDirection: 'row', gap: 3, marginHorizontal: Spacing.three, marginTop: Spacing.two, paddingHorizontal: Spacing.two, paddingVertical: 3 },
  inlineMeta: { alignItems: 'center', flexDirection: 'row', flexShrink: 1, gap: Spacing.one },
  pressedControl: { opacity: 0.78, transform: [{ scale: 0.98 }] },
  listContext: { alignItems: 'center', flexDirection: 'row', gap: Spacing.one, minWidth: 0 },
  companyPill: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth, maxWidth: '100%', minHeight: 24, paddingHorizontal: Spacing.two, paddingVertical: 2 },
  companyPillText: { flexShrink: 1 },
  listProjectContext: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one, minWidth: 0 },
  listProjectName: { flexShrink: 1, maxWidth: '100%' },
  listContextText: { flexShrink: 1 },
  listCopy: { flex: 1, gap: Spacing.two, minWidth: 0 },
  listLeading: { alignItems: 'center', borderRadius: Radius.medium, height: 40, justifyContent: 'center', width: 40 },
  listRow: { borderCurve: 'continuous', borderRadius: Radius.large, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  listRowContent: { alignItems: 'stretch', flexDirection: 'row', minHeight: 96 },
  listRowPressable: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: Spacing.three, minWidth: 0, paddingHorizontal: Spacing.three, paddingVertical: Spacing.three },
  listTrailing: { alignItems: 'flex-end', gap: Spacing.one, justifyContent: 'center', maxWidth: 116, minHeight: 96, minWidth: 88, paddingRight: Spacing.three, paddingVertical: Spacing.three },
  listTrailingLine: { alignItems: 'flex-end', justifyContent: 'center', minHeight: 18, maxWidth: '100%' },
  originDot: { borderRadius: Radius.pill, borderWidth: 2, height: 8, width: 8 },
  pill: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.pill, flexDirection: 'row', gap: 5, maxWidth: 168, minHeight: 28, paddingHorizontal: Spacing.two, paddingVertical: 5 },
  pillDot: { borderRadius: Radius.pill, height: 8, width: 8 },
  pillLabel: { flexShrink: 1 },
  priority: { alignItems: 'center', flexDirection: 'row', gap: Spacing.one },
  priorityBadge: { borderRadius: Radius.pill, paddingHorizontal: Spacing.two, paddingVertical: 2 },
  segment: { alignItems: 'center', borderRadius: Radius.pill, flexGrow: 0, justifyContent: 'center', minHeight: TouchTarget, minWidth: 104, paddingHorizontal: Spacing.three },
  segmented: { borderCurve: 'continuous', borderRadius: Radius.pill, flexGrow: 0 },
  segmentedContent: { alignItems: 'center', flexDirection: 'row', gap: Spacing.one, padding: Spacing.one },
  skeletonAvatar: { borderRadius: Radius.pill, height: 24, width: 24 },
  skeletonBottom: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.one },
  skeletonCard: { borderRadius: Radius.large, gap: Spacing.two, padding: Spacing.three },
  skeletonKey: { borderRadius: Radius.small, height: 9, width: 54 },
  skeletonList: { gap: Spacing.three },
  skeletonPill: { borderRadius: Radius.medium, height: 22, width: 84 },
  skeletonTitle: { borderRadius: Radius.small, height: 13, width: '84%' },
  skeletonTitleShort: { borderRadius: Radius.small, height: 13, width: '52%' },
  titleRow: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two },
});
