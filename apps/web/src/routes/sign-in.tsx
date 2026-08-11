import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useConvex } from 'convex/react'
import { Eye, EyeOff, KeyRound, Lock, Mail, MessageSquareText, Search, ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useMemo, useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'

import { api } from '../../../../convex/_generated/api'
import { PublicLocaleControl } from '#/components/PublicLocaleControl'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { enableDevAuthBypass, isDevAuthBypassAllowed } from '#/lib/dev-auth-bypass'
import { authClient } from '../lib/auth-client'

const pendingSetPasswordEmailKey = 'track-pending-set-password-email'
const supportEmail = 'q9labs.ai@gmail.com'

type AuthMode = 'continue' | 'confirm-new' | 'google-proof' | 'set-password'
type SignInVariant = 'default' | 'conversation-a' | 'conversation-b'

export const Route = createFileRoute('/sign-in')({ component: () => <SignInExperience variant="conversation-b" /> })

const previewMessages = [
  {
    initials: 'RH',
    name: 'Reem Haddad',
    tone: 's-2',
    time: '4:45:45 PM',
    body: 'Please make supplier verification visible. Our promise is that every seller and product is reviewed before it reaches shoppers.',
  },
  {
    initials: 'SK',
    name: 'Sara Khan',
    tone: 's-2',
    time: '4:52:45 PM',
    body: 'capture supplier verification and product review as an official launch requirement.',
    mention: '@track',
  },
  {
    initials: 'TA',
    name: 'Track Assistant',
    tone: 's-3',
    time: '4:59:45 PM',
    body: 'Noted. I will keep that visible in the launch conversation and preserve the exact wording for review.',
  },
  {
    initials: 'FR',
    name: 'Faisal Rahman',
    tone: 's-3',
    time: '5:06:45 PM',
    body: 'Delivery messaging should mention Dubai, Abu Dhabi, Sharjah, Ajman, and the rest of the Emirates without promising impossible same-day coverage everywhere.',
  },
  {
    initials: 'OF',
    name: 'Omar Farooq',
    tone: 's-4',
    time: '5:13:45 PM',
    body: 'Good call. I will write it as fast UAE-wide delivery with emirate-level expectations in checkout.',
  },
  {
    initials: 'HS',
    name: 'Hasan Shoaib',
    tone: 's-2',
    time: '5:27:45 PM',
    body: 'Let us also show reorder as a core workflow. People managing diabetes should not rebuild the same cart every month.',
  },
  {
    initials: 'SK',
    name: 'Sara Khan',
    tone: 's-2',
    time: '5:34:45 PM',
    body: 'I am adding quick reorder, saved supply lists, and reminders as the main retention loop.',
  },
  {
    initials: 'RH',
    name: 'Reem Haddad',
    tone: 's-2',
    time: '5:41:45 PM',
    body: 'Can the account summary show which requests are billable versus included? That would help me share it internally.',
  },
  {
    initials: 'OF',
    name: 'Omar Farooq',
    tone: 's-4',
    time: '5:48:45 PM',
    body: 'Let us keep the delivery promise precise and avoid implying that cold-chain items are available in every city from day one.',
  },
  {
    initials: 'HS',
    name: 'Hasan Shoaib',
    tone: 's-2',
    time: '5:52:45 PM',
    body: 'Agreed. Keep the launch copy factual and make the review promise easy for ops to defend.',
  },
  {
    initials: 'TA',
    name: 'Track Assistant',
    tone: 's-3',
    time: '5:59:45 PM',
    body: 'I am keeping the supplier review, delivery promise, and reorder workflow in this thread for the next pass.',
  },
]

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

export function SignInExperience({ variant }: { variant: SignInVariant }) {
  const { t } = useTranslation('auth')
  const convex = useConvex()
  const navigate = useNavigate()
  const session = authClient.useSession()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false)
  const [mode, setMode] = useState<AuthMode>(() => {
    if (typeof window === 'undefined') return 'continue'
    return window.localStorage.getItem(pendingSetPasswordEmailKey) ? 'set-password' : 'continue'
  })
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const pendingSetPasswordEmail = useMemo(() => {
    if (typeof window === 'undefined') return ''
    return window.localStorage.getItem(pendingSetPasswordEmailKey) ?? ''
  }, [mode])

  async function handleDevBypass() {
    setBusy(true)
    setMessage('')
    try {
      await enableDevAuthBypass()
      await navigate({ to: '/workspace' })
    } catch {
      setMessage(t('signIn.errors.demoUnavailable'))
    } finally {
      setBusy(false)
    }
  }

  async function continueWithGoogle() {
    setMessage('')
    if (mode === 'google-proof') {
      window.localStorage.setItem(pendingSetPasswordEmailKey, normalizeEmail(email))
    }
    setBusy(true)
    try {
      const result = await authClient.signIn.social({
        provider: 'google',
        callbackURL: mode === 'google-proof' ? '/auth/callback?next=/sign-in' : '/auth/callback',
      })
      if (result.error) {
        setMessage(t('signIn.errors.generic'))
        return
      }
      if (result.data?.url) {
        window.location.href = result.data.url
      }
    } catch {
      setMessage(t('signIn.errors.generic'))
    } finally {
      setBusy(false)
    }
  }

  async function handleEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedEmail = normalizeEmail(email || pendingSetPasswordEmail)
    const passwordValue = password.trim()
    setMessage('')

    if (!normalizedEmail.includes('@')) {
      setMessage(t('signIn.errors.validEmail'))
      return
    }
    if (passwordValue.length < 10) {
      setMessage(t('signIn.errors.passwordLength'))
      return
    }
    if ((mode === 'confirm-new' || mode === 'set-password') && passwordValue !== confirmPassword.trim()) {
      setMessage(t('signIn.errors.passwordMismatch'))
      return
    }

    setBusy(true)
    try {
      if (mode === 'set-password') {
        if (!session.data) {
          setMessage(t('signIn.errors.googleFirst'))
          setMode('google-proof')
          return
        }
        const client = authClient as typeof authClient & {
          setPassword: (input: { newPassword: string }) => Promise<{ error?: { message?: string } | null }>
        }
        const result = await client.setPassword({ newPassword: passwordValue })
        if (result.error) {
          setMessage(t('signIn.errors.generic'))
          return
        }
        window.localStorage.removeItem(pendingSetPasswordEmailKey)
        await navigate({ to: '/workspace' })
        return
      }

      if (mode === 'confirm-new') {
        const result = await authClient.signUp.email({
          email: normalizedEmail,
          password: passwordValue,
          name: normalizedEmail.split('@')[0] || 'Track User',
          callbackURL: '/workspace',
        })
        if (result.error) {
          setMessage(t('signIn.errors.generic'))
          return
        }
        await navigate({ to: '/workspace' })
        return
      }

      const hint = await convex.query(api.auth.getEmailAuthHint, { email: normalizedEmail })
      if (hint.status === 'new') {
        setMode('confirm-new')
        setConfirmPassword('')
        return
      }
      if (hint.status === 'google_only' || hint.status === 'existing_without_password') {
        setMode('google-proof')
        return
      }
      if (hint.status === 'invalid') {
        setMessage(t('signIn.errors.validEmail'))
        return
      }

      window.localStorage.setItem('track-login-return-to', window.location.pathname + window.location.search)
      const result = await authClient.signIn.email({
        email: normalizedEmail,
        password: passwordValue,
        callbackURL: '/workspace',
      })
      if (result.error) {
        setMessage(t('signIn.errors.incorrectCredentials'))
      }
    } catch {
      setMessage(t('signIn.errors.generic'))
    } finally {
      setBusy(false)
    }
  }

  const title =
    mode === 'confirm-new'
      ? t('signIn.titles.confirmNew')
      : mode === 'google-proof'
        ? t('signIn.titles.googleProof')
        : mode === 'set-password'
          ? t('signIn.titles.setPassword')
          : t('signIn.titles.continue')
  const copy =
    mode === 'confirm-new'
      ? <><bdi dir="ltr">{normalizeEmail(email)}</bdi>{' '}{t('signIn.copy.confirmNewLead')}</>
      : mode === 'google-proof'
        ? t('signIn.copy.googleProof')
        : mode === 'set-password'
          ? <>{t('signIn.copy.setPasswordLead')}{' '}<bdi dir="ltr">{pendingSetPasswordEmail || t('signIn.fields.email')}</bdi>{' '}{t('signIn.copy.setPasswordTail')}</>
          : t('signIn.copy.continue')
  const emailButtonLabel =
    mode === 'confirm-new'
      ? t('signIn.buttons.createAccount')
      : mode === 'set-password'
        ? t('signIn.buttons.addPassword')
        : t('signIn.buttons.continueEmail')

  const isConversationVariant = variant !== 'default'

  return (
    <main className={`relative ${isConversationVariant ? `track-auth-page track-auth-page-${variant}` : 'track-auth-page'}`}>
      <PublicLocaleControl className="fixed end-4 top-4 z-10" />
      <section className="track-auth-shell">
        <div className={isConversationVariant ? 'track-auth-story track-auth-story-conversation' : 'track-auth-story'}>
          <img
            alt={t('signIn.labels.logo')}
            className="track-auth-logo track-auth-logo-light"
            height={70}
            src="/track-logo.svg"
            width={160}
          />
          <img
            alt=""
            aria-hidden="true"
            className="track-auth-logo track-auth-logo-dark"
            height={70}
            src="/track-logo-reversed.svg"
            width={160}
          />
          {isConversationVariant ? (
            <ConversationPreview variant={variant} />
          ) : (
            <>
              <div>
                <h1>{t('signIn.proof.heading')}</h1>
                <p>
                  {t('signIn.proof.description')}
                </p>
              </div>
              <div className="track-auth-proof">
                <span><MessageSquareText size={16} /> {t('signIn.proof.sharedConversation')}</span>
                <span><Search size={16} /> {t('signIn.proof.searchableEvidence')}</span>
                <span><ShieldCheck size={16} /> {t('signIn.proof.permissionedAccess')}</span>
              </div>
            </>
          )}
        </div>

        <div className="track-auth-panel">
          <h2>{title}</h2>
          <p>{copy}</p>

          {mode === 'google-proof' ? (
            <Button
              className="track-button track-button-primary track-auth-button"
              disabled={busy}
              onClick={() => void continueWithGoogle()}
              type="button"
            >
              <img alt="" height={18} src="/google-g.svg" width={18} />
              {t('signIn.buttons.continueGoogle')}
            </Button>
          ) : (
            <form className="track-auth-email-form" onSubmit={(event) => void handleEmailSubmit(event)}>
              {mode !== 'set-password' ? (
                <label>
                  <span>{t('signIn.fields.email')}</span>
                  <Input
                    autoComplete="email"
                    className="track-auth-input-with-icon"
                    onChange={(event) => setEmail(event.currentTarget.value)}
                    placeholder={t('signIn.placeholders.email')}
                    type="email"
                    value={email}
                  />
                  <Mail className="track-auth-field-icon" size={17} />
                </label>
              ) : null}
              <label>
                <span>{t('signIn.fields.password')}</span>
                <Input
                  autoComplete={mode === 'continue' ? 'current-password' : 'new-password'}
                  className="track-auth-input-with-icon track-auth-input-with-action"
                  onChange={(event) => setPassword(event.currentTarget.value)}
                  placeholder={t('signIn.placeholders.password')}
                  type={passwordVisible ? 'text' : 'password'}
                  value={password}
                />
                <Lock className="track-auth-field-icon" size={17} />
                <button
                  aria-label={passwordVisible ? t('signIn.labels.hidePassword') : t('signIn.labels.showPassword')}
                  className="track-auth-input-action"
                  onClick={() => setPasswordVisible((visible) => !visible)}
                  type="button"
                >
                  {passwordVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </label>
              {mode === 'confirm-new' || mode === 'set-password' ? (
                <label>
                  <span>{t('signIn.fields.confirmPassword')}</span>
                  <Input
                    autoComplete="new-password"
                    className="track-auth-input-with-icon track-auth-input-with-action"
                    onChange={(event) => setConfirmPassword(event.currentTarget.value)}
                    placeholder={t('signIn.placeholders.confirmPassword')}
                    type={confirmPasswordVisible ? 'text' : 'password'}
                    value={confirmPassword}
                  />
                  <Lock className="track-auth-field-icon" size={17} />
                  <button
                    aria-label={confirmPasswordVisible ? t('signIn.labels.hidePassword') : t('signIn.labels.showPassword')}
                    className="track-auth-input-action"
                    onClick={() => setConfirmPasswordVisible((visible) => !visible)}
                    type="button"
                  >
                    {confirmPasswordVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </label>
              ) : null}
              <button
                className="track-button track-button-primary track-auth-button"
                disabled={busy}
                type="submit"
              >
                <Mail size={16} />
                {emailButtonLabel}
              </button>
            </form>
          )}

          {mode === 'continue' ? (
            <>
              <div className="track-auth-divider">{t('signIn.proof.or')}</div>
              <Button
                className="track-button track-auth-button"
                disabled={busy}
                onClick={() => void continueWithGoogle()}
                type="button"
                variant="outline"
              >
                <img alt="" height={18} src="/google-g.svg" width={18} />
                {t('signIn.buttons.continueGoogle')}
              </Button>
            </>
          ) : (
            <Button
              className="track-button track-auth-button"
              disabled={busy}
              onClick={() => {
                setMode('continue')
                setMessage('')
                window.localStorage.removeItem(pendingSetPasswordEmailKey)
              }}
              type="button"
              variant="outline"
            >
              {t('signIn.buttons.back')}
            </Button>
          )}

          {isDevAuthBypassAllowed ? (
            <Button
              className="track-button track-auth-button"
              disabled={busy}
              onClick={() => void handleDevBypass()}
              style={{ marginTop: 10 }}
              type="button"
              variant="outline"
            >
              <KeyRound size={16} />
              {t('signIn.buttons.useDemo')}
            </Button>
          ) : null}

          {message ? <p className="track-auth-error">{message}</p> : null}

          <div className="track-auth-note">
            <ShieldCheck size={16} />
            <span>{t('signIn.accessHelpPrefix')}{' '}<bdi dir="ltr">{supportEmail}</bdi>{t('signIn.accessHelpSuffix')}</span>
          </div>
        </div>
      </section>
    </main>
  )
}

function ConversationPreview({ variant }: { variant: Exclude<SignInVariant, 'default'> }) {
  const { t } = useTranslation('auth')
  const baseMessages = variant === 'conversation-a' ? previewMessages.slice(0, 6) : previewMessages
  const messages = variant === 'conversation-b' ? [...baseMessages, ...baseMessages] : baseMessages
  const repeatedMessageCount = variant === 'conversation-b' ? baseMessages.length : messages.length

  return (
    <div className={`track-auth-conversation track-auth-conversation-${variant}`}>
      {variant === 'conversation-a' ? (
        <div className="track-auth-live-status">
          <span />
          {t('signIn.proof.liveConversation')}
        </div>
      ) : null}
      <div className="track-auth-conversation-thread">
        {messages.map((message, index) => (
          <article
            aria-hidden={index >= repeatedMessageCount}
            className="track-auth-preview-row"
            key={`${message.name}-${message.time}-${index}`}
            style={{ '--row-index': index % repeatedMessageCount } as CSSProperties}
          >
            <div className={`track-message-avatar ${message.tone}`}>{message.initials}</div>
            <div className="track-auth-preview-body">
              <div className="track-message-meta">
                <strong dir="auto">{message.name}</strong>
                <time dir="ltr">{message.time}</time>
              </div>
              <p dir="auto">
                {message.mention ? <bdi className="track-auth-mention" dir="ltr">{message.mention}</bdi> : null}
                {message.body}
              </p>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
