import { z } from 'zod'

const trustedWebPushHosts = new Set(['fcm.googleapis.com'])
const trustedWebPushHostSuffixes = [
  '.notify.windows.com',
  '.push.apple.com',
  '.push.services.mozilla.com',
]

const webPushEndpoint = z.string().max(4096).superRefine((value, ctx) => {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    ctx.addIssue({ code: 'custom', message: 'invalid endpoint URL' })
    return
  }

  const trustedHost = trustedWebPushHosts.has(url.hostname) ||
    trustedWebPushHostSuffixes.some((suffix) => url.hostname.endsWith(suffix))
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash || !trustedHost) {
    ctx.addIssue({ code: 'custom', message: 'untrusted web push endpoint' })
  }
}).transform((value) => new URL(value).toString())

const webPushKey = z.string().min(1).max(512).regex(/^[A-Za-z0-9_-]+={0,2}$/)

const storedWebPushSubscription = z.object({
  endpoint: webPushEndpoint,
  expirationTime: z.number().finite().nonnegative().nullable(),
  keys: z.object({
    auth: webPushKey,
    p256dh: webPushKey,
  }).strict(),
}).strict()

export function serializeStoredWebPushSubscription(value: z.input<typeof storedWebPushSubscription>) {
  const result = storedWebPushSubscription.safeParse(value)
  if (!result.success) throw new Error('invalid_web_push_subscription')
  return JSON.stringify(result.data)
}

export function normalizeWebPushEndpoint(value: string) {
  const result = webPushEndpoint.safeParse(value)
  if (!result.success) throw new Error('invalid_web_push_subscription')
  return result.data
}

export function parseStoredWebPushSubscription(value: string) {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error('invalid_web_push_subscription')
  }

  const result = storedWebPushSubscription.safeParse(parsed)
  if (!result.success) throw new Error('invalid_web_push_subscription')
  return result.data
}

export function storedWebPushEndpoint(value: string) {
  try {
    return parseStoredWebPushSubscription(value).endpoint
  } catch {
    return value
  }
}
