import { LanguageSwitcher } from '#/i18n'

type PublicLocaleControlProps = {
  className?: string
}

export function PublicLocaleControl({ className = '' }: PublicLocaleControlProps) {
  return (
    <div className={`flex justify-end ${className}`.trim()}>
      <LanguageSwitcher />
    </div>
  )
}
