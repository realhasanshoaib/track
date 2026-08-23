import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';

import { MobileConvexAuthProvider } from '@/components/mobile-convex-auth-provider';
import { TrackUserProvider } from '@/contexts/track-user-context';
import { CompanyProvider } from '@/contexts/company-context';
import { ThemeOverrideProvider, useThemeOverride } from '@/contexts/theme-override-context';
import { Colors } from '@/constants/theme';
import { PushNotificationBridge } from '@/lib/push-notifications';

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
    <MobileConvexAuthProvider>
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
                <Stack.Screen name="tasks" options={{ title: 'Tasks' }} />
                <Stack.Screen name="task" options={{ title: 'Task' }} />
                <Stack.Screen name="threads" options={{ title: 'Threads' }} />
                <Stack.Screen name="thread" options={{ title: 'Thread' }} />
              </Stack>
            </CompanyProvider>
          </PushNotificationBridge>
        </TrackUserProvider>
      </ThemeProvider>
    </MobileConvexAuthProvider>
  );
}
