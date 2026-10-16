import { useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import { TaskStatusPill } from '@/components/task-ui';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { hapticLight } from '@/lib/haptics';
import { taskDetailHref, type MobileTaskIdentity } from '@/lib/task-navigation';
import { shortTaskKey } from '@/lib/task-presentation';
import { useTaskLinkBatch } from '@/lib/task-link-context';

/** Matches the avatar column MessageBubble reserves, so cards line up with bubbles. */
const GUTTER = 40;

type Props = {
  identity: MobileTaskIdentity | null;
  isOwnMessage?: boolean;
  messageId?: Id<'messages'>;
  /**
   * Reports whether the message or answer carries cards, so the screen can break
   * the author group after an interruption. Keyed by the message or stream id,
   * which is also the row key the thread list uses.
   */
  onCardsChange?: (rowId: string, hasCards: boolean) => void;
  projectId: Id<'projects'>;
};

export function TaskInlineCards({
  identity,
  isOwnMessage,
  messageId,
  onCardsChange,
  projectId,
}: Props) {
  const theme = useTheme();
  const router = useRouter();
  const batch = useTaskLinkBatch();
  const queryIdentity = identity ? {
    actingCompanyId: identity.companyId,
    projectMemberId: identity.membershipId,
  } : {};
  const messageTasks = useQuery(
    api.tasks.listForMessage,
    messageId && !batch ? { messageId, ...queryIdentity } : 'skip',
  );
  const tasks = messageId ? batch?.messageTasks.get(String(messageId)) ?? messageTasks : undefined;
  const hasCards = Boolean(tasks?.length);
  const rowId = messageId;

  useEffect(() => {
    if (rowId) onCardsChange?.(rowId, hasCards);
  }, [hasCards, onCardsChange, rowId]);

  if (!tasks?.length) return null;

  return (
    <View style={[styles.row, isOwnMessage ? styles.rowOwn : styles.rowOther]}>
      {isOwnMessage ? null : <View style={styles.gutter} />}
      <View style={styles.stack}>
        {tasks.map((item) => {
          const status = item.state?.name ?? 'Unknown status';
          return (
            <Pressable
              accessibilityHint="Opens the task"
              accessibilityLabel={`Task ${item.task.publicKey}, ${status}, ${item.task.title}`}
              accessibilityRole="button"
              android_ripple={{ color: theme.backgroundSelected }}
              key={item.task._id}
              onPress={() => {
                hapticLight();
                router.push(taskDetailHref(projectId, item.task.publicKey, identity));
              }}
              style={[styles.card, { backgroundColor: theme.backgroundElevated, borderColor: theme.hairline }]}>
              <View style={styles.header}>
                <ThemedText numberOfLines={1} style={styles.key} themeColor="textSecondary" type="mono">
                  {shortTaskKey(item.task.publicKey)}
                </ThemedText>
                <TaskStatusPill category={item.state?.category} label={status} />
              </View>
              <ThemedText numberOfLines={2} type="small">
                {item.task.title}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.large,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.one,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
  },
  gutter: {
    width: GUTTER,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.two,
    justifyContent: 'space-between',
    minWidth: 0,
  },
  key: {
    flexShrink: 1,
    minWidth: 0,
  },
  row: {
    flexDirection: 'row',
    paddingBottom: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
  },
  rowOther: {
    justifyContent: 'flex-start',
  },
  rowOwn: {
    justifyContent: 'flex-end',
  },
  stack: {
    flexShrink: 1,
    gap: Spacing.one,
    maxWidth: '84%',
  },
});
