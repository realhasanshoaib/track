import { describe, expect, it } from 'vitest'

import {
  normalizeWebPushEndpoint,
  parseStoredWebPushSubscription,
  storedWebPushEndpoint,
} from './webPushSubscription'

const subscription = JSON.stringify({
  endpoint: 'https://fcm.googleapis.com/fcm/send/subscription',
  expirationTime: null,
  keys: { auth: 'auth-key', p256dh: 'p256dh-key' },
})

describe('stored web push subscriptions', () => {
  it('parses the explicit persisted subscription contract', () => {
    expect(parseStoredWebPushSubscription(subscription)).toEqual({
      endpoint: 'https://fcm.googleapis.com/fcm/send/subscription',
      expirationTime: null,
      keys: { auth: 'auth-key', p256dh: 'p256dh-key' },
    })
  })

  it('rejects malformed or partial subscriptions before delivery', () => {
    expect(() => parseStoredWebPushSubscription('{"endpoint":1}')).toThrow('invalid_web_push_subscription')
    expect(() => parseStoredWebPushSubscription('not-json')).toThrow('invalid_web_push_subscription')
  })

  it('extracts JSON endpoints while retaining legacy plain endpoints for ownership checks', () => {
    expect(storedWebPushEndpoint(subscription)).toBe('https://fcm.googleapis.com/fcm/send/subscription')
    expect(storedWebPushEndpoint('https://push.example.test/legacy')).toBe('https://push.example.test/legacy')
  })

  it('rejects endpoints outside recognized browser push services', () => {
    expect(() => parseStoredWebPushSubscription(JSON.stringify({
      endpoint: 'https://metadata.internal/latest',
      expirationTime: null,
      keys: { auth: 'auth-key', p256dh: 'p256dh-key' },
    }))).toThrow('invalid_web_push_subscription')
    expect(() => parseStoredWebPushSubscription(JSON.stringify({
      endpoint: 'http://fcm.googleapis.com/fcm/send/subscription',
      expirationTime: null,
      keys: { auth: 'auth-key', p256dh: 'p256dh-key' },
    }))).toThrow('invalid_web_push_subscription')
  })

  it('canonicalizes equivalent trusted endpoints before ownership checks', () => {
    expect(normalizeWebPushEndpoint('https://FCM.GOOGLEAPIS.COM/fcm/send/subscription')).toBe(
      'https://fcm.googleapis.com/fcm/send/subscription',
    )
  })
})
