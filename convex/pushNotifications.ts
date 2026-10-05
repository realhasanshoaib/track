'use node'

import { v } from 'convex/values'
import webPush from 'web-push'

import { internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { action, internalAction } from './_generated/server'
import { sendNativePushBatch } from './lib/nativePush'
import { messagePushCopy, taskPushCopy } from './lib/pushDelivery'
import type { NativePushInput } from './lib/pushProviderTypes'

type NativeTarget = {
  actingCompanyId?: string
  badge?: number
  eventKind: string
  installationId: Id<'pushInstallations'>
  kind: 'native'
  platform: 'ios' | 'android'
  previewMode: 'full' | 'context' | 'hidden'
  projectMemberId?: string
  recipientUserId: Id<'users'>
  soundEnabled: boolean
  tokenOrEndpoint: string
}

type WebTarget = {
  actingCompanyId?: string
  eventKind?: string
  kind: 'web'
  platform: 'web'
  projectMemberId?: string
  recipientUserId?: Id<'users'>
  subscriptionId: Id<'notificationSubscriptions'>
  tokenOrEndpoint: string
}

type LegacyNativeTarget = Omit<NativeTarget, 'installationId' | 'kind'> & {
  kind: 'legacy_native'
  subscriptionId: Id<'notificationSubscriptions'>
}

export function resolveMessageNotificationUrls(input: {
  actingCompanyId?: string
  channelThreadId?: string
  groupId: string
  legacyWebUrl: string
  messageId: string
  projectId: string
  projectMemberId?: string
}) {
  const represented = input.actingCompanyId && input.projectMemberId
    ? { companyId: input.actingCompanyId, membershipId: input.projectMemberId }
    : null
  const representedSearch = represented ? `?${new URLSearchParams(represented)}` : ''
  const webUrl = input.channelThreadId
    ? `/workspace/projects/${encodeURIComponent(input.projectId)}/groups/${encodeURIComponent(input.groupId)}/threads/${encodeURIComponent(input.channelThreadId)}${representedSearch}#message-${encodeURIComponent(input.messageId)}`
    : represented
      ? `/workspace/company-projects/${encodeURIComponent(input.projectId)}?${new URLSearchParams({
          ...represented,
          groupId: input.groupId,
        })}#message-${encodeURIComponent(input.messageId)}`
      : `${input.legacyWebUrl}#message-${encodeURIComponent(input.messageId)}`
  const mobileContext = represented
    ? `&companyId=${encodeURIComponent(represented.companyId)}&membershipId=${encodeURIComponent(represented.membershipId)}`
    : ''
  const mobileUrl = input.channelThreadId
    ? `/thread?projectId=${encodeURIComponent(input.projectId)}&groupId=${encodeURIComponent(input.groupId)}&threadId=${encodeURIComponent(input.channelThreadId)}${mobileContext}&messageId=${encodeURIComponent(input.messageId)}`
    : `/conversation?projectId=${encodeURIComponent(input.projectId)}&groupId=${encodeURIComponent(input.groupId)}${mobileContext}&messageId=${encodeURIComponent(input.messageId)}`
  return { mobileUrl, webUrl }
}

function webPushDetails() {
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) return false
  webPush.setVapidDetails(process.env.VAPID_SUBJECT ?? 'mailto:support@q9labs.ai', publicKey, privateKey)
  return true
}

export const deliverMessageNotifications = internalAction({
  args: { messageId: v.id('messages') },
  handler: async (ctx, args) => {
    const notification = await ctx.runQuery(internal.notifications.collectMessageNotificationTargets, args)
    if (!notification) return
    if (!notification.targets.length) {
      await ctx.runMutation(internal.pushDelivery.recordEvent, {
        sourceKind: 'message', sourceId: String(args.messageId), eventKind: 'message',
        eligibleRecipientCount: 0, createdIntentCount: 0, webTargetCount: 0,
      })
      return
    }
    const webConfigured = webPushDetails()
    const nativeIntentIds: Array<Id<'pushDeliveryIntents'>> = []
    await Promise.all(notification.targets.map(async (rawTarget) => {
      const target = rawTarget as NativeTarget | LegacyNativeTarget | WebTarget
      const urls = resolveMessageNotificationUrls({
        actingCompanyId: target.actingCompanyId,
        channelThreadId: notification.channelThreadId,
        groupId: String(notification.groupId),
        legacyWebUrl: notification.url,
        messageId: String(args.messageId),
        projectId: String(notification.projectId),
        projectMemberId: target.projectMemberId,
      })
      const copy = messagePushCopy({
        eventKind: target.eventKind ?? 'message',
        senderName: notification.senderName,
        groupName: notification.groupName,
        threadName: notification.channelThreadName,
        messagePreview: notification.messagePreview,
        previewMode: target.kind === 'web' ? 'context' : target.previewMode,
      })
      if (target.kind === 'web') {
        if (['mention', 'direct_reply', 'thread_reply'].includes(target.eventKind ?? 'message')) return
        if (!webConfigured) return
        try {
          await webPush.sendNotification(JSON.parse(target.tokenOrEndpoint), JSON.stringify({
            ...copy, icon: '/logo192.png', tag: `track-message-${args.messageId}`, url: urls.webUrl,
          }))
        } catch (error) {
          const statusCode = typeof error === 'object' && error && 'statusCode' in error ? error.statusCode : null
          if (statusCode === 404 || statusCode === 410) {
            await ctx.runMutation(internal.notifications.disableSubscription, { subscriptionId: target.subscriptionId })
          }
        }
        return
      }
      const installationId = target.kind === 'native'
        ? target.installationId
        : await ctx.runMutation(internal.notifications.migrateLegacyNativeSubscription, {
            subscriptionId: target.subscriptionId,
          })
      if (!installationId) return
      const intentId = await ctx.runMutation(internal.pushDelivery.createIntent, {
        sourceKind: 'message',
        sourceId: String(args.messageId),
        eventKind: target.eventKind,
        recipientUserId: target.recipientUserId,
        recipientProjectMemberId: target.projectMemberId as Id<'projectMembers'> | undefined,
        installationId,
        idempotencyKey: `message:${args.messageId}:${target.projectMemberId ?? 'legacy'}:${installationId}`,
        title: copy.title,
        body: copy.body,
        data: {
          schemaVersion: '1',
          eventKind: target.eventKind,
          projectId: String(notification.projectId),
          groupId: String(notification.groupId),
          messageId: String(args.messageId),
          ...(notification.channelThreadId ? { threadId: String(notification.channelThreadId) } : {}),
          ...(target.actingCompanyId ? { companyId: String(target.actingCompanyId) } : {}),
          ...(target.projectMemberId ? { membershipId: String(target.projectMemberId) } : {}),
          url: urls.mobileUrl,
        },
        soundEnabled: target.soundEnabled,
        badge: target.badge,
        ttlMs: 24 * 60 * 60 * 1_000,
        deferDispatch: true,
      })
      if (intentId) nativeIntentIds.push(intentId)
    }))
    for (let index = 0; index < nativeIntentIds.length; index += 100) {
      await ctx.runAction(internal.pushNotifications.dispatchDeliveryBatch, {
        intentIds: nativeIntentIds.slice(index, index + 100),
      })
    }
    await ctx.runMutation(internal.pushDelivery.recordEvent, {
      sourceKind: 'message',
      sourceId: String(args.messageId),
      eventKind: 'message',
      eligibleRecipientCount: new Set(notification.targets.map((target) =>
        `${target.recipientUserId ?? 'web'}:${target.projectMemberId ?? 'legacy'}`)).size,
      createdIntentCount: nativeIntentIds.length,
      webTargetCount: notification.targets.filter((target) => target.kind === 'web').length,
    })
  },
})

export const deliverTaskNotification = internalAction({
  args: { notificationId: v.id('taskNotifications') },
  handler: async (ctx, args) => {
    const notification = await ctx.runQuery((internal as any).taskNotifications.collectPushTargets, args)
    if (!notification) return
    if (!notification.targets.length) {
      await ctx.runMutation(internal.pushDelivery.recordEvent, {
        sourceKind: 'task', sourceId: String(args.notificationId), eventKind: notification.eventKind,
        eligibleRecipientCount: 0, createdIntentCount: 0, webTargetCount: 0,
      })
      return
    }
    const webConfigured = webPushDetails()
    const nativeIntentIds: Array<Id<'pushDeliveryIntents'>> = []
    await Promise.all(notification.targets.map(async (rawTarget: NativeTarget | LegacyNativeTarget | WebTarget) => {
      const copy = taskPushCopy({
        eventKind: notification.eventKind,
        projectName: notification.projectName,
        publicKey: notification.publicKey,
        taskTitle: notification.taskTitle,
        previewMode: rawTarget.kind === 'web' ? 'context' : rawTarget.previewMode,
      })
      if (rawTarget.kind === 'web') {
        if (['assignment', 'comment', 'due_soon', 'mention', 'overdue', 'task_changed', 'urgent_update'].includes(notification.eventKind)) return
        if (!webConfigured) return
        try {
          await webPush.sendNotification(JSON.parse(rawTarget.tokenOrEndpoint), JSON.stringify({
            ...copy, icon: '/logo192.png', tag: `track-task-${args.notificationId}`, url: notification.url,
          }))
        } catch (error) {
          const statusCode = typeof error === 'object' && error && 'statusCode' in error ? error.statusCode : null
          if (statusCode === 404 || statusCode === 410) {
            await ctx.runMutation(internal.notifications.disableSubscription, { subscriptionId: rawTarget.subscriptionId })
          }
        }
        return
      }
      const installationId = rawTarget.kind === 'native'
        ? rawTarget.installationId
        : await ctx.runMutation(internal.notifications.migrateLegacyNativeSubscription, {
            subscriptionId: rawTarget.subscriptionId,
          })
      if (!installationId) return
      const intentId = await ctx.runMutation(internal.pushDelivery.createIntent, {
        sourceKind: 'task',
        sourceId: String(args.notificationId),
        eventKind: notification.eventKind,
        recipientUserId: rawTarget.recipientUserId,
        recipientProjectMemberId: notification.recipientProjectMemberId,
        installationId,
        idempotencyKey: `task:${args.notificationId}:${notification.recipientProjectMemberId}:${installationId}`,
        title: copy.title,
        body: copy.body,
        data: {
          schemaVersion: '1', eventKind: notification.eventKind,
          projectId: String(notification.projectId), taskKey: notification.publicKey,
          ...(notification.companyId ? { companyId: String(notification.companyId) } : {}),
          membershipId: String(notification.recipientProjectMemberId),
          url: notification.mobileUrl,
        },
        soundEnabled: rawTarget.soundEnabled,
        badge: rawTarget.badge,
        ttlMs: 24 * 60 * 60 * 1_000,
        deferDispatch: true,
      })
      if (intentId) nativeIntentIds.push(intentId)
    }))
    for (let index = 0; index < nativeIntentIds.length; index += 100) {
      await ctx.runAction(internal.pushNotifications.dispatchDeliveryBatch, {
        intentIds: nativeIntentIds.slice(index, index + 100),
      })
    }
    await ctx.runMutation(internal.pushDelivery.recordEvent, {
      sourceKind: 'task', sourceId: String(args.notificationId), eventKind: notification.eventKind,
      eligibleRecipientCount: 1,
      createdIntentCount: nativeIntentIds.length,
      webTargetCount: notification.targets.filter((target: any) => target.kind === 'web').length,
    })
  },
})

export const deliverCompanyInvitation = internalAction({
  args: { invitationId: v.id('companyInvitations') },
  handler: async (ctx, args) => {
    const invitation = await ctx.runQuery(internal.notifications.collectCompanyInvitationPushTargets, args)
    const sourceId = String(args.invitationId)
    if (!invitation?.targets.length) {
      await ctx.runMutation(internal.pushDelivery.recordEvent, {
        sourceKind: 'company_invitation', sourceId, eventKind: 'company_invitation',
        eligibleRecipientCount: 0, createdIntentCount: 0, webTargetCount: 0,
      })
      return
    }
    const intentIds: Array<Id<'pushDeliveryIntents'>> = []
    for (const target of invitation.targets) {
      const copy = target.previewMode === 'hidden'
        ? { title: 'Track', body: 'You have a new Company invitation.' }
        : target.previewMode === 'context'
          ? { title: 'Track', body: 'You were invited to join a Company.' }
          : {
              title: `Invitation to ${invitation.companyName}`,
              body: `You were invited to join as ${invitation.role}.`,
            }
      const intentId = await ctx.runMutation(internal.pushDelivery.createIntent, {
        sourceKind: 'company_invitation', sourceId, eventKind: 'company_invitation',
        recipientUserId: target.recipientUserId,
        installationId: target.installationId,
        idempotencyKey: `company-invitation:${args.invitationId}:${target.installationId}`,
        ...copy,
        data: {
          schemaVersion: '1', eventKind: 'company_invitation',
          url: `/inbox?filter=invitations&invitationId=${encodeURIComponent(sourceId)}`,
        },
        soundEnabled: target.soundEnabled,
        ttlMs: 60 * 60 * 1_000,
        deferDispatch: true,
      })
      if (intentId) intentIds.push(intentId)
    }
    for (let index = 0; index < intentIds.length; index += 100) {
      await ctx.runAction(internal.pushNotifications.dispatchDeliveryBatch, {
        intentIds: intentIds.slice(index, index + 100),
      })
    }
    await ctx.runMutation(internal.pushDelivery.recordEvent, {
      sourceKind: 'company_invitation', sourceId, eventKind: 'company_invitation',
      eligibleRecipientCount: 1, createdIntentCount: intentIds.length, webTargetCount: 0,
    })
  },
})

export const deliverProjectInvitation = internalAction({
  args: { invitationId: v.id('invitations') },
  handler: async (ctx, args) => {
    const invitation = await ctx.runQuery(internal.notifications.collectProjectInvitationPushTargets, args)
    const sourceId = String(args.invitationId)
    if (!invitation?.targets.length) {
      await ctx.runMutation(internal.pushDelivery.recordEvent, {
        sourceKind: 'project_invitation', sourceId, eventKind: 'project_invitation',
        eligibleRecipientCount: 0, createdIntentCount: 0, webTargetCount: 0,
      })
      return
    }
    const intentIds: Array<Id<'pushDeliveryIntents'>> = []
    for (const target of invitation.targets) {
      const copy = target.previewMode === 'hidden'
        ? { title: 'Track', body: 'You have a new Project invitation.' }
        : target.previewMode === 'context'
          ? { title: 'Track', body: 'You were invited to join a Project.' }
          : { title: `Invitation to ${invitation.projectName}`, body: 'You were invited to join a Project.' }
      const intentId = await ctx.runMutation(internal.pushDelivery.createIntent, {
        sourceKind: 'project_invitation', sourceId, eventKind: 'project_invitation',
        recipientUserId: target.recipientUserId,
        installationId: target.installationId,
        idempotencyKey: `project-invitation:${args.invitationId}:${target.installationId}`,
        ...copy,
        data: {
          schemaVersion: '1', eventKind: 'project_invitation', url: '/projects',
        },
        soundEnabled: target.soundEnabled,
        ttlMs: 60 * 60 * 1_000,
        deferDispatch: true,
      })
      if (intentId) intentIds.push(intentId)
    }
    for (let index = 0; index < intentIds.length; index += 100) {
      await ctx.runAction(internal.pushNotifications.dispatchDeliveryBatch, {
        intentIds: intentIds.slice(index, index + 100),
      })
    }
    await ctx.runMutation(internal.pushDelivery.recordEvent, {
      sourceKind: 'project_invitation', sourceId, eventKind: 'project_invitation',
      eligibleRecipientCount: 1, createdIntentCount: intentIds.length, webTargetCount: 0,
    })
  },
})

async function isIntentStillEligible(ctx: any, row: any) {
  const { intent, installation } = row
  if (!installation || !installation.enabled || !installation.nativePushToken ||
    installation.userId !== intent.recipientUserId ||
    !['granted', 'provisional'].includes(installation.permissionState)) return false
  if (intent.sourceKind === 'test') return true
  if (intent.sourceKind === 'message') {
    const current = await ctx.runQuery(internal.notifications.collectMessageNotificationTargets, {
      messageId: intent.sourceId as Id<'messages'>,
    })
    return Boolean(current?.targets.some((target: any) =>
      target.kind === 'native' && target.installationId === intent.installationId &&
      target.projectMemberId === intent.recipientProjectMemberId,
    ))
  }
  if (intent.sourceKind === 'company_invitation') {
    const current = await ctx.runQuery(internal.notifications.collectCompanyInvitationPushTargets, {
      invitationId: intent.sourceId as Id<'companyInvitations'>,
    })
    return Boolean(current?.targets.some((target: any) =>
      target.installationId === intent.installationId && target.recipientUserId === intent.recipientUserId,
    ))
  }
  if (intent.sourceKind === 'project_invitation') {
    const current = await ctx.runQuery(internal.notifications.collectProjectInvitationPushTargets, {
      invitationId: intent.sourceId as Id<'invitations'>,
    })
    return Boolean(current?.targets.some((target: any) =>
      target.installationId === intent.installationId && target.recipientUserId === intent.recipientUserId,
    ))
  }
  const current = await ctx.runQuery((internal as any).taskNotifications.collectPushTargets, {
    notificationId: intent.sourceId as Id<'taskNotifications'>,
  })
  return Boolean(current?.targets.some((target: any) =>
    target.kind === 'native' && target.installationId === intent.installationId,
  ))
}

export const dispatchDeliveryIntent = internalAction({
  args: { intentId: v.id('pushDeliveryIntents') },
  handler: async (ctx, args) => {
    await ctx.runAction((internal as any).pushNotifications.dispatchDeliveryBatch, { intentIds: [args.intentId] })
  },
})

export const dispatchDeliveryBatch = internalAction({
  args: { intentIds: v.array(v.id('pushDeliveryIntents')) },
  handler: async (ctx, args) => {
    const prepared: Array<{
      attemptNumber: number
      input: NativePushInput
      installationId: Id<'pushInstallations'>
      intentId: Id<'pushDeliveryIntents'>
    }> = []
    for (const intentId of args.intentIds.slice(0, 100)) {
      const row = await ctx.runQuery(internal.pushDelivery.getIntentForDispatch, { intentId })
      if (!row || !await isIntentStillEligible(ctx, row)) {
        await ctx.runMutation(internal.pushDelivery.cancelIntent, { intentId, reason: 'eligibility_changed' })
        continue
      }
      const attemptNumber = await ctx.runMutation(internal.pushDelivery.markSending, { intentId })
      if (!attemptNumber) continue
      prepared.push({
        attemptNumber,
        installationId: row.installation!._id,
        intentId,
        input: {
          token: row.installation!.nativePushToken!,
          title: row.intent.title,
          body: row.intent.body,
          environment: row.installation!.environment,
          expiresAt: row.intent.expiresAt,
          platform: row.installation!.platform,
          soundEnabled: row.intent.soundEnabled,
          badge: row.intent.badge,
          data: {
            ...(row.intent.data as Record<string, string>),
            intentId: String(row.intent._id),
            soundEnabled: row.intent.soundEnabled ? 'true' : 'false',
          },
        },
      })
    }
    if (!prepared.length) return
    const results = await sendNativePushBatch(prepared.map((item) => item.input))
    await Promise.all(prepared.map(async (item, index) => {
      const result = results[index]
      if (result.ok) {
        await ctx.runMutation(internal.pushDelivery.recordDelivery, {
          intentId: item.intentId,
          attemptNumber: item.attemptNumber,
          provider: result.provider,
          providerMessageId: result.providerMessageId,
          providerLatencyMs: result.latencyMs,
        })
        return
      }
      await ctx.runMutation(internal.pushDelivery.recordFailure, {
        intentId: item.intentId,
        attemptNumber: item.attemptNumber,
        category: result.category,
        permanent: result.permanent,
        providerLatencyMs: result.latencyMs,
      })
      if (result.category === 'device_not_registered') {
        await ctx.runMutation(internal.notifications.disableInstallation, {
          installationId: item.installationId, reason: result.category,
        })
      }
    }))
  },
})

export const verifyNativeProviderConnectivity = internalAction({
  args: {},
  handler: async () => {
    const expiresAt = Date.now() + 60_000
    const configuredEnvironment = process.env.TRACK_PUSH_ENVIRONMENT
    const environment = configuredEnvironment === 'preview' || configuredEnvironment === 'production'
      ? configuredEnvironment
      : 'development'
    const results = await sendNativePushBatch([
      {
        body: '',
        data: { eventKind: 'connectivity_probe', schemaVersion: '1' },
        environment,
        expiresAt,
        platform: 'ios',
        soundEnabled: false,
        title: 'Track',
        token: '0'.repeat(64),
      },
      {
        body: '',
        data: { eventKind: 'connectivity_probe', schemaVersion: '1' },
        environment,
        expiresAt,
        platform: 'android',
        soundEnabled: false,
        title: 'Track',
        token: `fcm-connectivity-probe:${'a'.repeat(140)}`,
      },
    ])
    return results.map((result) => result.ok
      ? { provider: result.provider, outcome: 'unexpected_acceptance' }
      : { provider: result.provider, outcome: result.category })
  },
})

export const sendTestNotification = action({
  args: { userId: v.id('users') },
  handler: async (ctx, args): Promise<{ attempted: number; queued: number; sent: number; failed: number }> => {
    const targets = await ctx.runQuery(internal.notifications.collectUserNotificationTargets, args)
    const webConfigured = webPushDetails()
    let queued = 0
    let failed = 0
    for (const rawTarget of targets) {
      const target = rawTarget as NativeTarget | LegacyNativeTarget | WebTarget
      if (target.kind === 'web') {
        if (!webConfigured) { failed += 1; continue }
        try {
          await webPush.sendNotification(JSON.parse(target.tokenOrEndpoint), JSON.stringify({
            title: 'Track test alert', body: 'Browser alerts are connected.', icon: '/logo192.png',
            tag: `track-test-${Date.now()}`, url: '/workspace',
          }))
          queued += 1
        } catch { failed += 1 }
        continue
      }
      const installationId = target.kind === 'native'
        ? target.installationId
        : await ctx.runMutation(internal.notifications.migrateLegacyNativeSubscription, {
            subscriptionId: target.subscriptionId,
          })
      if (!installationId) { failed += 1; continue }
      const sourceId = `test:${Date.now()}`
      const intentId = await ctx.runMutation(internal.pushDelivery.createIntent, {
        sourceKind: 'test', sourceId, eventKind: 'test', recipientUserId: args.userId,
        installationId,
        idempotencyKey: `${sourceId}:${installationId}`,
        title: 'Track test alert', body: 'Mobile alerts are connected.',
        data: { schemaVersion: '1', eventKind: 'test', url: '/projects' },
        soundEnabled: target.soundEnabled, ttlMs: 60_000,
      })
      if (intentId) queued += 1
      else failed += 1
    }
    await ctx.runMutation(internal.pushDelivery.recordEvent, {
      sourceKind: 'test', sourceId: `test:${Date.now()}`, eventKind: 'test',
      eligibleRecipientCount: targets.length ? 1 : 0, createdIntentCount: queued, webTargetCount: 0,
    })
    return { attempted: targets.length, queued, sent: queued, failed }
  },
})
