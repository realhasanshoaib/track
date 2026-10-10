import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  AlertTriangle, ArrowRight, CalendarDays, Check, CircleAlert, Clock3,
  ChevronRight, ClipboardList, FileText, FolderKanban, MessageCircle,
  Plus, Settings2, UsersRound,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import { api } from "../../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../../convex/_generated/dataModel";
import { NativeSelect, NativeSelectOption } from "#/components/ui/native-select";
import { CompanyThreadBrowser } from "#/features/threads/CompanyThreadBrowser";
import { TaskCreateDialog } from "#/features/tasks/TaskCreateDialog";
import { getGroupAvatar } from "#/features/workspace/group-avatar";
import {
  getCompanyProjectConversationSearch, getCompanyProjectMembersSearch,
  getCompanyProjectTaskSearch, type CompanyProjectLinkContext,
} from "./company-project-links";
import { CompanyProjectNavigation } from "./CompanyProjectNavigation";
import type { CompanyProjectChannel } from "./company-project-types";
import "./company-project-overview.css";

type SharedProjectItem = FunctionReturnType<typeof api.sharedProjects.listForActingCompany>[number];
type ProjectMember = FunctionReturnType<typeof api.sharedProjects.listMembers>[number];
type ProjectOverview = FunctionReturnType<typeof api.sharedProjects.getOverview>;
type OverviewData = FunctionReturnType<typeof api.companyOverview.getProject>;

type Props = {
  actingCompanyId: Id<"companies">; actingCompanyName: string;
  channelItems: Array<CompanyProjectChannel>; currentUser: Doc<"users">;
  item: SharedProjectItem; projectId: Id<"projects">; projectMemberId: Id<"projectMembers">;
  projectMembers?: Array<ProjectMember>; projectOverview?: ProjectOverview;
  tasksEnabled: boolean; threadUnreadByChannel: ReadonlyMap<Id<"groups">, number>;
};

const dateFormatter = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" });
const compactDateFormatter = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });

function relativeTime(timestamp: number) {
  const minutes = Math.floor(Math.max(0, Date.now() - timestamp) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  if (hours < 48) return "Yesterday";
  return `${Math.floor(hours / 24)}d ago`;
}

function projectLifecycleLabel(status: string) {
  if (status === "archive_pending") return "Archive approval pending";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function taskSearch(context: CompanyProjectLinkContext, extra: Record<string, string> = {}) {
  return { ...getCompanyProjectTaskSearch(context), ...extra };
}

function taskStatusTone(status: string) {
  const normalized = status.trim().toLocaleLowerCase();
  if (normalized.includes("block")) return "blocked";
  if (normalized.includes("progress") || normalized.includes("started")) return "progress";
  if (normalized.includes("done") || normalized.includes("complete")) return "done";
  if (normalized.includes("backlog")) return "backlog";
  if (normalized.includes("cancel")) return "canceled";
  return "todo";
}

function ProjectProgressChart({ data, range, onRangeChange }: { data: OverviewData | undefined; range: 7 | 30 | 90; onRangeChange: (range: 7 | 30 | 90) => void }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const points = data?.trend ?? [];
  const max = Math.max(1, ...points.flatMap((point) => [point.created, point.completed]));
  const width = 640; const height = 152; const pad = { left: 30, right: 10, top: 12, bottom: 24 };
  const x = (index: number) => pad.left + (index / Math.max(points.length - 1, 1)) * (width - pad.left - pad.right);
  const y = (value: number) => pad.top + (1 - value / max) * (height - pad.top - pad.bottom);
  const line = (key: "created" | "completed") => points.map((point, index) => `${x(index)},${y(point[key])}`).join(" ");
  const completedArea = points.length ? `${x(0)},${height - pad.bottom} ${line("completed")} ${x(points.length - 1)},${height - pad.bottom}` : "";
  const active = activeIndex === null ? null : points[activeIndex];
  return <section className="project-overview-panel project-progress-panel">
    <header className="project-panel-header"><div><h2>Project progress</h2><p>Tasks completed vs created</p></div><div className="project-chart-controls"><span><i className="completed" />Completed</span><span><i className="created" />Created</span><label className="sr-only" htmlFor="project-progress-range">Progress range</label><NativeSelect aria-label="Progress range" id="project-progress-range" onChange={(event) => onRangeChange(Number(event.target.value) as 7 | 30 | 90)} size="sm" value={String(range)}><NativeSelectOption value="7">Last 7 days</NativeSelectOption><NativeSelectOption value="30">Last 30 days</NativeSelectOption><NativeSelectOption value="90">Last 90 days</NativeSelectOption></NativeSelect></div></header>
    {!data ? <div className="project-chart-skeleton" aria-label="Loading project progress" role="status" /> : data.stats.total === 0 ? <div className="project-panel-empty"><strong>Not enough project history yet.</strong><span>Activity will appear here as tasks are created and completed.</span></div> : <><div className="project-progress-chart-wrap"><svg aria-label={`Cumulative task progress for the last ${range} days. ${data.stats.completed} of ${data.stats.total} tasks are complete.`} className="project-progress-chart" role="img" viewBox={`0 0 ${width} ${height}`}><defs><linearGradient id="project-completed-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#f5c400" stopOpacity=".22" /><stop offset="1" stopColor="#f5c400" stopOpacity="0" /></linearGradient></defs>{[0, .25, .5, .75, 1].map((ratio) => <g key={ratio}><line className="grid-line" x1={pad.left} x2={width - pad.right} y1={pad.top + ratio * (height - pad.top - pad.bottom)} y2={pad.top + ratio * (height - pad.top - pad.bottom)} /><text x="3" y={pad.top + ratio * (height - pad.top - pad.bottom) + 3}>{Math.round(max * (1 - ratio))}</text></g>)}<polygon fill="url(#project-completed-fill)" points={completedArea} /><polyline className="created-line" points={line("created")} /><polyline className="completed-line" points={line("completed")} />{points.map((point, index) => <g key={point.date}><line className={activeIndex === index ? "hover-guide active" : "hover-guide"} x1={x(index)} x2={x(index)} y1={pad.top} y2={height - pad.bottom} /><circle className="created-point" cx={x(index)} cy={y(point.created)} r="2.5" /><circle className="completed-point" cx={x(index)} cy={y(point.completed)} r="2.5" /><rect aria-label={`${dateFormatter.format(new Date(`${point.date}T00:00:00Z`))}: ${point.created} created, ${point.completed} completed`} className="chart-hit" height={height - pad.top} onBlur={() => setActiveIndex(null)} onFocus={() => setActiveIndex(index)} onMouseEnter={() => setActiveIndex(index)} onMouseLeave={() => setActiveIndex(null)} role="button" tabIndex={index % Math.max(1, Math.ceil(points.length / 8)) === 0 || index === points.length - 1 ? 0 : -1} width={Math.max(8, (width - pad.left - pad.right) / points.length)} x={x(index) - 4} y={pad.top} /></g>)}{[0, Math.floor((points.length - 1) / 3), Math.floor(((points.length - 1) * 2) / 3), points.length - 1].filter((value, index, values) => value >= 0 && values.indexOf(value) === index).map((index) => <text className="x-label" key={points[index]?.date} textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"} x={x(index)} y={height - 5}>{compactDateFormatter.format(new Date(`${points[index]!.date}T00:00:00Z`))}</text>)}</svg>{active ? <div className="project-chart-tooltip" style={{ left: `${(x(activeIndex!) / width) * 100}%` }}><strong>{dateFormatter.format(new Date(`${active.date}T00:00:00Z`))}</strong><span>Created <b>{active.created}</b></span><span>Completed <b>{active.completed}</b></span></div> : null}</div><p className="project-chart-summary">{data.trendSummary.completedThisMonth} {data.trendSummary.completedThisMonth === 1 ? "task" : "tasks"} completed this month{data.trendSummary.completedLastMonth > 0 ? `, ${Math.abs(data.trendSummary.completedThisMonth - data.trendSummary.completedLastMonth)} ${data.trendSummary.completedThisMonth >= data.trendSummary.completedLastMonth ? "more" : "fewer"} than last month.` : "."}</p></>}
  </section>;
}

function WorkloadByOwner({ data, linkContext }: { data: OverviewData | undefined; linkContext: CompanyProjectLinkContext }) {
  const owners = data?.workload ?? [];
  const maximum = Math.max(1, ...owners.map((owner) => owner.total));

  return (
    <section className="project-overview-panel project-workload-panel">
      <header className="project-panel-header">
        <div>
          <h2>Workload by owner</h2>
          <p>Assigned work across this project</p>
        </div>
      </header>
      {!data ? <div aria-label="Loading workload by owner" className="project-chart-skeleton" role="status" /> : !owners.length ? <div className="project-panel-empty"><strong>No assigned work yet</strong><span>Assign tasks to see the team workload.</span></div> : (
        <ul aria-label="Project workload by owner" className="project-workload-list">
          {owners.map((owner) => {
            const completedPercent = Math.round((owner.completed / Math.max(owner.total, 1)) * 100);
            const loadPercent = Math.round((owner.total / maximum) * 100);
            const search = owner.id === "unassigned" ? taskSearch(linkContext, { assignee: "unassigned" }) : taskSearch(linkContext, { assignee: owner.id });
            return <li key={owner.id}>
              <Link aria-label={`${owner.name}: ${owner.total} ${owner.total === 1 ? 'task' : 'tasks'}, ${owner.completed} completed, ${owner.open} open${owner.overdue ? `, ${owner.overdue} overdue` : ""}`} className="project-workload-row" params={{ projectId: linkContext.projectId }} search={search} to="/workspace/projects/$projectId/tasks">
                <span aria-hidden="true" className={`project-workload-avatar${owner.id === "unassigned" ? " is-unassigned" : ""}`}>{owner.avatarUrl ? <img alt="" height="28" src={owner.avatarUrl} width="28" /> : owner.initials}</span>
                <span className="project-workload-copy"><strong>{owner.name}</strong><small>{owner.completed} done · {owner.open} open</small></span>
                <span aria-hidden="true" className="project-workload-track"><span className="project-workload-load" style={{ width: `${loadPercent}%` }}><span className="project-workload-complete" style={{ width: `${completedPercent}%` }} /></span></span>
                <span className="project-workload-total">{owner.total}<small>{owner.total === 1 ? 'task' : 'tasks'}</small></span>
                {owner.overdue ? <span className="project-workload-overdue">{owner.overdue} overdue</span> : <ChevronRight aria-hidden="true" className="project-workload-arrow" />}
              </Link>
            </li>;
          })}
        </ul>
      )}
    </section>
  );
}

function ActivityList({ items, currentUser, linkContext }: { items: OverviewData["recentWork"] | undefined; currentUser: boolean; linkContext: CompanyProjectLinkContext }) {
  if (!items) return <div className="project-activity-skeleton" aria-label="Loading project activity" role="status" />;
  if (!items.length) return <div className="project-panel-empty compact"><strong>{currentUser ? "No personal project activity yet" : "No recent project activity"}</strong><span>New activity will appear here.</span></div>;
  return <ul className="project-activity-list">{items.map((activity) => { const content = <><span className={`project-activity-icon is-${activity.kind}`}>{activity.kind === "task" ? <Check aria-hidden="true" /> : activity.kind === "thread" ? <MessageCircle aria-hidden="true" /> : <FileText aria-hidden="true" />}</span>{!currentUser ? <span className="project-activity-avatar" aria-hidden="true">{activity.actorInitials}</span> : null}<span className="project-activity-copy"><strong>{currentUser ? activity.copy.charAt(0).toUpperCase() + activity.copy.slice(1) : `${activity.actorName} ${activity.copy}`}</strong><small>{relativeTime(activity.createdAt)} · {activity.kind === "thread" ? "Thread" : activity.kind === "evidence" ? "Evidence" : "Task"}</small></span></>; return <li key={`${activity.kind}-${activity.id}`}>{activity.taskKey ? <Link params={{ projectId: linkContext.projectId }} search={taskSearch(linkContext, { task: activity.taskKey, view: "all" })} to="/workspace/projects/$projectId/tasks">{content}</Link> : activity.threadId && activity.groupId ? <Link params={{ projectId: linkContext.projectId, groupId: activity.groupId, threadId: activity.threadId }} search={{ companyId: linkContext.actingCompanyId, membershipId: linkContext.projectMemberId }} to="/workspace/projects/$projectId/groups/$groupId/threads/$threadId">{content}</Link> : <div>{content}</div>}</li>; })}</ul>;
}

export function CompanyProjectOverview({ actingCompanyId, actingCompanyName, channelItems, currentUser, item, projectId, projectMemberId, projectMembers, tasksEnabled, threadUnreadByChannel }: Props) {
  const [range, setRange] = useState<7 | 30 | 90>(30); const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [healthSaveState, setHealthSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const threadSearchInputId = `project-thread-search-${projectId}`;
  const linkContext = useMemo<CompanyProjectLinkContext>(() => ({ actingCompanyId, projectId, projectMemberId }), [actingCompanyId, projectId, projectMemberId]);
  const overview = useQuery(api.companyOverview.getProject, tasksEnabled ? { actingCompanyId, days: range, projectId, projectMemberId } : "skip");
  const updateDeliveryHealth = useMutation(api.sharedProjects.updateDeliveryHealth);
  const taskBoards = useQuery(api.taskBoards.list, tasksEnabled ? { actingCompanyId, projectId, projectMemberId } : "skip");
  const activeChannels = channelItems.filter((channel) => channel.status !== "archived"); const latestChannel = activeChannels[0] ?? channelItems[0];
  const completedState = overview?.distribution.find((state) => state.category === "completed"); const blockedState = overview?.distribution.find((state) => state.name.toLocaleLowerCase() === "blocked");
  const stats: Array<{ key: string; label: string; value: string | number; icon: ReactNode; search: Record<string, string>; foot: string }> = [
    { key: "completion", label: "Completion", value: `${overview?.stats.completion ?? 0}%`, icon: <span className="project-completion-ring" style={{ "--progress": `${overview?.stats.completion ?? 0}%` } as React.CSSProperties} />, search: completedState ? { state: completedState.id } : {}, foot: overview ? `${overview.stats.completed} of ${overview.stats.total} tasks` : "Loading…" },
    { key: "open", label: "Open tasks", value: overview?.stats.open ?? 0, icon: <FileText />, search: { view: "all" }, foot: "View tasks" },
    { key: "blocked", label: "Blocked", value: overview?.stats.blocked ?? 0, icon: <CircleAlert />, search: blockedState ? { state: blockedState.id } : { view: "all" }, foot: "Review" },
    { key: "overdue", label: "Overdue", value: overview?.stats.overdue ?? 0, icon: <Clock3 />, search: { due: "overdue", view: "all" }, foot: "Review" },
    { key: "due", label: "Due this week", value: overview?.stats.dueThisWeek ?? 0, icon: <CalendarDays />, search: { due: "upcoming", view: "all" }, foot: "View tasks" },
  ];
  const canEditDeliveryHealth = Boolean(
    overview?.permissions.canManageProject &&
    (item.project.status === "active" || item.project.status === "proposed"),
  );

  async function saveDeliveryHealth(value: string) {
    if (value !== "on_track" && value !== "at_risk" && value !== "off_track") return;
    setHealthSaveState("saving");
    try {
      await updateDeliveryHealth({ actingCompanyId, health: value, projectId, projectMemberId });
      setHealthSaveState("saved");
    } catch {
      setHealthSaveState("error");
    }
  }
  return <>
    <CompanyProjectNavigation actingCompanyId={actingCompanyId} activeArea="overview" activeProject={{ projectId, projectMemberId }} tasksEnabled={tasksEnabled} secondaryNavigation={channelItems.length ? <nav aria-label="Project Channels"><span className="company-project-nav-label">Channels</span><div className="company-project-nav-channel-list">{channelItems.map((channel) => { const { Icon, tone } = getGroupAvatar(channel); const unread = threadUnreadByChannel.get(channel._id) ?? 0; return <Link aria-label={`Open ${channel.name} Channel`} className="company-project-nav-channel" key={channel._id} params={{ projectId }} search={getCompanyProjectConversationSearch({ ...linkContext, groupId: channel._id })} to="/workspace/company-projects/$projectId"><span className={`company-project-nav-channel-icon ${tone}`}><Icon aria-hidden="true" size={14} /></span>{unread ? <span aria-label={`${unread} unread threads`} className="company-project-nav-count">{unread}</span> : null}<span className="company-project-nav-copy"><strong>{channel.name}</strong><small>{channel.status === "archived" ? "Archived Channel" : "Channel"}</small></span></Link>; })}</div></nav> : null} />
    <section className="company-project-overview"><div className="company-project-overview-inner">
      <nav aria-label="Breadcrumb" className="company-project-breadcrumb"><Link search={{ view: "overview", taskFilter: undefined }} to="/workspace/company">Company workspace</Link><span>/</span><Link search={{ view: "projects", taskFilter: undefined }} to="/workspace/company">Projects</Link><span>/</span><b>{item.project.name}</b></nav>
      <header className="company-project-hero">
        <div className="company-project-hero-mark"><FolderKanban aria-hidden="true" /></div>
        <div className="company-project-hero-copy">
          <div className="project-title-row"><h1>{item.project.name}</h1></div>
          <p>{item.project.description?.trim() || "No project description has been added."}</p>
          <div className="project-hero-meta"><div className="project-member-stack">{overview?.members.slice(0, 4).map((member) => <span aria-label={member.name} key={member.id} title={member.name}>{member.avatarUrl ? <img alt="" height="22" src={member.avatarUrl} width="22" /> : member.name.slice(0, 1)}</span>)}{overview && overview.memberCount > 4 ? <span>+{overview.memberCount - 4}</span> : null}</div><span><UsersRound aria-hidden="true" />{overview?.memberCount ?? projectMembers?.length ?? "…"} members</span><span>·</span><span>Updated {dateFormatter.format(item.project.updatedAt)}</span></div>
          <section aria-label="Project status" className="project-status-area">
            <div className="project-status-value">
              <span>Lifecycle</span>
              <strong>{projectLifecycleLabel(item.project.status ?? "active")}</strong>
              <small>Archive and recovery follow the Company approval process.</small>
              {overview?.permissions.canManageProject ? <Link params={{ projectId }} search={getCompanyProjectMembersSearch(linkContext)} to="/workspace/company-projects/$projectId">Manage lifecycle <ArrowRight aria-hidden="true" size={13} /></Link> : null}
            </div>
            <div className="project-status-value">
              <label htmlFor="project-delivery-health">Delivery health</label>
              <select aria-describedby="project-delivery-health-help" disabled={!canEditDeliveryHealth || healthSaveState === "saving"} id="project-delivery-health" onChange={(event) => { setHealthSaveState("idle"); void saveDeliveryHealth(event.currentTarget.value); }} value={overview?.project.deliveryHealth ?? ""}>
                <option value="">Not set</option>
                <option value="on_track">On track</option>
                <option value="at_risk">At risk</option>
                <option value="off_track">Off track</option>
              </select>
              <small id="project-delivery-health-help">{canEditDeliveryHealth ? overview?.project.deliveryHealthUpdatedAt ? `Updated ${dateFormatter.format(overview.project.deliveryHealthUpdatedAt)}. Task signals remain visible below.` : "Set an owner assessment. Task signals remain visible below." : "Ask a Project manager to update this assessment."}</small>
            </div>
          </section>
          {healthSaveState === "error" ? <p className="project-status-feedback" role="alert">Could not update delivery health. Try again.</p> : healthSaveState !== "idle" ? <p aria-live="polite" className="project-status-feedback" role="status">{healthSaveState === "saving" ? "Saving delivery health…" : "Delivery health updated."}</p> : null}
        </div>
        <div className="company-project-hero-actions">{tasksEnabled && overview?.permissions.canWriteProject ? <button className="company-project-primary-action" onClick={() => setCreateTaskOpen(true)} type="button"><Plus aria-hidden="true" />Create task</button> : null}{overview?.permissions.canManageProject ? <Link className="company-project-settings-action" params={{ projectId }} search={getCompanyProjectMembersSearch(linkContext)} to="/workspace/company-projects/$projectId"><Settings2 aria-hidden="true" />Project settings</Link> : null}</div>
      </header>
      <section aria-label="Project health statistics" className="project-stats-grid">{stats.map((stat) => <Link className={`project-stat-card is-${stat.key}`} key={stat.key} params={{ projectId }} search={taskSearch(linkContext, stat.search)} to="/workspace/projects/$projectId/tasks"><span className="project-stat-icon">{stat.icon}</span><span className="project-stat-value">{overview ? stat.value : "—"}</span><span className="project-stat-label">{stat.label}</span><small>{stat.foot}<ArrowRight aria-hidden="true" /></small></Link>)}</section>
      <div className="project-chart-grid"><ProjectProgressChart data={overview} onRangeChange={setRange} range={range} /><WorkloadByOwner data={overview} linkContext={linkContext} /></div>
      <section className="project-overview-panel project-attention-panel"><header className="project-attention-header"><span><AlertTriangle aria-hidden="true" /></span><div><h2>Attention needed</h2><p>Tasks that require your attention</p></div>{overview?.attentionCount ? <Link params={{ projectId }} search={taskSearch(linkContext, { view: "all" })} to="/workspace/projects/$projectId/tasks">View all ({overview.attentionCount}) <ArrowRight aria-hidden="true" /></Link> : null}</header>{!overview ? <div className="project-attention-skeleton" role="status">Loading attention items…</div> : overview.attention.length ? <div className="project-attention-table" role="table" aria-label="Tasks that require attention"><div className="project-attention-columns" role="row"><span role="columnheader">Task</span><span role="columnheader">Status</span><span role="columnheader">Assignee</span><span role="columnheader">Due date</span><span role="columnheader">Reason</span><span /></div>{overview.attention.map((task) => <Link key={task.id} params={{ projectId }} role="row" search={taskSearch(linkContext, { task: task.publicKey, view: "all" })} to="/workspace/projects/$projectId/tasks"><span role="cell"><ClipboardList aria-hidden="true" />{task.title}</span><span className={`project-status-pill is-${taskStatusTone(task.status)}`} role="cell"><i />{task.status}</span><span role="cell">{task.assignee ?? "Unassigned"}</span><span role="cell">{task.dueDate ? dateFormatter.format(new Date(`${task.dueDate}T00:00:00`)) : "No due date"}</span><span role="cell">{task.reason}</span><ChevronRight aria-hidden="true" className="project-attention-open-icon" /></Link>)}</div> : <div className="project-panel-empty compact"><strong>No attention needed</strong><span>Everything requiring immediate attention is clear.</span></div>}</section>
      <div className="project-activity-grid"><section className="project-overview-panel"><header className="project-panel-header project-list-heading"><div><h2>Your work</h2><p>Your recent updates in this Project</p></div><Link params={{ projectId }} search={taskSearch(linkContext, { view: "my" })} to="/workspace/projects/$projectId/tasks">View tasks <ArrowRight aria-hidden="true" /></Link></header><ActivityList currentUser items={overview?.yourWork} linkContext={linkContext} /></section><section className="project-overview-panel"><header className="project-panel-header project-list-heading"><div><h2>Recent project work</h2><p>Latest visible updates across this Project</p></div>{latestChannel ? <Link params={{ projectId }} search={getCompanyProjectConversationSearch({ ...linkContext, groupId: latestChannel._id })} to="/workspace/company-projects/$projectId">View all <ArrowRight aria-hidden="true" /></Link> : null}</header><ActivityList currentUser={false} items={overview?.recentWork} linkContext={linkContext} /></section></div>
    </div></section>
    <aside className="company-project-overview-threads" aria-label="Project context"><header><span className="company-eyebrow">Project context</span><h2>Threads</h2><p>All visible threads for the represented Company.</p></header><div><CompanyThreadBrowser companyName={actingCompanyName} context={{ actingCompanyId, projectMemberId }} projectId={projectId} searchInputId={threadSearchInputId} userId={currentUser._id} /></div>{overview?.permissions.canManageProject ? <section className="project-managed-actions"><header><h3>Settings</h3><p>Manage project details, people, and access.</p></header><Link params={{ projectId }} search={getCompanyProjectMembersSearch(linkContext)} to="/workspace/company-projects/$projectId"><Settings2 aria-hidden="true" />Open members</Link></section> : null}</aside>
    {tasksEnabled ? <TaskCreateDialog boards={taskBoards ?? []} identity={{ actingCompanyId, projectMemberId }} onCreated={() => setCreateTaskOpen(false)} onOpenChange={setCreateTaskOpen} open={createTaskOpen} projectId={projectId} /> : null}
  </>;
}
