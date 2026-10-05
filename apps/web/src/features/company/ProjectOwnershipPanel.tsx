import { useMutation, useQuery } from "convex/react";
import { Check, Clock3, ShieldCheck, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Button } from "#/components/ui/button";
import { NativeSelect, NativeSelectOption } from "#/components/ui/native-select";

type Props = {
  actingCompanyId: Id<"companies">;
  mode: "assign" | "approve-only" | "transfer";
  projectId: Id<"projects">;
  projectMemberId: Id<"projectMembers">;
  run: (action: () => Promise<unknown>) => Promise<unknown>;
};

export function ProjectOwnershipPanel({
  actingCompanyId,
  mode,
  projectId,
  projectMemberId,
  run,
}: Props) {
  const state = useQuery(api.projectOwnership.getState, {
    actingCompanyId,
    projectId,
    projectMemberId,
  });
  const requestOwnership = useMutation(api.projectOwnership.request);
  const decideOwnership = useMutation(api.projectOwnership.decide);
  const [proposedOwnerId, setProposedOwnerId] =
    useState<Id<"companies"> | null>(null);
  const candidates = useMemo(
    () =>
      state?.participants.filter(
        (participant) =>
          mode !== "transfer" || participant.company?._id !== actingCompanyId,
      ) ?? [],
    [actingCompanyId, mode, state],
  );

  useEffect(() => {
    if (
      proposedOwnerId &&
      candidates.some(
        (participant) => participant.company?._id === proposedOwnerId,
      )
    )
      return;
    const representedCompany = candidates.find(
      (participant) => participant.company?._id === actingCompanyId,
    )?.company;
    const firstCompany = candidates.find(
      (participant) => participant.company,
    )?.company;
    setProposedOwnerId(representedCompany?._id ?? firstCompany?._id ?? null);
  }, [actingCompanyId, candidates, proposedOwnerId]);

  if (state === undefined) {
    return (
      <section className="company-project-ownership" aria-busy="true">
        <span>Loading Company ownership…</span>
      </section>
    );
  }

  const representedParticipant = state.participants.find(
    (participant) => participant.company?._id === actingCompanyId,
  );
  const representedApproval = state.approvals.find(
    (entry) =>
      entry.projectCompany?._id === representedParticipant?.projectCompany._id,
  );
  const approvalByParticipant = new Map(
    state.approvals.flatMap((entry) =>
      entry.projectCompany
        ? [[entry.projectCompany._id, entry.approval.decision]]
        : [],
    ),
  );

  if (!state.request && mode === "approve-only") return null;
  if (!state.request && mode === "transfer" && candidates.length === 0)
    return null;
  const transferActive =
    mode === "transfer" || Boolean(state.request?.sourceOwningCompanyId);

  return (
    <section className="company-project-ownership">
      <div className="company-project-ownership-heading">
        <ShieldCheck aria-hidden="true" size={15} />
        <div>
          <strong>
            {transferActive
              ? "Transfer Project ownership"
              : "Confirm Project owner"}
          </strong>
          <span>
            {transferActive
              ? "Transfer Project ownership before this Company exits. Every participating Company must approve."
              : "Ownership must be chosen by participating Companies; Track will not infer it from Project history."}
          </span>
        </div>
      </div>

      {state.request ? (
        <>
          <p>
            <strong>
              {state.proposedOwningCompany?.displayName ?? "Unavailable Company"}
            </strong>{" "}
            is proposed as the owning Company.
          </p>
          <ul className="company-project-ownership-participants">
            {state.participants.map((participant) => {
              const decision = approvalByParticipant.get(
                participant.projectCompany._id,
              );
              return (
                <li key={participant.projectCompany._id}>
                  <span>
                    {participant.company?.displayName ?? "Unavailable Company"}
                  </span>
                  <small>
                    {decision === "approved" ? (
                      <><Check aria-hidden="true" size={12} /> Approved</>
                    ) : decision === "rejected" ? (
                      <><X aria-hidden="true" size={12} /> Rejected</>
                    ) : (
                      <><Clock3 aria-hidden="true" size={12} /> Awaiting decision</>
                    )}
                  </small>
                </li>
              );
            })}
          </ul>
          {!representedApproval ? (
            <div className="company-project-ownership-actions">
              <Button
                onClick={() =>
                  void run(() =>
                    decideOwnership({
                      actingCompanyId,
                      decision: "approve",
                      projectId,
                      projectMemberId,
                      requestId: state.request._id,
                    }),
                  )
                }
              >
                Approve for Company
              </Button>
              <Button
                onClick={() =>
                  void run(() =>
                    decideOwnership({
                      actingCompanyId,
                      decision: "reject",
                      projectId,
                      projectMemberId,
                      requestId: state.request._id,
                    }),
                  )
                }
                variant="outline"
              >
                Reject
              </Button>
            </div>
          ) : (
            <p className="company-project-ownership-note">
              Your Company has {representedApproval.approval.decision} this
              proposal.
            </p>
          )}
        </>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!proposedOwnerId) return;
            void run(() =>
              requestOwnership({
                actingCompanyId,
                idempotencyKey: crypto.randomUUID(),
                projectId,
                projectMemberId,
                proposedOwningCompanyId: proposedOwnerId,
              }),
            );
          }}
        >
          <label>
            <span>Owning Company</span>
            <NativeSelect
              aria-label="Owning Company"
              onChange={(event) => {
                const selectedCompany = state.participants.find(
                  (participant) =>
                    participant.company?._id === event.target.value,
                )?.company;
                if (selectedCompany) setProposedOwnerId(selectedCompany._id);
              }}
              required
              searchable={candidates.length >= 8}
              value={proposedOwnerId ?? ""}
            >
              {candidates.flatMap((participant) =>
                participant.company
                  ? [
                      <NativeSelectOption
                        key={participant.company._id}
                        value={participant.company._id}
                      >
                        {participant.company.displayName}
                      </NativeSelectOption>,
                    ]
                  : [],
              )}
            </NativeSelect>
          </label>
          <p className="company-project-ownership-note">
            {transferActive
              ? "The proposed transfer is bound to the current participants and requires every Company’s approval."
              : "A single participating Company confirms immediately. Collaborating Projects require approval from every participating Company."}
          </p>
          <Button disabled={!proposedOwnerId} type="submit">
            {transferActive
              ? "Propose ownership transfer"
              : "Propose owning Company"}
          </Button>
        </form>
      )}
    </section>
  );
}
