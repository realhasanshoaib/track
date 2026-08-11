import { Navigate, Outlet, createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import TrackLoader from '#/components/TrackLoader'
import { authClient } from '#/lib/auth-client'
import { useDevAuthBypass } from '#/lib/dev-auth-bypass'
import { useOAuthCallbackPending } from '#/lib/oauth-callback'

export const Route = createFileRoute('/workspace')({
  component: WorkspaceLayoutRoute,
})

function WorkspaceLayoutRoute() {
  const { t } = useTranslation('auth')
  const session = authClient.useSession()
  const devAuthBypass = useDevAuthBypass()
  const hasSessionAccess = Boolean(session.data || devAuthBypass.enabled)
  const oauthCallbackPending = useOAuthCallbackPending(hasSessionAccess)

  if (devAuthBypass.allowed && !devAuthBypass.hydrated && !devAuthBypass.enabled) {
    return <TrackLoader label={t('workspace.checkingSession')} />
  }
  if (oauthCallbackPending) return <TrackLoader label={t('workspace.finishingGoogle')} />
  if (session.isPending && !devAuthBypass.enabled) return <TrackLoader label={t('workspace.checkingSession')} />
  if (!hasSessionAccess) return <Navigate to="/sign-in" />

  return <Outlet />
}
