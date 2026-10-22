import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { api, internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import schema from './schema'

const modules = (import.meta as ImportMeta & {
  glob: (patterns: Array<string>) => Record<string, () => Promise<unknown>>
}).glob(['./**/*.{ts,js}', '!./**/*.test.{ts,js}'])

describe('durable mobile push lifecycle', () => {
  it('keeps installation ownership and sign-out state isolated', async () => {
    const t = convexTest(schema, modules)
    const first = await seedUser(t, 'push-first')
    const second = await seedUser(t, 'push-second')
    const args = {
      installationId: 'installation-1', platform: 'ios' as const,
      environment: 'development' as const, permissionState: 'granted' as const,
      token: 'apns-installation-token-1',
    }
    await asUser(t, first).mutation(api.notifications.registerNativeInstallation, { ...args, userId: first })
    await asUser(t, second).mutation(api.notifications.registerNativeInstallation, { ...args, userId: second })

    expect(await asUser(t, first).mutation(api.notifications.detachNativeInstallation, {
      installationId: args.installationId,
    })).toBe(false)
    expect(await asUser(t, second).mutation(api.notifications.detachNativeInstallation, {
      installationId: args.installationId,
    })).toBe(true)
    const installation = await t.run(async (ctx) => ctx.db.query('pushInstallations')
      .withIndex('by_installation_id', (q) => q.eq('installationId', args.installationId)).unique())
    expect(installation).toMatchObject({ enabled: false, failureReason: 'signed_out' })
    expect(installation?.userId).toBeUndefined()
  })

  it('expires legacy provider receipts terminally', async () => {
    const t = convexTest(schema, modules)
    const userId = await seedUser(t, 'push-legacy-expiry')
    const now = Date.now()
    const installationId = await t.run(async (ctx) => ctx.db.insert('pushInstallations', {
      installationId: 'legacy-expiry-installation', userId, platform: 'ios',
      environment: 'development', expoPushToken: 'ExponentPushToken[legacy-expiry]',
      enabled: true, permissionState: 'granted', lastSeenAt: now,
      createdAt: now, updatedAt: now,
    }))
    const intentId = await t.run(async (ctx) => ctx.db.insert('pushDeliveryIntents', {
      sourceKind: 'test', sourceId: 'legacy-expiry', eventKind: 'test',
      recipientUserId: userId, installationId, idempotencyKey: 'legacy-expiry',
      title: 'Track', body: 'Legacy receipt', data: {}, soundEnabled: true,
      status: 'ticket_accepted', attemptCount: 1, acceptedAt: now - 30 * 60_000,
      expiresAt: now + 60_000, createdAt: now - 30 * 60_000, updatedAt: now - 30 * 60_000,
    }))
    await t.run(async (ctx) => ctx.db.insert('pushDeliveryAttempts', {
      intentId, attemptNumber: 1, status: 'ticket_accepted',
      providerTicketId: 'legacy-expo-ticket', resultCategory: 'accepted',
      providerLatencyMs: 12, createdAt: now - 30 * 60_000,
    }))
    expect(await t.mutation(internal.pushDelivery.expireLegacyProviderReceipts, {})).toBe(1)
    expect(await t.run(async (ctx) => ctx.db.get(intentId))).toMatchObject({
      body: '', status: 'expired', title: 'Track',
    })
    expect(await t.run(async (ctx) => ctx.db.query('pushDeliveryAttempts').first()))
      .toMatchObject({ resultCategory: 'legacy_receipt_expired', status: 'permanent_failure' })
  })

  it('converges duplicate scheduling, provider acceptance, and recovery', async () => {
    const t = convexTest(schema, modules)
    const userId = await seedUser(t, 'push-intent')
    const installationId = await t.run(async (ctx) => ctx.db.insert('pushInstallations', {
      installationId: 'intent-installation', userId, platform: 'ios', environment: 'development',
      nativePushToken: 'apns-intent-token', enabled: true, permissionState: 'granted',
      lastSeenAt: Date.now(), createdAt: Date.now(), updatedAt: Date.now(),
    }))
    const args = {
      sourceKind: 'test' as const, sourceId: 'test-source', eventKind: 'test', recipientUserId: userId,
      installationId, idempotencyKey: 'test-source:installation', title: 'Track', body: 'Test',
      data: { schemaVersion: '1', url: '/groups' }, soundEnabled: true, ttlMs: 60_000,
    }
    const first = await t.mutation(internal.pushDelivery.createIntent, args)
    expect(await t.mutation(internal.pushDelivery.createIntent, args)).toBe(first)
    expect(await t.run(async (ctx) => ctx.db.query('pushDeliveryIntents').collect())).toHaveLength(1)
    const attemptNumber = await t.mutation(internal.pushDelivery.markSending, { intentId: first! })
    await t.mutation(internal.pushDelivery.recordFailure, {
      intentId: first!, attemptNumber: attemptNumber!, category: 'rate_limited',
      permanent: false, providerLatencyMs: 20,
    })
    expect(await t.run(async (ctx) => ctx.db.get(first!))).toMatchObject({
      attemptCount: 1, status: 'retry_wait',
    })
    {
      const t = convexTest(schema, modules)
      const userId = await seedUser(t, 'push-direct-acceptance')
      const installationId = await t.run(async (ctx) => ctx.db.insert('pushInstallations', {
        installationId: 'direct-acceptance-installation', userId, platform: 'android',
        environment: 'production', nativePushToken: 'fcm-direct-acceptance-token',
        enabled: true, permissionState: 'granted', lastSeenAt: Date.now(),
        createdAt: Date.now(), updatedAt: Date.now(),
      }))
      const intentId = await t.mutation(internal.pushDelivery.createIntent, {
        sourceKind: 'test', sourceId: 'direct-acceptance', eventKind: 'test',
        recipientUserId: userId, installationId, idempotencyKey: 'direct-acceptance',
        title: 'Track', body: 'Direct provider test', data: { schemaVersion: '1' },
        soundEnabled: true, ttlMs: 60_000, deferDispatch: true,
      })
      const attemptNumber = await t.mutation(internal.pushDelivery.markSending, { intentId: intentId! })
      await t.mutation(internal.pushDelivery.recordDelivery, {
        intentId: intentId!, attemptNumber: attemptNumber!, provider: 'fcm',
        providerMessageId: 'projects/track/messages/provider-id', providerLatencyMs: 18,
      })
      expect(await t.run(async (ctx) => ctx.db.get(intentId!))).toMatchObject({
        body: '', status: 'delivered', terminalAt: expect.any(Number), title: 'Track',
      })
      expect(await t.run(async (ctx) => ctx.db.query('pushDeliveryAttempts').first()))
        .toMatchObject({
          attemptNumber: 1,
          providerTicketId: 'projects/track/messages/provider-id',
          resultCategory: 'fcm_accepted',
          status: 'delivered',
        })
    }
    {
      const t = convexTest(schema, modules)
      const userId = await seedUser(t, 'push-interrupted')
      const installationId = await t.run(async (ctx) => ctx.db.insert('pushInstallations', {
        installationId: 'interrupted-installation', userId, platform: 'ios', environment: 'development',
        nativePushToken: 'apns-interrupted-token', enabled: true, permissionState: 'granted',
        lastSeenAt: Date.now(), createdAt: Date.now(), updatedAt: Date.now(),
      }))
      const intentId = await t.run(async (ctx) => ctx.db.insert('pushDeliveryIntents', {
        sourceKind: 'test', sourceId: 'interrupted-source', eventKind: 'test', recipientUserId: userId,
        installationId, idempotencyKey: 'interrupted-source:installation', title: 'Track', body: 'Test',
        data: { schemaVersion: '1', url: '/groups' }, soundEnabled: true,
        status: 'sending', attemptCount: 1, expiresAt: Date.now() + 60_000,
        createdAt: Date.now() - 180_000, updatedAt: Date.now() - 180_000,
      }))
      expect(await t.mutation(internal.pushDelivery.recoverStaleSendingIntents, {})).toBe(1)
      expect(await t.run(async (ctx) => ctx.db.get(intentId))).toMatchObject({
        status: 'retry_wait', nextAttemptAt: expect.any(Number),
      })
      expect(await t.run(async (ctx) => ctx.db.query('pushDeliveryAttempts').first()))
        .toMatchObject({ attemptNumber: 1, resultCategory: 'interrupted', status: 'transient_failure' })
    }
  })

})

type TestBackend = ReturnType<typeof convexTest>

async function seedUser(t: TestBackend, subject: string) {
  return await t.run(async (ctx) => {
    const id = await ctx.db.insert('users', {
      googleSubject: subject, email: `${subject}@example.test`, displayName: subject,
      twoFactorEnabled: false, createdAt: Date.now(), updatedAt: Date.now(),
    })
    await ctx.db.patch(id, { authUserId: String(id) })
    return id
  })
}

function asUser(t: TestBackend, userId: Id<'users'>) {
  return t.withIdentity({ subject: String(userId) })
}
