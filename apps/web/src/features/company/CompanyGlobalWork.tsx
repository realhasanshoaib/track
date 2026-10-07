import type { FunctionReturnType } from "convex/server";
import { AlertCircle, CalendarDays, CheckCircle2, CheckSquare2, Clock3, FolderKanban, MessageSquareText, Search, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { CompanyThreadBrowser } from "#/features/threads/CompanyThreadBrowser";
import type { CompanyTaskFilter } from "./company-view-state";
import { isOpenCompanyTask, matchesCompanyTaskFilters } from "./company-global-work-state";

type ProjectItem = FunctionReturnType<typeof api.sharedProjects.listForActingCompany>[number];
type TaskItem = FunctionReturnType<typeof api.companyOverview.listTasks>[number];
type TaskFilter = CompanyTaskFilter;

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTaskHref(item: TaskItem, actingCompanyId: Id<"companies">) {
  const query = new URLSearchParams({
    actingCompanyId: String(actingCompanyId),
    groupId: "",
    projectMemberId: String(item.projectMemberId),
    task: String(item.task.publicKey),
    view: "all",
  });
  return `/workspace/projects/${encodeURIComponent(String(item.project._id))}/tasks?${query.toString()}`;
}

function taskInitials(item: TaskItem) {
  const name = item.assignee?.userDisplayNameSnapshot ?? "Unassigned";
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

export function CompanyGlobalWork({ actingCompanyId, companyName, currentUserId, initialFilter = "all", projects, searchQuery, tasks, view }: {
  actingCompanyId: Id<"companies">;
  companyName: string;
  currentUserId: Id<"users">;
  initialFilter?: TaskFilter;
  projects: Array<ProjectItem>;
  searchQuery?: string;
  tasks: Array<TaskItem>;
  view: "tasks" | "threads";
}) {
  const [filter, setFilter] = useState<TaskFilter>(initialFilter);
  const [search, setSearch] = useState("");
  const today = localDateKey();
  const dueSoonLimit = new Date();
  dueSoonLimit.setDate(dueSoonLimit.getDate() + 7);
  const dueSoonKey = localDateKey(dueSoonLimit);
  const activeTasks = tasks.filter(isOpenCompanyTask);
  const completedCount = tasks.length - activeTasks.length;
  const overdueCount = activeTasks.filter((item) => item.task.dueDate && item.task.dueDate < today).length;
  const dueSoonCount = activeTasks.filter((item) => item.task.dueDate && item.task.dueDate >= today && item.task.dueDate <= dueSoonKey).length;
  const blockedCount = activeTasks.filter((item) => item.state?.name.trim().toLocaleLowerCase() === "blocked").length;
  useEffect(() => setFilter(initialFilter), [initialFilter]);
  const visibleTasks = useMemo(() => {
    const normalized = `${search} ${searchQuery ?? ""}`.trim().toLocaleLowerCase();
    return tasks.filter((item) => matchesCompanyTaskFilters(item, {
      dueSoonKey,
      filter,
      normalizedSearch: normalized,
      today,
    }));
  }, [dueSoonKey, filter, search, searchQuery, tasks, today]);

  const threadProjects = (
    <div className="company-global-thread-projects">
      {projects.map((item) => (
        <section className="company-global-thread-project" key={item.membership._id}>
          <div className="company-global-thread-project-heading">
            <span className="company-global-project-icon"><FolderKanban aria-hidden="true" size={15} /></span>
            <strong>{item.project.name}</strong>
            <span>{item.membership.role === "manager" ? "Managed Project" : "Shared Project"}</span>
          </div>
          <CompanyThreadBrowser companyName={companyName} context={{ actingCompanyId, projectMemberId: item.membership._id }} projectId={item.project._id} searchQuery={searchQuery} userId={currentUserId} />
        </section>
      ))}
    </div>
  );

  if (view === "threads") {
    return (
      <div className="company-global-work company-global-work-threads-only">
        <section aria-labelledby="company-global-threads-title" className="company-global-work-panel company-global-threads-panel">
          <header className="company-global-work-panel-header">
            <div><span className="company-section-kicker">Across Projects</span><h2 id="company-global-threads-title">Company threads</h2><p>Discussions are grouped by Project and limited to Channels you can access.</p></div>
            <MessageSquareText aria-hidden="true" size={18} />
          </header>
          {projects.length ? threadProjects : <p className="company-global-work-empty">No Projects are available in this Company.</p>}
        </section>
      </div>
    );
  }

  const stats = [
    { label: "Total tasks", value: tasks.length, detail: "Across all projects", icon: CheckSquare2, tone: "amber" },
    { label: "Active", value: activeTasks.length, detail: "Currently open", icon: CheckCircle2, tone: "green" },
    { label: "Due soon", value: dueSoonCount, detail: "Due in 7 days", icon: Clock3, tone: "blue" },
    { label: "Overdue", value: overdueCount, detail: "Past due date", icon: AlertCircle, tone: "red" },
  ];

  return (
    <div className="company-global-work-layout">
      <section aria-label="Task summary" className="company-work-summary">
        {stats.map(({ detail, icon: Icon, label, tone, value }) => (
          <article className={`company-work-stat ${tone}`} key={label}>
            <span><Icon aria-hidden="true" size={20} /></span>
            <div><small>{label}</small><strong>{value}</strong><p>{detail}</p></div>
          </article>
        ))}
      </section>
      <div className="company-global-work">
        <section aria-labelledby="company-global-tasks-title" className="company-global-work-panel company-global-tasks-panel">
          <header className="company-global-work-panel-header">
            <div><span className="company-section-kicker">Across projects</span><h2 id="company-global-tasks-title">All company tasks</h2><p>Work from every visible Project in this Company.</p></div>
            <span className="company-count-badge">{visibleTasks.length}</span>
          </header>
          <div className="company-global-task-toolbar">
            <div aria-label="Task filters" className="company-global-task-tabs" role="group">
              {([['all', 'All', tasks.length], ['active', 'Active', activeTasks.length], ['completed', 'Completed', completedCount], ['due-soon', 'Due soon', dueSoonCount], ['overdue', 'Overdue', overdueCount], ['blocked', 'Blocked', blockedCount], ['unassigned', 'Unassigned', activeTasks.filter((item) => !item.assignee).length]] as const).map(([value, label, count]) => (
                <button aria-pressed={filter === value} className={filter === value ? "active" : undefined} key={value} onClick={() => setFilter(value)} type="button">{label}<small>{count}</small></button>
              ))}
            </div>
            <label className="company-global-task-search"><Search aria-hidden="true" size={15} /><span className="sr-only">Search tasks</span><input autoComplete="off" name="company-task-search" onChange={(event) => setSearch(event.target.value)} placeholder="Search tasks…" type="search" value={search} /></label>
          </div>
          {visibleTasks.length ? (
            <ul className="company-global-task-list">
              {visibleTasks.map((item) => (
                <li key={item.task._id}>
                  <CheckSquare2 aria-hidden="true" size={17} />
                  <a href={getTaskHref(item, actingCompanyId)}><strong>{item.task.title}</strong><span>{item.project.name}<i className={`company-task-priority ${item.task.priority}`}>{item.task.priority}</i></span></a>
                  <span className="company-task-due"><CalendarDays aria-hidden="true" size={14} />{item.task.dueDate ?? "No due date"}</span>
                  <span aria-label={item.assignee?.userDisplayNameSnapshot ?? "Unassigned"} className="company-task-assignee">{item.assignee ? taskInitials(item) : <UserRound aria-hidden="true" size={14} />}</span>
                </li>
              ))}
            </ul>
          ) : <p className="company-global-work-empty">No tasks match this view.</p>}
        </section>
        <section aria-labelledby="company-global-threads-title" className="company-global-work-panel company-global-threads-panel">
          <header className="company-global-work-panel-header">
            <div><span className="company-section-kicker">Across Projects</span><h2 id="company-global-threads-title">Global threads</h2><p>Open and archived discussions from visible Channels.</p></div>
            <MessageSquareText aria-hidden="true" size={18} />
          </header>
          {projects.length ? threadProjects : <p className="company-global-work-empty">No Projects are available in this Company.</p>}
        </section>
      </div>
    </div>
  );
}
