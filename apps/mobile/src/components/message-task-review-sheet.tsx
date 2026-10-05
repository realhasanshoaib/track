import { StyleSheet, View } from 'react-native';

import { ActionButton } from '@/components/action-button';
import { OptionsSheet, SheetInput, SheetNote } from '@/components/options-sheet';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function MessageTaskReviewSheet({
  busy,
  error,
  onChangeTitle,
  onClose,
  onCreate,
  source,
  title,
  visible,
}: {
  busy: boolean;
  error: string | null;
  onChangeTitle: (title: string) => void;
  onClose: () => void;
  onCreate: () => void;
  source: string;
  title: string;
  visible: boolean;
}) {
  const theme = useTheme();
  return <OptionsSheet onClose={onClose} title="Review task" visible={visible}>
    <SheetNote>The source stays linked to the Task, so its conversation context is kept.</SheetNote>
    <View style={styles.sourceBlock}>
      <ThemedText themeColor="textSecondary" type="captionBold">From this conversation</ThemedText>
      <View style={[styles.sourceQuote, { backgroundColor: theme.backgroundElement, borderColor: theme.homeBorder }]}>
        <ThemedText numberOfLines={5} themeColor="textSecondary" type="small">{source || 'Assistant answer'}</ThemedText>
      </View>
    </View>
    <SheetInput autoFocus label="Task title" maxLength={180} onChangeText={onChangeTitle} value={title} />
    {error ? <SheetNote state="error">{error}</SheetNote> : null}
    <View style={styles.actions}>
      <ActionButton disabled={busy} label="Cancel" onPress={onClose} style={styles.action} variant="secondary" />
      <ActionButton disabled={busy || !title.trim()} label="Create task" loading={busy} onPress={onCreate} style={styles.action} />
    </View>
  </OptionsSheet>;
}

const styles = StyleSheet.create({
  action: { flex: 1 },
  actions: { flexDirection: 'row', gap: Spacing.two },
  sourceBlock: { gap: Spacing.one },
  sourceQuote: { borderCurve: 'continuous', borderRadius: Radius.medium, borderWidth: StyleSheet.hairlineWidth, padding: Spacing.three },
});
