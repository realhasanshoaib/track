import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ConvexBetterAuthProvider } from '@convex-dev/better-auth/react';
import { Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import * as SystemUI from 'expo-system-ui';
import { useEffect, type ComponentProps, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { authClient } from '@/lib/auth-client';
import { convexClient } from '@/lib/convex-client';
import { TrackUserProvider } from '@/contexts/track-user-context';
import { LocaleProvider, useLocale } from '@/contexts/locale-context';
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
    <LocaleProvider>
      <DirectionRoot>
        <ThemeOverrideProvider>
          <AppLayout />
        </ThemeOverrideProvider>
      </DirectionRoot>
    </LocaleProvider>
  );
}

function DirectionRoot({ children }: { children: ReactNode }) {
  const { direction } = useLocale();

  return (
    <GestureHandlerRootView style={{ flex: 1, direction }}>
      {children}
    </GestureHandlerRootView>
  );
}

function AppLayout() {
  const { theme } = useThemeOverride();
  const { t } = useTranslation('common');

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
                  headerBackTitle: t('navigation.back'),
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
                <Stack.Screen name="projects" options={{ title: t('navigation.projects') }} />
                <Stack.Screen name="notifications" options={{ title: t('navigation.notifications') }} />
                <Stack.Screen name="company" options={{ title: t('navigation.companies') }} />
                <Stack.Screen name="groups" options={{ title: t('navigation.channels') }} />
                <Stack.Screen name="conversation" options={{ title: t('navigation.conversation') }} />
                <Stack.Screen name="tasks" options={{ title: t('navigation.tasks') }} />
                <Stack.Screen name="task" options={{ title: t('navigation.task') }} />
                <Stack.Screen name="threads" options={{ title: t('navigation.threads') }} />
                <Stack.Screen name="thread" options={{ title: t('navigation.thread') }} />
              </Stack>
            </CompanyProvider>
          </PushNotificationBridge>
        </TrackUserProvider>
      </ThemeProvider>
    </ConvexBetterAuthProvider>
  );
}
