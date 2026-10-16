import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ConvexBetterAuthProvider } from '@convex-dev/better-auth/react';
import { Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, type ComponentProps } from 'react';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';

import { authClient } from '@/lib/auth-client';
import { convexClient } from '@/lib/convex-client';
import { TrackUserProvider } from '@/contexts/track-user-context';
import { CompanyProvider } from '@/contexts/company-context';
import { ThemeOverrideProvider, useThemeOverride } from '@/contexts/theme-override-context';
import { Colors } from '@/constants/theme';
import { PushNotificationBridge } from '@/lib/push-notifications';

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
  const [fontsLoaded] = useFonts(MaterialCommunityIcons.font);

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <ThemeOverrideProvider>
          <AppLayout />
        </ThemeOverrideProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

function AppLayout() {
  const { theme } = useThemeOverride();

  useEffect(() => {
    if (Platform.OS === 'android') {
      void SystemUI.setBackgroundColorAsync(Colors[theme].background);
    }
  }, [theme]);

  const navTheme = theme === 'dark' ? NAV_THEME_DARK : NAV_THEME_LIGHT;

  return (
    <ConvexBetterAuthProvider client={convexClient} authClient={providerAuthClient}>
      <ThemeProvider value={navTheme}>
        <TrackUserProvider>
          <PushNotificationBridge>
            <CompanyProvider>
              <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
              <Stack
                screenOptions={{
                  headerShown: true,
                  headerBackTitle: 'Back',
                  headerShadowVisible: Platform.OS === 'android',
                  headerStyle: {
                    backgroundColor: Colors[theme].background,
                  },
                  headerTintColor: Colors[theme].text,
                  contentStyle: {
                    backgroundColor: Colors[theme].background,
                  },
                }}>
                <Stack.Screen name="index" options={{ headerShown: false }} />
                <Stack.Screen name="sign-in" options={{ headerShown: false }} />
                <Stack.Screen name="projects" options={{ title: 'Projects' }} />
                <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
                <Stack.Screen name="company" options={{ title: 'Companies' }} />
                <Stack.Screen name="groups" options={{ title: 'Channels' }} />
                <Stack.Screen name="conversation" options={{ title: 'Conversation' }} />
              </Stack>
            </CompanyProvider>
          </PushNotificationBridge>
        </TrackUserProvider>
      </ThemeProvider>
    </ConvexBetterAuthProvider>
  );
}
