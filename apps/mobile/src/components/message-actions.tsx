import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlatformIcon, type IconName } from '@/components/platform-icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useLocale } from '@/i18n';
import { useTheme } from '@/hooks/use-theme';
import { hapticLight, hapticDestructive } from '@/lib/haptics';

type Action = { label: string; icon?: IconName; destructive?: boolean; onPress: () => void };

type Props = { visible: boolean; onClose: () => void; actions: Action[] };

export function MessageActions({ visible, onClose, actions }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { direction } = useLocale();

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <Pressable onPress={onClose} style={styles.scrim} />
      <ThemedView style={[styles.sheet, { borderTopColor: theme.hairline }]}>
        <View style={[styles.handle, { backgroundColor: theme.textSecondary }]} />
        <View style={styles.content}>
          {actions.map((action, i) => (
            <Pressable
              key={i}
              onPress={() => {
                if (action.destructive) {
                  hapticDestructive();
                } else {
                  hapticLight();
                }
                onClose();
                action.onPress();
              }}
              style={[styles.row, { minHeight: 52 }, direction === 'rtl' && styles.rtlRow]}>
              {action.icon && (
                <PlatformIcon
                  color={action.destructive ? '#b91c1c' : theme.textSecondary}
                  name={action.icon}
                  size={22}
                />
              )}
              <ThemedText
                style={{ color: action.destructive ? '#b91c1c' : theme.text }}
                type="smallBold">
                {action.label}
              </ThemedText>
            </Pressable>
          ))}
        </View>
        <View style={{ height: insets.bottom }} />
      </ThemedView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: 'rgba(0,0,0,0.35)', flex: 1 },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    bottom: 0,
    left: 0,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    position: 'absolute',
    right: 0,
  },
  handle: { alignSelf: 'center', borderRadius: 2, height: 4, marginBottom: Spacing.two, opacity: 0.5, width: 36 },
  content: { gap: 0 },
  row: { alignItems: 'center', flexDirection: 'row', gap: Spacing.three, paddingVertical: Spacing.two },
  rtlRow: { flexDirection: 'row-reverse' },
});
