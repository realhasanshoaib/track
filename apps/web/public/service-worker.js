const CACHE_NAME = 'track-shell-v4'
const SHELL_ASSETS = [
  '/manifest.json',
  '/favicon.ico',
  '/favicon.svg',
  '/apple-touch-icon.png',
  '/logo192.png',
  '/logo512.png',
]
const SHELL_ASSET_PATHS = new Set(SHELL_ASSETS)

function isCacheableShellRequest(request) {
  if (request.method !== 'GET' || request.mode === 'navigate') return false
  const url = new URL(request.url)
  return url.origin === self.location.origin && url.search === '' && SHELL_ASSET_PATHS.has(url.pathname)
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    event.waitUntil(self.skipWaiting())
    return
  }
  if (event.data?.type === 'CLAIM_CLIENTS') {
    event.waitUntil(self.clients.claim())
  }
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (!isCacheableShellRequest(request)) return

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (!response.ok) return response
        return caches.open(CACHE_NAME)
          .then((cache) => cache.put(request, response.clone()))
          .then(() => response)
      })
      .catch(() => caches.match(request)),
  )
})

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data?.json() ?? {}
  } catch {
    payload = {
      body: event.data?.text() ?? '',
    }
  }

  const title = payload.title ?? 'Track'
  event.waitUntil(
    self.registration.showNotification(title, {
      badge: payload.badge ?? '/logo192.png',
      body: payload.body ?? '',
      data: { url: payload.url ?? '/workspace' },
      icon: payload.icon ?? '/logo192.png',
      renotify: true,
      requireInteraction: Boolean(payload.requireInteraction),
      tag: payload.tag ?? 'track-message',
      timestamp: payload.timestamp ?? Date.now(),
      vibrate: payload.vibrate ?? [80, 40, 80],
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url ?? '/workspace'
  const url = new URL(targetUrl, self.location.origin).href

  event.waitUntil(
    self.clients
      .matchAll({ includeUncontrolled: true, type: 'window' })
      .then((clients) => {
        const client = clients.find((item) => item.url === url || item.url.startsWith(self.location.origin))
        if (client) {
          client.focus()
          return client.navigate(url)
        }
        return self.clients.openWindow(url)
      }),
  )
})
