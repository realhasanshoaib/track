import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { useAction, useMutation, useQuery } from 'convex/react';
import { useRouter, type Href } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';

import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import { useTrackUser } from '@/contexts/track-user-context';
import { consumePushResponseId, getPushInstallationId } from '@/lib/push-installation';
import { shouldPresentPush } from '@/lib/push-presentation';
import { resolvePushHref } from '@/lib/push-routing';
import { useTranslation } from 'react-i18next';

export type PushPermissionState = 'not_determined' | 'denied' | 'granted' | 'provisional';

type PushContextValue = {
  error: string | null;
  installationId: string | null;
  permissionState: PushPermissionState;
  registered: boolean;
  requestPermission: () => Promise<void>;
  refresh: () => Promise<void>;
  openDeviceSettings: () => Promise<void>;
  sendTestNotification: () => Promise<{ attempted: number; queued: number; sent: number; failed: number } | null>;
  syncing: boolean;
};

const PushContext = createContext<PushContextValue | null>(null);

function permissionState(permission: Notifications.NotificationPermissionsStatus): PushPermissionState {
  if (permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL ||
    permission.ios?.status === Notifications.IosAuthorizationStatus.EPHEMERAL) return 'provisional';
  if (permission.granted) return 'granted';
  if (permission.status === Notifications.PermissionStatus.DENIED) return 'denied';
  return 'not_determined';
}

function pushEnvironment(): 'development' | 'preview' | 'production' {
  const configured = process.env.EXPO_PUBLIC_APP_ENV;
  if (configured === 'development' || configured === 'preview' || configured === 'production') return configured;
  return __DEV__ ? 'development' : 'production';
}

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data;
    const present = shouldPresentPush(data);
    return {
      shouldPlaySound: present && data?.soundEnabled !== 'false',
      shouldSetBadge: present && notification.request.content.badge !== null,
      shouldShowBanner: present,
      shouldShowList: present,
    };
  },
});

export function usePushNotifications() {
  const context = useContext(PushContext);
  if (!context) throw new Error('usePushNotifications must be used inside PushNotificationBridge');
  return context;
}

export function PushNotificationBridge({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { trackUserId } = useTrackUser();
  const { t } = useTranslation('work');
  const registerInstallation = useMutation(api.notifications.registerNativeInstallation);
  const reportPermission = useMutation(api.notifications.reportNativePermission);
  const recordOpen = useMutation(api.notifications.recordPushOpen);
  const sendTest = useAction(api.pushNotifications.sendTestNotification);
  const [installationId, setInstallationId] = useState<string | null>(null);
  const [localPermission, setLocalPermission] = useState<PushPermissionState>('not_determined');
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const serverStatus = useQuery(
    api.notifications.getNativeStatus,
    trackUserId ? { userId: trackUserId, installationId: installationId ?? undefined } : 'skip',
  );

  const sync = useCallback(async (request: boolean) => {
    if (!trackUserId || Platform.OS === 'web') return;
    setSyncing(true);
    setError(null);
    try {
      const id = installationId ?? await getPushInstallationId();
      setInstallationId(id);
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('track-default', {
          importance: Notifications.AndroidImportance.HIGH,
          name: t('notifications.channelName'),
          sound: 'default',
          vibrationPattern: [0, 180, 80, 180],
        });
        await Notifications.setNotificationChannelAsync('track-silent', {
          importance: Notifications.AndroidImportance.HIGH,
          name: t('notifications.silentChannelName'),
          sound: null,
          vibrationPattern: [0, 180, 80, 180],
        });
      }
      const existing = await Notifications.getPermissionsAsync();
      const permission = request && !existing.granted && existing.canAskAgain
        ? await Notifications.requestPermissionsAsync()
        : existing;
      const state = permissionState(permission);
      setLocalPermission(state);
      const common = {
        userId: trackUserId,
        installationId: id,
        platform: Platform.OS === 'ios' ? 'ios' as const : 'android' as const,
        environment: pushEnvironment(),
        permissionState: state,
        appVersion: Constants.expoConfig?.version,
      };
      if (state !== 'granted' && state !== 'provisional') {
        await reportPermission(common);
        return;
      }
      const token = await Notifications.getDevicePushTokenAsync();
      await registerInstallation({ ...common, token: token.data });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'notification_sync_failed');
    } finally {
      setSyncing(false);
    }
  }, [installationId, registerInstallation, reportPermission, t, trackUserId]);

  useEffect(() => {
    if (!trackUserId || Platform.OS === 'web') return;
    void sync(false);
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void sync(false);
    });
    const tokenSubscription = Notifications.addPushTokenListener((devicePushToken) => {
      if (!installationId) return;
      void (async () => {
        const permission = await Notifications.getPermissionsAsync();
        await registerInstallation({
          userId: trackUserId,
          installationId,
          platform: Platform.OS === 'ios' ? 'ios' : 'android',
          environment: pushEnvironment(),
          permissionState: permissionState(permission),
          appVersion: Constants.expoConfig?.version,
          token: devicePushToken.data,
        });
      })().catch(() => setError('push_token_refresh_failed'));
    });
    return () => {
      appState.remove();
      tokenSubscription.remove();
    };
  }, [installationId, registerInstallation, sync, trackUserId]);

  useEffect(() => {
    if (!trackUserId || Platform.OS === 'web') return;
    async function open(response: Notifications.NotificationResponse | null) {
      if (!response) return;
      const responseId = response.notification.request.identifier;
      if (!await consumePushResponseId(responseId)) return;
      const data = response.notification.request.content.data;
      const href = resolvePushHref(data);
      if (!href) return;
      const id = installationId ?? await getPushInstallationId();
      const intentId = data?.intentId;
      if (typeof intentId === 'string') {
        await recordOpen({
          userId: trackUserId!, installationId: id,
          intentId: intentId as Id<'pushDeliveryIntents'>,
        }).catch(() => undefined);
      }
      router.push(href as Href);
    }
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => { void open(response); });
    void Notifications.getLastNotificationResponseAsync().then(open);
    return () => subscription.remove();
  }, [installationId, recordOpen, router, trackUserId]);

  const value = useMemo<PushContextValue>(() => ({
    error,
    installationId,
    permissionState: serverStatus?.permissionState ?? localPermission,
    registered: serverStatus?.registered ?? false,
    requestPermission: () => sync(true),
    refresh: () => sync(false),
    openDeviceSettings: () => Linking.openSettings(),
    sendTestNotification: async () => {
      if (!trackUserId) return null;
      if (serverStatus?.registered) return await sendTest({ userId: trackUserId });
      if (__DEV__ && (localPermission === 'granted' || localPermission === 'provisional')) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: t('notifications.localTestTitle'),
            body: t('notifications.localTestBody'),
            data: { schemaVersion: '1', eventKind: 'test', url: '/projects' },
          },
          trigger: null,
        });
        return { attempted: 1, queued: 1, sent: 1, failed: 0 };
      }
      return await sendTest({ userId: trackUserId });
    },
    syncing,
  }), [error, installationId, localPermission, sendTest, serverStatus, sync, syncing, t, trackUserId]);

  return <PushContext.Provider value={value}>{children}</PushContext.Provider>;
}
