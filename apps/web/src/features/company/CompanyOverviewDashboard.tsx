import { Link, useNavigate } from '@tanstack/react-router'
import type { FunctionReturnType } from 'convex/server'
import { useMemo } from 'react'
import { ArrowUpRight, CheckCircle2, CircleAlert, Clock3, FolderKanban, MessageCircle } from 'lucide-react'

import { api } from '../../../../../convex/_generated/api'
import type { Id } from '../../../../../convex/_generated/dataModel'
import { ExpandingButtonGroup } from '../../components/ui/expanding-button-group'
import { CompanyWorkMixChart } from './CompanyWorkMixChart'
import { getCompanyProjectConversationSearch, getCompanyProjectOverviewSearch, getCompanyProjectTaskSearch } from './company-project-links'

type Overview = FunctionReturnType<typeof api.companyOverview.get>
type ProjectDirectory = FunctionReturnType<typeof api.sharedProjects.listForActingCompany>

type Props = {
  activeCompanyId: Id<'companies'>
  companyName: string
  overview: Overview | undefined
  projects: ProjectDirectory | undefined
  searchQuery: string
}

function relativeTime(timestamp: number) {
  const elapsed = Math.max(0, Date.now() - timestamp)
  const hours = Math.floor(elapsed / 3_600_000)
  if (hours < 1) return 'Just now'
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function CompanyOverviewDashboard({ activeCompanyId, companyName, overview, projects, searchQuery }: Props) {
  const navigate = useNavigate()
  const projectSources = useMemo(
    () => new Map((projects ?? []).filter((row) => row.membership.status === 'active').map((row) => [row.project._id, row])),
    [projects],
  )
  const overviewProjects = overview?.projects ?? []
  const normalizedSearch = searchQuery.trim().toLocaleLowerCase()
  const matchesSearch = (value: string) => !normalizedSearch || value.toLocaleLowerCase().includes(normalizedSearch)
  const visibleProjects = overviewProjects.filter((project) => matchesSearch(`${project.name} ${project.description ?? ''}`))
  const visibleActivity = (overview?.recentActivity ?? []).filter((activity) => matchesSearch(`${activity.preview} ${activity.projectName} ${activity.action} ${activity.actorName}`))
  const activeProjectCount = overview?.activeProjectCount ?? overviewProjects.length

  function activityHref(activity: NonNullable<Overview>['recentActivity'][number]) {
    const source = projectSources.get(activity.projectId)
    if (!source) return null
    const projectId = encodeURIComponent(String(activity.projectId))
    const membershipId = encodeURIComponent(String(source.membership._id))
    const companyId = encodeURIComponent(String(activeCompanyId))
    if (activity.kind === 'task' && activity.taskKey) {
      return `/workspace/projects/${projectId}/tasks?actingCompanyId=${companyId}&groupId=&projectMemberId=${membershipId}&view=all&task=${encodeURIComponent(activity.taskKey)}`
    }
    if (activity.kind === 'message' && activity.groupId && activity.threadId) {
      return `/workspace/projects/${projectId}/groups/${encodeURIComponent(String(activity.groupId))}/threads/${encodeURIComponent(String(activity.threadId))}?companyId=${companyId}&membershipId=${membershipId}`
    }
    const groupId = activity.kind === 'message' && activity.groupId ? encodeURIComponent(String(activity.groupId)) : ''
    return `/workspace/company-projects/${projectId}?companyId=${companyId}&groupId=${groupId}&membershipId=${membershipId}&view=${activity.kind === 'message' ? 'channels' : 'overview'}`
  }

  return <div aria-busy={!overview} aria-label={`${companyName} overview`} className="company-overview-live">
    <section aria-label="Company work summary" className="company-owner-summary">
      <Link className="company-owner-summary-item" search={{ view: 'projects', taskFilter: undefined }} to="/workspace/company">
        <span className="company-owner-summary-icon"><FolderKanban aria-hidden="true" size={16} /></span>
        <span><strong>{overview ? activeProjectCount : '—'}</strong><small>Active projects</small></span>
        <ArrowUpRight aria-hidden="true" className="company-owner-summary-arrow" size={14} />
      </Link>
      <Link className="company-owner-summary-item" search={{ view: 'tasks', taskFilter: 'active' }} to="/workspace/company">
        <span className="company-owner-summary-icon"><CheckCircle2 aria-hidden="true" size={16} /></span>
        <span><strong>{overview?.stats.openTasks ?? '—'}</strong><small>Open tasks</small></span>
        <ArrowUpRight aria-hidden="true" className="company-owner-summary-arrow" size={14} />
      </Link>
      <Link className={`company-owner-summary-item${overview?.attentionCounts.blocked ? ' is-attention' : ''}`} search={{ view: 'tasks', taskFilter: 'blocked' }} to="/workspace/company">
        <span className="company-owner-summary-icon"><CircleAlert aria-hidden="true" size={16} /></span>
        <span><strong>{overview?.attentionCounts.blocked ?? '—'}</strong><small>Blocked tasks</small></span>
        <ArrowUpRight aria-hidden="true" className="company-owner-summary-arrow" size={14} />
      </Link>
      <Link className="company-owner-summary-item" search={{ view: 'tasks', taskFilter: 'due-soon' }} to="/workspace/company">
        <span className="company-owner-summary-icon"><Clock3 aria-hidden="true" size={16} /></span>
        <span><strong>{overview?.stats.upcomingTasks ?? '—'}</strong><small>Due in 7 days</small></span>
        <ArrowUpRight aria-hidden="true" className="company-owner-summary-arrow" size={14} />
      </Link>
    </section>

    <div className="company-owner-overview-grid">
      <section aria-labelledby="company-owner-progress-title" className="company-owner-section company-owner-progress">
        <header className="company-owner-section-heading">
          <div>
            <h2 id="company-owner-progress-title">Project progress</h2>
            <p>Completion, delivery health, and work that needs attention.</p>
          </div>
          <Link className="company-owner-section-link" search={{ view: 'projects', taskFilter: undefined }} to="/workspace/company">All Projects <ArrowUpRight aria-hidden="true" size={14} /></Link>
        </header>

        {!overview ? <div aria-label="Loading Project progress" className="company-owner-skeleton" role="status" />
          : overviewProjects.length === 0 ? <div className="company-owner-empty"><strong>No active Projects yet</strong><span>Active Project progress will appear here.</span></div>
            : visibleProjects.length === 0 ? <div className="company-owner-empty"><strong>No Projects match this search.</strong></div>
              : <ul aria-label="Active Project progress" className="company-owner-project-list">
                {visibleProjects.map((project) => {
                  const source = projectSources.get(project.id)
                  const total = project.totalTasks
                  const progress = total > 0 ? Math.round((project.completedTasks / total) * 100) : 0
                  const lifecycleStatus = project.status ?? 'active'
                  const lifecycle = lifecycleStatus === 'archive_pending'
                    ? 'Archive pending'
                    : lifecycleStatus.charAt(0).toUpperCase() + lifecycleStatus.slice(1)
                  const deliveryHealth = project.deliveryHealth === 'on_track'
                    ? 'On track'
                    : project.deliveryHealth === 'at_risk'
                      ? 'At risk'
                      : project.deliveryHealth === 'off_track'
                        ? 'Off track'
                        : 'Not set'
                  const rowContent = <>
                    <span className="company-owner-project-main">
                      {source ? <Link search={getCompanyProjectOverviewSearch({ actingCompanyId: activeCompanyId, projectId: project.id, projectMemberId: source.membership._id })} to="/workspace/company-projects/$projectId" params={{ projectId: project.id }}>{project.name}</Link> : <strong>{project.name}</strong>}
                      <span className="company-owner-project-status"><span>Lifecycle <b>{lifecycle}</b></span><span>Delivery health <b>{deliveryHealth}</b></span></span>
                    </span>
                    <span className="company-owner-project-work">
                      <span className="company-owner-project-work-count">
                        {total > 0 ? <>{project.completedTasks} of {total} tasks <b>{progress}%</b></> : 'No tasks yet'}
                      </span>
                      {total > 0 ? <span aria-label={`${project.completedTasks} of ${total} tasks complete`} aria-valuemax={100} aria-valuemin={0} aria-valuenow={progress} className="company-owner-progress-track" role="progressbar"><i style={{ transform: `scaleX(${progress / 100})` }} /></span> : null}
                      {project.blockedTasks > 0 || project.overdueTasks > 0 || project.dueSoonTasks > 0 ? <span className="company-owner-project-signals">
                        {project.blockedTasks > 0 ? <span className="is-blocked">{project.blockedTasks} blocked</span> : null}
                        {project.overdueTasks > 0 ? <span className="is-overdue">{project.overdueTasks} overdue</span> : null}
                        {project.dueSoonTasks > 0 ? <span className="is-due-soon">{project.dueSoonTasks} due soon</span> : null}
                      </span> : null}
                    </span>
                    {source ? <ExpandingButtonGroup
                      className="company-owner-project-actions"
                      defaultExpanded="overview"
                      items={[
                        {
                          id: 'overview',
                          label: 'Overview',
                          icon: <FolderKanban />,
                          onSelect: () => navigate({
                            to: '/workspace/company-projects/$projectId',
                            params: { projectId: project.id },
                            search: getCompanyProjectOverviewSearch({ actingCompanyId: activeCompanyId, projectId: project.id, projectMemberId: source.membership._id }),
                          }),
                        },
                        {
                          id: 'tasks',
                          label: 'Tasks',
                          icon: <CheckCircle2 />,
                          onSelect: () => navigate({
                            to: '/workspace/projects/$projectId/tasks',
                            params: { projectId: project.id },
                            search: getCompanyProjectTaskSearch({ actingCompanyId: activeCompanyId, projectId: project.id, projectMemberId: source.membership._id }),
                          }),
                        },
                        {
                          id: 'channels',
                          label: 'Channels',
                          icon: <MessageCircle />,
                          onSelect: () => navigate({
                            to: '/workspace/company-projects/$projectId',
                            params: { projectId: project.id },
                            search: getCompanyProjectConversationSearch({ actingCompanyId: activeCompanyId, projectId: project.id, projectMemberId: source.membership._id }),
                          }),
                        },
                      ]}
                      label={`Project actions for ${project.name}`}
                      size="md"
                    /> : <span className="company-owner-project-access">Summary only</span>}
                  </>
                  return <li key={project.id}>
                    <div aria-label={`${project.name}${source ? '' : ', summary only. Project access is not available.'}`} className={`company-owner-project-link${source ? '' : ' is-unavailable'}`} role="group">{rowContent}</div>
                  </li>
                })}
              </ul>}
      </section>

      <section aria-labelledby="company-owner-work-mix-title" className="company-owner-section company-owner-chart">
        <header className="company-owner-section-heading">
          <div>
            <h2 id="company-owner-work-mix-title">Task states</h2>
            <p>Non-canceled tasks across active Projects.</p>
          </div>
          <Link className="company-owner-section-link" search={{ view: 'tasks', taskFilter: 'all' }} to="/workspace/company">View tasks <ArrowUpRight aria-hidden="true" size={14} /></Link>
        </header>
        {!overview ? <div aria-label="Loading Company work mix" className="company-owner-skeleton company-owner-chart-skeleton" role="status" />
          : <CompanyWorkMixChart distribution={overview.taskDistribution} />}
      </section>

      <section aria-labelledby="company-owner-activity-title" className="company-owner-section company-owner-activity">
        <header className="company-owner-section-heading">
          <div>
            <h2 id="company-owner-activity-title">Recent activity</h2>
            <p>Project changes, task progress, and thread updates.</p>
          </div>
        </header>

        {!overview ? <div aria-label="Loading Company activity" className="company-owner-skeleton" role="status" />
          : overview.recentActivity.length === 0 ? <div className="company-owner-empty"><strong>No recent work activity</strong><span>Project and task changes will appear here.</span></div>
            : visibleActivity.length === 0 ? <div className="company-owner-empty"><strong>No activity matches this search.</strong></div>
              : <ol aria-label="Recent work activity" className="company-owner-activity-list">
                {visibleActivity.map((activity) => {
                  const href = activityHref(activity)
                  const kindLabel = activity.kind === 'message' ? 'Thread' : activity.kind === 'task' ? 'Task' : 'Project'
                  const content = <>
                    <span aria-hidden="true" className="company-owner-activity-marker" />
                    <span className="company-owner-activity-copy">
                      <strong>{activity.preview}</strong>
                      <span>{activity.projectName} · {kindLabel}</span>
                    </span>
                    <time dateTime={new Date(activity.createdAt).toISOString()} title={new Date(activity.createdAt).toLocaleString()}>{relativeTime(activity.createdAt)}</time>
                    <ArrowUpRight aria-hidden="true" className="company-owner-activity-arrow" size={15} />
                  </>
                  return <li key={activity.id}>
                    {href ? <a aria-label={`Open ${kindLabel.toLowerCase()} activity: ${activity.preview}`} href={href}>{content}</a> : <div className="company-owner-activity-item">{content}</div>}
                  </li>
                })}
              </ol>}
      </section>
    </div>
    <p className="company-owner-scope-note">Company totals include every active Project. Task titles and thread content follow Project and Channel access.</p>
  </div>
}
