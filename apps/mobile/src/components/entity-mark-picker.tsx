import { ScrollView, StyleSheet, View } from 'react-native';
import { entityMarkColorKeys, entityMarkIconKeys, entityMarkPalette, type EntityMarkColorKey, type EntityMarkIconKey } from '@track/shared';

import { PlatformIcon, type IconName } from '@/components/platform-icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const icons: Record<EntityMarkIconKey, IconName> = {
  analytics: 'analytics', archive: 'archive', board: 'view-board', bookmark: 'bookmark', book: 'file-document-outline', building: 'office-building',
  bug: 'bug', calendar: 'calendar', channel: 'channel', checklist: 'task', code: 'code', conversation: 'thread', design: 'image',
  files: 'file-archive', globe: 'earth', idea: 'lightbulb-outline', inbox: 'inbox', integration: 'link', launch: 'flag',
  media: 'image-multiple', milestone: 'star', mobile: 'smartphone', people: 'account-group', project: 'project', question: 'information-outline',
  shield: 'shield-lock-outline', support: 'email-outline', target: 'target', timeline: 'calendar-clock', video: 'video',
};

export function EntityMarkPicker({
  colorKey,
  iconKey,
  onColorChange,
  onIconChange,
}: {
  colorKey: EntityMarkColorKey | '';
  iconKey: EntityMarkIconKey | '';
  onColorChange: (key: EntityMarkColorKey | '') => void;
  onIconChange: (key: EntityMarkIconKey | '') => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.root}>
      <ThemedText type="title">Mark icon</ThemedText>
      <ScrollView contentContainerStyle={styles.options} horizontal showsHorizontalScrollIndicator={false}>
        <Choice label="Auto" selected={!iconKey} onPress={() => onIconChange('')} />
        {entityMarkIconKeys.map((key) => <Choice key={key} label={key} selected={iconKey === key} onPress={() => onIconChange(key)} leading={<PlatformIcon color={theme.textSecondary} name={icons[key]} size={16} />} />)}
      </ScrollView>
      <ThemedText type="title">Background</ThemedText>
      <ScrollView contentContainerStyle={styles.options} horizontal showsHorizontalScrollIndicator={false}>
        <Choice label="Auto" selected={!colorKey} onPress={() => onColorChange('')} />
        {entityMarkColorKeys.map((key) => <Choice key={key} label={key} selected={colorKey === key} onPress={() => onColorChange(key)} leading={<View style={[styles.swatch, { backgroundColor: entityMarkPalette[key].background }]} />} />)}
      </ScrollView>
      <ThemedText themeColor="textSecondary" type="caption">Automatic keeps the background stable and picks a useful icon from the name. Channel lists vary repeated icons so each visible Channel stays easy to recognize.</ThemedText>
    </View>
  );
}

function Choice({ label, leading, onPress, selected }: { label: string; leading?: React.ReactNode; onPress: () => void; selected: boolean }) {
  const theme = useTheme();
  return (
    <ThemedText
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[styles.choice, { backgroundColor: selected ? theme.accentSoft : theme.homeSurface, borderColor: selected ? theme.accentStrong : theme.homeBorder }]}
      type="captionBold">
      {leading}{label}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  choice: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.pill, borderWidth: 1, flexDirection: 'row', gap: Spacing.one, overflow: 'hidden', paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, textTransform: 'capitalize' },
  options: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.one },
  root: { gap: Spacing.two },
  swatch: { borderRadius: Radius.pill, height: 14, width: 14 },
});
