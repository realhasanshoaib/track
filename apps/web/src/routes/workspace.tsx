import { Link, Navigate, Outlet, createFileRoute, useLocation } from '@tanstack/react-router'
import { useConvexAuth, useMutation, useQuery } from 'convex/react'
import { useEffect, useState } from 'react'

import { api } from '../../../../convex/_generated/api'
import TrackLoader from '#/components/TrackLoader'
import { authClient } from '#/lib/auth-client'
import { useDevAuthBypass } from '#/lib/dev-auth-bypass'
import { useOAuthCallbackPending } from '#/lib/oauth-callback'
import { useReleaseConfigState } from '#/lib/release-config'

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
  if (session.isPending && !devAuthBypass.enabled) return <TrackLoader label="Checking your session" />
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

function WorkspaceProfileBoundary({ devAuthEnabled }: { devAuthEnabled: boolean }) {
  const releaseState = useReleaseConfigState()

  if (releaseState.status === 'loading') return <TrackLoader label="Loading your workspace" />
  if (!releaseState.config.companyModel) return <Outlet />

  return <CompanyWorkspaceProfileBoundary devAuthEnabled={devAuthEnabled} />
}

function CompanyWorkspaceProfileBoundary({ devAuthEnabled }: { devAuthEnabled: boolean }) {
  const user = useQuery(api.auth.getCurrentUser)
  const ensureCurrentUser = useMutation(api.auth.ensureCurrentUser)
  const syncDevUser = useMutation(api.auth.syncDevUser)
  const next = useLocation({ select: (location) => location.href })
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (user !== null) return
    let cancelled = false
    const provision = devAuthEnabled ? syncDevUser({}) : ensureCurrentUser({})
    void provision.then((userId) => {
      if (!cancelled && !userId) setFailed(true)
    }).catch(() => {
      if (!cancelled) setFailed(true)
    })
    return () => { cancelled = true }
  }, [attempt, devAuthEnabled, ensureCurrentUser, syncDevUser, user])

  if (failed && !user) {
    return (
      <main className="track-loading">
        <p role="alert">We couldn’t prepare your workspace.</p>
        <button type="button" onClick={() => { setFailed(false); setAttempt(attempt + 1) }}>Retry</button>
        <Link to="/sign-in">Sign in again</Link>
      </main>
    )
  }
  if (!user) return <TrackLoader label="Loading your workspace" />
  if (!user.displayName?.trim() || !user.profileDesignation?.trim() || !user.timezone?.trim()) {
    // The old layout remains mounted briefly while the router opens onboarding.
    if (!next.startsWith('/workspace')) return null
    return <Navigate to="/onboarding/profile" search={{ next }} replace />
  }

  return <Outlet />
}
