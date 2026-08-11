import { ScrollView, StyleSheet, View } from 'react-native';

import type { Doc, Id } from '../../../../convex/_generated/dataModel';
import { EmptyState } from '@/components/empty-state';
import { PlatformIcon } from '@/components/platform-icon';
import {
  TaskAction,
  TaskCard,
  TaskCardSkeletons,
  TaskStatusPill,
} from '@/components/task-ui';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatNumber, useLocale } from '@/i18n';
import { useTranslation } from 'react-i18next';

export type MobileTaskView = {
  task: Doc<'tasks'>;
  state: Doc<'taskWorkflowStates'> | null;
  assignee: Doc<'projectMembers'> | null;
  references: Array<Doc<'taskReferences'>>;
};

export type MobileBoardView = {
  board: Doc<'taskBoards'>;
  states: Array<Doc<'taskWorkflowStates'>>;
};

export type MobileSuggestionView = {
  suggestion: Doc<'taskSuggestions'>;
  references: Array<Doc<'taskSuggestionReferences'>>;
  canDismiss: boolean;
  possibleDuplicateTask: { _id: Id<'tasks'>; publicKey: string; title: string } | null;
  proposedAssignee: { user: { displayName: string }; company: Doc<'companies'> | null } | null;
};

export function TaskCollection({
  assigneeName,
  counts,
  grouped,
  onCreate,
  onOpen,
  onViewAll,
  readOnly,
  selectedBoard,
  tab,
  tasks,
}: {
  assigneeName: (item: MobileTaskView) => string | undefined;
  counts: Record<string, number>;
  grouped: Array<{ stateId: string; tasks: MobileTaskView[] }>;
  onCreate: () => void;
  onOpen: (item: MobileTaskView) => void;
  onViewAll: () => void;
  readOnly: boolean;
  selectedBoard?: MobileBoardView;
  tab: 'board' | 'my' | 'all';
  tasks?: MobileTaskView[];
}) {
  const theme = useTheme();
  const { locale, direction } = useLocale();
  const { t } = useTranslation('work');
  if (tasks === undefined) return <TaskCardSkeletons count={4} />;
  if (!selectedBoard && tab === 'board') {
    return (
      <TaskEmptyState
        body={t('suggestions.noBoardBody')}
        buttonLabel={readOnly ? undefined : t('tasks.createAction')}
        icon="view-column"
        onPress={onCreate}
        title={t('suggestions.noBoard')}
      />
    );
  }
  if (!tasks.length) {
    return (
      <TaskEmptyState
        body={tab === 'my'
          ? t('suggestions.nothingAssignedBody')
          : t('suggestions.noTasksBody')}
        buttonLabel={tab === 'my' ? t('common.viewAllTasks') : readOnly ? undefined : t('tasks.createAction')}
        icon="check-box-outline"
        onPress={tab === 'my' ? onViewAll : onCreate}
        title={tab === 'my' ? t('suggestions.nothingAssigned') : t('suggestions.noTasks')}
      />
    );
  }

  if (tab !== 'board') {
    return (
      <View style={styles.list}>
        {tasks.map((item) => (
          <TaskCard
            assignee={assigneeName(item)}
            category={item.state?.category}
            dueDate={item.task.dueDate}
            key={item.task._id}
            linkedContext={item.references[0] ? t('suggestions.linkedConversation') : undefined}
            onPress={() => onOpen(item)}
            priority={item.task.priority}
            publicKey={item.task.publicKey}
            stateName={item.state?.name ?? t('common.unknown')}
            title={item.task.title}
          />
        ))}
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={[styles.board, direction === 'rtl' && styles.boardRtl]} horizontal showsHorizontalScrollIndicator={false}>
      {grouped.map((group) => {
        const state = selectedBoard?.states.find((item) => item._id === group.stateId);
        return (
          <View key={group.stateId} style={[styles.column, { backgroundColor: theme.background }]}>
            <View style={styles.columnHeading}>
              <TaskStatusPill category={state?.category} label={state?.name ?? t('common.unknown')} />
              <ThemedText contentDirection="ltr" style={{ color: theme.textSecondary }} type="code">{formatNumber(locale, counts[group.stateId] ?? 0)}</ThemedText>
            </View>
            {group.tasks.map((item) => (
              <TaskCard
                assignee={assigneeName(item)}
                category={item.state?.category}
                compact
                dueDate={item.task.dueDate}
                key={item.task._id}
                linkedContext={item.references[0] ? t('suggestions.linkedConversation') : undefined}
                onPress={() => onOpen(item)}
                priority={item.task.priority}
                publicKey={item.task.publicKey}
                stateName={item.state?.name ?? t('common.unknown')}
                title={item.task.title}
              />
            ))}
            {!group.tasks.length ? (
              <View style={[styles.columnEmpty, { borderColor: theme.hairline }]}>
                <ThemedText style={{ color: theme.textSecondary }} type="small">{t('suggestions.columnEmpty')}</ThemedText>
              </View>
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

export function SuggestionInbox({
  onAccept,
  onDismiss,
  onHide,
  onLink,
  readOnly,
  suggestions,
}: {
  onAccept: (row: MobileSuggestionView) => void;
  onDismiss: (row: MobileSuggestionView) => void;
  onHide: (row: MobileSuggestionView) => void;
  onLink: (row: MobileSuggestionView) => void;
  readOnly: boolean;
  suggestions?: MobileSuggestionView[];
}) {
  const theme = useTheme();
  const { locale } = useLocale();
  const { t } = useTranslation('work');
  if (readOnly) {
    return <EmptyState icon="shield-lock-outline" title={t('suggestions.noArchivedInbox')} body={t('suggestions.noArchivedInboxBody')} />;
  }
  if (suggestions === undefined) return <TaskCardSkeletons count={3} />;
  if (!suggestions.length) {
    return <EmptyState icon="inbox" title={t('suggestions.clear')} body={t('suggestions.clearBody')} />;
  }

  return (
    <View style={styles.list}>
      {suggestions.map((row) => (
        <View key={row.suggestion._id} style={[styles.suggestion, {
          backgroundColor: theme.backgroundElement,
          borderColor: theme.hairline,
        }]}>
          <View style={styles.cardEyebrow}>
            <View style={[styles.confidence, { backgroundColor: theme.accentSoft }]}>
              <ThemedText contentDirection="auto" type="code">{t('suggestions.confidence', { percent: formatNumber(locale, Math.round(row.suggestion.confidence * 100)) })}</ThemedText>
            </View>
            <PlatformIcon color={theme.textSecondary} name="forum-outline" size={18} />
          </View>
          <ThemedText contentDirection="auto" type="subtitle">{row.suggestion.proposedTitle}</ThemedText>
          {row.suggestion.proposedDescription ? <ThemedText contentDirection="auto" type="small">{row.suggestion.proposedDescription}</ThemedText> : null}
          {row.proposedAssignee ? (
            <ThemedText contentDirection="auto" style={{ color: theme.textSecondary }} type="small">
              {t('suggestions.proposedFor', { name: `${row.proposedAssignee.user.displayName}${row.proposedAssignee.company ? ` · ${row.proposedAssignee.company.displayName}` : ''}` })}
            </ThemedText>
          ) : null}
          {row.references.map((reference) => (
            <View key={reference._id} style={[styles.quote, { borderStartColor: theme.accent }]}>
              <ThemedText contentDirection="auto" numberOfLines={3} style={{ color: theme.textSecondary }} type="small">
                “{reference.quote ?? t('suggestions.referenceUnavailable')}”
              </ThemedText>
            </View>
          ))}
          {row.possibleDuplicateTask ? (
            <ThemedText contentDirection="auto" type="smallBold">
              {t('suggestions.possibleDuplicatePrefix')}{' '}
              <ThemedText contentDirection="ltr" type="code">{row.possibleDuplicateTask.publicKey}</ThemedText>{' · '}
              <ThemedText contentDirection="auto" type="smallBold">{row.possibleDuplicateTask.title}</ThemedText>
            </ThemedText>
          ) : null}
          <View style={styles.actions}>
            <TaskAction label={row.possibleDuplicateTask ? t('suggestions.createSeparately') : t('suggestions.accept')} onPress={() => onAccept(row)} primary />
            {row.possibleDuplicateTask ? <TaskAction label={t('suggestions.addReference')} onPress={() => onLink(row)} /> : null}
            {row.canDismiss ? <TaskAction label={t('suggestions.dismiss')} onPress={() => onDismiss(row)} /> : null}
            <TaskAction label={t('suggestions.hide')} onPress={() => onHide(row)} />
          </View>
        </View>
      ))}
    </View>
  );
}

function TaskEmptyState({
  body,
  buttonLabel,
  icon,
  onPress,
  title,
}: {
  body: string;
  buttonLabel?: string;
  icon: React.ComponentProps<typeof PlatformIcon>['name'];
  onPress: () => void;
  title: string;
}) {
  return (
    <View style={styles.empty}>
      <EmptyState body={body} icon={icon} title={title} />
      {buttonLabel ? <TaskAction label={buttonLabel} onPress={onPress} primary /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  board: { alignItems: 'flex-start', gap: Spacing.three, paddingEnd: Spacing.three },
  boardRtl: { direction: 'rtl' },
  cardEyebrow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  column: { gap: Spacing.three, width: 286 },
  columnEmpty: { alignItems: 'center', borderRadius: 12, borderStyle: 'dashed', borderWidth: 1, justifyContent: 'center', minHeight: 112 },
  columnHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  confidence: { borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one },
  empty: { alignSelf: 'center', gap: Spacing.three, maxWidth: 360, paddingTop: Spacing.six, width: '100%' },
  list: { gap: Spacing.three },
  quote: { borderStartWidth: 3, paddingStart: Spacing.three },
  suggestion: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, gap: Spacing.three, padding: Spacing.four },
});
