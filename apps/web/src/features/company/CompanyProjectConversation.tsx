import type { FunctionReturnType } from "convex/server";
import { Hash, Plus } from "lucide-react";

import type { api } from "../../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../../convex/_generated/dataModel";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";

import type { ConversationComposerReply } from "#/features/workspace/components/ConversationComposer";
import { ScopedConversationComposer } from "#/features/workspace/components/ScopedConversationComposer";
import { CompanyConversationTimeline } from "#/features/workspace/components/CompanyConversationTimeline";
import { getGroupAvatar } from "#/features/workspace/group-avatar";
import type { GroupMessageItem } from "#/features/workspace/thread-items";
import { CompanyProjectNavigation } from "./CompanyProjectNavigation";
import { formatCompanyError } from "./company-errors";
import type { CompanyProjectContext } from "./company-project-context";
import type { CompanyProjectChannel } from "./company-project-types";
import {
  ProjectSnapshotNotice,
  type ProjectSnapshotState,
} from "./ProjectSnapshotNotice";

import "./company-project.css";

type SharedProjectItem = FunctionReturnType<
  typeof api.sharedProjects.listForActingCompany
>[number];

type CompanyProjectConversationProps = {
  actingCompanyId: Id<"companies">;
  activeChannel: CompanyProjectChannel | undefined;
  activeChannelId: Id<"groups"> | null;
  channelItems: Array<CompanyProjectChannel>;
  channelName: string;
  currentUser: Doc<"users">;
  item: SharedProjectItem;
  messages: Array<GroupMessageItem> | undefined;
  messagePageStatus:
    | "LoadingFirstPage"
    | "CanLoadMore"
    | "LoadingMore"
    | "Exhausted";
  notice: string | null;
  projectId: Id<"projects">;
  projectMemberId: Id<"projectMembers">;
  readOnly: boolean;
  snapshotState: ProjectSnapshotState | null | undefined;
  replyToMessage: ConversationComposerReply | null;
  busyAction: string | null;
  onChannelNameChange: (name: string) => void;
  onCreateChannel: () => Promise<unknown>;
  onDeleteMessage: (messageId: Id<"messages">) => Promise<boolean>;
  onForwardMessage: (input: {
    sourceMessageId: Id<"messages">;
    targetGroupId: Id<"groups">;
    body: string;
  }) => Promise<boolean>;
  onOpenGroup: (groupId: Id<"groups">) => void;
  onOpenMessageSource: (groupId: Id<"groups">, messageId: Id<"messages">) => void;
  onReplyMessage: (item: GroupMessageItem) => void;
  onReplyChange: (reply: ConversationComposerReply | null) => void;
  onBusyActionChange: (action: string | null) => void;
  onNotice: (notice: string | null) => void;
  onLoadMoreMessages: (count: number) => void;
};

export function CompanyProjectConversation({
  actingCompanyId,
  activeChannel,
  activeChannelId,
  channelItems,
  channelName,
  currentUser,
  item,
  messages,
  messagePageStatus,
  notice,
  projectId,
  projectMemberId,
  readOnly,
  replyToMessage,
  snapshotState,
  busyAction,
  onChannelNameChange,
  onCreateChannel,
  onDeleteMessage,
  onForwardMessage,
  onOpenGroup,
  onOpenMessageSource,
  onReplyMessage,
  onReplyChange,
  onBusyActionChange,
  onNotice,
  onLoadMoreMessages,
}: CompanyProjectConversationProps) {
  const context: CompanyProjectContext = {
    actingCompanyId,
    projectId,
    projectMemberId,
    groupId: activeChannelId ?? undefined,
  };

  return (
    <>
      <CompanyProjectNavigation
        actingCompanyId={actingCompanyId}
        activeArea="conversation"
        activeProject={context}

        secondaryNavigation={
          <>
            {item.membership.status === "archived" ? (
              <p className="company-read-only">Read-only exit archive</p>
            ) : null}
            <nav aria-label="Channels">
              <span className="company-project-nav-label">Channels</span>
              <div className="company-project-nav-channel-list">
                {channelItems.map((channel) => {
                  const { Icon, tone } = getGroupAvatar(channel);
                  return (
                    <button
                      aria-current={
                        channel._id === activeChannelId ? "page" : undefined
                      }
                      className={
                        channel._id === activeChannelId
                          ? "company-project-nav-channel active"
                          : "company-project-nav-channel"
                      }
                      key={channel._id}
                      onClick={() => onOpenGroup(channel._id)}
                      type="button"
                    >
                      <span
                        className={`company-project-nav-channel-icon ${tone}`}
                      >
                        <Icon aria-hidden="true" size={14} />
                      </span>
                      <span className="company-project-nav-copy">
                        <strong>{channel.name}</strong>
                        <small>
                          {channel.status === "archived"
                            ? "Archived Channel"
                            : "Channel"}
                        </small>
                      </span>
                    </button>
                  );
                })}
              </div>
            </nav>
            {item.membership.role === "manager" &&
            item.membership.status === "active" ? (
              <form
                className="company-project-nav-channel-create"
                onSubmit={(event) => {
                  event.preventDefault();
                  void onCreateChannel().catch((error: unknown) => {
                    onNotice(formatCompanyError(error));
                  });
                }}
              >
                <Input
                  aria-label="New Channel name"
                  onChange={(event) => onChannelNameChange(event.target.value)}
                  placeholder="New Channel"
                  required
                  value={channelName}
                />
                <Button type="submit">
                  <Plus aria-hidden="true" size={13} />
                  Create Channel
                </Button>
              </form>
            ) : null}
          </>
        }
      />

      <section className="company-conversation">
        <ProjectSnapshotNotice state={snapshotState} />
        <header>
          <div className="company-conversation-title">
            <span className="company-channel-mark">
              <Hash aria-hidden="true" size={14} />
            </span>
            <div>
              <span className="company-eyebrow">Channel</span>
              <h2>{activeChannel?.name ?? "Select a Channel"}</h2>
            </div>
          </div>
          {readOnly ? (
            <span className="company-read-only">Read only</span>
          ) : null}
        </header>
        {notice ? (
          <p aria-live="polite" className="company-notice">
            {notice}
          </p>
        ) : null}
        <div className="company-message-scroll track-thread-scroll" role="log">
          {activeChannel ? (
            <CompanyConversationTimeline
              actorId={currentUser._id}
              busyAction={busyAction}
              context={{ actingCompanyId, projectMemberId }}
              group={activeChannel}
              messagePageStatus={messagePageStatus}
              messages={messages}
              onDeleteMessage={onDeleteMessage}
              onForwardMessage={onForwardMessage}
              onOpenGroup={onOpenGroup}
              onOpenMessageSource={onOpenMessageSource}
              onReplyMessage={onReplyMessage}
              onLoadMoreMessages={onLoadMoreMessages}
              readOnly={readOnly}
              visibleGroups={channelItems}
            />
          ) : (
            <div className="company-message-state">Select a Channel.</div>
          )}
        </div>
        {activeChannel && !readOnly ? (
          <ScopedConversationComposer
            actorId={currentUser._id}
            className="company-project-composer-wrap"
            context={{ actingCompanyId, projectMemberId }}
            group={activeChannel}
            onBusyChange={(action) => {
              onBusyActionChange(action);
              if (action) onNotice(null);
            }}
            onError={(error) => onNotice(formatCompanyError(error))}
            onReplyChange={onReplyChange}
            onSent={() => onNotice("Saved.")}
            projectId={projectId}
            replyTo={replyToMessage}
            visibleGroups={channelItems}
          />
        ) : null}
        <aside className="company-project-conversation-rail">

        </aside>
      </section>
    </>
  );
}
