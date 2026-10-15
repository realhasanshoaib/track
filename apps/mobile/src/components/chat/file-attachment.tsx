import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';

import type { AttachmentReference } from '@/components/chat/types';
import { PlatformIcon } from '@/components/platform-icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, TouchTarget } from '@/constants/theme';
import { attachmentActionError, shareAttachment } from '@/lib/attachment-actions';
import { attachmentIcon, fileTypeLabel, formatFileSize } from '@/lib/attachment-presentation';
import { hapticLight } from '@/lib/haptics';
import { useTheme } from '@/hooks/use-theme';

/** The document tile: icon, name, kind and size — nothing the bubble already says. */
export function FileAttachment({
  attachment,
  onLongPress,
  url,
}: AttachmentReference & { onLongPress?: () => void }) {
  const theme = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const icon = attachmentIcon(attachment);
  const size = `${fileTypeLabel(attachment)} · ${formatFileSize(attachment.size)}`;
  const actionHint = Platform.OS === 'web'
    ? 'Downloads the file'
    : 'Downloads the file and opens the share sheet';

  async function open() {
    if (!url || busy) return;
    hapticLight();
    setBusy(true);
    setError(null);
    try {
      await shareAttachment({
        cacheKey: attachment._id,
        contentType: attachment.contentType,
        filename: attachment.filename,
        url,
      });
    } catch (cause) {
      setError(attachmentActionError(cause));
    } finally {
      setBusy(false);
    }
  }

  const detail = error ? `${size} · ${error}` : url ? size : `${size} · Unavailable`;

  return (
    <Pressable
      accessibilityHint={url ? actionHint : undefined}
      accessibilityLabel={`${attachment.filename}, ${detail}`}
      accessibilityRole="button"
      accessibilityState={{ busy, disabled: !url }}
      android_ripple={{ color: theme.backgroundSelected }}
      disabled={!url}
      onLongPress={onLongPress}
      onPress={open}
      style={[styles.card, { backgroundColor: theme.backgroundElevated, borderColor: theme.hairline }]}>
      <View style={[styles.icon, { backgroundColor: theme.backgroundElement }]}>
        <PlatformIcon color={theme.textSecondary} name={icon} size={18} />
      </View>
      <View style={styles.body}>
        <ThemedText ellipsizeMode="middle" numberOfLines={2} type="small">
          {attachment.filename}
        </ThemedText>
        <View style={styles.detail}>
          {error ? <PlatformIcon color={theme.danger} name="alert-circle" size={13} /> : null}
          <ThemedText
            numberOfLines={1}
            style={error ? { color: theme.danger } : undefined}
            themeColor="textSecondary"
            type="caption">
            {detail}
          </ThemedText>
        </View>
      </View>
      {busy ? (
        <ActivityIndicator accessibilityLabel="Downloading" color={theme.textSecondary} size="small" />
      ) : (
        <PlatformIcon
          color={error ? theme.danger : theme.textSecondary}
          name={error ? 'refresh' : url ? 'download' : 'cloud-off'}
          size={20}
        />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    gap: 1,
    minWidth: 0,
  },
  card: {
    alignItems: 'center',
    borderRadius: Radius.medium,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: Spacing.two,
    minHeight: TouchTarget,
    minWidth: 208,
    paddingLeft: Spacing.one,
    paddingRight: Spacing.two,
    paddingVertical: Spacing.one,
  },
  detail: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.one,
  },
  icon: {
    alignItems: 'center',
    borderRadius: Radius.small,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
});
