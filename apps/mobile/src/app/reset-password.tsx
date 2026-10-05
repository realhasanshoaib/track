import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionButton } from '@/components/action-button';
import { ConnectivityBanner } from '@/components/connectivity-banner';
import { IconButton } from '@/components/icon-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedTextInput } from '@/components/themed-text-input';
import { ThemedView } from '@/components/themed-view';
import { MaxFontScale, Radius, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { authClient } from '@/lib/auth-client';
import { validatePasswordReset } from '@/lib/email-auth';
import { accountErrorMessage } from '@/lib/user-facing-error';

export default function ResetPasswordScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { token, error: resetError } = useLocalSearchParams<{ token?: string; error?: string }>();
  const resetToken = typeof token === 'string' ? token : '';
  const invalidLink = !resetToken || Boolean(resetError);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);

  async function savePassword() {
    if (invalidLink || busy || complete) return;
    const input = validatePasswordReset(password, confirmation);
    if (!input.ok) {
      setError(input.error);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const result = await authClient.resetPassword({ newPassword: input.password, token: resetToken });
      if (result.error) throw new Error(result.error.message ?? 'Password reset failed.');
      setComplete(true);
      setPassword('');
      setConfirmation('');
    } catch (failure) {
      setError(accountErrorMessage(failure, 'This reset link is invalid or expired. Request a new link and try again.'));
    } finally {
      setBusy(false);
    }
  }

  return <ThemedView style={styles.screen}>
    <Stack.Screen options={{ title: 'Reset password', headerBackTitle: 'Sign in' }} />
    <SafeAreaView edges={['bottom']} style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboard}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ConnectivityBanner message="You’re offline. Reconnect before resetting your password." />
          <View style={styles.panel}>
            <ThemedText accessibilityRole="header" type="titleLarge">
              {complete ? 'Password updated' : invalidLink ? 'Reset link unavailable' : 'Choose a new password'}
            </ThemedText>
            <ThemedText themeColor="textSecondary" type="small">
              {complete
                ? 'Your password is ready. Sign in with the new password.'
                : invalidLink
                  ? 'This link is invalid or expired. Return to sign in and request a new reset link.'
                  : 'Use a password with at least 10 characters. Your confirmation must match.'}
            </ThemedText>

            {error ? <View accessibilityRole="alert" style={[styles.errorBox, { backgroundColor: theme.dangerSoft, borderColor: theme.danger }]}>
              <ThemedText style={{ color: theme.danger }} type="small">{error}</ThemedText>
            </View> : null}

            {!invalidLink && !complete ? <>
              <View style={styles.field}>
                <ThemedText themeColor="textSecondary" type="captionBold">New password</ThemedText>
                <View style={[styles.passwordField, { backgroundColor: theme.backgroundElement, borderColor: theme.hairline }]}>
                  <ThemedTextInput
                    accessibilityLabel="New password"
                    autoCapitalize="none"
                    autoComplete="new-password"
                    editable={!busy}
                    maxLength={256}
                    maxFontSizeMultiplier={MaxFontScale}
                    onChangeText={setPassword}
                    placeholder="At least 10 characters"
                    placeholderTextColor={theme.textTertiary}
                    secureTextEntry={!passwordVisible}
                    style={[styles.passwordInput, { color: theme.text }]}
                    textContentType="newPassword"
                    value={password}
                  />
                  <IconButton accessibilityLabel={passwordVisible ? 'Hide password' : 'Show password'} disabled={busy} icon={passwordVisible ? 'eye-off' : 'eye'} onPress={() => setPasswordVisible((visible) => !visible)} size={20} />
                </View>
              </View>
              <View style={styles.field}>
                <ThemedText themeColor="textSecondary" type="captionBold">Confirm new password</ThemedText>
                <View style={[styles.passwordField, { backgroundColor: theme.backgroundElement, borderColor: theme.hairline }]}>
                  <ThemedTextInput
                    accessibilityLabel="Confirm new password"
                    autoCapitalize="none"
                    autoComplete="new-password"
                    editable={!busy}
                    maxLength={256}
                    maxFontSizeMultiplier={MaxFontScale}
                    onChangeText={setConfirmation}
                    onSubmitEditing={() => void savePassword()}
                    placeholder="Enter the password again"
                    placeholderTextColor={theme.textTertiary}
                    returnKeyType="done"
                    secureTextEntry={!passwordVisible}
                    style={[styles.passwordInput, { color: theme.text }]}
                    textContentType="newPassword"
                    value={confirmation}
                  />
                  <IconButton accessibilityLabel={passwordVisible ? 'Hide password' : 'Show password'} disabled={busy} icon={passwordVisible ? 'eye-off' : 'eye'} onPress={() => setPasswordVisible((visible) => !visible)} size={20} />
                </View>
              </View>
            </> : null}

            <ActionButton
              disabled={busy || (!invalidLink && !complete && (!password || !confirmation))}
              label={complete || invalidLink ? 'Return to sign in' : 'Save new password'}
              loading={busy}
              onPress={() => complete || invalidLink ? router.replace('/sign-in') : void savePassword()}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  </ThemedView>;
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, gap: Spacing.four, paddingVertical: Spacing.four },
  errorBox: { borderRadius: Radius.medium, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  field: { gap: Spacing.one },
  passwordField: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.medium, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', minHeight: 52, overflow: 'hidden', paddingLeft: Spacing.four },
  passwordInput: { ...Typography.message, flex: 1, minWidth: 0, paddingVertical: Spacing.two },
  keyboard: { flex: 1 },
  panel: { gap: Spacing.three, paddingHorizontal: Spacing.four, paddingBottom: Spacing.four },
  safe: { flex: 1 },
  screen: { flex: 1 },
});
