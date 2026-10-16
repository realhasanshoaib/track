import { Link } from "@tanstack/react-router";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import TrackLoader from "#/components/TrackLoader";
import { useReleaseConfigState } from "#/lib/release-config";
import type { ConversationComposerReply } from "#/features/workspace/components/ConversationComposer";
import type { GroupMessageItem } from "#/features/workspace/thread-items";
import { CompanyProjectAdministration } from "./CompanyProjectAdministration";
import { CompanyProjectConversation } from "./CompanyProjectConversation";
import { CompanyProjectNavigation } from "./CompanyProjectNavigation";
import { formatCompanyError } from "./company-errors";
import {
  getCompanyProjectScopeKey,
  getMessageIdFromHash,
} from "./company-project-context";
import { resolveActiveActingCompanyId } from "./company-query-scope";

type Props = {
  actingCompanyId: Id<"companies">;
  initialGroupId?: Id<"groups">;
  projectId: Id<"projects">;
  projectMemberId: Id<"projectMembers">;
};

export function CompanyProjectPage({
  actingCompanyId,
  initialGroupId,
  projectId,
  projectMemberId,
}: Props) {
  const releaseState = useReleaseConfigState();
  const releaseConfig = releaseState.config;
  const currentUser = useQuery(api.auth.getCurrentUser);
  const companies = useQuery(
    api.companies.listMine,
    releaseConfig.companyModel ? {} : "skip",
  );
  const actingCompany = companies?.find(
    (candidate) => candidate.company?._id === actingCompanyId,
  );
  const activeActingCompanyId = resolveActiveActingCompanyId(
    companies,
    actingCompanyId,
  );
  const projects = useQuery(
    api.sharedProjects.listForActingCompany,
    releaseConfig.companyModel && activeActingCompanyId
      ? { actingCompanyId: activeActingCompanyId }
      : "skip",
  );
  const item = projects?.find(
    (candidate) =>
      candidate.project._id === projectId &&
      candidate.membership._id === projectMemberId,
  );
  const snapshotState = useQuery(
    api.projects.getSnapshotState,
    activeActingCompanyId && item
      ? {
          actingCompanyId: activeActingCompanyId,
          projectId,
          projectMemberId,
        }
      : "skip",
  );
  const exitStatus = useQuery(
    api.projectExit.getStatus,
    releaseConfig.companyModel && activeActingCompanyId
      ? {
          actingCompanyId: activeActingCompanyId,
          projectId,
          projectMemberId,
        }
      : "skip",
  );
  const canReadChannels = exitStatus !== null && exitStatus !== undefined;
  const canManageActiveProject =
    exitStatus?.status === "active" &&
    item?.membership.role === "manager" &&
    item.membership.status === "active";
  const channels = useQuery(
    api.channels.list,
    activeActingCompanyId && canReadChannels
      ? { actingCompanyId: activeActingCompanyId, projectId, projectMemberId }
      : "skip",
  );
  const projectMembers = useQuery(
    api.sharedProjects.listMembers,
    activeActingCompanyId && canManageActiveProject
      ? { actingCompanyId: activeActingCompanyId, projectId, projectMemberId }
      : "skip",
  );
  const companyMembers = useQuery(
    api.companies.getAdministration,
    activeActingCompanyId && item?.membership.status === "active"
      ? { companyId: activeActingCompanyId }
      : "skip",
  );
  const canManageExit =
    item?.membership.status === "active" &&
    (companyMembers?.membership.role === "owner" ||
      companyMembers?.membership.role === "admin");
  const canConfirmProjectOwnership =
    canManageActiveProject &&
    (companyMembers?.membership.role === "owner" ||
      companyMembers?.membership.role === "admin");
  const canInvitePartnerCompanies =
    canManageActiveProject &&
    item?.participationRole === "owner" &&
    (item.project.status === "active" || item.project.status === "proposed");
  const collaborationOptions = useQuery(
    api.sharedProjects.getCollaborationOptions,
    activeActingCompanyId && canInvitePartnerCompanies
      ? { actingCompanyId: activeActingCompanyId, projectId, projectMemberId }
      : "skip",
  );
  const pendingProjectArchives = useQuery(
    api.projectArchives.listPending,
    activeActingCompanyId && canManageActiveProject
      ? { actingCompanyId: activeActingCompanyId, projectId, projectMemberId }
      : "skip",
  );
  const channelParticipationInvitations = useQuery(
    api.channels.listParticipationInvitations,
    activeActingCompanyId && canManageActiveProject
      ? { actingCompanyId: activeActingCompanyId, projectId, projectMemberId }
      : "skip",
  );
  const [activeChannelId, setActiveChannelId] = useState<Id<"groups"> | null>(
    initialGroupId ?? null,
  );
  const [channelName, setChannelName] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [replyToMessageByScope, setReplyToMessageByScope] = useState<
    Map<string, ConversationComposerReply>
  >(() => new Map());
  const targetMessageId =
    typeof window === "undefined"
      ? undefined
      : getMessageIdFromHash(window.location.hash);
  const readableActiveChannelId =
    activeActingCompanyId &&
    canReadChannels &&
    activeActingCompanyId &&
    activeChannelId &&
    channels?.some(
      (entry) =>
        ("channel" in entry ? entry.channel._id : entry._id) ===
        activeChannelId,
    )
      ? activeChannelId
      : null;
  const {
    results: pagedMessages,
    status: messagePageStatus,
    loadMore: loadMoreMessages,
  } = usePaginatedQuery(
    api.messages.listPage,
    activeActingCompanyId && readableActiveChannelId && currentUser
      ? {
          actingCompanyId: activeActingCompanyId,
          groupId: readableActiveChannelId,
          projectMemberId,
          targetMessageId,
          userId: currentUser._id,
        }
      : "skip",
    { initialNumItems: 50 },
  );
  const messages = useMemo(() => {
    const uniqueMessages = new Map<Id<"messages">, GroupMessageItem>();
    for (const message of pagedMessages) {
      uniqueMessages.set(message.message._id, message);
    }
    return [...uniqueMessages.values()];
  }, [pagedMessages]);
  const threadUnread = useQuery(
    api.channelThreads.listGroupUnread,
    releaseConfig.threads && currentUser && activeActingCompanyId && canReadChannels
      ? {
          actingCompanyId: activeActingCompanyId,
          projectId,
          projectMemberId,
          userId: currentUser._id,
        }
      : "skip",
  );
  const threadUnreadByChannel = useMemo(
    () =>
      new Map(
        (threadUnread ?? []).map((entry) => [entry.groupId, entry.unreadCount]),
      ),
    [threadUnread],
  );
  const createChannel = useMutation(api.channels.create);
  const addProjectMember = useMutation(api.sharedProjects.addMember);
  const updateProjectMember = useMutation(api.sharedProjects.updateMember);
  const requestChannelParticipation = useMutation(
    api.channels.requestParticipation,
  );
  const decideChannelParticipation = useMutation(
    api.channels.decideParticipation,
  );
  const requestChannelArchive = useMutation(api.channels.requestArchive);
  const approveChannelArchive = useMutation(api.channels.approveArchive);
  const cancelChannelArchive = useMutation(api.channels.cancelArchive);
  const forwardMessage = useMutation(api.messages.forwardMessage);
  const deleteMessage = useMutation(api.messages.remove);
  const requestProjectArchive = useMutation(api.projectArchives.request);
  const approveProjectArchive = useMutation(api.projectArchives.approve);
  const prepareExit = useMutation(api.projectExit.prepare);
  const retryExit = useMutation(api.projectExit.retrySnapshot);
  const finalizeExit = useMutation(api.projectExit.finalize);
  const cancelExit = useMutation(api.projectExit.cancel);

  useEffect(() => {
    if (
      activeChannelId &&
      channels?.some(
        (entry) =>
          ("channel" in entry && entry.channel._id === activeChannelId) ||
          ("_id" in entry && entry._id === activeChannelId),
      )
    )
      return;
    const first = channels?.[0];
    setActiveChannelId(
      first
        ? "channel" in first
          ? first.channel._id
          : first._id
        : null,
    );
  }, [activeChannelId, channels]);
  useEffect(() => {
    if (typeof window === "undefined" || !targetMessageId || messages.length === 0)
      return;
    requestAnimationFrame(() => {
      const target = document.getElementById(`message-${targetMessageId}`);
      target?.scrollIntoView({ block: "center" });
      target?.focus({ preventScroll: true });
    });
  }, [messages, targetMessageId]);
  const channelItems = useMemo(
    () =>
      (channels ?? []).map((entry) =>
        "channel" in entry ? entry.channel : entry,
      ),
    [channels],
  );
  const activeChannel = channelItems.find(
    (channel) => channel._id === activeChannelId,
  );
  const projectContext = useMemo(
    () => ({ actingCompanyId, projectId, projectMemberId }),
    [actingCompanyId, projectId, projectMemberId],
  );
  const activeConversationScopeKey = getCompanyProjectScopeKey(
    projectContext,
    activeChannelId ?? undefined,
  );
  const replyToMessage =
    replyToMessageByScope.get(activeConversationScopeKey) ?? null;
  const activeChannelEntry = channels?.find(
    (entry) =>
      ("channel" in entry ? entry.channel._id : entry._id) === activeChannelId,
  );
  const isChannelSteward = Boolean(
    activeChannelEntry &&
    "membership" in activeChannelEntry &&
    activeChannelEntry.membership.isSteward,
  );
  const participationOptions = useQuery(
    api.channels.getParticipationOptions,
    activeActingCompanyId &&
      activeChannelId &&
      isChannelSteward &&
      exitStatus?.status === "active" &&
      activeChannel?.status === "active"
      ? {
          actingCompanyId: activeActingCompanyId,
          groupId: activeChannelId,
          projectId,
          projectMemberId,
        }
      : "skip",
  );
  const pendingChannelArchives = useQuery(
    api.channels.listPendingArchive,
    activeActingCompanyId && activeChannelId && isChannelSteward
      ? {
          actingCompanyId: activeActingCompanyId,
          groupId: activeChannelId,
          projectId,
          projectMemberId,
        }
      : "skip",
  );
  const readOnly =
    item?.membership.status === "archived" ||
    item?.project.status === "archived" ||
    exitStatus?.status === "exit_pending" ||
    Boolean(activeChannel && activeChannel.status !== "active");

  async function run(action: () => Promise<unknown>, actionLabel?: string) {
    setBusy(true);
    if (actionLabel) setBusyAction(actionLabel);
    setNotice(null);
    try {
      await action();
      setNotice("Saved.");
      return true;
    } catch (error) {
      setNotice(formatCompanyError(error));
      return false;
    } finally {
      setBusy(false);
      if (actionLabel) setBusyAction(null);
    }
  }

  async function deleteAuthoredMessage(messageId: Id<"messages">) {
    if (!currentUser) return false;
    return await run(
      () =>
        deleteMessage({
          actingCompanyId,
          actorId: currentUser._id,
          messageId,
          projectMemberId,
        }),
      `delete-${messageId}`,
    );
  }

  async function forwardChannelMessage(input: {
    sourceMessageId: Id<"messages">;
    targetGroupId: Id<"groups">;
    body: string;
  }) {
    if (!currentUser) return false;
    const actionLabel = `forward-${input.sourceMessageId}`;
    const request = {
      actingCompanyId,
      actorId: currentUser._id,
      body: input.body.trim() || undefined,
      idempotencyKey: crypto.randomUUID(),
      projectId,
      projectMemberId,
      sourceMessageId: input.sourceMessageId,
      targetGroupId: input.targetGroupId,
    };
    setBusy(true);
    setBusyAction(actionLabel);
    setNotice(null);
    try {
      try {
        await forwardMessage(request);
      } catch (error) {
        const audienceExpanded =
          error instanceof Error &&
          error.message.includes("audience_expansion_confirmation_required");
        if (!audienceExpanded) throw error;
        const confirmed = window.confirm(
          "This target Channel includes Project members who cannot read the source Channel. Forward a copied snapshot to the larger audience?",
        );
        if (!confirmed) return false;
        await forwardMessage({
          ...request,
          audienceExpansionConfirmed: true,
        });
      }
      setNotice("Saved.");
      return true;
    } catch (error) {
      setNotice(formatCompanyError(error));
      return false;
    } finally {
      setBusy(false);
      setBusyAction(null);
    }
  }

  function openMessageSource(groupId: Id<"groups">, messageId: Id<"messages">) {
    setActiveChannelId(groupId);
    window.history.replaceState(null, "", `#message-${messageId}`);
  }

  async function createProjectChannel() {
    await createChannel({
      actingCompanyId,
      name: channelName.trim(),
      ownCompanyMemberIds: [],
      projectId,
      projectMemberId,
    });
    setChannelName("");
  }

  async function addProjectMemberToProject(userId: Id<"users">) {
    return await addProjectMember({
      actingCompanyId,
      projectId,
      projectMemberId,
      role: "member",
      userId,
    });
  }

  async function updateProjectMemberStatus(
    targetProjectMemberId: Id<"projectMembers">,
    status: "active" | "suspended",
  ) {
    return await updateProjectMember({
      actingCompanyId,
      projectId,
      projectMemberId,
      status,
      targetProjectMemberId,
    });
  }

  async function decideProjectChannelParticipation(input: {
    decision: "accept" | "decline";
    groupId: Id<"groups">;
    requestId: Id<"channelParticipationRequests">;
    selectedProjectMemberIds: Array<Id<"projectMembers">>;
  }) {
    return await decideChannelParticipation({
      actingCompanyId,
      decision: input.decision,
      groupId: input.groupId,
      projectId,
      projectMemberId,
      requestId: input.requestId,
      selectedProjectMemberIds: input.selectedProjectMemberIds,
    });
  }

  async function requestProjectChannelParticipation(input: {
    selectedProjectMemberIds: Array<Id<"projectMembers">>;
    targetProjectCompanyId: Id<"projectCompanies">;
  }) {
    if (!activeChannelId) throw new Error("channel_unavailable");
    return await requestChannelParticipation({
      actingCompanyId,
      groupId: activeChannelId,
      idempotencyKey: crypto.randomUUID(),
      projectId,
      projectMemberId,
      selectedProjectMemberIds: input.selectedProjectMemberIds,
      targetProjectCompanyId: input.targetProjectCompanyId,
    });
  }

  async function requestProjectChannelArchive(
    operation: "archive" | "restore",
  ) {
    if (!activeChannelId) throw new Error("channel_unavailable");
    return await requestChannelArchive({
      actingCompanyId,
      groupId: activeChannelId,
      idempotencyKey: crypto.randomUUID(),
      operation,
      projectId,
      projectMemberId,
    });
  }

  async function approveProjectChannelArchive(
    requestId: Id<"channelArchiveRequests">,
  ) {
    if (!activeChannelId) throw new Error("channel_unavailable");
    return await approveChannelArchive({
      actingCompanyId,
      groupId: activeChannelId,
      projectId,
      projectMemberId,
      requestId,
    });
  }

  async function cancelProjectChannelArchive(
    requestId: Id<"channelArchiveRequests">,
  ) {
    if (!activeChannelId) throw new Error("channel_unavailable");
    return await cancelChannelArchive({
      actingCompanyId,
      groupId: activeChannelId,
      projectId,
      projectMemberId,
      requestId,
    });
  }

  async function requestProjectLifecycleArchive(operation: "archive" | "restore") {
    return await requestProjectArchive({
      actingCompanyId,
      idempotencyKey: crypto.randomUUID(),
      operation,
      projectId,
      projectMemberId,
    });
  }

  async function approveProjectLifecycleArchive(
    requestId: Id<"projectArchiveRequests">,
  ) {
    return await approveProjectArchive({
      actingCompanyId,
      projectId,
      projectMemberId,
      requestId,
    });
  }

  async function prepareProjectExit() {
    return await prepareExit({ actingCompanyId, projectId });
  }

  async function retryProjectExitSnapshot() {
    return await retryExit({ actingCompanyId, projectId });
  }

  async function finalizeProjectExit() {
    return await finalizeExit({ actingCompanyId, projectId });
  }

  async function cancelProjectExit() {
    return await cancelExit({ actingCompanyId, projectId });
  }

  if (releaseState.status === "loading")
    return <TrackLoader label="Loading Company Project" />;

  if (!releaseConfig.companyModel)
    return (
      <main className="company-hub">
        <h1>Company Project unavailable</h1>
        <p>
          This capability is currently disabled by the server release
          configuration.
        </p>
        <Link to="/workspace">Return to Projects</Link>
      </main>
    );

  if (companies === undefined)
    return <TrackLoader label="Loading Company Project" />;

  if (actingCompany?.company?.status === "suspended")
    return (
      <main className="company-hub-shell company-unified-shell">
        <CompanyProjectNavigation
          actingCompanyId={actingCompanyId}
          activeArea="company"
          tasksEnabled={releaseConfig.tasks}
        />
        <section className="company-hub">
          <header className="company-hub-header">
            <div>
              <span className="company-eyebrow">
                {actingCompany.company.displayName}
              </span>
              <h1>Company suspended</h1>
              <p>
                Project and Channel access is paused. Open the Company workspace
                to reactivate it if you are an owner.
              </p>
            </div>
            <Link className="company-header-link" to="/workspace/company">
              Open Company workspace
            </Link>
          </header>
        </section>
      </main>
    );

  if (!activeActingCompanyId)
    return (
      <main className="company-hub">
        <h1>Project unavailable</h1>
        <p>This Company representation is no longer available.</p>
        <Link to="/workspace/company">Return to Company workspace</Link>
      </main>
    );

  if (projects === undefined)
    return <TrackLoader label="Loading Company Project" />;
  if (!item)
    return (
      <main className="company-hub">
        <h1>Project unavailable</h1>
        <p>This represented membership is no longer authorized.</p>
        <Link to="/workspace/company">Return to Company hub</Link>
      </main>
    );

  if (exitStatus === null)
    return (
      <main className="company-hub">
        <h1>Project unavailable</h1>
        <p>This represented Project membership is no longer available.</p>
        <Link to="/workspace/company">Return to Company hub</Link>
      </main>
    );

  if (
    currentUser === undefined ||
    exitStatus === undefined ||
    (canReadChannels && channels === undefined)
  )
    return <TrackLoader label="Loading Company Project" />;

  if (!currentUser)
    return (
      <main className="company-hub">
        <h1>Sign in required</h1>
        <p>Sign in again to open this Company Project.</p>
        <Link to="/">Return to sign in</Link>
      </main>
    );

  return (
    <main
      aria-busy={busy}
      className="company-project-shell company-unified-shell"
    >
      <CompanyProjectConversation
        actingCompanyId={actingCompanyId}
        activeChannel={activeChannel}
        activeChannelId={activeChannelId}
        busyAction={busyAction}
        channelItems={channelItems}
        channelName={channelName}
        currentUser={currentUser}
        item={item}
        messages={messages}
        messagePageStatus={messagePageStatus}
        notice={notice}
        onBusyActionChange={setBusyAction}
        onChannelNameChange={setChannelName}
        onCreateChannel={() => run(createProjectChannel, "create-channel")}
        onDeleteMessage={deleteAuthoredMessage}
        onForwardMessage={forwardChannelMessage}
        onNotice={setNotice}
        onOpenGroup={setActiveChannelId}
        onOpenMessageSource={openMessageSource}
        onLoadMoreMessages={loadMoreMessages}
        onReplyChange={(reply) => {
          setReplyToMessageByScope((previous) => {
            const next = new Map(previous);
            if (reply) next.set(activeConversationScopeKey, reply);
            else next.delete(activeConversationScopeKey);
            return next;
          });
        }}
        onReplyMessage={(message) => {
          setReplyToMessageByScope((previous) => {
            const next = new Map(previous);
            next.set(activeConversationScopeKey, {
              authorName: message.author?.displayName ?? "Unknown Member",
              body: message.message.body || "Attachment message",
              messageId: message.message._id,
            });
            return next;
          });
        }}
        projectId={projectId}
        projectMemberId={projectMemberId}
        readOnly={readOnly}
        releaseConfig={{
          tasks: releaseConfig.tasks,
          threads: releaseConfig.threads,
        }}
        replyToMessage={replyToMessage}
        snapshotState={snapshotState}
        targetMessageId={targetMessageId}
        threadUnreadByChannel={threadUnreadByChannel}
      />
      <CompanyProjectAdministration
        actingCompanyId={actingCompanyId}
        activeChannel={activeChannel}
        activeChannelId={activeChannelId}
        canConfirmProjectOwnership={canConfirmProjectOwnership}
        canInvitePartnerCompanies={canInvitePartnerCompanies}
        channelParticipationInvitations={channelParticipationInvitations}
        collaborationOptions={collaborationOptions}
        companyMembers={companyMembers}
        exitStatus={exitStatus}
        item={item}
        isChannelSteward={isChannelSteward}
        canManageExit={canManageExit}
        participationOptions={participationOptions}
        pendingChannelArchives={pendingChannelArchives}
        pendingProjectArchives={pendingProjectArchives}
        projectId={projectId}
        projectMemberId={projectMemberId}
        projectMembers={projectMembers}
        run={run}
        onAddProjectMember={addProjectMemberToProject}
        onApproveChannelArchive={approveProjectChannelArchive}
        onApproveProjectArchive={approveProjectLifecycleArchive}
        onCancelChannelArchive={cancelProjectChannelArchive}
        onCancelExit={cancelProjectExit}
        onDecideChannelParticipation={decideProjectChannelParticipation}
        onFinalizeExit={finalizeProjectExit}
        onPrepareExit={prepareProjectExit}
        onRequestChannelArchive={requestProjectChannelArchive}
        onRequestChannelParticipation={requestProjectChannelParticipation}
        onRequestProjectArchive={requestProjectLifecycleArchive}
        onRetryExit={retryProjectExitSnapshot}
        onUpdateProjectMember={updateProjectMemberStatus}
      />
    </main>
  );
}
