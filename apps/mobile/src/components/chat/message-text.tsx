import type { ReactNode } from 'react';
import { StyleSheet, type StyleProp, type TextStyle } from 'react-native';

import { ThemedText, type ThemedTextType } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

const MENTION = /(@\w+)/g;

/** Message body with `@mentions` lifted out of the prose. */
export function MessageText({
  body,
  suffix,
  style,
  type = 'message',
}: {
  body: string;
  /** Rendered inside the text flow after the body, e.g. a timestamp spacer. */
  suffix?: ReactNode;
  style?: StyleProp<TextStyle>;
  type?: ThemedTextType;
}) {
  const theme = useTheme();
  const parts = body.split(MENTION);

  return (
    <ThemedText selectable style={style} type={type}>
      {parts.map((part, index) =>
        part.startsWith('@') ? (
          <ThemedText key={index} style={[styles.mention, { color: theme.textSecondary }]} type={type}>
            {part}
          </ThemedText>
        ) : (
          part
        ),
      )}
      {suffix}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  mention: {
    fontWeight: '600',
  },
});
