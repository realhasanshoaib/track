import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Building2, ChevronLeft, ChevronRight, FolderKanban, MessagesSquare } from "lucide-react"
import { useEffect, useState, type ReactNode } from "react";

import { api } from "../../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../../convex/_generated/dataModel";
import { resolveActiveActingCompanyId } from "./company-query-scope";
import {
  getCompanyProjectConversationSearch,
  type CompanyProjectLinkContext,
} from "./company-project-links";

import "./company-project-navigation.css";
import "./company-surfaces.css";

export type CompanyProjectNavigationArea =
  | "company"
  | "conversation";

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
};

const collapseStorageKey = "track-company-project-nav-collapsed";

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
    project: Pick<Doc<"projects">, "_id" | "name" | "status">;
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
      search={getCompanyProjectConversationSearch({
        actingCompanyId,
        projectId: item.project._id,
        projectMemberId: item.membership._id,
      })}
      title={item.project.name}
      to="/workspace/company-projects/$projectId"
    >
      <span className="company-project-nav-project-glyph" aria-hidden="true">
        {item.project.name.slice(0, 1).toUpperCase()}
      </span>
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
}: CompanyProjectNavigationProps) {
  const [collapsed, setCollapsed] = useState(() =>
    typeof window === "undefined"
      ? false
      : window.localStorage.getItem(collapseStorageKey) === "true",
  );
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
  const navClassName = collapsed
    ? "company-project-nav is-collapsed"
    : "company-project-nav";
  const activeLinkContext: CompanyProjectLinkContext | null =
    activeActingCompanyId && activeProjectItem
      ? {
          actingCompanyId: activeActingCompanyId,
          groupId: activeProject?.groupId,
          projectId: activeProjectItem.project._id,
          projectMemberId: activeProjectItem.membership._id,
        }
      : null;

  useEffect(() => {
    window.localStorage.setItem(collapseStorageKey, String(collapsed));
  }, [collapsed]);

  return (
    <aside aria-label="Company and Project navigation" className={navClassName}>
      <header className="company-project-nav-header">
        <Link
          aria-label="Company workspace"
          className="company-project-nav-brand"
          to="/workspace/company"
        >
          <img alt="" height={22} src="/track-mark.svg" width={28} />
          <span>Track</span>
        </Link>
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
        title={actingCompany?.company?.displayName ?? "Companies"}
        to="/workspace/company"
      >
        <span className="company-project-nav-company-icon">
          <Building2 aria-hidden="true" size={15} />
        </span>
        <span className="company-project-nav-copy">
          <strong>{actingCompany?.company?.displayName ?? "Companies"}</strong>
          <small>
            {actingCompany?.company
              ? `@${actingCompany.company.normalizedHandle} · ${actingCompany.membership.role}`
              : "Choose or create a Company"}
          </small>
        </span>
      </Link>

      {companies && companies.length > 1 && onCompanyChange ? (
        <label className="company-project-nav-switcher">
          <span>Representing</span>
          <select
            onChange={(event) => {
              const selectedCompany = companies.find(
                (item) => item.company?._id === event.target.value,
              )?.company;
              if (selectedCompany) onCompanyChange(selectedCompany._id);
            }}
            value={actingCompanyId ?? ""}
          >
            {companies.flatMap((item) =>
              item.company
                ? [
                    <option key={item.company._id} value={item.company._id}>
                      {item.company.displayName}
                    </option>,
                  ]
                : [],
            )}
          </select>
        </label>
      ) : null}

      {companyNavigation ? (
        <div className="company-project-nav-custom">{companyNavigation}</div>
      ) : null}

      {activeProject && !activeProjectItem && projects !== undefined ? (
        <p className="company-project-nav-warning">
          This Project is not available to the represented Company membership.
        </p>
      ) : null}

      {activeProjectItem && activeLinkContext ? (
        <>
          <section className="company-project-nav-active-project">
            <span className="company-project-nav-project-icon">
              <FolderKanban aria-hidden="true" size={15} />
            </span>
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

          </nav>
        </>
      ) : null}

      {secondaryNavigation ? (
        <div className="company-project-nav-secondary">
          {secondaryNavigation}
        </div>
      ) : null}

      {actingCompanyId && projects && projects.length > 0 ? (
        <div className="company-project-nav-projects">
          <span className="company-project-nav-label">Switch Project</span>
          {companyProjects.length > 0 ? (
            <nav aria-label="Company Projects">
              <span className="company-project-nav-group-label">Company Projects</span>
              {companyProjects.map((item) => (
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
              {collaboratingProjects.map((item) => (
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
              {unassignedProjects.map((item) => (
                <ProjectLink
                  actingCompanyId={actingCompanyId}
                  active={item.membership._id === activeProject?.projectMemberId}
                  item={item}
                  key={item.membership._id}
                />
              ))}
            </nav>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}
