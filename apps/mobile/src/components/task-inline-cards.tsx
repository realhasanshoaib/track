import { useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { hapticLight } from '@/lib/haptics';
import { taskDetailHref, type MobileTaskIdentity } from '@/lib/task-navigation';
import { useTranslation } from 'react-i18next';

type Props = {
  assistantStreamId?: Id<'assistantStreams'>;
  identity: MobileTaskIdentity | null;
  messageId?: Id<'messages'>;
  projectId: Id<'projects'>;
};

export function TaskInlineCards({ assistantStreamId, identity, messageId, projectId }: Props) {
  const theme = useTheme();
  const { t } = useTranslation('work');
  const router = useRouter();
  const queryIdentity = identity ? {
    actingCompanyId: identity.companyId,
    projectMemberId: identity.membershipId,
  } : {};
  const messageTasks = useQuery(
    api.tasks.listForMessage,
    messageId ? { messageId, ...queryIdentity } : 'skip',
  );
  const assistantTasks = useQuery(
    api.tasks.listForAssistant,
    assistantStreamId ? { assistantStreamId, ...queryIdentity } : 'skip',
  );
  const tasks = messageId ? messageTasks : assistantTasks;

  if (!tasks?.length) return null;

  return (
    <View style={styles.cards}>
      {tasks.map((item) => (
        <Pressable
          key={item.task._id}
          onPress={() => {
            hapticLight();
            router.push(taskDetailHref(projectId, item.task.publicKey, identity));
          }}
          style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.hairline }]}>
          <View style={styles.meta}>
            <ThemedText contentDirection="ltr" style={{ color: theme.textSecondary }} type="code">{item.task.publicKey}</ThemedText>
            <ThemedText style={{ color: theme.textSecondary }} type="code">·</ThemedText>
            <ThemedText contentDirection="auto" style={{ color: theme.textSecondary }} type="code">{item.state?.name ?? t('common.unknown')}</ThemedText>
          </View>
          <ThemedText contentDirection="auto" numberOfLines={2} type="smallBold">{item.task.title}</ThemedText>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 2,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  meta: { alignItems: 'center', flexDirection: 'row', gap: Spacing.one },
  cards: {
    gap: Spacing.one,
    marginBottom: Spacing.two,
    marginStart: 52,
    marginEnd: Spacing.three,
    marginTop: Spacing.one,
  },
});
