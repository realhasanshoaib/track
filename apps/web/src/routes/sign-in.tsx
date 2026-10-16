import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useConvex } from 'convex/react'
import { Eye, EyeOff, KeyRound, Lock, Mail, MessageSquareText, Search, ShieldCheck } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'

import { api } from '../../../../convex/_generated/api'
import TrackLoader from '#/components/TrackLoader'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import {
  finishEmailAuthHandoff,
  getAuthenticatedSignInDestination,
  shouldFinishEmailAuthHandoff,
} from '#/lib/auth-handoff'
import type { AuthMode } from '#/lib/auth-handoff'
import { enableDevAuthBypass, isDevAuthBypassAllowed } from '#/lib/dev-auth-bypass'
import { authClient } from '../lib/auth-client'

const pendingSetPasswordEmailKey = 'track-pending-set-password-email'
const supportEmail = 'q9labs.ai@gmail.com'

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
]

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function getPasswordMessage(error: unknown) {
  if (!error) return ''
  if (typeof error === 'object' && 'message' in error) {
    const message = String(error.message)
    if (message) return message
  }
  return 'Could not continue. Check the details and try again.'
}

export function SignInExperience({ variant }: { variant: SignInVariant }) {
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
  const authenticatedDestination = getAuthenticatedSignInDestination(Boolean(session.data), mode)

  useEffect(() => {
    if (!authenticatedDestination) return
    void navigate({ replace: true, to: authenticatedDestination })
  }, [authenticatedDestination, navigate])

  async function handleDevBypass() {
    setBusy(true)
    setMessage('')
    try {
      await enableDevAuthBypass()
      await navigate({ to: '/workspace' })
    } catch {
      setMessage('Demo sign-in is unavailable in this development environment.')
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
        callbackURL: new URL(
          mode === 'google-proof' ? '/auth/callback?next=/sign-in' : '/auth/callback',
          window.location.origin,
        ).toString(),
      })
      if (result.error) {
        setMessage(getPasswordMessage(result.error))
        return
      }
      if (result.data?.url) {
        window.location.href = result.data.url
      }
    } catch (error) {
      setMessage(getPasswordMessage(error))
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
      setMessage('Enter a valid email address.')
      return
    }
    if (passwordValue.length < 10) {
      setMessage('Password must be at least 10 characters.')
      return
    }
    if ((mode === 'confirm-new' || mode === 'set-password') && passwordValue !== confirmPassword.trim()) {
      setMessage('Passwords do not match.')
      return
    }

    setBusy(true)
    try {
      if (mode === 'set-password') {
        if (!session.data) {
          setMessage('Continue with Google first, then add a password.')
          setMode('google-proof')
          return
        }
        const client = authClient as typeof authClient & {
          setPassword: (input: { newPassword: string }) => Promise<{ error?: { message?: string } | null }>
        }
        const result = await client.setPassword({ newPassword: passwordValue })
        if (result.error) {
          setMessage(getPasswordMessage(result.error))
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
          callbackURL: new URL('/workspace', window.location.origin).toString(),
        })
        if (result.error) {
          setMessage(getPasswordMessage(result.error))
          return
        }
        finishEmailAuthHandoff()
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
        setMessage('Enter a valid email address.')
        return
      }

      window.localStorage.setItem('track-login-return-to', window.location.pathname + window.location.search)
      const result = await authClient.signIn.email({
        email: normalizedEmail,
        password: passwordValue,
        callbackURL: new URL('/workspace', window.location.origin).toString(),
      })
      if (result.error) {
        setMessage('Email or password is incorrect.')
        return
      }
      if (shouldFinishEmailAuthHandoff(result.data)) {
        finishEmailAuthHandoff()
      }
    } catch (error) {
      setMessage(getPasswordMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const title =
    mode === 'confirm-new'
      ? 'Create your Track account'
      : mode === 'google-proof'
        ? 'Confirm this Google account'
        : mode === 'set-password'
          ? 'Add email password'
          : 'Sign in to continue'
  const copy =
    mode === 'confirm-new'
      ? `${normalizeEmail(email)} is new. Confirm your password before we create it.`
      : mode === 'google-proof'
        ? 'This email already uses Google. Continue with Google first, then add a password to the same Track profile.'
        : mode === 'set-password'
          ? `Set a password for ${pendingSetPasswordEmail || 'this email'} after confirming your Google account.`
          : 'Use email and password, or continue with Google. New email accounts are created after confirmation.'
  const emailButtonLabel =
    mode === 'confirm-new'
      ? 'Create account'
      : mode === 'set-password'
        ? 'Add password'
        : 'Continue with Email'

  const isConversationVariant = variant !== 'default'

  if (session.isPending || authenticatedDestination) {
    return (
      <main className="track-auth-page">
        <TrackLoader label="Checking your session" />
      </main>
    )
  }

  return (
    <main className={isConversationVariant ? `track-auth-page track-auth-page-${variant}` : 'track-auth-page'}>
      <section className="track-auth-shell">
        <div className={isConversationVariant ? 'track-auth-story track-auth-story-conversation' : 'track-auth-story'}>
          <img
            alt="Track"
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
                <h1>Keep project conversation and evidence connected.</h1>
                <p>
                  Track keeps project teams aligned around decisions,
                  messages, attachments, and search.
                </p>
              </div>
              <div className="track-auth-proof">
                <span><MessageSquareText size={16} /> Shared conversation</span>
                <span><Search size={16} /> Searchable evidence</span>
                <span><ShieldCheck size={16} /> Permissioned access</span>
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
              Continue with Google
            </Button>
          ) : (
            <form className="track-auth-email-form" onSubmit={(event) => void handleEmailSubmit(event)}>
              {mode !== 'set-password' ? (
                <label>
                  <span>Email</span>
                  <Input
                    autoComplete="email"
                    className="track-auth-input-with-icon"
                    onChange={(event) => setEmail(event.currentTarget.value)}
                    placeholder="you@example.com"
                    type="email"
                    value={email}
                  />
                  <Mail className="track-auth-field-icon" size={17} />
                </label>
              ) : null}
              <label>
                <span>Password</span>
                <Input
                  autoComplete={mode === 'continue' ? 'current-password' : 'new-password'}
                  className="track-auth-input-with-icon track-auth-input-with-action"
                  onChange={(event) => setPassword(event.currentTarget.value)}
                  placeholder="At least 10 characters"
                  type={passwordVisible ? 'text' : 'password'}
                  value={password}
                />
                <Lock className="track-auth-field-icon" size={17} />
                <button
                  aria-label={passwordVisible ? 'Hide password' : 'Show password'}
                  className="track-auth-input-action"
                  onClick={() => setPasswordVisible((visible) => !visible)}
                  type="button"
                >
                  {passwordVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </label>
              {mode === 'confirm-new' || mode === 'set-password' ? (
                <label>
                  <span>Confirm password</span>
                  <Input
                    autoComplete="new-password"
                    className="track-auth-input-with-icon track-auth-input-with-action"
                    onChange={(event) => setConfirmPassword(event.currentTarget.value)}
                    placeholder="Repeat password"
                    type={confirmPasswordVisible ? 'text' : 'password'}
                    value={confirmPassword}
                  />
                  <Lock className="track-auth-field-icon" size={17} />
                  <button
                    aria-label={confirmPasswordVisible ? 'Hide password' : 'Show password'}
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
              <div className="track-auth-divider">or</div>
              <Button
                className="track-button track-auth-button"
                disabled={busy}
                onClick={() => void continueWithGoogle()}
                type="button"
                variant="outline"
              >
                <img alt="" height={18} src="/google-g.svg" width={18} />
                Continue with Google
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
              Back
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
              Use Hasan Demo
            </Button>
          ) : null}

          {message ? <p className="track-auth-error">{message}</p> : null}

          <div className="track-auth-note">
            <ShieldCheck size={16} />
            <span>Need access or password help? Contact {supportEmail}.</span>
          </div>
        </div>
      </section>
    </main>
  )
}

function ConversationPreview({ variant }: { variant: Exclude<SignInVariant, 'default'> }) {
  const baseMessages = variant === 'conversation-a' ? previewMessages.slice(0, 6) : previewMessages
  const messages = variant === 'conversation-b' ? [...baseMessages, ...baseMessages] : baseMessages
  const repeatedMessageCount = variant === 'conversation-b' ? baseMessages.length : messages.length

  return (
    <div className={`track-auth-conversation track-auth-conversation-${variant}`}>
      {variant === 'conversation-a' ? (
        <div className="track-auth-live-status">
          <span />
          Live conversation
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
                <strong>{message.name}</strong>
                <time>{message.time}</time>
              </div>
              <p>
                {message.body}
              </p>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
