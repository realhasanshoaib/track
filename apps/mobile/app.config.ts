import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON;
  const plugins = config.plugins ?? [];
  const hasLocalizationPlugin = plugins.some((plugin) => (
    plugin === 'expo-localization' || (Array.isArray(plugin) && plugin[0] === 'expo-localization')
  ));

  return {
    ...config,
    name: config.name ?? 'Q9 Track',
    slug: config.slug ?? 'track',
    android: {
      ...config.android,
      softwareKeyboardLayoutMode: 'resize',
      ...(googleServicesFile ? { googleServicesFile } : {}),
    },
    plugins: hasLocalizationPlugin
      ? plugins
      : [...plugins, ['expo-localization', { supportedLocales: ['en', 'ar'], supportsRTL: true }]],
  };
};
