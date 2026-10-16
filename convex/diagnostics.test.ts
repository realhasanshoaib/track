import { createDiagnosticCode, sanitizeDiagnosticEvent } from '@q9labsai/diagnostics'
import redactionCorpus from '@q9labsai/diagnostics/fixtures/redaction-corpus.v1.json' with { type: 'json' }
import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { api, internal } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob(['./**/*.{ts,js}', '!./**/*.test.{ts,js}'])

async function fixture() {
  const t = convexTest(schema, modules)
  await t.run((ctx) =>
    ctx.db.insert('users', {
      googleSubject: 'diagnostic-user',
      authUserId: 'diagnostic-user',
      email: 'diagnostic-user@track.test',
      displayName: 'Diagnostic User',
      twoFactorEnabled: false,
      createdAt: 1,
      updatedAt: 1,
    }),
  )
  return { t, actor: t.withIdentity({ subject: 'diagnostic-user' }) }
}

function event(traceId: string, eventId = 'event_one') {
  return {
    version: 1,
    traceId,
    eventId,
    spanId: '1234567890abcdef',
    journeyTraceId: traceId,
    occurredAt: Date.now(),
    source: 'browser',
    kind: 'error',
    name: 'browser.route_failure',
    status: 'error',
    level: 'error',
  } as const
}

describe('diagnostics', () => {
  it('safely rejects signed-out ingestion and rejects forged identity and unsafe events', async () => {
    const { t, actor } = await fixture()
    const valid = event(createDiagnosticCode())
    expect(await t.mutation(api.diagnostics.ingest, { events: [valid] })).toEqual({
      accepted: 0,
      rejected: 'unauthenticated',
    })
    expect(await t.run((ctx) => ctx.db.query('diagnosticEvents').collect())).toEqual([])
    await expect(
      actor.mutation(api.diagnostics.ingest, { events: [{ ...valid, subjectId: 'forged' }] }),
    ).rejects.toThrow('diagnostics_invalid_event')
    await expect(
      actor.mutation(api.diagnostics.ingest, {
        events: [{ ...valid, safeMessage: 'Bearer secret' }],
      }),
    ).rejects.toThrow('diagnostics_invalid_event')
    const unsafe = {
      ...valid,
      attributes: { ...redactionCorpus.safe, ...redactionCorpus.forbidden },
    }
    expect(sanitizeDiagnosticEvent(unsafe).attributes).toEqual(redactionCorpus.safe)
    await expect(actor.mutation(api.diagnostics.ingest, { events: [unsafe] })).rejects.toThrow(
      'diagnostics_invalid_event',
    )
    await expect(actor.mutation(api.diagnostics.ingest, { events: [{
      ...valid, attributes: { flow: 'push.delivery', flow_run: 'forged-run', flow_step: 'queued' },
    }] })).rejects.toThrow('diagnostics_invalid_event')
  })

  it('safely rejects ingestion before an authenticated user is provisioned', async () => {
    const { t } = await fixture()
    const unprovisioned = t.withIdentity({ subject: 'new-user' })
    expect(
      await unprovisioned.mutation(api.diagnostics.ingest, {
        events: [event(createDiagnosticCode())],
      }),
    ).toEqual({ accepted: 0, rejected: 'actor_not_provisioned' })
    expect(await t.run((ctx) => ctx.db.query('diagnosticEvents').collect())).toEqual([])
  })

  it('deduplicates and returns ordered evidence, with empty evidence for unknown codes', async () => {
    const { t, actor } = await fixture()
    const traceId = createDiagnosticCode()
    const first = event(traceId)
    const later = { ...event(traceId, 'event_later'), occurredAt: first.occurredAt + 100 }
    expect(await actor.mutation(api.diagnostics.ingest, { events: [later, first] })).toEqual({
      accepted: 2,
    })
    expect(await actor.mutation(api.diagnostics.ingest, { events: [first] })).toEqual({
      accepted: 0,
    })
    const result = await t.query(internal.diagnostics.lookup.trace, { traceId })
    expect(result.events.map((item) => item.eventId)).toEqual(['event_one', 'event_later'])
    expect(
      await t.query(internal.diagnostics.lookup.trace, { traceId: createDiagnosticCode() }),
    ).toEqual({ events: [] })
  })

  it('rejects a journey link already owned by another subject', async () => {
    const { t, actor } = await fixture()
    const journey = createDiagnosticCode()
    await actor.mutation(api.diagnostics.ingest, { events: [event(journey)] })
    await expect(
      actor.mutation(api.diagnostics.ingest, {
        events: [
          {
            ...event(journey, 'changed_link'),
            journeyTraceId: createDiagnosticCode(),
          },
        ],
      }),
    ).rejects.toThrow('diagnostics_invalid_link')
    await t.run((ctx) =>
      ctx.db.insert('users', {
        googleSubject: 'other-user',
        authUserId: 'other-user',
        email: 'other@track.test',
        displayName: 'Other User',
        twoFactorEnabled: false,
        createdAt: 1,
        updatedAt: 1,
      }),
    )
    const other = t.withIdentity({ subject: 'other-user' })
    await expect(
      other.mutation(api.diagnostics.ingest, {
        events: [
          {
            ...event(createDiagnosticCode()),
            journeyTraceId: journey,
          },
        ],
      }),
    ).rejects.toThrow('diagnostics_invalid_link')
  })

  it('enforces batch and rolling request budgets', async () => {
    const { actor } = await fixture()
    const traceId = createDiagnosticCode()
    await expect(
      actor.mutation(api.diagnostics.ingest, {
        events: Array.from({ length: 21 }, (_, index) => event(traceId, `event_${index}`)),
      }),
    ).rejects.toThrow('diagnostics_invalid_batch')
    for (let index = 0; index < 100; index++) {
      await actor.mutation(api.diagnostics.ingest, { events: [event(traceId, `event_${index}`)] })
    }
    await expect(
      actor.mutation(api.diagnostics.ingest, { events: [event(traceId, 'one_more')] }),
    ).rejects.toThrow('diagnostics_budget_exceeded')
  })

  it('deletes only expired receipts', async () => {
    const { t, actor } = await fixture()
    const expiredCode = createDiagnosticCode()
    const liveCode = createDiagnosticCode()
    await actor.mutation(api.diagnostics.ingest, {
      events: [event(expiredCode), event(liveCode, 'live')],
    })
    await t.run(async (ctx) => {
      const row = await ctx.db
        .query('diagnosticEvents')
        .withIndex('by_trace_occurred_at', (q) => q.eq('traceId', expiredCode))
        .first()
      if (!row) throw new Error('missing fixture')
      await ctx.db.patch(row._id, { receivedAt: Date.now() - 15 * 24 * 60 * 60 * 1000 })
    })
    expect(await t.mutation(internal.diagnostics.cleanupExpired, {})).toEqual({ deleted: 1 })
    expect(await t.query(internal.diagnostics.lookup.trace, { traceId: expiredCode })).toEqual({
      events: [],
    })
    expect(
      (await t.query(internal.diagnostics.lookup.trace, { traceId: liveCode })).events,
    ).toHaveLength(1)
  })
})
