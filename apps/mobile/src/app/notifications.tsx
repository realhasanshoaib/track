import { useMutation, useQuery } from 'convex/react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { api } from '../../../../convex/_generated/api';
import { SheetRow, SheetSection } from '@/components/options-sheet';
import { PlatformIcon } from '@/components/platform-icon';
import { SkeletonList } from '@/components/skeleton-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useTrackUser } from '@/contexts/track-user-context';
import { useTheme } from '@/hooks/use-theme';
import { usePushNotifications } from '@/lib/push-notifications';

type ConversationMode = 'all' | 'mentions' | 'none';
type PreviewMode = 'full' | 'context' | 'hidden';

export default function NotificationSettingsScreen() {
  const theme = useTheme();
  const { trackUserId } = useTrackUser();
  const push = usePushNotifications();
  const settings = useQuery(api.notifications.getSettings, trackUserId ? { userId: trackUserId } : 'skip');
  const diagnostics = useQuery(api.pushDelivery.getDiagnostics, trackUserId ? { userId: trackUserId } : 'skip');
  const setPreferences = useMutation(api.notifications.setMobilePreferences);
  const global = settings?.global ?? {
    globalMode: 'all' as const,
    previewMode: 'full' as const,
    soundEnabled: true,
    badgesEnabled: true,
  };

  function update(changes: Partial<{
    conversationMode: ConversationMode;
    previewMode: PreviewMode;
    soundEnabled: boolean;
    badgesEnabled: boolean;
  }>) {
    if (!trackUserId) return;
    void setPreferences({
      userId: trackUserId,
      ...changes,
    }).catch(() => Alert.alert('Settings not saved', 'Check your connection and try again.'));
  }

  async function sendTest() {
    const result = await push.sendTestNotification();
    if (!result) return;
    Alert.alert(
      result.queued > 0 ? 'Test queued' : 'Test not queued',
      `${result.queued} queued · ${result.failed} failed across ${result.attempted} target${result.attempted === 1 ? '' : 's'}.`,
    );
  }

  const permissionTitle = push.permissionState === 'granted' || push.permissionState === 'provisional'
    ? push.registered ? 'Notifications are connected' : 'Finishing notification setup'
    : push.permissionState === 'denied' ? 'Notifications are disabled' : 'Stay current when Track is closed';
  const permissionBody = push.permissionState === 'denied'
    ? `Enable Track in ${Platform.OS === 'ios' ? 'iOS' : 'Android'} Settings to receive Project activity.`
    : push.permissionState === 'granted' || push.permissionState === 'provisional'
      ? 'Track will notify this device for eligible conversation activity.'
      : 'Get timely message previews, mentions, replies, Channel activity.';

  return (
    <ThemedView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
        <View style={[styles.permissionCard, { backgroundColor: theme.backgroundElement }]}>
          <View style={[styles.icon, { backgroundColor: theme.backgroundSelected }]}>
            <PlatformIcon color={theme.accent} name={push.permissionState === 'denied' ? 'bell-off-outline' : 'bell-outline'} size={28} />
          </View>
          <ThemedText type="subtitle">{permissionTitle}</ThemedText>
          <ThemedText themeColor="textSecondary">{permissionBody}</ThemedText>
          {push.error ? <ThemedText accessibilityRole="alert" style={{ color: theme.danger }} type="small">{push.error.replaceAll('_', ' ')}</ThemedText> : null}
          {push.permissionState === 'denied' ? (
            <PrimaryButton disabled={push.syncing} label="Open device settings" onPress={() => void push.openDeviceSettings()} />
          ) : push.permissionState === 'not_determined' ? (
            <PrimaryButton disabled={push.syncing} label={push.syncing ? 'Checking…' : 'Enable notifications'} onPress={() => void push.requestPermission()} />
          ) : !push.registered ? (
            <PrimaryButton disabled={push.syncing} label={push.syncing ? 'Connecting…' : 'Try again'} onPress={() => void push.refresh()} />
          ) : null}
        </View>

        {settings === undefined ? (
          <SkeletonList count={3} label="Loading notification settings" />
        ) : (
          <>
          <SheetSection title="Conversation default">
            {(['all', 'mentions', 'none'] as const).map((mode) => (
              <SheetRow key={mode} label={mode === 'all' ? 'All messages' : mode === 'mentions' ? 'Mentions and replies' : 'Off'} selected={global.globalMode === mode} onPress={() => update({ conversationMode: mode })} />
            ))}
          </SheetSection>

          <SheetSection title="Privacy">
            <SheetRow label="Show message previews" selected={global.previewMode === 'full'} onPress={() => update({ previewMode: 'full' })} />
            <SheetRow label="Show sender and work context" selected={global.previewMode === 'context'} onPress={() => update({ previewMode: 'context' })} />
            <SheetRow label="Hide all work context" selected={global.previewMode === 'hidden'} onPress={() => update({ previewMode: 'hidden' })} />
          </SheetSection>

          <SheetSection title="Presentation">
            <SheetRow label="Sound" trailing={<Switch accessibilityLabel="Notification sound" onValueChange={(value) => update({ soundEnabled: value })} value={global.soundEnabled} />} />
            <SheetRow label="Badges" trailing={<Switch accessibilityLabel="Notification badges" onValueChange={(value) => update({ badgesEnabled: value })} value={global.badgesEnabled} />} />
          </SheetSection>
          </>
        )}

        {__DEV__ ? <SheetSection title="Development diagnostics">
          <SheetRow label="Send test notification" onPress={() => void sendTest()} />
          <SheetRow label="Recent delivery state" trailing={<ThemedText themeColor="textSecondary" type="caption">{diagnostics ? `${diagnostics.sampleSize} intents` : 'Loading…'}</ThemedText>} />
        </SheetSection> : null}

        <ThemedText style={styles.footnote} themeColor="textSecondary" type="caption">
          Push delivery is best effort. Track records provider acceptance, but Apple and Google control final device presentation. Payloads contain the preview level selected above.
        </ThemedText>
      </ScrollView>
    </ThemedView>
  );
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
  button: { alignItems: 'center', borderRadius: Radius.medium, marginTop: Spacing.one, minHeight: TouchTarget, justifyContent: 'center', paddingHorizontal: Spacing.four },
  content: { gap: Spacing.four, padding: Spacing.three, paddingBottom: Spacing.six },
  footnote: { lineHeight: 19, paddingHorizontal: Spacing.one },
  icon: { alignItems: 'center', borderRadius: Radius.pill, height: 48, justifyContent: 'center', width: 48 },
  permissionCard: { borderRadius: Radius.large, gap: Spacing.two, padding: Spacing.four },
  screen: { flex: 1 },
});
