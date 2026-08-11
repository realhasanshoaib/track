import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { PublicLocaleControl } from '#/components/PublicLocaleControl'

export const Route = createFileRoute('/deletion')({
  component: Deletion,
})

const deletionSteps = ['item1', 'item2', 'item3'] as const
const retentionItems = ['item1', 'item2', 'item3'] as const

function Deletion() {
  const { t } = useTranslation('legal')

  return (
    <main className="bg-[var(--paper)] px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <PublicLocaleControl className="mb-8" />
      </div>
      <article className="mx-auto max-w-3xl">
        <p className="mono-label m-0 mb-2">{t('deletion.eyebrow')}</p>
        <h1 className="m-0 text-3xl font-semibold">{t('deletion.title')}</h1>
        <p className="m-0 mt-2 text-sm text-[var(--ink-3)]">
          {t('deletion.effectiveDate')}
        </p>

        <div className="track-surface mt-6 rounded-md p-4">
          <p className="m-0 text-sm leading-6 text-[var(--ink-2)]">
            {t('deletion.intro')}
          </p>
        </div>

        <div className="mt-8 space-y-7">
          <section>
            <h2 className="m-0 text-lg font-semibold">{t('deletion.steps.title')}</h2>
            <ol className="m-0 mt-3 space-y-2 pl-5 text-sm leading-6 text-[var(--ink-3)]">
              {deletionSteps.map((step) => (
                <li key={step}>{t(`deletion.steps.${step}`)}</li>
              ))}
            </ol>
          </section>

          <section>
            <h2 className="m-0 text-lg font-semibold">{t('deletion.retention.title')}</h2>
            <ul className="m-0 mt-3 space-y-2 pl-5 text-sm leading-6 text-[var(--ink-3)]">
              {retentionItems.map((item) => (
                <li key={item}>{t(`deletion.retention.${item}`)}</li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="m-0 text-lg font-semibold">{t('deletion.contact.title')}</h2>
            <p className="m-0 mt-3 text-sm leading-6 text-[var(--ink-3)]">
              {t('deletion.contact.prefix')}{' '}
              <a className="font-semibold text-[var(--ink)]" dir="ltr" href="mailto:q9labs.ai@gmail.com">
                q9labs.ai@gmail.com
              </a>
              {t('deletion.contact.suffix')}
            </p>
          </section>
        </div>
      </article>
    </main>
  )
}
