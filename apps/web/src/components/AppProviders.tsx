import { ConvexBetterAuthProvider } from '@convex-dev/better-auth/react'
import { useConvexAuth, useQuery } from 'convex/react'
import type { ComponentProps, ReactNode } from 'react'
import { useEffect, useRef } from 'react'

import { AppToastProvider, appToast } from '#/components/ui/app-toast'
import { TooltipProvider } from '#/components/ui/tooltip'
import { authClient } from '#/lib/auth-client'
import { convexClient } from '../lib/convex-client'
import { api } from '../../../../convex/_generated/api'

type ProviderAuthClient = ComponentProps<typeof ConvexBetterAuthProvider>['authClient']
const providerAuthClient = authClient as unknown as ProviderAuthClient

type LiveAlert = {
  description: string
  id: string
  title: string
  type: 'info' | 'warning'
}

function WebLiveAlerts() {
  const { isAuthenticated } = useConvexAuth()
  const user = useQuery(api.auth.getCurrentUser, isAuthenticated ? {} : 'skip')
  const attention = useQuery(api.mobile.listAttention, user ? {
    userId: user._id,
    paginationOpts: { cursor: null, numItems: 20 },
  } : 'skip')
  const projectInvitations = useQuery(
    api.invitations.listPendingForCurrentUser,
    user ? {} : 'skip',
  )
  const scopeRef = useRef<string | null>(null)
  const seenRef = useRef(new Set<string>())

  useEffect(() => {
    if (!isAuthenticated) {
      scopeRef.current = null
      seenRef.current.clear()
      return
    }
    if (!user || !attention || !projectInvitations) return

    const alerts: LiveAlert[] = []
    for (const item of attention.page) {
      const id = `${item.kind}:${item.id}`
      if (item.kind === 'task') {
        const alertCopy: Record<string, Pick<LiveAlert, 'title' | 'type'>> = {
          assignment: { title: 'Task assigned to you', type: 'info' },
          due_soon: { title: 'Task due soon', type: 'warning' },
          comment: { title: 'New task comment', type: 'info' },
          mention: { title: 'You were mentioned on a task', type: 'info' },
          overdue: { title: 'Task overdue', type: 'warning' },
          task_changed: { title: 'Task updated', type: 'info' },
          urgent_update: { title: 'Urgent task update', type: 'warning' },
        }
        const copy = alertCopy[item.eventType]
        if (copy) alerts.push({ id, ...copy, description: item.taskTitle })
      } else if (item.kind === 'message' && ['mention', 'direct_reply', 'thread_activity'].includes(item.eventType)) {
        const title = item.eventType === 'mention'
          ? 'You were mentioned'
          : item.eventType === 'direct_reply'
            ? 'You got a reply'
            : 'New activity in a followed thread'
        alerts.push({
          id,
          title,
          type: 'info',
          description: `${item.senderName} · ${item.groupName}`,
        })
      } else if (item.kind === 'invitation') {
        alerts.push({
          id,
          title: 'Company invitation',
          type: 'info',
          description: `Invitation to join ${item.companyName}`,
        })
      }
    }
    for (const invitation of projectInvitations) {
      alerts.push({
        id: `project-invitation:${invitation.id}`,
        title: 'Project invitation',
        type: 'info',
        description: `Invitation to join ${invitation.projectName}`,
      })
    }

    const scope = String(user._id)
    if (scopeRef.current !== scope) {
      scopeRef.current = scope
      seenRef.current = new Set(alerts.map((alert) => alert.id))
      return
    }
    for (const alert of alerts) {
      if (seenRef.current.has(alert.id)) continue
      seenRef.current.add(alert.id)
      if (alert.type === 'warning') appToast.warning(alert.title, alert.description)
      else appToast.info(alert.title, alert.description)
    }
  }, [attention, isAuthenticated, projectInvitations, user])

  return null
}

export default function AppProviders({
  children,
}: {
  children: ReactNode
}) {
  return (
    <ConvexBetterAuthProvider authClient={providerAuthClient} client={convexClient}>
      <TooltipProvider>
        <AppToastProvider>
          <WebLiveAlerts />
          {children}
        </AppToastProvider>
      </TooltipProvider>
    </ConvexBetterAuthProvider>
  )
}
