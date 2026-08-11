import {
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useState } from 'react';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { authClient } from '@/lib/auth-client';
import { useDevAuthBypass } from '@/lib/dev-auth-bypass';
import { requiresTwoFactor, validateEmailSignIn, validateEmailSignUp } from '@/lib/email-auth';
import { hapticLight, hapticMedium } from '@/lib/haptics';
import { PlatformIcon } from '@/components/platform-icon';
import { SignInHero } from '@/components/sign-in-hero';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { LanguageSwitcher } from '@/i18n';
import { useLocale } from '@/contexts/locale-context';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import googleMarkImage from '@/assets/images/google-g.png';

export default function SignInScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation('common');
  const { direction } = useLocale();
  const devAuthBypass = useDevAuthBypass();
  const session = authClient.useSession();
  const [busy, setBusy] = useState(false);
  const [emailMode, setEmailMode] = useState(false);
  const [emailIntent, setEmailIntent] = useState<'signIn' | 'signUp'>('signIn');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const signedIn = Boolean(session.data);

  // A session that arrives while this screen is up — a restore that finished
  // late, or a sign-in on another tab of the same flow — carries the user in
  // instead of leaving them staring at a form they no longer need.
  useEffect(() => {
    if (signedIn) router.replace('/');
  }, [router, signedIn]);

  async function signIn(provider: 'google' | 'apple') {
    setBusy(true);
    setError(null);
    hapticMedium();
    try {
      const result =
        provider === 'apple' && Platform.OS === 'ios'
          ? await signInWithNativeApple()
          : await authClient.signIn.social({ provider, callbackURL: '/' });
      const err = (result as { error?: { code?: string; message?: string } | null }).error;
      if (err) {
        throw new Error(err.code ?? 'auth_error');
      }
      await waitForSessionReady(session.refetch);
      router.replace('/');
    } catch (e) {
      hapticLight();
      if (isAppleCancel(e)) {
        return;
      }
      setError(getAuthErrorMessage(e, t));
    } finally {
      setBusy(false);
    }
  }

  async function signInWithEmail() {
    const input = validateEmailSignIn(email, password);
    if (!input.ok) {
      setError(getValidationErrorMessage(input.error, t));
      return;
    }

    setBusy(true);
    setError(null);
    hapticMedium();
    try {
      const result = await authClient.signIn.email({
        email: input.email,
        password,
        callbackURL: '/',
      });
      if (result.error) {
        throw new Error('email_or_password_incorrect');
      }
      if (requiresTwoFactor(result.data)) {
        return;
      }
      await waitForSessionReady(session.refetch);
      router.replace('/');
    } catch (e) {
      hapticLight();
      setError(getAuthErrorMessage(e, t));
    } finally {
      setBusy(false);
    }
  }

  async function signUpWithEmail() {
    const input = validateEmailSignUp(name, email, password);
    if (!input.ok) {
      setError(getValidationErrorMessage(input.error, t));
      return;
    }

    setBusy(true);
    setError(null);
    hapticMedium();
    try {
      const result = await authClient.signUp.email({
        email: input.email,
        name: input.name,
        password,
        callbackURL: '/',
      });
      if (result.error) {
        throw new Error(result.error.code ?? 'account_creation_failed');
      }
      await waitForSessionReady(session.refetch);
      router.replace('/');
    } catch (e) {
      hapticLight();
      setError(getAuthErrorMessage(e, t, 'signUp'));
    } finally {
      setBusy(false);
    }
  }

  function submitEmail() {
    void (emailIntent === 'signUp' ? signUpWithEmail() : signInWithEmail());
  }

  async function signInWithDevBypass() {
    setBusy(true);
    setError(null);
    hapticMedium();
    try {
      await devAuthBypass.enable();
      await waitForSessionReady(session.refetch);
      router.replace('/');
    } catch {
      hapticLight();
      setError(t('auth.developmentSignInFailed'));
    } finally {
      setBusy(false);
    }
  }

  const showApple = Platform.OS !== 'android';

  return (
    <ThemedView style={[styles.screen, { direction }]}>
      <SafeAreaView edges={['top', 'bottom']} style={styles.safe}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboard}>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.languageWrap}>
              <LanguageSwitcher compact />
            </View>
            <SignInHero />

            {/* Auth panel */}
            <View style={styles.panel}>
              {error ? (
                <View style={[styles.errorBox, { backgroundColor: theme.dangerSoft, borderColor: theme.danger }]}>
                  <ThemedText style={{ color: theme.danger }} type="small">
                    {error}
                  </ThemedText>
                </View>
              ) : null}

              {/* Google */}
              <Pressable
                android_ripple={{ color: theme.background }}
                disabled={busy}
                onPress={() => void signIn('google')}
                style={[
                  styles.authButton,
                  styles.authButtonPrimary,
                  { backgroundColor: theme.text, opacity: busy ? 0.7 : 1 },
                ]}
              >
                <Image accessibilityIgnoresInvertColors source={googleMarkImage} style={styles.authIcon} />
                <ThemedText style={[styles.authLabel, { color: theme.background }]}>{t('auth.continueGoogle')}</ThemedText>
              </Pressable>

              {/* Apple */}
              {showApple ? (
                <Pressable
                  android_ripple={{ color: theme.hairline }}
                  disabled={busy}
                  onPress={() => void signIn('apple')}
                  style={[
                    styles.authButton,
                    {
                      backgroundColor: theme.backgroundElement,
                      opacity: busy ? 0.7 : 1,
                    },
                  ]}
                >
                  <PlatformIcon color={theme.text} name="apple" size={20} />
                  <ThemedText style={[styles.authLabel, { color: theme.text }]}>{t('auth.continueApple')}</ThemedText>
                </Pressable>
              ) : null}

              {emailMode ? (
                <View style={styles.emailFields}>
                  {emailIntent === 'signUp' ? (
                    <TextInput
                      accessibilityLabel={t('auth.fullName')}
                      autoCapitalize="words"
                      autoComplete="name"
                      editable={!busy}
                      onChangeText={setName}
                      placeholder={t('auth.fullName')}
                      placeholderTextColor={theme.textSecondary}
                      returnKeyType="next"
                      style={[
                        styles.input,
                        {
                          backgroundColor: theme.backgroundElement,
                          borderColor: theme.hairline,
                          color: theme.text,
                          writingDirection: direction,
                        },
                      ]}
                      textContentType="name"
                      value={name}
                    />
                  ) : null}
                  <TextInput
                    accessibilityLabel={t('auth.emailAddress')}
                    autoCapitalize="none"
                    autoComplete="email"
                    editable={!busy}
                    keyboardType="email-address"
                    onChangeText={setEmail}
                    placeholder={t('auth.emailAddress')}
                    placeholderTextColor={theme.textSecondary}
                    returnKeyType="next"
                    style={[
                      styles.input,
                      {
                          backgroundColor: theme.backgroundElement,
                          borderColor: theme.hairline,
                          color: theme.text,
                          textAlign: 'left',
                          writingDirection: 'ltr',
                      },
                    ]}
                    textContentType="emailAddress"
                    value={email}
                  />
                  <TextInput
                    accessibilityLabel={t('auth.password')}
                    autoCapitalize="none"
                    autoComplete={emailIntent === 'signUp' ? 'new-password' : 'current-password'}
                    editable={!busy}
                    onChangeText={setPassword}
                    onSubmitEditing={submitEmail}
                    placeholder={t('auth.password')}
                    placeholderTextColor={theme.textSecondary}
                    returnKeyType="done"
                    secureTextEntry
                    style={[
                      styles.input,
                      {
                          backgroundColor: theme.backgroundElement,
                          borderColor: theme.hairline,
                          color: theme.text,
                          textAlign: 'left',
                          writingDirection: 'ltr',
                      },
                    ]}
                    textContentType={emailIntent === 'signUp' ? 'newPassword' : 'password'}
                    value={password}
                  />
                  <Pressable
                    android_ripple={{ color: theme.background }}
                    disabled={busy}
                    onPress={submitEmail}
                    style={[styles.authButton, { backgroundColor: theme.text, opacity: busy ? 0.7 : 1 }]}
                  >
                    <PlatformIcon color={theme.background} name="email-outline" size={20} />
                    <ThemedText style={[styles.authLabel, { color: theme.background }]}>
                      {emailIntent === 'signUp' ? t('auth.createAccount') : t('auth.signInWithEmail')}
                    </ThemedText>
                  </Pressable>
                  <Pressable
                    disabled={busy}
                    hitSlop={8}
                    onPress={() => {
                      hapticLight();
                      setError(null);
                      setEmailIntent(emailIntent === 'signUp' ? 'signIn' : 'signUp');
                    }}
                    style={styles.emailLink}
                  >
                    <ThemedText style={{ color: theme.textSecondary }} type="small">
                      {emailIntent === 'signUp'
                        ? t('auth.alreadyHaveAccount')
                        : t('auth.newToTrack')}
                    </ThemedText>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  disabled={busy}
                  hitSlop={8}
                  onPress={() => {
                    hapticLight();
                    setError(null);
                    setEmailMode(true);
                  }}
                  style={styles.emailLink}
                >
                  <ThemedText style={{ color: theme.textSecondary }} type="smallBold">
                    {t('auth.continueWithEmail')}
                  </ThemedText>
                </Pressable>
              )}

              {/* Dev bypass */}
              {devAuthBypass.allowed ? (
                <Pressable
                  disabled={busy}
                  onPress={() => void signInWithDevBypass()}
                  style={styles.devBypass}
                >
                  <ThemedText style={{ color: theme.textSecondary }} type="small">
                    {t('auth.devBypass')}
                  </ThemedText>
                </Pressable>
              ) : null}
            </View>

            {/* Legal */}
            <ThemedText style={[styles.legal, { color: theme.textTertiary }]} type="caption">
              {t('auth.legalPrefix')}{' '}
              <ThemedText
                accessibilityRole="link"
                onPress={() => {
                  hapticLight();
                  void Linking.openURL('https://track.q9labs.ai/terms');
                }}
                style={[styles.legalLink, { color: theme.textSecondary }]}
                type="caption"
              >
                {t('auth.terms')}
              </ThemedText>{' '}
              {t('auth.and')}{' '}
              <ThemedText
                accessibilityRole="link"
                onPress={() => {
                  hapticLight();
                  void Linking.openURL('https://track.q9labs.ai/privacy');
                }}
                style={[styles.legalLink, { color: theme.textSecondary }]}
                type="caption"
              >
                {t('auth.privacyPolicy')}
              </ThemedText>
              .
            </ThemedText>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

async function signInWithNativeApple() {
  const isAvailable = await AppleAuthentication.isAvailableAsync();
  if (!isAvailable) {
    throw new Error('apple_unavailable');
  }

  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });

  if (!credential.identityToken) {
    throw new Error('apple_token_missing');
  }

  return await authClient.signIn.social({
    provider: 'apple',
    idToken: {
      token: credential.identityToken,
      user: getAppleUserPayload(credential),
    },
    callbackURL: '/',
  });
}

async function waitForSessionReady(refetch: ReturnType<typeof authClient.useSession>['refetch']) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await refetch({ query: { disableCookieCache: true } });

    const snapshot = authClient.$store.atoms.session?.get() as { data?: unknown } | undefined;
    if (snapshot?.data) return;

    await sleep(250);
  }

  throw new Error('session_not_ready');
}

function getAppleUserPayload(credential: AppleAuthentication.AppleAuthenticationCredential) {
  const firstName = credential.fullName?.givenName?.trim();
  const lastName = credential.fullName?.familyName?.trim();
  const email = credential.email?.trim();

  if (!firstName && !lastName && !email) return undefined;

  return {
    name: firstName || lastName ? { firstName, lastName } : undefined,
    email,
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAppleCancel(error: unknown) {
  return error instanceof Error && (error as Error & { code?: string }).code === 'ERR_REQUEST_CANCELED';
}

type Translate = (key: string, options?: Record<string, unknown>) => string;

function getValidationErrorMessage(error: string, t: Translate) {
  if (error === 'Enter a valid email address.') return t('auth.validEmail');
  if (error === 'Enter your password.') return t('auth.passwordRequired');
  if (error === 'Enter your name.') return t('auth.nameRequired');

  const match = error.match(/at least (\d+) characters/);
  return match ? t('auth.passwordLength', { count: match[1] }) : t('auth.signInFailed');
}

function getAuthErrorMessage(error: unknown, t: Translate, mode: 'signIn' | 'signUp' = 'signIn') {
  const code = error instanceof Error ? error.message : '';
  if (code === 'email_or_password_incorrect') return t('auth.emailPasswordIncorrect');
  if (code === 'account_creation_failed') return t('auth.accountCreationFailed');
  if (code === 'apple_unavailable') return t('auth.appleUnavailable');
  if (code === 'apple_token_missing') return t('auth.appleTokenMissing');
  if (code === 'session_not_ready') return t('auth.sessionNotReady');
  return mode === 'signUp' ? t('auth.accountCreationFailed') : t('auth.signInFailed');
}

const styles = StyleSheet.create({
  authButton: {
    alignItems: 'center',
    borderRadius: 14,
    flexDirection: 'row',
    gap: Spacing.three,
    justifyContent: 'center',
    minHeight: 50,
    overflow: 'hidden',
    paddingHorizontal: Spacing.four,
  },
  authButtonPrimary: {
    // slightly elevated appearance via shadow on iOS
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  authIcon: { height: 20, width: 20 },
  authLabel: { fontSize: 15, fontWeight: '600', letterSpacing: 0 },
  content: {
    flexGrow: 1,
  },
  devBypass: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
  },
  errorBox: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  emailFields: {
    gap: Spacing.three,
  },
  emailLink: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
  },
  legal: {
    paddingBottom: Spacing.four,
    paddingHorizontal: Spacing.six,
    textAlign: 'center',
  },
  legalLink: {
    textDecorationLine: 'underline',
  },
  input: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 16,
    minHeight: 52,
    paddingHorizontal: Spacing.four,
  },
  languageWrap: {
    alignItems: 'flex-end',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
  },
  keyboard: {
    flex: 1,
  },
  panel: {
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  safe: { flex: 1 },
  screen: { flex: 1 },
});
