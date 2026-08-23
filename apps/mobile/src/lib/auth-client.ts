import { convexClient, crossDomainClient } from '@convex-dev/better-auth/client/plugins';
import { twoFactorClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

import { authStoragePrefix } from '@/lib/auth-storage';
import { platformStorage } from '@/lib/platform-storage';
import { requireServiceUrl } from '@/lib/service-url';

const configuredAuthBaseURL =
  process.env.EXPO_PUBLIC_APP_URL ??
  process.env.EXPO_PUBLIC_CONVEX_SITE_URL;
const appEnvironment = process.env.EXPO_PUBLIC_APP_ENV;
const authBaseURL = requireServiceUrl({
  isProduction: process.env.NODE_ENV === 'production' || appEnvironment === 'production',
  name: 'EXPO_PUBLIC_APP_URL or EXPO_PUBLIC_CONVEX_SITE_URL',
  value: configuredAuthBaseURL,
});

let twoFactorRedirectHandler: ((methods: string[]) => void) | null = null;

export function setTwoFactorRedirectHandler(handler: ((methods: string[]) => void) | null) {
  twoFactorRedirectHandler = handler;
}

export const authClient = createAuthClient({
  baseURL: authBaseURL,
  plugins: [
    crossDomainClient({
      storagePrefix: authStoragePrefix,
      storage: platformStorage,
    }),
    convexClient(),
    twoFactorClient({
      onTwoFactorRedirect: ({ twoFactorMethods }) => {
        twoFactorRedirectHandler?.(twoFactorMethods ?? ['totp', 'backup_code']);
      },
    }),
  ],
});
