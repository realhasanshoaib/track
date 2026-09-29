import { checkFlowRun, createDiagnosticCode, flowDefinitionSchema } from '@q9labsai/diagnostics'
import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import flowDefinitions from '../diagnostics/flows.json' with { type: 'json' }
import { api, internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import schema from './schema'

function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('Expected a value')
  return value
}

const modules = (import.meta as ImportMeta & {
  glob: (patterns: Array<string>) => Record<string, () => Promise<unknown>>
}).glob(['./**/*.{ts,js}', '!./**/*.test.{ts,js}'])
const pushFlow = flowDefinitionSchema.parse(flowDefinitions[0])

describe('durable mobile push lifecycle', () => {
  it('records a delivered run on its source trace and finds it by flow run', async () => {
    const t = convexTest(schema, modules)
    const { userId, installationId } = await seedDiagnosticIntentTarget(t, 'push-delivered-flow')
    const sourceUserId = await seedUser(t, 'push-source-flow')
    const traceId = createDiagnosticCode()
    await asUser(t, sourceUserId).mutation(api.diagnostics.ingest, { events: [{
      version: 1, traceId, spanId: '1234567890abcdef', eventId: 'source_event',
      occurredAt: Date.now(), source: 'browser', kind: 'event', name: 'browser.push_source',
      status: 'ok', level: 'info',
    }] })
    const intentId = await t.mutation(internal.pushDelivery.createIntent, {
      sourceKind: 'test', sourceId: 'delivered-flow', eventKind: 'test', recipientUserId: userId,
      installationId, idempotencyKey: 'delivered-flow', title: 'Track', body: 'Test',
      data: {}, soundEnabled: true, ttlMs: 60_000, deferDispatch: true, sourceTraceId: traceId,
    })
    const attemptNumber = await t.mutation(internal.pushDelivery.markSending, { intentId: required(intentId) })
    await t.mutation(internal.pushDelivery.recordDelivery, {
      intentId: required(intentId), attemptNumber: required(attemptNumber), provider: 'fcm', providerLatencyMs: 18,
    })
    const run = await t.query(internal.diagnostics.lookup.trace, { flowRun: String(intentId) })
    expect(run.events.map((item) => [item.attributes?.flow_step, item.attributes?.outcome]))
      .toEqual([
        ['queued', undefined], ['dispatch', 'sending'], ['sending', undefined],
        ['result', 'delivered'],
      ])
    expect(checkFlowRun(pushFlow, run.events, Date.now()).verdict).toBe('ok')
    const trace = await t.query(internal.diagnostics.lookup.trace, { traceId })
    expect(trace.events).toHaveLength(5)
    expect(await t.run(async (ctx) => ctx.db.query('diagnosticEvents')
      .withIndex('by_flow_run', (q) => q.eq('flowRun', String(intentId))).first()))
      .toMatchObject({ subjectId: String(sourceUserId) })
    expect(await t.query(internal.diagnostics.lookup.trace, { flowRun: 'unknown-run' }))
      .toEqual({ events: [] })
  })

  it('records retry and later expiry in the same run', async () => {
    const t = convexTest(schema, modules)
    const { userId, installationId } = await seedDiagnosticIntentTarget(t, 'push-expired-flow')
    const intentId = await t.mutation(internal.pushDelivery.createIntent, {
      sourceKind: 'test', sourceId: 'expired-flow', eventKind: 'test', recipientUserId: userId,
      installationId, idempotencyKey: 'expired-flow', title: 'Track', body: 'Test',
      data: {}, soundEnabled: true, ttlMs: 30_000, deferDispatch: true,
    })
    const attemptNumber = await t.mutation(internal.pushDelivery.markSending, { intentId: required(intentId) })
    await t.mutation(internal.pushDelivery.recordFailure, {
      intentId: required(intentId), attemptNumber: required(attemptNumber), category: 'provider_unavailable',
      permanent: false, providerLatencyMs: 1,
    })
    await t.run(async (ctx) => ctx.db.patch(required(intentId), { expiresAt: Date.now() - 1 }))
    expect(await t.mutation(internal.pushDelivery.markSending, { intentId: required(intentId) })).toBeNull()
    const run = await t.query(internal.diagnostics.lookup.trace, { flowRun: String(intentId) })
    expect(run.events.map((item) => [item.attributes?.flow_step, item.attributes?.outcome]))
      .toEqual([
        ['queued', undefined], ['dispatch', 'sending'], ['sending', undefined],
        ['result', 'retrying'],
        ['result', 'expired'], ['settled', 'expired'],
      ])
    const checked = checkFlowRun(pushFlow, run.events, Date.now())
    expect(checked.verdict).toBe('ok')
    expect(checked.steps.find((step) => step.id === 'result')?.event?.attributes?.outcome)
      .toBe('retrying')
    expect(checked.steps.find((step) => step.id === 'settled')?.event?.attributes?.outcome)
      .toBe('expired')
    expect(await t.run(async (ctx) => ctx.db.get(required(intentId)))).toMatchObject({ status: 'expired' })
  })

  it('models cancellation and expiry before a send attempt without a failed flow', async () => {
    const t = convexTest(schema, modules)
    const { userId, installationId } = await seedDiagnosticIntentTarget(t, 'push-pre-send-flow')
    for (const outcome of ['canceled', 'expired'] as const) {
      const intentId = await t.mutation(internal.pushDelivery.createIntent, {
        sourceKind: 'test', sourceId: outcome, eventKind: 'test', recipientUserId: userId,
        installationId, idempotencyKey: `pre-send-${outcome}`, title: 'Track', body: 'Test',
        data: {}, soundEnabled: true, ttlMs: 30_000, deferDispatch: true,
      })
      if (outcome === 'canceled') {
        await t.mutation(internal.pushDelivery.cancelIntent, { intentId: required(intentId), reason: 'eligibility_changed' })
      } else {
        await t.run(async (ctx) => ctx.db.patch(required(intentId), { expiresAt: Date.now() - 1 }))
        expect(await t.mutation(internal.pushDelivery.markSending, { intentId: required(intentId) })).toBeNull()
      }
      const run = await t.query(internal.diagnostics.lookup.trace, { flowRun: String(intentId) })
      expect(run.events.map((item) => [item.attributes?.flow_step, item.attributes?.outcome]))
        .toEqual([['queued', undefined], ['dispatch', outcome]])
      const checked = checkFlowRun(pushFlow, run.events, Date.now())
      expect(checked.verdict).toBe('ok')
      expect(checked.steps.find((step) => step.id === 'sending')?.status).toBe('not_observable')
    }
  })

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
    expect(await t.run(async (ctx) => ctx.db.query('diagnosticEvents').collect())).toEqual([])
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
      data: { schemaVersion: '1', url: '/projects' }, soundEnabled: true, ttlMs: 60_000,
    }
    const first = await t.mutation(internal.pushDelivery.createIntent, args)
    expect(await t.mutation(internal.pushDelivery.createIntent, args)).toBe(first)
    expect(await t.run(async (ctx) => ctx.db.query('pushDeliveryIntents').collect())).toHaveLength(1)
    const attemptNumber = await t.mutation(internal.pushDelivery.markSending, { intentId: required(first) })
    await t.mutation(internal.pushDelivery.recordFailure, {
      intentId: required(first), attemptNumber: required(attemptNumber), category: 'rate_limited',
      permanent: false, providerLatencyMs: 20,
    })
    expect(await t.run(async (ctx) => ctx.db.get(required(first)))).toMatchObject({
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
      const directAttempt = await t.mutation(internal.pushDelivery.markSending, { intentId: required(intentId) })
      await t.mutation(internal.pushDelivery.recordDelivery, {
        intentId: required(intentId), attemptNumber: required(directAttempt), provider: 'fcm',
        providerMessageId: 'projects/track/messages/provider-id', providerLatencyMs: 18,
      })
      expect(await t.run(async (ctx) => ctx.db.get(required(intentId)))).toMatchObject({
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
        data: { schemaVersion: '1', url: '/projects' }, soundEnabled: true,
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

async function seedDiagnosticIntentTarget(t: TestBackend, subject: string) {
  const userId = await seedUser(t, subject)
  const now = Date.now()
  const installationId = await t.run(async (ctx) => ctx.db.insert('pushInstallations', {
    installationId: `${subject}-installation`, userId, platform: 'ios',
    environment: 'development', nativePushToken: `${subject}-token`, enabled: true,
    permissionState: 'granted', lastSeenAt: now, createdAt: now, updatedAt: now,
  }))
  return { userId, installationId }
}

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
