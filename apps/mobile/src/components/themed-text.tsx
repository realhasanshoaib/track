import { Text, type TextProps } from 'react-native';

import { ThemeColor, Typography } from '@/constants/theme';
import { useLocale } from '@/contexts/locale-context';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextType = 'default' | 'title' | 'subtitle' | 'small' | 'smallBold' | 'code' | 'link';

export type ThemedTextProps = TextProps & {
  contentDirection?: 'ui' | 'auto' | 'ltr';
  type?: ThemedTextType;
  themeColor?: ThemeColor;
};

export function ThemedText({ contentDirection = 'ui', style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();
  const { direction } = useLocale();
  const writingDirection = contentDirection === 'ui' ? direction : contentDirection;

  return (
    <Text
      allowFontScaling={false}
      style={[
        { color: theme[themeColor ?? 'text'] },
        { writingDirection },
        type === 'default' && Typography.body,
        type === 'small' && Typography.body,
        type === 'smallBold' && Typography.bodyBold,
        type === 'title' && Typography.title,
        type === 'subtitle' && Typography.subtitle,
        type === 'code' && Typography.metadata,
        type === 'link' && { ...Typography.body, color: '#1d4ed8' },
        style,
      ]}
      {...rest}
    />
  );
}
