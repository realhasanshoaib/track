const knownCompanyErrors: ReadonlyMap<string, string> = new Map([
  ["audience_expansion_confirmation_required", "Confirm the larger Channel audience before forwarding."],
  ["channel_archive_request_scope_mismatch", "That Channel request is no longer current."],
  ["channel_archived", "This Channel is archived and read-only."],
  ["channel_lifecycle_conflict", "This Channel changed while you were working. Refresh and try again."],
  ["channel_steward_required", "Only a Channel steward can change this Channel."],
  ["channel_unavailable", "This Channel is unavailable or your access changed."],
  ["company_member_unavailable", "That Company member is unavailable."],
  ["company_suspended", "This Company is suspended and cannot be changed."],
  ["exit_not_pending", "This Company exit is no longer pending."],
  ["exit_snapshot_not_verified", "The exit snapshot is not ready to finalize."],
  ["last_channel_steward", "The Channel needs another steward before this change."],
  ["last_project_manager", "The Project needs another manager before this change."],
  ["project_lifecycle_conflict", "This Project changed while you were working. Refresh and try again."],
  ["project_manager_required", "Only a Project manager can change this Project."],
  ["project_ownership_transfer_required", "Transfer Project ownership before this Company exits."],
  ["project_participation_unavailable", "This Company no longer participates in the Project."],
  ["project_unavailable", "This Project is unavailable or your access changed."],
  ["shared_project_unavailable", "This shared Project is unavailable or your access changed."],
  ["snapshot_cleanup_unavailable", "The exit snapshot cleanup is not available yet."],
  ["snapshot_source_unavailable", "The exit snapshot source is unavailable. Try again."],
]);

export function formatCompanyError(error: unknown) {
  if (error instanceof Error) {
    for (const [code, message] of knownCompanyErrors) {
      if (error.message.includes(code)) return message;
    }
  }
  return "We couldn’t save that change. Try again.";
}

export function formatSnapshotError(snapshotError: string | null | undefined) {
  if (!snapshotError) return null;
  if (snapshotError.startsWith("snapshot_cleanup")) {
    return "Exit snapshot cleanup needs attention. Retry cleanup to continue.";
  }
  if (snapshotError.startsWith("snapshot_")) {
    return "The exit snapshot could not be verified. Retry it before finalizing.";
  }
  return "The exit snapshot reported an unexpected problem. Try again.";
}
