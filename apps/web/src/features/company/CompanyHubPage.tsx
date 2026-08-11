import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Button } from "#/components/ui/button";
import { formatDate, useLocale } from "#/i18n";
import { useReleaseConfig } from "#/lib/release-config";
import {
  CreateCompanyForm,
  CompanyProfileForm,
  InviteMemberForm,
  RelationshipForm,
  RelationshipParticipantForm,
  SharedProjectForm,
} from "./CompanyForms";
import { useActingCompany } from "./use-acting-company";
import { MigrationPanel } from "./MigrationPanel";

export function CompanyHubPage() {
  const { t } = useTranslation("company");
  const { locale } = useLocale();
  const flags = useReleaseConfig();
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

  const roleLabel = (role: string) => {
    if (role === "owner") return t("roles.owner");
    if (role === "admin") return t("roles.admin");
    if (role === "manager") return t("roles.manager");
    if (role === "member") return t("roles.member");
    return role;
  };
  const statusLabel = (status: string) => {
    if (status === "active") return t("statuses.active");
    if (status === "suspended") return t("statuses.suspended");
    if (status === "removed") return t("statuses.removed");
    if (status === "archived") return t("statuses.archived");
    if (status === "closed") return t("statuses.closed");
    if (status === "pending") return t("statuses.pending");
    return status;
  };

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setNotice(null);
    try {
      await action();
      setNotice(t("status.saved"));
    } catch {
      setNotice(t("status.actionFailed"));
    } finally {
      setBusy(false);
    }
  }

  if (!flags.companyModel)
    return (
      <main className="company-hub">
        <h1>{t("hub.heading")}</h1>
        <p>{t("availability.disabled")}</p>
        <Link to="/workspace">{t("links.returnProjects")}</Link>
      </main>
    );

  return (
    <main aria-busy={busy} className="company-hub">
      <header className="company-hub-header">
        <div>
          <span className="company-eyebrow">{t("hub.eyebrow")}</span>
          <h1>{t("hub.heading")}</h1>
          <p>{t("hub.description")}</p>
        </div>
        <Link to="/workspace">{t("links.legacyProjects")}</Link>
      </header>
      {notice ? (
        <p aria-live="polite" className="company-notice">
          {notice}
        </p>
      ) : null}

      <section className="company-panel">
        <h2>{t("hub.actingCompany")}</h2>
        {companies === undefined ? (
          <p>{t("hub.loadingCompanies")}</p>
        ) : companies.length === 0 ? (
          <>
            <p>{t("hub.createFirst")}</p>
            <CreateCompanyForm run={run} />
          </>
        ) : (
          <>
            <label htmlFor="acting-company">{t("hub.representCompany")}</label>
            <select
              id="acting-company"
              onChange={(event) =>
                setActingCompanyId(event.target.value as Id<"companies">)
              }
              value={actingCompanyId ?? ""}
            >
              {companies.flatMap((item) =>
                item.company
                  ? [
                      <option dir="auto" key={item.company._id} value={item.company._id}>
                        {item.company.displayName} · @{item.company.normalizedHandle} · {roleLabel(item.membership.role)}
                      </option>,
                    ]
                  : [],
              )}
            </select>
            <CreateCompanyForm run={run} />
          </>
        )}
      </section>

      {(companyInvitations ?? []).length > 0 ? (
        <section className="company-panel">
          <h2>{t("invitations.heading")}</h2>
          <ul className="company-list">
            {companyInvitations?.map(({ company, invitation }) => (
              <li key={invitation._id}>
                <div>
                    <strong dir="auto">{company?.displayName}</strong>
                    <span dir="auto">
                      {roleLabel(invitation.role)} · {t("invitations.expires", {
                        date: formatDate(locale, new Date(invitation.expiresAt)),
                      })}
                  </span>
                </div>
                <div>
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
                    {t("actions.accept")}
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
                    {t("actions.decline")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {actingCompanyId && actingCompany?.company?.status === "suspended" ? (
        <section className="company-panel">
          <h2>{t("suspension.heading")}</h2>
          <p>{t("suspension.description")}</p>
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
              {t("suspension.reactivate")}
            </Button>
          ) : (
            <p>{t("suspension.askOwner")}</p>
          )}
        </section>
      ) : null}

      {actingCompanyId && administration ? (
        <section className="company-panel">
          <div className="company-panel-heading">
            <div>
              <h2>{t("members.heading")}</h2>
              <p>{t("members.description")}</p>
            </div>
            {administration.membership.role === "owner" ? (
              <div>
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
                  {t("members.suspendCompany")}
                </Button>
                <Button
                  onClick={() => {
                    if (
                      window.confirm(t("members.closeConfirm"))
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
                  {t("members.closeCompany")}
                </Button>
              </div>
            ) : null}
          </div>
          {administration.membership.role !== "member" ? (
            <CompanyProfileForm
              key={actingCompanyId}
              actingCompanyId={actingCompanyId}
              displayName={administration.company.displayName}
              run={run}
            />
          ) : null}
          <ul className="company-list">
            {administration.members.map(({ membership, user }) => (
              <li key={membership._id}>
                <div>
                    <strong dir="auto">
                      {user?.displayName ?? membership.userDisplayNameSnapshot}
                    </strong>
                    <span>
                    {roleLabel(membership.role)} · {statusLabel(membership.status)}
                  </span>
                </div>
                {administration.membership.role !== "member" &&
                membership.userId !== currentUser?._id ? (
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
                        {t("members.makeAdmin")}
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
                        {t("members.makeMember")}
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
                        {t("members.promoteOwner")}
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
                        ? t("actions.suspend")
                        : t("actions.reactivate")}
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
                      {t("actions.remove")}
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          {administration.membership.role !== "member" ? (
            <InviteMemberForm actingCompanyId={actingCompanyId} run={run} />
          ) : null}
        </section>
      ) : null}

      {actingCompanyId &&
      administration &&
      administration.membership.role !== "member" ? (
        <section className="company-panel">
          <h2>{t("relationships.heading")}</h2>
          <RelationshipForm actingCompanyId={actingCompanyId} run={run} />
          {(relationshipInvitations ?? []).length ? (
            <ul className="company-list">
              {relationshipInvitations?.map(
                ({ invitation, invitingCompany, relationship }) => (
                  <li key={invitation._id}>
                    <div>
                      <strong dir="auto">{relationship?.name}</strong>
                      <span dir="auto">
                        {t("relationships.invitation", {
                          company: invitingCompany?.displayName,
                        })}
                      </span>
                    </div>
                    <div>
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
                        {t("actions.accept")}
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
                        {t("actions.decline")}
                      </Button>
                    </div>
                  </li>
                ),
              )}
            </ul>
          ) : null}
          <ul className="company-list">
            {relationships?.map((item) => (
              <li key={item.relationship._id}>
                <div>
                  <strong dir="auto">{item.relationship.name}</strong>
                  <span>
                    {statusLabel(item.relationship.status)} ·{" "}
                    <span dir="auto">
                      {item.participants
                        .map((company) => company.displayName)
                        .join(", ")}
                    </span>
                  </span>
                </div>
                <RelationshipParticipantForm
                  actingCompanyId={actingCompanyId}
                  relationshipId={item.relationship._id}
                  run={run}
                />
                <div>
                  {item.participants
                    .filter((company) => company._id !== actingCompanyId)
                    .map((company) => (
                      <Button
                        key={company._id}
                        onClick={() =>
                          void run(async () => {
                            const requestId = await proposeRelationshipRemoval({
                              actingCompanyId,
                              relationshipId: item.relationship._id,
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
                        {t("relationships.requestRemoval", {
                          company: company.displayName,
                        })}
                      </Button>
                    ))}
                  {item.pendingRemovalRequests
                    .filter(
                      (request) => request.targetCompanyId !== actingCompanyId,
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
                        {t("relationships.approveRemoval")}
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
                    {t("relationships.leave")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {actingCompanyId && currentUser && administration ? (
        <section className="company-panel">
          <h2>{t("projects.heading")}</h2>
          {administration.membership.role !== "member" ? (
            <SharedProjectForm
              actingCompanyId={actingCompanyId}
              currentUserId={currentUser._id}
              relationships={(relationships ?? []).filter(
                (item) => item.relationship.status === "active",
              )}
              run={run}
            />
          ) : null}
          {(projectInvitations ?? []).length ? (
            <ul className="company-list">
              {projectInvitations?.map(
                ({ invitation, invitingCompany, project }) => (
                  <li key={invitation._id}>
                    <div>
                      <strong dir="auto">{project?.name}</strong>
                      <span dir="auto">
                        {t("projects.invitation", {
                          company: invitingCompany?.displayName,
                        })}
                      </span>
                    </div>
                    <div>
                      <Button
                        onClick={() =>
                          void run(() =>
                            decideProjectInvitation({
                              actingCompanyId,
                              invitationId: invitation._id,
                              decision: "accept",
                              initialMembers: [
                                { userId: currentUser._id, role: "manager" },
                              ],
                            }),
                          )
                        }
                      >
                        {t("actions.accept")}
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
                        {t("actions.decline")}
                      </Button>
                    </div>
                  </li>
                ),
              )}
            </ul>
          ) : null}
          <ul className="company-list">
            {projects?.map((item) => (
              <li key={item.membership._id}>
                <div>
                  <strong dir="auto">{item.project.name}</strong>
                  <span>
                    {roleLabel(item.membership.role)} · {statusLabel(item.membership.status)} ·{" "}
                    {t("projects.representedBy")} <span dir="auto">{administration?.company.displayName}</span>
                  </span>
                </div>
                <Link
                  params={{ projectId: item.project._id }}
                  search={{
                    companyId: actingCompanyId,
                    groupId: '',
                    membershipId: item.membership._id,
                  }}
                  to="/workspace/company-projects/$projectId"
                >
                  {t("projects.open")}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {actingCompanyId &&
      currentUser &&
      administration &&
      administration.membership.role !== "member" ? (
        <MigrationPanel
          actingCompanyId={actingCompanyId}
          currentUserId={currentUser._id}
          relationships={(relationships ?? []).filter(
            (item) => item.relationship.status === "active",
          )}
          run={run}
        />
      ) : null}
    </main>
  );
}
