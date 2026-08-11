import { useAction, useMutation, useQuery } from 'convex/react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { api } from '../../../../../../convex/_generated/api'
import type { Doc, Id } from '../../../../../../convex/_generated/dataModel'
import { notificationModes } from '#/features/workspace/constants'
import type { GroupMessageItem } from '#/features/workspace/thread-items'
import {
  getIncomingMessageNotificationBody,
  getNotificationPermission,
  getWebPushDiagnostics,
  requestNotificationPermission,
  serializePushSubscription,
  shouldNotifyForIncomingMessage,
  showMessageNotification,
  subscribeToWebPush,
  type WebNotificationPermission,
} from '#/features/workspace/web-notifications'
import { formatNumber } from '#/i18n'

type ProjectItem = {
  project: Doc<'projects'>
  membership: Doc<'projectMembers'>
}

export function useWorkspaceNotifications({
  activeGroup,
  activeGroupId,
  activeProject,
  trackUserId,
  visibleMessages,
  messagesLoaded,
}: {
  activeGroup: Doc<'groups'> | undefined
  activeGroupId: Id<'groups'> | null
  activeProject: ProjectItem | undefined
  trackUserId: Id<'users'> | null
  visibleMessages: Array<GroupMessageItem>
  messagesLoaded: boolean
}) {
  const { t } = useTranslation('workspace')
  const setGlobalNotificationMode = useMutation(api.notifications.setGlobalMode)
  const setGroupNotificationMode = useMutation(api.notifications.setGroupMode)
  const registerNotificationSubscription = useMutation(api.notifications.registerSubscription)
  const sendTestPushAction = useAction(api.pushNotifications.sendTestNotification)
  const notificationSettings = useQuery(
    api.notifications.getSettings,
    trackUserId ? { userId: trackUserId } : 'skip',
  )
  const webPushPublicKey = useQuery(api.notifications.getWebPushPublicKey)

  const [notificationPermission, setNotificationPermission] =
    useState<WebNotificationPermission>(getNotificationPermission)
  const [notificationStatus, setNotificationStatus] = useState<string | null>(null)
  const [notificationBusyAction, setNotificationBusyAction] = useState<string | null>(null)
  const hydratedNotificationMessagesRef = useRef(false)
  const notifiedMessageIdsRef = useRef(new Set<string>())
  const registeredPushUserRef = useRef<string | null>(null)

  const groupNotificationSettings = (notificationSettings?.groups ?? []) as Array<Doc<'groupNotificationSettings'>>
  const groupNotificationMode =
    groupNotificationSettings.find((item) => item.groupId === activeGroupId)?.mode ?? 'inherit'
  const globalNotificationMode = notificationSettings?.global?.globalMode ?? 'all'

  function setNotificationError(_error: unknown, fallback = t('notifications.errorGeneric')) {
    setNotificationStatus(`${fallback} (${getWebPushDiagnostics()})`)
  }

  function translatePushStep(step: string) {
    const steps: Record<string, string> = {
      'Checking push subscription...': t('notifications.steps.checkingSubscription'),
      'Checking service worker...': t('notifications.steps.checkingWorker'),
      'Checking push permission...': t('notifications.steps.checkingPermission'),
      'Claiming service worker...': t('notifications.steps.claimingWorker'),
      'Creating push subscription...': t('notifications.steps.creatingSubscription'),
      'Registering service worker...': t('notifications.steps.registeringWorker'),
      'Refreshing push subscription...': t('notifications.steps.refreshingSubscription'),
      'Saving push subscription...': t('notifications.steps.savingSubscription'),
      'Waiting for active push subscription...': t('notifications.steps.waitingActiveSubscription'),
      'Waiting for service worker...': t('notifications.steps.waitingWorker'),
    }
    const pushPermissionPrefix = 'Push permission: '
    return step.startsWith(pushPermissionPrefix)
      ? t('notifications.steps.pushPermission', { permission: step.slice(pushPermissionPrefix.length) })
      : steps[step] ?? t('notifications.steps.working')
  }

  async function registerBrowserPushSubscription(options: { forceRefresh?: boolean; onStep?: (step: string) => void } = {}) {
    if (!trackUserId) return
    if (!webPushPublicKey) {
      throw new Error(t('notifications.webPushUnavailable'))
    }
    const subscription = await subscribeToWebPush(webPushPublicKey, options)
    options.onStep?.('Saving push subscription...')
    await registerNotificationSubscription({
      userId: trackUserId,
      platform: 'web',
      ...serializePushSubscription(subscription),
    })
  }

  useEffect(() => {
    hydratedNotificationMessagesRef.current = false
    notifiedMessageIdsRef.current.clear()
  }, [activeGroupId])

  useEffect(() => {
    setNotificationPermission(getNotificationPermission())
  }, [])

  useEffect(() => {
    if (notificationPermission !== 'granted' || !trackUserId || !webPushPublicKey) return
    if (registeredPushUserRef.current === trackUserId) return
    registeredPushUserRef.current = trackUserId
    void registerBrowserPushSubscription().catch((error) => {
      registeredPushUserRef.current = null
      setNotificationError(error)
    })
  }, [notificationPermission, trackUserId, webPushPublicKey])

  useEffect(() => {
    if (!activeGroup || !activeProject || !activeGroupId || !trackUserId || !messagesLoaded) return
    if (notificationPermission !== 'granted') return

    if (!hydratedNotificationMessagesRef.current) {
      for (const item of visibleMessages) {
        notifiedMessageIdsRef.current.add(item.message._id)
      }
      hydratedNotificationMessagesRef.current = true
      return
    }

    const latestMessage = visibleMessages.at(-1)
    if (!latestMessage || notifiedMessageIdsRef.current.has(latestMessage.message._id)) return
    notifiedMessageIdsRef.current.add(latestMessage.message._id)

    if (
      !shouldNotifyForIncomingMessage({
        authorId: latestMessage.message.authorId,
        currentUserId: trackUserId,
        globalMode: globalNotificationMode,
        groupMode: groupNotificationMode,
        mentions: latestMessage.message.mentions,
      })
    ) {
      return
    }

    void showMessageNotification({
      title: t('notifications.newMessageTitle', { author: latestMessage.author?.displayName ?? t('notifications.newMessage'), channel: activeGroup.name }),
      body: getIncomingMessageNotificationBody({
        body: latestMessage.message.body,
        attachments: latestMessage.attachments,
      }, {
        attachment: t('notifications.sentAttachment'),
        message: t('notifications.newMessage'),
        voiceNote: t('notifications.sentVoiceNote'),
      }).slice(0, 160),
      tag: `track-message-${latestMessage.message._id}`,
      url: window.location.pathname,
    }).catch(setNotificationError)
  }, [
    activeGroup,
    activeGroupId,
    activeProject,
    globalNotificationMode,
    groupNotificationMode,
    messagesLoaded,
    notificationPermission,
    trackUserId,
    visibleMessages,
  ])

  async function handleNotificationMode(mode: (typeof notificationModes)[number]) {
    if (!trackUserId) return
    setNotificationBusyAction('notifications')
    setNotificationStatus(null)
    try {
      if (mode === 'inherit') {
        if (!activeGroupId) return
        await setGroupNotificationMode({ userId: trackUserId, groupId: activeGroupId, mode })
        return
      }
      if (activeGroupId) {
        await setGroupNotificationMode({ userId: trackUserId, groupId: activeGroupId, mode })
      } else {
        await setGlobalNotificationMode({ userId: trackUserId, mode })
      }
    } catch (error) {
      setNotificationError(error)
    } finally {
      setNotificationBusyAction(null)
    }
  }

  async function handleEnableBrowserNotifications() {
    if (!trackUserId) return
    setNotificationStatus(null)
    setNotificationBusyAction('notifications')
    try {
      const permission = await requestNotificationPermission()
      setNotificationPermission(permission)
      if (permission === 'denied') {
        throw new Error(t('notifications.blocked'))
      }
      if (permission === 'unsupported') {
        throw new Error(t('notifications.unsupported'))
      }
      if (permission === 'granted') {
        await registerBrowserPushSubscription({
          onStep: (step) => setNotificationStatus(`${translatePushStep(step)} (${getWebPushDiagnostics()})`),
        })
        await showMessageNotification({
          title: t('notifications.enabledTitle'),
          body: t('notifications.enabledBody'),
          tag: 'track-notifications-enabled',
          url: window.location.pathname,
        })
        setNotificationStatus(t('notifications.reconnected'))
      }
    } catch (error) {
      setNotificationError(error, t('notifications.reconnectFailed'))
    } finally {
      setNotificationBusyAction(null)
    }
  }

  async function handleSendTestNotification() {
    if (!trackUserId) return
    setNotificationStatus(null)
    setNotificationBusyAction('test-notifications')
    try {
      let permission = getNotificationPermission()
      if (permission === 'default') {
        permission = await requestNotificationPermission()
        setNotificationPermission(permission as WebNotificationPermission)
      }
      if (permission !== 'granted') {
        throw new Error(permission === 'denied' ? t('notifications.blocked') : t('notifications.notEnabled'))
      }

      await registerBrowserPushSubscription({
        onStep: (step) => setNotificationStatus(`${translatePushStep(step)} (${getWebPushDiagnostics()})`),
      })
      setNotificationStatus(`${t('notifications.sendingTest')} (${getWebPushDiagnostics()})`)
      const result = await sendTestPushAction({ userId: trackUserId })
      if (result.attempted === 0) {
        throw new Error(t('notifications.noSubscription'))
      }
      if (result.sent === 0) {
        throw new Error(t('notifications.pushRejected'))
      }
      setNotificationStatus(t('notifications.testSent', { count: formatNumber(result.sent) }))
    } catch (error) {
      setNotificationError(error, t('notifications.testFailed'))
    } finally {
      setNotificationBusyAction(null)
    }
  }

  return {
    globalNotificationMode,
    groupNotificationMode,
    groupNotificationSettings,
    notificationBusyAction,
    notificationPermission,
    notificationStatus,
    handleEnableBrowserNotifications,
    handleNotificationMode,
    handleSendTestNotification,
  }
}
