import {
  ActivityIndicator,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useState } from 'react';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useRouter } from 'expo-router';

import { ActionButton } from '@/components/action-button';
import { ConnectivityBanner } from '@/components/connectivity-banner';
import { authClient } from '@/lib/auth-client';
import { authStoragePrefix } from '@/lib/auth-storage';
import { useDevAuthBypass } from '@/lib/dev-auth-bypass';
import { MIN_PASSWORD_LENGTH, requiresTwoFactor, validateEmailAddress, validateEmailSignIn, validateEmailSignUp } from '@/lib/email-auth';
import { hapticLight, hapticMedium } from '@/lib/haptics';
import { IconButton } from '@/components/icon-button';
import { SignInHero } from '@/components/sign-in-hero';
import { ThemedText } from '@/components/themed-text';
import { ThemedTextInput } from '@/components/themed-text-input';
import { ThemedView } from '@/components/themed-view';
import { MaxFontScale, Radius, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { accountErrorMessage } from '@/lib/user-facing-error';

import googleMarkImage from '@/assets/images/google-g.png';

export default function SignInScreen() {
  const theme = useTheme();
  const router = useRouter();
  const devAuthBypass = useDevAuthBypass();
  const session = authClient.useSession();
  const [busyAction, setBusyAction] = useState<'apple' | 'dev' | 'email' | 'google' | 'reset' | null>(null);
  const [emailIntent, setEmailIntent] = useState<'signIn' | 'signUp'>('signIn');
  const [forgotPassword, setForgotPassword] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [retryAction, setRetryAction] = useState<'apple' | 'dev' | 'email' | 'google' | 'reset' | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  const signedIn = Boolean(session.data);
  const busy = busyAction !== null;

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const show = Keyboard.addListener('keyboardWillShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardWillHide', () => setKeyboardVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // A session that arrives while this screen is up — a restore that finished
  // late, or a sign-in on another tab of the same flow — carries the user in
  // instead of leaving them staring at a form they no longer need.
  useEffect(() => {
    if (signedIn) router.replace('/');
  }, [router, signedIn]);

  async function signIn(provider: 'google' | 'apple') {
    setBusyAction(provider);
    setError(null);
    setRetryAction(null);
    hapticMedium();
    try {
      const result =
        provider === 'apple' && Platform.OS === 'ios'
          ? await signInWithNativeApple()
          : await authClient.signIn.social({ provider, callbackURL: '/' });
      const err = (result as { error?: { code?: string; message?: string } | null }).error;
      if (err) {
        throw new Error(err.message ?? err.code ?? 'Sign-in failed');
      }
      await waitForSessionReady(session.refetch);
      router.replace('/');
    } catch (e) {
      hapticLight();
      if (isAppleCancel(e)) {
        return;
      }
      const message = accountErrorMessage(e);
      setError(message);
      if (message.includes('connect')) setRetryAction(provider);
    } finally {
      setBusyAction(null);
    }
  }

  async function signInWithEmail() {
    const input = validateEmailSignIn(email, password);
    if (!input.ok) {
      setError(input.error);
      setRetryAction(null);
      return;
    }

    setBusyAction('email');
    setError(null);
    setRetryAction(null);
    hapticMedium();
    try {
      const result = await authClient.signIn.email({
        email: input.email,
        password,
      });
      if (result.error) {
        const authError = result.error as { code?: string; message?: string };
        throw new Error(authError.message ?? authError.code ?? 'Sign-in failed.');
      }
      if (requiresTwoFactor(result.data)) {
        return;
      }
      await waitForSessionReady(session.refetch);
      router.replace('/');
    } catch (e) {
      hapticLight();
      const message = accountErrorMessage(e);
      setError(message);
      if (message.includes('connect')) setRetryAction('email');
    } finally {
      setBusyAction(null);
    }
  }

  async function signUpWithEmail() {
    const input = validateEmailSignUp(name, email, password);
    if (!input.ok) {
      setError(input.error);
      setRetryAction(null);
      return;
    }

    setBusyAction('email');
    setError(null);
    setRetryAction(null);
    hapticMedium();
    try {
      const result = await authClient.signUp.email({
        email: input.email,
        name: input.name,
        password,
      });
      if (result.error) {
        throw new Error(result.error.message ?? 'Could not create the account.');
      }
      await waitForSessionReady(session.refetch);
      router.replace('/');
    } catch (e) {
      hapticLight();
      const message = accountErrorMessage(e, 'Track could not create the account. Check your details and try again.');
      setError(message);
      if (message.includes('connect')) setRetryAction('email');
    } finally {
      setBusyAction(null);
    }
  }

  async function requestPasswordReset() {
    const input = validateEmailAddress(email);
    if (!input.ok) {
      setError(input.error);
      setNotice(null);
      setRetryAction(null);
      return;
    }

    setBusyAction('reset');
    setError(null);
    setNotice(null);
    setRetryAction(null);
    try {
      const result = await authClient.requestPasswordReset({
        email: input.email,
        redirectTo: `${authStoragePrefix}://reset-password`,
      });
      if (result.error) throw new Error(result.error.message ?? 'Password reset could not be requested.');
      setResetSent(true);
      setNotice('If an account uses this email, Track will send a password reset link.');
    } catch (failure) {
      const message = accountErrorMessage(failure, 'Track could not send a reset link. Check your connection and try again.');
      setError(message);
      if (message.includes('connect')) setRetryAction('reset');
    } finally {
      setBusyAction(null);
    }
  }

  function submitEmail() {
    if (forgotPassword) {
      void requestPasswordReset();
      return;
    }
    void (emailIntent === 'signUp' ? signUpWithEmail() : signInWithEmail());
  }

  async function signInWithDevBypass() {
    setBusyAction('dev');
    setError(null);
    setRetryAction(null);
    hapticMedium();
    try {
      await devAuthBypass.enable();
      await waitForSessionReady(session.refetch);
      router.replace('/');
    } catch {
      hapticLight();
      setError('Development sign-in failed. Check the development auth configuration.');
    } finally {
      setBusyAction(null);
    }
  }

  const showApple = Platform.OS !== 'android';

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView edges={['top', 'bottom']} style={styles.safe}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboard}>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
          >
            {!keyboardVisible ? <SignInHero /> : null}

            <ConnectivityBanner message="You’re offline. Reconnect to sign in or create an account." />

            <View style={styles.panel}>
              {error ? (
                <View accessibilityRole="alert" style={[styles.errorBox, { backgroundColor: theme.dangerSoft, borderColor: theme.danger }]}>
                  <ThemedText style={{ color: theme.danger }} type="small">
                    {error}
                  </ThemedText>
                  {retryAction ? (
                    <ActionButton
                      label="Try again"
                      onPress={() => retryAction === 'reset'
                        ? void requestPasswordReset()
                        : retryAction === 'email'
                          ? submitEmail()
                          : retryAction === 'dev'
                            ? void signInWithDevBypass()
                            : void signIn(retryAction)}
                      variant="secondary"
                    />
                  ) : null}
                </View>
              ) : null}
              {notice ? <View accessibilityRole="alert" style={[styles.noticeBox, { backgroundColor: theme.successSoft, borderColor: theme.success }]}>
                <ThemedText themeColor="success" type="small">{notice}</ThemedText>
              </View> : null}

              <View style={styles.emailFields}>
                  {!forgotPassword && emailIntent === 'signUp' ? (
                    <View style={styles.field}>
                      <ThemedText themeColor="textSecondary" type="captionBold">Full name</ThemedText>
                      <ThemedTextInput
                        accessibilityLabel="Full name"
                        autoCapitalize="words"
                        autoComplete="name"
                        editable={!busy}
                        keyboardAppearance={theme.background === '#1b1917' ? 'dark' : 'light'}
                        maxLength={100}
                        maxFontSizeMultiplier={MaxFontScale}
                        onChangeText={setName}
                        placeholder="e.g. Alex Morgan"
                        placeholderTextColor={theme.textTertiary}
                        returnKeyType="next"
                        style={[styles.input, { backgroundColor: theme.backgroundElement, borderColor: theme.hairline, color: theme.text }]}
                        textContentType="name"
                        value={name}
                      />
                    </View>
                  ) : null}
                  <View style={styles.field}>
                    <ThemedText themeColor="textSecondary" type="captionBold">Email address</ThemedText>
                    <ThemedTextInput
                      accessibilityLabel="Email address"
                      autoCapitalize="none"
                      autoComplete="email"
                      editable={!busy}
                      keyboardType="email-address"
                      keyboardAppearance={theme.background === '#1b1917' ? 'dark' : 'light'}
                      maxLength={254}
                      maxFontSizeMultiplier={MaxFontScale}
                      onChangeText={setEmail}
                      placeholder="name@company.com"
                      placeholderTextColor={theme.textTertiary}
                      returnKeyType="next"
                      style={[styles.input, { backgroundColor: theme.backgroundElement, borderColor: theme.hairline, color: theme.text }]}
                      textContentType="emailAddress"
                      value={email}
                    />
                  </View>
                  {!forgotPassword ? <View style={styles.field}>
                    <ThemedText themeColor="textSecondary" type="captionBold">Password</ThemedText>
                    <View style={[styles.passwordField, { backgroundColor: theme.backgroundElement, borderColor: theme.hairline }]}>
                      <ThemedTextInput
                        accessibilityLabel="Password"
                        autoCapitalize="none"
                        autoComplete={emailIntent === 'signUp' ? 'new-password' : 'current-password'}
                        editable={!busy}
                        keyboardAppearance={theme.background === '#1b1917' ? 'dark' : 'light'}
                        maxLength={256}
                        maxFontSizeMultiplier={MaxFontScale}
                        onChangeText={setPassword}
                        onSubmitEditing={submitEmail}
                        placeholder="Enter your password"
                        placeholderTextColor={theme.textTertiary}
                        returnKeyType="done"
                        secureTextEntry={!passwordVisible}
                        style={[styles.passwordInput, { color: theme.text }]}
                        textContentType={emailIntent === 'signUp' ? 'newPassword' : 'password'}
                        value={password}
                      />
                      <IconButton
                        accessibilityLabel={passwordVisible ? 'Hide password' : 'Show password'}
                        disabled={busy}
                        icon={passwordVisible ? 'eye-off' : 'eye'}
                        onPress={() => setPasswordVisible((visible) => !visible)}
                        size={20}
                      />
                    </View>
                    <ThemedText themeColor="textTertiary" type="caption">
                      {emailIntent === 'signUp' ? `Use at least ${MIN_PASSWORD_LENGTH} characters.` : 'Your password is encrypted in transit.'}
                    </ThemedText>
                  </View> : null}
                  {forgotPassword ? <ThemedText themeColor="textSecondary" type="small">
                    Enter the email address for your account. We’ll send a secure reset link if it matches an account.
                  </ThemedText> : null}
                  <ActionButton
                    icon="email-outline"
                    label={forgotPassword ? resetSent ? 'Send another reset link' : 'Send reset link' : emailIntent === 'signUp' ? 'Create account' : 'Continue with email'}
                    loading={busyAction === 'email' || busyAction === 'reset'}
                    disabled={busy && busyAction !== 'email' && busyAction !== 'reset'}
                    onPress={submitEmail}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: busy }}
                    disabled={busy}
                    hitSlop={8}
                    onPress={() => {
                      hapticLight();
                      setNotice(null);
                      setResetSent(false);
                      setError(null);
                      if (forgotPassword) {
                        setForgotPassword(false);
                        setEmailIntent('signIn');
                      } else {
                        setEmailIntent(emailIntent === 'signUp' ? 'signIn' : 'signUp');
                      }
                    }}
                    style={({ pressed }) => [styles.emailLink, { opacity: pressed ? 0.62 : 1 }]}
                  >
                    <ThemedText style={{ color: theme.textSecondary }} type="small">
                      {forgotPassword ? 'Back to sign in' : emailIntent === 'signUp'
                        ? 'Already have an account? Sign in'
                        : 'New to Track? Create an account'}
                    </ThemedText>
                  </Pressable>
                  {!forgotPassword && emailIntent === 'signIn' ? <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: busy }}
                    disabled={busy}
                    hitSlop={8}
                    onPress={() => {
                      hapticLight();
                      setError(null);
                      setNotice(null);
                      setResetSent(false);
                      setForgotPassword(true);
                    }}
                    style={({ pressed }) => [styles.emailLink, { opacity: pressed ? 0.62 : 1 }]}
                  >
                    <ThemedText style={{ color: theme.accentStrong }} type="smallBold">Forgot password?</ThemedText>
                  </Pressable> : null}
              </View>

              {!forgotPassword ? <View accessibilityRole="text" style={styles.divider}>
                <View style={[styles.dividerLine, { backgroundColor: theme.hairline }]} />
                <ThemedText themeColor="textTertiary" type="caption">or</ThemedText>
                <View style={[styles.dividerLine, { backgroundColor: theme.hairline }]} />
              </View> : null}

              {!forgotPassword ? <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: busy }}
                disabled={busy}
                onPress={() => void signIn('google')}
                style={({ pressed }) => [styles.socialButton, { backgroundColor: theme.backgroundElement, borderColor: theme.hairline, opacity: busy && busyAction !== 'google' ? 0.5 : pressed ? 0.82 : 1 }]}>
                {busyAction === 'google' ? <ActivityIndicator color={theme.textSecondary} size="small" /> : <Image accessibilityIgnoresInvertColors source={googleMarkImage} style={styles.authIcon} />}
                <ThemedText type="smallBold">{busyAction === 'google' ? 'Connecting…' : 'Continue with Google'}</ThemedText>
              </Pressable> : null}

              {!forgotPassword && showApple ? (
                <ActionButton
                  disabled={busy && busyAction !== 'apple'}
                  icon="apple"
                  label="Continue with Apple"
                  loading={busyAction === 'apple'}
                  onPress={() => void signIn('apple')}
                  variant="secondary"
                />
              ) : null}

              {/* Dev bypass */}
              {!forgotPassword && devAuthBypass.allowed ? (
                <ActionButton
                  disabled={busy && busyAction !== 'dev'}
                  label="Development sign-in"
                  loading={busyAction === 'dev'}
                  onPress={() => void signInWithDevBypass()}
                  variant="secondary"
                />
              ) : null}
            </View>

            {/* Legal */}
            <ThemedText style={[styles.legal, { color: theme.textTertiary }]} type="caption">
              By continuing, you agree to our{' '}
              <ThemedText
                accessibilityRole="link"
                onPress={() => {
                  hapticLight();
                  void Linking.openURL('https://track.q9labs.ai/terms');
                }}
                style={[styles.legalLink, { color: theme.textSecondary }]}
                type="caption"
              >
                Terms
              </ThemedText>{' '}
              and{' '}
              <ThemedText
                accessibilityRole="link"
                onPress={() => {
                  hapticLight();
                  void Linking.openURL('https://track.q9labs.ai/privacy');
                }}
                style={[styles.legalLink, { color: theme.textSecondary }]}
                type="caption"
              >
                Privacy Policy
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
    throw new Error('Sign in with Apple is unavailable on this device.');
  }

  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });

  if (!credential.identityToken) {
    throw new Error('Apple did not return an identity token.');
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

  throw new Error('Sign-in completed, but the session was not ready. Please try again.');
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

const styles = StyleSheet.create({
  authIcon: { height: 20, width: 20 },
  content: {
    flexGrow: 1,
  },
  errorBox: {
    borderRadius: Radius.medium,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  emailFields: {
    gap: Spacing.three,
  },
  noticeBox: {
    borderRadius: Radius.medium,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  field: { gap: Spacing.one },
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
    borderCurve: 'continuous',
    borderRadius: Radius.medium,
    borderWidth: StyleSheet.hairlineWidth,
    ...Typography.message,
    minHeight: 52,
    paddingHorizontal: Spacing.four,
  },
  passwordField: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: Radius.medium,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 52,
    overflow: 'hidden',
    paddingLeft: Spacing.four,
  },
  passwordInput: { ...Typography.message, flex: 1, minWidth: 0, paddingVertical: Spacing.two },
  keyboard: {
    flex: 1,
  },
  panel: {
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  socialButton: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: Radius.medium,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: Spacing.three,
    justifyContent: 'center',
    minHeight: 48,
    overflow: 'hidden',
    paddingHorizontal: Spacing.four,
  },
  divider: { alignItems: 'center', flexDirection: 'row', gap: Spacing.three },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
  safe: { flex: 1 },
  screen: { flex: 1 },
});
