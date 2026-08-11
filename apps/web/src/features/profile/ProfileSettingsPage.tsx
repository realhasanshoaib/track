import { useMutation, useQuery } from 'convex/react'
import {
  ArrowLeft,
  Camera,
  ChevronDown,
  Clock3,
  KeyRound,
  Mail,
  PenLine,
  QrCode,
  ShieldCheck,
  Smartphone,
  UserRound,
} from 'lucide-react'
import { toDataURL } from 'qrcode'
import { useTranslation } from 'react-i18next'
import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties, ChangeEvent, FormEvent } from 'react'

import { api } from '../../../../../convex/_generated/api'
import type { Id } from '../../../../../convex/_generated/dataModel'
import { PublicLocaleControl } from '#/components/PublicLocaleControl'
import { Avatar, AvatarFallback, AvatarImage } from '#/components/ui/avatar'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Textarea } from '#/components/ui/textarea'
import TrackLoader from '#/components/TrackLoader'
import { formatTime, useLocale } from '#/i18n'
import { authClient } from '#/lib/auth-client'
import { useDevAuthBypass } from '#/lib/dev-auth-bypass'
import { getAvatarTone, getAvatarToneColor, getInitials } from '#/features/workspace/identity'
import { TeamMemberCard } from '#/features/workspace/avatar-tooltip'
import {
  ProfileBannerBackground,
  normalizeProfileBannerStyle,
  profileBannerStyles,
  usePrefersReducedMotion,
} from '#/features/workspace/profile-banners'

type ProfileSettingsPageProps = {
  mode: 'onboarding' | 'settings'
}

type AuthAccount = {
  id?: string
  providerId: string
}

type AuthClientWithAccountMethods = typeof authClient & {
  listAccounts: () => Promise<{ data?: AuthAccount[] | null; error?: { message?: string } | null }>
}

type AuthClientWithTwoFactorMethods = typeof authClient & {
  twoFactor: typeof authClient.twoFactor & {
    enable: (input: { issuer?: string; password?: string }) => Promise<{
      data?: { backupCodes: string[]; totpURI: string } | null
      error?: { message?: string } | null
    }>
    disable: (input: { password?: string }) => Promise<{ error?: { message?: string } | null }>
    generateBackupCodes: (input: { password?: string }) => Promise<{
      data?: { backupCodes: string[] } | null
      error?: { message?: string } | null
    }>
    verifyTotp: (input: { code: string; trustDevice?: boolean }) => Promise<{
      error?: { message?: string } | null
    }>
  }
}

const maxAvatarBytes = 2 * 1024 * 1024
const allowedAvatarTypes = new Set(['image/png', 'image/jpeg', 'image/webp'])

function getBrowserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

function getTimezoneOptions() {
  const browserTimezone = getBrowserTimezone()
  const fallback = [
    browserTimezone,
    'UTC',
    'Asia/Karachi',
    'Asia/Dubai',
    'Europe/London',
    'America/New_York',
  ]

  const supportedValues = typeof Intl.supportedValuesOf === 'function'
    ? Intl.supportedValuesOf('timeZone')
    : fallback

  return Array.from(new Set([browserTimezone, ...supportedValues, ...fallback])).sort()
}

function getLocalTimeLabel(timezone: string, locale: Parameters<typeof formatTime>[0]) {
  try {
    return formatTime(locale, new Date(), {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: timezone,
      timeZoneName: 'short',
    })
  } catch {
    return timezone
  }
}

function isProfileComplete(input: {
  displayName: string
  profileDesignation: string
  timezone: string
}) {
  return Boolean(input.displayName.trim() && input.profileDesignation.trim() && input.timezone.trim())
}

function getProviderLabel(providerId: string, emailPasswordLabel: string) {
  if (providerId === 'google') return 'Google'
  if (providerId === 'credential') return emailPasswordLabel
  return providerId.replaceAll('_', ' ')
}

function getSecurityMessage(error: unknown, fallback: string, syncFallback: string) {
  const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : ''
  if (message.includes('CONVEX') || message.includes('unauthenticated')) {
    return syncFallback
  }
  return fallback
}

function getImagePalette(image: HTMLImageElement) {
  const canvas = document.createElement('canvas')
  const size = 24
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return null

  try {
    context.drawImage(image, 0, 0, size, size)
    const pixels = context.getImageData(0, 0, size, size).data
    let r = 0
    let g = 0
    let b = 0
    let count = 0
    for (let index = 0; index < pixels.length; index += 16) {
      const alpha = pixels[index + 3] ?? 0
      if (alpha < 80) continue
      r += pixels[index] ?? 0
      g += pixels[index + 1] ?? 0
      b += pixels[index + 2] ?? 0
      count += 1
    }
    if (!count) return null
    const primary = `rgb(${Math.round(r / count)}, ${Math.round(g / count)}, ${Math.round(b / count)})`
    const secondary = `rgb(${Math.max(0, Math.round(r / count) - 32)}, ${Math.max(0, Math.round(g / count) - 32)}, ${Math.max(0, Math.round(b / count) - 32)})`
    return { primary, secondary }
  } catch {
    return null
  }
}

export function ProfileSettingsPage({ mode }: ProfileSettingsPageProps) {
  const { t } = useTranslation('profile')
  const { locale } = useLocale()
  const session = authClient.useSession()
  const devAuthBypass = useDevAuthBypass()
  const ensureCurrentUser = useMutation(api.auth.ensureCurrentUser)
  const syncDevUser = useMutation(api.auth.syncDevUser)
  const updateProfile = useMutation(api.auth.updateProfile)
  const generateAvatarUploadUrl = useMutation(api.auth.generateAvatarUploadUrl)
  const setAvatar = useMutation(api.auth.setAvatar)
  const setTwoFactorEnabled = useMutation(api.auth.setTwoFactorEnabled)
  const resetStepUps = useMutation(api.auth.resetStepUps)

  const [trackUserId, setTrackUserId] = useState<Id<'users'> | null>(null)
  const profileStatus = useQuery(api.auth.getProfileStatus, trackUserId ? { userId: trackUserId } : 'skip')
  const avatarUrl = useQuery(api.auth.getAvatarUrl, trackUserId ? { userId: trackUserId } : 'skip')

  const [displayName, setDisplayName] = useState('')
  const [designation, setDesignation] = useState('')
  const [bio, setBio] = useState('')
  const [bannerStyle, setBannerStyle] = useState('silk')
  const [bannerPalette, setBannerPalette] = useState<{ primary: string; secondary: string } | null>(null)
  const [timezone, setTimezone] = useState(getBrowserTimezone)
  const [hydratedUserId, setHydratedUserId] = useState<string | null>(null)
  const [profileMessage, setProfileMessage] = useState('')
  const [busyProfile, setBusyProfile] = useState(false)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [avatarMessage, setAvatarMessage] = useState('')
  const [accounts, setAccounts] = useState<AuthAccount[]>([])
  const [securityMessage, setSecurityMessage] = useState('')
  const [accountPassword, setAccountPassword] = useState('')
  const [setupCode, setSetupCode] = useState('')
  const [setupQrUrl, setSetupQrUrl] = useState('')
  const [setupBackupCodes, setSetupBackupCodes] = useState<string[]>([])
  const [backupCodesVisible, setBackupCodesVisible] = useState(false)
  const [busySecurity, setBusySecurity] = useState(false)
  const [activePanel, setActivePanel] = useState<'profile' | 'security' | 'methods'>('profile')
  const [timezoneOpen, setTimezoneOpen] = useState(false)
  const [timezoneSearch, setTimezoneSearch] = useState('')

  const timezoneOptions = useMemo(getTimezoneOptions, [])
  const filteredTimezoneOptions = useMemo(() => {
    const query = timezoneSearch.trim().toLowerCase()
    const matches = query
      ? timezoneOptions.filter((option) => option.toLowerCase().includes(query))
      : timezoneOptions
    return matches.slice(0, 80)
  }, [timezoneOptions, timezoneSearch])
  const user = profileStatus?.user ?? null
  const canSaveProfile = isProfileComplete({ displayName, profileDesignation: designation, timezone })
  const hasCredentialAccount = accounts.some((account) => account.providerId === 'credential')
  const twoFactorEnabled = Boolean(user?.twoFactorEnabled)
  const visibleAvatarUrl = avatarPreview ?? avatarUrl ?? undefined
  const selectedBannerStyle = normalizeProfileBannerStyle(bannerStyle)
  const prefersReducedMotion = usePrefersReducedMotion()
  const profileTone = getAvatarTone(user?.email ?? displayName)
  const profileToneColor = getAvatarToneColor(profileTone)
  const bannerPrimary = bannerPalette?.primary ?? profileToneColor
  const bannerSecondary = bannerPalette?.secondary ?? profileToneColor
  const canManageTwoFactor = Boolean(session.data)
  const canResetStepUpGracePeriod = Boolean(session.data || devAuthBypass.enabled)
  const showSecurityActionBar = Boolean(
    (!twoFactorEnabled && canManageTwoFactor && !setupQrUrl) ||
      (twoFactorEnabled && (canManageTwoFactor || canResetStepUpGracePeriod)),
  )

  useEffect(() => {
    if (session.isPending && !devAuthBypass.enabled) return
    if (!session.data && !devAuthBypass.enabled) {
      window.location.href = '/sign-in'
      return
    }

    const sync = devAuthBypass.enabled ? syncDevUser : ensureCurrentUser
    void sync({}).then((id) => {
      if (id) setTrackUserId(id)
    })
  }, [devAuthBypass.enabled, ensureCurrentUser, session.data, session.isPending, syncDevUser])

  useEffect(() => {
    if (!user || hydratedUserId === user._id) return
    setDisplayName(user.displayName ?? '')
    setDesignation(user.profileDesignation ?? '')
    setBio(user.profileBio ?? '')
    setBannerStyle(normalizeProfileBannerStyle(user.profileBannerStyle))
    setTimezone(user.timezone ?? getBrowserTimezone())
    setHydratedUserId(user._id)
  }, [hydratedUserId, user])

  useEffect(() => {
    if (!session.data) return
    const client = authClient as AuthClientWithAccountMethods
    void client.listAccounts().then((result) => {
      if (!result.error && result.data) setAccounts(result.data)
    })
  }, [session.data])

  useEffect(() => {
    if (!visibleAvatarUrl || typeof window === 'undefined') {
      setBannerPalette(null)
      return
    }

    let cancelled = false
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => {
      if (cancelled) return
      const palette = getImagePalette(image)
      setBannerPalette(palette)
    }
    image.onerror = () => {
      if (!cancelled) setBannerPalette(null)
    }
    image.src = visibleAvatarUrl
    return () => {
      cancelled = true
    }
  }, [visibleAvatarUrl])

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!trackUserId) return
    if (!canSaveProfile) {
      setProfileMessage(t('profile.validation'))
      return
    }

    setBusyProfile(true)
    setProfileMessage('')
    try {
      await updateProfile({
        userId: trackUserId,
        displayName,
        profileDesignation: designation,
        profileBannerStyle: selectedBannerStyle,
        profileBio: bio || undefined,
        timezone,
      })
      setProfileMessage(t('profile.saved'))
      if (mode === 'onboarding') {
        const next = new URLSearchParams(window.location.search).get('next') || '/workspace'
        window.location.href = next.startsWith('/') ? next : '/workspace'
      }
    } catch {
      setProfileMessage(t('profile.saveFailed'))
    } finally {
      setBusyProfile(false)
    }
  }

  async function uploadAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    if (!file || !trackUserId) return
    setAvatarMessage('')

    if (!allowedAvatarTypes.has(file.type)) {
      setAvatarMessage(t('profile.avatar.invalidType'))
      return
    }
    if (file.size > maxAvatarBytes) {
      setAvatarMessage(t('profile.avatar.tooLarge'))
      return
    }

    const previewUrl = URL.createObjectURL(file)
    setAvatarPreview(previewUrl)
    try {
      const uploadUrl = await generateAvatarUploadUrl({ userId: trackUserId })
      const response = await fetch(uploadUrl, {
        body: file,
        headers: { 'Content-Type': file.type },
        method: 'POST',
      })
      if (!response.ok) throw new Error('avatar_upload_failed')
      const { storageId } = await response.json() as { storageId: Id<'_storage'> }
      await setAvatar({ userId: trackUserId, avatarStorageId: storageId })
      setAvatarMessage(t('profile.avatar.saved'))
    } catch {
      setAvatarMessage(t('profile.avatar.uploadFailed'))
      setAvatarPreview(null)
    }
  }

  async function startTwoFactorSetup() {
    setBusySecurity(true)
    setSecurityMessage('')
    try {
      const client = authClient as AuthClientWithTwoFactorMethods
      const result = await client.twoFactor.enable({
        issuer: 'Track',
        password: accountPassword || undefined,
      })
      if (result.error || !result.data) {
        setSecurityMessage(t('security.messages.setupFailed'))
        return
      }
      const qrDataUrl = await toDataURL(result.data.totpURI, {
        margin: 1,
        scale: 5,
      })
      setSetupQrUrl(qrDataUrl)
      setSetupBackupCodes(result.data.backupCodes)
      setBackupCodesVisible(false)
      setSecurityMessage(t('security.messages.setupInstructions'))
    } catch (error) {
      setSecurityMessage(getSecurityMessage(error, t('security.messages.setupFailed'), t('security.messages.syncFailed')))
    } finally {
      setBusySecurity(false)
    }
  }

  async function verifyTwoFactorSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!trackUserId) return
    setBusySecurity(true)
    setSecurityMessage('')
    try {
      const client = authClient as AuthClientWithTwoFactorMethods
      const result = await client.twoFactor.verifyTotp({ code: setupCode })
      if (result.error) {
        setSecurityMessage(t('security.messages.invalidCode'))
        return
      }
      await setTwoFactorEnabled({ userId: trackUserId, enabled: true })
      setSetupCode('')
      setSetupQrUrl('')
      setSecurityMessage(t('security.messages.enabled'))
    } catch (error) {
      setSecurityMessage(getSecurityMessage(error, t('security.messages.verifyFailed'), t('security.messages.syncFailed')))
    } finally {
      setBusySecurity(false)
    }
  }

  async function regenerateBackupCodes() {
    setBusySecurity(true)
    setSecurityMessage('')
    try {
      const client = authClient as AuthClientWithTwoFactorMethods
      const result = await client.twoFactor.generateBackupCodes({
        password: accountPassword || undefined,
      })
      if (result.error || !result.data) {
        setSecurityMessage(t('security.messages.codesFailed'))
        return
      }
      setSetupBackupCodes(result.data.backupCodes)
      setBackupCodesVisible(true)
      setSecurityMessage(t('security.messages.codesGenerated'))
    } catch (error) {
      setSecurityMessage(getSecurityMessage(error, t('security.messages.codesFailed'), t('security.messages.syncFailed')))
    } finally {
      setBusySecurity(false)
    }
  }

  async function disableTwoFactor() {
    if (!trackUserId) return
    setBusySecurity(true)
    setSecurityMessage('')
    try {
      const client = authClient as AuthClientWithTwoFactorMethods
      const result = await client.twoFactor.disable({ password: accountPassword || undefined })
      if (result.error) {
        setSecurityMessage(t('security.messages.disableFailed'))
        return
      }
      await setTwoFactorEnabled({ userId: trackUserId, enabled: false })
      setSecurityMessage(t('security.messages.disabled'))
    } catch (error) {
      setSecurityMessage(getSecurityMessage(error, t('security.messages.disableFailed'), t('security.messages.syncFailed')))
    } finally {
      setBusySecurity(false)
    }
  }

  async function resetTwoFactorGracePeriod() {
    if (!trackUserId) return
    setBusySecurity(true)
    setSecurityMessage('')
    try {
      const result = await resetStepUps({ userId: trackUserId })
      setSecurityMessage(
        result.removed
          ? t('security.messages.graceReset')
          : t('security.messages.noGracePeriod'),
      )
    } catch (error) {
      setSecurityMessage(getSecurityMessage(error, t('security.messages.resetFailed'), t('security.messages.syncFailed')))
    } finally {
      setBusySecurity(false)
    }
  }

  if ((session.isPending && !devAuthBypass.enabled) || !trackUserId || profileStatus === undefined) {
    return <TrackLoader label={t('loading')} />
  }

  return (
    <main className={mode === 'onboarding' ? 'track-profile-page onboarding' : 'track-profile-page'}>
      <section className="track-profile-shell">
        <aside className="track-profile-sidebar" aria-label={t('sidebar.ariaLabel')}>
          <PublicLocaleControl className="mb-6" />
          {mode === 'settings' ? (
            <a className="track-profile-back-link" href="/workspace">
              <ArrowLeft size={14} />
              <span>{t('sidebar.backToWorkspace')}</span>
            </a>
          ) : null}
          <div>
            <h1>{mode === 'onboarding' ? t('sidebar.onboardingTitle') : t('sidebar.settingsTitle')}</h1>
            <p>
              {mode === 'onboarding'
                ? t('sidebar.onboardingDescription')
                : t('sidebar.settingsDescription')}
            </p>
          </div>
          {mode === 'settings' ? (
            <nav className="track-profile-tabs">
              <Button className={activePanel === 'profile' ? 'active' : ''} onClick={() => setActivePanel('profile')} type="button">
                <UserRound size={15} /> {t('tabs.profile')}
              </Button>
              <Button className={activePanel === 'security' ? 'active' : ''} onClick={() => setActivePanel('security')} type="button">
                <ShieldCheck size={15} /> {t('tabs.security')}
              </Button>
              <Button className={activePanel === 'methods' ? 'active' : ''} onClick={() => setActivePanel('methods')} type="button">
                <KeyRound size={15} /> {t('tabs.methods')}
              </Button>
            </nav>
          ) : null}
        </aside>

        <div className="track-profile-content">
          {(mode === 'onboarding' || activePanel === 'profile') ? (
            <section className="track-profile-section">
              <div className="track-profile-section-header">
                <div>
                  <h2>{t('profile.sectionTitle')}</h2>
                </div>
              </div>

              <div className="track-profile-avatar-row">
                <Avatar className="track-profile-avatar">
                  <AvatarImage src={visibleAvatarUrl} />
                  <AvatarFallback>{getInitials(displayName || user?.email || t('methods.currentAccount'))}</AvatarFallback>
                </Avatar>
                <label className="track-profile-avatar-upload">
                  <Camera size={15} />
                  <span>{t('profile.uploadAvatar')}</span>
                  <input accept="image/png,image/jpeg,image/webp" onChange={(event) => void uploadAvatar(event)} type="file" />
                </label>
                {avatarMessage ? <p>{avatarMessage}</p> : null}
              </div>

              <form className="track-profile-form" onSubmit={(event) => void saveProfile(event)}>
                <label>
                  <span>{t('profile.fields.displayName')}</span>
                  <span className="track-profile-input-shell">
                    <UserRound size={18} />
                    <Input dir="auto" value={displayName} onChange={(event) => setDisplayName(event.currentTarget.value)} />
                  </span>
                </label>
                <label>
                  <span>{t('profile.fields.designation')}</span>
                  <span className="track-profile-input-shell">
                    <PenLine size={18} />
                    <Input
                      dir="auto"
                      maxLength={60}
                      value={designation}
                      onChange={(event) => setDesignation(event.currentTarget.value)}
                    />
                  </span>
                  <small>{t('profile.counts.designation', { count: designation.length })}</small>
                </label>
                <label>
                  <span>{t('profile.fields.timezone')}</span>
                  <div className="track-timezone-picker">
                    <button
                      aria-expanded={timezoneOpen}
                      className="track-timezone-trigger"
                      onClick={() => {
                        setTimezoneOpen((open) => !open)
                        setTimezoneSearch('')
                      }}
                      type="button"
                    >
                      <span dir="ltr">{timezone}</span>
                      <ChevronDown size={15} />
                    </button>
                    {timezoneOpen ? (
                      <div className="track-timezone-menu">
                        <Input
                          autoFocus
                          onChange={(event) => setTimezoneSearch(event.currentTarget.value)}
                          dir="ltr"
                          placeholder={t('profile.fields.timezoneSearch')}
                          value={timezoneSearch}
                        />
                        <div className="track-timezone-options">
                          {filteredTimezoneOptions.map((option) => (
                            <button
                              className={option === timezone ? 'active' : ''}
                              key={option}
                              onClick={() => {
                                setTimezone(option)
                                setTimezoneOpen(false)
                                setTimezoneSearch('')
                              }}
                              type="button"
                            >
                              <span dir="ltr">{option}</span>
                              <small>{getLocalTimeLabel(option, locale)}</small>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <small>{getLocalTimeLabel(timezone, locale)}</small>
                </label>
                <label>
                  <span>{t('profile.fields.bio')}</span>
                  <span className="track-profile-input-shell textarea">
                    <PenLine size={18} />
                    <Textarea
                      dir="auto"
                      maxLength={180}
                      rows={4}
                      value={bio}
                      onChange={(event) => setBio(event.currentTarget.value)}
                    />
                  </span>
                  <small>{t('profile.counts.bio', { count: bio.length })}</small>
                </label>
                <fieldset
                  className="track-profile-banner-fieldset"
                  style={{
                    '--track-avatar-card-primary': bannerPrimary,
                    '--track-avatar-card-secondary': bannerSecondary,
                  } as CSSProperties}
                >
                  <legend>{t('profile.fields.bannerStyle')}</legend>
                  <div className="track-profile-banner-grid">
                    {profileBannerStyles.map((style) => (
                      <button
                        aria-pressed={style.id === selectedBannerStyle}
                        className={style.id === selectedBannerStyle ? 'active' : ''}
                        key={style.id}
                        onClick={() => setBannerStyle(style.id)}
                        type="button"
                      >
                        <span className="track-profile-banner-option-preview">
                          <ProfileBannerBackground
                            reducedMotion={prefersReducedMotion}
                            style={style.id}
                          />
                        </span>
                        <span className="track-profile-banner-option-label">{t(`profile.bannerStyles.${style.id}`)}</span>
                      </button>
                    ))}
                  </div>
                </fieldset>
                <div className="track-profile-card-preview">
                  <span>{t('profile.preview')}</span>
                  <TeamMemberCard
                    avatarUrl={visibleAvatarUrl}
                    bannerStyle={selectedBannerStyle}
                    bio={bio || null}
                    detail={designation || null}
                    name={displayName || user?.email || t('methods.currentAccount')}
                    toneSource={user?.email ?? displayName}
                    timezone={timezone}
                  />
                </div>
                <div className="track-profile-actions">
                  <button className="track-button track-button-primary" disabled={busyProfile || !canSaveProfile} type="submit">
                    {mode === 'onboarding' ? t('profile.actions.saveAndEnter') : t('profile.actions.saveChanges')}
                  </button>
                  {profileMessage ? <p>{profileMessage}</p> : null}
                </div>
              </form>
            </section>
          ) : null}

          {mode === 'settings' && activePanel === 'security' ? (
            <section className="track-profile-section">
              <div className="track-profile-section-header track-security-header">
                <div>
                  <h2>{t('security.title')}</h2>
                  <p className="track-profile-muted">
                    {t('security.description')}
                  </p>
                </div>
                <span className={twoFactorEnabled ? 'track-profile-status' : 'track-profile-status muted'}>
                  <ShieldCheck size={14} /> {twoFactorEnabled ? t('security.statusOn') : t('security.statusOff')}
                </span>
              </div>

              {showSecurityActionBar ? (
                <div className="track-security-action-bar">
                  {!twoFactorEnabled && canManageTwoFactor && !setupQrUrl ? (
                    <Button className="track-button track-button-primary" disabled={busySecurity} onClick={() => void startTwoFactorSetup()} type="button">
                      <QrCode size={15} /> {t('security.actions.setup')}
                    </Button>
                  ) : null}
                  {twoFactorEnabled && canManageTwoFactor ? (
                    <Button className="track-button" disabled={busySecurity} onClick={() => void regenerateBackupCodes()} type="button">
                      {t('security.actions.generateBackupCodes')}
                    </Button>
                  ) : null}
                  {twoFactorEnabled && canResetStepUpGracePeriod ? (
                    <Button className="track-button" disabled={busySecurity} onClick={() => void resetTwoFactorGracePeriod()} type="button">
                      {t('security.actions.resetGracePeriod')}
                    </Button>
                  ) : null}
                  {twoFactorEnabled && canManageTwoFactor ? (
                    <Button className="track-button track-button-danger" disabled={busySecurity} onClick={() => void disableTwoFactor()} type="button">
                      {t('security.actions.turnOff')}
                    </Button>
                  ) : null}
                </div>
              ) : null}

              <div className="track-security-summary">
                <div>
                  <span><Smartphone size={16} /></span>
                  <strong>{t('security.summary.authenticator')}</strong>
                  <small>{twoFactorEnabled ? t('security.summary.authenticatorRequired') : t('security.summary.authenticatorNotConfigured')}</small>
                </div>
                <div>
                  <span><KeyRound size={16} /></span>
                  <strong>{t('security.summary.backupCodes')}</strong>
                  <small>{setupBackupCodes.length ? t('security.summary.backupCodesAvailable') : t('security.summary.backupCodesGenerate')}</small>
                </div>
                <div>
                  <span><Clock3 size={16} /></span>
                  <strong>{t('security.summary.trustedDevice')}</strong>
                  <small>{t('security.summary.trustedDeviceWindow')}</small>
                </div>
              </div>

              {!canManageTwoFactor ? (
                <div className="track-security-note">
                  {t('security.signInRequired')}
                </div>
              ) : null}

              {hasCredentialAccount ? (
                <label className="track-profile-password">
                  <span>{t('security.accountPassword')}</span>
                  <Input
                    autoComplete="current-password"
                    onChange={(event) => setAccountPassword(event.currentTarget.value)}
                    placeholder={t('security.accountPasswordPlaceholder')}
                    type="password"
                    value={accountPassword}
                  />
                </label>
              ) : null}

              {!twoFactorEnabled && canManageTwoFactor ? (
                <div className="track-profile-security-box">
                  {!setupQrUrl ? (
                    <p className="track-profile-muted">{t('security.setupHint')}</p>
                  ) : (
                    <>
                      <img alt={t('security.qrAlt')} className="track-profile-qr" src={setupQrUrl} />
                      <form className="track-profile-inline-form" onSubmit={(event) => void verifyTwoFactorSetup(event)}>
                        <Input
                          autoComplete="one-time-code"
                          inputMode="numeric"
                          onChange={(event) => setSetupCode(event.currentTarget.value)}
                          placeholder={t('security.codePlaceholder')}
                          value={setupCode}
                        />
                        <button className="track-button track-button-primary" disabled={busySecurity} type="submit">
                          {t('security.verifyCode')}
                        </button>
                      </form>
                    </>
                  )}
                </div>
              ) : null}

              {setupBackupCodes.length ? (
                <div className="track-profile-backup-codes">
                  <Button className="track-button" onClick={() => setBackupCodesVisible((visible) => !visible)} type="button">
                    {backupCodesVisible ? t('security.backupCodes.hide') : t('security.backupCodes.show')}
                  </Button>
                  {backupCodesVisible ? (
                    <div>
                      {setupBackupCodes.map((code) => <code key={code}>{code}</code>)}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {securityMessage ? <p className="track-profile-message">{securityMessage}</p> : null}
            </section>
          ) : null}

          {mode === 'settings' && activePanel === 'methods' ? (
            <section className="track-profile-section">
              <div className="track-profile-section-header">
                <div>
                  <h2>{t('methods.title')}</h2>
                </div>
              </div>
              <div className="track-profile-method-list">
                {accounts.length ? accounts.map((account) => (
                  <div key={`${account.providerId}-${account.id ?? account.providerId}`}>
                    <span className="track-profile-method-identity">
                      <span className="track-profile-method-icon">
                        {account.providerId === 'google'
                          ? <img alt="" src="/google-g.svg" />
                          : account.providerId === 'credential'
                            ? <Mail size={17} />
                            : <KeyRound size={17} />}
                      </span>
                      <strong dir="auto">{getProviderLabel(account.providerId, t('methods.emailPassword'))}</strong>
                    </span>
                    <span>{t('methods.connected')}</span>
                  </div>
                )) : (
                  <div>
                    <span className="track-profile-method-identity">
                      <span className="track-profile-method-icon"><Mail size={17} /></span>
                      <strong dir={user?.email ? 'ltr' : 'auto'}>{user?.email ?? t('methods.currentAccount')}</strong>
                    </span>
                    <span>{t('methods.connected')}</span>
                  </div>
                )}
              </div>
            </section>
          ) : null}
        </div>
      </section>
    </main>
  )
}
