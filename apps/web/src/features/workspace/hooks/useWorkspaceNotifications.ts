import { useAction, useMutation, useQuery } from 'convex/react'
import { useEffect, useRef, useState } from 'react'

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
  const globalNotificationPreviewMode = notificationSettings?.global?.previewMode ?? 'hidden'

  function setNotificationError(error: unknown, fallback = 'Something went wrong') {
    const message = error instanceof Error ? error.message : fallback
    setNotificationStatus(`${message} (${getWebPushDiagnostics()})`)
  }

  async function registerBrowserPushSubscription(options: { forceRefresh?: boolean; onStep?: (step: string) => void } = {}) {
    if (!trackUserId) return
    if (!webPushPublicKey) {
      throw new Error('Web push is not configured for this environment.')
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

    const senderName = latestMessage.author?.displayName ?? 'A teammate'
    const notificationCopy = globalNotificationPreviewMode === 'full'
      ? {
          body: getIncomingMessageNotificationBody({
            body: latestMessage.message.body,
            attachments: latestMessage.attachments,
          }).slice(0, 160),
          title: `${senderName} in ${activeGroup.name}`,
        }
      : globalNotificationPreviewMode === 'context'
        ? {
            body: `New message from ${senderName} in ${activeGroup.name}`,
            title: 'Track',
          }
        : {
            body: latestMessage.message.mentions.includes(trackUserId)
              ? 'You were mentioned'
              : 'New conversation activity',
            title: 'Track',
          }

    void showMessageNotification({
      ...notificationCopy,
      tag: `track-message-${latestMessage.message._id}`,
      url: window.location.pathname,
    }).catch(setNotificationError)
  }, [
    activeGroup,
    activeGroupId,
    activeProject,
    globalNotificationMode,
    globalNotificationPreviewMode,
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
        throw new Error('Browser notifications are blocked for Track.')
      }
      if (permission === 'unsupported') {
        throw new Error('This browser does not support web notifications.')
      }
      if (permission === 'granted') {
        await registerBrowserPushSubscription({
          onStep: (step) => setNotificationStatus(`${step} (${getWebPushDiagnostics()})`),
        })
        await showMessageNotification({
          title: 'Track notifications enabled',
          body: 'You will get alerts for new project messages.',
          tag: 'track-notifications-enabled',
          url: window.location.pathname,
        })
        setNotificationStatus('Browser alerts reconnected.')
      }
    } catch (error) {
      setNotificationError(error, 'Browser alert reconnect failed.')
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
        throw new Error(permission === 'denied' ? 'Browser notifications are blocked for Track.' : 'Browser notifications are not enabled.')
      }

      await registerBrowserPushSubscription({
        onStep: (step) => setNotificationStatus(`${step} (${getWebPushDiagnostics()})`),
      })
      setNotificationStatus(`Sending server test... (${getWebPushDiagnostics()})`)
      const result = await sendTestPushAction({ userId: trackUserId })
      if (result.attempted === 0) {
        throw new Error('No browser push subscription was saved yet. Try reconnecting alerts and keep this tab open for a moment.')
      }
      if (result.sent === 0) {
        throw new Error('Track found your browser subscription, but the push service rejected the test alert.')
      }
      setNotificationStatus(`Test alert sent to ${result.sent} browser${result.sent === 1 ? '' : 's'}.`)
    } catch (error) {
      setNotificationError(error, 'Test alert failed.')
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
