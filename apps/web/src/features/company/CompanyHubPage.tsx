import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowUpRight,
  Building2,
  FolderKanban,
  Handshake,
  LayoutGrid,
  MoreHorizontal,
  Plus,
  Settings2,
  UsersRound,
} from "lucide-react";
import { useMemo, useState } from "react";

import { api } from "../../../../../convex/_generated/api";
import TrackLoader from "#/components/TrackLoader";
import { Button } from "#/components/ui/button";
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
import { useActingCompany } from "./use-acting-company";
import { MigrationPanel } from "./MigrationPanel";
import { UnassignedProjects } from "./UnassignedProjects";
import { formatCompanyError } from "./company-errors";

type CompanyHubView =
  | "overview"
  | "projects"
  | "relationships"
  | "people"
  | "settings";

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function CompanyHubPage() {
  const releaseState = useReleaseConfigState();
  const flags = releaseState.config;
  const currentUser = useQuery(api.auth.getCurrentUser);
  const companies = useQuery(
    api.companies.listMine,
    flags.companyModel ? {} : "skip",
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
  const administration = useQuery(
    api.companies.getAdministration,
    activeActingCompanyId ? { companyId: activeActingCompanyId } : "skip",
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
  const setSuspended = useMutation(api.companies.setSuspended);
  const closeCompany = useMutation(api.companies.close);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeView, setActiveView] =
    useState<CompanyHubView>("overview");

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setNotice(null);
    try {
      await action();
      setNotice("Saved.");
    } catch (error) {
      setNotice(formatCompanyError(error));
    } finally {
      setBusy(false);
    }
  }

  if (releaseState.status === "loading")
    return <TrackLoader label="Loading Company workspace" />;

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
    return <TrackLoader label="Loading Company workspace" />;

  const isCompanyAdmin =
    administration?.membership.role === "owner" ||
    administration?.membership.role === "admin";
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
  const pendingInvitationCount =
    (companyInvitations?.length ?? 0) +
    (relationshipInvitations?.length ?? 0) +
    (projectInvitations?.length ?? 0);
  const viewCopy: Record<CompanyHubView, { title: string; description: string }> = {
    overview: {
      title: "Company overview",
      description: "Shared work, partners, and people in one place.",
    },
    projects: {
      title: "Projects",
      description: "Your Company’s own work and the Projects where it collaborates.",
    },
    relationships: {
      title: "Relationships",
      description: "Manage the Companies allowed to collaborate with you.",
    },
    people: {
      title: "People",
      description: "See who can represent this Company across shared work.",
    },
    settings: {
      title: "Company settings",
      description: "Profile, migration, and Company-level administration.",
    },
  };
  const currentViewCopy = viewCopy[visibleView];

  return (
    <main aria-busy={busy} className="company-hub-shell company-unified-shell">
      <CompanyProjectNavigation
        actingCompanyId={actingCompanyId}
        activeArea="company"
        onCompanyChange={setActingCompanyId}

        companyNavigation={
          <nav aria-label="Company workspace">
            <span className="company-project-nav-label">Company</span>
          <button
            aria-pressed={visibleView === "overview"}
            className={
              visibleView === "overview"
                ? "company-project-nav-item active"
                : "company-project-nav-item"
            }
            onClick={() => setActiveView("overview")}
            type="button"
          >
            <LayoutGrid aria-hidden="true" size={14} />
            Overview
          </button>
          {actingCompanyId && currentUser && administration ? (
            <button
              aria-pressed={visibleView === "projects"}
              className={
                visibleView === "projects"
                  ? "company-project-nav-item active"
                  : "company-project-nav-item"
              }
              onClick={() => setActiveView("projects")}
              type="button"
            >
              <FolderKanban aria-hidden="true" size={14} />
              Projects
            </button>
          ) : null}
          {actingCompanyId && isCompanyAdmin ? (
            <button
              aria-pressed={visibleView === "relationships"}
              className={
                visibleView === "relationships"
                  ? "company-project-nav-item active"
                  : "company-project-nav-item"
              }
              onClick={() => setActiveView("relationships")}
              type="button"
            >
              <Handshake aria-hidden="true" size={14} />
              Relationships
            </button>
          ) : null}
          {actingCompanyId && administration ? (
            <button
              aria-pressed={visibleView === "people"}
              className={
                visibleView === "people"
                  ? "company-project-nav-item active"
                  : "company-project-nav-item"
              }
              onClick={() => setActiveView("people")}
              type="button"
            >
              <UsersRound aria-hidden="true" size={14} />
              People
            </button>
          ) : null}
          {actingCompanyId && isCompanyAdmin ? (
            <button
              aria-pressed={visibleView === "settings"}
              className={
                visibleView === "settings"
                  ? "company-project-nav-item active"
                  : "company-project-nav-item"
              }
              onClick={() => setActiveView("settings")}
              type="button"
            >
              <Settings2 aria-hidden="true" size={14} />
              Settings
            </button>
          ) : null}
          </nav>
        }
      />

      <section className="company-hub">
        <header className="company-hub-header">
          <div>
            <span className="company-eyebrow">
              {actingCompany?.company?.displayName ?? "Company workspace"}
            </span>
            <h1>{currentViewCopy.title}</h1>
            <p>{currentViewCopy.description}</p>
          </div>
        </header>
        {notice ? (
          <p aria-live="polite" className="company-notice">
            {notice}
          </p>
        ) : null}

        <div className="company-hub-content">
          {currentUser &&
          (visibleView === "overview" || visibleView === "projects") ? (
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
          actingCompany?.company &&
          administration ? (
            <>
              <section className="company-overview-mast">
                <div className="company-overview-identity">
                  <span className="company-overview-mark">
                    <Building2 aria-hidden="true" size={20} />
                  </span>
                  <div>
                    <span className="company-status-label">
                      <i aria-hidden="true" /> Active Company
                    </span>
                    <h2>{actingCompany.company.displayName}</h2>
                    <p>
                      @{actingCompany.company.normalizedHandle} · You represent
                      this Company as {actingCompany.membership.role}.
                    </p>
                  </div>
                </div>
                <div className="company-overview-stats">
                  <button
                    onClick={() => setActiveView("projects")}
                    type="button"
                  >
                    <strong>{projects?.length ?? "–"}</strong>
                    <span>Projects</span>
                  </button>
                  {isCompanyAdmin ? (
                    <button
                      onClick={() => setActiveView("relationships")}
                      type="button"
                    >
                      <strong>{relationships?.length ?? "–"}</strong>
                      <span>Relationships</span>
                    </button>
                  ) : null}
                  <button
                    onClick={() => setActiveView("people")}
                    type="button"
                  >
                    <strong>{activeMembers.length}</strong>
                    <span>Active people</span>
                  </button>
                  {pendingInvitationCount > 0 ? (
                    <div>
                      <strong>{pendingInvitationCount}</strong>
                      <span>Pending invites</span>
                    </div>
                  ) : null}
                </div>
              </section>

              <div className="company-overview-grid">
                <section className="company-workspace-section company-overview-projects">
                  <div className="company-section-heading">
                    <div>
                      <span className="company-section-kicker">
                        Your work
                      </span>
                      <h2>Projects</h2>
                    </div>
                    <button
                      className="company-section-link"
                      onClick={() => setActiveView("projects")}
                      type="button"
                    >
                      View all
                      <ArrowUpRight aria-hidden="true" size={13} />
                    </button>
                  </div>
                  {(projects ?? []).length > 0 ? (
                    <div className="company-project-gallery">
                      {projects?.map((item, index) => (
                        <Link
                          className="company-project-card"
                          key={item.membership._id}
                          params={{ projectId: item.project._id }}
                          search={{
                            companyId: actingCompanyId,
                            groupId: "",
                            membershipId: item.membership._id,
                          }}
                          to="/workspace/company-projects/$projectId"
                        >
                          <span
                            className={`company-project-graphic tone-${(index % 3) + 1}`}
                          >
                            <FolderKanban aria-hidden="true" size={19} />
                          </span>
                          <span className="company-project-card-copy">
                            <strong>{item.project.name}</strong>
                            <span>
                              {item.participationRole === "owner"
                                ? `Owned by ${item.owningCompany?.displayName ?? "unavailable Company"}`
                                : item.participationRole === "collaborator"
                                  ? `Collaborating · owned by ${item.owningCompany?.displayName ?? "unavailable Company"}`
                                  : "Company owner needs confirmation"}
                            </span>
                          </span>
                          <ArrowUpRight
                            aria-hidden="true"
                            className="company-project-card-arrow"
                            size={15}
                          />
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div className="company-quiet-empty">
                      <FolderKanban aria-hidden="true" size={18} />
                      <div>
                        <strong>No Projects yet</strong>
                        <span>
                          Create this Company’s first Project to start working.
                        </span>
                        {isCompanyAdmin ? (
                          <Button onClick={() => setActiveView("projects")}>
                            Create first Project
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  )}
                </section>

                <div className="company-overview-side">
                  {isCompanyAdmin ? (
                    <section className="company-workspace-section">
                      <div className="company-section-heading">
                        <div>
                          <span className="company-section-kicker">
                            Collaboration
                          </span>
                          <h2>Relationships</h2>
                        </div>
                        <button
                          aria-label="Open Relationships"
                          className="company-icon-link"
                          onClick={() => setActiveView("relationships")}
                          type="button"
                        >
                          <ArrowUpRight aria-hidden="true" size={14} />
                        </button>
                      </div>
                      <ul className="company-preview-list">
                        {activeRelationships.slice(0, 3).map((item) => (
                          <li key={item.relationship._id}>
                            <span className="company-preview-icon">
                              <Handshake aria-hidden="true" size={14} />
                            </span>
                            <span>
                              <strong>{item.relationship.name}</strong>
                              <small>
                                {item.participants
                                  .filter(
                                    (company) => company._id !== actingCompanyId,
                                  )
                                  .map((company) => company.displayName)
                                  .join(", ") || "No partner added"}
                              </small>
                            </span>
                          </li>
                        ))}
                      </ul>
                      {activeRelationships.length === 0 ? (
                        <p className="company-section-empty">
                          No active relationships.
                        </p>
                      ) : null}
                    </section>
                  ) : null}

                  <section className="company-workspace-section">
                    <div className="company-section-heading">
                      <div>
                        <span className="company-section-kicker">Company</span>
                        <h2>People</h2>
                      </div>
                      <button
                        aria-label="Open People"
                        className="company-icon-link"
                        onClick={() => setActiveView("people")}
                        type="button"
                      >
                        <ArrowUpRight aria-hidden="true" size={14} />
                      </button>
                    </div>
                    <div className="company-avatar-stack" aria-label="Active Company members">
                      {activeMembers.slice(0, 7).map(({ membership, user }) => {
                        const name =
                          user?.displayName ?? membership.userDisplayNameSnapshot;
                        return (
                          <span key={membership._id} title={name}>
                            {getInitials(name)}
                          </span>
                        );
                      })}
                      {activeMembers.length > 7 ? (
                        <span>+{activeMembers.length - 7}</span>
                      ) : null}
                    </div>
                    <p className="company-people-summary">
                      {activeMembers.length} active people can represent{" "}
                      {actingCompany.company.displayName}. Project and Channel
                      access remains separate.
                    </p>
                  </section>
                </div>
              </div>
            </>
          ) : null}

          {visibleView === "projects" &&
          actingCompanyId &&
          currentUser &&
          administration ? (
            <div className="company-view-stack">
              {(projectInvitations ?? []).length > 0 ? (
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

              {isCompanyAdmin && companyProjects.length === 0 ? (
                <section className="company-workspace-section company-first-project">
                  <div className="company-section-heading">
                    <div>
                      <span className="company-section-kicker">Get started</span>
                      <h2>Create your first Company Project</h2>
                      <p>
                        Start inside {administration.company.displayName}. Add
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

              {!isCompanyAdmin && (projects ?? []).length === 0 ? (
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

              {[
                {
                  description: "Projects owned by this Company.",
                  items: companyProjects,
                  title: "Company Projects",
                },
                {
                  description: "Projects owned by another Company where your team participates.",
                  items: collaboratingProjects,
                  title: "Collaborating",
                },
                {
                  description: "Existing Projects that need explicit Company ownership confirmation.",
                  items: unassignedProjects,
                  title: "Ownership to confirm",
                },
              ].map((section) =>
                section.items.length > 0 ? (
                  <section className="company-workspace-section" key={section.title}>
                    <div className="company-section-heading">
                      <div>
                        <span className="company-section-kicker">Workspace</span>
                        <h2>{section.title}</h2>
                        <p>{section.description}</p>
                      </div>
                      <span className="company-count-badge">
                        {section.items.length}
                      </span>
                    </div>
                    <div className="company-project-gallery large">
                      {section.items.map((item, index) => (
                        <Link
                          className="company-project-card"
                          key={item.membership._id}
                          params={{ projectId: item.project._id }}
                          search={{
                            companyId: actingCompanyId,
                            groupId: "",
                            membershipId: item.membership._id,
                          }}
                          to="/workspace/company-projects/$projectId"
                        >
                          <span
                            className={`company-project-graphic tone-${(index % 3) + 1}`}
                          >
                            <FolderKanban aria-hidden="true" size={19} />
                          </span>
                          <span className="company-project-card-copy">
                            <strong>{item.project.name}</strong>
                            <span>
                              {item.participationRole === "unassigned_legacy"
                                ? "Company owner not yet assigned"
                                : `Owned by ${item.owningCompany?.displayName ?? "unavailable Company"}`}
                            </span>
                          </span>
                          <ArrowUpRight
                            aria-hidden="true"
                            className="company-project-card-arrow"
                            size={15}
                          />
                        </Link>
                      ))}
                    </div>
                  </section>
                ) : null,
              )}

              {isCompanyAdmin && companyProjects.length > 0 ? (
                <details className="company-management-disclosure">
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
            <div className="company-view-stack">
              <section className="company-workspace-section">
                <div className="company-section-heading">
                  <div>
                    <span className="company-section-kicker">Directory</span>
                    <h2>Company people</h2>
                    <p>
                      Company membership identifies representation. Project and
                      Channel membership still controls content access.
                    </p>
                  </div>
                  <span className="company-count-badge">
                    {activeMembers.length} active
                  </span>
                </div>
                <ul className="company-people-list">
                  {administration.members.map(({ membership, user }) => {
                    const name =
                      user?.displayName ?? membership.userDisplayNameSnapshot;
                    const canManageMember =
                      isCompanyAdmin && membership.userId !== currentUser?._id;
                    return (
                      <li key={membership._id}>
                        <span className="company-person-avatar">
                          {getInitials(name)}
                        </span>
                        <span className="company-person-copy">
                          <strong>{name}</strong>
                          <small>{membership.role}</small>
                        </span>
                        <span
                          className={`company-member-status ${membership.status}`}
                        >
                          <i aria-hidden="true" />
                          {membership.status}
                        </span>
                        {canManageMember ? (
                          <details className="company-member-actions">
                            <summary aria-label={`Manage ${name}`}>
                              <MoreHorizontal aria-hidden="true" size={16} />
                            </summary>
                            <div>
                              {membership.status === "active" &&
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
                              {membership.status === "active" &&
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
                              {administration.membership.role === "owner" &&
                              membership.status === "active" &&
                              membership.role !== "owner" ? (
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
                              <Button
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
                              </Button>
                              <Button
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
                              </Button>
                            </div>
                          </details>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </section>
              {isCompanyAdmin ? (
                <details className="company-management-disclosure">
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
            <div className="company-view-stack">
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

              <section className="company-workspace-section">
                <div className="company-section-heading">
                  <div>
                    <span className="company-section-kicker">Partners</span>
                    <h2>Company relationships</h2>
                    <p>
                      A relationship permits shared work. It does not grant
                      access to a Project or Channel by itself.
                    </p>
                  </div>
                  <span className="company-count-badge">
                    {activeRelationships.length} active
                  </span>
                </div>
                <div className="company-relationship-grid">
                  {relationships?.map((item) => (
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
                          <small>{item.relationship.status}</small>
                        </span>
                      </header>
                      <div className="company-participant-list">
                        {item.participants.map((company) => (
                          <span key={company._id}>{company.displayName}</span>
                        ))}
                      </div>
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
                  ))}
                </div>
                {(relationships ?? []).length === 0 ? (
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

              <details className="company-management-disclosure">
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
              <section className="company-workspace-section">
                <div className="company-section-heading">
                  <div>
                    <span className="company-section-kicker">Identity</span>
                    <h2>Company profile</h2>
                    <p>
                      The display name appears anywhere this Company represents
                      its people.
                    </p>
                  </div>
                </div>
                <CompanyProfileForm
                  key={actingCompanyId}
                  actingCompanyId={actingCompanyId}
                  displayName={administration.company.displayName}
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
                    <Button
                      onClick={() => {
                        if (
                          window.confirm(
                            "Close this Company after confirming retention? Projects must be exited first; retained history is not erased.",
                          )
                        ) {
                          void run(() =>
                            closeCompany({
                              companyId: actingCompanyId,
                              retentionConfirmed: true,
                            }),
                          );
                        }
                      }}
                      variant="destructive"
                    >
                      Close Company
                    </Button>
                  </div>
                </section>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
