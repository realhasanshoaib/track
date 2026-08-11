import { Children, Fragment } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { PlatformIcon } from '@/components/platform-icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useLocale } from '@/contexts/locale-context';
import { Spacing, TouchTarget } from '@/constants/theme';
import { hapticLight } from '@/lib/haptics';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
  visible: boolean;
};

export function OptionsSheet({ children, onClose, title, visible }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { direction } = useLocale();
  const { t } = useTranslation('common');

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modal}>
        <Pressable onPress={onClose} style={styles.scrim} />
        <ThemedView style={[styles.sheet, { borderTopColor: theme.hairline }]}>
          <View style={[styles.handle, { backgroundColor: theme.textSecondary }]} />
          <View style={[styles.header, { direction }]}>
            <ThemedText type="subtitle">{title}</ThemedText>
            <Pressable
              accessibilityLabel={t('sheet.close')}
              android_ripple={{ color: theme.backgroundSelected, borderless: true }}
              hitSlop={12}
              onPress={() => { hapticLight(); onClose(); }}
              style={[styles.closeButton, { backgroundColor: theme.backgroundElement }]}>
              <PlatformIcon color={theme.textSecondary} name="close" size={18} />
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.four }]}
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={styles.scroll}>
            {children}
          </ScrollView>
        </ThemedView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function SheetSection({ children, title }: { children: React.ReactNode; title?: string }) {
  const theme = useTheme();
  const { direction } = useLocale();
  const items = Children.toArray(children);
  return (
    <View style={[styles.section, { direction }]}>
      {title ? (
        <ThemedText style={[styles.sectionTitle, { color: theme.textSecondary }]} type="code">
          {title.toUpperCase()}
        </ThemedText>
      ) : null}
      <View style={[styles.sectionBody, { backgroundColor: theme.backgroundElement }]}>
        {items.map((child, i) => (
          <Fragment key={i}>
            {i > 0 ? <View style={[styles.separator, { backgroundColor: theme.hairline }]} /> : null}
            {child}
          </Fragment>
        ))}
      </View>
    </View>
  );
}

export function SheetRow({
  destructive,
  icon,
  label,
  onPress,
  selected,
  trailing,
}: {
  destructive?: boolean;
  icon?: React.ComponentProps<typeof PlatformIcon>['name'];
  label: string;
  onPress?: () => void;
  selected?: boolean;
  trailing?: React.ReactNode;
}) {
  const theme = useTheme();
  const { direction } = useLocale();
  const textColor = destructive ? '#b91c1c' : theme.text;
  const iconColor = destructive ? '#b91c1c' : theme.textSecondary;

  return (
    <Pressable
      android_ripple={{ color: theme.backgroundSelected }}
      onPress={() => { if (onPress) { hapticLight(); onPress(); } }}
      style={[styles.sheetRow, { direction }]}>
      {icon ? <PlatformIcon color={iconColor} name={icon} size={20} /> : null}
      <ThemedText style={[styles.sheetRowLabel, { color: textColor }]} type="small">
        {label}
      </ThemedText>
      {selected ? (
        <PlatformIcon color={theme.accent} name="check-circle" size={19} />
      ) : trailing ? (
        trailing
      ) : null}
    </Pressable>
  );
}

export function SheetInput({
  label,
  multiline,
  onChangeText,
  value,
}: {
  label: string;
  multiline?: boolean;
  onChangeText: (v: string) => void;
  value: string;
}) {
  const theme = useTheme();
  const { direction } = useLocale();
  return (
    <View style={styles.inputWrap}>
      <ThemedText accessible={false} style={{ color: theme.textSecondary }} type="code">{label}</ThemedText>
      <TextInput
        accessibilityLabel={label}
        allowFontScaling={false}
        multiline={multiline}
        onChangeText={onChangeText}
        style={[styles.input, multiline && styles.inputMulti, styles.inputText, { borderColor: theme.hairline, color: theme.text, writingDirection: direction }, multiline && styles.inputTextMulti]}
        value={value}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  closeButton: {
    alignItems: 'center',
    borderRadius: 16,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  content: {
    gap: Spacing.three,
  },
  handle: {
    alignSelf: 'center',
    borderRadius: 2,
    height: 4,
    marginBottom: Spacing.one,
    opacity: 0.5,
    width: 36,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: Spacing.three,
  },
  input: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 44,
    overflow: 'hidden',
  },
  inputMulti: {
    minHeight: 88,
  },
  inputText: {
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  inputTextMulti: {
    textAlignVertical: 'top',
  },
  inputWrap: {
    gap: Spacing.one,
  },
  modal: {
    flex: 1,
  },
  scrim: {
    backgroundColor: 'rgba(0,0,0,0.4)',
    flex: 1,
  },
  scroll: {
    flexShrink: 1,
  },
  section: {
    gap: Spacing.two,
  },
  sectionBody: {
    borderRadius: 10,
    overflow: 'hidden',
  },
  sectionTitle: {
    marginBottom: 2,
    paddingHorizontal: 4,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: Spacing.three,
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    bottom: 0,
    left: 0,
    maxHeight: '84%',
    padding: Spacing.four,
    paddingBottom: 0,
    position: 'absolute',
    right: 0,
  },
  sheetRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.three,
    minHeight: TouchTarget,
    paddingHorizontal: Spacing.three,
  },
  sheetRowLabel: {
    flex: 1,
  },
});
