import { ConvexBetterAuthProvider } from '@convex-dev/better-auth/react'
import type { ComponentProps, ReactNode } from 'react'

import { TooltipProvider } from '#/components/ui/tooltip'
import { LocaleProvider } from '#/i18n'
import { authClient } from '#/lib/auth-client'
import { convexClient } from '../lib/convex-client'

type ProviderAuthClient = ComponentProps<typeof ConvexBetterAuthProvider>['authClient']
const providerAuthClient = authClient as unknown as ProviderAuthClient

export default function AppProviders({
  children,
}: {
  children: ReactNode
}) {
  return (
    <LocaleProvider>
      <ConvexBetterAuthProvider authClient={providerAuthClient} client={convexClient}>
        <TooltipProvider>{children}</TooltipProvider>
      </ConvexBetterAuthProvider>
    </LocaleProvider>
  )
}
