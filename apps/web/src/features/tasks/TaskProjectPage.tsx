import { Link, useNavigate } from '@tanstack/react-router'
import { useMutation, usePaginatedQuery, useQuery } from 'convex/react'
import { CalendarDays, Columns3, Inbox, List, ListTodo, MoreHorizontal, Plus, Search, SlidersHorizontal, UserRoundCheck } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { api } from '../../../../../convex/_generated/api'
import type { Id } from '../../../../../convex/_generated/dataModel'
import TrackLoader from '#/components/TrackLoader'
import { Button } from '#/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '#/components/ui/dropdown-menu'
import { NativeSelect, NativeSelectOption } from '#/components/ui/native-select'
import { CompanyProjectNavigation } from '#/features/company/CompanyProjectNavigation'
import { useReleaseConfigState } from '#/lib/release-config'
import { TaskAdminDialog } from './TaskAdminDialog'
import { TaskBoard } from './TaskBoard'
import { TaskCalendarView } from './TaskCalendarView'
import { TaskCreateDialog, taskError } from './TaskCreateDialog'
import { TaskDetailDrawer } from './TaskDetailDrawer'
import { TaskInbox } from './TaskInbox'
import { TaskListView } from './TaskListView'
import { formatDateInputValue } from './task-date'
import { canEditTaskView, taskIdentity } from './task-types'
import { boardIdForTaskView, resolveWorkflowStateId } from './task-workspace-state'
import './task-views.css'

type TaskSearch = {
  actingCompanyId?: string; groupId?: string; projectMemberId?: string; task?: string
  view?: 'inbox' | 'my' | 'list' | 'calendar' | 'board'; board?: string; priority?: string
  due?: string; state?: string; label?: string; archived?: boolean; q?: string; assignee?: string; month?: string
}

const taskViews: Array<[NonNullable<TaskSearch['view']>, string, LucideIcon]> = [
  ['board', 'Board', Columns3], ['my', 'My tasks', UserRoundCheck], ['list', 'List', ListTodo], ['inbox', 'Suggestions', Inbox],
]
const workspaceViews: Array<[Extract<NonNullable<TaskSearch['view']>, 'board' | 'list' | 'calendar'>, string, LucideIcon]> = [
  ['board', 'Board', Columns3], ['list', 'List', List], ['calendar', 'Calendar', CalendarDays],
]

export function TaskProjectPage({ projectId, search }: { projectId: string; search: TaskSearch }) {
  const releaseState = useReleaseConfigState()
  const release = releaseState.config
  const navigate = useNavigate()
  const incompleteContext = Boolean(search.actingCompanyId) !== Boolean(search.projectMemberId)
  const usesLegacyContext = !search.actingCompanyId && !search.projectMemberId
  const identity = useMemo(() => taskIdentity(search), [search])
  const project = projectId as Id<'projects'>
  const currentUser = useQuery(api.auth.getCurrentUser)
  const legacyProjects = useQuery(api.projects.list, release.tasks && usesLegacyContext && currentUser ? { userId: currentUser._id } : 'skip')
  const labels = useQuery(api.taskLabels.list, release.tasks && !incompleteContext ? { projectId: project, ...identity } : 'skip')
  const boards = useQuery(api.taskBoards.list, release.tasks && !incompleteContext ? { projectId: project, ...identity } : 'skip')
  const eligibleAssignees = useQuery(api.tasks.listEligibleAssignees, release.tasks && !incompleteContext ? { projectId: project, ...identity } : 'skip')
  const selectedBoard = boards?.find((item) => item.board._id === search.board) ?? boards?.find((item) => item.board.isDefault) ?? boards?.[0]
  const currentProjectMember = eligibleAssignees?.find((item) => item.member._id === identity.projectMemberId || item.user._id === currentUser?._id)?.member
  const currentProjectMemberId = currentProjectMember?._id
  const filteredAssigneeId = eligibleAssignees?.find(
    (item) => item.member._id === search.assignee,
  )?.member._id
  const filteredLabelId = labels?.find((item) => item._id === search.label)?._id
  const filteredWorkflowStateId = resolveWorkflowStateId(boards, search.state)
  const taskFiltersReady =
    boards !== undefined && labels !== undefined && eligibleAssignees !== undefined
  const view = search.view ?? 'list'
  const isWorkspaceView = view === 'board' || view === 'list' || view === 'calendar'
  const taskPage = usePaginatedQuery(api.tasks.listPage, release.tasks && !incompleteContext && view !== 'inbox' && taskFiltersReady ? {
    projectId: project,
    boardId: boardIdForTaskView(view, selectedBoard?.board._id),
    assigneeProjectMemberId: view === 'my' ? currentProjectMemberId : filteredAssigneeId,
    openOnly: view === 'my',
    priority: search.priority && search.priority !== 'all' ? search.priority as 'none' | 'urgent' | 'high' | 'medium' | 'low' : undefined,
    workflowStateId: filteredWorkflowStateId,
    dueState: search.due && search.due !== 'all' ? search.due as 'none' | 'upcoming' | 'due_today' | 'overdue' : undefined,
    localDate: formatDateInputValue(new Date()), labelId: filteredLabelId,
    includeArchived: search.archived, ...identity,
  } : 'skip', { initialNumItems: 100 })
  const [createOpen, setCreateOpen] = useState(false)
  const [createWorkflowStateId, setCreateWorkflowStateId] = useState<Id<'taskWorkflowStates'>>()
  const [adminOpen, setAdminOpen] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const updateTask = useMutation(api.tasks.update)
  const query = search.q?.trim().toLocaleLowerCase() ?? ''
  const visibleTasks = useMemo(() => query ? taskPage.results.filter((item) => item.task.title.toLocaleLowerCase().includes(query) || item.task.publicKey.toLocaleLowerCase().includes(query)) : taskPage.results, [query, taskPage.results])
  const legacyProject = legacyProjects?.find((item) => item.project._id === project)
  const projectName = legacyProject?.project.name ?? selectedBoard?.board.name.replace(/\s+board$/i, '') ?? 'Project'
  const activeFilterCount = [search.q, search.priority, search.assignee, search.due, search.label, filteredWorkflowStateId].filter((value) => value && value !== 'all').length + (search.archived ? 1 : 0)
  const updateSearch = (patch: Partial<TaskSearch>, replace = false) => void navigate({ to: '/workspace/projects/$projectId/tasks', params: { projectId }, search: { ...search, ...patch }, replace })

  useEffect(() => { if (!search.board && selectedBoard && isWorkspaceView) updateSearch({ board: selectedBoard.board._id }, true) }, [isWorkspaceView, search.board, selectedBoard])

  if (releaseState.status === 'loading') return <TrackLoader label="Loading Project tasks" />
  if (!release.tasks) return <main className="task-page task-unavailable"><h1>Tasks are unavailable</h1><p>This Project keeps its conversation workflow while the task release is disabled.</p></main>
  if (incompleteContext) return <main className="task-page task-unavailable"><h1>Project task context unavailable</h1><p>Return to the Company Project and open Tasks again to restore its represented membership.</p></main>
  if (currentUser === null) return <main className="task-page task-unavailable"><h1>Project unavailable</h1><p>Sign in to open this Project.</p></main>
  if (currentUser === undefined || labels === undefined || boards === undefined || eligibleAssignees === undefined || (usesLegacyContext && legacyProjects === undefined) || (view !== 'inbox' && taskPage.status === 'LoadingFirstPage')) return <TrackLoader label="Loading Project tasks" />
  if (usesLegacyContext && !legacyProject) return <main className="task-page task-unavailable"><h1>Project unavailable</h1><p>This Project does not exist or your membership cannot access it.</p></main>

  const representedProject = identity.actingCompanyId && identity.projectMemberId ? { actingCompanyId: identity.actingCompanyId, project: { groupId: search.groupId, projectId: project, projectMemberId: identity.projectMemberId } } : null
  const taskViewNavigation = <><span className="task-route-label">Work</span><nav aria-label="Task views" className="task-view-tabs">{taskViews.map(([value, label, Icon]) => <Link aria-current={view === value ? 'page' : undefined} className={view === value ? 'active' : ''} key={value} params={{ projectId }} search={{ ...search, view: value }} to="/workspace/projects/$projectId/tasks"><Icon aria-hidden="true" size={14} /> {label}</Link>)}</nav></>
  const openTask = (publicKey: string) => updateSearch({ task: publicKey })
  const startCreate = (stateId?: Id<'taskWorkflowStates'>) => { setCreateWorkflowStateId(stateId); setCreateOpen(true) }
  const scheduleTask = async (item: (typeof visibleTasks)[number], dueDate: string) => {
    try {
      await updateTask({ taskId: item.task._id, expectedRevision: item.task.revision, dueDate, ...identity })
      setAnnouncement(`${item.task.title} scheduled for ${dueDate}.`)
      return true
    } catch (failure) {
      setAnnouncement(taskError(failure))
      return false
    }
  }

  return <main className={representedProject ? 'task-page company-task-shell company-unified-shell' : 'task-page'}>
    {representedProject ? <CompanyProjectNavigation actingCompanyId={representedProject.actingCompanyId} activeArea="tasks" activeProject={representedProject.project} secondaryNavigation={taskViewNavigation} tasksEnabled={release.tasks} /> : <aside className="task-route-sidebar">
      <Link className="task-route-brand" to="/workspace"><img alt="" height="21" src="/track-mark.svg" width="30" /><strong>Track</strong></Link>
      {search.groupId ? <Link className="task-route-project" params={{ groupId: search.groupId, projectId }} to="/workspace/projects/$projectId/groups/$groupId"><span aria-hidden="true" className="task-route-project-glyph">{projectName.slice(0, 1).toUpperCase()}</span><span><strong>{projectName}</strong><small>Standalone Project · Conversation and work</small></span></Link> : <Link className="task-route-project" params={{ projectId }} to="/workspace/projects/$projectId"><span aria-hidden="true" className="task-route-project-glyph">{projectName.slice(0, 1).toUpperCase()}</span><span><strong>{projectName}</strong><small>Standalone Project · Conversation and work</small></span></Link>}
      {taskViewNavigation}
      {search.groupId ? <Link className="task-route-conversation" params={{ groupId: search.groupId, projectId }} to="/workspace/projects/$projectId/groups/$groupId">← Project conversation</Link> : <Link className="task-route-conversation" params={{ projectId }} to="/workspace/projects/$projectId">← Project conversation</Link>}
    </aside>}
    <section className="task-page-main">
      <header className="task-page-header">
        <div className="task-header-copy"><nav aria-label="Breadcrumb" className="task-breadcrumb"><span>Projects</span><i>/</i><span>{projectName}</span><i>/</i><strong>Tasks</strong></nav><div className="task-heading"><span className="task-heading-icon"><ListTodo aria-hidden="true" size={28} /></span><div><h1>Tasks</h1><p>Work in {projectName}</p><small>{selectedBoard?.board.name ?? `${projectName} board`} · {visibleTasks.length} {visibleTasks.length === 1 ? 'task' : 'tasks'}</small></div></div></div>
        <div className="task-header-actions"><Button onClick={() => startCreate()}><Plus aria-hidden="true" size={17} /> New task</Button><Button aria-label="Task settings" onClick={() => setAdminOpen(true)} variant="outline"><SlidersHorizontal aria-hidden="true" size={16} /></Button><DropdownMenu><DropdownMenuTrigger render={<Button aria-label="More task actions" variant="outline" />}><MoreHorizontal aria-hidden="true" size={17} /></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => setAdminOpen(true)}>Task settings</DropdownMenuItem><DropdownMenuItem onClick={() => updateSearch({ archived: !search.archived })}>{search.archived ? 'Hide archived tasks' : 'Include archived tasks'}</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>
      </header>
      {view === 'inbox' ? <TaskInbox boards={boards} identity={identity} projectId={project} onAnnounce={setAnnouncement} /> : <section className="task-workspace">
        <div className="task-toolbar-search"><label className="task-search"><Search aria-hidden="true" size={17} /><input aria-label="Search tasks" autoComplete="off" name="project-task-search" onChange={(event) => updateSearch({ q: event.target.value || undefined }, true)} placeholder="Search tasks…" value={search.q ?? ''} /></label></div>
        <div aria-label="Task filters" className="task-toolbar-filters" role="group">
          <Filter value={search.priority ?? 'all'} label="Filter by priority" onChange={(value) => updateSearch({ priority: value })} options={[['all','All priorities'],['urgent','Urgent'],['high','High'],['medium','Medium'],['low','Low'],['none','No priority']]} />
          <Filter searchable value={search.assignee ?? 'all'} label="Filter by assignee" onChange={(value) => updateSearch({ assignee: value })} options={[['all','All assignees'], ...eligibleAssignees.map((item) => [item.member._id, item.member.userDisplayNameSnapshot] as [string,string])]} />
          <Filter value={search.due ?? 'all'} label="Filter by due date" onChange={(value) => updateSearch({ due: value })} options={[['all','All due dates'],['overdue','Overdue'],['due_today','Due today'],['upcoming','Upcoming'],['none','No due date']]} />
          <Filter value={search.label ?? 'all'} label="Filter by label" onChange={(value) => updateSearch({ label: value })} options={[['all','All labels'], ...labels.map((label) => [label._id, label.name] as [string,string])]} />
          <label className="task-archive-filter"><input checked={Boolean(search.archived)} onChange={(event) => updateSearch({ archived: event.target.checked })} type="checkbox" /> Archived</label>
          {activeFilterCount ? <Button className="task-filter-reset" onClick={() => updateSearch({ q: undefined, priority: undefined, assignee: undefined, due: undefined, label: undefined, state: undefined, archived: false })} size="sm" variant="ghost">Clear {activeFilterCount}</Button> : null}
        </div>
        {isWorkspaceView ? <nav aria-label="Task workspace view" className="task-mode-switcher">{workspaceViews.map(([value, label, Icon]) => <Link aria-current={view === value ? 'page' : undefined} className={view === value ? 'active' : ''} key={value} params={{ projectId }} search={{ ...search, view: value }} to="/workspace/projects/$projectId/tasks"><Icon size={15} />{label}</Link>)}</nav> : null}
        {!boards.length ? <TaskEmpty title="No accessible boards" body="Create the first task to provision the Project workflow." onAction={() => startCreate()} /> : !visibleTasks.length ? <TaskEmpty title={activeFilterCount ? 'No tasks match these filters' : 'No tasks yet'} body={activeFilterCount ? 'Clear the filters to see the rest of this Project work.' : 'Create the first task for this Project.'} onAction={activeFilterCount ? () => updateSearch({ q: undefined, priority: undefined, assignee: undefined, due: undefined, label: undefined, state: undefined, archived: false }) : () => startCreate()} actionLabel={activeFilterCount ? 'Clear filters' : 'New task'} /> : view === 'board' && selectedBoard ? <TaskBoard board={selectedBoard} identity={identity} onAnnounce={setAnnouncement} onCreate={startCreate} onOpen={openTask} tasks={visibleTasks} /> : view === 'calendar' ? <TaskCalendarView canSchedule={(item) => canEditTaskView(item, currentProjectMemberId, currentProjectMember?.role)} items={visibleTasks} month={search.month} onMonthChange={(month) => updateSearch({ month })} onOpen={openTask} onSchedule={scheduleTask} /> : <TaskListView items={visibleTasks} onOpen={openTask} />}
        {taskPage.status === 'CanLoadMore' || taskPage.status === 'LoadingMore' ? <div className="task-load-more"><Button disabled={taskPage.status === 'LoadingMore'} onClick={() => taskPage.loadMore(100)} variant="outline">{taskPage.status === 'LoadingMore' ? 'Loading more tasks…' : 'Load more tasks'}</Button></div> : null}
      </section>}
      <p aria-live="polite" className="sr-only">{announcement}</p>
    </section>
    <TaskCreateDialog boards={boards} identity={identity} initialBoardId={selectedBoard?.board._id} initialWorkflowStateId={createWorkflowStateId} onCreated={(publicKey) => { setCreateOpen(false); setAnnouncement(`Created ${publicKey}`); openTask(publicKey) }} onOpenChange={(open) => { setCreateOpen(open); if (!open) setCreateWorkflowStateId(undefined) }} open={createOpen} projectId={project} />
    <TaskAdminDialog boards={boards} identity={identity} onOpenChange={setAdminOpen} open={adminOpen} projectId={project} />
    <TaskDetailDrawer identity={identity} onAnnounce={setAnnouncement} onOpenChange={(open) => { if (!open) updateSearch({ task: undefined }) }} projectId={project} taskKey={search.task} />
  </main>
}

function Filter({ label, onChange, options, searchable = false, value }: { label: string; onChange: (value: string) => void; options: Array<[string,string]>; searchable?: boolean; value: string }) { return <NativeSelect aria-label={label} onChange={(event) => onChange(event.target.value)} searchable={searchable && options.length >= 8} value={value}>{options.map(([key, text]) => <NativeSelectOption key={key} value={key}>{text}</NativeSelectOption>)}</NativeSelect> }
function TaskEmpty({ actionLabel = 'Create task', body, onAction, title }: { actionLabel?: string; body: string; onAction?: () => void; title: string }) { return <div className="task-empty"><span className="task-empty-icon"><ListTodo size={20} /></span><h2>{title}</h2><p>{body}</p>{onAction ? <Button onClick={onAction} size="sm">{actionLabel === 'New task' ? <Plus size={13} /> : null}{actionLabel}</Button> : null}</div> }
