import { useTranslation } from 'react-i18next'

import { getLocaleMetadata, SUPPORTED_LOCALES, type Locale } from './locale'
import { useLocale } from './runtime'

interface LanguageSwitcherProps {
  className?: string
}

export function LanguageSwitcher({ className }: LanguageSwitcherProps) {
  const { t } = useTranslation('common')
  const { locale, setLocale } = useLocale()
  const label = t('language.label')

  return (
    <label className={className}>
      <span>{label}</span>
      <select
        aria-label={label}
        data-testid="language-switcher"
        dir={getLocaleMetadata(locale).direction}
        value={locale}
        onChange={(event) => {
          void setLocale(event.currentTarget.value as Locale)
        }}
      >
        {SUPPORTED_LOCALES.map((supportedLocale) => {
          const metadata = getLocaleMetadata(supportedLocale)
          return (
            <option key={metadata.code} lang={metadata.code} value={metadata.code}>
              {metadata.selfName}
            </option>
          )
        })}
      </select>
    </label>
  )
}
