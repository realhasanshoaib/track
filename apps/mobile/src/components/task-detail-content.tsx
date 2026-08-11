import type { TaskActivityAction } from '@track/shared/tasks';
import { useEffect, useState } from 'react';
import { Keyboard, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ColoredAvatar } from '@/components/colored-avatar';
import { EmptyState } from '@/components/empty-state';
import { PlatformIcon } from '@/components/platform-icon';
import type {
  MobileTaskAssignee,
  MobileTaskDetail,
  MobileTaskListItem,
} from '@/components/task-detail-types';
import { TaskAction } from '@/components/task-ui';
import { ThemedText } from '@/components/themed-text';
import { Spacing, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDate, formatNumber, formatTime, type Locale, useLocale } from '@/i18n';
import { useTranslation } from 'react-i18next';
import { hapticMedium } from '@/lib/haptics';
import {
  taskActivityLabel,
  taskLabelColor,
  taskPriorityLabel,
} from '@/lib/task-presentation';

export function TaskDetailsTab({
  assigneeName,
  busy,
  completedSubtasks,
  detail,
  onAddSubtask,
  onArchive,
  onFollow,
  onSubtaskChange,
  onToggleSubtask,
  readOnly,
  subtask,
  subtasks,
}: {
  assigneeName: string;
  busy: boolean;
  completedSubtasks: number;
  detail: MobileTaskDetail;
  onAddSubtask: () => void;
  onArchive: () => void;
  onFollow: () => void;
  onSubtaskChange: (value: string) => void;
  onToggleSubtask: (item: MobileTaskListItem) => void;
  readOnly: boolean;
  subtask: string;
  subtasks: MobileTaskListItem[];
}) {
  const theme = useTheme();
  const { locale } = useLocale();
  const { t } = useTranslation('work');
  return (
    <>
      <Surface title={t('task.overview')}>
        <MetadataRow icon="person" label={t('common.assignee')} value={assigneeName} />
        <MetadataRow icon="calendar" label={t('common.dueDate')} value={detail.task.dueDate ? formatDate(locale, new Date(`${detail.task.dueDate}T00:00:00`), { day: 'numeric', month: 'short', year: 'numeric' }) : t('common.noDueDate')} />
        <MetadataRow icon="view-column" label={t('common.board')} value={detail.board?.name ?? t('common.archiveReadOnly')} />
        <MetadataRow icon="flag" label={t('common.priority')} value={taskPriorityLabel(detail.task.priority, t)} />
      </Surface>

      <TaskSection title={t('task.description')}>
        <View style={[styles.description, { backgroundColor: theme.backgroundElement, borderColor: theme.hairline }]}>
          <ThemedText contentDirection="auto" style={{ color: detail.task.description ? theme.text : theme.textSecondary }} type="small">
            {detail.task.description || t('task.noDescription')}
          </ThemedText>
        </View>
      </TaskSection>

      {detail.labels.length ? (
        <TaskSection title={t('task.labels')}>
          <View style={styles.chips}>
            {detail.labels.map((label) => (
              <View key={label._id} style={[styles.label, { backgroundColor: theme.backgroundElement }]}>
                <View style={[styles.labelDot, { backgroundColor: taskLabelColor(label.colorToken, theme.accent) }]} />
                <ThemedText contentDirection="auto" type="smallBold">{label.name}</ThemedText>
              </View>
            ))}
          </View>
        </TaskSection>
      ) : null}

      <TaskSection title={t('task.checklist')} trailing={subtasks.length ? `${formatNumber(locale, completedSubtasks)}/${formatNumber(locale, subtasks.length)}` : undefined}>
        {subtasks.length ? (
          <>
            <View style={[styles.progressTrack, { backgroundColor: theme.backgroundElement }]}>
              <View style={[styles.progressValue, {
                backgroundColor: theme.accent,
                width: `${(completedSubtasks / subtasks.length) * 100}%`,
              }]} />
            </View>
            <View style={[styles.checklist, { backgroundColor: theme.backgroundElement }]}>
              {subtasks.map((item, index) => {
                const complete = item.state?.category === 'completed' || item.state?.category === 'canceled';
                return (
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: complete, disabled: readOnly }}
                    disabled={readOnly || busy}
                    key={item.task._id}
                    onPress={() => onToggleSubtask(item)}
                    style={[styles.checkRow, index > 0 && {
                      borderTopColor: theme.hairline,
                      borderTopWidth: StyleSheet.hairlineWidth,
                    }]}>
                    <PlatformIcon color={complete ? theme.accent : theme.textSecondary} name={complete ? 'check-box' : 'check-box-outline'} size={21} />
                    <ThemedText contentDirection="auto" style={[styles.checkLabel, complete && {
                      color: theme.textSecondary,
                      textDecorationLine: 'line-through',
                    }]} type="small">
                      {item.task.title}
                    </ThemedText>
                    <ThemedText contentDirection="auto" style={{ color: theme.textSecondary }} type="code">{item.state?.name ?? t('common.unknown')}</ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : <ThemedText style={{ color: theme.textSecondary }} type="small">{t('task.noChecklist')}</ThemedText>}
        {!readOnly && !detail.task.parentTaskId ? (
          <View style={styles.addSubtask}>
            <TextInput
              accessibilityLabel={t('task.newChecklistItem')}
              allowFontScaling
              onChangeText={onSubtaskChange}
              placeholder={t('task.addChecklistItem')}
              placeholderTextColor={theme.textSecondary}
              style={[styles.inlineInput, {
                backgroundColor: theme.backgroundElement,
                borderColor: theme.hairline,
                color: theme.text,
              }]}
              value={subtask}
            />
            <Pressable
              accessibilityLabel={t('task.addChecklistAccessibility')}
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

      <TaskSection title={t('task.linkedContext')}>
        {detail.references.length ? detail.references.map((reference) => (
          <View key={reference._id} style={[styles.evidence, {
            backgroundColor: theme.backgroundElement,
            borderColor: theme.hairline,
          }]}>
            <View style={styles.evidenceHeader}>
              <PlatformIcon color={theme.accent} name="link" size={17} />
              <ThemedText type="smallBold">
                {referenceTypeLabel(reference.type, t)}
              </ThemedText>
            </View>
            <ThemedText contentDirection="auto" style={{ color: theme.textSecondary }} type="small">
              {reference.quote ?? (reference.availability === 'redacted'
                ? t('task.evidenceRedacted')
                : t('task.evidenceUnavailable'))}
            </ThemedText>
          </View>
        )) : (
          <View style={[styles.description, { backgroundColor: theme.backgroundElement, borderColor: theme.hairline }]}>
            <ThemedText style={{ color: theme.textSecondary }} type="small">{t('task.noLinkedContext')}</ThemedText>
          </View>
        )}
      </TaskSection>

      {detail.capabilities.canComment || detail.capabilities.canArchive ? (
        <View style={styles.actions}>
          {detail.capabilities.canComment ? (
            <TaskAction label={detail.following ? t('task.unfollow') : t('task.follow')} onPress={onFollow} />
          ) : null}
          {detail.capabilities.canArchive ? (
            <TaskAction label={detail.task.archivedAt ? t('task.restore') : t('task.archive')} onPress={onArchive} />
          ) : null}
        </View>
      ) : null}
    </>
  );
}

export function TaskDiscussionTab({
  assignees,
  detail,
}: {
  assignees?: MobileTaskAssignee[];
  detail: MobileTaskDetail;
}) {
  const theme = useTheme();
  const { locale } = useLocale();
  const { t } = useTranslation('work');
  const comments = detail.comments.filter((item) => !item.archivedAt);
  return (
    <TaskSection title={t('task.comments', { count: comments.length, formattedCount: formatNumber(locale, comments.length) })}>
      {comments.length ? comments.map((item) => {
        const author = assignees?.find((candidate) => candidate.member._id === item.authorProjectMemberId)?.user.displayName
          ?? t('task.projectMember');
        return (
          <View key={item._id} style={styles.comment}>
            <ColoredAvatar label={author} seed={item.authorProjectMemberId} size={32} />
            <View style={[styles.commentBubble, { backgroundColor: theme.backgroundElement }]}>
              <View style={styles.commentMeta}>
                <ThemedText contentDirection="auto" type="smallBold">{author}</ThemedText>
                <ThemedText contentDirection="auto" style={{ color: theme.textSecondary }} type="code">{formatTimestamp(locale, item.createdAt)}</ThemedText>
              </View>
              <ThemedText contentDirection="auto" type="small">{item.body}</ThemedText>
            </View>
          </View>
        );
      }) : <EmptyState icon="forum-outline" title={t('task.startDiscussion')} body={t('task.discussionBody')} />}
    </TaskSection>
  );
}

export function TaskActivityTab({ detail }: { detail: MobileTaskDetail }) {
  const theme = useTheme();
  const { locale } = useLocale();
  const { t } = useTranslation('work');
  return (
    <TaskSection title={t('task.recentActivity')}>
      {detail.activities.length ? detail.activities.map((item, index) => (
        <View key={item._id} style={styles.timelineRow}>
          <View style={styles.timelineRail}>
            <View style={[styles.timelineDot, { backgroundColor: theme.accent }]} />
            {index < detail.activities.length - 1 ? <View style={[styles.timelineLine, { backgroundColor: theme.hairline }]} /> : null}
          </View>
          <View style={styles.timelineBody}>
            <ThemedText type="smallBold">{taskActivityLabel(item.action as TaskActivityAction, t)}</ThemedText>
            <ThemedText contentDirection="auto" style={{ color: theme.textSecondary }} type="code">{formatTimestamp(locale, item.createdAt)}</ThemedText>
          </View>
        </View>
      )) : <ThemedText style={{ color: theme.textSecondary }} type="small">{t('task.noActivity')}</ThemedText>}
    </TaskSection>
  );
}

export function TaskCommentComposer({
  assignees,
  busy,
  mentionIds,
  onChangeText,
  onMentionToggle,
  onSend,
  value,
}: {
  assignees?: MobileTaskAssignee[];
  busy: boolean;
  mentionIds: Array<string>;
  onChangeText: (value: string) => void;
  onMentionToggle: (memberId: string) => void;
  onSend: () => void;
  value: string;
}) {
  const theme = useTheme();
  const { t } = useTranslation('work');
  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(Keyboard.isVisible());
  const canSend = value.trim().length > 0 && !busy;

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return (
    <View style={[styles.composer, {
      backgroundColor: theme.background,
      borderTopColor: theme.hairline,
      paddingBottom: keyboardVisible ? Spacing.two : Math.max(insets.bottom, Spacing.three),
    }]}>
      {assignees?.length ? (
        <ScrollView
          contentContainerStyle={styles.mentionRow}
          horizontal
          keyboardShouldPersistTaps="handled"
          showsHorizontalScrollIndicator={false}>
          {assignees.map((item) => {
            const selected = mentionIds.includes(item.member._id);
            return (
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected }}
                key={item.member._id}
                onPress={() => onMentionToggle(item.member._id)}
                style={[styles.mentionChip, {
                  backgroundColor: selected ? theme.accentSoft : theme.backgroundElement,
                  borderColor: selected ? theme.accent : theme.hairline,
                }]}>
                <ThemedText contentDirection="auto" style={{ color: selected ? theme.accent : theme.textSecondary }} type="code">
                  @{item.user.displayName}
                </ThemedText>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
      <View style={styles.composerRow}>
        <TextInput
          accessibilityLabel={t('task.commentAccessibility')}
          allowFontScaling
          multiline
          onChangeText={onChangeText}
          placeholder={t('task.commentPlaceholder')}
          placeholderTextColor={theme.textSecondary}
          style={[styles.composerInput, { backgroundColor: theme.backgroundElement, color: theme.text }]}
          value={value}
        />
        <Pressable
          accessibilityLabel={t('task.sendComment')}
          disabled={!canSend}
          onPress={() => {
            hapticMedium();
            onSend();
          }}
          style={[styles.sendButton, { backgroundColor: theme.accent, opacity: canSend ? 1 : 0.45 }]}>
          <PlatformIcon color="#1b1917" name="arrow-up" size={19} />
        </Pressable>
      </View>
    </View>
  );
}

function Surface({ children, title }: { children: React.ReactNode; title: string }) {
  const theme = useTheme();
  return (
    <TaskSection title={title}>
      <View style={[styles.surface, { backgroundColor: theme.backgroundElement }]}>{children}</View>
    </TaskSection>
  );
}

function TaskSection({
  children,
  title,
  trailing,
}: {
  children: React.ReactNode;
  title: string;
  trailing?: string;
}) {
  const theme = useTheme();
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeading}>
        <ThemedText type="subtitle">{title}</ThemedText>
        {trailing ? <ThemedText style={{ color: theme.textSecondary }} type="code">{trailing}</ThemedText> : null}
      </View>
      {children}
    </View>
  );
}

function MetadataRow({
  icon,
  label,
  value,
}: {
  icon: React.ComponentProps<typeof PlatformIcon>['name'];
  label: string;
  value: string;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.metadataRow, { borderBottomColor: theme.hairline }]}>
      <PlatformIcon color={theme.textSecondary} name={icon} size={18} />
      <ThemedText style={[styles.metadataLabel, { color: theme.textSecondary }]} type="small">{label}</ThemedText>
      <ThemedText contentDirection="auto" numberOfLines={1} style={styles.metadataValue} type="smallBold">{value}</ThemedText>
    </View>
  );
}

function referenceTypeLabel(type: string, t: (key: string) => string) {
  if (type === 'message') return t('task.conversationMessage');
  if (type === 'attachment') return t('task.referenceTypeAttachment');
  if (type === 'assistant_answer') return t('task.referenceTypeAssistantAnswer');
  if (type === 'memory_excerpt') return t('task.referenceTypeMemoryExcerpt');
  return t('task.referenceTypeUnknown');
}

function formatTimestamp(locale: Locale, value: number) {
  const date = formatDate(locale, value, { day: 'numeric', month: 'short' });
  const time = formatTime(locale, value, { hour: 'numeric', minute: '2-digit' });
  return `${date}, ${time}`;
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  addButton: { alignItems: 'center', borderRadius: 10, height: TouchTarget, justifyContent: 'center', width: TouchTarget },
  addSubtask: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two },
  checkLabel: { flex: 1 },
  checkRow: { alignItems: 'center', flexDirection: 'row', gap: Spacing.three, minHeight: TouchTarget, paddingHorizontal: Spacing.three },
  checklist: { borderRadius: 12, overflow: 'hidden' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  comment: { alignItems: 'flex-start', flexDirection: 'row', gap: Spacing.two },
  commentBubble: { borderRadius: 12, borderStartStartRadius: 4, flex: 1, gap: Spacing.one, padding: Spacing.three },
  commentMeta: { alignItems: 'baseline', flexDirection: 'row', gap: Spacing.two, justifyContent: 'space-between' },
  composer: { borderTopWidth: StyleSheet.hairlineWidth, gap: Spacing.two, paddingHorizontal: Spacing.three, paddingTop: Spacing.two },
  composerInput: { borderRadius: 20, flex: 1, fontSize: 14, lineHeight: 20, maxHeight: 112, minHeight: TouchTarget, paddingHorizontal: Spacing.three, paddingVertical: Platform.OS === 'ios' ? 11 : 8 },
  composerRow: { alignItems: 'flex-end', flexDirection: 'row', gap: Spacing.two },
  description: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, minHeight: 72, padding: Spacing.three },
  evidence: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, gap: Spacing.two, padding: Spacing.three },
  evidenceHeader: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two },
  inlineInput: { borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, flex: 1, fontSize: 14, minHeight: TouchTarget, paddingHorizontal: Spacing.three },
  label: { alignItems: 'center', borderRadius: 999, flexDirection: 'row', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  labelDot: { borderRadius: 4, height: 8, width: 8 },
  metadataLabel: { flex: 1 },
  metadataRow: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: Spacing.three, minHeight: TouchTarget, paddingHorizontal: Spacing.three },
  metadataValue: { maxWidth: '48%' },
  mentionChip: { borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
  mentionRow: { gap: Spacing.two },
  progressTrack: { borderRadius: 3, height: 6, overflow: 'hidden' },
  progressValue: { borderRadius: 3, height: 6 },
  section: { gap: Spacing.two },
  sectionHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  sendButton: { alignItems: 'center', borderRadius: TouchTarget / 2, height: TouchTarget, justifyContent: 'center', width: TouchTarget },
  surface: { borderRadius: 12, overflow: 'hidden' },
  timelineBody: { flex: 1, gap: 2, paddingBottom: Spacing.four },
  timelineDot: { borderRadius: 5, height: 10, marginTop: 5, width: 10 },
  timelineLine: { flex: 1, marginBottom: -5, marginTop: Spacing.one, width: 2 },
  timelineRail: { alignItems: 'center', width: 16 },
  timelineRow: { flexDirection: 'row', gap: Spacing.three, minHeight: 58 },
});
