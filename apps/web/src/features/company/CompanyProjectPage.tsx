import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { formatDate, formatNumber, formatTime, useLocale } from "#/i18n";
import { useReleaseConfig } from "#/lib/release-config";
import { ChannelTaskPanel, CreateTaskFromMessage, MessageInlineTasks } from "#/features/tasks/ConversationTaskActions";
import { ChannelThreadBrowser } from "#/features/threads/ChannelThreadBrowser";
import { threadHref } from "#/features/threads/thread-navigation";

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
  const { t } = useTranslation("company");
  const { locale } = useLocale();
  const releaseConfig = useReleaseConfig();
  const currentUser = useQuery(api.auth.getCurrentUser);
  const projects = useQuery(
    api.sharedProjects.listForActingCompany,
    releaseConfig.companyModel ? { actingCompanyId } : "skip",
  );
  const item = projects?.find(
    (candidate) =>
      candidate.project._id === projectId &&
      candidate.membership._id === projectMemberId,
  );
  const exitStatus = useQuery(
    api.projectExit.getStatus,
    releaseConfig.companyModel
      ? { actingCompanyId, projectId, projectMemberId }
      : "skip",
  );
  const canReadChannels =
    exitStatus != null && exitStatus.status !== "exit_pending";
  const canManageActiveProject =
    exitStatus?.status === "active" &&
    item?.membership.role === "manager" &&
    item.membership.status === "active";
  const channels = useQuery(
    api.channels.list,
    canReadChannels
      ? { actingCompanyId, projectId, projectMemberId }
      : "skip",
  );
  const projectMembers = useQuery(
    api.sharedProjects.listMembers,
    canManageActiveProject
      ? { actingCompanyId, projectId, projectMemberId }
      : "skip",
  );
  const companyMembers = useQuery(
    api.companies.getAdministration,
    canManageActiveProject
      ? { companyId: actingCompanyId }
      : "skip",
  );
  const pendingProjectArchives = useQuery(
    api.projectArchives.listPending,
    canManageActiveProject
      ? { actingCompanyId, projectId, projectMemberId }
      : "skip",
  );
  const channelParticipationInvitations = useQuery(
    api.channels.listParticipationInvitations,
    canManageActiveProject
      ? { actingCompanyId, projectId, projectMemberId }
      : "skip",
  );
  const [activeChannelId, setActiveChannelId] = useState<Id<"groups"> | null>(
    initialGroupId ?? null,
  );
  const [composer, setComposer] = useState("");
  const [channelName, setChannelName] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
    if (status === "pending") return t("statuses.pending");
    return status;
  };
  const snapshotStatusLabel = (status: string) => {
    if (status === "pending") return t("exit.snapshotPending");
    if (status === "verified") return t("exit.snapshotVerified");
    return status;
  };
  const messages = useQuery(
    api.messages.listDetailed,
    activeChannelId && currentUser
      ? {
          actingCompanyId,
          groupId: activeChannelId,
          limit: 80,
          projectMemberId,
          userId: currentUser._id,
        }
      : "skip",
  );
  const threadUnread = useQuery(
    api.channelThreads.listGroupUnread,
    releaseConfig.threads && currentUser && canReadChannels
      ? {
          actingCompanyId,
          projectId,
          projectMemberId,
          userId: currentUser._id,
        }
      : "skip",
  );
  const threadUnreadByChannel = useMemo(
    () => new Map((threadUnread ?? []).map((entry) => [entry.groupId, entry.unreadCount])),
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
  const sendMessage = useMutation(api.messages.send);
  const deleteMessage = useMutation(api.messages.remove);
  const requestProjectArchive = useMutation(api.projectArchives.request);
  const approveProjectArchive = useMutation(api.projectArchives.approve);
  const prepareExit = useMutation(api.projectExit.prepare);
  const retryExit = useMutation(api.projectExit.retrySnapshot);
  const retryExitCleanup = useMutation(api.projectExit.retryCleanup);
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
          : (first._id as Id<"groups">)
        : null,
    );
  }, [activeChannelId, channels]);
  useEffect(() => {
    if (!messages || typeof window === "undefined" || !window.location.hash.startsWith("#message-")) return;
    requestAnimationFrame(() => {
      const target = document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
      target?.scrollIntoView({ block: "center" });
      target?.focus({ preventScroll: true });
    });
  }, [messages]);

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
    activeChannelId &&
      isChannelSteward &&
      exitStatus?.status === "active" &&
      activeChannel?.status === "active"
      ? {
          actingCompanyId,
          groupId: activeChannelId,
          projectId,
          projectMemberId,
        }
      : "skip",
  );
  const pendingChannelArchives = useQuery(
    api.channels.listPendingArchive,
    activeChannelId && isChannelSteward
      ? {
          actingCompanyId,
          groupId: activeChannelId,
          projectId,
          projectMemberId,
        }
      : "skip",
  );
  const readOnly =
    item?.membership.status === "archived" ||
    item?.project.status === "archived" ||
    Boolean(activeChannel && activeChannel.status !== "active");

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setNotice(null);
    try {
      await action();
      setNotice(t("status.saved"));
      return true;
    } catch {
      setNotice(t("status.actionFailed"));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submitMessage(event: FormEvent) {
    event.preventDefault();
    if (!activeChannelId || !currentUser || !composer.trim()) return;
    const saved = await run(() =>
      sendMessage({
        actingCompanyId,
        authorId: currentUser._id,
        body: composer.trim(),
        groupId: activeChannelId,
        projectId,
        projectMemberId,
      }),
    );
    if (saved) setComposer("");
  }

  async function deleteAuthoredMessage(messageId: Id<"messages">) {
    if (!currentUser || !window.confirm(t("messages.deleteConfirm"))) return;
    await run(() =>
      deleteMessage({
        actingCompanyId,
        actorId: currentUser._id,
        messageId,
        projectMemberId,
      }),
    );
  }

  if (!releaseConfig.companyModel)
    return (
      <main className="company-hub">
        <h1>{t("project.unavailable")}</h1>
        <p>{t("availability.disabled")}</p>
        <Link to="/workspace">{t("links.returnProjects")}</Link>
      </main>
    );

  if (projects === undefined)
    return (
      <main className="company-hub">
        <p>{t("project.loading")}</p>
      </main>
    );
  if (!item)
    return (
      <main className="company-hub">
        <h1>{t("project.unavailable")}</h1>
        <p>{t("project.unauthorized")}</p>
        <Link to="/workspace/company">{t("links.returnCompany")}</Link>
      </main>
    );

  return (
    <main aria-busy={busy} className="company-project-shell">
      <aside className="company-channel-sidebar">
        <Link to="/workspace/company">← {t("links.companyHub")}</Link>
        <h1 dir="auto">{item.project.name}</h1>
        <span className="company-badge">
          <span dir="auto">{item.membership.companyDisplayNameSnapshot}</span> · {roleLabel(item.membership.role)}
        </span>
        {item.membership.status === "archived" ? (
          <p className="company-read-only">{t("project.readOnlyExitArchive")}</p>
        ) : null}
        {releaseConfig.tasks ? (
          <Link
            params={{ projectId }}
            search={{
              actingCompanyId,
              projectMemberId,
              view: "board",
            }}
            to="/workspace/projects/$projectId/tasks"
          >
            {t("project.tasks")}
          </Link>
        ) : null}
        <nav aria-label={t("channels.ariaLabel")}>
          <h2>{t("channels.heading")}</h2>
          {channelItems.map((channel) => (
            <button
              aria-current={
                channel._id === activeChannelId ? "page" : undefined
              }
              className={channel._id === activeChannelId ? "active" : ""}
              key={channel._id}
              onClick={() => setActiveChannelId(channel._id)}
              type="button"
            >
              # <span dir="auto">{channel.name}</span>
              {channel.status === "archived" ? ` · ${t("statuses.archived")}` : ""}
              {threadUnreadByChannel.get(channel._id)
                ? ` · ${t(threadUnreadByChannel.get(channel._id) === 1 ? "channels.unreadThread" : "channels.unreadThreads", { count: formatNumber(locale, threadUnreadByChannel.get(channel._id) ?? 0) })}`
                : ""}
            </button>
          ))}
        </nav>
        {item.membership.role === "manager" &&
        item.membership.status === "active" ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                await createChannel({
                  actingCompanyId,
                  name: channelName,
                  ownCompanyMemberIds: [],
                  projectId,
                  projectMemberId,
                });
                setChannelName("");
              });
            }}
          >
            <Input
              aria-label={t("channels.newName")}
              onChange={(event) => setChannelName(event.target.value)}
              placeholder={t("channels.newPlaceholder")}
              required
              value={channelName}
            />
            <Button type="submit">{t("channels.create")}</Button>
          </form>
        ) : null}
      </aside>

      <section className="company-conversation">
        <header>
          <div>
            <span className="company-eyebrow">{t("channels.label")}</span>
            <h2 dir="auto">{activeChannel?.name ?? t("channels.select")}</h2>
          </div>
          {readOnly ? (
            <span className="company-read-only">{t("project.readOnly")}</span>
          ) : null}
        </header>
        {notice ? (
          <p aria-live="polite" className="company-notice">
            {notice}
          </p>
        ) : null}
        {activeChannel && releaseConfig.tasks ? <ChannelTaskPanel group={activeChannel} identity={{ actingCompanyId, projectMemberId }} /> : null}
        {releaseConfig.threads && activeChannelId && currentUser ? (
          <ChannelThreadBrowser
            context={{ actingCompanyId, projectMemberId }}
            groupId={activeChannelId}
            projectId={projectId}
            readOnly={readOnly}
            timelineMessages={messages ?? []}
            userId={currentUser._id}
          />
        ) : null}
        <div className="company-message-list" role="log">
          {messages === undefined && activeChannelId ? (
            <p>{t("messages.loading")}</p>
          ) : messages?.length === 0 ? (
            <p>{t("messages.empty")}</p>
          ) : (
            messages
              ?.slice()
              .reverse()
              .map((detail) => (
                <article id={`message-${detail.message._id}`} key={detail.message._id} tabIndex={-1}>
                  <div>
                    <strong dir="auto">
                      {detail.author?.displayName ?? t("labels.unknownMember")}
                    </strong>
                    {detail.authorCompany ? (
                      <span className="company-badge" dir="auto">
                        {detail.authorCompany.displayName}
                      </span>
                    ) : null}
                    <time>
                      {formatDate(locale, new Date(detail.message.createdAt))}{" "}
                      {formatTime(locale, new Date(detail.message.createdAt))}
                    </time>
                  </div>
                  <p dir="auto">{detail.message.body || t("messages.attachment")}</p>
                  {!readOnly &&
                  (detail.message.authorProjectMemberId
                    ? detail.message.authorProjectMemberId === projectMemberId
                    : detail.message.authorId === currentUser?._id) ? (
                    <Button
                      disabled={busy}
                      onClick={() => void deleteAuthoredMessage(detail.message._id)}
                      variant="destructive"
                    >
                      {t("actions.delete")}
                    </Button>
                  ) : null}
                  {releaseConfig.tasks && !readOnly ? (
                    <CreateTaskFromMessage
                      identity={{ actingCompanyId, projectMemberId }}
                      message={detail.message}
                    />
                  ) : null}
                  {releaseConfig.tasks ? (
                    <MessageInlineTasks
                      identity={{ actingCompanyId, projectMemberId }}
                      message={detail.message}
                    />
                  ) : null}
                  {releaseConfig.threads && detail.channelThread ? (
                    <a href={threadHref(projectId, activeChannelId!, detail.channelThread.threadId, {
                      actingCompanyId,
                      projectMemberId,
                    })}>
                      <span dir="auto">{detail.channelThread.name}</span> · {t("messages.replies", { count: formatNumber(locale, detail.channelThread.replyCount) })}
                    </a>
                  ) : null}
                </article>
              ))
          )}
        </div>
        {activeChannelId && !readOnly ? (
          <form
            className="company-composer"
            onSubmit={(event) => void submitMessage(event)}
          >
            <label className="sr-only" htmlFor="company-message">
              {t("messages.label")}
            </label>
            <Input
              dir="auto"
              id="company-message"
              onChange={(event) => setComposer(event.target.value)}
              placeholder={t("messages.placeholder", {
                channel: activeChannel?.name ?? t("channels.label"),
              })}
              value={composer}
            />
            <Button disabled={!composer.trim()} type="submit">
              {t("actions.send")}
            </Button>
          </form>
        ) : null}
      </section>

      <aside className="company-project-admin">
        <h2>{t("controls.heading")}</h2>
        {projectMembers ? (
          <>
            <h3>{t("controls.yourMembers")}</h3>
            <ul>
              {projectMembers.map(({ membership, user }) => (
                <li key={membership._id}>
                  <span dir="auto">{user?.displayName}</span> <span>{roleLabel(membership.role)}</span>
                  {membership._id !== projectMemberId ? (
                    <Button
                      onClick={() =>
                        void run(() =>
                          updateProjectMember({
                            actingCompanyId,
                            projectId,
                            projectMemberId,
                            targetProjectMemberId: membership._id,
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
                  ) : null}
                </li>
              ))}
            </ul>
            <h3>{t("controls.addMembers")}</h3>
            {companyMembers?.members
              .filter(
                ({ membership }) =>
                  membership.status === "active" &&
                  !projectMembers.some(
                    (row) => row.membership.userId === membership.userId,
                  ),
              )
              .map(({ membership, user }) => (
                <Button
                  key={membership._id}
                  onClick={() =>
                    void run(() =>
                      addProjectMember({
                        actingCompanyId,
                        projectId,
                        projectMemberId,
                        role: "member",
                        userId: membership.userId,
                      }),
                    )
                  }
                  variant="outline"
                >
                  {t("controls.addMember", {
                    name: user?.displayName ?? membership.userDisplayNameSnapshot,
                  })}
                </Button>
              ))}
          </>
        ) : null}
        {channelParticipationInvitations?.map((request) => (
          <div className="company-admin-card" key={request._id}>
            <strong>{t("participation.requested")}</strong>
            <p>
              {t("participation.selected", {
                count: formatNumber(locale, request.selectedProjectMemberIds.length),
              })}
            </p>
            <Button
              onClick={() =>
                void run(() =>
                  decideChannelParticipation({
                    actingCompanyId,
                    decision: "accept",
                    groupId: request.groupId,
                    projectId,
                    projectMemberId,
                    requestId: request._id,
                    selectedProjectMemberIds: request.selectedProjectMemberIds,
                  }),
                )
              }
            >
              {t("actions.acceptForCompany")}
            </Button>
            <Button
              onClick={() =>
                void run(() =>
                  decideChannelParticipation({
                    actingCompanyId,
                    decision: "decline",
                    groupId: request.groupId,
                    projectId,
                    projectMemberId,
                    requestId: request._id,
                    selectedProjectMemberIds: [],
                  }),
                )
              }
              variant="outline"
            >
              {t("actions.decline")}
            </Button>
          </div>
        ))}
        {participationOptions?.map((option) => (
          <div className="company-admin-card" key={option.projectCompany._id}>
            <strong dir="auto">
              {t("participation.addToChannel", {
                company: option.company?.displayName,
                channel: activeChannel?.name,
              })}
            </strong>
            <p>
              {t("participation.membersSelected", {
                count: formatNumber(locale, option.members.length),
              })}
            </p>
            <Button
              onClick={() =>
                void run(() =>
                  requestChannelParticipation({
                    actingCompanyId,
                    groupId: activeChannelId!,
                    idempotencyKey: crypto.randomUUID(),
                    projectId,
                    projectMemberId,
                    selectedProjectMemberIds: option.members.map(
                      ({ membership }) => membership._id,
                    ),
                    targetProjectCompanyId: option.projectCompany._id,
                  }),
                )
              }
              variant="outline"
            >
              {t("participation.request")}
            </Button>
          </div>
        ))}
        {pendingChannelArchives?.map((request) => (
          <div className="company-admin-card" key={request._id}>
            <strong>
              {t(request.operation === "archive" ? "archives.channelArchive" : "archives.channelRestore")} {t("archives.requested")}
            </strong>
            <Button
              onClick={() =>
                void run(() =>
                  approveChannelArchive({
                    actingCompanyId,
                    groupId: request.groupId,
                    projectId,
                    projectMemberId,
                    requestId: request._id,
                  }),
                )
              }
            >
              {t("actions.approveForCompany")}
            </Button>
            <Button
              onClick={() =>
                void run(() =>
                  cancelChannelArchive({
                    actingCompanyId,
                    groupId: request.groupId,
                    projectId,
                    projectMemberId,
                    requestId: request._id,
                  }),
                )
              }
              variant="outline"
            >
              {t("actions.cancelRequest")}
            </Button>
          </div>
        ))}
        {activeChannelId &&
        isChannelSteward &&
        activeChannel?.kind !== "general" &&
        (activeChannel.status === "active" ||
          activeChannel.status === "archived") &&
        !pendingChannelArchives?.length ? (
          <Button
            onClick={() =>
              void run(async () => {
                const requestId = await requestChannelArchive({
                  actingCompanyId,
                  groupId: activeChannelId,
                  idempotencyKey: crypto.randomUUID(),
                  operation:
                    activeChannel.status === "archived" ? "restore" : "archive",
                  projectId,
                  projectMemberId,
                });
                await approveChannelArchive({
                  actingCompanyId,
                  groupId: activeChannelId,
                  projectId,
                  projectMemberId,
                  requestId,
                });
              })
            }
            variant="outline"
          >
            {t("archives.requestChannel", {
              operation: t(activeChannel.status === "archived" ? "archives.restore" : "archives.archive"),
            })}
          </Button>
        ) : null}
        {pendingProjectArchives?.map((request) => (
          <div className="company-admin-card" key={request._id}>
            <strong>
              {t("archives.projectApproval", {
                operation: t(request.operation === "archive" ? "archives.archive" : "archives.restore"),
              })}
            </strong>
            <Button
              onClick={() =>
                void run(() =>
                  approveProjectArchive({
                    actingCompanyId,
                    projectId,
                    projectMemberId,
                    requestId: request._id,
                  }),
                )
              }
            >
              {t("actions.approveForCompany")}
            </Button>
          </div>
        ))}
        {item.membership.role === "manager" &&
        item.membership.status === "active" ? (
          <Button
            onClick={() =>
              void run(async () => {
                const requestId = await requestProjectArchive({
                  actingCompanyId,
                  idempotencyKey: crypto.randomUUID(),
                  operation:
                    item.project.status === "archived" ? "restore" : "archive",
                  projectId,
                  projectMemberId,
                });
                await approveProjectArchive({
                  actingCompanyId,
                  projectId,
                  projectMemberId,
                  requestId,
                });
              })
            }
            variant="outline"
          >
            {t("archives.requestProject", {
              operation: t(item.project.status === "archived" ? "archives.restore" : "archives.archive"),
            })}
          </Button>
        ) : null}
        {item.project.origin === "shared" &&
        item.membership.status === "active" &&
        exitStatus?.status === "active" ? (
          <Button
            onClick={() =>
              void run(() => prepareExit({ actingCompanyId, projectId }))
            }
            variant="destructive"
          >
            {t("exit.start")}
          </Button>
        ) : null}
        {exitStatus?.status === "active" &&
        exitStatus.snapshotError?.startsWith("snapshot_cleanup") ? (
          <div className="company-admin-card">
            <strong>{t("exit.cleanupAttention")}</strong>
            <p dir="ltr">{exitStatus.snapshotError}</p>
            <Button
              onClick={() =>
                void run(() => retryExitCleanup({ actingCompanyId, projectId }))
              }
              variant="outline"
            >
              {t("exit.retryCleanup")}
            </Button>
          </div>
        ) : null}
        {exitStatus?.status === "exit_pending" ? (
          <div className="company-admin-card">
            <strong>{t("exit.prepared")}</strong>
            <p>{t("exit.snapshot", { status: snapshotStatusLabel(exitStatus.snapshotStatus ?? "pending") })}</p>
            {exitStatus.snapshotError ? (
              <p dir="ltr">{exitStatus.snapshotError}</p>
            ) : null}
            <Button
              disabled={exitStatus.snapshotStatus !== "verified"}
              onClick={() =>
                void run(() => finalizeExit({ actingCompanyId, projectId }))
              }
            >
              {t("exit.finalize")}
            </Button>
            <Button
              onClick={() =>
                void run(() => retryExit({ actingCompanyId, projectId }))
              }
              variant="outline"
            >
              {t("exit.retrySnapshot")}
            </Button>
            <Button
              onClick={() =>
                void run(() => cancelExit({ actingCompanyId, projectId }))
              }
              variant="outline"
            >
              {t("exit.cancelSafely")}
            </Button>
          </div>
        ) : null}
      </aside>
    </main>
  );
}
