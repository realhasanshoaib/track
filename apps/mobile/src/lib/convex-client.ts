import { ConvexReactClient } from 'convex/react';
import { shouldAllowDevAuthBypass } from '@track/shared';

import { requireServiceUrl } from '@/lib/service-url';

const configuredConvexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;
const appEnvironment = process.env.EXPO_PUBLIC_APP_ENV;
const convexUrl = requireServiceUrl({
  isProduction: process.env.NODE_ENV === 'production' || appEnvironment === 'production',
  name: 'EXPO_PUBLIC_CONVEX_URL',
  value: configuredConvexUrl,
});

export const convexClient = new ConvexReactClient(convexUrl, {
  expectAuth: !shouldAllowDevAuthBypass({
    flag: process.env.EXPO_PUBLIC_DEV_AUTH_BYPASS,
    isDev: process.env.NODE_ENV !== 'production',
  }),
  unsavedChangesWarning: false,
});
