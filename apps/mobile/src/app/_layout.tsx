import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { ConvexBetterAuthProvider } from '@convex-dev/better-auth/react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useCallback, useEffect, useState, type ComponentProps } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useReducedMotion } from 'react-native-reanimated';

import { authClient } from '@/lib/auth-client';
import { convexClient } from '@/lib/convex-client';
import { TrackUserProvider } from '@/contexts/track-user-context';
import { CompanyProvider } from '@/contexts/company-context';
import { ThemeOverrideProvider, useThemeOverride } from '@/contexts/theme-override-context';
import { Colors } from '@/constants/theme';
import { PushNotificationBridge } from '@/lib/push-notifications';
import { OfflineTaskSync } from '@/components/offline-task-sync';
import { LAUNCH_DISPLAY_DURATION_MS, LaunchScreen } from '@/components/launch-screen';
import { AppToastProvider } from '@/components/app-toast';
import { TrackHeaderBackground } from '@/components/primary-stack';
import { TouchFeedback } from '@/components/touch-feedback';
import { DevelopmentPerformanceMonitor } from '@/components/development-performance-monitor';
import { Typography } from '@/constants/theme';

if (Platform.OS !== 'web') {
  void SplashScreen.preventAutoHideAsync();
}

type ProviderAuthClient = ComponentProps<typeof ConvexBetterAuthProvider>['authClient'];
const providerAuthClient = authClient as unknown as ProviderAuthClient;

const NAV_THEME_LIGHT = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: Colors.light.background,
    card: Colors.light.background,
    text: Colors.light.text,
    border: Colors.light.hairline,
  },
};

const NAV_THEME_DARK = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: Colors.dark.background,
    card: Colors.dark.background,
    text: Colors.dark.text,
    border: Colors.dark.hairline,
  },
};

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardProvider>
          <ThemeOverrideProvider>
            <AppLayout />
          </ThemeOverrideProvider>
        </KeyboardProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}

function AppLayout() {
  const { theme } = useThemeOverride();
  const reducedMotion = useReducedMotion();
  const [continuationDidLayout, setContinuationDidLayout] = useState(false);
  const [showContinuation, setShowContinuation] = useState(true);
  const [launchExiting, setLaunchExiting] = useState(false);
  const [launchAnimationActive, setLaunchAnimationActive] = useState(false);
  const finishLaunch = useCallback(() => setShowContinuation(false), []);
  const markLaunchArtworkReady = useCallback(() => setContinuationDidLayout(true), []);

  useEffect(() => {
    // The continuation already contains the final splash artwork. Hide the
    // native icon splash as soon as that overlay is laid out so Android's
    // centered launch icon cannot remain visible while theme storage resolves.
    if (!continuationDidLayout) return;

    let active = true;
    let exitTimer: ReturnType<typeof setTimeout> | undefined;
    const hideNativeSplash = Platform.OS === 'web'
      ? Promise.resolve()
      : SplashScreen.hideAsync();

    void hideNativeSplash.finally(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!active) return;
          setLaunchAnimationActive(true);
          exitTimer = setTimeout(() => {
            if (active) setLaunchExiting(true);
          }, reducedMotion ? 0 : LAUNCH_DISPLAY_DURATION_MS);
        });
      });
    });
    return () => {
      active = false;
      if (exitTimer) clearTimeout(exitTimer);
    };
  }, [continuationDidLayout, reducedMotion]);

  useEffect(() => {
    if (Platform.OS === 'android') {
      void SystemUI.setBackgroundColorAsync(Colors[theme].background);
    }
  }, [theme]);

  const navTheme = theme === 'dark' ? NAV_THEME_DARK : NAV_THEME_LIGHT;

  return (
    <ConvexBetterAuthProvider client={convexClient} authClient={providerAuthClient}>
      <ThemeProvider value={navTheme}>
        <AppToastProvider>
          <TrackUserProvider>
            <PushNotificationBridge>
              <CompanyProvider>
                <OfflineTaskSync />
                <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
                <TouchFeedback>
                  <View style={styles.app}>
                    <DevelopmentPerformanceMonitor><Stack
                      screenOptions={{
                        animation: Platform.OS === 'android' ? 'default' : 'slide_from_right',
                        gestureEnabled: true,
                        headerShown: true,
                        headerBackButtonDisplayMode: 'minimal',
                        headerBackground: TrackHeaderBackground,
                        headerShadowVisible: false,
                        headerStyle: { backgroundColor: 'transparent' },
                        headerTitleAlign: 'left',
                        headerTitleStyle: Typography.navigationTitle,
                        headerTintColor: Colors[theme].text,
                        contentStyle: {
                          backgroundColor: Colors[theme].homeBackground,
                        },
                      }}>
                      <Stack.Screen name="index" options={{ headerShown: false }} />
                      <Stack.Screen name="sign-in" options={{ headerShown: false }} />
                      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                      <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
                      <Stack.Screen name="company" options={{ title: 'Companies' }} />
                    </Stack></DevelopmentPerformanceMonitor>
                    {showContinuation ? (
                      <View pointerEvents="none" style={styles.continuation}>
                        <LaunchScreen
                          animationActive={launchAnimationActive}
                          exiting={launchExiting}
                          onExitComplete={finishLaunch}
                          onReady={markLaunchArtworkReady}
                          theme={theme}
                        />
                      </View>
                    ) : null}
                  </View>
                </TouchFeedback>
              </CompanyProvider>
            </PushNotificationBridge>
          </TrackUserProvider>
        </AppToastProvider>
      </ThemeProvider>
    </ConvexBetterAuthProvider>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1 },
  continuation: { ...StyleSheet.absoluteFill, zIndex: 1 },
});
