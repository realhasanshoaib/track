import { convexTest } from 'convex-test'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { register as registerBetterAuth } from '@convex-dev/better-auth/test'

import { api, components } from './_generated/api'
import schema from './schema'
import { isDevAuthBypassEnabled } from './lib/devAuth'

const modules = (import.meta as ImportMeta & {
  glob: (patterns: Array<string>) => Record<string, () => Promise<unknown>>
}).glob(['./**/*.{ts,js}', '!./**/*.test.{ts,js}'])

const originalDevAuthBypass = process.env.DEV_AUTH_BYPASS
const originalSiteUrl = process.env.SITE_URL
const originalBetterAuthUrl = process.env.BETTER_AUTH_URL

function restoreEnvironmentVariable(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name]
    return
  }
  process.env[name] = value
}

function createTest() {
  const t = convexTest(schema, modules)
  registerBetterAuth(t)
  return t
}

describe('authenticated user bootstrap', () => {
  it('does not expose an email-matched user before its authenticated subject is bound', async () => {
    const t = createTest()
    const email = 'bootstrap-regression@track.test'
    const legacyUserId = await t.run(async (ctx) => await ctx.db.insert('users', {
      authUserId: 'old-fixture-subject', googleSubject: 'old-fixture-subject',
      email, normalizedEmail: email, displayName: 'Bootstrap Regression',
      twoFactorEnabled: false, createdAt: 1, updatedAt: 1,
    }))
    const authenticated = await t.run(async (ctx) => {
      const user = await ctx.runMutation(components.betterAuth.adapter.create, {
        input: { model: 'user', data: { name: 'Bootstrap Regression', email,
          emailVerified: false, createdAt: 1, updatedAt: 1 } },
      })
      const session = await ctx.runMutation(components.betterAuth.adapter.create, {
        input: { model: 'session', data: { userId: user._id,
          expiresAt: Date.now() + 60_000, token: 'bootstrap-test-session', createdAt: 1, updatedAt: 1 } },
      })
      return { subject: user._id, sessionId: session._id, email }
    })
    const actor = t.withIdentity(authenticated)
    await expect(actor.query(api.auth.getCurrentUser, {})).resolves.toBeNull()
    await expect(actor.mutation(api.auth.ensureCurrentUser, {})).resolves.toBe(legacyUserId)
    await expect(actor.query(api.auth.getCurrentUser, {})).resolves.toMatchObject({
      _id: legacyUserId, authUserId: authenticated.subject,
    })
    await expect(actor.query(api.mobile.listProjects, {
      userId: legacyUserId, personalOnly: true, paginationOpts: { cursor: null, numItems: 1 },
    })).resolves.toMatchObject({ page: [] })
    await expect(t.query(api.auth.getCurrentUser, {})).resolves.toBeNull()
  }, 15_000)
})

beforeEach(() => {
  delete process.env.DEV_AUTH_BYPASS
  delete process.env.SITE_URL
  delete process.env.BETTER_AUTH_URL
})

afterEach(() => {
  restoreEnvironmentVariable('DEV_AUTH_BYPASS', originalDevAuthBypass)
  restoreEnvironmentVariable('SITE_URL', originalSiteUrl)
  restoreEnvironmentVariable('BETTER_AUTH_URL', originalBetterAuthUrl)
})

describe('development auth bypass', () => {
  it('enables the bypass only when explicitly configured for loopback development', () => {
    expect(isDevAuthBypassEnabled({})).toBe(false)
    expect(isDevAuthBypassEnabled({ DEV_AUTH_BYPASS: '1' })).toBe(false)
    expect(isDevAuthBypassEnabled({
      DEV_AUTH_BYPASS: '1',
      SITE_URL: 'https://track.q9labs.ai',
    })).toBe(false)
    expect(isDevAuthBypassEnabled({
      DEV_AUTH_BYPASS: '1',
      SITE_URL: 'http://localhost:3000',
    })).toBe(true)
  })

  it('enforces the disabled bypass at the mutation boundary', async () => {
    const t = convexTest(schema, modules)

    await expect(t.mutation(api.auth.syncDevUser, {})).rejects.toThrow(
      'dev_auth_bypass_disabled',
    )
  }, 15_000)

  it('binds the demo identity and never substitutes it for another authenticated user', async () => {
    process.env.DEV_AUTH_BYPASS = '1'
    process.env.SITE_URL = 'http://localhost:3000'
    const t = createTest()
    const authenticated = t.withIdentity({
      subject: 'demo-auth-user',
      email: 'developer@track.local',
    })

    await expect(t.mutation(api.auth.syncDevUser, {})).rejects.toThrow(
      'dev_auth_identity_required',
    )
    const userId = await authenticated.mutation(api.auth.syncDevUser, {})

    await expect(authenticated.query(api.auth.getUser, { userId })).resolves.toMatchObject({
      _id: userId,
      authUserId: 'demo-auth-user',
      displayName: 'Track Developer',
      email: 'developer@track.local',
    })
    await expect(t.query(api.auth.getUser, { userId })).rejects.toThrow(
      'unauthenticated',
    )
    const demoUserId = await t.withIdentity({
      subject: 'demo-auth-user',
      email: 'developer@track.local',
    }).mutation(api.auth.syncDevUser, {})
    const realUserId = await t.run(async (ctx) => await ctx.db.insert('users', {
      googleSubject: 'real-user',
      authUserId: 'real-user',
      normalizedEmail: 'real-user@track.test',
      email: 'real-user@track.test',
      displayName: 'Real User',
      twoFactorEnabled: false,
      createdAt: 1,
      updatedAt: 1,
    }))
    const realAuthenticated = t.withIdentity({ subject: 'real-user' })

    await expect(realAuthenticated.query(api.auth.getUser, { userId: realUserId }))
      .resolves.toMatchObject({ _id: realUserId })
    await expect(realAuthenticated.query(api.auth.getUser, { userId: demoUserId }))
      .rejects.toThrow('actor_mismatch')

    await expect(t.withIdentity({
      subject: 'other-user',
      email: 'other-user@track.test',
      sessionId: 'missing-session',
    }).mutation(api.auth.syncDevUser, {})).rejects.toThrow(
      'dev_auth_identity_required',
    )
  }, 15_000)
})
