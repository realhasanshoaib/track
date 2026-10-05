import { v } from 'convex/values'

import type { Id } from './_generated/dataModel'
import { internalMutation, internalQuery, mutation, query } from './_generated/server'
import { appendAuditEvent } from './lib/audit'
import { assertActorMatches, requireAuthenticatedActor } from './lib/actorContext'
import { isExpoPushToken } from './lib/pushTokens'
import { authorizeScopedRequest } from './lib/requestAuthorization'
import { threadsEnabled } from './lib/channelThreadPolicy'

const notificationMode = v.union(
  v.literal('all'),
  v.literal('mentions'),
  v.literal('none'),
)

const groupNotificationMode = v.union(
  v.literal('inherit'),
  v.literal('all'),
  v.literal('mentions'),
  v.literal('none'),
)

const taskNotificationMode = v.union(
  v.literal('important'),
  v.literal('all'),
  v.literal('muted'),
)

const pushPermissionState = v.union(
  v.literal('not_determined'),
  v.literal('denied'),
  v.literal('granted'),
  v.literal('provisional'),
)

const pushEnvironment = v.union(
  v.literal('development'),
  v.literal('preview'),
  v.literal('production'),
)

export function shouldNotifyForMessage(input: {
  globalMode: 'all' | 'mentions' | 'none'
  groupMode: 'inherit' | 'all' | 'mentions' | 'none'
  mentioned: boolean
  directReply?: boolean
}) {
  const mode = input.groupMode === 'inherit' ? input.globalMode : input.groupMode
  if (mode === 'none') return false
  if (mode === 'all') return true
  return input.mentioned || Boolean(input.directReply)
}

function legacyInstallationId(platform: 'ios' | 'android', token: string) {
  let hash = 2_166_136_261
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index)
    hash = Math.imul(hash, 16_777_619)
  }
  return `legacy:${platform}:${(hash >>> 0).toString(16)}`
}

function installationTokenValues(token: string) {
  return isExpoPushToken(token)
    ? { expoPushToken: token, nativePushToken: undefined }
    : { expoPushToken: undefined, nativePushToken: token }
}

export function serverPushEnvironment(): 'development' | 'preview' | 'production' {
  const configured = process.env.TRACK_PUSH_ENVIRONMENT
  return configured === 'preview' || configured === 'production' ? configured : 'development'
}

export const getSettings = query({
  args: {
    userId: v.id('users'),
    projectMemberId: v.optional(v.id('projectMembers')),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    assertActorMatches(actor, args.userId)
    const global = await ctx.db
      .query('notificationSettings')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .unique()
    const allGroups = await ctx.db
      .query('groupNotificationSettings')
      .withIndex('by_user_group', (q) => q.eq('userId', args.userId))
      .collect()
    const groups = allGroups.filter((setting) => args.projectMemberId
      ? setting.projectMemberId === args.projectMemberId
      : !setting.projectMemberId,
    )
    return {
      global: {
        globalMode: global?.globalMode ?? 'all',
        taskMode: global?.taskMode ?? 'all',
        previewMode: global?.previewMode ?? 'full',
        soundEnabled: global?.soundEnabled ?? true,
        badgesEnabled: global?.badgesEnabled ?? true,
      },
      groups,
    }
  },
})

export const getWebPushPublicKey = query({
  args: {},
  handler: () => process.env.VAPID_PUBLIC_KEY ?? null,
})

export const collectCompanyInvitationPushTargets = internalQuery({
  args: { invitationId: v.id('companyInvitations') },
  handler: async (ctx, args) => {
    const invitation = await ctx.db.get(args.invitationId)
    if (
      !invitation || invitation.status !== 'pending' || !invitation.recipientUserId ||
      invitation.expiresAt <= Date.now()
    ) return null
    const [company, installations, settings] = await Promise.all([
      ctx.db.get(invitation.companyId),
      ctx.db.query('pushInstallations')
        .withIndex('by_user', (q) => q.eq('userId', invitation.recipientUserId!))
        .collect(),
      ctx.db.query('notificationSettings')
        .withIndex('by_user', (q) => q.eq('userId', invitation.recipientUserId!))
        .unique(),
    ])
    if (!company || company.status !== 'active') return null
    return {
      companyName: company.displayName,
      recipientUserId: invitation.recipientUserId,
      role: invitation.role,
      targets: installations
        .filter((installation) => installation.enabled &&
          installation.environment === serverPushEnvironment() &&
          Boolean(installation.nativePushToken) &&
          (installation.permissionState === 'granted' || installation.permissionState === 'provisional'))
        .map((installation) => ({
          installationId: installation._id,
          recipientUserId: invitation.recipientUserId!,
          previewMode: settings?.previewMode ?? 'full',
          soundEnabled: settings?.soundEnabled ?? true,
        })),
    }
  },
})

export const collectProjectInvitationPushTargets = internalQuery({
  args: { invitationId: v.id('invitations') },
  handler: async (ctx, args) => {
    const invitation = await ctx.db.get(args.invitationId)
    if (!invitation || invitation.status !== 'pending' || invitation.expiresAt <= Date.now()) return null
    const [recipient, project] = await Promise.all([
      ctx.db.query('users')
        .withIndex('by_normalized_email', (q) => q.eq('normalizedEmail', invitation.email))
        .unique(),
      ctx.db.get(invitation.projectId),
    ])
    if (!recipient || !project || project.status === 'archived' || project.status === 'archive_pending') return null
    const [installations, settings, membership] = await Promise.all([
      ctx.db.query('pushInstallations').withIndex('by_user', (q) => q.eq('userId', recipient._id)).collect(),
      ctx.db.query('notificationSettings').withIndex('by_user', (q) => q.eq('userId', recipient._id)).unique(),
      ctx.db.query('projectMembers').withIndex('by_project_user', (q) =>
        q.eq('projectId', project._id).eq('userId', recipient._id),
      ).unique(),
    ])
    if (membership?.status === 'active') return null
    return {
      projectName: project.name,
      recipientUserId: recipient._id,
      targets: installations
        .filter((installation) => installation.enabled &&
          installation.environment === serverPushEnvironment() &&
          Boolean(installation.nativePushToken) &&
          (installation.permissionState === 'granted' || installation.permissionState === 'provisional'))
        .map((installation) => ({
          installationId: installation._id,
          recipientUserId: recipient._id,
          previewMode: settings?.previewMode ?? 'full',
          soundEnabled: settings?.soundEnabled ?? true,
        })),
    }
  },
})

export const setGlobalMode = mutation({
  args: {
    userId: v.id('users'),
    mode: notificationMode,
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    assertActorMatches(actor, args.userId)
    const now = Date.now()
    const existing = await ctx.db
      .query('notificationSettings')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .unique()

    if (existing) {
      await ctx.db.patch(existing._id, {
        globalMode: args.mode,
        updatedAt: now,
      })
      return existing._id
    }

    return await ctx.db.insert('notificationSettings', {
      userId: args.userId,
      globalMode: args.mode,
      createdAt: now,
      updatedAt: now,
    })
  },
})

export const setMobilePreferences = mutation({
  args: {
    userId: v.id('users'),
    conversationMode: v.optional(notificationMode),
    taskMode: v.optional(taskNotificationMode),
    previewMode: v.optional(v.union(v.literal('full'), v.literal('context'), v.literal('hidden'))),
    soundEnabled: v.optional(v.boolean()),
    badgesEnabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    assertActorMatches(actor, args.userId)
    const now = Date.now()
    const existing = await ctx.db
      .query('notificationSettings')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .unique()
    const values = {
      globalMode: args.conversationMode ?? existing?.globalMode ?? 'all',
      taskMode: args.taskMode ?? existing?.taskMode ?? 'all',
      previewMode: args.previewMode ?? existing?.previewMode ?? 'full',
      soundEnabled: args.soundEnabled ?? existing?.soundEnabled ?? true,
      badgesEnabled: args.badgesEnabled ?? existing?.badgesEnabled ?? true,
      updatedAt: now,
    }
    if (existing) {
      await ctx.db.patch(existing._id, values)
      return existing._id
    }
    return await ctx.db.insert('notificationSettings', {
      userId: args.userId,
      ...values,
      createdAt: now,
    })
  },
})

export const setGroupMode = mutation({
  args: {
    groupId: v.id('groups'),
    userId: v.id('users'),
    mode: groupNotificationMode,
    actingCompanyId: v.optional(v.id('companies')),
    projectMemberId: v.optional(v.id('projectMembers')),
  },
  handler: async (ctx, args) => {
    const group = await ctx.db.get(args.groupId)
    if (!group) throw new Error('channel_unavailable')
    await authorizeScopedRequest(ctx, {
      projectId: group.projectId,
      groupId: group._id,
      claimedUserId: args.userId,
      actingCompanyId: args.actingCompanyId,
      projectMemberId: args.projectMemberId,
    }, 'readChannel')
    const now = Date.now()
    const existing = args.projectMemberId
      ? await ctx.db.query('groupNotificationSettings').withIndex('by_project_member_group', (q) =>
          q.eq('projectMemberId', args.projectMemberId).eq('groupId', args.groupId),
        ).unique()
      : await ctx.db.query('groupNotificationSettings').withIndex('by_user_group', (q) =>
          q.eq('userId', args.userId).eq('groupId', args.groupId),
        ).unique()

    if (existing) {
      await ctx.db.patch(existing._id, {
        mode: args.mode,
        updatedAt: now,
      })
      return existing._id
    }

    return await ctx.db.insert('groupNotificationSettings', {
      userId: args.userId,
      projectMemberId: args.projectMemberId,
      groupId: args.groupId,
      mode: args.mode,
      createdAt: now,
      updatedAt: now,
    })
  },
})

export const registerSubscription = mutation({
  args: {
    userId: v.id('users'),
    platform: v.union(v.literal('web'), v.literal('ios'), v.literal('android')),
    endpoint: v.string(),
    expirationTime: v.optional(v.number()),
    keys: v.object({
      auth: v.string(),
      p256dh: v.string(),
    }),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    assertActorMatches(actor, args.userId)
    console.info('[Track push] registerSubscription called', {
      platform: args.platform,
      userId: args.userId,
    })
    const tokenOrEndpoint = JSON.stringify({
      endpoint: args.endpoint,
      expirationTime: args.expirationTime ?? null,
      keys: args.keys,
    })
    const existingSubscriptions = await ctx.db
      .query('notificationSubscriptions')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .collect()
    const existing = existingSubscriptions.find((subscription) => {
      try {
        return JSON.parse(subscription.tokenOrEndpoint).endpoint === args.endpoint
      } catch {
        return subscription.tokenOrEndpoint === args.endpoint
      }
    })

    if (existing) {
      await ctx.db.patch(existing._id, {
        enabled: true,
        platform: args.platform,
        tokenOrEndpoint,
        updatedAt: Date.now(),
      })
      console.info('[Track push] registerSubscription updated existing subscription', {
        platform: args.platform,
        subscriptionId: existing._id,
        userId: args.userId,
      })
      return existing._id
    }

    const subscriptionId = await ctx.db.insert('notificationSubscriptions', {
      userId: args.userId,
      platform: args.platform,
      tokenOrEndpoint,
      enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    await appendAuditEvent(ctx, {
      actorId: args.userId,
      entityType: 'notificationSubscription',
      entityId: subscriptionId,
      action: 'notification_subscription.registered',
      after: { platform: args.platform },
    })

    console.info('[Track push] registerSubscription created subscription', {
      platform: args.platform,
      subscriptionId,
      userId: args.userId,
    })

    return subscriptionId
  },
})

export const registerNativeToken = mutation({
  args: {
    userId: v.id('users'),
    projectMemberId: v.optional(v.id('projectMembers')),
    platform: v.union(v.literal('ios'), v.literal('android')),
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    assertActorMatches(actor, args.userId)
    const token = args.token.trim()
    if (!token) throw new Error('push_token_required')
    if (args.projectMemberId) {
      const projectMember = await ctx.db.get(args.projectMemberId)
      if (!projectMember || projectMember.userId !== actor.userId ||
        (projectMember.status !== undefined && projectMember.status !== 'active')) {
        throw new Error('notification_membership_invalid')
      }
    }
    const now = Date.now()
    const subscriptions = await ctx.db
      .query('notificationSubscriptions')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .collect()
    const existing = subscriptions.find(
      (subscription) =>
        subscription.platform === args.platform && subscription.tokenOrEndpoint === token &&
        subscription.projectMemberId === args.projectMemberId,
    )

    const installationId = legacyInstallationId(args.platform, token)
    const installation = await ctx.db.query('pushInstallations')
      .withIndex('by_installation_id', (q) => q.eq('installationId', installationId))
      .unique()
    const installationValues = {
      userId: args.userId,
      platform: args.platform,
      environment: serverPushEnvironment(),
      ...installationTokenValues(token),
      enabled: true,
      permissionState: 'granted' as const,
      lastSeenAt: now,
      updatedAt: now,
    }
    if (installation) await ctx.db.patch(installation._id, installationValues)
    else await ctx.db.insert('pushInstallations', {
      installationId,
      ...installationValues,
      createdAt: now,
    })

    if (existing) {
      await ctx.db.patch(existing._id, {
        enabled: true,
        updatedAt: now,
      })
      return existing._id
    }

    const subscriptionId = await ctx.db.insert('notificationSubscriptions', {
      userId: args.userId,
      projectMemberId: args.projectMemberId,
      platform: args.platform,
      tokenOrEndpoint: token,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    })

    await appendAuditEvent(ctx, {
      actorId: args.userId,
      entityType: 'notificationSubscription',
      entityId: subscriptionId,
      action: 'notification_subscription.registered',
      after: { platform: args.platform },
    })

    return subscriptionId
  },
})

export const registerNativeInstallation = mutation({
  args: {
    userId: v.id('users'),
    installationId: v.string(),
    platform: v.union(v.literal('ios'), v.literal('android')),
    environment: pushEnvironment,
    token: v.string(),
    permissionState: pushPermissionState,
    appVersion: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    assertActorMatches(actor, args.userId)
    const installationId = args.installationId.trim()
    const token = args.token.trim()
    if (!installationId || installationId.length > 160) throw new Error('push_installation_id_invalid')
    if (!token || token.length > 512) throw new Error('push_token_invalid')
    const now = Date.now()

    const expoToken = isExpoPushToken(token)
    const tokenOwners = expoToken
      ? await ctx.db.query('pushInstallations')
          .withIndex('by_token', (q) => q.eq('expoPushToken', token)).collect()
      : await ctx.db.query('pushInstallations')
          .withIndex('by_native_token', (q) => q.eq('nativePushToken', token)).collect()
    const existing = await ctx.db
      .query('pushInstallations')
      .withIndex('by_installation_id', (q) => q.eq('installationId', installationId))
      .unique()

    for (const tokenOwner of tokenOwners) {
      if (tokenOwner._id === existing?._id) continue
      await ctx.db.patch(tokenOwner._id, {
        ...(expoToken ? { expoPushToken: undefined } : { nativePushToken: undefined }),
        enabled: false,
        failureReason: 'token_rotated',
        updatedAt: now,
      })
    }

    const values = {
      userId: args.userId,
      platform: args.platform,
      environment: args.environment,
      ...installationTokenValues(token),
      enabled: args.permissionState === 'granted' || args.permissionState === 'provisional',
      permissionState: args.permissionState,
      appVersion: args.appVersion,
      failureReason: undefined,
      lastSeenAt: now,
      updatedAt: now,
    }
    if (existing) {
      await ctx.db.patch(existing._id, values)
      return existing._id
    }

    const id = await ctx.db.insert('pushInstallations', {
      installationId,
      ...values,
      createdAt: now,
    })
    await appendAuditEvent(ctx, {
      actorId: args.userId,
      entityType: 'pushInstallation',
      entityId: id,
      action: 'push_installation.registered',
      after: { environment: args.environment, platform: args.platform },
    })
    return id
  },
})

export const reportNativePermission = mutation({
  args: {
    userId: v.id('users'),
    installationId: v.string(),
    platform: v.union(v.literal('ios'), v.literal('android')),
    environment: pushEnvironment,
    permissionState: pushPermissionState,
    appVersion: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    assertActorMatches(actor, args.userId)
    const installationId = args.installationId.trim()
    if (!installationId || installationId.length > 160) throw new Error('push_installation_id_invalid')
    const now = Date.now()
    const existing = await ctx.db
      .query('pushInstallations')
      .withIndex('by_installation_id', (q) => q.eq('installationId', installationId))
      .unique()
    const enabled = (args.permissionState === 'granted' || args.permissionState === 'provisional') &&
      Boolean(existing?.nativePushToken)
    const values = {
      userId: args.userId,
      platform: args.platform,
      environment: args.environment,
      permissionState: args.permissionState,
      enabled,
      appVersion: args.appVersion,
      lastSeenAt: now,
      updatedAt: now,
    }
    if (existing) {
      await ctx.db.patch(existing._id, values)
      return existing._id
    }
    return await ctx.db.insert('pushInstallations', {
      installationId,
      ...values,
      createdAt: now,
    })
  },
})

export const detachNativeInstallation = mutation({
  args: { installationId: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    const existing = await ctx.db
      .query('pushInstallations')
      .withIndex('by_installation_id', (q) => q.eq('installationId', args.installationId))
      .unique()
    if (!existing || existing.userId !== actor.userId) return false
    const now = Date.now()
    const legacySubscriptions = await ctx.db
      .query('notificationSubscriptions')
      .withIndex('by_user', (q) => q.eq('userId', actor.userId))
      .collect()
    for (const subscription of legacySubscriptions) {
      if (subscription.platform === 'web' || !subscription.enabled) continue
      const matchesToken = subscription.tokenOrEndpoint ===
        (existing.nativePushToken ?? existing.expoPushToken)
      const matchesLegacyInstallation = legacyInstallationId(
        subscription.platform,
        subscription.tokenOrEndpoint,
      ) === existing.installationId
      if (matchesToken || matchesLegacyInstallation) {
        await ctx.db.patch(subscription._id, { enabled: false, updatedAt: now })
      }
    }
    await ctx.db.patch(existing._id, {
      userId: undefined,
      enabled: false,
      failureReason: 'signed_out',
      lastSeenAt: now,
      updatedAt: now,
    })
    return true
  },
})

export const getNativeStatus = query({
  args: { userId: v.id('users'), installationId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    assertActorMatches(actor, args.userId)
    const installation = args.installationId
      ? await ctx.db.query('pushInstallations')
          .withIndex('by_installation_id', (q) => q.eq('installationId', args.installationId!))
          .unique()
      : null
    if (!installation || installation.userId !== args.userId) return null
    return {
      enabled: installation.enabled,
      environment: installation.environment,
      failureReason: installation.failureReason,
      lastSeenAt: installation.lastSeenAt,
      permissionState: installation.permissionState,
      platform: installation.platform,
      registered: Boolean(installation.nativePushToken),
    }
  },
})

export const recordPushOpen = mutation({
  args: {
    userId: v.id('users'),
    installationId: v.string(),
    intentId: v.id('pushDeliveryIntents'),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    assertActorMatches(actor, args.userId)
    const [installation, intent] = await Promise.all([
      ctx.db.query('pushInstallations')
        .withIndex('by_installation_id', (q) => q.eq('installationId', args.installationId))
        .unique(),
      ctx.db.get(args.intentId),
    ])
    if (!installation || installation.userId !== args.userId ||
      !intent || intent.recipientUserId !== args.userId || intent.installationId !== installation._id) {
      throw new Error('push_open_unauthorized')
    }
    if (intent.openedAt) {
      await ctx.db.patch(intent._id, {
        duplicateOpenCount: (intent.duplicateOpenCount ?? 0) + 1,
        updatedAt: Date.now(),
      })
      return { duplicate: true }
    }
    await ctx.db.patch(intent._id, { openedAt: Date.now(), updatedAt: Date.now() })
    return { duplicate: false }
  },
})

export const collectMessageNotificationTargets = internalQuery({
  args: {
    messageId: v.id('messages'),
  },
  handler: async (ctx, args) => {
    const pushEnvironment = serverPushEnvironment()
    const message = await ctx.db.get(args.messageId)
    if (!message) return null
    if (message.channelThreadId && !threadsEnabled()) return null
    const [author, group, project, channelThread, replyToMessage] = await Promise.all([
      ctx.db.get(message.authorId),
      ctx.db.get(message.groupId),
      ctx.db.get(message.projectId),
      message.channelThreadId ? ctx.db.get(message.channelThreadId) : null,
      message.replyToMessageId ? ctx.db.get(message.replyToMessageId) : null,
    ])
    if (!group || !project || (message.channelThreadId && !channelThread)) return null

    const groupMembers = await ctx.db
      .query('groupMembers')
      .withIndex('by_group', (q) => q.eq('groupId', message.groupId))
      .collect()

    const targets = await Promise.all(
      groupMembers.map(async (membership) => {
        if (membership.status && membership.status !== 'active') return []
        if (membership.userId === message.authorId) return []

        let actingCompanyId: Id<'companies'> | undefined
        let projectMemberId = membership.projectMemberId
        if (!projectMemberId) {
          projectMemberId = (await ctx.db
            .query('projectMembers')
            .withIndex('by_project_user', (q) =>
              q.eq('projectId', message.projectId).eq('userId', membership.userId),
            )
            .unique())?._id
        }
        const projectMember = projectMemberId ? await ctx.db.get(projectMemberId) : null
        const mentioned = message.mentionedProjectMemberIds
          ? Boolean(
              membership.projectMemberId &&
              message.mentionedProjectMemberIds.includes(membership.projectMemberId) &&
              message.mentions.includes(membership.userId),
            )
          : project.accessProfile !== 'company' && message.mentions.some((userId) => userId === membership.userId)
        const directReply = Boolean(
          replyToMessage &&
          replyToMessage.authorId === membership.userId &&
          (!replyToMessage.authorProjectMemberId || replyToMessage.authorProjectMemberId === projectMemberId),
        )
        if (message.channelThreadId) {
          if (!projectMemberId) return []
          const follower = await ctx.db
            .query('channelThreadFollowers')
            .withIndex('by_thread_project_member', (q) =>
              q
                .eq('channelThreadId', message.channelThreadId!)
                .eq('projectMemberId', projectMemberId!),
            )
            .unique()
          if (follower?.preference !== 'following' && !mentioned && !directReply) return []
        }
        if (project.accessProfile === 'company') {
          if (!membership.projectMemberId) return []
          if (!projectMember || projectMember.status !== 'active' || !projectMember.companyId || !projectMember.projectCompanyId) return []
          const [company, companyMember, projectCompany] = await Promise.all([
            ctx.db.get(projectMember.companyId),
            ctx.db.query('companyMembers').withIndex('by_company_user', (q) =>
              q.eq('companyId', projectMember.companyId!).eq('userId', projectMember.userId),
            ).unique(),
            ctx.db.get(projectMember.projectCompanyId),
          ])
          if (!company || company.status !== 'active' || companyMember?.status !== 'active' || projectCompany?.status !== 'active') return []
          actingCompanyId = projectMember.companyId
          projectMemberId = projectMember._id
        }

        const [globalSettings, groupSettings, subscriptions, installations] = await Promise.all([
          ctx.db
            .query('notificationSettings')
            .withIndex('by_user', (q) => q.eq('userId', membership.userId))
            .unique(),
          membership.projectMemberId
            ? ctx.db.query('groupNotificationSettings').withIndex('by_project_member_group', (q) =>
                q.eq('projectMemberId', membership.projectMemberId).eq('groupId', message.groupId),
              ).unique()
            : ctx.db.query('groupNotificationSettings').withIndex('by_user_group', (q) =>
                q.eq('userId', membership.userId).eq('groupId', message.groupId),
              ).unique(),
          ctx.db
            .query('notificationSubscriptions')
            .withIndex('by_user', (q) => q.eq('userId', membership.userId))
            .collect(),
          ctx.db
            .query('pushInstallations')
            .withIndex('by_user', (q) => q.eq('userId', membership.userId))
            .collect(),
        ])

        const shouldNotify = shouldNotifyForMessage({
          globalMode: globalSettings?.globalMode ?? 'all',
          groupMode: groupSettings?.mode ?? 'inherit',
          mentioned,
          directReply,
        })
        if (!shouldNotify) return []

        const readState = projectMemberId
          ? await ctx.db.query('groupReadStates').withIndex('by_project_member_group', (q) =>
              q.eq('projectMemberId', projectMemberId!).eq('groupId', message.groupId),
            ).unique()
          : await ctx.db.query('groupReadStates').withIndex('by_user_group', (q) =>
              q.eq('userId', membership.userId).eq('groupId', message.groupId),
            ).unique()
        const unreadMessages = await ctx.db.query('messages')
          .withIndex('by_group_thread_created_at', (q) => readState
            ? q.eq('groupId', message.groupId).eq('channelThreadId', undefined).gt('createdAt', readState.lastReadAt)
            : q.eq('groupId', message.groupId).eq('channelThreadId', undefined))
          .take(100)
        const badge = Math.min(
          99,
          unreadMessages.filter((candidate) => candidate.authorId !== membership.userId).length,
        )

        const webTargets = subscriptions
          .filter((subscription) =>
            subscription.enabled &&
            subscription.platform === 'web' &&
            (!subscription.projectMemberId || subscription.projectMemberId === projectMemberId),
          )
          .map((subscription) => ({
            kind: 'web' as const,
            subscriptionId: subscription._id,
            platform: 'web' as const,
            tokenOrEndpoint: subscription.tokenOrEndpoint,
            actingCompanyId,
            projectMemberId,
            recipientUserId: membership.userId,
            eventKind: mentioned ? 'mention' : directReply ? 'direct_reply' : message.channelThreadId ? 'thread_reply' : 'message',
            exactMembership: subscription.projectMemberId === projectMemberId,
          }))
        const nativeTargets = installations
          .filter((installation) =>
            installation.enabled &&
            installation.environment === pushEnvironment &&
            Boolean(installation.nativePushToken) &&
            (installation.permissionState === 'granted' || installation.permissionState === 'provisional'),
          )
          .map((installation) => ({
            kind: 'native' as const,
            installationId: installation._id,
            platform: installation.platform,
            tokenOrEndpoint: installation.nativePushToken!,
            actingCompanyId,
            projectMemberId,
            recipientUserId: membership.userId,
            previewMode: globalSettings?.previewMode ?? 'full',
            soundEnabled: globalSettings?.soundEnabled ?? true,
            badge: globalSettings?.badgesEnabled === false ? undefined : badge,
            eventKind: mentioned ? 'mention' : directReply ? 'direct_reply' : message.channelThreadId ? 'thread_reply' : 'message',
          }))
        const installationTokens = new Set(installations.flatMap((installation) =>
          [installation.nativePushToken, installation.expoPushToken].filter(Boolean)))
        const legacyNativeTargets = subscriptions
          .filter((subscription) => subscription.enabled && subscription.platform !== 'web' &&
            !installationTokens.has(subscription.tokenOrEndpoint) &&
            (!subscription.projectMemberId || subscription.projectMemberId === projectMemberId))
          .map((subscription) => ({
            kind: 'legacy_native' as const,
            subscriptionId: subscription._id,
            platform: subscription.platform,
            tokenOrEndpoint: subscription.tokenOrEndpoint,
            actingCompanyId,
            projectMemberId,
            recipientUserId: membership.userId,
            previewMode: globalSettings?.previewMode ?? 'context',
            soundEnabled: globalSettings?.soundEnabled ?? true,
            badge: globalSettings?.badgesEnabled === false ? undefined : badge,
            eventKind: mentioned ? 'mention' : directReply ? 'direct_reply' : message.channelThreadId ? 'thread_reply' : 'message',
            exactMembership: subscription.projectMemberId === projectMemberId,
          }))
        return [...webTargets, ...nativeTargets, ...legacyNativeTargets]
      }),
    )

    const uniqueTargets = new Map<string, (typeof targets)[number][number]>()
    for (const target of targets.flat()) {
      const key = target.kind === 'native'
        ? `native:${target.installationId}:${target.projectMemberId ?? 'legacy'}`
        : target.kind === 'legacy_native'
          ? `legacy_native:${target.tokenOrEndpoint}:${target.projectMemberId ?? 'legacy'}`
        : `web:${target.tokenOrEndpoint}:${target.projectMemberId ?? 'legacy'}`
      const existing = uniqueTargets.get(key)
      if (!existing || ('exactMembership' in target && target.exactMembership)) uniqueTargets.set(key, target)
    }

    return {
      channelThreadId: message.channelThreadId,
      channelThreadName: channelThread?.name,
      groupId: message.groupId,
      groupName: group.name,
      projectId: message.projectId,
      projectName: project.name,
      senderName: author?.displayName ?? 'Track',
      messagePreview: message.body || message.notificationPreview || 'Sent an attachment.',
      targets: Array.from(uniqueTargets.values()),
      url: message.channelThreadId
        ? `/workspace/projects/${message.projectId}/groups/${message.groupId}/threads/${message.channelThreadId}#message-${message._id}`
        : `/workspace/projects/${message.projectId}/groups/${message.groupId}`,
    }
  },
})

export const collectUserNotificationTargets = internalQuery({
  args: {
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    assertActorMatches(actor, args.userId)
    const [subscriptions, installations, settings] = await Promise.all([
      ctx.db.query('notificationSubscriptions')
        .withIndex('by_user', (q) => q.eq('userId', args.userId)).collect(),
      ctx.db.query('pushInstallations')
        .withIndex('by_user', (q) => q.eq('userId', args.userId)).collect(),
      ctx.db.query('notificationSettings')
        .withIndex('by_user', (q) => q.eq('userId', args.userId)).unique(),
    ])
    return [
      ...subscriptions
        .filter((subscription) => subscription.enabled && subscription.platform === 'web')
        .map((subscription) => ({
          kind: 'web' as const,
          subscriptionId: subscription._id,
          platform: 'web' as const,
          tokenOrEndpoint: subscription.tokenOrEndpoint,
        })),
      ...installations
        .filter((installation) => installation.enabled &&
          installation.environment === serverPushEnvironment() &&
          Boolean(installation.nativePushToken))
        .map((installation) => ({
          kind: 'native' as const,
          installationId: installation._id,
          platform: installation.platform,
          tokenOrEndpoint: installation.nativePushToken!,
          soundEnabled: settings?.soundEnabled ?? true,
        })),
      ...subscriptions
        .filter((subscription) => subscription.enabled && subscription.platform !== 'web' &&
          !installations.some((installation) =>
            (installation.nativePushToken ?? installation.expoPushToken) === subscription.tokenOrEndpoint))
        .map((subscription) => ({
          kind: 'legacy_native' as const,
          subscriptionId: subscription._id,
          platform: subscription.platform,
          tokenOrEndpoint: subscription.tokenOrEndpoint,
          soundEnabled: settings?.soundEnabled ?? true,
        })),
    ]
  },
})

export const disableSubscription = internalMutation({
  args: {
    subscriptionId: v.id('notificationSubscriptions'),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.subscriptionId, {
      enabled: false,
      updatedAt: Date.now(),
    })
  },
})

export const disableInstallation = internalMutation({
  args: {
    installationId: v.id('pushInstallations'),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const installation = await ctx.db.get(args.installationId)
    const now = Date.now()
    const pushToken = installation?.nativePushToken ?? installation?.expoPushToken
    if (installation?.userId && pushToken) {
      const subscriptions = await ctx.db.query('notificationSubscriptions')
        .withIndex('by_user', (q) => q.eq('userId', installation.userId!))
        .collect()
      for (const subscription of subscriptions) {
        if (subscription.platform === 'web' || !subscription.enabled) continue
        const matchesToken = subscription.tokenOrEndpoint === pushToken
        const matchesLegacyInstallation = legacyInstallationId(
          subscription.platform,
          subscription.tokenOrEndpoint,
        ) === installation.installationId
        if (matchesToken || matchesLegacyInstallation) {
          await ctx.db.patch(subscription._id, { enabled: false, updatedAt: now })
        }
      }
    }
    await ctx.db.patch(args.installationId, {
      expoPushToken: undefined,
      nativePushToken: undefined,
      enabled: false,
      failureReason: args.reason.slice(0, 80),
      updatedAt: now,
    })
  },
})

export const migrateLegacyNativeSubscription = internalMutation({
  args: { subscriptionId: v.id('notificationSubscriptions') },
  handler: async (ctx, args) => {
    const subscription = await ctx.db.get(args.subscriptionId)
    if (!subscription || !subscription.enabled || subscription.platform === 'web') return null
    const installationId = legacyInstallationId(subscription.platform, subscription.tokenOrEndpoint)
    const existing = await ctx.db.query('pushInstallations')
      .withIndex('by_installation_id', (q) => q.eq('installationId', installationId))
      .unique()
    const now = Date.now()
    const values = {
      userId: subscription.userId,
      platform: subscription.platform,
      environment: serverPushEnvironment(),
      ...installationTokenValues(subscription.tokenOrEndpoint),
      enabled: true,
      permissionState: 'granted' as const,
      lastSeenAt: now,
      updatedAt: now,
    }
    if (existing) {
      await ctx.db.patch(existing._id, values)
      return existing._id
    }
    return await ctx.db.insert('pushInstallations', {
      installationId,
      ...values,
      createdAt: now,
    })
  },
})
