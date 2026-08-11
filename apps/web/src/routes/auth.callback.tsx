import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useEffect } from 'react'

import { PublicLocaleControl } from '#/components/PublicLocaleControl'
import TrackLoader from '#/components/TrackLoader'
import { authClient } from '#/lib/auth-client'

export const Route = createFileRoute('/auth/callback')({
  component: AuthCallback,
})

function AuthCallback() {
  const { t } = useTranslation('auth')
  const session = authClient.useSession()
  const search = typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search)
  const next = search.get('next') || '/workspace'

  useEffect(() => {
    if (!session.data) return
    window.location.replace(next.startsWith('/') ? next : '/workspace')
  }, [next, session.data])

  return (
    <main className="track-auth-page">
      <PublicLocaleControl className="fixed end-4 top-4" />
      <TrackLoader label={t('callback.finishingGoogle')} />
    </main>
  )
}
