import { useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { Bell, Columns3, Inbox, ListTodo, Plus, Settings2, UserRoundCheck } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useEffect, useMemo, useState } from 'react'

import { api } from '../../../../../convex/_generated/api'
import type { Id } from '../../../../../convex/_generated/dataModel'
import { Button } from '#/components/ui/button'
import { NativeSelect, NativeSelectOption } from '#/components/ui/native-select'
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from '#/components/ui/popover'
import { formatDate, formatNumber, useLocale } from '#/i18n'
import { useReleaseConfig } from '#/lib/release-config'
import { TaskAdminDialog } from './TaskAdminDialog'
import { TaskBoard } from './TaskBoard'
import { TaskCreateDialog } from './TaskCreateDialog'
import { TaskDetailDrawer } from './TaskDetailDrawer'
import { TaskInbox } from './TaskInbox'
import { taskIdentity, type TaskBoardView, type TaskView } from './task-types'
import { StateRing, TaskDenseRow } from './ui/TaskVisuals'

type TaskSearch = {
  actingCompanyId?: string
  projectMemberId?: string
  task?: string
  view?: 'inbox' | 'my' | 'all' | 'board'
  board?: string
  priority?: string
  due?: string
  state?: string
  label?: string
  archived?: boolean
}

const taskViews: Array<[NonNullable<TaskSearch['view']>, string, LucideIcon]> = [
  ['board', 'boards', Columns3],
  ['my', 'myTasks', UserRoundCheck],
  ['all', 'allTasks', ListTodo],
  ['inbox', 'inbox', Inbox],
]

export function TaskProjectPage({ projectId, search }: { projectId: string; search: TaskSearch }) {
  const { t } = useTranslation('tasks')
  const release = useReleaseConfig()
  const navigate = useNavigate()
  const identity = useMemo(() => taskIdentity(search), [search])
  const project = projectId as Id<'projects'>
  const currentUser = useQuery(api.auth.getCurrentUser)
  const labels = useQuery(api.taskLabels.list, release.tasks ? { projectId: project, ...identity } : 'skip')
  const boards = useQuery(api.taskBoards.list, release.tasks ? { projectId: project, ...identity } : 'skip') as
    | Array<TaskBoardView>
    | undefined
  const eligibleAssignees = useQuery(
    api.tasks.listEligibleAssignees,
    release.tasks ? { projectId: project, ...identity } : 'skip',
  )
  const selectedBoard = boards?.find((item) => item.board._id === search.board) ??
    boards?.find((item) => item.board.isDefault) ?? boards?.[0]
  const currentProjectMemberId = identity.projectMemberId ?? eligibleAssignees?.find(
    (item) => item.user._id === currentUser?._id,
  )?.member._id
  const taskRows = useQuery(
    api.tasks.list,
    release.tasks && search.view !== 'inbox'
      ? {
          projectId: project,
          boardId: search.view === 'board' ? selectedBoard?.board._id : undefined,
          assigneeProjectMemberId: search.view === 'my' ? currentProjectMemberId : undefined,
          openOnly: search.view === 'my',
          priority: search.priority && search.priority !== 'all' ? search.priority as 'none' | 'urgent' | 'high' | 'medium' | 'low' : undefined,
          workflowStateId: search.state && search.state !== 'all' ? search.state as Id<'taskWorkflowStates'> : undefined,
          dueState: search.due && search.due !== 'all' ? search.due as 'none' | 'upcoming' | 'due_today' | 'overdue' : undefined,
          localDate: new Date().toLocaleDateString('en-CA'),
          labelId: search.label && search.label !== 'all' ? search.label as Id<'taskLabels'> : undefined,
          includeArchived: search.archived,
          ...identity,
        }
      : 'skip',
  ) as Array<TaskView> | undefined
  const [createOpen, setCreateOpen] = useState(false)
  const [createWorkflowStateId, setCreateWorkflowStateId] = useState<Id<'taskWorkflowStates'>>()
  const [adminOpen, setAdminOpen] = useState(false)
  const [announcement, setAnnouncement] = useState('')

  const visibleTasks = taskRows ?? []
  const view = search.view ?? 'board'

  useEffect(() => {
    if (!search.board && selectedBoard && view === 'board') {
      void navigate({
        to: '/workspace/projects/$projectId/tasks',
        params: { projectId },
        search: { ...search, board: selectedBoard.board._id },
        replace: true,
      })
    }
  }, [navigate, projectId, search, search.board, selectedBoard, view])

  if (!release.tasks) {
    return <main className="task-page task-unavailable"><h1>{t('page.unavailableTitle')}</h1><p>{t('page.unavailableBody')}</p></main>
  }

  const conversationHref = identity.projectMemberId
    ? `/workspace/company-projects/${projectId}?companyId=${identity.actingCompanyId}&membershipId=${identity.projectMemberId}`
    : `/workspace/projects/${projectId}`
  const pageTitle = view === 'board'
    ? selectedBoard?.board.name ?? t('page.board')
    : view === 'my'
      ? t('page.myTasks')
      : view === 'inbox'
        ? t('page.suggestionInbox')
        : t('page.allTasks')

  return (
    <main className="task-page">
      <aside className="task-route-sidebar">
        <a className="task-route-brand" href="/workspace">
          <img alt="" height="21" src="/track-mark.svg" width="30" />
          <strong>Track</strong>
        </a>
        <a className="task-route-project" href={conversationHref}>
          <span className="task-route-project-glyph">{t('navigation.projectGlyph')}</span>
          <span><strong>{t('navigation.projectWorkspace')}</strong><small>{t('navigation.conversationAndWork')}</small></span>
        </a>
        <span className="task-route-label">{t('navigation.work')}</span>
        <nav aria-label={t('navigation.taskViews')} className="task-view-tabs">
        {taskViews.map(([value, label, Icon]) => (
          <Button
            aria-current={view === value ? 'page' : undefined}
            className={view === value ? 'active' : ''}
            key={String(value)}
            onClick={() => void navigate({
              to: '/workspace/projects/$projectId/tasks', params: { projectId },
              search: { ...search, view: value },
            })}
            variant="ghost"
          >
            <Icon size={14} /> {t(`navigation.${label}`)}
          </Button>
        ))}
        </nav>
        <a className="task-route-conversation" href={conversationHref}>{t('navigation.projectConversation')}</a>
      </aside>

      <section className="task-page-main">
        <header className="task-page-header">
          <div>
            <span className="task-eyebrow">{t('navigation.projectWork')}</span>
            <h1>{pageTitle}</h1>
          </div>
          <div className="task-header-actions">
            <Button onClick={() => { setCreateWorkflowStateId(undefined); setCreateOpen(true) }}><Plus size={14} /> {t('navigation.newTask')}</Button>
            <Button aria-label={t('navigation.taskSettings')} onClick={() => setAdminOpen(true)} variant="outline"><Settings2 size={14} /></Button>
            <TaskNotificationButton identity={identity} projectId={project} />
          </div>
        </header>

        {view === 'inbox' ? (
          <TaskInbox boards={boards ?? []} identity={identity} projectId={project} onAnnounce={setAnnouncement} />
        ) : (
          <section className="task-workspace">
          <div className="task-toolbar">
            {view === 'board' ? (
              <NativeSelect
                aria-label={t('filters.board')}
                onChange={(event) => void navigate({
                  to: '/workspace/projects/$projectId/tasks', params: { projectId },
                  search: { ...search, board: event.target.value },
                })}
                value={selectedBoard?.board._id ?? ''}
              >
                {(boards ?? []).map((item) => <NativeSelectOption key={item.board._id} value={item.board._id}>{item.board.name}</NativeSelectOption>)}
              </NativeSelect>
            ) : <strong>{view === 'my' ? t('page.openWorkAssigned') : t('page.accessibleProjectWork')}</strong>}
            <NativeSelect
              aria-label={t('filters.priority')}
              onChange={(event) => void navigate({
                to: '/workspace/projects/$projectId/tasks', params: { projectId },
                search: { ...search, priority: event.target.value },
              })}
              value={search.priority ?? 'all'}
            >
              {['all', 'urgent', 'high', 'medium', 'low', 'none'].map((priority) =>
                <NativeSelectOption key={priority} value={priority}>{priority === 'all' ? t('filters.allPriorities') : t(`priority.${priority}`)}</NativeSelectOption>)}
            </NativeSelect>
            <NativeSelect aria-label={t('filters.status')} onChange={(event) => void navigate({ to: '/workspace/projects/$projectId/tasks', params: { projectId }, search: { ...search, state: event.target.value } })} value={search.state ?? 'all'}>
              <NativeSelectOption value="all">{t('filters.allStatuses')}</NativeSelectOption>
              {(boards ?? []).flatMap((item) => item.states).filter((state, index, states) => states.findIndex((candidate) => candidate._id === state._id) === index).map((state) => <NativeSelectOption dir="auto" key={state._id} value={state._id}>{state.name}</NativeSelectOption>)}
            </NativeSelect>
            <NativeSelect aria-label={t('filters.due')} onChange={(event) => void navigate({ to: '/workspace/projects/$projectId/tasks', params: { projectId }, search: { ...search, due: event.target.value } })} value={search.due ?? 'all'}>
              {['all', 'overdue', 'due_today', 'upcoming', 'none'].map((due) => <NativeSelectOption key={due} value={due}>{due === 'all' ? t('filters.allDueDates') : t(`filters.${due === 'due_today' ? 'dueToday' : due}`)}</NativeSelectOption>)}
            </NativeSelect>
            <NativeSelect aria-label={t('filters.label')} onChange={(event) => void navigate({ to: '/workspace/projects/$projectId/tasks', params: { projectId }, search: { ...search, label: event.target.value } })} value={search.label ?? 'all'}>
              <NativeSelectOption value="all">{t('filters.allLabels')}</NativeSelectOption>
              {labels?.map((label) => <NativeSelectOption dir="auto" key={label._id} value={label._id}>{label.name}</NativeSelectOption>)}
            </NativeSelect>
            <label className="task-archive-filter"><input checked={Boolean(search.archived)} onChange={(event) => void navigate({ to: '/workspace/projects/$projectId/tasks', params: { projectId }, search: { ...search, archived: event.target.checked } })} type="checkbox" /> {t('filters.archived')}</label>
          </div>
          {boards === undefined || taskRows === undefined ? <TaskLoading /> : !boards.length ? (
            <TaskEmpty title={t('page.noAccessibleBoardsTitle')} body={t('page.noAccessibleBoardsBody')} />
          ) : view === 'board' && selectedBoard ? (
            <TaskBoard
              board={selectedBoard}
              identity={identity}
              onAnnounce={setAnnouncement}
              onCreate={(stateId) => { setCreateWorkflowStateId(stateId); setCreateOpen(true) }}
              onOpen={(publicKey) => void navigate({
                to: '/workspace/projects/$projectId/tasks', params: { projectId },
                search: { ...search, task: publicKey },
              })}
              tasks={visibleTasks}
            />
          ) : visibleTasks.length ? (
            <TaskGroupedList
              items={visibleTasks}
              omitAssignee={view === 'my'}
              onOpen={(publicKey) => void navigate({
                to: '/workspace/projects/$projectId/tasks', params: { projectId },
                search: { ...search, task: publicKey },
              })}
            />
          ) : <TaskEmpty title={t('page.noTaskMatchesTitle')} body={t('page.noTaskMatchesBody')} />}
          </section>
        )}

        <p aria-live="polite" className="sr-only">{announcement}</p>
      </section>
      <TaskCreateDialog
        boards={boards ?? []}
        identity={identity}
        initialBoardId={selectedBoard?.board._id}
        initialWorkflowStateId={createWorkflowStateId}
        onCreated={(publicKey) => {
          setCreateOpen(false)
          setAnnouncement(t('page.createdAnnouncement', { key: publicKey }))
          void navigate({
            to: '/workspace/projects/$projectId/tasks', params: { projectId },
            search: { ...search, task: publicKey },
          })
        }}
        onOpenChange={(open) => {
          setCreateOpen(open)
          if (!open) setCreateWorkflowStateId(undefined)
        }}
        open={createOpen}
        projectId={project}
      />
      <TaskAdminDialog boards={boards ?? []} identity={identity} onOpenChange={setAdminOpen} open={adminOpen} projectId={project} />
      <TaskDetailDrawer
        identity={identity}
        onAnnounce={setAnnouncement}
        onOpenChange={(open) => {
          if (!open) void navigate({
            to: '/workspace/projects/$projectId/tasks', params: { projectId },
            search: { ...search, task: undefined },
          })
        }}
        projectId={project}
        taskKey={search.task}
      />
    </main>
  )
}

function TaskNotificationButton({ identity, projectId }: { identity: ReturnType<typeof taskIdentity>; projectId: Id<'projects'> }) {
  const { locale } = useLocale()
  const { t } = useTranslation('tasks')
  const notifications = useQuery(api.taskNotifications.list, { projectId, ...identity })
  const preference = useQuery(api.taskNotifications.getPreference, { projectId, ...identity })
  const markRead = useMutation(api.taskNotifications.markRead)
  const markAllRead = useMutation(api.taskNotifications.markAllRead)
  const setPreference = useMutation(api.taskNotifications.setPreference)
  const unread = notifications?.filter((item) => !item.readAt).length ?? 0
  const identityQuery = identity.actingCompanyId && identity.projectMemberId
    ? `&actingCompanyId=${identity.actingCompanyId}&projectMemberId=${identity.projectMemberId}` : ''
  const eventLabels: Record<string, string> = {
    assignment: 'notifications.assignment',
    mention: 'notifications.mention',
    due_soon: 'notifications.dueSoon',
    overdue: 'notifications.overdue',
    assignment_lost: 'notifications.assignmentLost',
    task_changed: 'notifications.taskChanged',
    comment: 'notifications.comment',
    labels_changed: 'notifications.labelChanged',
  }
  const preferenceLabels: Record<string, string> = {
    important: 'notifications.important',
    all_followed: 'notifications.allFollowed',
    muted: 'notifications.muted',
  }
  return <Popover><PopoverTrigger render={<Button aria-label={t('notifications.ariaLabel', { count: formatNumber(locale, unread) })} variant="outline" />}><Bell size={14} />{unread ? <span>{formatNumber(locale, unread)}</span> : null}</PopoverTrigger><PopoverContent align="end" className="task-notification-feed">
    <PopoverHeader><PopoverTitle>{t('notifications.title')}</PopoverTitle><PopoverDescription>{t('notifications.description')}</PopoverDescription></PopoverHeader>
    <NativeSelect aria-label={t('notifications.preferenceAria')} onChange={(event) => void setPreference({ projectId, mode: event.target.value as 'important' | 'all_followed' | 'muted', ...identity })} value={preference ?? 'important'}>{['important', 'all_followed', 'muted'].map((mode) => <NativeSelectOption key={mode} value={mode}>{t(preferenceLabels[mode])}</NativeSelectOption>)}</NativeSelect>
    {unread ? <Button onClick={() => void markAllRead({ projectId, ...identity })} size="sm" variant="ghost">{t('notifications.markAllRead')}</Button> : null}
    <div>{notifications?.map((item) => <a className={item.readAt ? '' : 'unread'} href={`/workspace/projects/${projectId}/tasks?view=all&task=${encodeURIComponent(String(item.payload?.publicKey ?? ''))}${identityQuery}`} key={item._id} onClick={() => void markRead({ notificationId: item._id, ...identity })}><strong>{t(eventLabels[item.eventType] ?? 'notifications.taskChanged')}</strong><span>{formatDate(locale, item.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}</span></a>)}</div>
    {!notifications?.length ? <p>{t('notifications.empty')}</p> : null}
  </PopoverContent></Popover>
}

function TaskLoading() {
  const { t } = useTranslation('tasks')
  return <div aria-label={t('page.loadingTasks')} className="task-loading"><span /><span /><span /></div>
}

function TaskEmpty({ title, body }: { title: string; body: string }) {
  return <div className="task-empty"><ListTodo aria-hidden="true" size={26} /><h2>{title}</h2><p>{body}</p></div>
}

function TaskGroupedList({ items, omitAssignee, onOpen }: { items: Array<TaskView>; omitAssignee: boolean; onOpen: (publicKey: string) => void }) {
  const { locale } = useLocale()
  const { t } = useTranslation('tasks')
  const groups = Array.from(items.reduce((result, item) => {
    const key = item.state?._id ?? 'unavailable'
    const current = result.get(key) ?? { state: item.state, items: [] as Array<TaskView> }
    current.items.push(item)
    result.set(key, current)
    return result
  }, new Map<string, { state: TaskView['state']; items: Array<TaskView> }>()).values())

  return <div className="task-dense-list">{groups.map((group) => (
    <section className="task-list-group" key={group.state?._id ?? 'unavailable'}>
      <header><StateRing category={group.state?.category ?? 'backlog'} /><h2 dir="auto">{group.state?.name ?? t('page.unavailableState')}</h2><span>{formatNumber(locale, group.items.length)}</span></header>
      {group.items.map((item) => <TaskDenseRow item={item} key={item.task._id} omitAssignee={omitAssignee} onOpen={() => onOpen(item.task.publicKey)} />)}
    </section>
  ))}</div>
}
