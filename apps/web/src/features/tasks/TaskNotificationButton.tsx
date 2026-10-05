import { Link } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { Bell, CalendarClock, CheckCircle2, CircleAlert, MessageCircle } from 'lucide-react'
import { useState } from 'react'

import { api } from '../../../../../convex/_generated/api'
import type { Id } from '../../../../../convex/_generated/dataModel'
import { Button } from '#/components/ui/button'
import { NativeSelect, NativeSelectOption } from '#/components/ui/native-select'
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from '#/components/ui/popover'
import { formatEnumLabel } from '#/features/workspace/lib/formatting'
import { formatTaskTimestamp } from './task-date'
import { taskIdentity } from './task-types'
import './task-views.css'

export function TaskNotificationButton({
  groupId,
  identity,
  projectId,
  linkToTaskWorkspace = false,
  triggerClassName,
}: {
  groupId?: string
  identity: ReturnType<typeof taskIdentity>
  projectId: Id<'projects'>
  linkToTaskWorkspace?: boolean
  triggerClassName?: string
}) {
  const notifications = useQuery(api.taskNotifications.list, { projectId, ...identity })
  const preference = useQuery(api.taskNotifications.getPreference, { projectId, ...identity })
  const markRead = useMutation(api.taskNotifications.markRead)
  const markAllRead = useMutation(api.taskNotifications.markAllRead)
  const setPreference = useMutation(api.taskNotifications.setPreference)
  const [eventFilter, setEventFilter] = useState('all')
  const [readFilter, setReadFilter] = useState<'all' | 'unread' | 'read'>('all')
  const unread = notifications?.filter((item) => !item.readAt).length ?? 0
  const eventTypes = Array.from(new Set((notifications ?? []).map((item) => item.eventType))).sort()
  const visibleNotifications = (notifications ?? []).filter((item) =>
    (eventFilter === 'all' || item.eventType === eventFilter) &&
    (readFilter === 'all' || (readFilter === 'unread' ? !item.readAt : Boolean(item.readAt))),
  )

  if (linkToTaskWorkspace) return <Link
    aria-label={`Open task workspace${unread ? `, ${unread} unread task notifications` : ''}`}
    className={triggerClassName}
    params={{ projectId }}
    search={{ actingCompanyId: identity.actingCompanyId, groupId, projectMemberId: identity.projectMemberId, view: 'list' }}
    to="/workspace/projects/$projectId/tasks"
  ><Bell aria-hidden="true" size={14} />{unread ? <span>{unread}</span> : null}</Link>

  return <div className="task-notification-actions"><Popover><PopoverTrigger render={<Button aria-label={`${unread} unread task notifications`} className={triggerClassName} variant="outline" />}><Bell aria-hidden="true" size={14} />{unread ? <span>{unread}</span> : null}</PopoverTrigger><PopoverContent align="end" className="task-notification-feed">
    <PopoverHeader className="task-notification-header"><div><span className="task-notification-eyebrow">Task activity</span><PopoverTitle>Notifications</PopoverTitle><PopoverDescription>Updates for this Project membership.</PopoverDescription></div><Button disabled={!unread} onClick={() => void markAllRead({ projectId, ...identity })} size="sm" variant="ghost">Mark all read</Button></PopoverHeader>
    <div className="task-notification-controls">
      <NativeSelect aria-label="Task push preference" onChange={(event) => void setPreference({ projectId, mode: event.target.value as 'important' | 'all_followed' | 'muted', ...identity })} value={preference ?? 'important'}>{['important', 'all_followed', 'muted'].map((mode) => <NativeSelectOption key={mode} value={mode}>{formatEnumLabel(mode)}</NativeSelectOption>)}</NativeSelect>
      <NativeSelect aria-label="Notification type" onChange={(event) => setEventFilter(event.target.value)} value={eventFilter}><NativeSelectOption value="all">All types</NativeSelectOption>{eventTypes.map((eventType) => <NativeSelectOption key={eventType} value={eventType}>{formatEnumLabel(eventType)}</NativeSelectOption>)}</NativeSelect>
      <NativeSelect aria-label="Notification status" onChange={(event) => setReadFilter(event.target.value as typeof readFilter)} value={readFilter}><NativeSelectOption value="all">All statuses</NativeSelectOption><NativeSelectOption value="unread">Unread</NativeSelectOption><NativeSelectOption value="read">Read</NativeSelectOption></NativeSelect>
    </div>
    <div className="task-notification-list">{visibleNotifications.map((item) => <Link
      className={item.readAt ? 'task-notification-card' : 'task-notification-card unread'}
      key={item._id}
      onClick={() => void markRead({ notificationId: item._id, ...identity })}
      params={{ projectId }}
      search={{
        actingCompanyId: identity.actingCompanyId,
        groupId,
        projectMemberId: identity.projectMemberId,
        task: String(item.payload?.publicKey ?? ''),
        view: 'list',
      }}
      to="/workspace/projects/$projectId/tasks"
    ><span className={`task-notification-icon task-notification-icon-${notificationEventTone(item.eventType)}`}><NotificationEventIcon eventType={item.eventType} /></span><span className="task-notification-copy"><strong>{notificationEventLabel(item.eventType)}</strong><span>{item.payload?.publicKey ? `Task ${item.payload.publicKey}` : 'Project update'}</span><small>{formatTaskTimestamp(item.createdAt)} · {item.readAt ? 'Read' : 'Unread'}</small></span><span className="task-notification-view">View</span></Link>)}</div>
    {notifications === undefined ? <p className="task-notification-empty">Loading notifications…</p> : !notifications.length ? <p className="task-notification-empty">No task notifications yet.</p> : notifications.length !== visibleNotifications.length && !visibleNotifications.length ? <p className="task-notification-empty">No notifications match these filters.</p> : null}
  </PopoverContent></Popover></div>
}

function notificationEventLabel(eventType: string) {
  const labels: Record<string, string> = {
    assignment: 'Task assigned',
    assignment_lost: 'Assignment changed',
    comment: 'New task comment',
    due_soon: 'Due date approaching',
    mention: 'Mentioned in task',
    overdue: 'Task overdue',
    urgent_update: 'Urgent task update',
    task_changed: 'Task updated',
    task_suggestion: 'Task suggestion',
    thread_activity: 'Thread activity',
  }
  return labels[eventType] ?? formatEnumLabel(eventType)
}

function notificationEventTone(eventType: string) {
  if (eventType === 'overdue' || eventType === 'assignment_lost' || eventType === 'urgent_update') return 'alert'
  if (eventType === 'due_soon') return 'warning'
  if (eventType === 'comment' || eventType === 'mention' || eventType === 'thread_activity') return 'message'
  return 'success'
}

function NotificationEventIcon({ eventType }: { eventType: string }) {
  if (eventType === 'overdue' || eventType === 'assignment_lost' || eventType === 'urgent_update') return <CircleAlert aria-hidden="true" size={14} />
  if (eventType === 'due_soon') return <CalendarClock aria-hidden="true" size={14} />
  if (eventType === 'comment' || eventType === 'mention' || eventType === 'thread_activity') return <MessageCircle aria-hidden="true" size={14} />
  return <CheckCircle2 aria-hidden="true" size={14} />
}
