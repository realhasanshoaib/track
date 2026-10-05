import { v } from 'convex/values'
import { createClient, type GenericCtx } from '@convex-dev/better-auth'
import { convex, crossDomain } from '@convex-dev/better-auth/plugins'
import { expo } from '@better-auth/expo'
import { betterAuth } from 'better-auth/minimal'
import { twoFactor } from 'better-auth/plugins'
import type { GenericDatabaseReader, GenericDatabaseWriter } from 'convex/server'

import { components, internal } from './_generated/api'
import type { DataModel } from './_generated/dataModel'
import { mutation, query } from './_generated/server'
import { requireActionCtx } from '@convex-dev/better-auth/utils'
import authConfig from './auth.config'
import { assertActorMatches, requireAuthenticatedActor } from './lib/actorContext'
import { devAuthBypassUser, isDevAuthBypassEnabled } from './lib/devAuth'
import { cancelProjectSnapshotForSourceRemoval } from './lib/projectSnapshotLock'

const siteUrl = process.env.SITE_URL ?? process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'
const developmentOrigins = process.env.NODE_ENV === 'production'
  ? []
  : [process.env.DEV_WEB_ORIGIN]
const trustedOrigins = [
  siteUrl,
  ...developmentOrigins,
  'https://track.q9labs.ai',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'http://localhost:8081',
  'http://localhost:8082',
  'http://localhost:8083',
  'track://',
  'exp://',
  'https://appleid.apple.com',
].filter((origin): origin is string => Boolean(origin))
const stepUpFreshMs = 10 * 60 * 1000

export const authComponent = createClient<DataModel>(components.betterAuth)

type ReadCtx = GenericCtx<DataModel> & { db: GenericDatabaseReader<DataModel> }
type WriteCtx = GenericCtx<DataModel> & { db: GenericDatabaseWriter<DataModel> }

export const createAuth = (ctx: GenericCtx<DataModel>) => {
  return betterAuth({
    appName: 'Track',
    baseURL: siteUrl,
    trustedOrigins,
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      maxPasswordLength: 256,
      requireEmailVerification: false,
      sendResetPassword: async ({ user, url }) => {
        const actionCtx = requireActionCtx(ctx)
        await actionCtx.scheduler.runAfter(0, internal.authEmails.sendPasswordReset, {
          email: user.email,
          url,
        })
      },
    },
    user: {
      deleteUser: {
        enabled: true,
      },
    },
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID_WEB ?? '',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET_WEB ?? '',
      },
      apple: {
        clientId: process.env.APPLE_CLIENT_ID ?? '',
        clientSecret: process.env.APPLE_CLIENT_SECRET ?? '',
        appBundleIdentifier: process.env.APPLE_APP_BUNDLE_IDENTIFIER ?? process.env.APPLE_CLIENT_ID ?? '',
      },
    },
    plugins: [
      crossDomain({ siteUrl }),
      expo(),
      convex({ authConfig }),
      twoFactor({
        issuer: 'Track',
        allowPasswordless: true,
        twoFactorCookieMaxAge: 10 * 60,
        trustDeviceMaxAge: 30 * 24 * 60 * 60,
        backupCodeOptions: {
          amount: 10,
          length: 10,
          storeBackupCodes: 'encrypted',
        },
      }),
    ],
  })
}

export const getAuthUser = query({
  args: {},
  handler: async (ctx) => {
    return await authComponent.getAuthUser(ctx)
  },
})

async function getOptionalAuthUser(ctx: GenericCtx<DataModel>) {
  try {
    return await authComponent.getAuthUser(ctx)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('Unauthenticated')) {
      return null
    }
    throw error
  }
}

function getAuthUserDisplayName(authUser: {
  name?: string | null
  email?: string | null
}) {
  return authUser.name ?? authUser.email?.split('@')[0] ?? 'Track User'
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function isProfileComplete(user: {
  displayName?: string | null
}) {
  return Boolean(user.displayName?.trim())
}

async function assertCanManageTrackUser(ctx: WriteCtx, userId: string) {
  const authUser = await getOptionalAuthUser(ctx)
  if (!authUser) throw new Error('unauthenticated')

  const trackUser = await findTrackUserByAuth(ctx, authUser)
  if (!trackUser || trackUser._id !== userId) throw new Error('forbidden')

  return { authUser, trackUser }
}

async function findTrackUserByAuth(
  ctx: ReadCtx,
  authUser: { _id: string; email?: string | null },
) {
  const byAuthId = await ctx.db
    .query('users')
    .withIndex('by_auth_user_id', (q) => q.eq('authUserId', authUser._id))
    .unique()
  if (byAuthId) return byAuthId

  const byLegacyAuthId = await ctx.db
    .query('users')
    .withIndex('by_google_subject', (q) => q.eq('googleSubject', authUser._id))
    .unique()
  if (byLegacyAuthId) return byLegacyAuthId

  const normalizedEmail = normalizeEmail(authUser.email ?? '')
  if (!normalizedEmail) return null

  return await ctx.db
    .query('users')
    .withIndex('by_normalized_email', (q) => q.eq('normalizedEmail', normalizedEmail))
    .unique()
}

async function upsertTrackUserFromAuth(
  ctx: WriteCtx,
  authUser: {
    _id: string
    email?: string | null
    name?: string | null
    twoFactorEnabled?: boolean | null
  },
) {
  const now = Date.now()
  const normalizedEmail = normalizeEmail(authUser.email ?? '')
  const displayName = getAuthUserDisplayName(authUser)
  const existing = await findTrackUserByAuth(ctx, authUser)

  if (existing) {
    const patch: Partial<typeof existing> = {
      authUserId: authUser._id,
      normalizedEmail,
      googleSubject: existing.googleSubject || authUser._id,
      email: authUser.email ?? existing.email,
      displayName: existing.displayName?.trim() ? existing.displayName : displayName,
      updatedAt: now,
    }
    if (typeof authUser.twoFactorEnabled === 'boolean') {
      patch.twoFactorEnabled = authUser.twoFactorEnabled
    }
    await ctx.db.patch(existing._id, patch)
    return existing._id
  }

  return await ctx.db.insert('users', {
    googleSubject: authUser._id,
    authUserId: authUser._id,
    normalizedEmail,
    email: authUser.email ?? '',
    displayName,
    twoFactorEnabled: Boolean(authUser.twoFactorEnabled),
    createdAt: now,
    updatedAt: now,
  })
}

export const getEmailAuthHint = query({
  args: {
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.email)
    if (!email.includes('@')) return { status: 'invalid' as const }

    const authUser = await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: 'user',
      where: [{ field: 'email', value: email }],
      select: ['_id', 'email'],
    })

    if (!authUser?._id) return { status: 'new' as const }

    const accounts = await ctx.runQuery(components.betterAuth.adapter.findMany, {
      model: 'account',
      where: [{ field: 'userId', value: authUser._id }],
      select: ['providerId', 'password'],
      paginationOpts: { cursor: null, numItems: 20 },
    })
    const page = (Array.isArray(accounts?.page) ? accounts.page : []) as Array<{
      password?: string | null
      providerId?: string | null
    }>
    const hasCredential = page.some((account) => account.providerId === 'credential' && account.password)
    const hasGoogle = page.some((account) => account.providerId === 'google')

    if (hasCredential) return { status: 'credential' as const }
    if (hasGoogle) return { status: 'google_only' as const }
    return { status: 'existing_without_password' as const }
  },
})

export const ensureCurrentUser = mutation({
  args: {},
  handler: async (ctx) => {
    const authUser = await getOptionalAuthUser(ctx)
    if (!authUser) return null

    return await upsertTrackUserFromAuth(ctx, authUser)
  },
})

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const authUser = await getOptionalAuthUser(ctx)
    if (!authUser) return null

    return await findTrackUserByAuth(ctx, authUser)
  },
})

export const syncGoogleUser = mutation({
  args: {
    googleSubject: v.string(),
    email: v.string(),
    displayName: v.string(),
  },
  handler: async (ctx, args) => {
    const authUser = await getOptionalAuthUser(ctx)
    if (!authUser || authUser._id !== args.googleSubject || normalizeEmail(authUser.email ?? '') !== normalizeEmail(args.email)) {
      throw new Error('actor_mismatch')
    }
    return await upsertTrackUserFromAuth(ctx, {
      _id: authUser._id,
      email: authUser.email,
      name: authUser.name ?? args.displayName,
    })
  },
})

async function getDevAuthSubject(ctx: WriteCtx) {
  const identity = await ctx.auth.getUserIdentity()
  if (identity && normalizeEmail(identity.email ?? '') === devAuthBypassUser.email) {
    return identity.subject
  }

  const authUser = await authComponent.safeGetAuthUser(ctx)
  if (!authUser || normalizeEmail(authUser.email) !== devAuthBypassUser.email) {
    throw new Error('dev_auth_identity_required')
  }
  return authUser._id
}

export const syncDevUser = mutation({
  args: {},
  handler: async (ctx) => {
    if (!isDevAuthBypassEnabled()) {
      throw new Error('dev_auth_bypass_disabled')
    }
    const authUserId = await getDevAuthSubject(ctx)

    const now = Date.now()
    const existing = await ctx.db
      .query('users')
      .withIndex('by_google_subject', (q) =>
        q.eq('googleSubject', devAuthBypassUser.googleSubject),
      )
      .unique()

    if (existing) {
      await ctx.db.patch(existing._id, {
        authUserId,
        normalizedEmail: normalizeEmail(devAuthBypassUser.email),
        email: devAuthBypassUser.email,
        displayName: devAuthBypassUser.displayName,
        profileDesignation: existing.profileDesignation ?? devAuthBypassUser.profileDesignation,
        profileBannerStyle: existing.profileBannerStyle ?? devAuthBypassUser.profileBannerStyle,
        timezone: existing.timezone ?? devAuthBypassUser.timezone,
        profileCompletedAt: existing.profileCompletedAt ?? now,
        updatedAt: now,
      })
      return existing._id
    }

    return await ctx.db.insert('users', {
      googleSubject: devAuthBypassUser.googleSubject,
      authUserId,
      normalizedEmail: normalizeEmail(devAuthBypassUser.email),
      email: devAuthBypassUser.email,
      displayName: devAuthBypassUser.displayName,
      profileDesignation: devAuthBypassUser.profileDesignation,
      profileBannerStyle: devAuthBypassUser.profileBannerStyle,
      timezone: devAuthBypassUser.timezone,
      profileCompletedAt: now,
      twoFactorEnabled: false,
      createdAt: now,
      updatedAt: now,
    })
  },
})

export const getUser = query({
  args: {
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    assertActorMatches(actor, args.userId)
    return await ctx.db.get(args.userId)
  },
})

export const setTwoFactorEnabled = mutation({
  args: {
    userId: v.id('users'),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    await assertCanManageTrackUser(ctx, args.userId)
    await ctx.db.patch(args.userId, {
      twoFactorEnabled: args.enabled,
      updatedAt: Date.now(),
    })
  },
})

export const generateAvatarUploadUrl = mutation({
  args: {
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    await assertCanManageTrackUser(ctx, args.userId)
    return await ctx.storage.generateUploadUrl()
  },
})

export const setAvatar = mutation({
  args: {
    userId: v.id('users'),
    avatarStorageId: v.id('_storage'),
  },
  handler: async (ctx, args) => {
    await assertCanManageTrackUser(ctx, args.userId)
    await ctx.db.patch(args.userId, {
      avatarStorageId: args.avatarStorageId,
      updatedAt: Date.now(),
    })
  },
})

export const getAvatarUrl = query({
  args: {
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    await requireAuthenticatedActor(ctx)
    const user = await ctx.db.get(args.userId)
    if (!user?.avatarStorageId) return null
    return await ctx.storage.getUrl(user.avatarStorageId)
  },
})

export const getAvatarUrls = query({
  args: {
    userIds: v.array(v.id('users')),
  },
  handler: async (ctx, args) => {
    await requireAuthenticatedActor(ctx)
    const uniqueUserIds = Array.from(new Set(args.userIds))
    return await Promise.all(uniqueUserIds.map(async (userId) => {
      const user = await ctx.db.get(userId)
      return {
        userId,
        url: user?.avatarStorageId ? await ctx.storage.getUrl(user.avatarStorageId) : null,
      }
    }))
  },
})

export const updateProfile = mutation({
  args: {
    userId: v.id('users'),
    displayName: v.string(),
    profileDesignation: v.string(),
    profileBannerStyle: v.optional(v.string()),
    profileBio: v.optional(v.string()),
    timezone: v.string(),
  },
  handler: async (ctx, args) => {
    await assertCanManageTrackUser(ctx, args.userId)
    const displayName = args.displayName.trim()
    const profileDesignation = args.profileDesignation.trim()
    const profileBannerStyle = args.profileBannerStyle?.trim() || 'silk'
    const profileBio = args.profileBio?.trim()
    const timezone = args.timezone.trim()
    const validBannerStyles = new Set([
      'silk',
      'velvet-flow',
      'midnight-veil',
      'luminous-beams',
      'aurora-wash',
      'soft-aurora',
      'grain-haze',
      'signal-glitch',
      'grid-scan',
      'pearl-shift',
      'light-rays',
      'storm-flash',
      'crystal-prism',
    ])

    if (!displayName) throw new Error('display_name_required')
    if (!profileDesignation) throw new Error('designation_required')
    if (!timezone) throw new Error('timezone_required')
    if (profileDesignation.length > 60) throw new Error('designation_too_long')
    if ((profileBio?.length ?? 0) > 180) throw new Error('bio_too_long')
    if (!validBannerStyles.has(profileBannerStyle)) throw new Error('banner_style_invalid')

    await ctx.db.patch(args.userId, {
      displayName,
      profileDesignation,
      profileBannerStyle,
      profileBio: profileBio || undefined,
      timezone,
      profileCompletedAt: Date.now(),
      updatedAt: Date.now(),
    })
  },
})

export const getProfileStatus = query({
  args: {
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    assertActorMatches(actor, args.userId)
    const user = await ctx.db.get(args.userId)
    if (!user) return null
    return {
      complete: isProfileComplete(user),
      user,
    }
  },
})

export const verifyStepUpTotp = mutation({
  args: {
    userId: v.id('users'),
    action: v.string(),
    code: v.string(),
    method: v.union(v.literal('totp'), v.literal('backup_code')),
  },
  handler: async (ctx, args) => {
    await assertCanManageTrackUser(ctx, args.userId)
    const user = await ctx.db.get(args.userId)
    if (!user?.authUserId) throw new Error('user_not_found')

    const { auth, headers } = await authComponent.getAuth(createAuth, ctx)
    const api = auth.api as {
      verifyTOTP: (input: { body: { code: string }; headers: Headers }) => Promise<unknown>
      verifyBackupCode: (input: {
        body: { code: string; disableSession: boolean }
        headers: Headers
      }) => Promise<unknown>
    }

    if (args.method === 'backup_code') {
      await api.verifyBackupCode({
        body: { code: args.code, disableSession: true },
        headers,
      })
    } else {
      await api.verifyTOTP({
        body: { code: args.code },
        headers,
      })
    }

    const now = Date.now()
    const existing = await ctx.db
      .query('securityStepUps')
      .withIndex('by_user_action', (q) =>
        q.eq('userId', args.userId).eq('action', args.action),
      )
      .unique()
    const payload = {
      authUserId: user.authUserId,
      action: args.action,
      expiresAt: now + stepUpFreshMs,
      createdAt: now,
    }
    if (existing) {
      await ctx.db.patch(existing._id, payload)
    } else {
      await ctx.db.insert('securityStepUps', {
        userId: args.userId,
        ...payload,
      })
    }

    return { expiresAt: payload.expiresAt }
  },
})

export const hasFreshStepUp = query({
  args: {
    userId: v.id('users'),
    action: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    assertActorMatches(actor, args.userId)
    const stepUp = await ctx.db
      .query('securityStepUps')
      .withIndex('by_user_action', (q) =>
        q.eq('userId', args.userId).eq('action', args.action),
      )
      .unique()

    return Boolean(stepUp && stepUp.expiresAt > Date.now())
  },
})

export const resetStepUps = mutation({
  args: {
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    await assertCanManageTrackUser(ctx, args.userId)
    const stepUps = await ctx.db
      .query('securityStepUps')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .collect()

    await Promise.all(stepUps.map((stepUp) => ctx.db.delete(stepUp._id)))
    return { removed: stepUps.length }
  },
})

export const requestAccountDeletion = mutation({
  args: {
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const { authUser, trackUser } = await assertCanManageTrackUser(ctx, args.userId)
    const now = Date.now()
    const companyMemberships = await ctx.db
      .query('companyMembers')
      .withIndex('by_user_status', (q) => q.eq('userId', args.userId).eq('status', 'active'))
      .collect()
    for (const membership of companyMemberships.filter((item) => item.role === 'owner')) {
      const owners = await ctx.db
        .query('companyMembers')
        .withIndex('by_company_status_role', (q) =>
          q.eq('companyId', membership.companyId).eq('status', 'active').eq('role', 'owner'),
        )
        .collect()
      if (owners.length <= 1) throw new Error('company_ownership_transfer_required')
    }
    const existing = await ctx.db
      .query('accountDeletionRequests')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .first()
    const retentionNote =
      'Shared project messages, attachments, and audit events are retained where needed for other members and project integrity; personal profile fields and push subscriptions are removed.'

    const projectMemberships = await ctx.db.query('projectMembers')
      .withIndex('by_user', (q) => q.eq('userId', args.userId)).collect()
    for (const projectId of new Set(projectMemberships.map((membership) => membership.projectId))) {
      await cancelProjectSnapshotForSourceRemoval(ctx, projectId)
    }

    if (existing) {
      await ctx.db.patch(existing._id, {
        authUserId: authUser?._id ?? trackUser.authUserId,
        status: 'requested',
        requestedAt: now,
        retentionNote,
      })
    } else {
      await ctx.db.insert('accountDeletionRequests', {
        userId: args.userId,
        authUserId: authUser?._id ?? trackUser.authUserId,
        status: 'requested',
        requestedAt: now,
        retentionNote,
      })
    }

    const [subscriptions, pushInstallations] = await Promise.all([
      ctx.db.query('notificationSubscriptions')
        .withIndex('by_user', (q) => q.eq('userId', args.userId)).collect(),
      ctx.db.query('pushInstallations')
        .withIndex('by_user', (q) => q.eq('userId', args.userId)).collect(),
    ])
    await Promise.all(
      subscriptions.map((subscription) =>
        ctx.db.patch(subscription._id, {
          enabled: false,
          updatedAt: now,
        }),
      ),
    )
    await Promise.all(pushInstallations.map((installation) =>
      ctx.db.patch(installation._id, {
        userId: undefined,
        expoPushToken: undefined,
        nativePushToken: undefined,
        enabled: false,
        failureReason: 'account_deleted',
        updatedAt: now,
      }),
    ))
    await Promise.all(companyMemberships.map((membership) =>
      ctx.db.patch(membership._id, { status: 'removed', endedAt: now, updatedAt: now }),
    ))

    await ctx.db.patch(args.userId, {
      displayName: 'Deleted Track user',
      profileDesignation: undefined,
      profileBio: undefined,
      profileBannerStyle: undefined,
      timezone: undefined,
      avatarStorageId: undefined,
      normalizedEmail: undefined,
      email: `deleted+${args.userId}@track.local`,
      updatedAt: now,
    })

    return { requestedAt: now }
  },
})
