import { Link } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, CheckSquare2, CircleAlert, Clipboard, FolderKanban, Handshake, Mail, MoreHorizontal, Plus, UsersRound } from 'lucide-react'

import { api } from '../../../../../convex/_generated/api'
import type { Id } from '../../../../../convex/_generated/dataModel'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '#/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '#/components/ui/dropdown-menu'
import { NativeSelect, NativeSelectOption } from '#/components/ui/native-select'
import { InternalProjectForm, InviteMemberForm, RelationshipForm } from './CompanyForms'
import { getCompanyProjectOverviewSearch } from './company-project-links'
import { CompanyOverviewProjectDialogs } from './CompanyOverviewProjectDialogs'
import { CompanyActivityChart } from './CompanyActivityChart'
import type { OverviewProjectDialogTarget } from './CompanyOverviewProjectDialogs'

type Overview = FunctionReturnType<typeof api.companyOverview.get>
type ProjectDirectory = FunctionReturnType<typeof api.sharedProjects.listForActingCompany>
type AsyncAction = (action: () => Promise<unknown>) => Promise<void | boolean>

type Props = {
  activeCompanyId: Id<'companies'>
  companyName: string
  createProjectRequest: number
  currentUserId: Id<'users'>
  isAdmin: boolean
  overview: Overview | undefined
  projects: ProjectDirectory | undefined
  searchQuery: string
  onCreateProjectRequestHandled: () => void
  run: AsyncAction
}

type QuickAction = 'project' | 'invite' | 'partner' | 'task'

function relativeTime(timestamp: number) {
  const elapsed = Math.max(0, Date.now() - timestamp)
  const hours = Math.floor(elapsed / 3_600_000)
  if (hours < 1) return 'Just now'
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function CompanyOverviewDashboard({ activeCompanyId, companyName, createProjectRequest, currentUserId, isAdmin, onCreateProjectRequestHandled, onCreateTaskRequest, overview, projects, run, searchQuery }: Props & { onCreateTaskRequest?: () => void }) {
  const [quickAction, setQuickAction] = useState<QuickAction | null>(null)
  const [rangeDays, setRangeDays] = useState<7 | 30 | 90>(7)
  const [chartProjectId, setChartProjectId] = useState<Id<'projects'> | ''>('')
  const [activityProject, setActivityProject] = useState<OverviewProjectDialogTarget | null>(null)
  const [settingsProject, setSettingsProject] = useState<OverviewProjectDialogTarget | null>(null)
  const uniqueProjects = useMemo(() => Array.from(new Map((projects ?? []).map((row) => [row.project._id, row])).values()), [projects])
  const overviewProjects = useMemo(() => Array.from(new Map((overview?.projects ?? []).map((project) => [project.id, project])).values()), [overview?.projects])
  const normalizedSearch = searchQuery.trim().toLocaleLowerCase()
  const matchesSearch = (value: string) => !normalizedSearch || value.toLocaleLowerCase().includes(normalizedSearch)
  const visibleOverviewProjects = overviewProjects.filter((project) => matchesSearch(`${project.name} ${project.description ?? ''}`)).slice(0, 4)
  const visibleActivity = (overview?.recentActivity ?? []).filter((activity) => matchesSearch(`${activity.preview} ${activity.projectName} ${activity.action}`))
  const visibleWorkload = (overview?.workload ?? []).filter((owner) => matchesSearch(`${owner.name} ${owner.projects?.join(' ') ?? ''}`))
  useEffect(() => {
    if (createProjectRequest <= 0) return
    setQuickAction('project')
    onCreateProjectRequestHandled()
  }, [createProjectRequest, onCreateProjectRequestHandled])

  const projectSources = useMemo(() => new Map(uniqueProjects.map((row) => [row.project._id, row])), [uniqueProjects])
  const shouldUseInitialOverview = rangeDays === 7 && chartProjectId === ''
  const rangedOverview = useQuery(api.companyOverview.get, shouldUseInitialOverview ? 'skip' : { companyId: activeCompanyId, days: rangeDays, projectId: chartProjectId || undefined })
  const trend = (shouldUseInitialOverview ? overview?.activityTrend : rangedOverview?.activityTrend) ?? []
  const hasTaskActivity = trend.some((point) => point.created > 0 || point.completed > 0)
  const workload = overview?.workload ?? []
  const maxWorkload = Math.max(1, ...visibleWorkload.map((owner) => owner.open))

  function openQuickAction(action: QuickAction) { if (action === 'task') { onCreateTaskRequest?.(); return } setQuickAction(action) }
  function closeQuickAction() { setQuickAction(null) }

  function activityHref(activity: NonNullable<Overview>['recentActivity'][number]) {
    const source = projectSources.get(activity.projectId)
    if (!source) return null
    const projectId = encodeURIComponent(String(activity.projectId))
    const membershipId = encodeURIComponent(String(source.membership._id))
    const companyId = encodeURIComponent(String(activeCompanyId))
    if (activity.kind === 'task' && activity.taskKey) return `/workspace/projects/${projectId}/tasks?actingCompanyId=${companyId}&groupId=&projectMemberId=${membershipId}&view=all&task=${encodeURIComponent(activity.taskKey)}`
    if (activity.kind === 'message' && activity.groupId && activity.threadId) return `/workspace/projects/${projectId}/groups/${encodeURIComponent(String(activity.groupId))}/threads/${encodeURIComponent(String(activity.threadId))}?companyId=${companyId}&membershipId=${membershipId}`
    const groupId = activity.kind === 'message' && activity.groupId ? encodeURIComponent(String(activity.groupId)) : ''
    return `/workspace/company-projects/${projectId}?companyId=${companyId}&groupId=${groupId}&membershipId=${membershipId}&view=${activity.kind === 'message' ? 'channels' : 'overview'}`
  }

  function copyActivityLink(activity: NonNullable<Overview>['recentActivity'][number]) {
    const href = activityHref(activity)
    if (href) void navigator.clipboard?.writeText(`${window.location.origin}${href}`)
  }

  return <div aria-busy={!overview} className="company-overview-live">
    <section aria-label="Company task summary" className="company-dashboard-stat-grid">
      {[
        { label: 'Open tasks', value: overview?.stats?.openTasks, tone: 'amber', context: 'Company total', icon: <Mail aria-hidden="true" /> },
        { label: 'Overdue tasks', value: overview?.stats?.overdueTasks, tone: 'red', context: 'Needs attention', icon: <CircleAlert aria-hidden="true" /> },
        { label: 'Completed this week', value: overview?.stats?.completedThisWeek, tone: 'green', context: 'Current week', icon: <CheckCircle2 aria-hidden="true" /> },
        { label: 'Active people', value: overview?.stats?.activePeople, tone: 'blue', context: 'Active assignments', icon: <UsersRound aria-hidden="true" /> },
      ].map((stat) => <article className={`company-dashboard-stat ${stat.tone}`} key={stat.label}><span className="company-dashboard-stat-icon">{stat.icon}</span><div><strong>{stat.value ?? '—'}</strong><span>{stat.label}</span></div><small>{stat.context}</small></article>)}
    </section>

    <div className="company-dashboard-grid">
      <section className="company-dashboard-panel company-dashboard-progress"><div className="company-dashboard-panel-heading"><div><h2>Projects at a glance</h2><p>Progress and health across this Company.</p></div><Link search={{ view: 'projects', taskFilter: undefined }} to="/workspace/company">All Projects</Link></div><div className="company-dashboard-project-list">{!overview ? <div aria-label="Loading projects" className="company-dashboard-skeleton" role="status" /> : overviewProjects.length === 0 ? <div className="company-quiet-empty"><FolderKanban aria-hidden="true" size={18} /><strong>No projects yet</strong></div> : visibleOverviewProjects.length === 0 ? <div className="company-quiet-empty"><strong>No Projects match this search.</strong></div> : visibleOverviewProjects.map((project, index) => {
        const source = projectSources.get(project.id)
        const content = <><span className={`company-dashboard-project-icon tone-${(index % 3) + 1}`}><FolderKanban aria-hidden="true" size={20} /></span><div className="company-dashboard-project-copy"><strong>{project.name}</strong><span>{project.completedTasks}/{project.totalTasks} tasks done · {project.description ?? 'No project description'}</span><div className="company-dashboard-progress-track"><i style={{ width: `${project.progress}%` }} /></div></div><span className={`company-dashboard-health ${project.health.toLowerCase().replace(' ', '-')}`}>{project.health}</span><strong className="company-dashboard-percent">{project.progress}%</strong></>
        return <div className="company-dashboard-project-row-shell" key={project.id}>
          {source ? <Link aria-label={`Open ${project.name} project overview`} className="company-dashboard-project-row company-dashboard-project-link" params={{ projectId: project.id }} search={getCompanyProjectOverviewSearch({ actingCompanyId: activeCompanyId, projectId: project.id, projectMemberId: source.membership._id })} to="/workspace/company-projects/$projectId">{content}</Link> : <div className="company-dashboard-project-row">{content}</div>}
          <DropdownMenu>
            <DropdownMenuTrigger render={<button aria-label={`Open actions for ${project.name}`} className="company-dashboard-more" type="button" />}>
              <MoreHorizontal aria-hidden="true" size={18} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="company-dashboard-menu" sideOffset={4}>
              {source ? <DropdownMenuItem render={<Link params={{ projectId: project.id }} search={getCompanyProjectOverviewSearch({ actingCompanyId: activeCompanyId, projectId: project.id, projectMemberId: source.membership._id })} to="/workspace/company-projects/$projectId" />}>Open project overview</DropdownMenuItem> : null}
              {source ? <DropdownMenuItem onClick={() => setActivityProject({ membershipId: source.membership._id, project })}>View activity</DropdownMenuItem> : null}
              {source && (isAdmin || source.membership.role === 'manager') ? <DropdownMenuItem onClick={() => setSettingsProject({ membershipId: source.membership._id, project })}>Project settings</DropdownMenuItem> : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      })}</div></section>

      <section className="company-dashboard-panel company-dashboard-activity"><div className="company-dashboard-panel-heading"><div><h2>Recent activity</h2><p>Latest updates across your projects, tasks, and threads.</p></div></div><div className="company-dashboard-activity-list">{!overview ? <div aria-label="Loading activity" className="company-dashboard-skeleton" role="status" /> : overview.recentActivity.length === 0 ? <div className="company-quiet-empty"><strong>No recent activity yet</strong></div> : visibleActivity.length === 0 ? <div className="company-quiet-empty"><strong>No activity matches this search.</strong></div> : visibleActivity.map((activity, index) => {
        const href = activityHref(activity)
        const content = <><span className={`company-dashboard-avatar tone-${(index % 4) + 1}`}>{activity.actorInitials}</span><div><strong>{activity.preview}</strong><span>{activity.projectName} · {activity.action}</span></div><time>{relativeTime(activity.createdAt)}</time><small className={activity.kind}>{activity.kind === 'message' ? 'Comment' : activity.kind === 'task' ? 'Task' : 'Project'}</small></>
        return <div className="company-dashboard-activity-row-shell" key={activity.id}>
          {href ? <a aria-label={`Open activity: ${activity.preview}`} className="company-dashboard-activity-row company-dashboard-activity-link" href={href}>{content}</a> : <div className="company-dashboard-activity-row">{content}</div>}
          <DropdownMenu>
            <DropdownMenuTrigger render={<button aria-label={`Open actions for ${activity.preview}`} className="company-dashboard-more" type="button" />}>
              <MoreHorizontal aria-hidden="true" size={18} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="company-dashboard-menu" sideOffset={4}>
              {href ? <DropdownMenuItem render={<a href={href} />}>Open activity</DropdownMenuItem> : null}
              <DropdownMenuItem onClick={() => copyActivityLink(activity)}><Clipboard aria-hidden="true" size={14} />Copy link</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      })}</div></section>
    </div>

    <div className="company-dashboard-bottom-grid company-dashboard-bottom-grid-live">
      <section aria-label="Workload by owner" className="company-dashboard-panel company-dashboard-workload-panel"><div className="company-dashboard-panel-heading"><div><h2>Workload by owner</h2><p>Open and overdue tasks across projects</p></div><UsersRound aria-hidden="true" size={18} /></div>{!overview ? <div aria-label="Loading workload" className="company-dashboard-skeleton" role="status" /> : workload.length === 0 ? <div className="company-quiet-empty"><strong>No assigned work yet</strong><span>Workload will appear when tasks are assigned.</span></div> : visibleWorkload.length === 0 ? <div className="company-quiet-empty"><strong>No people match this search.</strong></div> : <ol className="company-dashboard-workload-list">{visibleWorkload.map((owner) => <li key={owner.id}><span aria-hidden="true" className="company-dashboard-workload-avatar">{owner.initials}</span><div className="company-dashboard-workload-copy"><strong>{owner.name}</strong><span title={owner.projects?.join(', ')}>{owner.projects?.length ? owner.projects.join(', ') : `${owner.open} open · ${owner.completed} done`}</span><div aria-hidden="true" className="company-dashboard-workload-track"><i style={{ width: `${(owner.open / maxWorkload) * 100}%` }} /></div></div><span className="company-dashboard-workload-meta"><strong aria-label={`${owner.open} open ${owner.open === 1 ? 'task' : 'tasks'}`}>{owner.open}</strong><small>{owner.overdue ? `${owner.overdue} overdue` : 'On track'}</small></span></li>)}</ol>}</section>

      <section className="company-dashboard-panel company-dashboard-chart-panel">
        <div className="company-dashboard-panel-heading">
          <div><h2>Activity overview</h2><p>Task creation vs. completion across all projects</p></div>
          <div className="company-dashboard-chart-filters">
            <NativeSelect aria-label="Activity range" id="overview-range" onChange={(event) => setRangeDays(Number(event.target.value) as 7 | 30 | 90)} value={String(rangeDays)}>
              <NativeSelectOption value="7">Last 7 days</NativeSelectOption>
              <NativeSelectOption value="30">Last 30 days</NativeSelectOption>
              <NativeSelectOption value="90">Last 90 days</NativeSelectOption>
            </NativeSelect>
            <NativeSelect aria-label="Activity project" id="overview-project" onChange={(event) => setChartProjectId(event.target.value as Id<'projects'> | '')} value={chartProjectId}>
              <NativeSelectOption value="">All projects</NativeSelectOption>
              {uniqueProjects.map((project) => <NativeSelectOption key={project.project._id} value={project.project._id}>{project.project.name}</NativeSelectOption>)}
            </NativeSelect>
          </div>
        </div>
        {!overview || (!shouldUseInitialOverview && !rangedOverview) ? (
          <div aria-label="Loading activity overview" className="company-dashboard-skeleton" role="status" />
        ) : !hasTaskActivity ? (
          <div className="company-dashboard-chart-empty" role="status">
            <strong>No task activity in this period</strong>
            <span>Created and completed tasks will appear here.</span>
          </div>
        ) : <CompanyActivityChart days={rangeDays} trend={trend} />}
      </section>

      <div className="company-dashboard-utility-column"><section className="company-dashboard-panel company-dashboard-partners"><div className="company-dashboard-panel-heading"><div><h2>Connected partners</h2><p>Active company relationships</p></div></div>{overview?.partners.length ? <ul>{overview.partners.map((partner) => <li key={partner.id}><span className="company-dashboard-partner-avatar">{partner.initials}</span><span><strong>{partner.name}</strong><small>{partner.relationshipName}</small></span><em>{partner.status}</em></li>)}</ul> : <div className="company-quiet-empty"><strong>No connected partners yet</strong>{isAdmin ? <button onClick={() => openQuickAction('partner')} type="button">Add partner</button> : null}</div>}</section>{isAdmin ? <section className="company-dashboard-panel company-dashboard-actions"><div className="company-dashboard-panel-heading"><div><h2>Quick actions</h2><p>Common workspace actions</p></div></div><div className="company-dashboard-action-grid"><button onClick={() => openQuickAction('project')} type="button"><Plus aria-hidden="true" size={20} /><span><strong>New project</strong><small>Start a new initiative</small></span></button><button onClick={() => openQuickAction('invite')} type="button"><UsersRound aria-hidden="true" size={20} /><span><strong>Invite people</strong><small>Add team members</small></span></button><button onClick={() => openQuickAction('partner')} type="button"><Handshake aria-hidden="true" size={20} /><span><strong>Add partner</strong><small>Connect a company</small></span></button>{onCreateTaskRequest ? <button onClick={() => openQuickAction('task')} type="button"><CheckSquare2 aria-hidden="true" size={20} /><span><strong>Create task</strong><small>Add work to a Project</small></span></button> : null}</div></section> : null}</div>
    </div>

    <Dialog onOpenChange={(open) => { if (!open) closeQuickAction() }} open={quickAction === 'project' || quickAction === 'invite' || quickAction === 'partner'}><DialogContent className="company-dashboard-dialog"><DialogHeader><DialogTitle>{quickAction === 'project' ? 'New project' : quickAction === 'invite' ? 'Invite people' : 'Add partner'}</DialogTitle><DialogDescription>{quickAction === 'project' ? `Create a project in ${companyName}.` : quickAction === 'invite' ? `Invite a teammate to ${companyName}.` : `Connect ${companyName} with another company.`}</DialogDescription></DialogHeader>{quickAction === 'project' ? <InternalProjectForm actingCompanyId={activeCompanyId} currentUserId={currentUserId} run={async (action) => { const result = await run(action); closeQuickAction(); return result }} /> : quickAction === 'invite' ? <InviteMemberForm actingCompanyId={activeCompanyId} run={async (action) => { const result = await run(action); closeQuickAction(); return result }} /> : <RelationshipForm actingCompanyId={activeCompanyId} run={async (action) => { const result = await run(action); closeQuickAction(); return result }} />}</DialogContent></Dialog>
    <CompanyOverviewProjectDialogs activeCompanyId={activeCompanyId} activityProject={activityProject} onActivityOpenChange={(open) => { if (!open) setActivityProject(null) }} onSettingsOpenChange={(open) => { if (!open) setSettingsProject(null) }} run={run} settingsProject={settingsProject} />
  </div>
}
