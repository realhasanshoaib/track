import type { FunctionReturnType } from "convex/server";
import { useMemo } from "react";

import type { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Button } from "#/components/ui/button";
import { ProjectCompanyInviteForm } from "./CompanyForms";
import { formatSnapshotError } from "./company-errors";
import type { CompanyProjectChannel } from "./company-project-types";
import { ProjectOwnershipPanel } from "./ProjectOwnershipPanel";

type SharedProjectItem = FunctionReturnType<
  typeof api.sharedProjects.listForActingCompany
>[number];
type ProjectMemberRow = FunctionReturnType<
  typeof api.sharedProjects.listMembers
>[number];
type CompanyAdministration = FunctionReturnType<
  typeof api.companies.getAdministration
>;
type CollaborationOptions = FunctionReturnType<
  typeof api.sharedProjects.getCollaborationOptions
>;
type ChannelParticipationInvitations = FunctionReturnType<
  typeof api.channels.listParticipationInvitations
>;
type ChannelParticipationOptions = FunctionReturnType<
  typeof api.channels.getParticipationOptions
>;
type PendingChannelArchives = FunctionReturnType<
  typeof api.channels.listPendingArchive
>;
type PendingProjectArchives = FunctionReturnType<
  typeof api.projectArchives.listPending
>;
type ProjectExitStatus = FunctionReturnType<typeof api.projectExit.getStatus>;

type RunAction = (
  action: () => Promise<unknown>,
  actionLabel?: string,
) => Promise<boolean>;

export type CompanyProjectAdministrationProps = {
  actingCompanyId: Id<"companies">;
  activeChannel: CompanyProjectChannel | undefined;
  activeChannelId: Id<"groups"> | null;
  canConfirmProjectOwnership: boolean;
  canInvitePartnerCompanies: boolean;
  canManageExit: boolean;
  channelParticipationInvitations: ChannelParticipationInvitations | undefined;
  collaborationOptions: CollaborationOptions | undefined;
  companyMembers: CompanyAdministration | undefined;
  exitStatus: ProjectExitStatus | null | undefined;
  item: SharedProjectItem;
  isChannelSteward: boolean;
  participationOptions: ChannelParticipationOptions | undefined;
  pendingChannelArchives: PendingChannelArchives | undefined;
  pendingProjectArchives: PendingProjectArchives | undefined;
  projectId: Id<"projects">;
  projectMemberId: Id<"projectMembers">;
  projectMembers: Array<ProjectMemberRow> | undefined;
  run: RunAction;
  onAddProjectMember: (userId: Id<"users">) => Promise<unknown>;
  onApproveChannelArchive: (requestId: Id<"channelArchiveRequests">) => Promise<unknown>;
  onApproveProjectArchive: (requestId: Id<"projectArchiveRequests">) => Promise<unknown>;
  onCancelChannelArchive: (requestId: Id<"channelArchiveRequests">) => Promise<unknown>;
  onCancelExit: () => Promise<unknown>;
  onDecideChannelParticipation: (input: {
    decision: "accept" | "decline";
    groupId: Id<"groups">;
    requestId: Id<"channelParticipationRequests">;
    selectedProjectMemberIds: Array<Id<"projectMembers">>;
  }) => Promise<unknown>;
  onFinalizeExit: () => Promise<unknown>;
  onPrepareExit: () => Promise<unknown>;
  onRequestChannelArchive: (operation: "archive" | "restore") => Promise<Id<"channelArchiveRequests">>;
  onRequestChannelParticipation: (input: {
    selectedProjectMemberIds: Array<Id<"projectMembers">>;
    targetProjectCompanyId: Id<"projectCompanies">;
  }) => Promise<unknown>;
  onRequestProjectArchive: (operation: "archive" | "restore") => Promise<Id<"projectArchiveRequests">>;
  onRetryExit: () => Promise<unknown>;
  onUpdateProjectMember: (
    targetProjectMemberId: Id<"projectMembers">,
    status: "active" | "suspended",
  ) => Promise<unknown>;
};

export function CompanyProjectAdministration({
  actingCompanyId,
  activeChannel,
  activeChannelId,
  canConfirmProjectOwnership,
  canInvitePartnerCompanies,
  canManageExit,
  channelParticipationInvitations,
  collaborationOptions,
  companyMembers,
  exitStatus,
  item,
  isChannelSteward,
  participationOptions,
  pendingChannelArchives,
  pendingProjectArchives,
  projectId,
  projectMemberId,
  projectMembers,
  run,
  onAddProjectMember,
  onApproveChannelArchive,
  onApproveProjectArchive,
  onCancelChannelArchive,
  onCancelExit,
  onDecideChannelParticipation,
  onFinalizeExit,
  onPrepareExit,
  onRequestChannelArchive,
  onRequestChannelParticipation,
  onRequestProjectArchive,
  onRetryExit,
  onUpdateProjectMember,
}: CompanyProjectAdministrationProps) {
  const eligibleCompanyMembers = useMemo(
    () =>
      (companyMembers?.members ?? []).filter(
        ({ membership }) =>
          membership.status === "active" &&
          !projectMembers?.some(
            (row) => row.membership.userId === membership.userId,
          ),
      ),
    [companyMembers?.members, projectMembers],
  );
  const channelId = activeChannelId;
  const snapshotError = formatSnapshotError(exitStatus?.snapshotError);

  return (
    <aside className="company-project-admin">
      <div className="company-admin-heading">
        <div>
          <h2>Project management</h2>
          <span>
            {activeChannel ? `#${activeChannel.name} · ` : ""}
            {item.project.name}
          </span>
        </div>
      </div>
      {canConfirmProjectOwnership ? (
        <ProjectOwnershipPanel
          actingCompanyId={actingCompanyId}
          mode={
            item.participationRole === "unassigned_legacy"
              ? "assign"
              : item.participationRole === "owner"
                ? "transfer"
                : "approve-only"
          }
          projectId={projectId}
          projectMemberId={projectMemberId}
          run={run}
        />
      ) : item.participationRole === "unassigned_legacy" ? (
        <div className="company-admin-card">
          <strong>Project owner not assigned</strong>
          <p>
            A Company admin who is also a Project manager must start or
            approve the ownership confirmation.
          </p>
        </div>
      ) : null}
      <details className="company-project-management" open>
        <summary>Project and Channel administration</summary>
        <div className="company-project-management-content">
          {canInvitePartnerCompanies ? (
            collaborationOptions === undefined ? (
              <div aria-busy="true" className="company-admin-card">
                <strong>Invite a partner Company</strong>
                <p>Loading eligible Companies and pending invitations…</p>
              </div>
            ) : (
              <ProjectCompanyInviteForm
                actingCompanyId={actingCompanyId}
                options={collaborationOptions}
                projectId={projectId}
                projectMemberId={projectMemberId}
                run={run}
              />
            )
          ) : null}
          {projectMembers ? (
            <>
              <h3>Your Company members</h3>
              <ul>
                {projectMembers.map(({ membership, user }) => (
                  <li key={membership._id}>
                    <span>
                      {user?.displayName ?? membership.userDisplayNameSnapshot}
                      <small>{membership.role}</small>
                    </span>
                    {membership._id !== projectMemberId ? (
                      <Button
                        onClick={() =>
                          void run(() =>
                            onUpdateProjectMember(
                              membership._id,
                              membership.status === "active"
                                ? "suspended"
                                : "active",
                            ),
                          )
                        }
                        variant="outline"
                      >
                        {membership.status === "active"
                          ? "Suspend"
                          : "Reactivate"}
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
              <h3>Add your Company members</h3>
              {eligibleCompanyMembers.map(({ membership, user }) => (
                <Button
                  key={membership._id}
                  onClick={() =>
                    void run(() => onAddProjectMember(membership.userId))
                  }
                  variant="outline"
                >
                  Add {user?.displayName ?? membership.userDisplayNameSnapshot}
                </Button>
              ))}
            </>
          ) : null}
          {channelParticipationInvitations?.map((request) => (
            <div className="company-admin-card" key={request._id}>
              <strong>Channel participation requested</strong>
              <p>
                The requesting Company selected {request.selectedProjectMemberIds.length} member(s).
              </p>
              <Button
                onClick={() =>
                  void run(() =>
                    onDecideChannelParticipation({
                      decision: "accept",
                      groupId: request.groupId,
                      requestId: request._id,
                      selectedProjectMemberIds: request.selectedProjectMemberIds,
                    }),
                  )
                }
              >
                Accept for Company
              </Button>
              <Button
                onClick={() =>
                  void run(() =>
                    onDecideChannelParticipation({
                      decision: "decline",
                      groupId: request.groupId,
                      requestId: request._id,
                      selectedProjectMemberIds: [],
                    }),
                  )
                }
                variant="outline"
              >
                Decline
              </Button>
            </div>
          ))}
          {participationOptions?.map((option) => (
            <div className="company-admin-card" key={option.projectCompany._id}>
              <strong>
                Add {option.company?.displayName ?? "Company"} to #{activeChannel?.name ?? "Channel"}
              </strong>
              <p>
                {option.members.length} Project member(s) will be selected for
                their manager to confirm.
              </p>
              <Button
                disabled={!channelId}
                onClick={() => {
                  if (!channelId) return;
                  void run(() =>
                    onRequestChannelParticipation({
                      selectedProjectMemberIds: option.members.map(
                        ({ membership }) => membership._id,
                      ),
                      targetProjectCompanyId: option.projectCompany._id,
                    }),
                  );
                }}
                variant="outline"
              >
                Request participation
              </Button>
            </div>
          ))}
          {pendingChannelArchives?.map((request) => (
            <div className="company-admin-card" key={request._id}>
              <strong>
                {request.operation === "archive" ? "Channel archive" : "Channel restore"} requested
              </strong>
              <Button
                onClick={() =>
                  void run(() => onApproveChannelArchive(request._id))
                }
              >
                Approve for Company
              </Button>
              <Button
                onClick={() =>
                  void run(() => onCancelChannelArchive(request._id))
                }
                variant="outline"
              >
                Cancel request
              </Button>
            </div>
          ))}
          {channelId &&
          isChannelSteward &&
          activeChannel?.kind !== "general" &&
          (activeChannel?.status === "active" ||
            activeChannel?.status === "archived") &&
          !pendingChannelArchives?.length ? (
            <Button
              onClick={() =>
                void run(async () => {
                  const requestId = await onRequestChannelArchive(
                    activeChannel.status === "archived" ? "restore" : "archive",
                  );
                  await onApproveChannelArchive(requestId);
                })
              }
              variant="outline"
            >
              Request Channel {activeChannel.status === "archived" ? "restore" : "archive"}
            </Button>
          ) : null}
          {pendingProjectArchives?.map((request) => (
            <div className="company-admin-card" key={request._id}>
              <strong>
                {request.operation === "archive" ? "Archive" : "Restore"} approval requested
              </strong>
              <Button
                onClick={() =>
                  void run(() => onApproveProjectArchive(request._id))
                }
              >
                Approve for Company
              </Button>
            </div>
          ))}
          {item.membership.role === "manager" &&
          item.membership.status === "active" ? (
            <Button
              onClick={() =>
                void run(async () => {
                  const requestId = await onRequestProjectArchive(
                    item.project.status === "archived" ? "restore" : "archive",
                  );
                  await onApproveProjectArchive(requestId);
                })
              }
              variant="outline"
            >
              Request Project {item.project.status === "archived" ? "restore" : "archive"}
            </Button>
          ) : null}
          {item.project.origin === "shared" &&
          item.membership.status === "active" &&
          exitStatus?.status === "active" ? (
            <Button onClick={() => void run(onPrepareExit)} variant="destructive">
              Start Company exit
            </Button>
          ) : null}
          {exitStatus?.status === "exit_pending" ? (
            <div className="company-admin-card">
              <strong>
                {exitStatus.snapshotStatus === "verified"
                  ? "Company exit ready"
                  : exitStatus.snapshotStatus === "failed"
                    ? "Exit snapshot capture failed"
                    : "Preparing Company exit snapshot"}
              </strong>
              <p>Snapshot: {exitStatus.snapshotStatus ?? "pending"}</p>
              {exitStatus.snapshotStatus !== "verified" ? (
                <p>
                  Project conversation remains available read-only while the
                  snapshot is prepared.
                </p>
              ) : null}
              {snapshotError ? <p>{snapshotError}</p> : null}
              {canManageExit ? (
                <>
                  <Button
                    disabled={exitStatus.snapshotStatus !== "verified"}
                    onClick={() => void run(onFinalizeExit)}
                  >
                    Finalize exit
                  </Button>
                  <Button onClick={() => void run(onRetryExit)} variant="outline">
                    Retry snapshot
                  </Button>
                  <Button onClick={() => void run(onCancelExit)} variant="outline">
                    Cancel safely
                  </Button>
                </>
              ) : (
                <p>Only a Company admin can manage this exit.</p>
              )}
            </div>
          ) : null}
        </div>
      </details>
    </aside>
  );
}
