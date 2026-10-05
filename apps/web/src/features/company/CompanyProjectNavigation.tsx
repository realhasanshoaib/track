import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import {
  ChevronLeft,
  ChevronRight,
  FileSearch,
  LayoutDashboard,
  ListTodo,
  MessagesSquare,
  LogOut,
  Menu,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { api } from "../../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../../convex/_generated/dataModel";
import { EntityMark } from "#/features/workspace/entity-mark";
import { resolveActiveActingCompanyId } from "./company-query-scope";
import {
  getCompanyProjectConversationSearch,
  getCompanyProjectEvidenceSearch,
  getCompanyProjectOverviewSearch,
  getCompanyProjectTaskSearch,
  type CompanyProjectLinkContext,
} from "./company-project-links";

import "./company-project-navigation.css";
import "./company-surfaces.css";
import { authClient } from "#/lib/auth-client";
import { NativeSelect, NativeSelectOption } from "#/components/ui/native-select";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "#/components/ui/sheet";
import ThemeToggle from "#/components/ThemeToggle";
import {
  SIDEBAR_COLLAPSE_THRESHOLD,
  SIDEBAR_COLLAPSED_WIDTH,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  clampSidebarWidth,
  getStoredSidebarWidth,
} from "#/features/workspace/sidebar-sizing";

export type CompanyProjectNavigationArea =
  | "company"
  | "overview"
  | "conversation"
  | "evidence"
  | "tasks";

export type CompanyProjectNavigationIdentity = {
  groupId?: string;
  projectId: Id<"projects">;
  projectMemberId: Id<"projectMembers">;
};

export type CompanyProjectNavigationProps = {
  actingCompanyId: Id<"companies"> | null;
  activeArea: CompanyProjectNavigationArea;
  activeProject?: CompanyProjectNavigationIdentity;
  companyNavigation?: ReactNode;
  onCompanyChange?: (companyId: Id<"companies">) => void;
  secondaryNavigation?: ReactNode;
  tasksEnabled?: boolean;
};

const collapseStorageKey = "track-company-project-nav-collapsed";
const widthStorageKey = "track-company-project-nav-width";

function ProjectLink({
  actingCompanyId,
  active,
  item,
}: {
  actingCompanyId: Id<"companies">;
  active: boolean;
  item: {
    membership: {
      _id: Id<"projectMembers">;
    };
    project: Pick<Doc<"projects">, "_id" | "name" | "status" | "markColorKey" | "markIconKey">;
  };
}) {
  return (
    <Link
      aria-label={`Open ${item.project.name} Project`}
      aria-current={active ? "page" : undefined}
      className={
        active
          ? "company-project-nav-project active"
          : "company-project-nav-project"
      }
      params={{ projectId: item.project._id }}
      search={getCompanyProjectOverviewSearch({
        actingCompanyId,
        projectId: item.project._id,
        projectMemberId: item.membership._id,
      })}
      title={item.project.name}
      to="/workspace/company-projects/$projectId"
    >
      <EntityMark colorKey={item.project.markColorKey} iconKey={item.project.markIconKey} id={String(item.project._id)} kind="project" name={item.project.name} size={28} />
      <span className="company-project-nav-copy">
        <strong>{item.project.name}</strong>
        <small>
          {item.project.status === "archived" ? "Archived Project" : "Project"}
        </small>
      </span>
    </Link>
  );
}

export function CompanyProjectNavigation({
  actingCompanyId,
  activeArea,
  activeProject,
  companyNavigation,
  onCompanyChange,
  secondaryNavigation,
  tasksEnabled = true,
}: CompanyProjectNavigationProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [width, setWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileCompanyNavigation, setMobileCompanyNavigation] = useState(false);
  const navigationRef = useRef<HTMLElement>(null);
  const session = authClient.useSession();
  const companies = useQuery(api.companies.listMine, {});
  const actingCompany = companies?.find(
    (item) => item.company?._id === actingCompanyId,
  );
  const activeActingCompanyId = resolveActiveActingCompanyId(
    companies,
    actingCompanyId,
  );
  const projects = useQuery(
    api.sharedProjects.listForActingCompany,
    activeActingCompanyId
      ? { actingCompanyId: activeActingCompanyId }
      : "skip",
  );
  const activeProjectItem = projects?.find(
    (item) =>
      item.project._id === activeProject?.projectId &&
      item.membership._id === activeProject?.projectMemberId,
  );
  const companyProjects =
    projects?.filter((item) => item.participationRole === "owner") ?? [];
  const collaboratingProjects =
    projects?.filter((item) => item.participationRole === "collaborator") ?? [];
  const unassignedProjects =
    projects?.filter((item) => item.participationRole === "unassigned_legacy") ??
    [];
  const navClassName = [
    "company-project-nav",
    collapsed && !mobileCompanyNavigation ? "is-collapsed" : "",
    activeArea === "company" ? "is-company-workspace" : "",
    activeArea !== "company" && mobileMenuOpen ? "is-project-mobile-open" : "",
  ].filter(Boolean).join(" ");
  const activeLinkContext: CompanyProjectLinkContext | null =
    activeActingCompanyId && activeProjectItem
      ? {
          actingCompanyId: activeActingCompanyId,
          groupId: activeProject?.groupId,
          projectId: activeProjectItem.project._id,
          projectMemberId: activeProjectItem.membership._id,
        }
      : null;

  async function handleSignOut() {
    await authClient.signOut();
    window.location.href = "/sign-in";
  }

  useEffect(() => {
    setCollapsed(
      activeArea === "company"
        ? false
        : window.localStorage.getItem(collapseStorageKey) === "true",
    );
    setWidth(getStoredSidebarWidth(window.localStorage.getItem(widthStorageKey)));
    setPreferencesLoaded(true);
  }, [activeArea]);

  useEffect(() => {
    if (!preferencesLoaded) return;
    window.localStorage.setItem(collapseStorageKey, String(collapsed));
  }, [collapsed, preferencesLoaded]);

  useEffect(() => {
    if (!preferencesLoaded) return;
    window.localStorage.setItem(widthStorageKey, String(width));
  }, [preferencesLoaded, width]);

  useEffect(() => {
    if (activeArea === "company") setCollapsed(false);
  }, [activeArea]);

  useEffect(() => {
    const viewport = window.matchMedia("(max-width: 860px)");
    const update = () => {
      setMobileCompanyNavigation(viewport.matches);
      if (!viewport.matches) setMobileMenuOpen(false);
    };
    update();
    viewport.addEventListener("change", update);
    return () => viewport.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (activeArea === "company" || !mobileMenuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileMenuOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [activeArea, mobileMenuOpen]);

  const renderedWidth = collapsed ? SIDEBAR_COLLAPSED_WIDTH : width;

  useLayoutEffect(() => {
    const shell = navigationRef.current?.closest<HTMLElement>(".company-unified-shell");
    shell?.style.setProperty("--company-project-nav-width", `${renderedWidth}px`);
    return () => {
      shell?.style.removeProperty("--company-project-nav-width");
    };
  }, [renderedWidth]);

  useEffect(() => {
    if (!resizing) return;
    const navigation = navigationRef.current;
    const shell = navigation?.closest<HTMLElement>(".company-unified-shell");
    const shellLeft = shell?.getBoundingClientRect().left ?? 0;
    function applyRenderedWidth(nextWidth: number) {
      shell?.style.setProperty("--company-project-nav-width", `${nextWidth}px`);
    }
    function handlePointerMove(event: PointerEvent) {
      const localWidth = event.clientX - shellLeft;
      if (localWidth < SIDEBAR_COLLAPSE_THRESHOLD) {
        applyRenderedWidth(SIDEBAR_COLLAPSED_WIDTH);
        setCollapsed(true);
        return;
      }
      const nextWidth = clampSidebarWidth(localWidth);
      applyRenderedWidth(nextWidth);
      setCollapsed(false);
      setWidth(nextWidth);
    }
    function handlePointerUp() {
      setResizing(false);
    }
    document.body.classList.add("company-project-nav-resizing");
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
    return () => {
      document.body.classList.remove("company-project-nav-resizing");
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [resizing]);

  const companySwitcher = companies && companies.length > 1 && onCompanyChange ? (
    <label className="company-project-nav-switcher">
      <span>Representing</span>
      <NativeSelect
        aria-label="Representing Company"
        onChange={(event) => {
          const selectedCompany = companies.find((item) => item.company?._id === event.target.value)?.company;
          if (selectedCompany) {
            onCompanyChange(selectedCompany._id);
            setMobileMenuOpen(false);
          }
        }}
        searchable={companies.length >= 8}
        value={actingCompanyId ?? ""}
      >
        {companies.flatMap((item) => item.company ? [
          <NativeSelectOption key={item.company._id} value={item.company._id}>
            {item.company.displayName}
          </NativeSelectOption>,
        ] : [])}
      </NativeSelect>
    </label>
  ) : null;
  const companyLinks = companyNavigation ? (
    <div className="company-project-nav-custom" onClickCapture={(event) => {
      if (event.target instanceof Element && event.target.closest('a[href]')) setMobileMenuOpen(false);
    }}>{companyNavigation}</div>
  ) : null;
  const companySheetEnabled = activeArea === "company" && mobileCompanyNavigation && Boolean(companyNavigation);
  const accountControls = (
    <footer className="company-project-nav-profile">
      <Link aria-label="Open profile settings" className="company-project-nav-profile-link" title="Profile settings" to="/profile">
        <span className="company-project-nav-profile-icon" aria-hidden="true"><UserRound size={14} /></span>
        <span className="company-project-nav-copy">
          <strong>{session.data?.user.name ?? "Your profile"}</strong>
          <small>{session.data?.user.email ?? "Account settings"}</small>
        </span>
      </Link>
      <ThemeToggle showLabel={companySheetEnabled || mobileCompanyNavigation || !collapsed} />
      <button aria-label="Log out" className="company-project-nav-profile-logout" onClick={() => void handleSignOut()} title="Log out" type="button">
        <LogOut aria-hidden="true" size={14} />
        <span>Log out</span>
      </button>
    </footer>
  );

  return (
    <>
    <aside
      aria-label="Company and Project navigation"
      className={navClassName}
      onClickCapture={(event) => {
        if (activeArea !== "company" && mobileCompanyNavigation && event.target instanceof Element && event.target.closest('a[href]')) setMobileMenuOpen(false);
      }}
      ref={navigationRef}
    >
      <div
        aria-label="Resize Company and Project navigation"
        aria-orientation="vertical"
        aria-valuemax={SIDEBAR_MAX_WIDTH}
        aria-valuemin={SIDEBAR_COLLAPSED_WIDTH}
        aria-valuenow={collapsed ? SIDEBAR_COLLAPSED_WIDTH : width}
        aria-valuetext={collapsed ? "Collapsed" : `${width} pixels`}
        className="company-project-nav-resize-handle"
        onDoubleClick={() => setCollapsed((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            if (collapsed || width <= SIDEBAR_MIN_WIDTH) setCollapsed(true);
            else setWidth((value) => clampSidebarWidth(value - 16));
          }
          if (event.key === "ArrowRight") {
            event.preventDefault();
            if (collapsed) setCollapsed(false);
            else setWidth((value) => clampSidebarWidth(value + 16));
          }
        }}
        onPointerDown={(event) => {
          event.preventDefault();
          setResizing(true);
        }}
        role="separator"
        tabIndex={0}
        data-tooltip="Drag to resize"
      >
        <span className="company-project-nav-resize-grip">
          <ChevronLeft aria-hidden="true" size={10} strokeWidth={2} />
          <span aria-hidden="true" className="company-project-nav-resize-rule" />
          <ChevronRight aria-hidden="true" size={10} strokeWidth={2} />
        </span>
      </div>
      <header className="company-project-nav-header">
        <button
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
          className="company-project-nav-collapse"
          onClick={() => setCollapsed((value) => !value)}
          title={collapsed ? "Expand navigation" : "Collapse navigation"}
          type="button"
        >
          {collapsed ? (
            <ChevronRight aria-hidden="true" size={14} />
          ) : (
            <ChevronLeft aria-hidden="true" size={14} />
          )}
        </button>
        <Link
          aria-label="Company workspace"
          className="company-project-nav-brand"
          search={{ view: "overview", taskFilter: undefined }}
          to="/workspace/company"
        >
          <img alt="" height={22} src="/track-mark.svg" width={28} />
          <span>Track</span>
        </Link>
        {activeArea === "company" && companyNavigation ? (
          <button
            aria-controls="company-mobile-navigation"
            aria-expanded={mobileMenuOpen}
            aria-label={mobileMenuOpen ? "Close Company navigation" : "Open Company navigation"}
            className="company-project-nav-mobile-toggle"
            onClick={() => setMobileMenuOpen((open) => !open)}
            type="button"
          >
            {mobileMenuOpen ? <X aria-hidden="true" size={20} /> : <Menu aria-hidden="true" size={20} />}
          </button>
        ) : null}
        {activeArea !== "company" ? (
          <button
            aria-expanded={mobileMenuOpen}
            aria-label={mobileMenuOpen ? "Close Project navigation" : "Open Project navigation"}
            className="company-project-nav-mobile-toggle"
            onClick={() => setMobileMenuOpen((open) => !open)}
            type="button"
          >
            {mobileMenuOpen ? <X aria-hidden="true" size={20} /> : <Menu aria-hidden="true" size={20} />}
          </button>
        ) : null}
      </header>

      <Link
        aria-label={
          actingCompany?.company
            ? `Open ${actingCompany.company.displayName} Company workspace`
            : "Open Company workspace"
        }
        aria-current={activeArea === "company" ? "page" : undefined}
        className={
          activeArea === "company"
            ? "company-project-nav-company active"
            : "company-project-nav-company"
        }
        search={{ view: "overview", taskFilter: undefined }}
        title={actingCompany?.company?.displayName ?? "Companies"}
        to="/workspace/company"
      >
        <EntityMark colorKey={undefined} iconKey="building" id={String(actingCompany?.company?._id ?? "company")}
          imageUrl={actingCompany?.company?.logoUrl} kind="company" name={actingCompany?.company?.displayName ?? "Company"} size={30} />
        <span className="company-project-nav-copy">
          <strong>{actingCompany?.company?.displayName ?? "Companies"}</strong>
          <small>
            {actingCompany?.company
              ? `@${actingCompany.company.normalizedHandle} · ${actingCompany.membership.role}`
              : "Choose or create a Company"}
          </small>
        </span>
      </Link>

      {!companySheetEnabled ? companySwitcher : null}

      {!companySheetEnabled ? companyLinks : null}

      {activeProject && !activeProjectItem && projects !== undefined ? (
        <p className="company-project-nav-warning">
          This Project is not available to the represented Company membership.
        </p>
      ) : null}

      {activeProjectItem && activeLinkContext ? (
        <>
          <section className="company-project-nav-active-project">
            <EntityMark colorKey={activeProjectItem.project.markColorKey} iconKey={activeProjectItem.project.markIconKey} id={String(activeProjectItem.project._id)} kind="project" name={activeProjectItem.project.name} size={32} />
            <span className="company-project-nav-copy">
              <strong>{activeProjectItem.project.name}</strong>
              <small>
                {activeProjectItem.participationRole === "unassigned_legacy"
                  ? "Company owner not assigned"
                  : activeProjectItem.participationRole === "collaborator"
                    ? `Collaborating · owned by ${activeProjectItem.owningCompany?.displayName ?? "unavailable Company"}`
                    : `Owned by ${activeProjectItem.owningCompany?.displayName ?? "unavailable Company"}`}
              </small>
            </span>
          </section>
          <nav aria-label="Project workspace" className="company-project-nav-areas">
            <Link
              aria-label={`Open ${activeProjectItem.project.name} overview`}
              aria-current={activeArea === "overview" ? "page" : undefined}
              className={activeArea === "overview" ? "active" : undefined}
              params={{ projectId: activeProjectItem.project._id }}
              search={getCompanyProjectOverviewSearch(activeLinkContext)}
              title="Project overview"
              to="/workspace/company-projects/$projectId"
            >
              <LayoutDashboard aria-hidden="true" size={14} />
              <span>Overview</span>
            </Link>
            <Link
              aria-label={`Open ${activeProjectItem.project.name} conversation`}
              aria-current={activeArea === "conversation" ? "page" : undefined}
              className={activeArea === "conversation" ? "active" : undefined}
              params={{ projectId: activeProjectItem.project._id }}
              search={getCompanyProjectConversationSearch(activeLinkContext)}
              title="Conversation"
              to="/workspace/company-projects/$projectId"
            >
              <MessagesSquare aria-hidden="true" size={14} />
              <span>Conversation</span>
            </Link>
            <Link
              aria-label={`Open ${activeProjectItem.project.name} evidence and memory`}
              aria-current={activeArea === "evidence" ? "page" : undefined}
              className={activeArea === "evidence" ? "active" : undefined}
              params={{ projectId: activeProjectItem.project._id }}
              search={getCompanyProjectEvidenceSearch(activeLinkContext)}
              title="Evidence and memory"
              to="/workspace/company-projects/$projectId"
            >
              <FileSearch aria-hidden="true" size={14} />
              <span>Evidence</span>
            </Link>
            {tasksEnabled ? (
              <Link
                aria-label={`Open ${activeProjectItem.project.name} tasks`}
                aria-current={activeArea === "tasks" ? "page" : undefined}
                className={activeArea === "tasks" ? "active" : undefined}
                params={{ projectId: activeProjectItem.project._id }}
                search={getCompanyProjectTaskSearch(activeLinkContext)}
                title="Tasks"
                to="/workspace/projects/$projectId/tasks"
              >
                <ListTodo aria-hidden="true" size={14} />
                <span>Tasks</span>
              </Link>
            ) : null}
          </nav>
        </>
      ) : null}

      {secondaryNavigation ? (
        <div className="company-project-nav-secondary">
          {secondaryNavigation}
        </div>
      ) : null}

      {activeArea !== "company" &&
      actingCompanyId &&
      projects &&
      projects.length > 0 ? (
        <div className="company-project-nav-projects">
          <details>
            <summary aria-label="Switch project" className="company-project-nav-projects-summary">
              <span className="company-project-nav-projects-summary-copy">
                <strong>Switch project</strong>
                <small>{projects.length} available</small>
              </span>
              <ChevronRight aria-hidden="true" size={13} />
            </summary>
          {companyProjects.length > 0 ? (
            <nav aria-label="Company Projects">
              <span className="company-project-nav-group-label">Company Projects</span>
              {companyProjects.filter((item) => item.membership._id !== activeProject?.projectMemberId).map((item) => (
                <ProjectLink
                  actingCompanyId={actingCompanyId}
                  active={item.membership._id === activeProject?.projectMemberId}
                  item={item}
                  key={item.membership._id}
                />
              ))}
            </nav>
          ) : null}
          {collaboratingProjects.length > 0 ? (
            <nav aria-label="Collaborating Projects">
              <span className="company-project-nav-group-label">Collaborating</span>
              {collaboratingProjects.filter((item) => item.membership._id !== activeProject?.projectMemberId).map((item) => (
                <ProjectLink
                  actingCompanyId={actingCompanyId}
                  active={item.membership._id === activeProject?.projectMemberId}
                  item={item}
                  key={item.membership._id}
                />
              ))}
            </nav>
          ) : null}
          {unassignedProjects.length > 0 ? (
            <nav aria-label="Projects awaiting ownership confirmation">
              <span className="company-project-nav-group-label">Ownership to confirm</span>
              {unassignedProjects.filter((item) => item.membership._id !== activeProject?.projectMemberId).map((item) => (
                <ProjectLink
                  actingCompanyId={actingCompanyId}
                  active={item.membership._id === activeProject?.projectMemberId}
                  item={item}
                  key={item.membership._id}
                />
              ))}
            </nav>
          ) : null}
          </details>
        </div>
      ) : null}

      {!companySheetEnabled ? accountControls : null}
    </aside>
    {companySheetEnabled ? (
      <Sheet onOpenChange={setMobileMenuOpen} open={mobileMenuOpen}>
        <SheetContent className="company-mobile-navigation-sheet" id="company-mobile-navigation" side="left">
          <SheetHeader>
            <SheetTitle>Company workspace</SheetTitle>
            <SheetDescription>{actingCompany?.company?.displayName ?? "Choose a Company"}</SheetDescription>
          </SheetHeader>
          <SheetBody>
            {companySwitcher}
            {companyLinks}
          </SheetBody>
          {accountControls}
        </SheetContent>
      </Sheet>
    ) : null}
    </>
  );
}
