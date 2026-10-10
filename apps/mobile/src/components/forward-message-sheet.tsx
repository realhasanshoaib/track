import type { Id } from '../../../../convex/_generated/dataModel';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { DetailedMessage } from '@/components/chat/types';
import { OptionsSheet, SheetInput, SheetRow, SheetSection } from '@/components/options-sheet';
import { PlatformIcon } from '@/components/platform-icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ForwardTarget = {
  group: { _id: Id<'groups'>; name: string; kind: string; status?: string };
  membership: object;
};

export function ForwardMessageSheet({
  busyTargetId,
  currentGroupId,
  error,
  groups,
  message,
  onClose,
  onForward,
}: {
  busyTargetId: string | null;
  currentGroupId?: Id<'groups'>;
  error: string | null;
  groups: ForwardTarget[] | undefined;
  message: DetailedMessage | null;
  onClose: () => void;
  onForward: (target: ForwardTarget, note: string) => void;
}) {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!message) {
      setQuery('');
      setNote('');
    }
  }, [message]);

  const targets = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    return (groups ?? []).filter(({ group }) =>
      group._id !== currentGroupId
      && (!group.status || group.status === 'active')
      && (!search || group.name.toLocaleLowerCase().includes(search)),
    );
  }, [currentGroupId, groups, query]);

  const sourceText = message?.message.body.trim()
    || message?.forwardedFrom?.originalBody.trim()
    || 'Attachment message';

  return (
    <OptionsSheet onClose={onClose} title="Forward message" visible={Boolean(message)}>
      <View style={[styles.preview, { backgroundColor: theme.backgroundElement, borderColor: theme.hairline }]}>
        <ThemedText themeColor="textSecondary" type="captionBold">
          {message?.author?.displayName ?? 'Member'}
        </ThemedText>
        <ThemedText numberOfLines={3} type="small">{sourceText}</ThemedText>
        {message?.attachments.length ? (
          <View style={styles.attachmentMeta}>
            <PlatformIcon color={theme.textSecondary} name="paperclip" size={15} />
            <ThemedText themeColor="textSecondary" type="caption">
              {message.attachments.length} {message.attachments.length === 1 ? 'attachment' : 'attachments'} will be copied
            </ThemedText>
          </View>
        ) : null}
      </View>
      <SheetInput
        label="Optional note"
        maxLength={10_000}
        multiline
        onChangeText={setNote}
        placeholder="Add context for the destination Channel"
        value={note}
      />
      {targets.length > 6 || query ? <SheetInput
        label="Search Channels"
        maxLength={100}
        onChangeText={setQuery}
        placeholder="Search accessible Channels"
        value={query}
      /> : null}
      <SheetSection title="Forward to">
        {groups === undefined ? (
          <View style={styles.targetState}>
            <ThemedText themeColor="textSecondary" type="small">
              Loading accessible Channels…
            </ThemedText>
          </View>
        ) : targets.length ? targets.map((target) => (
          <SheetRow
            detail={target.group.kind.replaceAll('_', ' ')}
            disabled={Boolean(busyTargetId)}
            icon="forward"
            key={target.group._id}
            label={target.group.name}
            loading={busyTargetId === target.group._id}
            onPress={() => onForward(target, note)}
          />
        )) : (
          <View style={styles.targetState}>
            <ThemedText themeColor="textSecondary" type="small">
              {query.trim()
                ? 'No accessible Channel matches that search.'
                : 'You need access to another active Channel in this Project.'}
            </ThemedText>
          </View>
        )}
      </SheetSection>
      {error ? (
        <ThemedText accessibilityRole="alert" style={styles.error} themeColor="danger" type="small">
          {error}
        </ThemedText>
      ) : null}
    </OptionsSheet>
  );
}

const styles = StyleSheet.create({
  attachmentMeta: { alignItems: 'center', flexDirection: 'row', gap: Spacing.one },
  error: { paddingHorizontal: Spacing.four },
  preview: { borderRadius: Radius.medium, borderWidth: StyleSheet.hairlineWidth, gap: Spacing.two, padding: Spacing.three },
  targetState: { padding: Spacing.three },
});
