import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useLocale } from '@/contexts/locale-context';
import { getSelfName, LOCALES, type Locale } from '@/i18n/registry';
import { Spacing, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ThemedText } from '@/components/themed-text';

type Props = {
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function LanguageSwitcher({ compact = false, style }: Props) {
  const theme = useTheme();
  const { t } = useTranslation('common');
  const { locale, setLocale, isReady } = useLocale();

  return (
    <View accessibilityLabel={t('language.label')} accessibilityRole="radiogroup" style={[styles.wrap, compact && styles.compact, style]}>
      {LOCALES.map((option) => (
        <Pressable
          accessibilityLabel={getSelfName(option)}
          accessibilityRole="radio"
          accessibilityState={{ selected: locale === option }}
          disabled={!isReady || locale === option}
          key={option}
          onPress={() => void setLocale(option)}
          style={[
            styles.option,
            compact && styles.compactOption,
            {
              backgroundColor: locale === option ? theme.backgroundSelected : 'transparent',
              borderColor: locale === option ? theme.hairline : 'transparent',
            },
          ]}
        >
          <ThemedText type="smallBold">{getSelfName(option)}</ThemedText>
        </Pressable>
      ))}
    </View>
  );
}

export function languageLabel(locale: Locale) {
  return getSelfName(locale);
}

const styles = StyleSheet.create({
  compact: {
    alignSelf: 'flex-start',
  },
  compactOption: {
    minHeight: 36,
    paddingHorizontal: Spacing.two,
  },
  option: {
    alignItems: 'center',
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: TouchTarget,
    paddingHorizontal: Spacing.three,
  },
  wrap: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.one,
  },
});
