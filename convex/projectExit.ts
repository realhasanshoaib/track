import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { requireAuthenticatedActor } from "./lib/actorContext";
import {
  requireActiveCompanyMembership,
  requireCompanyAdmin,
} from "./lib/companyPolicy";
import {
  bumpProjectParticipants,
  revokePendingProjectInvitations,
} from "./lib/companyProjectLifecycle";
import {
  captureExitBatch,
} from "./lib/projectExitCapture";
import {
  clearTaskExitStagingBatch,
  clearTaskExitStaging,
  materializeTaskArchiveSnapshots,
} from "./lib/taskLifecycle";

type ThreadStateBefore = {
  name?: string;
  revision?: number;
  status?: "active" | "archived";
};

type ExitProjectSnapshot = Pick<Doc<"projects">, "name"> &
  Partial<
    Pick<
      Doc<"projects">,
      "_id" | "description" | "owningCompanyId" | "origin" | "status"
    >
  > & {
    owningCompanyDisplayName?: string;
  };

function isThreadStateBefore(value: unknown): value is ThreadStateBefore {
  if (!value || typeof value !== "object") return false;
  if ("name" in value && value.name !== undefined && typeof value.name !== "string") return false;
  if (
    "revision" in value &&
    value.revision !== undefined &&
    typeof value.revision !== "number"
  ) return false;
  if (
    "status" in value &&
    value.status !== undefined &&
    value.status !== "active" &&
    value.status !== "archived"
  ) return false;
  return true;
}

function decodeExitProjectSnapshot(
  ctx: MutationCtx,
  value: unknown,
): ExitProjectSnapshot | undefined {
  if (
    !value ||
    typeof value !== "object" ||
    !("name" in value) ||
    typeof value.name !== "string"
  ) return undefined;
  const snapshot: ExitProjectSnapshot = { name: value.name };
  if ("_id" in value && typeof value._id === "string") {
    const projectId = ctx.db.normalizeId("projects", value._id);
    if (projectId) snapshot._id = projectId;
  }
  if ("description" in value && typeof value.description === "string") snapshot.description = value.description;
  if ("owningCompanyId" in value && typeof value.owningCompanyId === "string") {
    const companyId = ctx.db.normalizeId("companies", value.owningCompanyId);
    if (companyId) snapshot.owningCompanyId = companyId;
  }
  if (
    "owningCompanyDisplayName" in value &&
    typeof value.owningCompanyDisplayName === "string"
  ) snapshot.owningCompanyDisplayName = value.owningCompanyDisplayName;
  if ("origin" in value && (value.origin === "single_company" || value.origin === "shared")) {
    snapshot.origin = value.origin;
  }
  if (
    "status" in value &&
    (value.status === "proposed" ||
      value.status === "active" ||
      value.status === "archive_pending" ||
      value.status === "archived")
  ) snapshot.status = value.status;
  return snapshot;
}

async function threadStateAtCutoff(
  ctx: MutationCtx,
  thread: Pick<Doc<"channelThreads">, "_id" | "name" | "revision" | "status">,
  cutoff: number,
) {
  const events = await ctx.db
    .query("auditEvents")
    .withIndex("by_entity", (q) =>
      q.eq("entityType", "channelThread").eq("entityId", thread._id),
    )
    .collect();
  const state = {
    name: thread.name,
    revision: thread.revision,
    status: thread.status,
  };
  const eventsAtCutoff = events.filter((item) => item.createdAt > cutoff);
  // eslint-disable-next-line unicorn/no-array-sort -- reason: Copy first to preserve immutability while supporting the web ES2022 target.
  for (const event of [...eventsAtCutoff].sort(
    (left, right) => right.createdAt - left.createdAt,
  )) {
    if (!isThreadStateBefore(event.before)) continue;
    if (event.before.name !== undefined) state.name = event.before.name;
    if (event.before.revision !== undefined) state.revision = event.before.revision;
    if (event.before.status !== undefined) state.status = event.before.status;
  }
  return state;
}

export const prepare = mutation({
  args: { actingCompanyId: v.id("companies"), projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx);
    await requireCompanyAdmin(ctx, actor, args.actingCompanyId);
    const project = await ctx.db.get(args.projectId);
    if (
      !project ||
      project.accessProfile !== "company" ||
      project.origin !== "shared"
    ) {
      throw new Error("shared_project_unavailable");
    }
    const terms = await ctx.db
      .query("projectCompanies")
      .withIndex("by_project_company_term", (q) =>
        q.eq("projectId", project._id).eq("companyId", args.actingCompanyId),
      )
      .collect();
    const alreadyPending = terms.find((term) => term.status === "exit_pending");
    if (alreadyPending) return alreadyPending._id;
    const participation = terms.find((term) => term.status === "active");
    if (!participation) throw new Error("project_participation_unavailable");
    if (project.owningCompanyId === args.actingCompanyId) {
      const activeParticipants = await ctx.db
        .query("projectCompanies")
        .withIndex("by_project_status", (q) =>
          q.eq("projectId", project._id).eq("status", "active"),
        )
        .collect();
      if (activeParticipants.length > 1) {
        throw new Error("project_ownership_transfer_required");
      }
    }
    const now = Date.now();
    const memoryBox = await ctx.db
      .query("projectMemoryBoxes")
      .withIndex("by_project", (q) => q.eq("projectId", project._id))
      .unique();
    if (memoryBox?.contextWritePendingRevision) {
      throw new Error("memory_context_update_in_progress");
    }
    const [queuedImport, runningImport] = await Promise.all([
      ctx.db
        .query("memoryImports")
        .withIndex("by_project_status", (q) =>
          q.eq("projectId", project._id).eq("status", "queued"),
        )
        .first(),
      ctx.db
        .query("memoryImports")
        .withIndex("by_project_status", (q) =>
          q.eq("projectId", project._id).eq("status", "running"),
        )
        .first(),
    ]);
    if (queuedImport || runningImport) {
      throw new Error("memory_import_in_progress");
    }
    const exitOperationId = crypto.randomUUID();
    const snapshotPath = `archives/company-exits/${participation._id}/${now}/${exitOperationId}`;
    const owningCompany = project.owningCompanyId
      ? await ctx.db.get(project.owningCompanyId)
      : null;
    await ctx.db.insert("projectExitOperations", {
      projectCompanyId: participation._id,
      projectId: project._id,
      operationId: exitOperationId,
      cutoff: now,
      status: "capturing",
      phase: "members",
      stagedCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(participation._id, {
      status: "exit_pending",
      exitPreparedBy: actor.userId,
      exitPreparedAt: now,
      exitCutoff: now,
      exitOperationId,
      exitContextRevision: memoryBox?.lastContextUpdatedAt,
      exitMemoryBoxId: memoryBox?.boxId,
      exitOwningCompanyId: project.owningCompanyId,
      exitOwningCompanyDisplayName: owningCompany?.displayName,
      exitProjectSnapshot: {
        _id: project._id,
        name: project.name,
        description: project.description,
        owningCompanyId: project.owningCompanyId,
        owningCompanyDisplayName: owningCompany?.displayName,
        origin: project.origin,
        status: project.status,
      },
      exitChannelSnapshots: [],
      exitMemberSnapshots: [],
      exitSnapshotStatus: "capturing",
      exitSnapshotPhase: "members",
      exitSnapshotError: undefined,
      memorySnapshotStatus: "pending",
      memorySnapshotPath: snapshotPath,
      memorySnapshotError: undefined,
      updatedAt: now,
    });
    await bumpProjectParticipants(ctx, project._id, now);
    await ctx.scheduler.runAfter(
      0,
      internal.projectExit.captureBatch,
      {
        projectCompanyId: participation._id,
        operationId: exitOperationId,
        cursor: undefined,
      },
    );
    return participation._id;
  },
});

export const retrySnapshot = mutation({
  args: { actingCompanyId: v.id("companies"), projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx);
    await requireCompanyAdmin(ctx, actor, args.actingCompanyId);
    const participations = await ctx.db
      .query("projectCompanies")
      .withIndex("by_project_status", (q) =>
        q.eq("projectId", args.projectId).eq("status", "exit_pending"),
      )
      .collect();
    const participation = participations.find(
      (term) => term.companyId === args.actingCompanyId,
    );
    if (!participation) throw new Error("exit_not_pending");
    const operationId = participation.exitOperationId;
    if (!operationId) throw new Error("exit_snapshot_unavailable");
    const operation = await ctx.db
      .query("projectExitOperations")
      .withIndex("by_project_company_operation", (q) =>
        q
          .eq("projectCompanyId", participation._id)
          .eq("operationId", operationId),
      )
      .unique();
    if (!operation || (operation.status !== "failed" && operation.status !== "capturing")) {
      throw new Error("exit_snapshot_unavailable");
    }
    if (operation.phase === "complete") {
      await ctx.db.patch(operation._id, {
        status: "capturing",
        error: undefined,
        updatedAt: Date.now(),
      });
      await ctx.db.patch(participation._id, {
        exitSnapshotStatus: "capturing",
        exitSnapshotError: undefined,
        updatedAt: Date.now(),
      });
      await ctx.scheduler.runAfter(0, internal.projectExit.finalizeBatch, {
        projectCompanyId: participation._id,
        operationId,
        cursor: operation.cursor,
        exitedBy: participation.exitPreparedBy ?? actor.userId,
      });
      return participation._id;
    }
    const phase = operation.phase;
    await ctx.db.patch(operation._id, {
      status: "capturing",
      phase,
      error: undefined,
      updatedAt: Date.now(),
    });
    await ctx.db.patch(participation._id, {
      memorySnapshotStatus: "pending",
      memorySnapshotError: undefined,
      exitSnapshotStatus: "capturing",
      exitSnapshotPhase: phase,
      exitSnapshotError: undefined,
      updatedAt: Date.now(),
    });
    if (phase === "memory") {
      await ctx.scheduler.runAfter(0, internal.projectExitActions.snapshot, {
        projectCompanyId: participation._id,
        operationId,
      });
    } else {
      await ctx.scheduler.runAfter(0, internal.projectExit.captureBatch, {
        projectCompanyId: participation._id,
        operationId,
        cursor: operation.cursor,
      });
    }
    return participation._id;
  },
});

export const cancel = mutation({
  args: { actingCompanyId: v.id("companies"), projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx);
    await requireCompanyAdmin(ctx, actor, args.actingCompanyId);
    const participations = await ctx.db
      .query("projectCompanies")
      .withIndex("by_project_status", (q) =>
        q.eq("projectId", args.projectId).eq("status", "exit_pending"),
      )
      .collect();
    const participation = participations.find(
      (term) => term.companyId === args.actingCompanyId,
    );
    if (!participation) throw new Error("exit_not_pending");
    const snapshotPath = participation.memorySnapshotPath;
    const operationId = participation.exitOperationId;
    if (operationId) {
      const operation = await ctx.db
        .query("projectExitOperations")
        .withIndex("by_project_company_operation", (q) =>
          q.eq("projectCompanyId", participation._id).eq("operationId", operationId),
        )
        .unique();
      if (operation) {
        if (
          operation.phase === "complete" &&
          (operation.status === "capturing" || operation.status === "failed")
        ) {
          throw new Error("exit_finalization_in_progress");
        }
        await ctx.db.patch(operation._id, {
          status: "cancelled",
          phase: "complete",
          error: undefined,
          updatedAt: Date.now(),
        });
      }
    }
    await ctx.db.patch(participation._id, {
      status: "active",
      exitPreparedBy: undefined,
      exitPreparedAt: undefined,
      exitCutoff: undefined,
      exitContextRevision: undefined,
      exitOperationId: undefined,
      exitSnapshotStatus: "cancelled",
      exitSnapshotPhase: "complete",
      exitSnapshotError: undefined,
      exitOwningCompanyId: undefined,
      exitOwningCompanyDisplayName: undefined,
      exitProjectSnapshot: undefined,
      exitChannelSnapshots: undefined,
      exitMemberSnapshots: undefined,
      memorySnapshotStatus: undefined,
      memorySnapshotManifestHash: undefined,
      memorySnapshotManifest: undefined,
      memorySnapshotPath: snapshotPath,
      memorySnapshotError: snapshotPath
        ? "snapshot_cleanup_pending"
        : undefined,
      updatedAt: Date.now(),
    });
    await bumpProjectParticipants(ctx, args.projectId, Date.now());
    if (operationId) {
      await ctx.scheduler.runAfter(0, internal.projectExit.cleanupCapture, {
        projectCompanyId: participation._id,
        operationId,
        cursor: undefined,
      });
    }
    if (snapshotPath) {
      await ctx.scheduler.runAfter(
        0,
        internal.projectExitActions.cleanupSnapshot,
        {
          projectCompanyId: participation._id,
          snapshotPath,
          boxId: participation.exitMemoryBoxId,
        },
      );
    }
    return participation._id;
  },
});

export const retryCleanup = mutation({
  args: { actingCompanyId: v.id("companies"), projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx);
    await requireCompanyAdmin(ctx, actor, args.actingCompanyId);
    const terms = await ctx.db
      .query("projectCompanies")
      .withIndex("by_project_company_term", (q) =>
        q.eq("projectId", args.projectId).eq("companyId", args.actingCompanyId),
      )
      .collect();
    const term = terms.find(
      (candidate) =>
        candidate.status === "active" && candidate.memorySnapshotPath,
    );
    if (!term) throw new Error("snapshot_cleanup_unavailable");
    const snapshotPath = term.memorySnapshotPath;
    if (!snapshotPath) throw new Error("snapshot_cleanup_unavailable");
    await ctx.db.patch(term._id, {
      memorySnapshotError: "snapshot_cleanup_pending",
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(
      0,
      internal.projectExitActions.cleanupSnapshot,
      {
        projectCompanyId: term._id,
        snapshotPath,
        boxId: term.exitMemoryBoxId,
      },
    );
    return term._id;
  },
});

const archiveProjectionLimit = 256;

async function boundedExitRows(
  ctx: MutationCtx,
  operationId: string,
  scope: 'member' | 'channel',
) {
  const result = await ctx.db
    .query('projectExitSnapshotStaging')
    .withIndex('by_operation_scope', (q) =>
      q.eq('operationId', operationId).eq('scope', scope),
    )
    .take(archiveProjectionLimit + 1);
  return result.length <= archiveProjectionLimit ? result : [];
}

async function boundedThreadRows(
  ctx: MutationCtx,
  operationId: string,
  projectMemberId: Doc<'projectMembers'>['_id'],
) {
  const result = await ctx.db
    .query('projectExitSnapshotStaging')
    .withIndex('by_operation_member_scope', (q) =>
      q
        .eq('operationId', operationId)
        .eq('projectMemberId', projectMemberId)
        .eq('scope', 'thread'),
    )
    .take(archiveProjectionLimit + 1);
  return result.length <= archiveProjectionLimit ? result : [];
}

async function boundedChannelIds(
  ctx: MutationCtx,
  operationId: string,
  projectMemberId: Doc<'projectMembers'>['_id'],
) {
  const result = await ctx.db
    .query('projectExitChannelVisibility')
    .withIndex('by_operation_member', (q) =>
      q.eq('operationId', operationId).eq('projectMemberId', projectMemberId),
    )
    .take(archiveProjectionLimit + 1);
  return result.length <= archiveProjectionLimit ? result.map((row) => row.groupId) : [];
}

async function boundedTaskRows(
  ctx: MutationCtx,
  operationId: string,
  projectCompanyId: Doc<'projectCompanies'>['_id'],
) {
  const result = await ctx.db
    .query('taskExitSnapshotStaging')
    .withIndex('by_project_company_operation', (q) =>
      q.eq('projectCompanyId', projectCompanyId).eq('operationId', operationId),
    )
    .take(archiveProjectionLimit + 1);
  return result.length <= archiveProjectionLimit ? result : [];
}

// Legacy records created before operation-backed capture keep their immutable arrays.
// New exits always use finalizeBatch below.
export async function finalizeLegacyExit(
  ctx: MutationCtx,
  actor: Awaited<ReturnType<typeof requireAuthenticatedActor>>,
  company: Doc<'companies'>,
  project: Doc<'projects'>,
  participation: Doc<'projectCompanies'>,
  operation: Doc<'projectExitOperations'>,
) {
  const cutoff = participation.exitCutoff;
  if (!cutoff || !participation.exitOperationId) throw new Error('exit_snapshot_not_verified');
  const projectMembers = await ctx.db
    .query('projectMembers')
    .withIndex('by_project_company_status', (q) =>
      q
        .eq('projectId', project._id)
        .eq('companyId', company._id)
        .eq('status', 'active'),
    )
    .collect();
  const memberRows = await boundedExitRows(ctx, operation.operationId, 'member');
  const channelRows = await boundedExitRows(ctx, operation.operationId, 'channel');
  const taskRows = await boundedTaskRows(ctx, operation.operationId, participation._id);
  const projectSnapshot = decodeExitProjectSnapshot(ctx, participation.exitProjectSnapshot) ?? {};
  const memberSnapshots = memberRows.length > 0
    ? memberRows.flatMap((row) => row.payload.kind === 'member' ? [row.payload.snapshot] : [])
    : undefined;
  const channelSnapshots = channelRows.flatMap((row) => row.payload.kind === 'channel' ? [row.payload.snapshot] : []);
  const now = Date.now();
  for (const projectMember of projectMembers) {
    const entitlementRows = await ctx.db
      .query('projectArchiveEntitlements')
      .withIndex('by_member', (q) => q.eq('projectMemberId', projectMember._id))
      .collect();
    const entitlement = entitlementRows.find(
      (row) => row.snapshotOperationId === operation.operationId,
    );
    const channelIds = await boundedChannelIds(ctx, operation.operationId, projectMember._id);
    const threadRows = await boundedThreadRows(ctx, operation.operationId, projectMember._id);
    const threadSnapshots = threadRows.length > 0
      ? threadRows.flatMap((row) => row.payload.kind === 'thread' ? [row.payload.snapshot] : [])
      : undefined;
    const entitlementId = entitlement?._id ?? await ctx.db.insert('projectArchiveEntitlements', {
      projectId: project._id,
      projectCompanyId: participation._id,
      companyId: company._id,
      projectMemberId: projectMember._id,
      exitAt: cutoff,
      owningCompanyId: participation.exitOwningCompanyId,
      owningCompanyDisplayName: participation.exitOwningCompanyDisplayName,
      channelIds,
      projectSnapshot,
      channelSnapshots,
      threadSnapshots,
      memberSnapshots,
      retentionStatus: 'active',
      manifestHash: participation.memorySnapshotManifestHash ?? operation.operationId,
      snapshotOperationId: operation.operationId,
      visibilityStatus: 'staging',
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(entitlementId, {
      exitAt: cutoff,
      owningCompanyId: participation.exitOwningCompanyId,
      owningCompanyDisplayName: participation.exitOwningCompanyDisplayName,
      channelIds,
      projectSnapshot,
      channelSnapshots,
      threadSnapshots,
      memberSnapshots,
      retentionStatus: 'active',
      manifestHash: participation.memorySnapshotManifestHash ?? operation.operationId,
      snapshotOperationId: operation.operationId,
      visibilityStatus: 'active',
      updatedAt: now,
    });
    if (taskRows.length > 0 && taskRows.length <= archiveProjectionLimit) {
      await materializeTaskArchiveSnapshots(ctx, {
        entitlementId,
        projectCompanyId: participation._id,
        projectId: project._id,
        channelIds,
        operationId: operation.operationId,
      });
    }
    const channelMemberships = await ctx.db
      .query('groupMembers')
      .withIndex('by_project_member_status', (q) =>
        q.eq('projectMemberId', projectMember._id).eq('status', 'active'),
      )
      .collect();
    await Promise.all(
      channelMemberships.map((membership) =>
        ctx.db.patch(membership._id, {
          status: 'archived',
          endedAt: now,
          updatedAt: now,
        }),
      ),
    );
    await ctx.db.patch(projectMember._id, {
      status: 'archived',
      endedAt: now,
      updatedAt: now,
    });
  }
  await ctx.db.patch(participation._id, {
    status: 'exited',
    exitedBy: actor.userId,
    exitedAt: now,
    exitSnapshotStatus: 'verified',
    exitSnapshotPhase: 'complete',
    updatedAt: now,
  });
  await ctx.db.patch(operation._id, {
    phase: 'complete',
    updatedAt: now,
  });
  await bumpProjectParticipants(ctx, project._id, now);
  const remaining = await ctx.db
    .query('projectCompanies')
    .withIndex('by_project_status', (q) =>
      q.eq('projectId', project._id).eq('status', 'active'),
    )
    .collect();
  if (remaining.length === 0) {
    await ctx.db.patch(project._id, {
      status: 'archived',
      archiveReason: 'no_active_participants',
      archivedAt: now,
      revision: (project.revision ?? 0) + 1,
      updatedAt: now,
    });
    await revokePendingProjectInvitations(ctx, project._id, now);
  }
  return participation._id;
}

export const finalize = mutation({
  args: { actingCompanyId: v.id("companies"), projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx);
    const { company } = await requireCompanyAdmin(
      ctx,
      actor,
      args.actingCompanyId,
    );
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("project_unavailable");
    const participations = await ctx.db
      .query("projectCompanies")
      .withIndex("by_project_status", (q) =>
        q.eq("projectId", project._id).eq("status", "exit_pending"),
      )
      .collect();
    const participation = participations.find(
      (term) => term.companyId === company._id,
    );
    if (!participation) throw new Error("exit_not_pending");
    if (project.owningCompanyId === company._id) {
      const activeParticipants = await ctx.db
        .query("projectCompanies")
        .withIndex("by_project_status", (q) =>
          q.eq("projectId", project._id).eq("status", "active"),
        )
        .collect();
      if (activeParticipants.length > 0) {
        throw new Error("project_ownership_transfer_required");
      }
    }
    const operationId = participation.exitOperationId;
    if (operationId) {
      const operation = await ctx.db
        .query("projectExitOperations")
        .withIndex("by_project_company_operation", (q) =>
          q
            .eq("projectCompanyId", participation._id)
            .eq("operationId", operationId),
        )
        .unique();
      if (operation?.status === "verified") {
        const now = Date.now();
        await ctx.db.patch(operation._id, {
          status: "capturing",
          phase: "complete",
          cursor: undefined,
          updatedAt: now,
        });
        await ctx.db.patch(participation._id, {
          exitSnapshotStatus: "capturing",
          exitSnapshotPhase: "complete",
          exitSnapshotError: undefined,
          updatedAt: now,
        });
        await ctx.scheduler.runAfter(0, internal.projectExit.finalizeBatch, {
          projectCompanyId: participation._id,
          operationId,
          cursor: undefined,
          exitedBy: actor.userId,
        });
        return participation._id;
      }
      throw new Error("exit_snapshot_not_verified");
    }
    if (
      participation.memorySnapshotStatus !== "verified" ||
      !participation.memorySnapshotManifestHash ||
      !participation.memorySnapshotManifest ||
      !participation.exitCutoff ||
      !participation.exitProjectSnapshot ||
      !participation.exitChannelSnapshots ||
      !participation.exitMemberSnapshots
    )
      throw new Error("exit_snapshot_not_verified");

    const projectMembers = await ctx.db
      .query("projectMembers")
      .withIndex("by_project_company_status", (q) =>
        q
          .eq("projectId", project._id)
          .eq("companyId", company._id)
          .eq("status", "active"),
      )
      .collect();
    const now = Date.now();
    for (const projectMember of projectMembers) {
      const channelMemberships = await ctx.db
        .query("groupMembers")
        .withIndex("by_project_member_status", (q) =>
          q.eq("projectMemberId", projectMember._id).eq("status", "active"),
        )
        .collect();
      const channelIds = channelMemberships.map(
        (membership) => membership.groupId,
      );
      const threads = (
        await Promise.all(
          channelIds.map(async (groupId) => [
            ...(await ctx.db
              .query("channelThreads")
              .withIndex("by_group_status_updated_at", (q) =>
                q.eq("groupId", groupId).eq("status", "active"),
              )
              .collect()),
            ...(await ctx.db
              .query("channelThreads")
              .withIndex("by_group_status_updated_at", (q) =>
                q.eq("groupId", groupId).eq("status", "archived"),
              )
              .collect()),
          ]),
        )
      ).flat();
      const threadSnapshots = await Promise.all(
        threads
          .filter((thread) => thread.createdAt <= participation.exitCutoff!)
          .map(async (thread) => {
            const [sourceMessage, follower, readState, cutoffState, messages] = await Promise.all([
              thread.sourceMessageId ? ctx.db.get(thread.sourceMessageId) : null,
              ctx.db
                .query("channelThreadFollowers")
                .withIndex("by_thread_project_member", (q) =>
                  q
                    .eq("channelThreadId", thread._id)
                    .eq("projectMemberId", projectMember._id),
                )
                .unique(),
              ctx.db
                .query("channelThreadReadStates")
                .withIndex("by_thread_project_member", (q) =>
                  q
                    .eq("channelThreadId", thread._id)
                    .eq("projectMemberId", projectMember._id),
                )
                .unique(),
              threadStateAtCutoff(ctx, thread, participation.exitCutoff!),
              ctx.db
                .query("messages")
                .withIndex("by_thread_created_at", (q) =>
                  q
                    .eq("channelThreadId", thread._id)
                    .lte("createdAt", participation.exitCutoff!),
                )
                .collect(),
            ]);
            const latestMessage = messages.reduce<Doc<"messages"> | null>(
              (latest, message) =>
                !latest || message.createdAt > latest.createdAt ? message : latest,
              null,
            );
            return {
              _id: thread._id,
              createdAt: thread.createdAt,
              groupId: thread.groupId,
              name: cutoffState.name,
              status: cutoffState.status,
              revision: cutoffState.revision,
              sourceAvailable: Boolean(
                sourceMessage &&
                  sourceMessage.createdAt <= participation.exitCutoff!,
              ),
              following: follower?.preference === "following",
              lastReadChannelSequence:
                readState?.lastReadChannelSequence ?? 0,
              replyCount: messages.length,
              latestReplyAt: latestMessage?.createdAt,
              latestChannelSequence: latestMessage?.channelSequence ?? 0,
            };
          }),
      );
      const entitlementId = await ctx.db.insert("projectArchiveEntitlements", {
        projectId: project._id,
        projectCompanyId: participation._id,
        companyId: company._id,
        projectMemberId: projectMember._id,
        exitAt: participation.exitCutoff,
        owningCompanyId: participation.exitOwningCompanyId,
        owningCompanyDisplayName: participation.exitOwningCompanyDisplayName,
        channelIds,
        projectSnapshot: participation.exitProjectSnapshot,
        channelSnapshots: participation.exitChannelSnapshots.filter(
          (group: { _id: Doc<"groups">["_id"] }) =>
            channelIds.includes(group._id),
        ),
        threadSnapshots,
        memberSnapshots: participation.exitMemberSnapshots,
        retentionStatus: "active",
        manifestHash: participation.memorySnapshotManifestHash,
        createdAt: now,
        updatedAt: now,
      });
      await materializeTaskArchiveSnapshots(ctx, {
        entitlementId,
        projectCompanyId: participation._id,
        projectId: project._id,
        channelIds,
      });
      const manifest = participation.memorySnapshotManifest as {
        sources?: Array<{
          scope: "project" | "channel";
          groupId?: string;
          sourceKind: string;
          sourceIdentifier: string;
          sourceRevision?: number;
          contentHash: string;
          contentLength: number;
          snapshotIdentifier: string;
        }>;
      };
      for (const source of manifest.sources ?? []) {
        if (
          source.scope === "channel" &&
          (!source.groupId || !channelIds.map(String).includes(source.groupId))
        )
          continue;
        await ctx.db.insert("projectArchiveSnapshots", {
          entitlementId,
          scope: source.scope,
          ...(source.groupId ? { groupId: source.groupId as never } : {}),
          sourceKind: source.sourceKind,
          sourceIdentifier: source.sourceIdentifier,
          sourceRevision: source.sourceRevision,
          contentHash: source.contentHash,
          contentLength: source.contentLength,
          snapshotIdentifier: source.snapshotIdentifier,
          createdAt: now,
        });
      }
      await Promise.all(
        channelMemberships.map((membership) =>
          ctx.db.patch(membership._id, {
            status: "archived",
            endedAt: now,
            updatedAt: now,
          }),
        ),
      );
      await ctx.db.patch(projectMember._id, {
        status: "archived",
        endedAt: now,
        updatedAt: now,
      });
    }
    await ctx.db.patch(participation._id, {
      status: "exited",
      exitedBy: actor.userId,
      exitedAt: now,
      updatedAt: now,
    });
    await clearTaskExitStaging(ctx, participation._id);
    await bumpProjectParticipants(ctx, project._id, now);
    const remaining = await ctx.db
      .query("projectCompanies")
      .withIndex("by_project_status", (q) =>
        q.eq("projectId", project._id).eq("status", "active"),
      )
      .collect();
    if (remaining.length === 0) {
      await ctx.db.patch(project._id, {
        status: "archived",
        archiveReason: "no_active_participants",
        archivedAt: now,
        revision: (project.revision ?? 0) + 1,
        updatedAt: now,
      });
      await revokePendingProjectInvitations(ctx, project._id, now);
    }
    return participation._id;
  },
});

export const finalizeBatch = internalMutation({
  args: {
    projectCompanyId: v.id("projectCompanies"),
    operationId: v.string(),
    cursor: v.optional(v.string()),
    exitedBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const participation = await ctx.db.get(args.projectCompanyId);
    if (
      !participation ||
      participation.status !== "exit_pending" ||
      participation.exitOperationId !== args.operationId
    ) return;
    const operation = await ctx.db
      .query("projectExitOperations")
      .withIndex("by_project_company_operation", (q) =>
        q
          .eq("projectCompanyId", args.projectCompanyId)
          .eq("operationId", args.operationId),
      )
      .unique();
    if (!operation || operation.status !== "capturing" || operation.phase !== "complete") return;
    try {
      const members = await ctx.db
        .query("projectMembers")
        .withIndex("by_project_company_status", (q) =>
          q
            .eq("projectId", participation.projectId)
            .eq("companyId", participation.companyId)
            .eq("status", "active"),
        )
        .paginate({ cursor: args.cursor ?? null, numItems: 25 });
      const now = Date.now();
      for (const member of members.page) {
        const entitlement = await ctx.db
          .query("projectArchiveEntitlements")
          .withIndex("by_member_operation", (q) =>
            q
              .eq("projectMemberId", member._id)
              .eq("snapshotOperationId", args.operationId),
          )
          .unique();
        if (!entitlement) throw new Error("exit_archive_entitlement_missing");
        await ctx.db.patch(entitlement._id, {
          manifestHash:
            participation.memorySnapshotManifestHash ?? args.operationId,
          visibilityStatus: "active",
          updatedAt: now,
        });
        await ctx.db.patch(member._id, {
          status: "archived",
          endedAt: now,
          updatedAt: now,
        });
      }
      if (!members.isDone) {
        await ctx.db.patch(operation._id, {
          cursor: members.continueCursor,
          updatedAt: now,
        });
        await ctx.scheduler.runAfter(0, internal.projectExit.finalizeBatch, {
          projectCompanyId: args.projectCompanyId,
          operationId: args.operationId,
          cursor: members.continueCursor,
          exitedBy: args.exitedBy,
        });
        return;
      }
      const project = await ctx.db.get(participation.projectId);
      if (!project) throw new Error("project_unavailable");
      await ctx.db.patch(participation._id, {
        status: "exited",
        exitedBy: args.exitedBy,
        exitedAt: now,
        exitSnapshotStatus: "verified",
        exitSnapshotPhase: "complete",
        exitSnapshotError: undefined,
        updatedAt: now,
      });
      await ctx.db.patch(operation._id, {
        status: "verified",
        phase: "complete",
        cursor: undefined,
        error: undefined,
        updatedAt: now,
      });
      await bumpProjectParticipants(ctx, project._id, now);
      const remaining = await ctx.db
        .query("projectCompanies")
        .withIndex("by_project_status", (q) =>
          q.eq("projectId", project._id).eq("status", "active"),
        )
        .first();
      if (!remaining) {
        await ctx.db.patch(project._id, {
          status: "archived",
          archiveReason: "no_active_participants",
          archivedAt: now,
          revision: (project.revision ?? 0) + 1,
          updatedAt: now,
        });
        await ctx.scheduler.runAfter(
          0,
          internal.projectExit.revokePendingInvitationsBatch,
          { projectId: project._id, cursor: undefined },
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "exit_finalize_failed";
      const now = Date.now();
      await ctx.db.patch(operation._id, {
        status: "failed",
        error: message.slice(0, 500),
        updatedAt: now,
      });
      await ctx.db.patch(participation._id, {
        exitSnapshotStatus: "failed",
        exitSnapshotError: message.slice(0, 500),
        updatedAt: now,
      });
    }
  },
});

export const revokePendingInvitationsBatch = internalMutation({
  args: {
    projectId: v.id("projects"),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project || project.status !== "archived") return;
    const invitations = await ctx.db
      .query("projectCompanyInvitations")
      .withIndex("by_project_status", (q) =>
        q.eq("projectId", args.projectId).eq("status", "pending"),
      )
      .paginate({ cursor: args.cursor ?? null, numItems: 50 });
    const now = Date.now();
    for (const invitation of invitations.page) {
      await ctx.db.patch(invitation._id, {
        status: "revoked",
        updatedAt: now,
      });
    }
    if (!invitations.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.projectExit.revokePendingInvitationsBatch,
        {
          projectId: args.projectId,
          cursor: invitations.continueCursor,
        },
      );
    }
  },
});

export const getStatus = query({
  args: {
    actingCompanyId: v.id("companies"),
    projectId: v.id("projects"),
    projectMemberId: v.optional(v.id("projectMembers")),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx);
    if (args.projectMemberId) {
      await requireActiveCompanyMembership(ctx, actor, args.actingCompanyId);
      const membership = await ctx.db.get(args.projectMemberId);
      if (
        !membership ||
        membership.userId !== actor.userId ||
        membership.companyId !== args.actingCompanyId ||
        membership.projectId !== args.projectId
      ) throw new Error("project_unavailable");
    } else {
      await requireCompanyAdmin(ctx, actor, args.actingCompanyId);
    }
    const terms = await ctx.db
      .query("projectCompanies")
      .withIndex("by_project_company_term", (q) =>
        q.eq("projectId", args.projectId).eq("companyId", args.actingCompanyId),
      )
      .collect();
    const term = terms.slice().sort((a, b) => b.term - a.term)[0];
    return term
      ? {
          status: term.status,
          snapshotStatus: term.exitSnapshotStatus ?? term.memorySnapshotStatus,
          snapshotError: term.exitSnapshotError ?? term.memorySnapshotError,
        }
      : null;
  },
});

export const getSnapshotInput = internalQuery({
  args: {
    projectCompanyId: v.id("projectCompanies"),
    operationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const participation = await ctx.db.get(args.projectCompanyId);
    if (
      !participation ||
      participation.status !== "exit_pending" ||
      !participation.exitCutoff ||
      (args.operationId && participation.exitOperationId !== args.operationId)
    )
      return null;
    const [project, company, memoryBox, members, imports] = await Promise.all([
      ctx.db.get(participation.projectId),
      ctx.db.get(participation.companyId),
      ctx.db
        .query("projectMemoryBoxes")
        .withIndex("by_project", (q) =>
          q.eq("projectId", participation.projectId),
        )
        .unique(),
      ctx.db
        .query("projectMembers")
        .withIndex("by_project_company_status", (q) =>
          q
            .eq("projectId", participation.projectId)
            .eq("companyId", participation.companyId)
            .eq("status", "active"),
        )
        .collect(),
      ctx.db
        .query("memoryImports")
        .withIndex("by_project_created_at", (q) =>
          q.eq("projectId", participation.projectId),
        )
        .collect(),
    ]);
    if (!project || !company) return null;
    const memberships = (
      await Promise.all(
        members.map(
          async (member) =>
            await ctx.db
              .query("groupMembers")
              .withIndex("by_project_member_status", (q) =>
                q.eq("projectMemberId", member._id).eq("status", "active"),
              )
              .collect(),
        ),
      )
    ).flat();
    const channelIds = Array.from(
      new Set(memberships.map((membership) => membership.groupId)),
    );
    return {
      participation,
      project,
      company,
      memoryBox,
      channelIds,
      imports: imports.filter(
        (item) =>
          item.status === "completed" &&
          item.completedAt !== undefined &&
          item.completedAt <= participation.exitCutoff! &&
          ((item.scope ?? "channel") === "project" ||
            Boolean(item.groupId && channelIds.includes(item.groupId))),
      ),
    };
  },
});

export const captureBatch = internalMutation({
  args: {
    projectCompanyId: v.id("projectCompanies"),
    operationId: v.string(),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const participation = await ctx.db.get(args.projectCompanyId);
    if (
      !participation ||
      participation.status !== "exit_pending" ||
      participation.exitOperationId !== args.operationId
    ) return;
    const operation = await ctx.db
      .query("projectExitOperations")
      .withIndex("by_project_company_operation", (q) =>
        q
          .eq("projectCompanyId", args.projectCompanyId)
          .eq("operationId", args.operationId),
      )
      .unique();
    if (!operation || operation.status !== "capturing") return;
    try {
      const result = await captureExitBatch(ctx, {
        projectCompanyId: args.projectCompanyId,
        projectId: participation.projectId,
        operationId: args.operationId,
        cutoff: operation.cutoff,
        cursor: args.cursor ?? operation.cursor,
      });
      const now = Date.now();
      const nextCursor = result.cursor ?? undefined;
      await ctx.db.patch(operation._id, {
        phase: result.phase,
        cursor: nextCursor,
        stagedCount: operation.stagedCount + result.stagedCount,
        updatedAt: now,
      });
      await ctx.db.patch(participation._id, {
        exitSnapshotPhase: result.phase,
        exitSnapshotStatus: "capturing",
        exitSnapshotError: undefined,
        updatedAt: now,
      });
      if (result.phase === "memory") {
        await ctx.scheduler.runAfter(0, internal.projectExitActions.snapshot, {
          projectCompanyId: args.projectCompanyId,
          operationId: args.operationId,
        });
      } else {
        await ctx.scheduler.runAfter(0, internal.projectExit.captureBatch, {
          projectCompanyId: args.projectCompanyId,
          operationId: args.operationId,
          cursor: nextCursor,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "snapshot_capture_failed";
      const now = Date.now();
      await ctx.db.patch(operation._id, {
        status: "failed",
        error: message.slice(0, 500),
        updatedAt: now,
      });
      await ctx.db.patch(participation._id, {
        exitSnapshotStatus: "failed",
        exitSnapshotError: message.slice(0, 500),
        updatedAt: now,
      });
    }
  },
});

type CleanupCursor =
  | { source: "snapshots" | "visibility" | "tasks" | "entitlements"; cursor: string | null }

function isCleanupCursor(value: unknown): value is CleanupCursor {
  if (typeof value !== "object" || value === null || !('source' in value) || !('cursor' in value)) return false;
  const source = value.source;
  const cursor = value.cursor;
  return (
    (source === "snapshots" || source === "visibility" || source === "tasks" || source === "entitlements") &&
    (cursor === null || typeof cursor === "string")
  );
}

function decodeCleanupCursor(value: string | undefined): CleanupCursor {
  if (!value) return { source: "snapshots", cursor: null };
  try {
    const parsed: unknown = JSON.parse(value);
    if (isCleanupCursor(parsed)) return parsed;
  } catch {
    return { source: "snapshots", cursor: null };
  }
  return { source: "snapshots", cursor: null };
}

export const cleanupCapture = internalMutation({
  args: {
    projectCompanyId: v.id("projectCompanies"),
    operationId: v.string(),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const state = decodeCleanupCursor(args.cursor);
    if (state.source === "snapshots") {
      const result = await ctx.db
        .query("projectExitSnapshotStaging")
        .withIndex("by_operation", (q) => q.eq("operationId", args.operationId))
        .paginate({ cursor: state.cursor, numItems: 100 });
      for (const row of result.page) await ctx.db.delete(row._id);
      const next = result.isDone
        ? JSON.stringify({ source: "visibility", cursor: null })
        : JSON.stringify({ source: "snapshots", cursor: result.continueCursor });
      await ctx.scheduler.runAfter(0, internal.projectExit.cleanupCapture, {
        projectCompanyId: args.projectCompanyId,
        operationId: args.operationId,
        cursor: next,
      });
      return;
    }
    if (state.source === "visibility") {
      const result = await ctx.db
        .query("projectExitChannelVisibility")
        .withIndex("by_project_company_operation", (q) =>
          q
            .eq("projectCompanyId", args.projectCompanyId)
            .eq("operationId", args.operationId),
        )
        .paginate({ cursor: state.cursor, numItems: 100 });
      for (const row of result.page) await ctx.db.delete(row._id);
      const next = result.isDone
        ? JSON.stringify({ source: "tasks", cursor: null })
        : JSON.stringify({ source: "visibility", cursor: result.continueCursor });
      await ctx.scheduler.runAfter(0, internal.projectExit.cleanupCapture, {
        projectCompanyId: args.projectCompanyId,
        operationId: args.operationId,
        cursor: next,
      });
      return;
    }
    if (state.source === "tasks") {
      const result = await clearTaskExitStagingBatch(ctx, {
        projectCompanyId: args.projectCompanyId,
        operationId: args.operationId,
        cursor: state.cursor,
      });
      const next = result.done
        ? JSON.stringify({ source: "entitlements", cursor: null })
        : JSON.stringify({ source: "tasks", cursor: result.cursor });
      await ctx.scheduler.runAfter(0, internal.projectExit.cleanupCapture, {
        projectCompanyId: args.projectCompanyId,
        operationId: args.operationId,
        cursor: next,
      });
      return;
    }
    const result = await ctx.db
      .query("projectArchiveEntitlements")
      .withIndex("by_project_company_operation", (q) =>
        q
          .eq("projectCompanyId", args.projectCompanyId)
          .eq("snapshotOperationId", args.operationId),
      )
      .paginate({ cursor: state.cursor, numItems: 100 });
    for (const row of result.page) await ctx.db.delete(row._id);
    if (!result.isDone) {
      await ctx.scheduler.runAfter(0, internal.projectExit.cleanupCapture, {
        projectCompanyId: args.projectCompanyId,
        operationId: args.operationId,
        cursor: JSON.stringify({ source: "entitlements", cursor: result.continueCursor }),
      });
    }
  },
});

export const markSnapshotCleaned = internalMutation({
  args: {
    projectCompanyId: v.id("projectCompanies"),
    snapshotPath: v.string(),
  },
  handler: async (ctx, args) => {
    const participation = await ctx.db.get(args.projectCompanyId);
    if (
      !participation ||
      participation.memorySnapshotPath !== args.snapshotPath ||
      participation.status !== "active"
    )
      return;
    await ctx.db.patch(participation._id, {
      memorySnapshotError: undefined,
      memorySnapshotPath: undefined,
      exitMemoryBoxId: undefined,
      updatedAt: Date.now(),
    });
  },
});

export const markSnapshotCleanupFailed = internalMutation({
  args: {
    projectCompanyId: v.id("projectCompanies"),
    snapshotPath: v.string(),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const participation = await ctx.db.get(args.projectCompanyId);
    if (
      !participation ||
      participation.status !== "active" ||
      participation.memorySnapshotPath !== args.snapshotPath
    )
      return;
    await ctx.db.patch(participation._id, {
      memorySnapshotError: `snapshot_cleanup_failed:${args.error.slice(0, 400)}`,
      updatedAt: Date.now(),
    });
  },
});

export const markSnapshotVerified = internalMutation({
  args: {
    projectCompanyId: v.id("projectCompanies"),
    manifestHash: v.string(),
    manifest: v.any(),
    snapshotPath: v.string(),
    snapshotBoxId: v.optional(v.string()),
    operationId: v.string(),
  },
  handler: async (ctx, args) => {
    const participation = await ctx.db.get(args.projectCompanyId);
    if (
      !participation ||
      participation.status !== "exit_pending" ||
      participation.exitOperationId !== args.operationId
    ) {
      await ctx.scheduler.runAfter(
        0,
        internal.projectExitActions.cleanupSnapshot,
        {
          projectCompanyId: args.projectCompanyId,
          snapshotPath: args.snapshotPath,
          boxId: args.snapshotBoxId,
        },
      );
      return;
    }
    const operation = await ctx.db
      .query("projectExitOperations")
      .withIndex("by_project_company_operation", (q) =>
        q
          .eq("projectCompanyId", participation._id)
          .eq("operationId", args.operationId),
      )
      .unique();
    if (!operation || operation.status !== "capturing" || operation.phase !== "memory") {
      await ctx.scheduler.runAfter(0, internal.projectExitActions.cleanupSnapshot, {
        projectCompanyId: participation._id,
        snapshotPath: args.snapshotPath,
        boxId: args.snapshotBoxId,
      });
      return;
    }
    await ctx.db.patch(participation._id, {
      memorySnapshotStatus: "verified",
      memorySnapshotManifestHash: args.manifestHash,
      memorySnapshotManifest: args.manifest,
      memorySnapshotPath: args.snapshotPath,
      memorySnapshotError: undefined,
      exitSnapshotStatus: "verified",
      exitSnapshotPhase: "complete",
      exitSnapshotError: undefined,
      updatedAt: Date.now(),
    });
    await ctx.db.patch(operation._id, {
      status: "verified",
      phase: "complete",
      cursor: undefined,
      error: undefined,
      verifiedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const markSnapshotFailed = internalMutation({
  args: {
    projectCompanyId: v.id("projectCompanies"),
    operationId: v.string(),
    snapshotPath: v.string(),
    snapshotBoxId: v.optional(v.string()),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const participation = await ctx.db.get(args.projectCompanyId);
    if (
      !participation ||
      participation.status !== "exit_pending" ||
      participation.exitOperationId !== args.operationId
    ) {
      await ctx.scheduler.runAfter(
        0,
        internal.projectExitActions.cleanupSnapshot,
        {
          projectCompanyId: args.projectCompanyId,
          snapshotPath: args.snapshotPath,
          boxId: args.snapshotBoxId,
        },
      );
      return;
    }
    const operation = await ctx.db
      .query("projectExitOperations")
      .withIndex("by_project_company_operation", (q) =>
        q
          .eq("projectCompanyId", participation._id)
          .eq("operationId", args.operationId),
      )
      .unique();
    if (!operation) {
      await ctx.scheduler.runAfter(0, internal.projectExitActions.cleanupSnapshot, {
        projectCompanyId: participation._id,
        snapshotPath: args.snapshotPath,
        boxId: args.snapshotBoxId,
      });
      return;
    }
    await ctx.db.patch(participation._id, {
      memorySnapshotStatus: "failed",
      memorySnapshotError: args.error.slice(0, 500),
      exitSnapshotStatus: "failed",
      exitSnapshotPhase: operation.phase,
      exitSnapshotError: args.error.slice(0, 500),
      updatedAt: Date.now(),
    });
    await ctx.db.patch(operation._id, {
      status: "failed",
      error: args.error.slice(0, 500),
      updatedAt: Date.now(),
    });
  },
});
