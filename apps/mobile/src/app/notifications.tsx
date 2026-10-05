import { useMutation, useQuery } from 'convex/react';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { api } from '../../../../convex/_generated/api';
import { ActionButton } from '@/components/action-button';
import { useAppToast } from '@/components/app-toast';
import { ConnectivityBanner } from '@/components/connectivity-banner';
import { SheetRow, SheetSection } from '@/components/options-sheet';
import { PlatformIcon } from '@/components/platform-icon';
import { SkeletonList } from '@/components/skeleton-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTrackUser } from '@/contexts/track-user-context';
import { useTheme } from '@/hooks/use-theme';
import { useBottomTabContentInset } from '@/hooks/use-bottom-tab-inset';
import { usePushNotifications } from '@/lib/push-notifications';
import { notificationErrorMessage } from '@/lib/user-facing-error';

type ConversationMode = 'all' | 'mentions' | 'none';
type TaskMode = 'important' | 'all' | 'muted';
type PreviewMode = 'full' | 'context' | 'hidden';

export default function NotificationSettingsScreen() {
  const { showToast } = useAppToast();
  const bottomContentInset = useBottomTabContentInset(Spacing.six);
  const theme = useTheme();
  const { trackUserId } = useTrackUser();
  const router = useRouter();
  const push = usePushNotifications();
  const settings = useQuery(api.notifications.getSettings, trackUserId ? { userId: trackUserId } : 'skip');
  const setPreferences = useMutation(api.notifications.setMobilePreferences);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [preferenceStatus, setPreferenceStatus] = useState<'error' | 'success' | null>(null);
  const [testing, setTesting] = useState(false);
  const global = settings?.global ?? {
    globalMode: 'all' as const,
    taskMode: 'all' as const,
    previewMode: 'full' as const,
    soundEnabled: true,
    badgesEnabled: true,
  };

  async function update(changes: Partial<{
    conversationMode: ConversationMode;
    taskMode: TaskMode;
    previewMode: PreviewMode;
    soundEnabled: boolean;
    badgesEnabled: boolean;
  }>) {
    if (!trackUserId || savingPreferences) return;
    setSavingPreferences(true);
    setPreferenceStatus(null);
    try {
      await setPreferences({ userId: trackUserId, ...changes });
      setPreferenceStatus('success');
    } catch {
      setPreferenceStatus('error');
    } finally {
      setSavingPreferences(false);
    }
  }

  async function sendTest() {
    if (testing) return;
    setTesting(true);
    try {
      const result = await push.sendTestNotification();
      if (!result) return;
      showToast({
        message: `${result.queued} queued · ${result.failed} failed across ${result.attempted} target${result.attempted === 1 ? '' : 's'}.`,
        title: result.queued > 0 ? 'Test queued' : 'Test not queued',
        tone: result.queued > 0 ? 'success' : 'info',
      });
    } catch (failure) {
      showToast({ title: 'Test notification unavailable', message: notificationErrorMessage(failure), tone: 'error' });
    } finally {
      setTesting(false);
    }
  }

  let permissionTitle = 'Stay current when Track is closed';
  let permissionBody = 'Get timely message previews, mentions, replies, Channel activity, and task changes.';
  if (push.availability === 'expo_go') {
    permissionTitle = 'Development build required';
    permissionBody = 'Expo Go cannot register this device for remote notifications. Open Track in a development or release build.';
  } else if (push.permissionState === 'denied') {
    permissionTitle = 'Notifications are disabled';
    permissionBody = `Enable Track in ${Platform.OS === 'ios' ? 'iOS' : 'Android'} Settings to receive Project activity.`;
  } else if (push.permissionState === 'granted' || push.permissionState === 'provisional') {
    permissionTitle = push.registered ? 'Notifications are connected' : 'Finishing notification setup';
    permissionBody = 'Track will notify this device for eligible conversation and task activity.';
  }

  return (
    <ThemedView style={styles.screen}>
      <Stack.Screen options={{ title: 'Notifications' }} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomContentInset }]} contentInsetAdjustmentBehavior="automatic">
        <ConnectivityBanner message="You’re offline. Notification changes will be available after you reconnect." />
        <View style={[styles.permissionCard, { backgroundColor: theme.backgroundElement }]}>
          <View style={[styles.icon, { backgroundColor: theme.backgroundSelected }]}>
            <PlatformIcon color={theme.accent} name={push.permissionState === 'denied' || push.availability !== 'available' ? 'bell-off-outline' : 'bell-outline'} size={28} />
          </View>
          <ThemedText type="subtitle">{permissionTitle}</ThemedText>
          <ThemedText themeColor="textSecondary">{permissionBody}</ThemedText>
          <ThemedText themeColor="textSecondary" type="caption">
            Inbox keeps unread work inside Track. These settings control alerts when the app is closed.
          </ThemedText>
          <ActionButton label="Open Inbox" onPress={() => router.push('/inbox')} />
          {push.error ? <ThemedText accessibilityLiveRegion="assertive" accessibilityRole="alert" style={{ color: theme.danger }} type="small">{notificationErrorMessage(new Error(push.error))}</ThemedText> : null}
          {push.availability !== 'available' ? null : push.permissionState === 'denied' ? (
            <ActionButton disabled={push.syncing} label="Open device settings" loading={push.syncing} onPress={() => void push.openDeviceSettings()} variant="secondary" />
          ) : push.permissionState === 'not_determined' ? (
            <ActionButton disabled={push.syncing} label="Enable notifications" loading={push.syncing} onPress={() => void push.requestPermission()} variant="secondary" />
          ) : !push.registered ? (
            <ActionButton disabled={push.syncing} label="Try again" loading={push.syncing} onPress={() => void push.refresh()} variant="secondary" />
          ) : null}
        </View>

        {settings === undefined ? (
          <SkeletonList count={3} label="Loading notification settings" />
        ) : (
          <>
          <SheetSection title="Mentions, replies, and Channels">
            {(['all', 'mentions', 'none'] as const).map((mode) => (
              <SheetRow
                detail={mode === 'all' ? 'All eligible Channel and Thread activity' : mode === 'mentions' ? 'Only mentions and direct replies' : 'No conversation alerts'}
                disabled={savingPreferences}
                icon={mode === 'none' ? 'bell-off-outline' : mode === 'mentions' ? 'message' : 'bell-outline'}
                key={mode}
                label={mode === 'all' ? 'All messages' : mode === 'mentions' ? 'Mentions and replies' : 'Off'}
                selected={global.globalMode === mode}
                onPress={() => void update({ conversationMode: mode })}
              />
            ))}
          </SheetSection>

          <SheetSection title="Assignments and task updates">
            {(['important', 'all', 'muted'] as const).map((mode) => (
              <SheetRow
                detail={mode === 'important' ? 'Assignments, mentions, urgent changes, and due reminders' : mode === 'all' ? 'Every update on followed tasks' : 'No task alerts'}
                disabled={savingPreferences}
                icon={mode === 'muted' ? 'bell-off-outline' : 'task'}
                key={mode}
                label={mode === 'important' ? 'Important activity' : mode === 'all' ? 'All followed activity' : 'Off'}
                selected={global.taskMode === mode}
                onPress={() => void update({ taskMode: mode })}
              />
            ))}
          </SheetSection>

          <SheetSection title="Inbox coverage">
            <SheetRow detail="Thread activity follows the conversation setting above." icon="thread" label="Thread activity" />
            <SheetRow detail="Company and Project invitations can send a push alert when they arrive." icon="account-group" label="Invitations" />
          </SheetSection>

          <SheetSection title="Privacy">
            <SheetRow disabled={savingPreferences} label="Show message and task previews" selected={global.previewMode === 'full'} onPress={() => void update({ previewMode: 'full' })} />
            <SheetRow disabled={savingPreferences} label="Show sender and work context" selected={global.previewMode === 'context'} onPress={() => void update({ previewMode: 'context' })} />
            <SheetRow disabled={savingPreferences} label="Hide all work context" selected={global.previewMode === 'hidden'} onPress={() => void update({ previewMode: 'hidden' })} />
          </SheetSection>

          <SheetSection title="Presentation">
            <SheetRow label="Sound" trailing={<Switch accessibilityLabel="Notification sound" disabled={savingPreferences} onValueChange={(value) => void update({ soundEnabled: value })} thumbColor={global.soundEnabled ? theme.backgroundElevated : theme.textTertiary} trackColor={{ false: theme.backgroundSelected, true: theme.accent }} value={global.soundEnabled} />} />
            <SheetRow label="Badges" trailing={<Switch accessibilityLabel="Notification badges" disabled={savingPreferences} onValueChange={(value) => void update({ badgesEnabled: value })} thumbColor={global.badgesEnabled ? theme.backgroundElevated : theme.textTertiary} trackColor={{ false: theme.backgroundSelected, true: theme.accent }} value={global.badgesEnabled} />} />
          </SheetSection>
          {preferenceStatus ? (
            <ThemedText accessibilityLiveRegion={preferenceStatus === 'error' ? 'assertive' : 'polite'} style={{ color: preferenceStatus === 'error' ? theme.danger : theme.success }} type="small">
              {preferenceStatus === 'error' ? 'Settings were not saved. Check your connection and try again.' : 'Notification settings saved.'}
            </ThemedText>
          ) : null}
          </>
        )}

        <SheetSection title="Verify delivery">
          <SheetRow
            detail="Send one test alert to this device"
            disabled={push.availability !== 'available'}
            icon="bell-outline"
            label="Send test notification"
            loading={testing}
            onPress={() => void sendTest()}
          />
        </SheetSection>

        <ThemedText style={styles.footnote} themeColor="textSecondary" type="caption">
          Push delivery is best effort. Track records provider acceptance, but Apple and Google control final device presentation. Payloads contain the preview level selected above.
        </ThemedText>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.four, padding: Spacing.four, paddingBottom: Spacing.six },
  footnote: { lineHeight: 19, paddingHorizontal: Spacing.one },
  icon: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.medium, height: 48, justifyContent: 'center', width: 48 },
  permissionCard: { borderRadius: Radius.large, gap: Spacing.two, padding: Spacing.four },
  screen: { flex: 1 },
});
