import type { ChangeEvent, RefObject } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { Columns3, Menu, MessageSquare, MessageSquarePlus, PanelRightOpen, Search } from 'lucide-react'

import { api } from '../../../../../../convex/_generated/api'
import type { Doc, Id } from '../../../../../../convex/_generated/dataModel'
import { Avatar, AvatarFallback, AvatarImage } from '#/components/ui/avatar'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { AvatarNameTooltip } from '#/features/workspace/avatar-tooltip'
import { getAvatarTone, getInitials } from '#/features/workspace/identity'
import type { ActiveChannelMemberItem } from '#/features/workspace/lib/channel-header-members'
import { useReleaseConfig } from '#/lib/release-config'
import { getWorkspaceHeaderLabels } from './workspace-header-labels'
import './workspace-header.css'

type ProjectItem = {
  project: Doc<'projects'>
  membership: Doc<'projectMembers'>
}

type WorkspaceHeaderProps = {
  activeGroup: Doc<'groups'> | undefined
  activeProject: ProjectItem | undefined
  activeProjectId: Id<'projects'> | null
  busyAction: string | null
  extraHeaderMemberCount: number
  fileInputRef: RefObject<HTMLInputElement | null>
  headerMemberAvatarUrlById: Map<string, string>
  headerMembers: Array<ActiveChannelMemberItem>
  hiddenHeaderMembers: Array<ActiveChannelMemberItem>
  onCreateGroup: () => void
  onFileSelected: (event: ChangeEvent<HTMLInputElement>) => void
  onInvite: () => void
  onMembersOpen: () => void
  onMobileNavOpen: () => void
  onMobileRailOpen?: () => void
  onSearchToggle: () => void
  view: Parameters<typeof getWorkspaceHeaderLabels>[0]['view']
}

export function WorkspaceHeader({
  activeGroup,
  activeProject,
  activeProjectId,
  busyAction,
  extraHeaderMemberCount,
  fileInputRef,
  headerMemberAvatarUrlById,
  headerMembers,
  hiddenHeaderMembers,
  onCreateGroup,
  onFileSelected,
  onInvite,
  onMembersOpen,
  onMobileNavOpen,
  onMobileRailOpen,
  onSearchToggle,
  view,
}: WorkspaceHeaderProps) {
  const releaseConfig = useReleaseConfig()
  const channelTasks = useQuery(
    api.tasks.listPage,
    releaseConfig.tasks && activeGroup
      ? {
          projectId: activeGroup.projectId,
          groupId: activeGroup._id,
          openOnly: true,
          paginationOpts: { cursor: null, numItems: 100 },
        }
      : 'skip',
  )
  const channelBoards = useQuery(
    api.taskBoards.list,
    releaseConfig.tasks && activeGroup
      ? { projectId: activeGroup.projectId }
      : 'skip',
  )
  const activeChannelBoard = channelBoards?.find(
    (item) => item.board.groupId === activeGroup?._id && item.board.isDefault,
  ) ?? channelBoards?.find((item) => item.board.groupId === activeGroup?._id)
  const openChannelTaskCount = channelTasks?.page.length ?? 0
  let taskCountLabel = '…'
  if (channelTasks) {
    taskCountLabel = String(openChannelTaskCount)
    if (!channelTasks.isDone) taskCountLabel += '+'
  }
  const headerLabels = getWorkspaceHeaderLabels({
    companyName: activeProject?.membership.companyDisplayNameSnapshot ?? activeProject?.project.clientLabel,
    groupName: activeGroup?.name,
    projectName: activeProject?.project.name,
    view,
  })

  return (
    <header aria-label={headerLabels.scopeLabel} className="track-thread-header">
      <Button
        aria-label="Open navigation"
        className="icon-button track-mobile-menu-button"
        onClick={onMobileNavOpen}
        type="button"
      >
        <Menu aria-hidden="true" size={16} />
      </Button>
      <div className="track-header-title">
        <h1>{headerLabels.title}</h1>
        {view !== 'home' && headerLabels.projectScopeLabel ? (
          <span className="track-header-topic track-header-scope">
            {headerLabels.projectScopeLabel}
          </span>
        ) : null}
      </div>
      {view === 'group' && activeProjectId && releaseConfig.tasks ? (
        <nav aria-label="Channel views" className="track-header-view-tabs">
          <span aria-current="page" className="active">
            <MessageSquare aria-hidden="true" size={13} /> Conversation
          </span>
          <Link
            params={{ projectId: activeProjectId }}
            search={{ board: activeChannelBoard?.board._id, view: 'board' }}
            to="/workspace/projects/$projectId/tasks"
          >
            <Columns3 aria-hidden="true" size={13} /> Board <span
              className="track-header-tab-count"
              title={channelTasks && !channelTasks.isDone ? 'Partial count. Open the board to view all tasks.' : undefined}
            >{taskCountLabel}</span>
          </Link>
        </nav>
      ) : null}
      <div className="track-header-actions">
        <button
          aria-label={`Open channel members${headerMembers.length + extraHeaderMemberCount ? ` (${headerMembers.length + extraHeaderMemberCount})` : ''}`}
          className="track-header-members"
          onClick={onMembersOpen}
          type="button"
        >
          {headerMembers.map((item) => {
            const user = item.user
            return (
              <AvatarNameTooltip
                avatarUrl={headerMemberAvatarUrlById.get(user._id)}
                bannerStyle={user.profileBannerStyle}
                bio={user.profileBio}
                detail={user.profileDesignation ?? 'Channel member'}
                key={user._id}
                name={user.displayName}
                toneSource={user.email}
                timezone={user.timezone}
              >
                <Avatar className={`track-avatar ${getAvatarTone(user.email)}`}>
                  <AvatarImage src={headerMemberAvatarUrlById.get(user._id)} />
                  <AvatarFallback>{getInitials(user.displayName)}</AvatarFallback>
                </Avatar>
              </AvatarNameTooltip>
            )
          })}
          {extraHeaderMemberCount > 0 ? (
            <AvatarNameTooltip
              detail={hiddenHeaderMembers
                .map((item) => item.user?.displayName)
                .filter(Boolean)
                .slice(0, 4)
                .join(', ')}
              name={`${extraHeaderMemberCount} more Channel member${extraHeaderMemberCount === 1 ? '' : 's'}`}
            >
              <span className="track-member-more">+{extraHeaderMemberCount}</span>
            </AvatarNameTooltip>
          ) : null}
        </button>
        {view === 'group' ? (
          <>
            {onMobileRailOpen ? (
              <Button
                aria-label="Open project controls"
                className="icon-button track-mobile-rail-button"
                onClick={onMobileRailOpen}
                title="Open project controls"
                type="button"
              >
                <PanelRightOpen aria-hidden="true" size={15} />
              </Button>
            ) : null}
            <Button
              aria-label="Search this chat"
              className="icon-button"
              onClick={onSearchToggle}
              title="Search this chat (/)"
              type="button"
            >
              <Search aria-hidden="true" size={15} />
            </Button>
            <Input
              className="track-file-input"
              onChange={onFileSelected}
              multiple
              ref={fileInputRef}
              type="file"
            />
          </>
        ) : null}
        {view !== 'settings' && activeProject ? (
          <Button
            className="track-button"
            disabled={!activeProjectId || busyAction === 'invite'}
            onClick={onInvite}
            type="button"
          >
            Invite
          </Button>
        ) : null}
        {view === 'group' ? null : view === 'project' && activeProject ? (
          <Button
            className="track-button track-button-accent"
            disabled={!activeProjectId || busyAction === 'create-group'}
            onClick={onCreateGroup}
            type="button"
          >
            <MessageSquarePlus aria-hidden="true" size={14} />
            New Channel
          </Button>
        ) : null}
      </div>
    </header>
  )
}
