import type { TaskActivityAction } from '@track/shared/tasks';
import { useEffect, useState, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useKeyboardState, useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, { FadeInDown, FadeOut, LinearTransition, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import type { Doc } from '../../../../convex/_generated/dataModel';
import { ColoredAvatar } from '@/components/colored-avatar';
import { CompactPillButton } from '@/components/compact-pill-button';
import { PlatformIcon, type IconName } from '@/components/platform-icon';
import type {
  MobileTaskAssignee,
  MobileTaskDetail,
  MobileTaskListItem,
  TaskEditField,
} from '@/components/task-detail-types';
import { ThemedText } from '@/components/themed-text';
import { ThemedTextInput } from '@/components/themed-text-input';
import { MaxFontScale, Radius, Spacing, TouchTarget, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { hapticMedium } from '@/lib/haptics';
import { useBottomTabBarInset } from '@/hooks/use-bottom-tab-inset';
import {
  taskActivityLabel,
  taskLabelColor,
  taskReferenceBlockedReason,
  taskReferenceLabel,
} from '@/lib/task-presentation';
import { uniqueTaskViews } from '@/lib/unique-task-views';
import { formatTaskUpdateDate, mergeTaskUpdates, taskUpdateDayLabel } from '@/lib/task-updates';

type TaskUpdate = ReturnType<typeof mergeTaskUpdates<Doc<'taskComments'>, Doc<'taskActivities'>>>[number];

export function TaskUpdatesFeed({ assignees, compact = false, emptyMessage = 'No task updates yet', loading, loadingEarlier, onLoadEarlier, updates, workflowStates }: {
  assignees?: MobileTaskAssignee[];
  compact?: boolean;
  emptyMessage?: string;
  loading: boolean;
  loadingEarlier: boolean;
  onLoadEarlier?: () => void;
  updates: TaskUpdate[];
  workflowStates?: Array<{ _id: string; name: string }>;
}) {
  const theme = useTheme();
  const [expandedActivityId, setExpandedActivityId] = useState<string | null>(null);
  let previousDay = '';
  return <View style={styles.updatesFeed}>
    {onLoadEarlier || loadingEarlier ? <LoadMoreButton label="earlier updates" loading={loadingEarlier} onPress={onLoadEarlier} /> : null}
    {updates.length ? updates.map(({ kind, item }) => {
      const day = taskUpdateDayLabel(item.createdAt);
      const showDay = day !== previousDay;
      previousDay = day;
      if (kind === 'comment') {
        const author = assignees?.find((candidate) => candidate.member._id === item.authorProjectMemberId)?.user.displayName ?? 'Project member';
        return <View key={'comment:' + item._id} style={styles.updateEntry}>
          {showDay ? <ThemedText style={styles.dayLabel} themeColor="textSecondary" type="captionBold">{day}</ThemedText> : null}
          <View style={styles.comment}>
            <ColoredAvatar label={author} seed={item.authorProjectMemberId} size={32} />
            <View style={[styles.commentBubble, { backgroundColor: theme.backgroundElevated, borderColor: theme.hairline }]}>
              <View style={styles.commentMeta}>
                <ThemedText type="smallBold">{author}</ThemedText>
                <ThemedText themeColor="textSecondary" type="caption">{formatTimestamp(item.createdAt)}</ThemedText>
              </View>
              <ThemedText numberOfLines={compact ? 2 : undefined} type="small">{item.body}</ThemedText>
            </View>
          </View>
        </View>;
      }
      const presentation = activityPresentation(item, { assignees, workflowStates });
      const expanded = expandedActivityId === item._id;
      const actor = assignees?.find((candidate) => candidate.member._id === item.actorProjectMemberId)?.user.displayName ?? 'A member';
      const canExpand = Boolean(presentation.before || presentation.after);
      return <View key={'activity:' + item._id} style={styles.updateEntry}>
        {showDay ? <ThemedText style={styles.dayLabel} themeColor="textSecondary" type="captionBold">{day}</ThemedText> : null}
        <Pressable accessibilityLabel={actor + ' ' + presentation.title + '. ' + formatTimestamp(item.createdAt)} accessibilityRole={canExpand ? 'button' : 'text'} accessibilityState={canExpand ? { expanded } : undefined} disabled={!canExpand} onPress={() => setExpandedActivityId(expanded ? null : item._id)} style={styles.timelineRow}>
          <View style={styles.timelineRail}>
            <View style={[styles.timelineMarker, { backgroundColor: theme.backgroundElement }]}>
              <PlatformIcon color={theme.textSecondary} name={activityIcon(item.action)} size={15} />
            </View>
          </View>
          <View style={styles.timelineBody}>
            <ThemedText themeColor="textSecondary" type="small">{actor} {presentation.title.charAt(0).toLowerCase() + presentation.title.slice(1)}</ThemedText>
            <ThemedText themeColor="textTertiary" type="caption">{formatTimestamp(item.createdAt)}</ThemedText>
            {expanded && (presentation.before || presentation.after) ? <View style={[styles.activityChange, { backgroundColor: theme.backgroundElement }]}>
              {presentation.before ? <ThemedText themeColor="textSecondary" type="caption">{presentation.before}</ThemedText> : null}
              {presentation.before && presentation.after ? <PlatformIcon color={theme.textTertiary} name="chevron-right" size={13} /> : null}
              {presentation.after ? <ThemedText themeColor="accentStrong" type="captionBold">{presentation.after}</ThemedText> : null}
            </View> : null}
          </View>
        </Pressable>
      </View>;
    }) : loading ? <ThemedText themeColor="textSecondary" type="small">Loading updates…</ThemedText> : <View style={styles.noUpdates}>
      <PlatformIcon color={theme.textTertiary} name="message" size={16} />
      <ThemedText themeColor="textSecondary" type="small">{emptyMessage}</ThemedText>
    </View>}
  </View>;
}

export function TaskOverview({
  busy,
  detail,
  highlightSubtaskId,
  onAddSubtask,
  onChecklistLayout,
  onEditField,
  onOpenSubtask,
  onOpenReference,
  onLoadMoreReferences,
  onSubtaskChange,
  onToggleSubtask,
  readOnly,
  subtask,
  subtasks,
  references,
  referencesLoading,
  referencesLoadingMore,
  onLoadMoreSubtasks,
  subtasksLoadingMore,
}: {
  busy: boolean;
  detail: MobileTaskDetail;
  highlightSubtaskId?: string;
  onAddSubtask: () => void;
  onChecklistLayout: (event: LayoutChangeEvent) => void;
  onEditField: (field: TaskEditField) => void;
  onOpenSubtask: (item: MobileTaskListItem) => void;
  onOpenReference: (reference: Doc<'taskReferences'>) => void;
  onLoadMoreReferences?: () => void;
  onSubtaskChange: (value: string) => void;
  onToggleSubtask: (item: MobileTaskListItem) => void;
  readOnly: boolean;
  subtask: string;
  subtasks: MobileTaskListItem[];
  references: Doc<'taskReferences'>[];
  referencesLoading: boolean;
  referencesLoadingMore: boolean;
  onLoadMoreSubtasks?: () => void;
  subtasksLoadingMore: boolean;
}) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const [expandedSubtaskId, setExpandedSubtaskId] = useState<string | null>(null);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [checklistExpanded, setChecklistExpanded] = useState(false);
  const [sourcesExpanded, setSourcesExpanded] = useState(false);
  const visibleSubtasks = uniqueTaskViews(subtasks);
  const incompleteSubtasks = visibleSubtasks.filter((item) => item.state?.category !== 'completed' && item.state?.category !== 'canceled');
  const displayedSubtasks = checklistExpanded || visibleSubtasks.length <= 5
    ? visibleSubtasks
    : incompleteSubtasks.length ? incompleteSubtasks.slice(0, 3) : visibleSubtasks.slice(0, 3);
  const completedSubtasks = visibleSubtasks.filter((item) =>
    item.state?.category === 'completed' || item.state?.category === 'canceled',
  ).length;
  const checklistProgress = visibleSubtasks.length ? completedSubtasks / visibleSubtasks.length : 0;
  const progress = useSharedValue(checklistProgress);
  useEffect(() => {
    progress.value = withTiming(checklistProgress, { duration: reduceMotion ? 0 : 220 });
  }, [checklistProgress, progress, reduceMotion]);
  const progressStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));
  const labels = detail.labels.flatMap((label) => label ? [label] : []);
  return (
    <>
      {references.length || referencesLoading ? <TaskSection title="References">
        {references.length ? [...references]
          .sort((left, right) => Number(right.isPrimary) - Number(left.isPrimary))
          .slice(0, sourcesExpanded ? references.length : 1)
          .map((reference) => <ReferenceRow key={reference._id} onOpen={onOpenReference} reference={reference} />)
          : <ThemedText themeColor="textSecondary" type="small">Finding the linked source…</ThemedText>}
        {references.length > 1 || onLoadMoreReferences || referencesLoadingMore ? <Pressable accessibilityRole="button" accessibilityState={{ expanded: sourcesExpanded }} onPress={() => {
          setSourcesExpanded((expanded) => !expanded);
          if (!sourcesExpanded && onLoadMoreReferences) onLoadMoreReferences();
        }} style={styles.textAction}>
          <ThemedText themeColor="accentStrong" type="smallBold">{sourcesExpanded ? 'Show primary source' : references.length > 1 ? `View ${references.length - 1} more ${references.length === 2 ? 'source' : 'sources'}` : 'View more sources'}</ThemedText>
        </Pressable> : null}
        {sourcesExpanded && referencesLoadingMore ? <LoadMoreButton label="sources" loading onPress={onLoadMoreReferences} /> : null}
      </TaskSection> : null}

      {detail.task.description || !readOnly ? <TaskSection title="Description" trailing={!readOnly ? <Pressable accessibilityRole="button" onPress={() => onEditField('description')} style={styles.sectionAction}>
        <ThemedText themeColor="accentStrong" type="captionBold">{detail.task.description ? 'Edit' : 'Add'}</ThemedText>
      </Pressable> : undefined}>
        {detail.task.description ? <ThemedText numberOfLines={!descriptionExpanded && detail.task.description.length > 180 ? 4 : undefined} selectable type="small">
          {detail.task.description}
        </ThemedText> : <Pressable accessibilityHint="Adds a description to explain this task" accessibilityRole="button" onPress={() => onEditField('description')} style={styles.descriptionPrompt}>
          <PlatformIcon color={theme.textTertiary} name="plus" size={16} />
          <ThemedText themeColor="textSecondary" type="small">Add a short description</ThemedText>
        </Pressable>}
        {detail.task.description && detail.task.description.length > 180 ? <Pressable accessibilityRole="button" onPress={() => setDescriptionExpanded((current) => !current)} style={styles.textAction}>
          <ThemedText themeColor="accentStrong" type="smallBold">{descriptionExpanded ? 'Show less' : 'Show more'}</ThemedText>
        </Pressable> : null}
      </TaskSection> : null}

      {visibleSubtasks.length || (!readOnly && !detail.task.parentTaskId) ? <View onLayout={onChecklistLayout}>
        <TaskSection title="Checklist" trailing={visibleSubtasks.length ? `${completedSubtasks}/${visibleSubtasks.length}` : undefined}>
          {visibleSubtasks.length ? (
            <>
              <View
                accessibilityLabel="Checklist progress"
                accessibilityRole="progressbar"
                accessibilityValue={{ min: 0, max: visibleSubtasks.length, now: completedSubtasks }}
                style={[styles.progressTrack, { backgroundColor: theme.backgroundElement }]}>
                <Animated.View style={[styles.progressValue, progressStyle, {
                  backgroundColor: theme.accent,
                }]} />
              </View>
              <Animated.View layout={reduceMotion ? undefined : LinearTransition.duration(180)} style={[styles.checklist, { backgroundColor: theme.backgroundElement }]}>
                {displayedSubtasks.map((item, index) => {
                  const complete = item.state?.category === 'completed' || item.state?.category === 'canceled';
                  const description = item.task.description?.trim();
                  const expanded = expandedSubtaskId === item.task._id;
                  return (
                    <View
                      key={item.task._id}
                      style={[styles.checkItem, item.task._id === highlightSubtaskId && { backgroundColor: theme.accentSoft }, index > 0 && {
                        borderTopColor: theme.hairline,
                        borderTopWidth: StyleSheet.hairlineWidth,
                      }]}>
                      <View style={styles.checkRow}>
                        <Pressable
                          accessibilityLabel={`${complete ? 'Mark incomplete' : 'Mark complete'}: ${item.task.title}`}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: complete, disabled: readOnly || busy }}
                          disabled={readOnly || busy}
                          onPress={() => onToggleSubtask(item)}
                          style={styles.checkToggle}>
                          <PlatformIcon color={complete ? theme.accent : theme.textSecondary} name={complete ? 'check-box' : 'check-box-outline'} size={22} weight="medium" />
                        </Pressable>
                        <Pressable
                          accessibilityHint={description ? 'Expands the checklist item description' : 'Opens the checklist item details'}
                          accessibilityRole="button"
                          onPress={() => description
                            ? setExpandedSubtaskId((current) => current === item.task._id ? null : item.task._id)
                            : onOpenSubtask(item)}
                          style={styles.checkCopy}>
                          <ThemedText numberOfLines={expanded ? undefined : 2} style={[styles.checkLabel, complete && {
                            color: theme.textSecondary,
                            textDecorationLine: 'line-through',
                          }]} type="small">
                            {item.task.title}
                          </ThemedText>
                        </Pressable>
                        <PlatformIcon color={theme.textTertiary} name={description ? (expanded ? 'chevron-up' : 'chevron-down') : 'chevron-right'} size={18} />
                      </View>
                      {expanded && description ? (
                        <Animated.View
                          entering={reduceMotion ? undefined : FadeInDown.duration(160)}
                          exiting={reduceMotion ? undefined : FadeOut.duration(120)}
                          layout={reduceMotion ? undefined : LinearTransition.duration(180)}
                          style={[styles.checkDescription, { borderTopColor: theme.hairline }]}>
                          <ThemedText type="small">{description}</ThemedText>
                          <Pressable accessibilityRole="button" onPress={() => onOpenSubtask(item)} style={styles.checkDetailsAction}>
                            <ThemedText themeColor="accentStrong" type="smallBold">Open details</ThemedText>
                            <PlatformIcon color={theme.accentStrong} name="chevron-right" size={16} />
                          </Pressable>
                        </Animated.View>
                      ) : null}
                    </View>
                  );
                })}
              </Animated.View>
              {visibleSubtasks.length > 5 ? <Pressable accessibilityRole="button" onPress={() => setChecklistExpanded((current) => !current)} style={styles.textAction}>
                <ThemedText themeColor="accentStrong" type="smallBold">{checklistExpanded ? 'Show fewer' : `Show all ${visibleSubtasks.length}`}</ThemedText>
              </Pressable> : null}
            </>
          ) : null}
          {onLoadMoreSubtasks || subtasksLoadingMore ? <LoadMoreButton label="checklist items" loading={subtasksLoadingMore} onPress={onLoadMoreSubtasks} /> : null}
          {!readOnly && !detail.task.parentTaskId ? (
            <View style={styles.addSubtask}>
              <ThemedTextInput
                accessibilityLabel="New checklist item"
                allowFontScaling
                maxFontSizeMultiplier={MaxFontScale}
                keyboardAppearance={theme.background === '#1b1917' ? 'dark' : 'light'}
                onChangeText={onSubtaskChange}
                placeholder="Add a checklist item"
                placeholderTextColor={theme.textSecondary}
                style={[styles.inlineInput, {
                  backgroundColor: theme.backgroundElement,
                  borderColor: theme.hairline,
                  color: theme.text,
                }]}
                value={subtask}
              />
              <Pressable
                accessibilityLabel="Add checklist item"
                accessibilityRole="button"
                accessibilityState={{ disabled: !subtask.trim() || busy }}
                disabled={!subtask.trim() || busy}
                onPress={onAddSubtask}
                style={[styles.addButton, {
                  backgroundColor: theme.backgroundSelected,
                  opacity: subtask.trim() ? 1 : 0.5,
                }]}>
                <PlatformIcon color={theme.text} name="plus" size={20} />
              </Pressable>
            </View>
          ) : null}
        </TaskSection>
      </View> : null}

      {labels.length || !readOnly ? <TaskSection title="Labels">
        <View style={styles.chips}>
          {labels.map((label) => <View key={label._id} style={[styles.label, { backgroundColor: theme.backgroundElement }]}>
            <View style={[styles.labelDot, { backgroundColor: taskLabelColor(label.colorToken, theme.accent) }]} />
            <ThemedText type="smallBold">{label.name}</ThemedText>
          </View>)}
          {!readOnly ? <CompactPillButton accessibilityLabel={labels.length ? 'Edit labels' : 'Add labels'} accessibilityRole="button" onPress={() => onEditField('labels')} pillStyle={{ backgroundColor: theme.backgroundElement, borderColor: theme.hairline }}>
            <PlatformIcon color={theme.textSecondary} name="tag" size={16} weight="medium" />
            <ThemedText themeColor="textSecondary" type="smallBold">{labels.length ? 'Edit' : 'Add labels'}</ThemedText>
          </CompactPillButton> : null}
        </View>
      </TaskSection> : null}
    </>
  );
}

/**
 * Evidence is the reason a task exists, so an available reference opens the
 * message that produced it. A blocked one says why and stays inert.
 */
function ReferenceRow({
  onOpen,
  reference,
}: {
  onOpen: (reference: Doc<'taskReferences'>) => void;
  reference: Doc<'taskReferences'>;
}) {
  const theme = useTheme();
  const blocked = taskReferenceBlockedReason(reference.availability, Boolean(reference.groupId));
  return (
    <Pressable
      accessibilityHint={blocked ?? 'Opens the original message'}
      accessibilityRole={blocked ? 'text' : 'link'}
      accessibilityState={{ disabled: Boolean(blocked) }}
      disabled={Boolean(blocked)}
      onPress={() => onOpen(reference)}
      style={({ pressed }) => [styles.sourceRow, { backgroundColor: pressed ? theme.backgroundSelected : 'transparent' }]}>
      <View style={[styles.sourceIcon, { backgroundColor: theme.backgroundElement }]}>
        <PlatformIcon color={blocked ? theme.textTertiary : theme.accentStrong} name={blocked ? 'shield-lock-outline' : 'message'} size={16} />
      </View>
      <View style={styles.sourceCopy}>
        <ThemedText numberOfLines={1} type="smallBold">{taskReferenceLabel(reference.type)}</ThemedText>
        {reference.quote ? (
          <ThemedText numberOfLines={2} themeColor="textSecondary" type="caption">{reference.quote}</ThemedText>
        ) : null}
        {blocked ? <ThemedText themeColor="textSecondary" type="caption">{blocked}</ThemedText> : null}
      </View>
      {blocked ? null : <PlatformIcon color={theme.textTertiary} name="chevron-right" size={17} />}
    </Pressable>
  );
}


function activityIcon(action: TaskActivityAction): IconName {
  if (action === 'created' || action === 'restored') return 'check-circle';
  if (action === 'commented') return 'message';
  if (action === 'priority_changed') return 'flag';
  if (action === 'assignee_changed') return 'account-edit-outline';
  if (action === 'state_changed') return 'chevron-right';
  if (action === 'archived') return 'archive';
  if (action === 'due_date_changed') return 'calendar';
  return 'edit';
}

function activityValue(value: unknown, options: { assignees?: MobileTaskAssignee[]; workflowStates?: Array<{ _id: string; name: string }> }): string | undefined {
  if (typeof value === 'string') {
    const state = options.workflowStates?.find((candidate) => candidate._id === value);
    if (state) return state.name;
    const assignee = options.assignees?.find((candidate) => candidate.member._id === value);
    if (assignee) return assignee.user.displayName;
    return value.length > 40 && /^[a-z0-9]+$/i.test(value) ? undefined : value;
  }
  if (typeof value === 'number') return String(value);
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  for (const key of ['name', 'displayName', 'title', 'label', 'value', 'date']) {
    const candidate = record[key];
    const resolved: string | undefined = activityValue(candidate, options);
    if (resolved) return resolved;
  }
  return undefined;
}

type ActivityPresentation = {
  title: string;
  detail?: string;
  before?: string;
  after?: string;
};

function activityPresentation(item: Doc<'taskActivities'>, options: { assignees?: MobileTaskAssignee[]; workflowStates?: Array<{ _id: string; name: string }> }): ActivityPresentation {
  const before = activityValue(item.before, options);
  const after = activityValue(item.after, options);
  switch (item.action) {
    case 'created': return { title: 'Created task', detail: 'Task added to the Project board.' };
    case 'state_changed': return { title: `Moved status${after ? ` to ${after}` : ''}`, detail: undefined, before, after };
    case 'priority_changed': return { title: `Changed priority${after ? ` to ${after}` : ''}`, detail: undefined, before, after };
    case 'assignee_changed': return { title: after ? `Assigned task to ${after}` : 'Removed task assignee', detail: undefined, before, after };
    case 'due_date_changed': {
      const readableBefore = before ? formatTaskUpdateDate(before) : undefined;
      const readableAfter = after ? formatTaskUpdateDate(after) : undefined;
      return { title: readableAfter ? `Set due date to ${readableAfter}` : 'Removed due date', detail: undefined, before: readableBefore, after: readableAfter };
    }
    case 'title_changed': return { title: 'Renamed task', detail: undefined, before, after };
    case 'description_changed': return { title: 'Updated task description', detail: 'The task context changed.' };
    case 'labels_changed': return { title: 'Updated labels', detail: undefined, before, after };
    case 'board_changed': return { title: `Moved task${after ? ` to ${after}` : ''}`, detail: undefined, before, after };
    case 'scope_changed': return { title: 'Changed task scope', detail: 'Access boundaries were updated.' };
    case 'commented': return { title: 'Added a comment', detail: 'A new discussion note was added to this task.' };
    case 'archived': return { title: 'Archived task', detail: 'The task was removed from active work.' };
    case 'restored': return { title: 'Restored task', detail: 'The task is active again.' };
    default: return { title: taskActivityLabel(item.action), detail: undefined, before, after };
  }
}

export function TaskCommentComposer({
  assignees,
  busy,
  mentionIds,
  onCancel,
  onChangeText,
  onMentionToggle,
  onSend,
  value,
}: {
  assignees?: MobileTaskAssignee[];
  busy: boolean;
  mentionIds: Array<string>;
  onCancel: () => void;
  onChangeText: (value: string) => void;
  onMentionToggle: (memberId: string) => void;
  onSend: () => void;
  value: string;
}) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const bottomTabBarInset = useBottomTabBarInset();
  const keyboardVisible = useKeyboardState((state) => state.isVisible);
  const keyboard = useReanimatedKeyboardAnimation();
  const keyboardStyle = useAnimatedStyle(() => ({ paddingBottom: Math.max(Spacing.three, -keyboard.height.value) }));
  const canSend = value.trim().length > 0 && !busy;
  const mentionQuery = value.match(/@([^\s@]*)$/)?.[1];
  const matchingAssignees = mentionQuery === undefined ? [] : (assignees ?? [])
    .filter((item) => item.user.displayName.toLowerCase().includes(mentionQuery.toLowerCase()))
    .slice(0, 5);

  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeInDown.duration(180)}
      exiting={reduceMotion ? undefined : FadeOut.duration(130)}
      style={[styles.composer, keyboardStyle, {
      backgroundColor: theme.background,
      borderTopColor: theme.hairline,
      marginBottom: keyboardVisible ? 0 : bottomTabBarInset,
    }]}>
      {matchingAssignees.length ? (
        <ScrollView
          contentContainerStyle={styles.mentionRow}
          horizontal
          keyboardShouldPersistTaps="handled"
          showsHorizontalScrollIndicator={false}>
          {matchingAssignees.map((item) => {
            const selected = mentionIds.includes(item.member._id);
            return (
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected }}
                key={item.member._id}
                onPress={() => {
                  if (!selected) onMentionToggle(item.member._id);
                  onChangeText(value.replace(/@[^\s@]*$/, `@${item.user.displayName} `));
                }}
                style={[styles.mentionChip, {
                  backgroundColor: selected ? theme.accentSoft : theme.backgroundElement,
                  borderColor: selected ? theme.accent : theme.hairline,
                }]}>
                <ThemedText style={{ color: selected ? theme.accentStrong : theme.textSecondary }} type="label">
                  @{item.user.displayName}
                </ThemedText>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
      <View style={styles.composerRow}>
        <Pressable accessibilityLabel="Close update editor" accessibilityRole="button" onPress={onCancel} style={styles.composerClose}>
          <PlatformIcon color={theme.textSecondary} name="close" size={18} />
        </Pressable>
        <ThemedTextInput
          accessibilityLabel="Write an update"
          allowFontScaling
          maxFontSizeMultiplier={MaxFontScale}
          autoFocus
          keyboardAppearance={theme.background === '#1b1917' ? 'dark' : 'light'}
          multiline
          onChangeText={onChangeText}
          placeholder="Write an update…"
          placeholderTextColor={theme.textSecondary}
          style={[styles.composerInput, { backgroundColor: theme.backgroundElement, color: theme.text }]}
          value={value}
        />
        <Pressable
          accessibilityLabel="Send update"
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSend }}
          disabled={!canSend}
          onPress={() => {
            hapticMedium();
            onSend();
          }}
          style={[styles.sendButton, { backgroundColor: theme.accent, opacity: canSend ? 1 : 0.45 }]}>
          <PlatformIcon color={theme.accentInk} name="send" size={19} />
        </Pressable>
      </View>
    </Animated.View>
  );
}

function LoadMoreButton({
  label,
  loading,
  onPress,
}: {
  label: string;
  loading: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={loading}
      onPress={onPress}
      style={styles.loadMoreButton}>
      <ThemedText type="smallBold">{loading ? `Loading more ${label}…` : `Load more ${label}`}</ThemedText>
    </Pressable>
  );
}

function TaskSection({
  children,
  title,
  trailing,
}: {
  children: React.ReactNode;
  title: string;
  trailing?: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeading}>
        <ThemedText accessibilityRole="header" type="subtitle">{title}</ThemedText>
        {typeof trailing === 'string'
          ? <ThemedText themeColor="textSecondary" type="captionBold">{trailing}</ThemedText>
          : trailing ? <View style={styles.sectionTrailing}>{trailing}</View> : null}
      </View>
      {children}
    </View>
  );
}

function formatTimestamp(value: number) {
  return new Date(value).toLocaleString(undefined, {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
  });
}

const styles = StyleSheet.create({
  addButton: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.medium, height: TouchTarget, justifyContent: 'center', width: TouchTarget },
  addSubtask: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two },
  checkCopy: { flex: 1, gap: 2, justifyContent: 'center', minHeight: TouchTarget, minWidth: 0, paddingVertical: Spacing.two },
  checkDescription: { borderTopWidth: StyleSheet.hairlineWidth, gap: Spacing.two, marginLeft: TouchTarget + Spacing.three, paddingBottom: Spacing.three, paddingRight: Spacing.three, paddingTop: Spacing.two },
  checkDetailsAction: { alignItems: 'center', alignSelf: 'flex-start', flexDirection: 'row', gap: Spacing.one, minHeight: TouchTarget },
  checkItem: { minHeight: TouchTarget },
  checkLabel: { flexShrink: 1 },
  checkRow: { alignItems: 'center', flexDirection: 'row', minHeight: TouchTarget, paddingRight: Spacing.three },
  checkToggle: { alignItems: 'center', height: TouchTarget, justifyContent: 'center', width: TouchTarget },
  checklist: { borderCurve: 'continuous', borderRadius: Radius.large, overflow: 'hidden' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  comment: { alignItems: 'flex-start', flexDirection: 'row', gap: Spacing.two },
  commentBubble: { borderCurve: 'continuous', borderRadius: Radius.large, borderWidth: StyleSheet.hairlineWidth, flex: 1, gap: Spacing.one, padding: Spacing.three },
  commentMeta: { alignItems: 'baseline', flexDirection: 'row', gap: Spacing.two, justifyContent: 'space-between' },
  dayLabel: { alignSelf: 'center', paddingVertical: Spacing.two },
  composer: { borderTopWidth: StyleSheet.hairlineWidth, gap: Spacing.two, paddingHorizontal: Spacing.three, paddingTop: Spacing.two },
  composerClose: { alignItems: 'center', height: TouchTarget, justifyContent: 'center', width: TouchTarget },
  composerInput: { ...Typography.message, borderRadius: Radius.xlarge, flex: 1, maxHeight: 112, minHeight: TouchTarget, paddingHorizontal: Spacing.three, paddingVertical: Platform.OS === 'ios' ? 11 : 8 },
  composerRow: { alignItems: 'flex-end', flexDirection: 'row', gap: Spacing.two },
  descriptionPrompt: { alignItems: 'center', alignSelf: 'flex-start', flexDirection: 'row', gap: Spacing.two, minHeight: TouchTarget, paddingHorizontal: Spacing.one },
  inlineInput: { ...Typography.body, borderRadius: Radius.medium, borderWidth: StyleSheet.hairlineWidth, flex: 1, minHeight: TouchTarget, paddingHorizontal: Spacing.three },
  label: { alignItems: 'center', borderRadius: Radius.pill, flexDirection: 'row', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  labelDot: { borderRadius: 4, height: 8, width: 8 },
  loadMoreButton: { alignItems: 'center', borderRadius: Radius.medium, minHeight: TouchTarget, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  mentionChip: { borderCurve: 'continuous', borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
  mentionRow: { gap: Spacing.two },
  progressTrack: { borderRadius: Radius.small, height: 6, overflow: 'hidden' },
  progressValue: { borderRadius: Radius.small, height: 6 },
  noUpdates: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two, minHeight: TouchTarget },
  section: { gap: Spacing.two },
  sectionAction: { alignItems: 'center', justifyContent: 'center', minHeight: TouchTarget, paddingHorizontal: Spacing.one },
  sectionHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  sectionTrailing: { alignItems: 'center', flexDirection: 'row', gap: Spacing.one, maxWidth: '58%' },
  sourceCopy: { flex: 1, gap: 3, minWidth: 0 },
  sourceIcon: { alignItems: 'center', borderRadius: Radius.pill, height: 32, justifyContent: 'center', width: 32 },
  sourceRow: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.medium, flexDirection: 'row', gap: Spacing.two, marginHorizontal: -Spacing.one, minHeight: 54, paddingHorizontal: Spacing.one, paddingVertical: Spacing.one },
  textAction: { alignSelf: 'flex-start', justifyContent: 'center', minHeight: TouchTarget, paddingHorizontal: Spacing.one },
  sendButton: { alignItems: 'center', borderRadius: TouchTarget / 2, height: TouchTarget, justifyContent: 'center', width: TouchTarget },
  activityChange: { alignItems: 'center', borderRadius: Radius.small, flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one },
  timelineBody: { flex: 1, gap: Spacing.one, justifyContent: 'center', minHeight: TouchTarget },
  timelineMarker: { alignItems: 'center', borderRadius: Radius.pill, height: 28, justifyContent: 'center', width: 28 },
  timelineRail: { alignItems: 'center', width: 32 },
  timelineRow: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two, minHeight: TouchTarget },
  updateEntry: { gap: Spacing.one },
  updatesFeed: { gap: Spacing.three },
});
