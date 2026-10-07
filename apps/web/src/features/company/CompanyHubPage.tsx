import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowUpRight,
  Archive,
  Bell,
  Building2,
  CircleAlert,
  Clock3,
  Filter,
  FolderKanban,
  Handshake,
  LayoutGrid,
  Mail,
  MessageSquareText,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { api } from "../../../../../convex/_generated/api";
import TrackLoader from "#/components/TrackLoader";
import { ConfirmDialog } from "#/components/ui/confirm-dialog";
import { Button } from "#/components/ui/button";
import { authClient } from "#/lib/auth-client";
import { useDevAuthBypass } from "#/lib/dev-auth-bypass";
import { useReleaseConfigState } from "#/lib/release-config";
import {
  CreateCompanyForm,
  CompanyProfileForm,
  InternalProjectForm,
  InviteMemberForm,
  RelationshipForm,
  RelationshipParticipantForm,
  SharedProjectForm,
} from "./CompanyForms";
import { CompanyProjectNavigation } from "./CompanyProjectNavigation";
import { CompanyGlobalWork } from "./CompanyGlobalWork";
import { CompanyOverviewDashboard } from "./CompanyOverviewDashboard";
import { CompanyTaskCreateFlow } from "./CompanyTaskCreateFlow";
import { useActingCompany } from "./use-acting-company";
import { resolveCompanyMemberActionCapabilities } from "./company-member-capabilities";
import { MigrationPanel } from "./MigrationPanel";
import { UnassignedProjects } from "./UnassignedProjects";
import { formatCompanyError } from "./company-errors";
import {
  getCompanyProjectConversationSearch,
} from "./company-project-links";
import { resolveCompanyAdministrationId } from "./company-query-scope";
import { type CompanyHubView, type CompanyTaskFilter } from "./company-view-state";
import {
  filterPeopleDirectory,
  filterProjectDirectory,
  filterRelationshipDirectory,
  type PeopleDirectoryFilter,
  type ProjectDirectoryFilter,
  type RelationshipDirectoryFilter,
} from "./company-collaboration-state";

import "./company-overview-reference.css";
import "./company-collaboration.css";
import "./company-global-work.css";
import "./company-experience.css";

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function formatRelativeTime(timestamp: number) {
  const elapsed = Math.max(0, Date.now() - timestamp);
  const hours = Math.floor(elapsed / 3_600_000);
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function CompanyHubPage({
  initialView = "overview",
  initialTaskFilter = "all",
  onViewChange,
}: {
  initialView?: CompanyHubView;
  initialTaskFilter?: CompanyTaskFilter;
  onViewChange?: (view: CompanyHubView) => void;
}) {
  const releaseState = useReleaseConfigState();
  const flags = releaseState.config;
  const session = authClient.useSession();
  const devAuthBypass = useDevAuthBypass();
  const ensureCurrentUser = useMutation(api.auth.ensureCurrentUser);
  const syncDevUser = useMutation(api.auth.syncDevUser);
  const authReady = Boolean(session.data || devAuthBypass.enabled);
  useEffect(() => {
    if (!authReady) return;
    void (devAuthBypass.enabled ? syncDevUser({}) : ensureCurrentUser({}));
  }, [authReady, devAuthBypass.enabled, ensureCurrentUser, syncDevUser]);
  const currentUser = useQuery(api.auth.getCurrentUser, authReady ? {} : "skip");
  const companies = useQuery(
    api.companies.listMine,
    flags.companyModel && currentUser ? {} : "skip",
  );
  const availableCompanyIds = useMemo(
    () =>
      (companies ?? []).flatMap((item) =>
        item.company && item.company.status !== "closed"
          ? [item.company._id]
          : [],
      ),
    [companies],
  );
  const { actingCompanyId, setActingCompanyId } =
    useActingCompany(availableCompanyIds);
  const actingCompany = companies?.find(
    (item) => item.company?._id === actingCompanyId,
  );
  const canAdministerActingCompany =
    actingCompany?.membership.role === "owner" ||
    actingCompany?.membership.role === "admin";
  const activeActingCompanyId =
    actingCompany?.company?.status === "active" ? actingCompanyId : null;
  const companyAdministrationId = resolveCompanyAdministrationId(
    companies,
    actingCompanyId,
  );
  const administration = useQuery(
    api.companies.getAdministration,
    companyAdministrationId && canAdministerActingCompany
      ? { companyId: companyAdministrationId }
      : "skip",
  );
  const companyInvitations = useQuery(
    api.companies.listPendingForMe,
    flags.companyModel ? {} : "skip",
  );
  const relationships = useQuery(
    api.relationships.listMine,
    activeActingCompanyId && canAdministerActingCompany
      ? { actingCompanyId: activeActingCompanyId }
      : "skip",
  );
  const relationshipInvitations = useQuery(
    api.relationships.listInvitations,
    activeActingCompanyId && canAdministerActingCompany
      ? { actingCompanyId: activeActingCompanyId }
      : "skip",
  );
  const projectInvitations = useQuery(
    api.sharedProjects.listInvitations,
    activeActingCompanyId && canAdministerActingCompany
      ? { actingCompanyId: activeActingCompanyId }
      : "skip",
  );
  const projects = useQuery(
    api.sharedProjects.listForActingCompany,
    activeActingCompanyId ? { actingCompanyId: activeActingCompanyId } : "skip",
  );
  const companyOverview = useQuery(
    api.companyOverview.get,
    activeActingCompanyId ? { companyId: activeActingCompanyId, days: 7 } : "skip",
  );
  const companyTasks = useQuery(
    api.companyOverview.listTasks,
    currentUser && activeActingCompanyId && flags.tasks
      ? { companyId: activeActingCompanyId }
      : "skip",
  );
  const attention = useQuery(
    api.mobile.listAttention,
    currentUser && activeActingCompanyId
      ? {
          actingCompanyId: activeActingCompanyId,
          paginationOpts: { cursor: null, numItems: 40 },
          userId: currentUser._id,
        }
      : "skip",
  );
  const projectSummaries = useQuery(
    api.mobile.listProjects,
    currentUser && activeActingCompanyId
      ? {
          actingCompanyId: activeActingCompanyId,
          paginationOpts: { cursor: null, numItems: 50 },
          userId: currentUser._id,
        }
      : "skip",
  );
  const taskCreateProjects = projectSummaries?.page ?? [];
  const decideCompanyInvitation = useMutation(api.companies.decideInvitation);
  const decideRelationshipInvitation = useMutation(
    api.relationships.decideInvitation,
  );
  const decideProjectInvitation = useMutation(
    api.sharedProjects.decideInvitation,
  );
  const leaveRelationship = useMutation(api.relationships.leave);
  const proposeRelationshipRemoval = useMutation(
    api.relationships.proposeRemoval,
  );
  const approveRelationshipRemoval = useMutation(
    api.relationships.approveRemoval,
  );
  const updateMember = useMutation(api.companies.updateMember);
  const revokeInvitation = useMutation(api.companies.revokeInvitation);
  const setSuspended = useMutation(api.companies.setSuspended);
  const closeCompany = useMutation(api.companies.close);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<CompanyHubView>(initialView);
  const [overviewSearch, setOverviewSearch] = useState("");
  const [directorySearch, setDirectorySearch] = useState("");
  const [projectFilter, setProjectFilter] = useState<ProjectDirectoryFilter>("all");
  const [relationshipFilter, setRelationshipFilter] =
    useState<RelationshipDirectoryFilter>("all");
  const [peopleFilter, setPeopleFilter] = useState<PeopleDirectoryFilter>("all");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [closeCompanyOpen, setCloseCompanyOpen] = useState(false);
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [notificationFilter, setNotificationFilter] = useState<"all" | "task" | "message" | "suggestion" | "invitation">("all");
  const [projectCreatorRequested, setProjectCreatorRequested] = useState(false);
  const [overviewProjectCreatorRequest, setOverviewProjectCreatorRequest] = useState(0);
  const overviewSearchRef = useRef<HTMLInputElement>(null);
  const notificationButtonRef = useRef<HTMLButtonElement>(null);
  const notificationContainerRef = useRef<HTMLDivElement>(null);
  const firstProjectCreatorRef = useRef<HTMLElement>(null);
  const projectCreatorDisclosureRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    setActiveView(initialView);
  }, [initialView]);

  useEffect(() => {
    function focusOverviewSearch(event: KeyboardEvent) {
      if (
        activeView === "overview" &&
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "k"
      ) {
        event.preventDefault();
        overviewSearchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", focusOverviewSearch);
    return () => window.removeEventListener("keydown", focusOverviewSearch);
  }, [activeView]);

  useEffect(() => {
    if (!notificationsOpen) return;

    function closeOnOutsidePointer(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !notificationContainerRef.current?.contains(event.target)
      ) {
        setNotificationsOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setNotificationsOpen(false);
      notificationButtonRef.current?.focus();
    }

    window.addEventListener("pointerdown", closeOnOutsidePointer);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnOutsidePointer);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [notificationsOpen]);

  useEffect(() => {
    if (
      !projectCreatorRequested ||
      activeView !== "projects" ||
      projects === undefined
    ) {
      return;
    }

    const animationFrame = window.requestAnimationFrame(() => {
      const creator =
        firstProjectCreatorRef.current ?? projectCreatorDisclosureRef.current;
      if (!creator) return;
      if (creator instanceof HTMLDetailsElement) creator.open = true;
      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      creator.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "start",
      });
      creator
        .querySelector<HTMLElement>("input, textarea, select, button")
        ?.focus({ preventScroll: true });
      setProjectCreatorRequested(false);
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [activeView, projectCreatorRequested, projects]);

  const selectView = (view: CompanyHubView) => {
    if (view !== activeView) setDirectorySearch("");
    setActiveView(view);
    onViewChange?.(view);
  };

  const scrollToManagement = (id: string) => {
    const target = document.getElementById(id);
    if (!target) return;
    if (target instanceof HTMLDetailsElement) target.open = true;
    target.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "start",
    });
    target.querySelector<HTMLElement>("input, button, select")?.focus({
      preventScroll: true,
    });
  };

  const showProjectCreator = () => {
    setProjectCreatorRequested(true);
    selectView("projects");
  };

  const showOverviewProjectCreator = () => {
    setOverviewProjectCreatorRequest((request) => request + 1);
  };

  async function run(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const result = await action();
      if (
        result &&
        typeof result === "object" &&
        "status" in result &&
        result.status === "expired"
      ) {
        setNotice("This invitation expired. Refresh the page to see current invitations.");
      } else {
        setNotice("Saved.");
      }
    } catch (error) {
      setNotice(formatCompanyError(error));
    } finally {
      setBusy(false);
    }
  }

  if (releaseState.status === "loading")
    return <TrackLoader label="Loading Company workspace" timeoutMs={8000} />;

  if (!flags.companyModel)
    return (
      <main className="company-hub">
        <h1>Company collaboration</h1>
        <p>
          This capability is currently disabled by the server release
          configuration.
        </p>
        <Link to="/workspace">Return to Projects</Link>
      </main>
    );

  if (companies === undefined || currentUser === undefined)
    return <TrackLoader label="Loading Company workspace" timeoutMs={8000} />;

  const isCompanyAdmin = canAdministerActingCompany;
  const visibleView =
    (activeView === "relationships" || activeView === "settings") &&
    !isCompanyAdmin
      ? "overview"
      : activeView;
  const activeMembers =
    administration?.members.filter(
      ({ membership }) => membership.status === "active",
    ) ?? [];
  const activeRelationships =
    relationships?.filter(
      ({ relationship }) => relationship.status === "active",
    ) ?? [];
  const companyProjects =
    projects?.filter((item) => item.participationRole === "owner") ?? [];
  const collaboratingProjects =
    projects?.filter((item) => item.participationRole === "collaborator") ?? [];
  const unassignedProjects =
    projects?.filter((item) => item.participationRole === "unassigned_legacy") ??
    [];
  const directoryProjects = filterProjectDirectory(
    projects ?? [],
    projectFilter,
    directorySearch,
  );
  const visibleRelationships = filterRelationshipDirectory(
    relationships ?? [],
    relationshipFilter,
    directorySearch,
  );
  const visiblePeople = filterPeopleDirectory(
    administration?.members ?? [],
    peopleFilter,
    directorySearch,
  );
  const attentionItems = attention?.page.slice(0, 5) ?? [];
  const visibleAttentionItems = attentionItems.filter((item) => notificationFilter === "all" || item.kind === notificationFilter);
  const viewCopy: Record<CompanyHubView, { title: string; description: string }> = {
    overview: {
      title: "Company overview",
      description: "Shared work, partners, and people in one place.",
    },
    tasks: {
      title: "Global tasks",
      description: "Open tasks assigned to you across every Project in this Company.",
    },
    threads: {
      title: "Threads",
      description: "Open and archived discussions from the Channels you can access.",
    },
    projects: {
      title: "Projects",
      description: "See each Project's owner, access, status, and latest update.",
    },
    relationships: {
      title: "Relationships",
      description: "Manage company relationships, shared projects, and collaboration access.",
    },
    people: {
      title: "People",
      description: "Manage company members, roles, and collaboration across projects.",
    },
    settings: {
      title: "Company profile",
      description: "The display name appears anywhere this Company represents its people and projects.",
    },
  };
  const currentViewCopy = viewCopy[visibleView];

  return (
    <main aria-busy={busy} className="company-hub-shell company-unified-shell company-reference-shell">
      <CompanyProjectNavigation
        actingCompanyId={actingCompanyId}
        activeArea="company"
        onCompanyChange={setActingCompanyId}
        tasksEnabled={false}
        companyNavigation={
          <nav aria-label="Company workspace">
            <span className="company-project-nav-label">Workspace</span>
          <Link
            aria-current={visibleView === "overview" ? "page" : undefined}
            className={
              visibleView === "overview"
                ? "company-project-nav-item active"
                : "company-project-nav-item"
            }
            search={{ view: "overview", taskFilter: undefined }}
            to="/workspace/company"
          >
            <LayoutGrid aria-hidden="true" size={14} />
            Overview
          </Link>
          {activeActingCompanyId && currentUser ? (
            <Link
              aria-current={visibleView === "projects" ? "page" : undefined}
              className={
                visibleView === "projects"
                  ? "company-project-nav-item active"
                  : "company-project-nav-item"
              }
              search={{ view: "projects", taskFilter: undefined }}
              to="/workspace/company"
            >
              <FolderKanban aria-hidden="true" size={14} />
              Projects
            </Link>
          ) : null}
          {activeActingCompanyId && currentUser ? (
            <Link
              aria-current={visibleView === "threads" ? "page" : undefined}
              className={visibleView === "threads" ? "company-project-nav-item active" : "company-project-nav-item"}
              search={{ view: "threads", taskFilter: undefined }}
              to="/workspace/company"
            >
              <MessageSquareText aria-hidden="true" size={14} />
              Threads
            </Link>
          ) : null}
          {actingCompanyId && isCompanyAdmin ? (
            <Link
              aria-current={visibleView === "relationships" ? "page" : undefined}
              className={
                visibleView === "relationships"
                  ? "company-project-nav-item active"
                  : "company-project-nav-item"
              }
              search={{ view: "relationships", taskFilter: undefined }}
              to="/workspace/company"
            >
              <Handshake aria-hidden="true" size={14} />
              Relationships
            </Link>
          ) : null}
          {actingCompanyId && administration ? (
            <Link
              aria-current={visibleView === "people" ? "page" : undefined}
              className={
                visibleView === "people"
                  ? "company-project-nav-item active"
                  : "company-project-nav-item"
              }
              search={{ view: "people", taskFilter: undefined }}
              to="/workspace/company"
            >
              <UsersRound aria-hidden="true" size={14} />
              People
            </Link>
          ) : null}
          {actingCompanyId && isCompanyAdmin ? (
            <Link
              aria-current={visibleView === "settings" ? "page" : undefined}
              className={
                visibleView === "settings"
                  ? "company-project-nav-item active"
                  : "company-project-nav-item"
              }
              to="/workspace/company/settings"
            >
              <Settings2 aria-hidden="true" size={14} />
              Settings
            </Link>
          ) : null}
          </nav>
        }
      />

      <section className="company-hub">
        <header className={`company-hub-header company-overview-page-header ${visibleView === "overview" ? "is-overview" : "is-directory"}`}>
          <div>
            <span className="company-eyebrow">
              {actingCompany?.company?.displayName ?? "Company workspace"}
            </span>
            <h1>{currentViewCopy.title}</h1>
            <p>{currentViewCopy.description}</p>
          </div>
          {visibleView === "overview" ? (
            <div className="company-overview-header-tools">
              <label className="company-overview-search">
                <Search aria-hidden="true" size={18} />
                <span className="sr-only">Search projects, tasks, or people</span>
                <input
                  autoComplete="off"
                  name="companySearch"
                  onChange={(event) => setOverviewSearch(event.target.value)}
                  placeholder="Search projects, tasks, or people…"
                  ref={overviewSearchRef}
                  type="search"
                  value={overviewSearch}
                />
                <kbd>Ctrl K</kbd>
              </label>
              <div
                className="company-overview-notifications"
                ref={notificationContainerRef}
              >
                <button
                  aria-controls="company-overview-notifications"
                  aria-expanded={notificationsOpen}
                  aria-label={
                    notificationsOpen
                      ? "Close notifications"
                      : "Open notifications"
                  }
                  className="company-overview-icon-button"
                  onClick={() => setNotificationsOpen((value) => !value)}
                  ref={notificationButtonRef}
                  type="button"
                >
                  <Bell aria-hidden="true" size={21} />
                  {(attention?.page.length ?? 0) > 0 ? <i aria-hidden="true" /> : null}
                </button>
                {notificationsOpen ? (
                  <section
                    aria-label="Notifications"
                    className="company-overview-notification-popover"
                    id="company-overview-notifications"
                  >
                    <header>
                      <strong>Notifications</strong>
                      <span>{attention?.page.length ?? 0} unread</span>
                    </header>
                    <div aria-label="Notification filters" className="company-notification-filters" role="group">
                      {(["all", "task", "message", "suggestion", "invitation"] as const).map((filter) => (
                        <button aria-pressed={notificationFilter === filter} className={notificationFilter === filter ? "active" : undefined} key={filter} onClick={() => setNotificationFilter(filter)} type="button">
                          {filter === "all" ? "All" : filter === "message" ? "Messages" : filter === "suggestion" ? "Suggestions" : filter === "invitation" ? "Invites" : "Tasks"}
                        </button>
                      ))}
                    </div>
                    {visibleAttentionItems.length > 0 ? (
                      <ul>
                        {visibleAttentionItems.map((item) => {
                          const scope = item.companyId
                            ? `&companyId=${encodeURIComponent(String(item.companyId))}${"membershipId" in item && item.membershipId ? `&membershipId=${encodeURIComponent(String(item.membershipId))}` : ""}`
                            : "";
                          const href = item.kind === "task"
                            ? `/workspace/projects/${encodeURIComponent(String(item.projectId))}/tasks?view=board&task=${encodeURIComponent(item.taskKey)}${scope}`
                            : item.kind === "message"
                              ? `/workspace/company-projects/${encodeURIComponent(String(item.projectId))}?view=channels&groupId=${encodeURIComponent(String(item.groupId))}${item.threadId ? `&threadId=${encodeURIComponent(String(item.threadId))}` : ""}${scope}`
                              : item.kind === "invitation"
                                ? `/workspace/company/settings?companyId=${encodeURIComponent(String(item.companyId))}`
                                : `/workspace/projects/${encodeURIComponent(String(item.projectId))}/tasks?view=inbox${scope}`
                          return <li key={`${item.kind}-${item.id}`}>
                            <span className={`activity-dot ${item.kind}`} />
                            <a href={href}>
                              <strong>
                                {item.kind === "task"
                                  ? item.taskTitle
                                  : item.kind === "suggestion"
                                    ? item.title
                                    : item.kind === "message"
                                      ? item.senderName
                                      : item.title}
                              </strong>
                              <span>{item.projectName} · View</span>
                            </a>
                          </li>
                        })}
                      </ul>
                    ) : (
                      <p>{attentionItems.length ? "No notifications match this filter." : "You are all caught up."}</p>
                    )}
                  </section>
                ) : null}
              </div>
              {isCompanyAdmin ? (
                <button
                  className="company-overview-new-project"
                  onClick={showOverviewProjectCreator}
                  type="button"
                >
                  <Plus aria-hidden="true" size={19} />
                  New project
                </button>
              ) : null}
            </div>
          ) : visibleView !== "settings" ? (
            <div className="company-directory-header-tools">
              <label className="company-directory-search">
                <Search aria-hidden="true" size={16} />
                <span className="sr-only">Search {currentViewCopy.title}</span>
                <input
                  autoComplete="off"
                  name={`${visibleView}Search`}
                  onChange={(event) => setDirectorySearch(event.target.value)}
                  placeholder={`Search ${currentViewCopy.title.toLocaleLowerCase()}…`}
                  type="search"
                  value={directorySearch}
                />
              </label>
              {visibleView === "projects" && isCompanyAdmin ? (
                <button
                  className="company-overview-new-project"
                  onClick={showProjectCreator}
                  type="button"
                >
                  <Plus aria-hidden="true" size={18} />
                  New project
                </button>
              ) : visibleView === "tasks" ? (
                <button
                  className="company-overview-new-project"
                  disabled={taskCreateProjects.length === 0}
                  onClick={() => setCreateTaskOpen(true)}
                  type="button"
                >
                  <Plus aria-hidden="true" size={18} />
                  New task
                </button>
              ) : visibleView === "relationships" && isCompanyAdmin ? (
                <button
                  className="company-overview-new-project"
                  onClick={() => scrollToManagement("create-company-relationship")}
                  type="button"
                >
                  <Plus aria-hidden="true" size={18} />
                  New relationship
                </button>
              ) : visibleView === "people" && isCompanyAdmin ? (
                <button
                  className="company-overview-new-project"
                  onClick={() => scrollToManagement("invite-company-member")}
                  type="button"
                >
                  <UserPlus aria-hidden="true" size={18} />
                  Invite person
                </button>
              ) : null}
            </div>
          ) : null}
        </header>
        {notice ? (
          <p aria-live="polite" className="company-notice">
            {notice}
          </p>
        ) : null}

        <div className="company-hub-content">
          {currentUser &&
          visibleView === "projects" ? (
            <UnassignedProjects userId={currentUser._id} />
          ) : null}
          {companies.length === 0 ? (
            <section className="company-empty-workspace">
              <span className="company-empty-icon">
                <Building2 aria-hidden="true" size={22} />
              </span>
              <h2>Create your first Company</h2>
              <p>
                A Company represents your team when you work with external
                partners.
              </p>
              <CreateCompanyForm run={run} />
            </section>
          ) : null}

          {(visibleView === "tasks" || visibleView === "threads") && activeActingCompanyId && currentUser ? (
            <CompanyGlobalWork
              actingCompanyId={activeActingCompanyId}
              companyName={actingCompany?.company?.displayName ?? "Company"}
              currentUserId={currentUser._id}
              projects={projects ?? []}
              searchQuery={directorySearch}
              tasks={companyTasks ?? []}
              initialFilter={initialTaskFilter}
              view={visibleView}
            />
          ) : null}
          {activeActingCompanyId ? (
            <CompanyTaskCreateFlow
              actingCompanyId={activeActingCompanyId}
              onOpenChange={setCreateTaskOpen}
              open={createTaskOpen}
              projects={taskCreateProjects}
            />
          ) : null}

          {(companyInvitations ?? []).length > 0 ? (
            <section className="company-workspace-section company-inbox">
              <div className="company-section-heading">
                <div>
                  <span className="company-section-kicker">Inbox</span>
                  <h2>Company invitations</h2>
                </div>
                <span className="company-count-badge">
                  {companyInvitations?.length}
                </span>
              </div>
              <ul className="company-request-list">
                {companyInvitations?.map(({ company, invitation }) => (
                  <li key={invitation._id}>
                    <div>
                      <strong>{company?.displayName}</strong>
                      <span>
                        Invited as {invitation.role} · expires{" "}
                        {new Date(invitation.expiresAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="company-row-actions">
                      <Button
                        onClick={() =>
                          void run(() =>
                            decideCompanyInvitation({
                              invitationId: invitation._id,
                              decision: "accept",
                            }),
                          )
                        }
                      >
                        Accept
                      </Button>
                      <Button
                        onClick={() =>
                          void run(() =>
                            decideCompanyInvitation({
                              invitationId: invitation._id,
                              decision: "decline",
                            }),
                          )
                        }
                        variant="outline"
                      >
                        Decline
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {actingCompanyId && actingCompany?.company?.status === "suspended" ? (
            <section className="company-workspace-section company-state-alert">
              <div>
                <h2>Company suspended</h2>
                <p>
                  Project and Channel access is paused until an owner
                  reactivates this Company.
                </p>
              </div>
              {actingCompany.membership.role === "owner" ? (
                <Button
                  onClick={() =>
                    void run(() =>
                      setSuspended({
                        companyId: actingCompanyId,
                        suspended: false,
                      }),
                    )
                  }
                >
                  Reactivate Company
                </Button>
              ) : null}
            </section>
          ) : null}


          {visibleView === "overview" &&
          actingCompanyId &&
          activeActingCompanyId &&
          currentUser &&
          actingCompany?.company ? (
            <CompanyOverviewDashboard
              activeCompanyId={activeActingCompanyId}
              companyName={actingCompany.company.displayName}
              createProjectRequest={overviewProjectCreatorRequest}
              currentUserId={currentUser._id}
              isAdmin={isCompanyAdmin}
              onCreateProjectRequestHandled={() => setOverviewProjectCreatorRequest(0)}
              onCreateTaskRequest={() => setCreateTaskOpen(true)}
              overview={companyOverview}
              projects={projects}
              searchQuery={overviewSearch}
              run={run}
            />
          ) : null}

          {visibleView === "projects" &&
          actingCompanyId &&
          currentUser &&
          actingCompany?.company ? (
            <div className="company-view-stack company-directory-view">
              <section className="company-collaboration-summary" aria-label="Project portfolio summary">
                <div><i><FolderKanban aria-hidden="true" size={20} /></i><span>Visible projects</span><strong>{projects?.length ?? 0}</strong><small>Across your Company</small></div>
                <div><i><UserPlus aria-hidden="true" size={20} /></i><span>Owned</span><strong>{companyProjects.length}</strong><small>Managed by your Company</small></div>
                <div><i><UsersRound aria-hidden="true" size={20} /></i><span>Collaborating</span><strong>{collaboratingProjects.length}</strong><small>Shared with partners</small></div>
                <div><i><CircleAlert aria-hidden="true" size={20} /></i><span>Needs attention</span><strong>{(projectInvitations?.length ?? 0) + unassignedProjects.length}</strong><small>Pending decisions</small></div>
              </section>
              <nav aria-label="Filter Projects" className="company-filter-bar">
                <span><Filter aria-hidden="true" size={14} /> View</span>
                {([
                  ["all", "All", projects?.length ?? 0],
                  ["owned", "Owned", companyProjects.filter((item) => item.project.status !== "archived").length],
                  ["collaborating", "Collaborating", collaboratingProjects.filter((item) => item.project.status !== "archived").length],
                  ["proposed", "Proposed", (projectInvitations?.length ?? 0) + (projects ?? []).filter((item) => item.project.status === "proposed").length],
                  ["archived", "Archived", (projects ?? []).filter((item) => item.project.status === "archived").length],
                  ["ownership", "Ownership pending", unassignedProjects.length],
                ] as const).map(([value, label, count]) => (
                  <button
                    aria-pressed={projectFilter === value}
                    className={projectFilter === value ? "active" : undefined}
                    key={value}
                    onClick={() => setProjectFilter(value)}
                    type="button"
                  >
                    {label}<small>{count}</small>
                  </button>
                ))}
              </nav>
              {(projectFilter === "all" || projectFilter === "proposed") &&
              (projectInvitations ?? []).length > 0 ? (
                <section className="company-workspace-section company-inbox">
                  <div className="company-section-heading">
                    <div>
                      <span className="company-section-kicker">Inbox</span>
                      <h2>Project invitations</h2>
                    </div>
                    <span className="company-count-badge">
                      {projectInvitations?.length}
                    </span>
                  </div>
                  <ul className="company-request-list">
                    {projectInvitations?.map(
                      ({ invitation, invitingCompany, project }) => (
                        <li key={invitation._id}>
                          <div>
                            <strong>{project?.name}</strong>
                            <span>
                              {invitingCompany?.displayName} proposes shared
                              work. Accepting makes you the initial manager.
                            </span>
                          </div>
                          <div className="company-row-actions">
                            <Button
                              onClick={() =>
                                void run(() =>
                                  decideProjectInvitation({
                                    actingCompanyId,
                                    invitationId: invitation._id,
                                    decision: "accept",
                                    initialMembers: [
                                      {
                                        userId: currentUser._id,
                                        role: "manager",
                                      },
                                    ],
                                  }),
                                )
                              }
                            >
                              Accept
                            </Button>
                            <Button
                              onClick={() =>
                                void run(() =>
                                  decideProjectInvitation({
                                    actingCompanyId,
                                    invitationId: invitation._id,
                                    decision: "decline",
                                    initialMembers: [],
                                  }),
                                )
                              }
                              variant="outline"
                            >
                              Decline
                            </Button>
                          </div>
                        </li>
                      ),
                    )}
                  </ul>
                </section>
              ) : null}

              {isCompanyAdmin &&
              projects !== undefined &&
              projects.length === 0 ? (
                <section
                  className="company-workspace-section company-first-project"
                  ref={firstProjectCreatorRef}
                >
                  <div className="company-section-heading">
                    <div>
                      <span className="company-section-kicker">Get started</span>
                      <h2>Create your first Company Project</h2>
                      <p>
                        Start inside {actingCompany.company.displayName}. Add
                        collaborating Companies only when the work needs them.
                      </p>
                    </div>
                  </div>
                  <InternalProjectForm
                    actingCompanyId={actingCompanyId}
                    currentUserId={currentUser._id}
                    run={run}
                  />
                </section>
              ) : null}

              {!isCompanyAdmin &&
              projects !== undefined &&
              projects.length === 0 ? (
                <section className="company-workspace-section">
                  <div className="company-quiet-empty">
                    <FolderKanban aria-hidden="true" size={18} />
                    <div>
                      <strong>No Projects available yet</strong>
                      <span>
                        A Company admin can create the first Project and add
                        members.
                      </span>
                    </div>
                  </div>
                </section>
              ) : null}

              <section className="company-workspace-section company-directory-panel">
                  <div className="company-section-heading">
                    <div>
                      <span className="company-overview-section-icon"><FolderKanban aria-hidden="true" size={21} /></span>
                      <span>
                        <h2>Project directory</h2>
                        <p>Project owner, access, status, and latest update.</p>
                      </span>
                    </div>
                    <span className="company-count-badge">{directoryProjects.length} shown</span>
                  </div>
                  <div className="company-directory-table" role="table" aria-label="Company Projects">
                    <div className="company-directory-table-head" role="row">
                      <span role="columnheader">Project</span><span role="columnheader">Owner</span><span role="columnheader">Access</span><span role="columnheader">Status</span><span role="columnheader">Updated</span><span aria-hidden="true" />
                    </div>
                    {directoryProjects.map((item, index) => (
                      <Link
                        className="company-directory-row"
                        key={item.membership._id}
                        params={{ projectId: item.project._id }}
                        role="row"
                        search={getCompanyProjectConversationSearch({ actingCompanyId, projectId: item.project._id, projectMemberId: item.membership._id })}
                        to="/workspace/company-projects/$projectId"
                      >
                        <span className="company-directory-identity" role="cell">
                          <span className={`company-project-graphic tone-${(index % 3) + 1}`}><FolderKanban aria-hidden="true" size={18} /></span>
                          <span><strong>{item.project.name}</strong><small>{item.project.description || "No description added"}</small></span>
                        </span>
                        <span role="cell">{item.owningCompany?.displayName ?? "Unassigned"}</span>
                        <span role="cell" className="company-access-cell"><ShieldCheck aria-hidden="true" size={14} /> {item.membership.role}</span>
                        <span role="cell" className={`company-state-pill ${item.project.status}`}>
                          {item.participationRole === "unassigned_legacy" ? "Ownership pending" : item.project.status}
                        </span>
                        <span role="cell">{formatRelativeTime(item.project.updatedAt)}</span>
                        <ArrowUpRight aria-label={`Open ${item.project.name}`} role="img" size={16} />
                      </Link>
                    ))}
                  </div>
                  {directoryProjects.length === 0 ? (
                    <div className="company-quiet-empty"><Archive aria-hidden="true" size={18} /><div><strong>No matching Projects</strong><span>Change the filter or search term to see more work.</span></div></div>
                  ) : null}
              </section>

              {isCompanyAdmin &&
              projects !== undefined &&
              projects.length > 0 ? (
                <details
                  className="company-management-disclosure"
                  ref={projectCreatorDisclosureRef}
                >
                  <summary>
                    <span>
                      <Plus aria-hidden="true" size={15} />
                      Create a Company Project
                    </span>
                    <small>Start internal work; invite collaborators later</small>
                  </summary>
                  <div className="company-management-body">
                    <InternalProjectForm
                      actingCompanyId={actingCompanyId}
                      currentUserId={currentUser._id}
                      run={run}
                    />
                  </div>
                </details>
              ) : null}

              {isCompanyAdmin && activeRelationships.length > 0 ? (
                <details className="company-management-disclosure">
                  <summary>
                    <span>
                      <Plus aria-hidden="true" size={15} />
                      Propose a shared Project
                    </span>
                    <small>
                      Start work with Companies in an active relationship
                    </small>
                  </summary>
                  <div className="company-management-body">
                    <SharedProjectForm
                      actingCompanyId={actingCompanyId}
                      currentUserId={currentUser._id}
                      relationships={activeRelationships}
                      run={run}
                    />
                  </div>
                </details>
              ) : null}
            </div>
          ) : null}

          {visibleView === "people" && actingCompanyId && administration ? (
            <div className="company-view-stack company-directory-view">
              <section className="company-collaboration-summary" aria-label="People and membership summary">
                <div><i><UsersRound aria-hidden="true" size={20} /></i><span>Company people</span><strong>{administration.members.length}</strong><small>Total members</small></div>
                <div><i><UserPlus aria-hidden="true" size={20} /></i><span>Active</span><strong>{activeMembers.length}</strong><small>Currently active</small></div>
                <div><i><ShieldCheck aria-hidden="true" size={20} /></i><span>Admin / Owners</span><strong>{administration.members.filter(({ membership }) => membership.status === "active" && (membership.role === "owner" || membership.role === "admin")).length}</strong><small>Manage workspace</small></div>
                <div><i><Mail aria-hidden="true" size={20} /></i><span>Invited</span><strong>{administration.invitations.length}</strong><small>Pending invitations</small></div>
              </section>
              <nav aria-label="Filter people" className="company-filter-bar">
                <span><Filter aria-hidden="true" size={14} /> View</span>
                {([
                  ["all", "All", administration.members.length],
                  ["active", "Active", activeMembers.length],
                  ["suspended", "Suspended", administration.members.filter(({ membership }) => membership.status === "suspended").length],
                  ["invited", "Invited", administration.invitations.length],
                ] as const).map(([value, label, count]) => (
                  <button aria-pressed={peopleFilter === value} className={peopleFilter === value ? "active" : undefined} key={value} onClick={() => setPeopleFilter(value)} type="button">
                    {label}<small>{count}</small>
                  </button>
                ))}
              </nav>
              {peopleFilter !== "invited" ? <section className="company-workspace-section company-directory-panel">
                <div className="company-section-heading">
                  <div>
                    <span className="company-overview-section-icon"><UsersRound aria-hidden="true" size={21} /></span>
                    <span><h2>People directory</h2><p>Company roles and Project access are managed separately.</p></span>
                  </div>
                  <span className="company-count-badge">
                    {visiblePeople.length} shown
                  </span>
                </div>
                <ul className="company-people-list">
                  <li className="company-people-list-head" aria-hidden="true"><span /><span>Person</span><span>Role</span><span>Status</span><span>Last active</span><span /></li>
                  {visiblePeople.map(({ membership, user }) => {
                    const name =
                      user?.displayName ?? membership.userDisplayNameSnapshot;
                    const memberActions = resolveCompanyMemberActionCapabilities({
                      actorRole: administration.membership.role,
                      isCurrentUser: membership.userId === currentUser?._id,
                      targetRole: membership.role,
                      targetStatus: membership.status,
                    });
                    return (
                      <li key={membership._id}>
                        <span className="company-person-avatar">
                          {getInitials(name)}
                        </span>
                        <span className="company-person-copy">
                          <strong>{name}</strong>
                          <small>{user?.email ?? "Account details unavailable"}</small>
                        </span>
                        <span className="company-role-cell"><ShieldCheck aria-hidden="true" size={13} /> {membership.role}</span>
                        <span
                          className={`company-member-status ${membership.status}`}
                        >
                          <i aria-hidden="true" />
                          {membership.status}
                        </span>
                        <time dateTime={new Date(membership.updatedAt).toISOString()}>{formatRelativeTime(membership.updatedAt)}</time>
                        {memberActions.showMenu ? (
                          <details
                            aria-busy={busy}
                            className="company-member-actions"
                            onClick={(event) => {
                              if ((event.target as HTMLElement).closest("button")) {
                                event.currentTarget.removeAttribute("open");
                              }
                            }}
                          >
                            <summary aria-label={`Manage ${name}`}>
                              <MoreHorizontal aria-hidden="true" size={16} />
                            </summary>
                            <div aria-label={`Actions for ${name}`} role="group">
                              {memberActions.canChangeRole &&
                              membership.status === "active" &&
                              membership.role !== "admin" ? (
                                <Button
                                  onClick={() =>
                                    void run(() =>
                                      updateMember({
                                        companyId: actingCompanyId,
                                        companyMemberId: membership._id,
                                        role: "admin",
                                      }),
                                    )
                                  }
                                  variant="outline"
                                >
                                  Make admin
                                </Button>
                              ) : null}
                              {memberActions.canChangeRole &&
                              membership.status === "active" &&
                              membership.role !== "member" ? (
                                <Button
                                  onClick={() =>
                                    void run(() =>
                                      updateMember({
                                        companyId: actingCompanyId,
                                        companyMemberId: membership._id,
                                        role: "member",
                                      }),
                                    )
                                  }
                                  variant="outline"
                                >
                                  Make member
                                </Button>
                              ) : null}
                              {memberActions.canPromoteToOwner ? (
                                <Button
                                  onClick={() =>
                                    void run(() =>
                                      updateMember({
                                        companyId: actingCompanyId,
                                        companyMemberId: membership._id,
                                        role: "owner",
                                      }),
                                    )
                                  }
                                  variant="outline"
                                >
                                  Promote to owner
                                </Button>
                              ) : null}
                              {memberActions.canChangeStatus ? <Button
                                onClick={() =>
                                  void run(() =>
                                    updateMember({
                                      companyId: actingCompanyId,
                                      companyMemberId: membership._id,
                                      status:
                                        membership.status === "active"
                                          ? "suspended"
                                          : "active",
                                    }),
                                  )
                                }
                                variant="outline"
                              >
                                {membership.status === "active"
                                  ? "Suspend"
                                  : "Reactivate"}
                              </Button> : null}
                              {memberActions.canChangeStatus ? <Button
                                onClick={() =>
                                  void run(() =>
                                    updateMember({
                                      companyId: actingCompanyId,
                                      companyMemberId: membership._id,
                                      status: "removed",
                                    }),
                                  )
                                }
                                variant="destructive"
                              >
                                Remove
                              </Button> : null}
                            </div>
                          </details>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
                {visiblePeople.length === 0 ? <div className="company-quiet-empty"><UsersRound aria-hidden="true" size={18} /><div><strong>No matching people</strong><span>Change the filter or search term.</span></div></div> : null}
              </section> : null}
              {(peopleFilter === "all" || peopleFilter === "invited") && administration.invitations.length > 0 ? (
                <section className="company-workspace-section company-inbox">
                  <div className="company-section-heading"><div><span className="company-overview-section-icon"><Mail aria-hidden="true" size={20} /></span><span><h2>Pending invitations</h2><p>Invitations remain inactive until the recipient accepts.</p></span></div><span className="company-count-badge">{administration.invitations.length}</span></div>
                  <ul className="company-request-list">
                    {administration.invitations.map((invitation) => <li key={invitation._id}><div><strong>{invitation.normalizedEmail}</strong><span>Invited as {invitation.role} · expires {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(invitation.expiresAt)}</span></div><div className="company-row-actions"><span className="company-state-pill proposed">Pending</span>{isCompanyAdmin ? <Button disabled={busy} onClick={() => void run(() => revokeInvitation({ companyId: actingCompanyId, invitationId: invitation._id }))} type="button" variant="outline">Revoke</Button> : null}</div></li>)}
                  </ul>
                </section>
              ) : peopleFilter === "invited" ? <section className="company-workspace-section"><div className="company-quiet-empty"><Mail aria-hidden="true" size={18} /><div><strong>No pending invitations</strong><span>Everyone invited to this Company has responded.</span></div></div></section> : null}
              {isCompanyAdmin ? (
                <details className="company-management-disclosure" id="invite-company-member" open>
                  <summary>
                    <span>
                      <Plus aria-hidden="true" size={15} />
                      Invite a Company member
                    </span>
                    <small>Add a person by their exact email address</small>
                  </summary>
                  <div className="company-management-body">
                    <InviteMemberForm
                      actingCompanyId={actingCompanyId}
                      run={run}
                    />
                  </div>
                </details>
              ) : null}
            </div>
          ) : null}

          {visibleView === "relationships" &&
          actingCompanyId &&
          isCompanyAdmin ? (
            <div className="company-view-stack company-directory-view">
              <section className="company-collaboration-summary" aria-label="Relationship summary">
                <div><i><Handshake aria-hidden="true" size={20} /></i><span>Relationships</span><strong>{relationships?.length ?? 0}</strong><small>Total connections</small></div>
                <div><i><ShieldCheck aria-hidden="true" size={20} /></i><span>Active</span><strong>{activeRelationships.length}</strong><small>Currently collaborating</small></div>
                <div><i><FolderKanban aria-hidden="true" size={20} /></i><span>Shared projects</span><strong>{(projects ?? []).filter((item) => item.project.origin === "shared").length}</strong><small>Across relationships</small></div>
                <div><i><Clock3 aria-hidden="true" size={20} /></i><span>Invitations</span><strong>{relationshipInvitations?.length ?? 0}</strong><small>Pending invitations</small></div>
              </section>
              <nav aria-label="Filter relationships" className="company-filter-bar">
                <span><Filter aria-hidden="true" size={14} /> View</span>
                {([
                  ["all", "All", relationships?.length ?? 0],
                  ["active", "Active", activeRelationships.length],
                  ["forming", "Forming", (relationships ?? []).filter(({ relationship }) => relationship.status === "forming").length],
                  ["inactive", "Inactive", (relationships ?? []).filter(({ relationship }) => relationship.status === "inactive").length],
                ] as const).map(([value, label, count]) => (
                  <button aria-pressed={relationshipFilter === value} className={relationshipFilter === value ? "active" : undefined} key={value} onClick={() => setRelationshipFilter(value)} type="button">{label}<small>{count}</small></button>
                ))}
              </nav>
              {(relationshipInvitations ?? []).length > 0 ? (
                <section className="company-workspace-section company-inbox">
                  <div className="company-section-heading">
                    <div>
                      <span className="company-section-kicker">Inbox</span>
                      <h2>Relationship invitations</h2>
                    </div>
                    <span className="company-count-badge">
                      {relationshipInvitations?.length}
                    </span>
                  </div>
                  <ul className="company-request-list">
                    {relationshipInvitations?.map(
                      ({ invitation, invitingCompany, relationship }) => (
                        <li key={invitation._id}>
                          <div>
                            <strong>{relationship?.name}</strong>
                            <span>
                              {invitingCompany?.displayName} invited this exact
                              Company.
                            </span>
                          </div>
                          <div className="company-row-actions">
                            <Button
                              onClick={() =>
                                void run(() =>
                                  decideRelationshipInvitation({
                                    actingCompanyId,
                                    invitationId: invitation._id,
                                    decision: "accept",
                                  }),
                                )
                              }
                            >
                              Accept
                            </Button>
                            <Button
                              onClick={() =>
                                void run(() =>
                                  decideRelationshipInvitation({
                                    actingCompanyId,
                                    invitationId: invitation._id,
                                    decision: "decline",
                                  }),
                                )
                              }
                              variant="outline"
                            >
                              Decline
                            </Button>
                          </div>
                        </li>
                      ),
                    )}
                  </ul>
                </section>
              ) : null}

              <section className="company-workspace-section company-directory-panel">
                <div className="company-section-heading">
                  <div>
                    <span className="company-overview-section-icon"><Handshake aria-hidden="true" size={21} /></span>
                    <span><h2>Partner directory</h2><p>Relationships connect companies. Projects and Channels still need separate access grants.</p></span>
                  </div>
                  <span className="company-count-badge">
                    {visibleRelationships.length} shown
                  </span>
                </div>
                <div className="company-relationship-grid">
                  {visibleRelationships.map((item) => {
                    const partnerCompanies = item.participants.filter((company) => company._id !== actingCompanyId);
                    const sharedProjectCount = (projects ?? []).filter((projectItem) => projectItem.project.relationshipId === item.relationship._id).length;
                    return (
                    <article
                      className="company-relationship-card"
                      key={item.relationship._id}
                    >
                      <header>
                        <span className="company-relationship-icon">
                          <Handshake aria-hidden="true" size={17} />
                        </span>
                        <span>
                          <strong>{item.relationship.name}</strong>
                          <small>{partnerCompanies.map((company) => company.displayName).join(", ") || "No partner Company"}</small>
                        </span>
                        <span className={`company-state-pill ${item.relationship.status}`}>{item.relationship.status}</span>
                      </header>
                      <div className="company-boundary-trace" aria-label="Collaboration boundary">
                        <span><Building2 aria-hidden="true" size={14} /> {item.participants.length} Companies</span>
                        <i aria-hidden="true" />
                        <span><FolderKanban aria-hidden="true" size={14} /> {sharedProjectCount} shared Projects</span>
                        <i aria-hidden="true" />
                        <span><ShieldCheck aria-hidden="true" size={14} /> Explicit Channel access</span>
                      </div>
                      {item.relationship.status === "active" ? (
                        <Button onClick={() => selectView("projects")} type="button">
                          Create shared Project
                        </Button>
                      ) : null}
                      <details className="company-card-management">
                        <summary>Manage relationship</summary>
                        <div>
                          <RelationshipParticipantForm
                            actingCompanyId={actingCompanyId}
                            relationshipId={item.relationship._id}
                            run={run}
                          />
                          <div className="company-row-actions wrap">
                            {item.participants
                              .filter(
                                (company) => company._id !== actingCompanyId,
                              )
                              .map((company) => (
                                <Button
                                  key={company._id}
                                  onClick={() =>
                                    void run(async () => {
                                      const requestId =
                                        await proposeRelationshipRemoval({
                                          actingCompanyId,
                                          relationshipId:
                                            item.relationship._id,
                                          targetCompanyId: company._id,
                                          idempotencyKey: crypto.randomUUID(),
                                        });
                                      await approveRelationshipRemoval({
                                        actingCompanyId,
                                        requestId,
                                      });
                                    })
                                  }
                                  variant="outline"
                                >
                                  Request removal of {company.displayName}
                                </Button>
                              ))}
                            {item.pendingRemovalRequests
                              .filter(
                                (request) =>
                                  request.targetCompanyId !== actingCompanyId,
                              )
                              .map((request) => (
                                <Button
                                  key={request._id}
                                  onClick={() =>
                                    void run(() =>
                                      approveRelationshipRemoval({
                                        actingCompanyId,
                                        requestId: request._id,
                                      }),
                                    )
                                  }
                                  variant="outline"
                                >
                                  Approve pending removal
                                </Button>
                              ))}
                            <Button
                              onClick={() =>
                                void run(() =>
                                  leaveRelationship({
                                    actingCompanyId,
                                    relationshipId: item.relationship._id,
                                  }),
                                )
                              }
                              variant="destructive"
                            >
                              Leave Relationship
                            </Button>
                          </div>
                        </div>
                      </details>
                    </article>
                  );})}
                </div>
                {visibleRelationships.length === 0 ? (
                  <div className="company-quiet-empty">
                    <Handshake aria-hidden="true" size={18} />
                    <div>
                      <strong>No relationships yet</strong>
                      <span>
                        Connect with another exact Company before sharing a
                        Project.
                      </span>
                    </div>
                  </div>
                ) : null}
              </section>

              <details className="company-management-disclosure" id="create-company-relationship" open>
                <summary>
                  <span>
                    <Plus aria-hidden="true" size={15} />
                    Create a relationship
                  </span>
                  <small>Connect through an exact private Company handle</small>
                </summary>
                <div className="company-management-body">
                  <RelationshipForm
                    actingCompanyId={actingCompanyId}
                    run={run}
                  />
                </div>
              </details>
            </div>
          ) : null}

          {visibleView === "settings" &&
          actingCompanyId &&
          currentUser &&
          administration &&
          isCompanyAdmin ? (
            <div className="company-view-stack company-settings-view">
              <section className="company-workspace-section company-settings-profile">
                <div className="company-section-heading">
                  <div>
                    <span className="company-overview-section-icon"><Building2 aria-hidden="true" size={21} /></span>
                    <span>
                      <h2>{administration.company.displayName} <em className="company-current-badge">Current company</em></h2>
                      <p>@{administration.company.normalizedHandle}</p>
                    </span>
                  </div>
                  <p>This identity is visible to members across projects, Channels, and shared resources.</p>
                </div>
                <CompanyProfileForm
                  key={actingCompanyId}
                  actingCompanyId={actingCompanyId}
                  description={administration.company.description ?? ""}
                  displayName={administration.company.displayName}
                  handle={administration.company.normalizedHandle}
                  logoStorageId={administration.company.logoStorageId}
                  logoUrl={administration.company.logoUrl}
                  run={run}
                />
              </section>

              <details className="company-management-disclosure">
                <summary>
                  <span>
                    <Plus aria-hidden="true" size={15} />
                    Create another Company
                  </span>
                  <small>Use a separate identity for a separate legal team</small>
                </summary>
                <div className="company-management-body">
                  <CreateCompanyForm run={run} />
                </div>
              </details>

              <details className="company-management-disclosure">
                <summary>
                  <span>
                    <FolderKanban aria-hidden="true" size={15} />
                    Assign an existing Project
                  </span>
                  <small>Map every person and role before activation</small>
                </summary>
                <div className="company-management-body migration">
                  <MigrationPanel
                    actingCompanyId={actingCompanyId}
                    currentUserId={currentUser._id}
                    relationships={activeRelationships}
                    run={run}
                  />
                </div>
              </details>

              {administration.membership.role === "owner" ? (
                <section className="company-workspace-section company-danger-zone">
                  <div>
                    <span className="company-section-kicker">Danger zone</span>
                    <h2>Suspend or close Company</h2>
                    <p>
                      Suspension pauses access and can be reversed. Closing is a
                      retained-history operation and requires all Projects
                      to be exited first.
                    </p>
                  </div>
                  <div className="company-row-actions">
                    <Button
                      onClick={() =>
                        void run(() =>
                          setSuspended({
                            companyId: actingCompanyId,
                            suspended: true,
                          }),
                        )
                      }
                      variant="outline"
                    >
                      Suspend Company
                    </Button>
                    <Button onClick={() => setCloseCompanyOpen(true)}
                      variant="destructive"
                    >
                      Close Company
                    </Button>
                  </div>
                </section>
              ) : null}
              <ConfirmDialog
                confirmLabel="Close Company"
                description="Projects must be exited first. Retained history is preserved and the close action cannot be undone."
                onConfirm={() => run(() => closeCompany({ companyId: actingCompanyId, retentionConfirmed: true }))}
                onOpenChange={setCloseCompanyOpen}
                open={closeCompanyOpen}
                title="Close this Company?"
              />
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
