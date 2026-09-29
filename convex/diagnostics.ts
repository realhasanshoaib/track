import { diagnosticCodeSchema, diagnosticEventSchema } from '@q9labsai/diagnostics'
import { v } from 'convex/values'

import { internalMutation, internalQuery, mutation } from './_generated/server'
import { getOptionalAuthenticatedActor } from './lib/actorContext'
import { internal } from './_generated/api'

const DAY = 24 * 60 * 60 * 1000
const MAX_EVENTS_PER_DAY = 500
const MAX_REQUESTS_PER_DAY = 100

export const ingest = mutation({
  // Runtime schema validation below rejects extra identity and deployment fields.
  args: { events: v.array(v.any()) },
  handler: async (ctx, { events }) => {
    let actor
    try {
      actor = await getOptionalAuthenticatedActor(ctx)
    } catch (error) {
      if (error instanceof Error && error.message === 'actor_not_provisioned') {
        return { accepted: 0, rejected: 'actor_not_provisioned' as const }
      }
      throw error
    }
    if (!actor) return { accepted: 0, rejected: 'unauthenticated' as const }
    if (events.length < 1 || events.length > 20 || JSON.stringify(events).length > 42_000) {
      throw new Error('diagnostics_invalid_batch')
    }
    const now = Date.now()
    const parsed = events.map((raw) => {
      const result = diagnosticEventSchema.safeParse(raw)
      if (
        !result.success ||
        result.data.source !== 'browser' ||
        result.data.attributes?.flow !== undefined ||
        result.data.attributes?.flow_run !== undefined ||
        result.data.attributes?.flow_step !== undefined ||
        Math.abs(result.data.occurredAt - now) > 7 * DAY
      ) {
        throw new Error('diagnostics_invalid_event')
      }
      return result.data
    })
    const recent = await ctx.db
      .query('diagnosticIngestRequests')
      .withIndex('by_subject_received_at', (q) =>
        q.eq('subjectId', actor.authSubject).gte('receivedAt', now - DAY),
      )
      .take(MAX_REQUESTS_PER_DAY)
    if (
      recent.length >= MAX_REQUESTS_PER_DAY ||
      recent.reduce((sum, request) => sum + request.acceptedCount, 0) + parsed.length >
        MAX_EVENTS_PER_DAY
    ) {
      throw new Error('diagnostics_budget_exceeded')
    }
    let accepted = 0
    for (const event of parsed) {
      const traceOwner = await ctx.db
        .query('diagnosticEvents')
        .withIndex('by_trace_occurred_at', (q) => q.eq('traceId', event.traceId))
        .first()
      if (traceOwner && traceOwner.subjectId !== actor.authSubject)
        throw new Error('diagnostics_invalid_link')
      if (traceOwner && traceOwner.journeyTraceId !== event.journeyTraceId)
        throw new Error('diagnostics_invalid_link')
      if (event.journeyTraceId) {
        const journeyTraceId = event.journeyTraceId
        const journeyOwner = await ctx.db
          .query('diagnosticEvents')
          .withIndex('by_journey_occurred_at', (q) => q.eq('journeyTraceId', journeyTraceId))
          .first()
        if (journeyOwner && journeyOwner.subjectId !== actor.authSubject)
          throw new Error('diagnostics_invalid_link')
        const journeyTraceOwner = await ctx.db
          .query('diagnosticEvents')
          .withIndex('by_trace_occurred_at', (q) => q.eq('traceId', journeyTraceId))
          .first()
        if (journeyTraceOwner && journeyTraceOwner.subjectId !== actor.authSubject)
          throw new Error('diagnostics_invalid_link')
      }
      const duplicate = await ctx.db
        .query('diagnosticEvents')
        .withIndex('by_trace_event', (q) =>
          q.eq('traceId', event.traceId).eq('eventId', event.eventId),
        )
        .first()
      if (duplicate) continue
      await ctx.db.insert('diagnosticEvents', {
        event,
        traceId: event.traceId,
        eventId: event.eventId,
        journeyTraceId: event.journeyTraceId,
        flowRun: typeof event.attributes?.flow_run === 'string' ? event.attributes.flow_run : undefined,
        occurredAt: event.occurredAt,
        receivedAt: now,
        subjectId: actor.authSubject,
        sourceSurface: 'web',
      })
      accepted++
    }
    await ctx.db.insert('diagnosticIngestRequests', {
      subjectId: actor.authSubject,
      receivedAt: now,
      acceptedCount: accepted,
    })
    return { accepted }
  },
})

export const trace = internalQuery({
  args: { traceId: v.optional(v.string()), flowRun: v.optional(v.string()) },
  handler: async (ctx, { traceId, flowRun }) => {
    if ((traceId === undefined) === (flowRun === undefined))
      throw new Error('diagnostics_invalid_lookup')
    if (flowRun !== undefined) {
      if (!/^[a-zA-Z0-9_-]{1,96}$/.test(flowRun))
        throw new Error('diagnostics_invalid_flow_run')
      const rows = await ctx.db.query('diagnosticEvents')
        .withIndex('by_flow_run', (q) => q.eq('flowRun', flowRun))
        .take(2001)
      if (rows.length > 2000) console.warn('diagnostics.flow_run.truncated', flowRun)
      return { events: rows.slice(0, 2000).map((row) => row.event) }
    }
    if (traceId === undefined || !diagnosticCodeSchema.safeParse(traceId).success)
      throw new Error('diagnostics_invalid_code')
    const direct = await ctx.db
      .query('diagnosticEvents')
      .withIndex('by_trace_occurred_at', (q) => q.eq('traceId', traceId))
      .take(2001)
    if (!direct.length) return { events: [] }
    const subjectId = direct[0].subjectId
    const journeyIds = [
      ...new Set(direct.map((row) => row.journeyTraceId).filter((id) => id !== undefined)),
    ]
    const linked = await Promise.all(
      journeyIds.map((journeyTraceId) =>
        ctx.db
          .query('diagnosticEvents')
          .withIndex('by_journey_occurred_at', (q) => q.eq('journeyTraceId', journeyTraceId))
          .take(2001),
      ),
    )
    const unique = new Map(
      direct
        .concat(linked.flat())
        .filter(
          (row) =>
            row.subjectId === subjectId &&
            (row.traceId === traceId || row.traceId === row.journeyTraceId),
        )
        .map((row) => [row._id, row]),
    )
    // oxlint-disable-next-line unicorn/no-array-sort -- safe because this fresh array is owned here and the web target lacks ES2023 toSorted.
    const ordered = [...unique.values()].sort((a, b) => a.occurredAt - b.occurredAt)
    if (
      ordered.length > 2000 ||
      direct.length > 2000 ||
      linked.some((rows) => rows.length > 2000)
    ) {
      console.warn('diagnostics.trace.truncated', traceId)
    }
    return {
      events: ordered.slice(0, 2000).map((row) => row.event),
    }
  },
})

export const cleanupExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - 14 * DAY
    const expired = await ctx.db
      .query('diagnosticEvents')
      .withIndex('by_received_at', (q) => q.lt('receivedAt', cutoff))
      .take(500)
    for (const row of expired) await ctx.db.delete(row._id)
    const requests = await ctx.db
      .query('diagnosticIngestRequests')
      .withIndex('by_received_at', (q) => q.lt('receivedAt', Date.now() - DAY))
      .take(500)
    for (const row of requests) await ctx.db.delete(row._id)
    if (expired.length === 500 || requests.length === 500)
      await ctx.scheduler.runAfter(0, internal.diagnostics.cleanupExpired, {})
    return { deleted: expired.length }
  },
})
