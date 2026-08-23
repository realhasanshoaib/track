import { createFileRoute } from '@tanstack/react-router'
import { ShieldCheck } from 'lucide-react'
import { useState } from 'react'

import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { authClient } from '../lib/auth-client'
import { getSafeLocalReturnPath } from '../lib/url-policy'

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
  const [code, setCode] = useState('')
  const [method, setMethod] = useState<TwoFactorMethod>('totp')
  const [trustDevice, setTrustDevice] = useState(true)
  const [message, setMessage] = useState('')

  function finishTwoFactor() {
    const next = getSafeLocalReturnPath(window.localStorage.getItem('track-login-return-to'))
    window.localStorage.removeItem('track-login-return-to')
    window.location.href = next
  }

  return (
    <main className="min-h-[calc(100vh-48px)] bg-[var(--paper)] px-4 py-10">
      <section className="mx-auto max-w-[420px]">
        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-md bg-[var(--accent)] text-[var(--ink)]">
          <ShieldCheck size={19} />
        </div>
        <p className="mono-label m-0">Two-Factor</p>
        <h1 className="m-0 mt-2 text-2xl font-semibold">Enter your authenticator code</h1>

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
                setMessage(error.message ?? 'Invalid two-factor code.')
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
              Authenticator
            </Button>
            <Button
              className={method === 'backup_code' ? 'track-button track-button-primary' : 'track-button'}
              onClick={() => setMethod('backup_code')}
              type="button"
            >
              Backup code
            </Button>
          </div>
          <Input
            aria-label={method === 'backup_code' ? 'Backup code' : 'Authenticator code'}
            autoComplete="one-time-code"
            className="min-h-11 w-full rounded-md border border-[var(--hairline-strong)] bg-[var(--paper)] px-3 text-sm outline-none focus:border-[var(--accent)]"
            inputMode={method === 'backup_code' ? 'text' : 'numeric'}
            onChange={(event) => setCode(event.currentTarget.value)}
            placeholder={method === 'backup_code' ? 'XXXX-XXXXXX' : '123456'}
            value={code}
          />
          <label className="track-two-factor-trust">
            <input
              checked={trustDevice}
              onChange={(event) => setTrustDevice(event.currentTarget.checked)}
              type="checkbox"
            />
            <span>Trust this device for 30 days</span>
          </label>
          <button className="track-button track-button-primary w-full" type="submit">
            Verify
          </button>
          {message ? (
            <p className="m-0 text-sm text-[var(--danger)]">{message}</p>
          ) : null}
        </form>
      </section>
    </main>
  )
}
