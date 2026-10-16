import { Link, Navigate, Outlet, createFileRoute } from '@tanstack/react-router'
import { useConvexAuth } from 'convex/react'
import TrackLoader from '#/components/TrackLoader'
import { authClient } from '#/lib/auth-client'
import { useDevAuthBypass } from '#/lib/dev-auth-bypass'
import { useOAuthCallbackPending } from '#/lib/oauth-callback'
export const Route = createFileRoute('/workspace')({
  component: WorkspaceLayoutRoute,
})
function WorkspaceLayoutRoute() {
  const convexAuth = useConvexAuth()
  const session = authClient.useSession()
  const devAuthBypass = useDevAuthBypass()
  const hasSessionAccess = Boolean(session.data || devAuthBypass.enabled)
  const oauthCallbackPending = useOAuthCallbackPending(hasSessionAccess)
  if (devAuthBypass.allowed && !devAuthBypass.hydrated && !devAuthBypass.enabled) {
    return <TrackLoader label="Checking your session" />
  }
  if (oauthCallbackPending) return <TrackLoader label="Finishing Google sign-in" />
  if (session.isPending && !devAuthBypass.enabled)
    return <TrackLoader label="Checking your session" />
  if (!hasSessionAccess) return <Navigate to="/sign-in" />
  if (convexAuth.isLoading) return <TrackLoader label="Connecting your workspace" />
  if (!convexAuth.isAuthenticated) {
    return (
      <main className="track-loading">
        <p role="alert">We couldn’t connect your session to the workspace.</p>
        <Link to="/sign-in">Sign in again</Link>
      </main>
    )
  }
  return <WorkspaceProfileBoundary devAuthEnabled={devAuthBypass.enabled} />
}
function WorkspaceProfileBoundary({
  devAuthEnabled: _devAuthEnabled,
}: {
  devAuthEnabled: boolean
}) {
  return <Outlet />
}
