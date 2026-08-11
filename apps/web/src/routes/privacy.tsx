import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { PublicLocaleControl } from '#/components/PublicLocaleControl'

export const Route = createFileRoute('/privacy')({
  component: Privacy,
})

const sections = [
  { key: 'information', items: ['item1', 'item2', 'item3', 'item4', 'item5', 'item6'] },
  { key: 'use', items: ['item1', 'item2', 'item3', 'item4'] },
  { key: 'sharing', items: ['item1', 'item2', 'item3', 'item4'] },
  { key: 'retention', items: ['item1', 'item2'] },
  { key: 'choices', items: ['item1', 'item2', 'item3'] },
] as const

function Privacy() {
  const { t } = useTranslation('legal')

  return (
    <main className="bg-[var(--paper)] px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <PublicLocaleControl className="mb-8" />
      </div>
      <article className="mx-auto max-w-3xl">
        <p className="mono-label m-0 mb-2">{t('privacy.eyebrow')}</p>
        <h1 className="m-0 text-3xl font-semibold">{t('privacy.title')}</h1>
        <p className="m-0 mt-2 text-sm text-[var(--ink-3)]">
          {t('privacy.effectiveDate')}
        </p>

        <div className="track-surface mt-6 rounded-md p-4">
          <p className="m-0 text-sm leading-6 text-[var(--ink-2)]">
            {t('privacy.intro')}
          </p>
        </div>

        <div className="mt-8 space-y-7">
          {sections.map((section) => (
            <section key={section.key}>
              <h2 className="m-0 text-lg font-semibold">{t(`privacy.sections.${section.key}.title`)}</h2>
              <ul className="m-0 mt-3 space-y-2 pl-5 text-sm leading-6 text-[var(--ink-3)]">
                {section.items.map((itemKey) => (
                  <li key={itemKey}>{t(`privacy.sections.${section.key}.${itemKey}`)}</li>
                ))}
              </ul>
            </section>
          ))}

          <section>
            <h2 className="m-0 text-lg font-semibold">{t('privacy.sections.security.title')}</h2>
            <p className="m-0 mt-3 text-sm leading-6 text-[var(--ink-3)]">
              {t('privacy.sections.security.body')}
            </p>
          </section>

          <section>
            <h2 className="m-0 text-lg font-semibold">{t('privacy.sections.children.title')}</h2>
            <p className="m-0 mt-3 text-sm leading-6 text-[var(--ink-3)]">
              {t('privacy.sections.children.body')}
            </p>
          </section>

          <section>
            <h2 className="m-0 text-lg font-semibold">{t('privacy.sections.contact.title')}</h2>
            <p className="m-0 mt-3 text-sm leading-6 text-[var(--ink-3)]">
              {t('privacy.sections.contact.prefix')}{' '}
              <a className="font-semibold text-[var(--ink)]" dir="ltr" href="mailto:q9labs.ai@gmail.com">
                q9labs.ai@gmail.com
              </a>
              {t('privacy.sections.contact.suffix')}
            </p>
          </section>
        </div>
      </article>
    </main>
  )
}
