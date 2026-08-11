import { Link } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { Building2, ChevronDown, FolderKanban, ListTodo, LogOut, PanelLeftClose, PanelLeftOpen, Plus, Search, Settings2, UserRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { Doc, Id } from '../../../../../../convex/_generated/dataModel'
import { api } from '../../../../../../convex/_generated/api'
import ThemeToggle from '#/components/ThemeToggle'
import { formatNumber, LanguageSwitcher } from '#/i18n'
import { Avatar, AvatarFallback, AvatarImage } from '#/components/ui/avatar'
import { Button } from '#/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { AvatarNameTooltip } from '#/features/workspace/avatar-tooltip'
import { getGroupAvatar } from '#/features/workspace/group-avatar'
import { getAvatarTone, getInitials } from '#/features/workspace/identity'
import { useReleaseConfig } from '#/lib/release-config'

type ProjectItem = {
  project: Doc<'projects'>
  membership: Doc<'projectMembers'>
}

type WorkspaceSidebarProps = {
  activeGroupId: Id<'groups'> | null
  activeProject: ProjectItem | undefined
  activeProjectId: Id<'projects'> | null
  busyAction: string | null
  currentAvatarUrl: string | null | undefined
  currentUserBannerStyle: string | null | undefined
  currentUserDesignation: string
  currentUserEmail: string
  currentUserName: string
  currentUserId: Id<'users'>
  logoutConfirmOpen: boolean
  mobileNavOpen: boolean
  navCollapsed: boolean
  onCreateGroup: () => void
  onCreateProject: () => void
  onLogoutConfirmOpenChange: (open: boolean | ((open: boolean) => boolean)) => void
  onMobileNavOpenChange: (open: boolean) => void
  onNavigateProjectSettings: () => void
  onNavCollapsedChange: (collapsed: boolean | ((collapsed: boolean) => boolean)) => void
  onOpenProjectSearch: () => void
  onPreloadGroupRoute: (groupId: Id<'groups'>) => void
  onPreloadProjectRoute: (projectId: Id<'projects'>) => void
  onPreloadProjectSettingsRoute: () => void
  onSelectGroup: (groupId: Id<'groups'>) => void
  onSelectProject: (projectId: Id<'projects'>) => void
  onSignOut: () => void
  projectItems: Array<ProjectItem>
  view: 'home' | 'project' | 'group' | 'settings'
  visibleGroups: Array<Doc<'groups'>>
}

export function WorkspaceSidebar({
  activeGroupId,
  activeProject,
  activeProjectId,
  busyAction,
  currentAvatarUrl,
  currentUserBannerStyle,
  currentUserDesignation,
  currentUserEmail,
  currentUserName,
  currentUserId,
  logoutConfirmOpen,
  mobileNavOpen,
  navCollapsed,
  onCreateGroup,
  onCreateProject,
  onLogoutConfirmOpenChange,
  onMobileNavOpenChange,
  onNavigateProjectSettings,
  onNavCollapsedChange,
  onOpenProjectSearch,
  onPreloadGroupRoute,
  onPreloadProjectRoute,
  onPreloadProjectSettingsRoute,
  onSelectGroup,
  onSelectProject,
  onSignOut,
  projectItems,
  view,
  visibleGroups,
}: WorkspaceSidebarProps) {
  const { t } = useTranslation('workspace')
  const roleLabel = (role: string) => {
    if (role === 'admin' || role === 'client' || role === 'owner' || role === 'staff') {
      return t(`dialogs.roles.${role}`)
    }
    return role
  }
  const releaseConfig = useReleaseConfig()
  const threadUnread = useQuery(
    api.channelThreads.listGroupUnread,
    releaseConfig.threads && activeProjectId
      ? { projectId: activeProjectId, userId: currentUserId }
      : 'skip',
  )
  const threadUnreadByGroup = new Map(
    (threadUnread ?? []).map((item) => [item.groupId, item.unreadCount]),
  )
  return (
    <>
      {mobileNavOpen ? (
        <button
          aria-label={t('sidebar.closeNavigation')}
          className="track-mobile-nav-scrim"
          onClick={() => onMobileNavOpenChange(false)}
          type="button"
        />
      ) : null}

      <aside
        className={[
          'track-nav',
          mobileNavOpen ? 'mobile-open' : '',
          navCollapsed ? 'collapsed' : '',
        ].filter(Boolean).join(' ')}
      >
        <div className="track-brand">
          <img
            alt=""
            className="track-brand-mark"
            height={24}
            src="/track-mark.svg"
            width={35}
          />
          <span className="track-brand-word">Track</span>
          <button
            aria-label={navCollapsed ? t('sidebar.expandNavigation') : t('sidebar.collapseNavigation')}
            aria-pressed={navCollapsed}
            className="track-nav-collapse-button"
            onClick={() => onNavCollapsedChange((isCollapsed) => !isCollapsed)}
            title={navCollapsed ? t('sidebar.expandNavigation') : t('sidebar.collapseNavigation')}
            type="button"
          >
            {navCollapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
          </button>
        </div>

        <div className="track-current-project">
          <span className="track-nav-section-label">{t('common.project')}</span>
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={t('sidebar.switchProject', { name: activeProject?.project.name ?? t('sidebar.selectProject') })}
              className="track-current-project-card"
              disabled={!projectItems.length}
              title={navCollapsed ? activeProject?.project.name ?? t('sidebar.selectProject') : undefined}
            >
              <FolderKanban className="track-nav-icon" size={14} />
              <span className="track-nav-copy">
                <span className="track-nav-title">{activeProject?.project.name ?? t('sidebar.selectProject')}</span>
                <span className="track-nav-meta">{activeProject?.project.clientLabel ?? t('sidebar.noLabel')}</span>
              </span>
              <ChevronDown className="track-nav-icon track-project-chevron" size={14} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="track-project-switcher-menu" side="right" sideOffset={8}>
              <DropdownMenuGroup>
                <DropdownMenuLabel>{t('sidebar.switchProjectLabel')}</DropdownMenuLabel>
                {projectItems.map((item) => (
                  <DropdownMenuItem
                    className={item.project._id === activeProjectId ? 'track-project-switcher-item active' : 'track-project-switcher-item'}
                    key={item.project._id}
                    onFocus={() => onPreloadProjectRoute(item.project._id)}
                    onClick={() => onSelectProject(item.project._id)}
                    onPointerEnter={() => onPreloadProjectRoute(item.project._id)}
                    onTouchStart={() => onPreloadProjectRoute(item.project._id)}
                  >
                    <span className="track-menu-project-name">{item.project.name}</span>
                    <span className="track-menu-project-role">{roleLabel(item.membership.role)}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="track-project-switcher-create" onClick={onCreateProject}>
                <Plus size={13} />
                {t('sidebar.createProject')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {releaseConfig.companyModel ? <div className="track-nav-secondary company-nav-link"><Link className="track-nav-item" to="/workspace/company"><Building2 className="track-nav-icon" size={14} /><span className="track-nav-copy"><span className="track-nav-title">{t('sidebar.companies')}</span><span className="track-nav-meta">{t('sidebar.companyMeta')}</span></span></Link></div> : null}

        {activeProjectId ? (
          <div className="track-nav-secondary">
            <div className="track-sidebar-groups">
              <div className="track-nav-section">
                <span>{t('common.channels')}</span>
                <button
                  aria-label={t('sidebar.createChannel')}
                  className="track-nav-action"
                  disabled={busyAction === 'create-group'}
                  onClick={onCreateGroup}
                  title={navCollapsed ? t('sidebar.createChannel') : undefined}
                  type="button"
                >
                  <Plus aria-hidden="true" size={13} />
                </button>
              </div>
              <div className="track-nav-list">
                {visibleGroups.map((group) => {
                  const { Icon, tone } = getGroupAvatar(group)
                  return (
                    <Button
                      className={group._id === activeGroupId ? 'track-nav-item compact active' : 'track-nav-item compact'}
                      key={group._id}
                      onFocus={() => onPreloadGroupRoute(group._id)}
                      onClick={() => onSelectGroup(group._id)}
                      onPointerEnter={() => onPreloadGroupRoute(group._id)}
                      onTouchStart={() => onPreloadGroupRoute(group._id)}
                      title={navCollapsed ? group.name : undefined}
                      type="button"
                    >
                      <span className={`track-nav-group-icon ${tone}`}>
                        <Icon size={14} strokeWidth={2.1} />
                      </span>
                      <span className="track-nav-copy">
                        <span className="track-nav-title">{group.name}</span>
                        {threadUnreadByGroup.get(group._id) ? <span className="track-nav-meta">
                          {t('sidebar.unreadThreads', { count: formatNumber(threadUnreadByGroup.get(group._id) ?? 0) })}
                        </span> : null}
                      </span>
                    </Button>
                  )
                })}
                {visibleGroups.length === 0 ? (
                  <span className="track-nav-empty">{t('sidebar.noChannels')}</span>
                ) : null}
              </div>
            </div>

            <div className="track-sidebar-tools">
              <div className="track-nav-section no-action">
                <span>{t('sidebar.work')}</span>
              </div>
              <Button
                className="track-nav-item"
                disabled={!activeProjectId}
                onClick={onOpenProjectSearch}
                title={navCollapsed ? t('common.search') : undefined}
                type="button"
              >
                <Search className="track-nav-icon" size={14} />
                <span className="track-nav-copy">
                  <span className="track-nav-title">{t('common.search')}</span>
                  <span className="track-nav-meta">{t('sidebar.searchMeta')}</span>
                </span>
              </Button>
              {releaseConfig.tasks ? (
                <Link
                  activeProps={{ className: 'track-nav-item active' }}
                  className="track-nav-item"
                  params={{ projectId: activeProjectId }}
                  search={{ view: 'board' }}
                  title={navCollapsed ? t('common.tasks') : undefined}
                  to="/workspace/projects/$projectId/tasks"
                >
                  <ListTodo className="track-nav-icon" size={14} />
                  <span className="track-nav-copy">
                    <span className="track-nav-title">{t('common.tasks')}</span>
                    <span className="track-nav-meta">{t('sidebar.tasksMeta')}</span>
                  </span>
                </Link>
              ) : null}
              <Button
                className={view === 'settings' ? 'track-nav-item active' : 'track-nav-item'}
                onFocus={onPreloadProjectSettingsRoute}
                onClick={onNavigateProjectSettings}
                onPointerEnter={onPreloadProjectSettingsRoute}
                onTouchStart={onPreloadProjectSettingsRoute}
                title={navCollapsed ? t('common.settings') : undefined}
                type="button"
              >
                <Settings2 className="track-nav-icon" size={14} />
                <span className="track-nav-copy">
                  <span className="track-nav-title">{t('common.settings')}</span>
                  <span className="track-nav-meta">{t('sidebar.settingsMeta')}</span>
                </span>
              </Button>
            </div>
          </div>
        ) : null}

        <div className="track-nav-footer">
          {navCollapsed ? (
            <>
              <Button
                aria-expanded={logoutConfirmOpen}
                aria-label={t('sidebar.accountMenuFor', { name: currentUserName })}
                className="track-nav-account-button"
                onClick={() => onLogoutConfirmOpenChange((isOpen) => !isOpen)}
                title={t('sidebar.accountTitle', { name: currentUserName })}
                type="button"
              >
                <Avatar className={`track-avatar ${getAvatarTone(currentUserEmail)}`}>
                  <AvatarImage src={currentAvatarUrl ?? undefined} />
                  <AvatarFallback>{getInitials(currentUserName)}</AvatarFallback>
                </Avatar>
              </Button>
              {logoutConfirmOpen ? (
                <div className="track-account-menu" role="dialog" aria-label={t('sidebar.accountMenu')}>
                  <div className="track-account-menu-user">
                    <strong>{currentUserName}</strong>
                    <span>{currentUserDesignation}</span>
                  </div>
                  <div className="track-account-menu-actions">
                    <Button
                      aria-label={t('sidebar.profileSettings')}
                      className="track-nav-footer-button"
                      onClick={() => { window.location.href = '/profile' }}
                      title={t('sidebar.profileSettings')}
                      type="button"
                    >
                      <UserRound size={14} />
                    </Button>
                    <ThemeToggle />
                    <LanguageSwitcher />
                    <Button
                      aria-label={t('sidebar.logOut')}
                      className="track-nav-footer-button"
                      onClick={onSignOut}
                      title={t('sidebar.logOut')}
                      type="button"
                    >
                      <LogOut size={14} />
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <AvatarNameTooltip
              avatarUrl={currentAvatarUrl}
              bannerStyle={currentUserBannerStyle}
              detail={currentUserDesignation}
              name={currentUserName}
              side="right"
              toneSource={currentUserEmail}
            >
              <Avatar className={`track-avatar ${getAvatarTone(currentUserEmail)}`}>
                <AvatarImage src={currentAvatarUrl ?? undefined} />
                <AvatarFallback>{getInitials(currentUserName)}</AvatarFallback>
              </Avatar>
            </AvatarNameTooltip>
          )}
          <div className="track-nav-copy">
            <span className="track-nav-title">{currentUserName}</span>
            <span className="track-nav-meta">{currentUserDesignation}</span>
          </div>
          {!navCollapsed ? (
            <div className="track-nav-footer-actions">
              <Button
                aria-label={t('sidebar.profileSettings')}
                className="track-nav-footer-button"
                onClick={() => { window.location.href = '/profile' }}
                title={t('sidebar.profileSettings')}
                type="button"
              >
                <UserRound size={14} />
              </Button>
              <ThemeToggle />
              <LanguageSwitcher />
              <Button
                aria-expanded={logoutConfirmOpen}
                aria-label={t('sidebar.logOut')}
                className="track-nav-footer-button"
                onClick={() => onLogoutConfirmOpenChange((isOpen) => !isOpen)}
                title={t('sidebar.logOut')}
                type="button"
              >
                <LogOut size={14} />
              </Button>
              {logoutConfirmOpen ? (
                <div className="track-logout-confirm" role="dialog" aria-label={t('sidebar.confirmLogout')}>
                  <p>{t('sidebar.logoutQuestion')}</p>
                  <div className="track-logout-confirm-actions">
                    <Button
                      className="track-button subtle"
                      onClick={() => onLogoutConfirmOpenChange(false)}
                      type="button"
                    >
                      {t('common.cancel')}
                    </Button>
                    <Button
                      className="track-button track-button-primary"
                      onClick={onSignOut}
                      type="button"
                    >
                      {t('sidebar.logOut')}
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </aside>
    </>
  )
}
