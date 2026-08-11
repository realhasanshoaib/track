import type { ChangeEvent, RefObject } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { Columns3, Menu, MessageSquare, MessageSquarePlus, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { api } from '../../../../../../convex/_generated/api'
import type { Doc, Id } from '../../../../../../convex/_generated/dataModel'
import { Avatar, AvatarFallback, AvatarImage } from '#/components/ui/avatar'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { AvatarNameTooltip } from '#/features/workspace/avatar-tooltip'
import { getAvatarTone, getInitials } from '#/features/workspace/identity'
import type { ActiveChannelMemberItem } from '#/features/workspace/lib/channel-header-members'
import { useReleaseConfig } from '#/lib/release-config'
import { formatNumber } from '#/i18n'

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
  onMobileNavOpen: () => void
  onSearchToggle: () => void
  view: 'home' | 'project' | 'group' | 'settings'
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
  onMobileNavOpen,
  onSearchToggle,
  view,
}: WorkspaceHeaderProps) {
  const { t } = useTranslation('workspace')
  const releaseConfig = useReleaseConfig()
  const channelTasks = useQuery(
    api.tasks.list,
    releaseConfig.tasks && activeGroup
      ? { projectId: activeGroup.projectId, groupId: activeGroup._id }
      : 'skip',
  ) as Array<{ terminal: boolean }> | undefined
  const channelBoards = useQuery(
    api.taskBoards.list,
    releaseConfig.tasks && activeGroup
      ? { projectId: activeGroup.projectId }
      : 'skip',
  ) as Array<{ board: Doc<'taskBoards'> }> | undefined
  const activeChannelBoard = channelBoards?.find(
    (item) => item.board.groupId === activeGroup?._id && item.board.isDefault,
  ) ?? channelBoards?.find((item) => item.board.groupId === activeGroup?._id)
  const openChannelTaskCount = channelTasks?.filter((item) => !item.terminal).length ?? 0
  return (
    <header className="track-thread-header">
      <Button
        aria-label={t('sidebar.openNavigation')}
        className="icon-button track-mobile-menu-button"
        onClick={onMobileNavOpen}
        type="button"
      >
        <Menu size={16} />
      </Button>
      <div className="track-header-title">
        <h1>
          {view === 'group' && activeGroup
            ? `#${activeGroup.name}`
              : view === 'settings' && activeProject
                ? t('header.projectSettingsTitle', { project: activeProject.project.name })
                : activeProject
                  ? t('header.projectChannelsTitle', { project: activeProject.project.name })
                  : t('sidebar.selectProject')}
        </h1>
        {view === 'group' && activeProject ? (
          <span className="track-header-topic">
            {activeProject.project.name}{activeProject.project.clientLabel ? ` · ${activeProject.project.clientLabel}` : ''}
          </span>
        ) : null}
      </div>
      {view === 'group' && activeProjectId && releaseConfig.tasks ? (
        <nav aria-label={t('header.channelViews')} className="track-header-view-tabs">
          <span aria-current="page" className="active">
            <MessageSquare size={13} /> {t('common.conversation')}
          </span>
          <Link
            params={{ projectId: activeProjectId }}
            search={{ board: activeChannelBoard?.board._id, view: 'board' }}
            to="/workspace/projects/$projectId/tasks"
          >
            <Columns3 size={13} /> {t('common.board')} <span className="track-header-tab-count">{formatNumber(openChannelTaskCount)}</span>
          </Link>
        </nav>
      ) : null}
      <div className="track-header-actions">
        <div className="track-header-members" aria-label={t('header.channelMembers')}>
          {headerMembers.map((item) => {
            const user = item.user
            return (
              <AvatarNameTooltip
                avatarUrl={headerMemberAvatarUrlById.get(user._id)}
                bannerStyle={user.profileBannerStyle}
                bio={user.profileBio}
                detail={user.profileDesignation ?? t('header.channelMember')}
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
              name={t('header.moreChannelMembers', { count: formatNumber(extraHeaderMemberCount) })}
            >
              <span className="track-member-more">+{formatNumber(extraHeaderMemberCount)}</span>
            </AvatarNameTooltip>
          ) : null}
        </div>
        {view === 'group' ? (
          <>
            <Button
              aria-label={t('search.chat')}
              className="icon-button"
              onClick={onSearchToggle}
              title={t('search.chatShortcut')}
              type="button"
            >
              <Search size={15} />
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
        {view !== 'settings' ? (
          <Button
            className="track-button"
            disabled={!activeProjectId || busyAction === 'invite'}
            onClick={onInvite}
            type="button"
          >
            {t('common.invite')}
          </Button>
        ) : null}
        {view === 'group' ? null : view === 'project' ? (
          <Button
            className="track-button track-button-accent"
            disabled={!activeProjectId || busyAction === 'create-group'}
            onClick={onCreateGroup}
            type="button"
          >
            <MessageSquarePlus size={14} />
            {t('header.newChannel')}
          </Button>
        ) : null}
      </div>
    </header>
  )
}
