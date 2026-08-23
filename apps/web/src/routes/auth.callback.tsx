import { createFileRoute } from '@tanstack/react-router'
import { useEffect } from 'react'

import TrackLoader from '#/components/TrackLoader'
import { authClient } from '#/lib/auth-client'
import { getSafeLocalReturnPath } from '#/lib/url-policy'

export const Route = createFileRoute('/auth/callback')({
  component: AuthCallback,
})

function AuthCallback() {
  const session = authClient.useSession()
  const search = typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search)
  const next = getSafeLocalReturnPath(search.get('next'))

  useEffect(() => {
    if (!session.data) return
    window.location.replace(next)
  }, [next, session.data])

  return (
    <main className="track-auth-page">
      <TrackLoader label="Finishing Google sign-in" />
    </main>
  )
}
