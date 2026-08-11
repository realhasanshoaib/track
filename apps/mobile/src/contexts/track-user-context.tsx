import { createContext, useContext, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';

import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import { authClient, setTwoFactorRedirectHandler } from '@/lib/auth-client';
import { clearStoredAuthSession } from '@/lib/auth-storage';
import { useDevAuthBypass } from '@/lib/dev-auth-bypass';
import { getStoredPushInstallationId } from '@/lib/push-installation';
import { useLocale } from '@/contexts/locale-context';
import { OptionsSheet, SheetInput, SheetSection } from '@/components/options-sheet';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type TrackUserContextValue = {
  trackUserId: Id<'users'> | null;
  isAuthReady: boolean;
  signOut: () => Promise<void>;
  openProfileSheet: () => void;
  devAuthBypass: ReturnType<typeof useDevAuthBypass>;
};

const TrackUserContext = createContext<TrackUserContextValue | null>(null);

export function useTrackUser() {
  const ctx = useContext(TrackUserContext);
  if (!ctx) throw new Error('useTrackUser must be used inside TrackUserProvider');
  return ctx;
}

export function TrackUserProvider({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  const { t } = useTranslation('common');
  const { direction } = useLocale();
  const router = useRouter();
  const devAuthBypass = useDevAuthBypass();
  const session = authClient.useSession();

  const ensureCurrentUser = useMutation(api.auth.ensureCurrentUser);
  const syncDevUser = useMutation(api.auth.syncDevUser);
  const acceptInvites = useMutation(api.invitations.acceptPendingForCurrentUser);
  const updateProfile = useMutation(api.auth.updateProfile);
  const detachPushInstallation = useMutation(api.notifications.detachNativeInstallation);
  const [trackUserId, setTrackUserId] = useState<Id<'users'> | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [sheet, setSheet] = useState<'profile' | 'two-factor' | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [bootstrapError, setBootstrapError] = useState<'account' | 'invites' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [syncAttempt, setSyncAttempt] = useState(0);
  const [profileDraft, setProfileDraft] = useState({
    displayName: '',
    profileDesignation: '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  });
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [twoFactorMethod, setTwoFactorMethod] = useState<'totp' | 'backup_code'>('totp');

  const trackUser = useQuery(api.auth.getCurrentUser);
  const profileStatus = useQuery(
    api.auth.getProfileStatus,
    trackUserId ? { userId: trackUserId } : 'skip',
  );

  const hasAccess = Boolean(session.data || devAuthBypass.enabled);

  // Sync user on session arrival
  useEffect(() => {
    if (!hasAccess || trackUserId) return;
    if (session.isPending && !devAuthBypass.enabled) return;
    const syncUser = devAuthBypass.enabled && !session.data ? syncDevUser : ensureCurrentUser;
    setBootstrapError(null);
    void syncUser()
      .then(async (userId) => {
        if (!userId) return;
        setTrackUserId(userId);
        setIsAuthReady(true);
        try {
          await acceptInvites({ userId });
        } catch {
          setBootstrapError('invites');
        }
      })
      .catch(() => setBootstrapError('account'));
  }, [acceptInvites, devAuthBypass.enabled, ensureCurrentUser, hasAccess, session.data, session.isPending, syncAttempt, syncDevUser, trackUserId]);

  // Keep trackUserId in sync with the convex getCurrentUser query
  useEffect(() => {
    if (trackUser?._id && trackUser._id !== trackUserId) {
      setTrackUserId(trackUser._id);
      setIsAuthReady(true);
    }
  }, [trackUser?._id, trackUserId]);

  // Show profile sheet if profile is incomplete
  useEffect(() => {
    if (!profileStatus?.user) return;
    setProfileDraft({
      displayName: profileStatus.user.displayName ?? '',
      profileDesignation: profileStatus.user.profileDesignation ?? '',
      timezone: profileStatus.user.timezone ?? (Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'),
    });
    if (!profileStatus.complete) setSheet('profile');
  }, [profileStatus?.complete, profileStatus?.user]);

  // 2FA redirect
  useEffect(() => {
    setTwoFactorRedirectHandler(() => {
      setActionError(null);
      setSheet('two-factor');
    });
    return () => setTwoFactorRedirectHandler(null);
  }, []);

  // Redirect to sign-in when session is lost
  useEffect(() => {
    if (session.isPending) return;
    if (!hasAccess && isAuthReady) {
      setTrackUserId(null);
      setIsAuthReady(false);
      router.replace('/sign-in');
    }
  }, [hasAccess, isAuthReady, router, session.isPending]);

  async function withBusy(key: string, fn: () => Promise<unknown>) {
    setBusyAction(key);
    setActionError(null);
    try {
      await fn();
    } catch {
      setActionError(key === 'profile'
        ? t('errors.profileSave')
        : t('errors.twoFactorVerify'));
    } finally {
      setBusyAction(null);
    }
  }

  async function retryBootstrap() {
    if (bootstrapError === 'account') {
      setSyncAttempt((attempt) => attempt + 1);
      return;
    }
    if (!trackUserId) return;
    setBusyAction('invites');
    try {
      await acceptInvites({ userId: trackUserId });
      setBootstrapError(null);
    } catch {
      setBootstrapError('invites');
    } finally {
      setBusyAction(null);
    }
  }

  async function signOut() {
    setBusyAction('sign-out');
    setSignOutError(null);
    if (trackUserId) {
      try {
        const installationId = await getStoredPushInstallationId();
        if (installationId) await detachPushInstallation({ installationId });
      } catch {
        setSignOutError(t('errors.signOutDisconnect'));
        setBusyAction(null);
        return;
      }
    }
    try {
      await authClient.signOut();
    } catch {
      const sessionAtom = authClient.$store.atoms.session;
      const currentSession = sessionAtom?.get?.();
      if (sessionAtom && currentSession) {
        sessionAtom.set({
          ...currentSession,
          data: null,
          error: null,
          isPending: false,
          isRefetching: false,
        });
      }
    } finally {
      clearStoredAuthSession();
      setSheet(null);
      setTrackUserId(null);
      setIsAuthReady(false);
      setBusyAction(null);
      router.replace('/sign-in');
    }
  }

  async function submitProfile() {
    if (!trackUserId) return;
    await withBusy('profile', async () => {
      await updateProfile({
        userId: trackUserId,
        displayName: profileDraft.displayName,
        profileDesignation: profileDraft.profileDesignation,
        timezone: profileDraft.timezone,
        profileBannerStyle: 'silk',
      });
      setSheet(null);
    });
  }

  async function submitTwoFactor() {
    await withBusy('two-factor', async () => {
      const result =
        twoFactorMethod === 'backup_code'
          ? await authClient.twoFactor.verifyBackupCode({
              code: twoFactorCode,
              disableSession: false,
            })
          : await authClient.twoFactor.verifyTotp({ code: twoFactorCode });
      if (result.error) {
        throw new Error(result.error.message ?? 'Two-factor verification failed.');
      }
      await session.refetch({ query: { disableCookieCache: true } });
      setTwoFactorCode('');
      setSheet(null);
      router.replace('/');
    });
  }

  const value: TrackUserContextValue = {
    trackUserId,
    isAuthReady,
    signOut,
    openProfileSheet: () => {
      setActionError(null);
      setSheet('profile');
    },
    devAuthBypass,
  };

  return (
    <TrackUserContext.Provider value={value}>
      {children}

      {bootstrapError ? (
        <View accessibilityRole="alert" style={[styles.errorBanner, { backgroundColor: theme.backgroundElement, direction }]}>
          <ThemedText type="smallBold">
            {bootstrapError === 'account' ? t('errors.accountSetup') : t('errors.pendingInvites')}
          </ThemedText>
          <ThemedText type="small">{t('errors.connectionRetry')}</ThemedText>
          <Pressable
            accessibilityRole="button"
            disabled={busyAction === 'invites'}
            onPress={() => void retryBootstrap()}
            style={[styles.retryButton, { borderColor: theme.hairline }]}>
            <ThemedText type="smallBold">{busyAction === 'invites' ? t('generic.trying') : t('generic.retry')}</ThemedText>
          </Pressable>
        </View>
      ) : null}

      {signOutError ? (
        <View accessibilityRole="alert" style={[styles.errorBanner, { backgroundColor: theme.backgroundElement, direction }]}>
          <ThemedText type="smallBold">{t('errors.signOutPrivate')}</ThemedText>
          <ThemedText type="small">{signOutError}</ThemedText>
          <Pressable
            accessibilityRole="button"
            disabled={busyAction === 'sign-out'}
            onPress={() => void signOut()}
            style={[styles.retryButton, { borderColor: theme.hairline }]}>
            <ThemedText type="smallBold">{busyAction === 'sign-out' ? t('generic.trying') : t('generic.retry')}</ThemedText>
          </Pressable>
        </View>
      ) : null}

      <OptionsSheet
        onClose={() => profileStatus?.complete ? setSheet(null) : undefined}
        title={t('profile.title')}
        visible={sheet === 'profile'}>
        <SheetSection>
          <View style={styles.profileInputs}>
            <SheetInput
              label={t('profile.name')}
              onChangeText={(displayName) => setProfileDraft((d) => ({ ...d, displayName }))}
              value={profileDraft.displayName}
            />
            <SheetInput
              label={t('profile.designation')}
              onChangeText={(profileDesignation) => setProfileDraft((d) => ({ ...d, profileDesignation }))}
              value={profileDraft.profileDesignation}
            />
            <SheetInput
              label={t('profile.timezone')}
              onChangeText={(timezone) => setProfileDraft((d) => ({ ...d, timezone }))}
              value={profileDraft.timezone}
            />
          </View>
        </SheetSection>
        {actionError ? <ThemedText accessibilityRole="alert" style={styles.errorText} type="small">{actionError}</ThemedText> : null}
        <Pressable
          disabled={busyAction === 'profile'}
          onPress={() => void submitProfile()}
          style={[styles.primaryButton, { backgroundColor: busyAction === 'profile' ? theme.hairline : theme.text }]}>
          <ThemedText style={{ color: theme.background }} type="smallBold">
            {busyAction === 'profile' ? t('profile.saving') : t('profile.save')}
          </ThemedText>
        </Pressable>
      </OptionsSheet>

      <OptionsSheet onClose={() => setSheet(null)} title={t('twoFactor.title')} visible={sheet === 'two-factor'}>
        <SheetSection>
          <View style={styles.segmented}>
            {(['totp', 'backup_code'] as const).map((method) => (
              <Pressable
                key={method}
                onPress={() => setTwoFactorMethod(method)}
                style={[
                  styles.segment,
                  { backgroundColor: twoFactorMethod === method ? theme.backgroundSelected : theme.backgroundElement },
                ]}>
                <ThemedText type="code">{method === 'totp' ? t('twoFactor.authenticator') : t('twoFactor.backupCode')}</ThemedText>
              </Pressable>
            ))}
          </View>
          <SheetInput label={t('twoFactor.code')} onChangeText={setTwoFactorCode} value={twoFactorCode} />
        </SheetSection>
        {actionError ? <ThemedText accessibilityRole="alert" style={styles.errorText} type="small">{actionError}</ThemedText> : null}
        <Pressable
          disabled={busyAction === 'two-factor'}
          onPress={() => void submitTwoFactor()}
          style={[styles.primaryButton, { backgroundColor: busyAction === 'two-factor' ? theme.hairline : theme.text }]}>
          <ThemedText style={{ color: theme.background }} type="smallBold">
            {busyAction === 'two-factor' ? t('twoFactor.verifying') : t('twoFactor.verify')}
          </ThemedText>
        </Pressable>
      </OptionsSheet>
    </TrackUserContext.Provider>
  );
}

const styles = StyleSheet.create({
  errorBanner: {
    borderRadius: 12,
    bottom: Spacing.four,
    gap: Spacing.two,
    left: Spacing.four,
    padding: Spacing.three,
    position: 'absolute',
    right: Spacing.four,
  },
  errorText: {
    paddingHorizontal: Spacing.three,
  },
  primaryButton: {
    alignItems: 'center',
    borderRadius: 10,
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: Spacing.four,
  },
  profileInputs: {
    gap: Spacing.three,
    padding: Spacing.three,
  },
  retryButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  segment: {
    alignItems: 'center',
    borderRadius: 8,
    flex: 1,
    paddingVertical: Spacing.two,
  },
  segmented: {
    flexDirection: 'row',
    gap: Spacing.two,
    padding: Spacing.three,
  },
});
