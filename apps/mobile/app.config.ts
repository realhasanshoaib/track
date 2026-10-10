import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON;
  const webOutput = process.env.EXPO_WEB_OUTPUT;
  const android = config.android ?? {};
  const ios = config.ios ?? {};
  const extra = config.extra ?? {};
  const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL ?? process.env.CONVEX_URL;
  const convexSiteUrl = process.env.EXPO_PUBLIC_CONVEX_SITE_URL ?? process.env.CONVEX_SITE_URL;
  const appUrl = process.env.EXPO_PUBLIC_APP_URL ?? process.env.APP_URL;
  const devAuthBypass = process.env.EXPO_PUBLIC_DEV_AUTH_BYPASS ?? process.env.VITE_DEV_AUTH_BYPASS;

  return {
    ...config,
    name: 'Track',
    slug: 'track',
    scheme: config.scheme ?? 'track',
    icon: config.icon ?? './assets/images/icon.png',
    orientation: 'portrait',
    userInterfaceStyle: 'automatic',
    extra: {
      ...extra,
      ...(convexUrl ? { EXPO_PUBLIC_CONVEX_URL: convexUrl } : {}),
      ...(convexSiteUrl ? { EXPO_PUBLIC_CONVEX_SITE_URL: convexSiteUrl } : {}),
      ...(appUrl ? { EXPO_PUBLIC_APP_URL: appUrl } : {}),
      ...(devAuthBypass ? { EXPO_PUBLIC_DEV_AUTH_BYPASS: devAuthBypass } : {}),
    },
    android: {
      ...android,
      package: android.package ?? 'ai.q9labs.track',
      versionCode: 15,
      softwareKeyboardLayoutMode: 'resize',
      adaptiveIcon: {
        backgroundColor: '#faf9f7',
        foregroundImage: './assets/images/android-icon-foreground.png',
        monochromeImage: './assets/images/android-icon-monochrome.png',
      },
      blockedPermissions: [
        'android.permission.READ_EXTERNAL_STORAGE',
        'android.permission.SYSTEM_ALERT_WINDOW',
        'android.permission.WRITE_EXTERNAL_STORAGE',
      ],
      permissions: [
        'android.permission.RECORD_AUDIO',
        'android.permission.MODIFY_AUDIO_SETTINGS',
        'android.permission.POST_NOTIFICATIONS',
      ],
      predictiveBackGestureEnabled: true,
      ...(googleServicesFile ? { googleServicesFile } : {}),
    },
    ios: {
      ...ios,
      bundleIdentifier: ios.bundleIdentifier ?? 'ai.q9labs.track',
      icon: './assets/images/icon.png',
      infoPlist: {
        ...ios.infoPlist,
        ITSAppUsesNonExemptEncryption: false,
        NSMicrophoneUsageDescription: 'Track uses the microphone to record voice notes you choose to send in project conversations.',
      },
      usesAppleSignIn: true,
    },
    web: {
      ...config.web,
      favicon: './assets/images/favicon.png',
      ...(webOutput === 'single' || webOutput === 'static' || webOutput === 'server'
        ? { output: webOutput }
        : {}),
    },
    plugins: [
      'expo-router',
      [
        'expo-dev-client',
        {
          android: {
            defaultLaunchURL: 'http://localhost:8081',
          },
        },
      ],
      'expo-image',
      [
        'expo-image-picker',
        {
          cameraPermission: 'Track uses the camera only when you choose to attach a photo to a conversation.',
          photosPermission: 'Track lets you choose photos to attach to a conversation.',
        },
      ],
      'expo-sharing',
      'expo-status-bar',
      [
        'expo-splash-screen',
        {
          backgroundColor: '#faf9f7',
          image: './assets/images/track-mark.png',
          imageWidth: 200,
          resizeMode: 'contain',
          dark: {
            backgroundColor: '#1b1917',
            image: './assets/images/track-mark-reversed.png',
          },
        },
      ],
      [
        '@react-native-community/datetimepicker',
        {
          android: {
            datePicker: {
              colorAccent: { light: '#f0b100', dark: '#f0b100' },
              colorControlActivated: { light: '#f0b100', dark: '#f0b100' },
              colorControlHighlight: { light: '#fef3c7', dark: '#4a3800' },
              textColorPrimary: { light: '#1b1917', dark: '#faf9f7' },
              textColorSecondary: { light: '#655f56', dark: '#c9c3b8' },
              windowBackground: { light: '#ffffff', dark: '#292522' },
            },
          },
        },
      ],
      [
        'expo-font',
        {
          android: {
            fonts: [
              {
                fontFamily: 'Manrope V5',
                fontDefinitions: [
                  { path: './assets/fonts/ManropeV5-Regular.otf', weight: 400 },
                  { path: './assets/fonts/ManropeV5-Medium.otf', weight: 500 },
                  { path: './assets/fonts/ManropeV5-SemiBold.otf', weight: 600 },
                  { path: './assets/fonts/ManropeV5-Bold.otf', weight: 700 },
                  { path: './assets/fonts/ManropeV5-ExtraBold.otf', weight: 800 },
                ],
              },
            ],
          },
          ios: {
            fonts: [
              './assets/fonts/ManropeV5-Regular.otf',
              './assets/fonts/ManropeV5-Medium.otf',
              './assets/fonts/ManropeV5-SemiBold.otf',
              './assets/fonts/ManropeV5-Bold.otf',
              './assets/fonts/ManropeV5-ExtraBold.otf',
            ],
          },
        },
      ],
      'expo-secure-store',
      'expo-web-browser',
      'expo-apple-authentication',
      'expo-notifications',
      [
        'expo-audio',
        {
          microphonePermission: 'Track uses the microphone to record voice notes you choose to send in project conversations.',
          enableBackgroundPlayback: false,
        },
      ],
    ],
    experiments: {
      ...config.experiments,
      typedRoutes: true,
      reactCompiler: true,
    },
  };
};
