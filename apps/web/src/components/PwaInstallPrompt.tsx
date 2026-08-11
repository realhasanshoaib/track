import { Download, Share2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'

const DISMISS_KEY = 'track:pwa-install-dismissed'

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function isIosSafari() {
  const userAgent = window.navigator.userAgent.toLowerCase()
  return /iphone|ipad|ipod/.test(userAgent) && /safari/.test(userAgent) && !/crios|fxios|edgios/.test(userAgent)
}

function wasDismissed() {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === 'true'
  } catch {
    return false
  }
}

function rememberDismissed() {
  try {
    window.localStorage.setItem(DISMISS_KEY, 'true')
  } catch {
    // Storage may be unavailable in privacy mode; the current tab still dismisses.
  }
}

export default function PwaInstallPrompt() {
  const { t } = useTranslation('shell')
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null)
  const [showIosPrompt, setShowIosPrompt] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const dismissedInStorage = wasDismissed()
    setDismissed(dismissedInStorage)

    if (dismissedInStorage || isStandalone()) return

    setShowIosPrompt(isIosSafari())

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallEvent(event as InstallPromptEvent)
      setShowIosPrompt(false)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
  }, [])

  if (dismissed || (!installEvent && !showIosPrompt)) return null

  const dismiss = () => {
    rememberDismissed()
    setDismissed(true)
  }

  const install = async () => {
    if (!installEvent) return
    await installEvent.prompt()
    const choice = await installEvent.userChoice
    if (choice.outcome === 'accepted') {
      rememberDismissed()
      setDismissed(true)
    }
    setInstallEvent(null)
  }

  return (
    <aside className="track-pwa-install" aria-label={t('pwa.ariaLabel')}>
      <div className="track-pwa-install-icon" aria-hidden="true">
        {showIosPrompt ? <Share2 size={17} /> : <Download size={17} />}
      </div>
      <div className="track-pwa-install-copy">
        <p>{t('pwa.title')}</p>
        {showIosPrompt ? <span>{t('pwa.iosDescription')}</span> : <span>{t('pwa.defaultDescription')}</span>}
      </div>
      {installEvent ? (
        <button className="track-pwa-install-action" type="button" onClick={install}>
          {t('pwa.install')}
        </button>
      ) : null}
      <button className="track-pwa-install-dismiss" type="button" onClick={dismiss} aria-label={t('pwa.dismiss')}>
        <X size={16} />
      </button>
    </aside>
  )
}
