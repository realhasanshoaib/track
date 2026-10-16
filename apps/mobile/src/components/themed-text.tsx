import { Text, type TextProps } from 'react-native';

import { MaxFontScale, ThemeColor, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextType =
  | 'default'
  | 'display'
  | 'titleLarge'
  | 'title'
  | 'subtitle'
  | 'message'
  | 'small'
  | 'smallBold'
  | 'label'
  | 'caption'
  | 'captionBold'
  | 'code'
  | 'mono'
  | 'link';

/**
 * `code` renders in the sans caption style: it is used throughout the app for
 * timestamps, counts, and labels, none of which are identifiers. Use `mono`
 * for genuine identifiers such as codes.
 */
const TYPE_STYLES: Record<ThemedTextType, object> = {
  default: Typography.body,
  display: Typography.display,
  titleLarge: Typography.titleLarge,
  title: Typography.title,
  subtitle: Typography.subtitle,
  message: Typography.message,
  small: Typography.body,
  smallBold: Typography.bodyBold,
  label: Typography.label,
  caption: Typography.caption,
  captionBold: Typography.captionBold,
  code: Typography.caption,
  mono: Typography.metadata,
  link: Typography.body,
};

export type ThemedTextProps = TextProps & {
  type?: ThemedTextType;
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  return (
    <Text
      maxFontSizeMultiplier={MaxFontScale}
      style={[
        { color: theme[themeColor ?? 'text'] },
        TYPE_STYLES[type],
        type === 'link' && { color: theme.info },
        style,
      ]}
      {...rest}
    />
  );
}
