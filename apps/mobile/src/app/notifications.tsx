import { useMutation, useQuery } from 'convex/react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { api } from '../../../../convex/_generated/api';
import { SheetRow, SheetSection } from '@/components/options-sheet';
import { PlatformIcon } from '@/components/platform-icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTrackUser } from '@/contexts/track-user-context';
import { useTheme } from '@/hooks/use-theme';
import { usePushNotifications } from '@/lib/push-notifications';
import { formatNumber, useLocale } from '@/i18n';
import { useTranslation } from 'react-i18next';

type ConversationMode = 'all' | 'mentions' | 'none';
type TaskMode = 'important' | 'all' | 'muted';
type PreviewMode = 'full' | 'context' | 'hidden';

export default function NotificationSettingsScreen() {
  const theme = useTheme();
  const { locale } = useLocale();
  const { t } = useTranslation('work');
  const { trackUserId } = useTrackUser();
  const push = usePushNotifications();
  const settings = useQuery(api.notifications.getSettings, trackUserId ? { userId: trackUserId } : 'skip');
  const diagnostics = useQuery(api.pushDelivery.getDiagnostics, trackUserId ? { userId: trackUserId } : 'skip');
  const setPreferences = useMutation(api.notifications.setMobilePreferences);
  const global = settings?.global ?? {
    globalMode: 'all' as const,
    taskMode: 'all' as const,
    previewMode: 'full' as const,
    soundEnabled: true,
    badgesEnabled: true,
  };

  function update(changes: Partial<{
    conversationMode: ConversationMode;
    taskMode: TaskMode;
    previewMode: PreviewMode;
    soundEnabled: boolean;
    badgesEnabled: boolean;
  }>) {
    if (!trackUserId) return;
    void setPreferences({
      userId: trackUserId,
      ...changes,
    }).catch(() => Alert.alert(t('notifications.settingsNotSaved'), t('notifications.checkConnection')));
  }

  async function sendTest() {
    const result = await push.sendTestNotification();
    if (!result) return;
    Alert.alert(
      result.queued > 0 ? t('notifications.testQueued') : t('notifications.testNotQueued'),
      t('notifications.testSummary', {
        queued: formatNumber(locale, result.queued),
        failed: formatNumber(locale, result.failed),
        attempted: formatNumber(locale, result.attempted),
        count: result.attempted,
      }),
    );
  }

  const permissionTitle = push.permissionState === 'granted' || push.permissionState === 'provisional'
    ? push.registered ? t('notifications.connected') : t('notifications.finishing')
    : push.permissionState === 'denied' ? t('notifications.disabled') : t('notifications.stayCurrent');
  const permissionBody = push.permissionState === 'denied'
    ? t(Platform.OS === 'ios' ? 'notifications.iosSettings' : 'notifications.androidSettings')
    : push.permissionState === 'granted' || push.permissionState === 'provisional'
      ? t('notifications.connectedBody')
      : t('notifications.pendingBody');

  return (
    <ThemedView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
        <View style={[styles.permissionCard, { backgroundColor: theme.backgroundElement }]}>
          <View style={[styles.icon, { backgroundColor: theme.backgroundSelected }]}>
            <PlatformIcon color={theme.accent} name={push.permissionState === 'denied' ? 'bell-off-outline' : 'bell-outline'} size={28} />
          </View>
          <ThemedText type="subtitle">{permissionTitle}</ThemedText>
          <ThemedText style={{ color: theme.textSecondary }}>{permissionBody}</ThemedText>
          {push.error ? <ThemedText style={{ color: '#b91c1c' }} type="small">{notificationErrorLabel(push.error, t)}</ThemedText> : null}
          {push.permissionState === 'denied' ? (
            <PrimaryButton disabled={push.syncing} label={t('notifications.openDeviceSettings')} onPress={() => void push.openDeviceSettings()} />
          ) : push.permissionState === 'not_determined' ? (
            <PrimaryButton disabled={push.syncing} label={push.syncing ? t('notifications.checking') : t('notifications.enable')} onPress={() => void push.requestPermission()} />
          ) : !push.registered ? (
            <PrimaryButton disabled={push.syncing} label={push.syncing ? t('notifications.connecting') : t('notifications.tryAgain')} onPress={() => void push.refresh()} />
          ) : null}
        </View>

        <SheetSection title={t('notifications.conversationDefault')}>
          {(['all', 'mentions', 'none'] as const).map((mode) => (
            <SheetRow key={mode} label={mode === 'all' ? t('notifications.allMessages') : mode === 'mentions' ? t('notifications.mentionsReplies') : t('notifications.off')} selected={global.globalMode === mode} onPress={() => update({ conversationMode: mode })} />
          ))}
        </SheetSection>

        <SheetSection title={t('notifications.taskDefault')}>
          {(['important', 'all', 'muted'] as const).map((mode) => (
            <SheetRow key={mode} label={mode === 'important' ? t('notifications.importantActivity') : mode === 'all' ? t('notifications.allFollowedActivity') : t('notifications.off')} selected={global.taskMode === mode} onPress={() => update({ taskMode: mode })} />
          ))}
        </SheetSection>

        <SheetSection title={t('notifications.privacy')}>
          <SheetRow label={t('notifications.showMessageTaskPreviews')} selected={global.previewMode === 'full'} onPress={() => update({ previewMode: 'full' })} />
          <SheetRow label={t('notifications.showSenderContext')} selected={global.previewMode === 'context'} onPress={() => update({ previewMode: 'context' })} />
          <SheetRow label={t('notifications.hideWorkContext')} selected={global.previewMode === 'hidden'} onPress={() => update({ previewMode: 'hidden' })} />
        </SheetSection>

        <SheetSection title={t('notifications.presentation')}>
          <SheetRow label={t('notifications.sound')} trailing={<Switch accessibilityLabel={t('notifications.soundAccessibility')} onValueChange={(value) => update({ soundEnabled: value })} value={global.soundEnabled} />} />
          <SheetRow label={t('notifications.badges')} trailing={<Switch accessibilityLabel={t('notifications.badgesAccessibility')} onValueChange={(value) => update({ badgesEnabled: value })} value={global.badgesEnabled} />} />
        </SheetSection>

        {__DEV__ ? <SheetSection title={t('notifications.developmentDiagnostics')}>
          <SheetRow label={t('notifications.sendTest')} onPress={() => void sendTest()} />
          <SheetRow label={t('notifications.recentDelivery')} trailing={<ThemedText contentDirection="auto" style={{ color: theme.textSecondary }} type="code">{diagnostics ? t('common.intent', { count: diagnostics.sampleSize, formattedCount: formatNumber(locale, diagnostics.sampleSize) }) : t('notifications.deliveryLoading')}</ThemedText>} />
        </SheetSection> : null}

        <ThemedText style={[styles.footnote, { color: theme.textSecondary }]} type="small">
          {t('notifications.pushFootnote')}
        </ThemedText>
      </ScrollView>
    </ThemedView>
  );
}

function notificationErrorLabel(error: string, t: (key: string) => string) {
  if (error === 'notification_sync_failed') return t('notifications.syncError');
  if (error === 'push_token_refresh_failed') return t('notifications.tokenRefreshError');
  return t('notifications.safeError');
}

function PrimaryButton({ disabled, label, onPress }: { disabled: boolean; label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button, { backgroundColor: disabled ? theme.hairline : theme.text }]}>
      <ThemedText style={{ color: theme.background }} type="smallBold">{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', borderRadius: 10, marginTop: Spacing.one, minHeight: 44, justifyContent: 'center', paddingHorizontal: Spacing.four },
  content: { gap: Spacing.four, padding: Spacing.three, paddingBottom: Spacing.six },
  footnote: { lineHeight: 19, paddingHorizontal: Spacing.one },
  icon: { alignItems: 'center', borderRadius: 24, height: 48, justifyContent: 'center', width: 48 },
  permissionCard: { borderRadius: 14, gap: Spacing.two, padding: Spacing.four },
  screen: { flex: 1 },
});
