import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { PublicLocaleControl } from '#/components/PublicLocaleControl'

export function NotFoundPage() {
  const { t } = useTranslation('shell')

  return (
    <main className="grid min-h-dvh place-items-center bg-background px-6 py-16 text-foreground">
      <PublicLocaleControl className="fixed end-6 top-6" />
      <section className="max-w-md text-center" aria-labelledby="not-found-title">
        <p className="text-sm font-semibold tracking-wide text-muted-foreground">{t('notFound.code')}</p>
        <h1 id="not-found-title" className="mt-3 text-4xl font-semibold tracking-tight">{t('notFound.title')}</h1>
        <p className="mt-4 text-base leading-7 text-muted-foreground">
          {t('notFound.description')}
        </p>
        <Link
          className="mt-8 inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-5 py-2.5 font-semibold text-primary-foreground"
          to="/">
          {t('notFound.returnToTrack')}
        </Link>
      </section>
    </main>
  )
}
