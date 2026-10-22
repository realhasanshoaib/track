import { v } from 'convex/values';
import { internalMutation, internalQuery, mutation, query } from './_generated/server';
import { appendAuditEvent } from './lib/audit';
import { assertActorMatches, requireAuthenticatedActor } from './lib/actorContext';
import { isExpoPushToken } from './lib/pushTokens';
import { authorizeGroupRequest } from './lib/requestAuthorization';
const notificationMode = v.union(v.literal('all'), v.literal('mentions'), v.literal('none'));
const groupNotificationMode = v.union(v.literal('inherit'), v.literal('all'), v.literal('mentions'), v.literal('none'));
const pushPermissionState = v.union(v.literal('not_determined'), v.literal('denied'), v.literal('granted'), v.literal('provisional'));
const pushEnvironment = v.union(v.literal('development'), v.literal('preview'), v.literal('production'));
export function shouldNotifyForMessage(input: {
    globalMode: 'all' | 'mentions' | 'none';
    groupMode: 'inherit' | 'all' | 'mentions' | 'none';
    mentioned: boolean;
    directReply?: boolean;
}) {
    const mode = input.groupMode === 'inherit' ? input.globalMode : input.groupMode;
    if (mode === 'none')
        return false;
    if (mode === 'all')
        return true;
    return input.mentioned || Boolean(input.directReply);
}
function installationTokenValues(token: string) {
    return isExpoPushToken(token)
        ? { expoPushToken: token, nativePushToken: undefined }
        : { expoPushToken: undefined, nativePushToken: token };
}
export function serverPushEnvironment(): 'development' | 'preview' | 'production' {
    const configured = process.env.TRACK_PUSH_ENVIRONMENT;
    return configured === 'preview' || configured === 'production' ? configured : 'development';
}
export const getSettings = query({
    args: {
        userId: v.id('users'),
    },
    handler: async (ctx, args) => {
        const actor = await requireAuthenticatedActor(ctx);
        assertActorMatches(actor, args.userId);
        const global = await ctx.db
            .query('notificationSettings')
            .withIndex('by_user', (q) => q.eq('userId', args.userId))
            .unique();
        const allGroups = await ctx.db
            .query('groupNotificationSettings')
            .withIndex('by_user_group', (q) => q.eq('userId', args.userId))
            .collect();
        const groups = allGroups;
        return {
            global: {
                globalMode: global?.globalMode ?? 'all',
                previewMode: global?.previewMode ?? 'full',
                soundEnabled: global?.soundEnabled ?? true,
                badgesEnabled: global?.badgesEnabled ?? true,
            },
            groups,
        };
    },
});
export const getWebPushPublicKey = query({
    args: {},
    handler: () => process.env.VAPID_PUBLIC_KEY ?? null,
});
export const setGlobalMode = mutation({
    args: {
        userId: v.id('users'),
        mode: notificationMode,
    },
    handler: async (ctx, args) => {
        const actor = await requireAuthenticatedActor(ctx);
        assertActorMatches(actor, args.userId);
        const now = Date.now();
        const existing = await ctx.db
            .query('notificationSettings')
            .withIndex('by_user', (q) => q.eq('userId', args.userId))
            .unique();
        if (existing) {
            await ctx.db.patch(existing._id, {
                globalMode: args.mode,
                updatedAt: now,
            });
            return existing._id;
        }
        return await ctx.db.insert('notificationSettings', {
            userId: args.userId,
            globalMode: args.mode,
            createdAt: now,
            updatedAt: now,
        });
    },
});
export const setMobilePreferences = mutation({
    args: {
        userId: v.id('users'),
        conversationMode: v.optional(notificationMode),
        previewMode: v.optional(v.union(v.literal('full'), v.literal('context'), v.literal('hidden'))),
        soundEnabled: v.optional(v.boolean()),
        badgesEnabled: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
        const actor = await requireAuthenticatedActor(ctx);
        assertActorMatches(actor, args.userId);
        const now = Date.now();
        const existing = await ctx.db
            .query('notificationSettings')
            .withIndex('by_user', (q) => q.eq('userId', args.userId))
            .unique();
        const values = {
            globalMode: args.conversationMode ?? existing?.globalMode ?? 'all',
            previewMode: args.previewMode ?? existing?.previewMode ?? 'full',
            soundEnabled: args.soundEnabled ?? existing?.soundEnabled ?? true,
            badgesEnabled: args.badgesEnabled ?? existing?.badgesEnabled ?? true,
            updatedAt: now,
        };
        if (existing) {
            await ctx.db.patch(existing._id, values);
            return existing._id;
        }
        return await ctx.db.insert('notificationSettings', {
            userId: args.userId,
            ...values,
            createdAt: now,
        });
    },
});
export const setGroupMode = mutation({
    args: {
        groupId: v.id('groups'),
        userId: v.id('users'),
        mode: groupNotificationMode,
    },
    handler: async (ctx, args) => {
        const group = await ctx.db.get(args.groupId);
        if (!group)
            throw new Error('channel_unavailable');
        await authorizeGroupRequest(ctx, {
            groupId: group._id,
            claimedUserId: args.userId,
        }, 'readChannel');
        const now = Date.now();
        const existing = await ctx.db
                .query('groupNotificationSettings')
                .withIndex('by_user_group', (q) => q.eq('userId', args.userId).eq('groupId', args.groupId))
                .unique();
        if (existing) {
            await ctx.db.patch(existing._id, {
                mode: args.mode,
                updatedAt: now,
            });
            return existing._id;
        }
        return await ctx.db.insert('groupNotificationSettings', {
            userId: args.userId,
            groupId: args.groupId,
            mode: args.mode,
            createdAt: now,
            updatedAt: now,
        });
    },
});
export const registerSubscription = mutation({
 args: { userId: v.id('users'), platform: v.literal('web'), tokenOrEndpoint: v.string() },
 handler: async (ctx, args) => {
  const actor = await requireAuthenticatedActor(ctx)
  assertActorMatches(actor, args.userId)
  const subscriptions = await ctx.db.query('notificationSubscriptions').withIndex('by_user', q => q.eq('userId', args.userId)).collect()
  const existing = subscriptions.find(s => s.tokenOrEndpoint === args.tokenOrEndpoint)
  if (existing) { await ctx.db.patch(existing._id, { enabled: true, updatedAt: Date.now() }); return existing._id }
  return await ctx.db.insert('notificationSubscriptions', { ...args, enabled: true, createdAt: Date.now(), updatedAt: Date.now() })
 }
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
        const actor = await requireAuthenticatedActor(ctx);
        assertActorMatches(actor, args.userId);
        const installationId = args.installationId.trim();
        const token = args.token.trim();
        if (!installationId || installationId.length > 160)
            throw new Error('push_installation_id_invalid');
        if (!token || token.length > 512)
            throw new Error('push_token_invalid');
        const now = Date.now();
        const expoToken = isExpoPushToken(token);
        const tokenOwners = expoToken
            ? await ctx.db
                .query('pushInstallations')
                .withIndex('by_token', (q) => q.eq('expoPushToken', token))
                .collect()
            : await ctx.db
                .query('pushInstallations')
                .withIndex('by_native_token', (q) => q.eq('nativePushToken', token))
                .collect();
        const existing = await ctx.db
            .query('pushInstallations')
            .withIndex('by_installation_id', (q) => q.eq('installationId', installationId))
            .unique();
        for (const tokenOwner of tokenOwners) {
            if (tokenOwner._id === existing?._id)
                continue;
            await ctx.db.patch(tokenOwner._id, {
                ...(expoToken ? { expoPushToken: undefined } : { nativePushToken: undefined }),
                enabled: false,
                failureReason: 'token_rotated',
                updatedAt: now,
            });
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
        };
        if (existing) {
            await ctx.db.patch(existing._id, values);
            return existing._id;
        }
        const id = await ctx.db.insert('pushInstallations', {
            installationId,
            ...values,
            createdAt: now,
        });
        await appendAuditEvent(ctx, {
            actorId: args.userId,
            entityType: 'pushInstallation',
            entityId: id,
            action: 'push_installation.registered',
            after: { environment: args.environment, platform: args.platform },
        });
        return id;
    },
});
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
        const actor = await requireAuthenticatedActor(ctx);
        assertActorMatches(actor, args.userId);
        const installationId = args.installationId.trim();
        if (!installationId || installationId.length > 160)
            throw new Error('push_installation_id_invalid');
        const now = Date.now();
        const existing = await ctx.db
            .query('pushInstallations')
            .withIndex('by_installation_id', (q) => q.eq('installationId', installationId))
            .unique();
        const enabled = (args.permissionState === 'granted' || args.permissionState === 'provisional') &&
            Boolean(existing?.nativePushToken);
        const values = {
            userId: args.userId,
            platform: args.platform,
            environment: args.environment,
            permissionState: args.permissionState,
            enabled,
            appVersion: args.appVersion,
            lastSeenAt: now,
            updatedAt: now,
        };
        if (existing) {
            await ctx.db.patch(existing._id, values);
            return existing._id;
        }
        return await ctx.db.insert('pushInstallations', {
            installationId,
            ...values,
            createdAt: now,
        });
    },
});
export const detachNativeInstallation = mutation({
 args: { userId: v.id('users'), installationId: v.string() },
 handler: async (ctx, args) => {
  const actor = await requireAuthenticatedActor(ctx)
  assertActorMatches(actor, args.userId)
  const installation = await ctx.db.query('pushInstallations').withIndex('by_installation_id', q => q.eq('installationId', args.installationId)).unique()
  if (!installation || installation.userId !== args.userId) return null
  await ctx.db.patch(installation._id, { userId: undefined, enabled: false, nativePushToken: undefined, expoPushToken: undefined, updatedAt: Date.now() })
  return installation._id
 }
})
export const getNativeStatus = query({
    args: { userId: v.id('users'), installationId: v.optional(v.string()) },
    handler: async (ctx, args) => {
        const actor = await requireAuthenticatedActor(ctx);
        assertActorMatches(actor, args.userId);
        const installation = args.installationId
            ? await ctx.db
                .query('pushInstallations')
                .withIndex('by_installation_id', (q) => q.eq('installationId', args.installationId!))
                .unique()
            : null;
        if (!installation || installation.userId !== args.userId)
            return null;
        return {
            enabled: installation.enabled,
            environment: installation.environment,
            failureReason: installation.failureReason,
            lastSeenAt: installation.lastSeenAt,
            permissionState: installation.permissionState,
            platform: installation.platform,
            registered: Boolean(installation.nativePushToken),
        };
    },
});
export const recordPushOpen = mutation({
    args: {
        userId: v.id('users'),
        installationId: v.string(),
        intentId: v.id('pushDeliveryIntents'),
    },
    handler: async (ctx, args) => {
        const actor = await requireAuthenticatedActor(ctx);
        assertActorMatches(actor, args.userId);
        const [installation, intent] = await Promise.all([
            ctx.db
                .query('pushInstallations')
                .withIndex('by_installation_id', (q) => q.eq('installationId', args.installationId))
                .unique(),
            ctx.db.get(args.intentId),
        ]);
        if (!installation ||
            installation.userId !== args.userId ||
            !intent ||
            intent.recipientUserId !== args.userId ||
            intent.installationId !== installation._id) {
            throw new Error('push_open_unauthorized');
        }
        if (intent.openedAt) {
            await ctx.db.patch(intent._id, {
                duplicateOpenCount: (intent.duplicateOpenCount ?? 0) + 1,
                updatedAt: Date.now(),
            });
            return { duplicate: true };
        }
        await ctx.db.patch(intent._id, { openedAt: Date.now(), updatedAt: Date.now() });
        return { duplicate: false };
    },
});
export const collectMessageNotificationTargets = internalQuery({
  args: { messageId: v.id('messages') },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId)
    if (!message) return null
    const [group, author, reply] = await Promise.all([
      ctx.db.get(message.groupId), ctx.db.get(message.authorId),
      message.replyToMessageId ? ctx.db.get(message.replyToMessageId) : null,
    ])
    if (!group) return null
    const memberships = await ctx.db.query('groupMembers').withIndex('by_group', q => q.eq('groupId', group._id)).collect()
    const targets = await Promise.all(memberships.filter(m => m.status === 'active' && m.userId !== message.authorId).map(async membership => {
      const [settings, groupSettings, subscriptions, installations, read] = await Promise.all([
        ctx.db.query('notificationSettings').withIndex('by_user', q => q.eq('userId', membership.userId)).unique(),
        ctx.db.query('groupNotificationSettings').withIndex('by_user_group', q => q.eq('userId', membership.userId).eq('groupId', group._id)).unique(),
        ctx.db.query('notificationSubscriptions').withIndex('by_user', q => q.eq('userId', membership.userId)).collect(),
        ctx.db.query('pushInstallations').withIndex('by_user', q => q.eq('userId', membership.userId)).collect(),
        ctx.db.query('groupReadStates').withIndex('by_user_group', q => q.eq('userId', membership.userId).eq('groupId', group._id)).unique(),
      ])
      const mentioned = message.mentions.includes(membership.userId)
      const directReply = reply?.authorId === membership.userId
      if (!shouldNotifyForMessage({ globalMode: settings?.globalMode ?? 'all', groupMode: groupSettings?.mode ?? 'inherit', mentioned, directReply })) return []
      if ((read?.lastReadAt ?? 0) >= message.createdAt) return []
      const eventKind = mentioned ? 'mention' : directReply ? 'direct_reply' : 'message'
      const unread = await ctx.db.query('messages').withIndex('by_group_created_at', q => q.eq('groupId', group._id).gt('createdAt', read?.lastReadAt ?? 0)).take(100)
      const badge = Math.min(99, unread.filter(m => m.authorId !== membership.userId).length)
      const web = subscriptions.filter(s => s.enabled && s.platform === 'web').map(s => ({
        kind: 'web' as const, subscriptionId: s._id, platform: 'web' as const,
        tokenOrEndpoint: s.tokenOrEndpoint, recipientUserId: membership.userId, eventKind,
      }))
      const native = installations.flatMap(i => {
        const token = i.nativePushToken
        if (!i.enabled || i.environment !== serverPushEnvironment() || !token || !['granted', 'provisional'].includes(i.permissionState)) return []
        return [{
          kind: 'native' as const, installationId: i._id, platform: i.platform,
          tokenOrEndpoint: token, recipientUserId: membership.userId,
          previewMode: settings?.previewMode ?? 'full', soundEnabled: settings?.soundEnabled ?? true,
          badge: settings?.badgesEnabled === false ? undefined : badge, eventKind,
        }]
      })
      return [...web, ...native]
    }))
    return {
      groupId: group._id, groupName: group.name, senderName: author?.displayName ?? 'Deleted user',
      messagePreview: message.body || message.notificationPreview || 'Sent an attachment.',
      targets: targets.flat(), url: '/workspace/groups/' + group._id,
    }
  },
})
export const collectUserNotificationTargets = internalQuery({
 args: { userId: v.id('users') },
 handler: async (ctx, args) => {
  const actor = await requireAuthenticatedActor(ctx)
  assertActorMatches(actor, args.userId)
  const [subscriptions, installations, settings] = await Promise.all([
   ctx.db.query('notificationSubscriptions').withIndex('by_user', q => q.eq('userId', args.userId)).collect(),
   ctx.db.query('pushInstallations').withIndex('by_user', q => q.eq('userId', args.userId)).collect(),
   ctx.db.query('notificationSettings').withIndex('by_user', q => q.eq('userId', args.userId)).unique(),
  ])
  return [
   ...subscriptions.filter(s => s.enabled).map(s => ({ kind: 'web' as const, subscriptionId: s._id, platform: 'web' as const, tokenOrEndpoint: s.tokenOrEndpoint })),
   ...installations.flatMap(i => {
    const token = i.nativePushToken
    return i.enabled && i.environment === serverPushEnvironment() && token
     ? [{ kind: 'native' as const, installationId: i._id, platform: i.platform, tokenOrEndpoint: token, soundEnabled: settings?.soundEnabled ?? true }] : []
   }),
  ]
 }
})
export const disableSubscription = internalMutation({
    args: {
        subscriptionId: v.id('notificationSubscriptions'),
    },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.subscriptionId, {
            enabled: false,
            updatedAt: Date.now(),
        });
    },
});
export const disableInstallation = internalMutation({
 args: { installationId: v.id('pushInstallations'), reason: v.string() },
 handler: async (ctx, args) => {
  await ctx.db.patch(args.installationId, { expoPushToken: undefined, nativePushToken: undefined, enabled: false, failureReason: args.reason.slice(0, 80), updatedAt: Date.now() })
 }
})
