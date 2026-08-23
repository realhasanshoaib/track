import type { ConfigContext, ExpoConfig } from 'expo/config';

function requireMobileAuthCallback(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('EXPO_PUBLIC_MOBILE_AUTH_CALLBACK_URL must be a valid HTTPS URL');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) {
    throw new Error('EXPO_PUBLIC_MOBILE_AUTH_CALLBACK_URL must be a credential-free HTTPS URL on port 443');
  }
  if (url.pathname === '/' || url.search || url.hash) {
    throw new Error('EXPO_PUBLIC_MOBILE_AUTH_CALLBACK_URL must use a dedicated path without a query or fragment');
  }
  return { hostname: url.hostname, origin: url.origin, pathname: url.pathname };
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON;
  const webOutput = process.env.EXPO_WEB_OUTPUT;
  const appEnvironment = process.env.EXPO_PUBLIC_APP_ENV;
  const isProduction = appEnvironment === 'production' || process.env.NODE_ENV === 'production';
  const configuredAuthCallback = process.env.EXPO_PUBLIC_MOBILE_AUTH_CALLBACK_URL;
  const authCallback = configuredAuthCallback
    ? requireMobileAuthCallback(configuredAuthCallback)
    : undefined;
  const configuredServiceUrl = process.env.EXPO_PUBLIC_APP_URL ?? process.env.EXPO_PUBLIC_CONVEX_SITE_URL;
  if (
    isProduction &&
    (process.env.EXPO_PUBLIC_DEV_AUTH_BYPASS || process.env.EXPO_PUBLIC_DEV_AUTH_BYPASS_PASSWORD)
  ) {
    throw new Error('Production mobile builds must not include development auth bypass values');
  }
  if (isProduction && !authCallback) {
    throw new Error('Production mobile builds require EXPO_PUBLIC_MOBILE_AUTH_CALLBACK_URL');
  }
  if (authCallback && configuredServiceUrl && authCallback.origin !== new URL(configuredServiceUrl).origin) {
    throw new Error('EXPO_PUBLIC_MOBILE_AUTH_CALLBACK_URL must use the Track service origin');
  }

  return {
    ...config,
    name: config.name ?? 'Q9 Track',
    slug: config.slug ?? 'track',
    ios: {
      ...config.ios,
      ...(authCallback
        ? {
            associatedDomains: [
              ...new Set([...(config.ios?.associatedDomains ?? []), `applinks:${authCallback.hostname}`]),
            ],
          }
        : {}),
    },
    android: {
      ...config.android,
      allowBackup: false,
      softwareKeyboardLayoutMode: 'resize',
      ...(googleServicesFile ? { googleServicesFile } : {}),
      ...(authCallback
        ? {
            intentFilters: [
              ...(config.android?.intentFilters ?? []),
              {
                action: 'VIEW',
                autoVerify: true,
                category: ['BROWSABLE', 'DEFAULT'],
                data: {
                  scheme: 'https',
                  host: authCallback.hostname,
                  path: authCallback.pathname,
                },
              },
            ],
          }
        : {}),
    },
    web: {
      ...config.web,
      ...(webOutput === 'single' || webOutput === 'static' || webOutput === 'server'
        ? { output: webOutput }
        : {}),
    },
  };
};
