import { shouldNotifyForMessage } from '@track/shared'

const PUSH_SUBSCRIBE_TIMEOUT_MS = 45_000
type TrackPushPermissionState = 'denied' | 'granted' | 'prompt'
let lastPushPermissionState: TrackPushPermissionState | null = null
let activeSubscriptionFlow: { promise: Promise<PushSubscription>; publicKey: string } | null = null

export const notificationPermissionLabels = {
  default: 'Not enabled',
  denied: 'Blocked',
  granted: 'Enabled',
  unsupported: 'Unsupported',
} as const

export type WebNotificationPermission = keyof typeof notificationPermissionLabels

export function getNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  return Notification.permission
}

export async function requestNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  return await Notification.requestPermission()
}

function urlBase64ToUint8Array(value: string) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = `${value}${padding}`.replaceAll('-', '+').replaceAll('_', '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)))
}

function logWebPushDebug(event: string, details: Record<string, unknown> = {}) {
  console.info(`[Track push] ${event}`, {
    ...details,
    diagnostics: getWebPushDiagnostics(),
    timestamp: new Date().toISOString(),
  })
}

function logWebPushWarning(event: string, details: Record<string, unknown> = {}) {
  console.warn(`[Track push] ${event}`, {
    ...details,
    diagnostics: getWebPushDiagnostics(),
    timestamp: new Date().toISOString(),
  })
}

async function readManifestDebug() {
  try {
    const response = await fetch('/manifest.json', { cache: 'no-store' })
    const manifest = await response.json()
    return {
      gcmSenderId: typeof manifest.gcm_sender_id === 'string' ? manifest.gcm_sender_id : null,
      ok: response.ok,
      startUrl: typeof manifest.start_url === 'string' ? manifest.start_url : null,
      status: response.status,
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      gcmSenderId: null,
      ok: false,
      startUrl: null,
      status: null,
    }
  }
}

async function withTimeout<T>(label: string, promise: Promise<T>, timeoutMs = 8000, timeoutMessage?: string) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(timeoutMessage ?? `${label} timed out.`)), timeoutMs)
      }),
    ])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

async function waitForServiceWorkerController() {
  if (navigator.serviceWorker.controller) return

  await withTimeout(
    'Service worker control',
    new Promise<void>((resolve) => {
      const handleControllerChange = () => {
        navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange)
        resolve()
      }
      navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange)
    }),
    5000,
  )
}

export async function subscribeToWebPush(
  publicKey: string,
  options: { forceRefresh?: boolean; onStep?: (step: string) => void } = {},
) {
  if (activeSubscriptionFlow) {
    options.onStep?.('Waiting for active push subscription...')
    logWebPushDebug('joined active subscription flow', {
      forceRefresh: Boolean(options.forceRefresh),
      publicKeyChanged: activeSubscriptionFlow.publicKey !== publicKey,
    })
    return await activeSubscriptionFlow.promise
  }

  const promise = createWebPushSubscription(publicKey, options)
  activeSubscriptionFlow = { promise, publicKey }
  try {
    return await promise
  } finally {
    if (activeSubscriptionFlow?.promise === promise) {
      activeSubscriptionFlow = null
    }
  }
}

async function createWebPushSubscription(
  publicKey: string,
  options: { forceRefresh?: boolean; onStep?: (step: string) => void } = {},
) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('This browser does not support web push.')
  }

  logWebPushDebug('subscription flow started', {
    manifest: await readManifestDebug(),
    userAgent: navigator.userAgent,
  })

  options.onStep?.('Checking service worker...')
  let registration = await navigator.serviceWorker.getRegistration('/')
  logWebPushDebug('service worker registration lookup completed', {
    found: Boolean(registration),
    scope: registration?.scope ?? null,
    scriptURL: registration?.active?.scriptURL ?? registration?.waiting?.scriptURL ?? registration?.installing?.scriptURL ?? null,
    state: registration?.active?.state ?? registration?.waiting?.state ?? registration?.installing?.state ?? null,
  })
  if (!registration) {
    options.onStep?.('Registering service worker...')
    registration = await withTimeout(
      'Service worker registration',
      navigator.serviceWorker.register('/service-worker.js', { scope: '/' }),
    )
    logWebPushDebug('service worker registered', {
      scope: registration.scope,
      scriptURL: registration.active?.scriptURL ?? registration.waiting?.scriptURL ?? registration.installing?.scriptURL ?? null,
      state: registration.active?.state ?? registration.waiting?.state ?? registration.installing?.state ?? null,
    })
  }
  options.onStep?.('Waiting for service worker...')
  registration = await withTimeout('Service worker readiness', navigator.serviceWorker.ready)
  logWebPushDebug('service worker ready', {
    controller: Boolean(navigator.serviceWorker.controller),
    scope: registration.scope,
    scriptURL: registration.active?.scriptURL ?? null,
    state: registration.active?.state ?? null,
  })

  if (!navigator.serviceWorker.controller) {
    options.onStep?.('Claiming service worker...')
    registration.active?.postMessage({ type: 'CLAIM_CLIENTS' })
    await waitForServiceWorkerController()
    logWebPushDebug('service worker claimed current page')
  }

  options.onStep?.('Checking push subscription...')
  const existingSubscription = await withTimeout('Push subscription lookup', registration.pushManager.getSubscription())
  logWebPushDebug('existing push subscription checked', {
    hasSubscription: Boolean(existingSubscription),
    endpointPrefix: existingSubscription?.endpoint.slice(0, 80) ?? null,
    forceRefresh: Boolean(options.forceRefresh),
  })
  if (existingSubscription && !options.forceRefresh) return existingSubscription
  if (existingSubscription) {
    options.onStep?.('Refreshing push subscription...')
    await withTimeout('Push subscription refresh', existingSubscription.unsubscribe())
    logWebPushDebug('existing push subscription unsubscribed', {
      endpointPrefix: existingSubscription.endpoint.slice(0, 80),
    })
  }

  const applicationServerKey = urlBase64ToUint8Array(publicKey)
  logWebPushDebug('prepared application server key', {
    decodedBytes: applicationServerKey.byteLength,
  })
  if ('permissionState' in registration.pushManager) {
    options.onStep?.('Checking push permission...')
    const permissionState = await withTimeout(
      'Push permission check',
      registration.pushManager.permissionState({
        applicationServerKey,
        userVisibleOnly: true,
      }),
    )
    lastPushPermissionState = permissionState
    options.onStep?.(`Push permission: ${permissionState}`)
    logWebPushDebug('push permission state checked', {
      pushPermission: permissionState,
    })
    if (permissionState === 'denied') {
      throw new Error('Browser push permission is blocked for Track.')
    }
  }

  options.onStep?.('Creating push subscription...')
  logWebPushDebug('push subscription creation started', {
    timeoutMs: PUSH_SUBSCRIBE_TIMEOUT_MS,
  })
  try {
    const subscription = await withTimeout(
      'Push subscription creation',
      registration.pushManager.subscribe({
        applicationServerKey,
        userVisibleOnly: true,
      }),
      PUSH_SUBSCRIBE_TIMEOUT_MS,
      'The browser push service did not finish creating a subscription. Restart the browser or PWA, disable VPN/content blockers for Track, then try again.',
    )
    logWebPushDebug('push subscription creation succeeded', {
      endpointPrefix: subscription.endpoint.slice(0, 80),
      expirationTime: subscription.expirationTime ?? null,
    })
    return subscription
  } catch (error) {
    logWebPushWarning('push subscription creation failed', {
      errorName: error instanceof Error ? error.name : null,
      errorMessage: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

export async function getCurrentWebPushSubscription() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return null
  }
  const registration = await withTimeout(
    'Service worker lookup',
    navigator.serviceWorker.getRegistration('/'),
  )
  if (!registration) return null
  return await withTimeout('Push subscription lookup', registration.pushManager.getSubscription())
}

export async function unsubscribeFromWebPush(
  subscription: Pick<PushSubscription, 'endpoint' | 'unsubscribe'>,
) {
  const unsubscribed = await withTimeout(
    'Push subscription removal',
    subscription.unsubscribe(),
    8_000,
    'The browser did not finish disconnecting Track notifications.',
  )
  if (!unsubscribed) throw new Error('The browser did not remove the Track notification subscription.')
  logWebPushDebug('push subscription unsubscribed', {
    endpointPrefix: subscription.endpoint.slice(0, 80),
  })
}

export function getWebPushDiagnostics() {
  if (typeof window === 'undefined') return 'browser unavailable'
  const parts = [
    `permission=${getNotificationPermission()}`,
    `serviceWorker=${'serviceWorker' in navigator ? 'yes' : 'no'}`,
    `pushManager=${'PushManager' in window ? 'yes' : 'no'}`,
    `controller=${navigator.serviceWorker?.controller ? 'yes' : 'no'}`,
  ]
  if (lastPushPermissionState) parts.push(`pushPermission=${lastPushPermissionState}`)
  return parts.join(', ')
}

export function serializePushSubscription(subscription: PushSubscription) {
  const json = subscription.toJSON()
  if (!json.endpoint || !json.keys?.auth || !json.keys.p256dh) {
    throw new Error('Browser returned an incomplete push subscription.')
  }
  return {
    endpoint: json.endpoint,
    expirationTime: subscription.expirationTime ?? undefined,
    keys: {
      auth: json.keys.auth,
      p256dh: json.keys.p256dh,
    },
  }
}

export function shouldNotifyForIncomingMessage(input: {
  authorId: string
  currentUserId: string
  globalMode: 'all' | 'mentions' | 'none'
  groupMode: 'inherit' | 'all' | 'mentions' | 'none'
  mentions: Array<string>
}) {
  if (input.authorId === input.currentUserId) return false
  return shouldNotifyForMessage({
    globalMode: input.globalMode,
    groupMode: input.groupMode,
    mentioned: input.mentions.includes(input.currentUserId),
  })
}

export function getIncomingMessageNotificationBody(input: {
  body: string
  attachments: Array<{ attachment: { kind?: string } }>
}) {
  return input.body ||
    (input.attachments.some(({ attachment }) => attachment.kind === 'voice_note')
      ? 'Sent a voice note.'
      : input.attachments.length > 0
        ? 'Sent an attachment.'
        : 'New message.')
}

export async function showMessageNotification(input: {
  title: string
  body: string
  tag: string
  url: string
}) {
  if (getNotificationPermission() !== 'granted') return

  const options = {
    body: input.body,
    badge: '/logo192.png',
    data: { url: input.url },
    icon: '/logo192.png',
    tag: input.tag,
  }

  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.ready
    await registration.showNotification(input.title, options)
    return
  }

  new Notification(input.title, options)
}
