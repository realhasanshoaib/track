import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { PublicLocaleControl } from '#/components/PublicLocaleControl'

export const Route = createFileRoute('/support')({
  component: Support,
})

const supportItems = [
  'account',
  'project',
  'privacy',
] as const

function Support() {
  const { t } = useTranslation('legal')

  return (
    <main className="bg-[var(--paper)] px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <PublicLocaleControl className="mb-8" />
      </div>
      <article className="mx-auto max-w-3xl">
        <p className="mono-label m-0 mb-2">{t('support.eyebrow')}</p>
        <h1 className="m-0 text-3xl font-semibold">{t('support.title')}</h1>
        <p className="m-0 mt-2 text-sm text-[var(--ink-3)]">
          {t('support.effectiveDate')}
        </p>

        <div className="track-surface mt-6 rounded-md p-4">
          <p className="m-0 text-sm leading-6 text-[var(--ink-2)]">
            {t('support.intro')}
          </p>
        </div>

        <div className="mt-8 space-y-7">
          {supportItems.map((item) => (
            <section key={item}>
              <h2 className="m-0 text-lg font-semibold">{t(`support.items.${item}.title`)}</h2>
              <p className="m-0 mt-3 text-sm leading-6 text-[var(--ink-3)]">
                {t(`support.items.${item}.body`)}
              </p>
            </section>
          ))}

          <section>
            <h2 className="m-0 text-lg font-semibold">{t('support.contact.title')}</h2>
            <p className="m-0 mt-3 text-sm leading-6 text-[var(--ink-3)]">
              {t('support.contact.prefix')}{' '}
              <a className="font-semibold text-[var(--ink)]" dir="ltr" href="mailto:q9labs.ai@gmail.com">
                q9labs.ai@gmail.com
              </a>
              {t('support.contact.suffix')}
            </p>
          </section>
        </div>
      </article>
    </main>
  )
}
