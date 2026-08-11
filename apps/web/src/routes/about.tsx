import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { PublicLocaleControl } from '#/components/PublicLocaleControl'

export const Route = createFileRoute('/about')({
  component: About,
})

function About() {
  const { t } = useTranslation('legal')

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <PublicLocaleControl className="mb-8" />
      <p className="mono-label m-0 mb-2">{t('about.eyebrow')}</p>
      <h1 className="m-0 text-2xl font-semibold">{t('about.title')}</h1>
      <p className="mt-3 text-sm leading-6 text-[var(--ink-3)]">
        {t('about.description')}
      </p>
    </main>
  )
}
