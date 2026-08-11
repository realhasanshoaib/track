import { createFileRoute } from '@tanstack/react-router'
import { ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useState } from 'react'

import { PublicLocaleControl } from '#/components/PublicLocaleControl'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { authClient } from '../lib/auth-client'

export const Route = createFileRoute('/two-factor')({ component: TwoFactor })

type TwoFactorMethod = 'totp' | 'backup_code'

type AuthClientWithBackupCode = typeof authClient & {
  twoFactor: typeof authClient.twoFactor & {
    verifyBackupCode: (input: {
      code: string
      trustDevice?: boolean
    }) => Promise<{ error?: { message?: string } | null }>
  }
}

function TwoFactor() {
  const { t } = useTranslation('auth')
  const [code, setCode] = useState('')
  const [method, setMethod] = useState<TwoFactorMethod>('totp')
  const [trustDevice, setTrustDevice] = useState(true)
  const [message, setMessage] = useState('')

  function finishTwoFactor() {
    const next = window.localStorage.getItem('track-login-return-to') || '/workspace'
    window.localStorage.removeItem('track-login-return-to')
    window.location.href = next.startsWith('/') ? next : '/workspace'
  }

  return (
    <main className="min-h-[calc(100vh-48px)] bg-[var(--paper)] px-4 py-10">
      <section className="mx-auto max-w-[420px]">
        <PublicLocaleControl className="mb-8" />
        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-md bg-[var(--accent)] text-[var(--ink)]">
          <ShieldCheck size={19} />
        </div>
        <p className="mono-label m-0">{t('twoFactor.eyebrow')}</p>
        <h1 className="m-0 mt-2 text-2xl font-semibold">{t('twoFactor.title')}</h1>

        <form
          className="mt-6 space-y-3"
          onSubmit={(event) => {
            event.preventDefault()
            const client = authClient as AuthClientWithBackupCode
            const verify =
              method === 'backup_code'
                ? client.twoFactor.verifyBackupCode({ code, trustDevice })
                : authClient.twoFactor.verifyTotp({ code, trustDevice })
            void verify.then(({ error }) => {
              if (error) {
                setMessage(t('twoFactor.invalidCode'))
                return
              }
              finishTwoFactor()
            })
          }}
        >
          <div className="track-two-factor-methods">
            <Button
              className={method === 'totp' ? 'track-button track-button-primary' : 'track-button'}
              onClick={() => setMethod('totp')}
              type="button"
            >
              {t('twoFactor.methods.authenticator')}
            </Button>
            <Button
              className={method === 'backup_code' ? 'track-button track-button-primary' : 'track-button'}
              onClick={() => setMethod('backup_code')}
              type="button"
            >
              {t('twoFactor.methods.backupCode')}
            </Button>
          </div>
          <Input
            aria-label={method === 'backup_code' ? t('twoFactor.fields.backupCode') : t('twoFactor.fields.authenticatorCode')}
            autoComplete="one-time-code"
            className="min-h-11 w-full rounded-md border border-[var(--hairline-strong)] bg-[var(--paper)] px-3 text-sm outline-none focus:border-[var(--accent)]"
            inputMode={method === 'backup_code' ? 'text' : 'numeric'}
            onChange={(event) => setCode(event.currentTarget.value)}
            placeholder={method === 'backup_code' ? t('twoFactor.placeholders.backupCode') : t('twoFactor.placeholders.authenticatorCode')}
            value={code}
          />
          <label className="track-two-factor-trust">
            <input
              checked={trustDevice}
              onChange={(event) => setTrustDevice(event.currentTarget.checked)}
              type="checkbox"
            />
            <span>{t('twoFactor.trustDevice')}</span>
          </label>
          <button className="track-button track-button-primary w-full" type="submit">
            {t('twoFactor.verify')}
          </button>
          {message ? (
            <p className="m-0 text-sm text-[var(--danger)]">{message}</p>
          ) : null}
        </form>
      </section>
    </main>
  )
}
