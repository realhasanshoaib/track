import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { PublicLocaleControl } from '#/components/PublicLocaleControl'

export const Route = createFileRoute('/terms')({
  component: Terms,
})

const sections = [
  'use',
  'content',
  'ai',
  'accounts',
  'retention',
] as const

function Terms() {
  const { t } = useTranslation('legal')

  return (
    <main className="bg-[var(--paper)] px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <PublicLocaleControl className="mb-8" />
      </div>
      <article className="mx-auto max-w-3xl">
        <p className="mono-label m-0 mb-2">{t('terms.eyebrow')}</p>
        <h1 className="m-0 text-3xl font-semibold">{t('terms.title')}</h1>
        <p className="m-0 mt-2 text-sm text-[var(--ink-3)]">
          {t('terms.effectiveDate')}
        </p>

        <div className="track-surface mt-6 rounded-md p-4">
          <p className="m-0 text-sm leading-6 text-[var(--ink-2)]">
            {t('terms.intro')}
          </p>
        </div>

        <div className="mt-8 space-y-7">
          {sections.map((section) => (
            <section key={section}>
              <h2 className="m-0 text-lg font-semibold">{t(`terms.sections.${section}.title`)}</h2>
              <p className="m-0 mt-3 text-sm leading-6 text-[var(--ink-3)]">
                {t(`terms.sections.${section}.body`)}
              </p>
            </section>
          ))}

          <section>
            <h2 className="m-0 text-lg font-semibold">{t('terms.sections.contact.title')}</h2>
            <p className="m-0 mt-3 text-sm leading-6 text-[var(--ink-3)]">
              {t('terms.sections.contact.prefix')}{' '}
              <a className="font-semibold text-[var(--ink)]" dir="ltr" href="mailto:q9labs.ai@gmail.com">
                q9labs.ai@gmail.com
              </a>
              {t('terms.sections.contact.suffix')}
            </p>
          </section>
        </div>
      </article>
    </main>
  )
}
