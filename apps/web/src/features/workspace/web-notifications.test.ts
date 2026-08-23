import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('web push subscription', () => {
  it('explains browser push-service subscription timeouts', async () => {
    vi.useFakeTimers()
    const registration = {
      pushManager: {
        getSubscription: vi.fn().mockResolvedValue(null),
        permissionState: vi.fn().mockResolvedValue('granted'),
        subscribe: vi.fn(() => new Promise(() => undefined)),
      },
    }
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        controller: {},
        getRegistration: vi.fn().mockResolvedValue(registration),
        ready: Promise.resolve(registration),
      },
    })
    Object.defineProperty(window, 'PushManager', {
      configurable: true,
      value: class PushManager {},
    })

    const { subscribeToWebPush } = await import('./web-notifications')
    const promise = subscribeToWebPush('BJfhJ9zxJ-CjTvkJylrr-Eoxax__6OQfO3JD2Q4wRblwP-9USQDGQmcJA2jZdHfyOhvIF0trybuTzrup0C1qV-4')
    const assertion = expect(promise).rejects.toThrow('browser push service did not finish')
    await vi.advanceTimersByTimeAsync(45_000)
    await assertion
  })

  it('shares one active native push subscription attempt across callers', async () => {
    const subscription = {
      endpoint: 'https://push.example.test/subscription',
      expirationTime: null,
      toJSON: () => ({
        endpoint: 'https://push.example.test/subscription',
        keys: { auth: 'auth', p256dh: 'p256dh' },
      }),
    }
    let resolveSubscribe: (value: typeof subscription) => void = () => undefined
    const registration = {
      pushManager: {
        getSubscription: vi.fn().mockResolvedValue(null),
        permissionState: vi.fn().mockResolvedValue('granted'),
        subscribe: vi.fn(() => new Promise<typeof subscription>((resolve) => {
          resolveSubscribe = resolve
        })),
      },
    }
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        controller: {},
        getRegistration: vi.fn().mockResolvedValue(registration),
        ready: Promise.resolve(registration),
      },
    })
    Object.defineProperty(window, 'PushManager', {
      configurable: true,
      value: class PushManager {},
    })

    const { subscribeToWebPush } = await import('./web-notifications')
    const publicKey = 'BJfhJ9zxJ-CjTvkJylrr-Eoxax__6OQfO3JD2Q4wRblwP-9USQDGQmcJA2jZdHfyOhvIF0trybuTzrup0C1qV-4'
    const first = subscribeToWebPush(publicKey)
    await vi.waitFor(() => expect(registration.pushManager.subscribe).toHaveBeenCalledTimes(1))
    const second = subscribeToWebPush(publicKey)

    resolveSubscribe(subscription)
    await expect(first).resolves.toBe(subscription)
    await expect(second).resolves.toBe(subscription)
  })

  it('reports when the browser refuses to remove a push subscription', async () => {
    const { unsubscribeFromWebPush } = await import('./web-notifications')
    const subscription = {
      endpoint: 'https://push.example.test/subscription',
      unsubscribe: vi.fn().mockResolvedValue(false),
    } satisfies Pick<PushSubscription, 'endpoint' | 'unsubscribe'>

    await expect(unsubscribeFromWebPush(subscription))
      .rejects.toThrow('did not remove the Track notification subscription')
  })
})
