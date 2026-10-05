import { resolveReleaseFeatureFlag } from '@track/shared/feature-flags'
import { v } from 'convex/values'

import { internalQuery, mutation, query } from './_generated/server'
import { serverPushEnvironment } from './notifications'
import { requireAuthenticatedActor } from './lib/actorContext'
import { requireTaskAccess, resolveTaskRequestContext } from './lib/taskPolicy'
import { taskNotificationMode } from './schema/taskValidators'

const identityArgs = {
  actingCompanyId: v.optional(v.id('companies')),
  projectMemberId: v.optional(v.id('projectMembers')),
}

export const list = query({
  args: { projectId: v.id('projects'), ...identityArgs },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    const access = await resolveTaskRequestContext(
      ctx,
      actor,
      args.projectId,
      args,
    )
    if (access.capabilities.accessMode !== 'active') return []
    const rows = await ctx.db
      .query('taskNotifications')
      .withIndex('by_member_created_at', (q) =>
        q.eq('recipientProjectMemberId', access.projectMember._id),
      )
      .order('desc')
      .take(100)
    const visible = []
    for (const row of rows) {
      try {
        await requireTaskAccess(ctx, actor, row.taskId, args)
        visible.push(row)
      } catch {
        continue
      }
    }
    return visible
  },
})

export const getPreference = query({
  args: { projectId: v.id('projects'), ...identityArgs },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    const access = await resolveTaskRequestContext(
      ctx,
      actor,
      args.projectId,
      args,
    )
    if (access.capabilities.accessMode !== 'active') return null
    const setting = await ctx.db
      .query('taskNotificationSettings')
      .withIndex('by_member', (q) =>
        q.eq('projectMemberId', access.projectMember._id),
      )
      .unique()
    return setting?.mode ?? 'all'
  },
})

export const collectPushTargets = internalQuery({
  args: { notificationId: v.id('taskNotifications') },
  handler: async (ctx, args) => {
    if (!resolveReleaseFeatureFlag(process.env.TRACK_TASKS_ENABLED)) return null
    const notification = await ctx.db.get(args.notificationId)
    if (!notification) return null
    const [task, recipient, project] = await Promise.all([
      ctx.db.get(notification.taskId),
      ctx.db.get(notification.recipientProjectMemberId),
      ctx.db.get(notification.projectId),
    ])
    if (
      !task ||
      !recipient ||
      !project ||
      recipient.userId !== notification.recipientUserId ||
      (recipient.status !== undefined && recipient.status !== 'active') ||
      task.archivedAt
    )
      return null
    if (task.groupId) {
      const groupMember = await ctx.db
        .query('groupMembers')
        .withIndex('by_group_project_member', (q) =>
          q.eq('groupId', task.groupId!).eq('projectMemberId', recipient._id),
        )
        .unique()
      const legacy =
        groupMember ??
        (await ctx.db
          .query('groupMembers')
          .withIndex('by_group_user', (q) =>
            q.eq('groupId', task.groupId!).eq('userId', recipient.userId),
          )
          .unique())
      if (
        !legacy ||
        (legacy.status !== undefined && legacy.status !== 'active')
      )
        return null
    }
    if (project.accessProfile === 'company') {
      if (!recipient.companyId || !recipient.projectCompanyId) return null
      const [company, projectCompany, companyMember] = await Promise.all([
        ctx.db.get(recipient.companyId),
        ctx.db.get(recipient.projectCompanyId),
        ctx.db
          .query('companyMembers')
          .withIndex('by_company_user', (q) =>
            q
              .eq('companyId', recipient.companyId!)
              .eq('userId', recipient.userId),
          )
          .unique(),
      ])
      if (
        company?.status !== 'active' ||
        projectCompany?.status !== 'active' ||
        companyMember?.status !== 'active'
      )
        return null
    }
    const [setting, globalSetting] = await Promise.all([
      ctx.db.query('taskNotificationSettings')
        .withIndex('by_member', (q) => q.eq('projectMemberId', recipient._id)).unique(),
      ctx.db.query('notificationSettings')
        .withIndex('by_user', (q) => q.eq('userId', recipient.userId)).unique(),
    ])
    const mode = setting?.mode ?? globalSetting?.taskMode ?? 'all'
    const important = [
      'assignment',
      'mention',
      'due_soon',
      'overdue',
      'assignment_lost',
      'urgent_update',
    ].includes(notification.eventType)
    if (mode === 'muted' || (mode === 'important' && !important)) return null
    const [subscriptions, installations] = await Promise.all([
      ctx.db.query('notificationSubscriptions')
        .withIndex('by_user', (q) => q.eq('userId', recipient.userId)).collect(),
      ctx.db.query('pushInstallations')
        .withIndex('by_user', (q) => q.eq('userId', recipient.userId)).collect(),
    ])
    const targets = [
      ...subscriptions
        .filter((subscription) => subscription.enabled && subscription.platform === 'web' &&
          (!subscription.projectMemberId || subscription.projectMemberId === recipient._id))
        .map((subscription) => ({
          kind: 'web' as const,
          subscriptionId: subscription._id,
          platform: 'web' as const,
          tokenOrEndpoint: subscription.tokenOrEndpoint,
          exactMembership: subscription.projectMemberId === recipient._id,
        })),
      ...installations
        .filter((installation) => installation.enabled &&
          installation.environment === serverPushEnvironment() &&
          Boolean(installation.nativePushToken) &&
          (installation.permissionState === 'granted' || installation.permissionState === 'provisional'))
        .map((installation) => ({
          kind: 'native' as const,
          installationId: installation._id,
          platform: installation.platform,
          tokenOrEndpoint: installation.nativePushToken!,
          recipientUserId: recipient.userId,
          previewMode: globalSetting?.previewMode ?? 'full',
          soundEnabled: globalSetting?.soundEnabled ?? true,
          badge: globalSetting?.badgesEnabled === false ? undefined : 0,
          eventKind: notification.eventType,
        })),
      ...subscriptions
        .filter((subscription) => subscription.enabled && subscription.platform !== 'web' &&
          !installations.some((installation) =>
            (installation.nativePushToken ?? installation.expoPushToken) === subscription.tokenOrEndpoint) &&
          (!subscription.projectMemberId || subscription.projectMemberId === recipient._id))
        .map((subscription) => ({
          kind: 'legacy_native' as const,
          subscriptionId: subscription._id,
          platform: subscription.platform,
          tokenOrEndpoint: subscription.tokenOrEndpoint,
          recipientUserId: recipient.userId,
          previewMode: globalSetting?.previewMode ?? 'context',
          soundEnabled: globalSetting?.soundEnabled ?? true,
          badge: globalSetting?.badgesEnabled === false ? undefined : 0,
          eventKind: notification.eventType,
          exactMembership: subscription.projectMemberId === recipient._id,
        })),
    ]
    const taskBadge = (await ctx.db.query('taskNotifications')
      .withIndex('by_member_read', (q) => q.eq('recipientProjectMemberId', recipient._id).eq('readAt', undefined))
      .take(99)).length
    for (const target of targets) {
      if (target.kind !== 'web' && target.badge !== undefined) target.badge = taskBadge
    }
    const uniqueTargets = new Map<string, (typeof targets)[number]>()
    for (const target of targets) {
      const key = target.kind === 'native'
        ? `native:${target.installationId}`
        : `${target.kind}:${target.tokenOrEndpoint}`
      const existing = uniqueTargets.get(key)
      if (!existing || ('exactMembership' in target && target.exactMembership)) uniqueTargets.set(key, target)
    }
    const identityQuery = recipient.companyId
      ? `&actingCompanyId=${recipient.companyId}&projectMemberId=${recipient._id}`
      : ''
    const mobileIdentity = recipient.companyId
      ? `&companyId=${recipient.companyId}&membershipId=${recipient._id}`
      : ''
    return {
      companyId: recipient.companyId,
      eventKind: notification.eventType,
      projectId: task.projectId,
      projectName: project.name,
      publicKey: task.publicKey,
      taskTitle: task.title,
      recipientProjectMemberId: recipient._id,
      targets: Array.from(uniqueTargets.values()),
      url: `/workspace/projects/${task.projectId}/tasks?view=all&task=${task.publicKey}${identityQuery}`,
      mobileUrl: `/task?projectId=${task.projectId}&taskKey=${task.publicKey}${mobileIdentity}`,
    }
  },
})

export const markRead = mutation({
  args: { notificationId: v.id('taskNotifications'), ...identityArgs },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    const row = await ctx.db.get(args.notificationId)
    if (!row) throw new Error('task_access_changed')
    const access = await requireTaskAccess(ctx, actor, row.taskId, args)
    if (row.recipientProjectMemberId !== access.projectMember._id)
      throw new Error('task_access_changed')
    await ctx.db.patch(row._id, { readAt: row.readAt ?? Date.now() })
    return row._id
  },
})

/** Opening a task acknowledges every unread event represented by its one Home row. */
export const markTaskRead = mutation({
  args: { taskId: v.id('tasks'), ...identityArgs },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    const access = await requireTaskAccess(ctx, actor, args.taskId, args)
    const rows = await ctx.db.query('taskNotifications')
      .withIndex('by_member_task_read', (q) =>
        q.eq('recipientProjectMemberId', access.projectMember._id)
          .eq('taskId', args.taskId)
          .eq('readAt', undefined),
      )
      .collect()
    const now = Date.now()
    const matching = rows.filter((row) => row.recipientUserId === actor.user._id)
    await Promise.all(matching.map((row) => ctx.db.patch(row._id, { readAt: now })))
    return matching.length
  },
})

export const markAllRead = mutation({
  args: { projectId: v.id('projects'), ...identityArgs },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    const access = await resolveTaskRequestContext(
      ctx,
      actor,
      args.projectId,
      args,
    )
    if (access.capabilities.accessMode !== 'active')
      throw new Error('task_access_changed')
    const rows = await ctx.db
      .query('taskNotifications')
      .withIndex('by_member_read', (q) =>
        q
          .eq('recipientProjectMemberId', access.projectMember._id)
          .eq('readAt', undefined),
      )
      .collect()
    let updated = 0
    for (const row of rows) {
      try {
        await requireTaskAccess(ctx, actor, row.taskId, args)
        await ctx.db.patch(row._id, { readAt: Date.now() })
        updated += 1
      } catch {
        continue
      }
    }
    return updated
  },
})

export const setPreference = mutation({
  args: {
    projectId: v.id('projects'),
    mode: taskNotificationMode,
    ...identityArgs,
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    const access = await resolveTaskRequestContext(
      ctx,
      actor,
      args.projectId,
      args,
    )
    if (access.capabilities.accessMode !== 'active')
      throw new Error('task_access_changed')
    const existing = await ctx.db
      .query('taskNotificationSettings')
      .withIndex('by_member', (q) =>
        q.eq('projectMemberId', access.projectMember._id),
      )
      .unique()
    const now = Date.now()
    if (existing)
      await ctx.db.patch(existing._id, { mode: args.mode, updatedAt: now })
    else
      await ctx.db.insert('taskNotificationSettings', {
        projectId: args.projectId,
        projectMemberId: access.projectMember._id,
        mode: args.mode,
        createdAt: now,
        updatedAt: now,
      })
    return args.mode
  },
})
