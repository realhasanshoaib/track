import type { CSSProperties, Dispatch, RefObject, SetStateAction } from 'react'

import { Navigate } from '@tanstack/react-router'

import type { Id } from '../../../../../../convex/_generated/dataModel'
import { GroupChatPage } from '#/features/workspace/components/GroupChatPage'
import { WorkspaceHeader } from '#/features/workspace/components/WorkspaceHeader'
import { WorkspaceRail } from '#/features/workspace/components/WorkspaceRail'
import { WorkspaceSidebar } from '#/features/workspace/components/WorkspaceSidebar'
import { TrackLoading, WorkspaceRouteLoader } from '#/features/workspace/components/loaders'
import { usePendingAttachments } from '#/features/workspace/hooks/usePendingAttachments'
import { useWorkspaceDialogActions } from '#/features/workspace/hooks/useWorkspaceDialogActions'
import { useWorkspaceData } from '#/features/workspace/hooks/useWorkspaceData'
import { useWorkspaceDialogState } from '#/features/workspace/hooks/useWorkspaceDialogState'
import { useWorkspaceMessageActions } from '#/features/workspace/hooks/useWorkspaceMessageActions'
import { useWorkspaceNavigation } from '#/features/workspace/hooks/useWorkspaceNavigation'
import { useWorkspaceNotifications } from '#/features/workspace/hooks/useWorkspaceNotifications'
import { useWorkspacePresentationData } from '#/features/workspace/hooks/useWorkspacePresentationData'
import { useWorkspaceThreadInteractions } from '#/features/workspace/hooks/useWorkspaceThreadInteractions'
import { useWorkspaceTypingIndicators } from '#/features/workspace/hooks/useWorkspaceTypingIndicators'
import { WorkspaceDialogs } from '#/features/workspace/workspace-dialogs'
import { emojiGroups } from '#/features/workspace/workspace-page-config'
import type { GroupMessageItem } from '#/features/workspace/thread-items'
import { ChatSearchPopover } from '#/features/workspace/search/ChatSearchPopover'
import type { ProjectSearchFilter } from '#/features/workspace/search/ProjectSearchDialog'
import { ProjectSearchDialog } from '#/features/workspace/search/ProjectSearchDialog'
import { ProjectSettingsPage } from '#/features/workspace/settings/ProjectSettingsPage'
import { getSessionUser } from '#/features/workspace/workspace-session'

type WorkspaceView = 'home' | 'project' | 'group' | 'settings'

type WorkspacePageSurfaceModel = {
  attachments: ReturnType<typeof usePendingAttachments>
  data: ReturnType<typeof useWorkspaceData>
  dialogActions: ReturnType<typeof useWorkspaceDialogActions>
  dialogState: ReturnType<typeof useWorkspaceDialogState>
  messageActions: ReturnType<typeof useWorkspaceMessageActions>
  navigation: ReturnType<typeof useWorkspaceNavigation>
  notifications: ReturnType<typeof useWorkspaceNotifications>
  presentation: ReturnType<typeof useWorkspacePresentationData>
  projectSearchReturnFocusRef: RefObject<HTMLElement | null>
  threadInteractions: ReturnType<typeof useWorkspaceThreadInteractions>
  auth: {
    devAuthEnabled: boolean
    hasSessionAccess: boolean
    oauthCallbackPending: boolean
    sessionPending: boolean
    sessionUser: ReturnType<typeof getSessionUser>
    trackUserId: Id<'users'> | null
  }
  conversation: {
    activeTypingIndicators: ReturnType<typeof useWorkspaceTypingIndicators>['activeTypingIndicators']
    filteredMentionOptions: ReturnType<typeof import('#/features/workspace/lib/mentions').filterMentionOptions>
    mentionGroups: ReturnType<typeof import('#/features/workspace/lib/mentions').buildMentionGroups>
    mentionSections: ReturnType<typeof import('#/features/workspace/lib/mentions').buildMentionSections>
    showMentionMenu: boolean
  }
  route: {
    canDeleteProject: boolean
    canManageProject: boolean
    isGroupLoading: boolean
    isProjectLoading: boolean
    view: WorkspaceView
  }
  state: {
    activeChatMatchIndex: number
    activeGroupId: Id<'groups'> | null
    activeProjectId: Id<'projects'> | null
    busyAction: string | null
    chatSearchQuery: string
    composer: string
    composerCursor: number
    composerRef: RefObject<HTMLTextAreaElement | null>
    currentAvatarUrl: string | null | undefined
    currentUserDesignation: string
    currentUserEmail: string
    currentUserName: string
    emojiPickerOpen: boolean
    fileInputRef: RefObject<HTMLInputElement | null>
    flashingMessageId: string | null
    loadingOlderMessages: boolean
    logoutConfirmOpen: boolean
    mentionIndex: number
    mentionOptionRefs: RefObject<Array<HTMLButtonElement | null>>
    mobileNavOpen: boolean
    navCollapsed: boolean
    projectSearchFilter: ProjectSearchFilter
    projectSearchOpen: boolean
    projectSearchQuery: string
    railCollapsed: boolean
    railWidth: number
    replyToMessage: GroupMessageItem | null
    searchOpen: boolean
    showJumpToLatest: boolean
    threadScrollRef: RefObject<HTMLDivElement | null>
    uiError: string | null
    voiceRecordingActive: boolean
  }
  update: {
    onActionError: (error: unknown) => void
    onComposerChange: (value: string, cursor: number) => void
    onOpenProjectSearch: () => void
    loadOlderMessages: () => void
    onSearchClose: () => void
    onSearchToggle: () => void
    onSignOut: () => void
    setActiveChatMatchIndex: Dispatch<SetStateAction<number>>
    setComposerCursor: Dispatch<SetStateAction<number>>
    setChatSearchQuery: Dispatch<SetStateAction<string>>
    setEmojiPickerOpen: Dispatch<SetStateAction<boolean>>
    setMentionIndex: Dispatch<SetStateAction<number>>
    setMobileNavOpen: Dispatch<SetStateAction<boolean>>
    setNavCollapsed: Dispatch<SetStateAction<boolean>>
    setLogoutConfirmOpen: Dispatch<SetStateAction<boolean>>
    setProjectSearchFilter: Dispatch<SetStateAction<ProjectSearchFilter>>
    setProjectSearchOpen: Dispatch<SetStateAction<boolean>>
    setProjectSearchQuery: Dispatch<SetStateAction<string>>
    setRailCollapsed: Dispatch<SetStateAction<boolean>>
    setRailResizing: Dispatch<SetStateAction<boolean>>
    setReplyToMessage: Dispatch<SetStateAction<GroupMessageItem | null>>
    setVoiceRecordingActive: Dispatch<SetStateAction<boolean>>
  }
}

export function WorkspacePageSurface({ model }: { model: WorkspacePageSurfaceModel }) {
  const {
    attachments,
    auth,
    conversation,
    data,
    dialogActions,
    dialogState,
    messageActions,
    navigation,
    notifications,
    presentation,
    projectSearchReturnFocusRef,
    route,
    state,
    threadInteractions,
    update,
  } = model
  const {
    activeGroup,
    activeProject,
    activeProjectMembers,
    currentTrackUser,
    hasMoreMessages,
    messages,
    projectMemberRoleByUserId,
    projectSearchResults,
    projectSearchUpdating,
    projectItems,
    visibleGroups,
  } = data

  if (auth.oauthCallbackPending) return <TrackLoading label="Finishing Google sign-in" />
  if (auth.sessionPending && !auth.devAuthEnabled) return <TrackLoading label="Checking your session" />
  if (!auth.hasSessionAccess || !auth.sessionUser) return <Navigate to="/sign-in" />
  if (!auth.trackUserId && state.uiError) return <TrackLoading label={state.uiError} />
  if (!auth.trackUserId) return <TrackLoading label="Connecting your project session" />

  return (
    <main
      className={[
        'track-app-shell',
        state.navCollapsed ? 'track-app-shell-nav-collapsed' : '',
        route.view === 'group' ? 'track-app-shell-with-rail' : '',
        route.view === 'group' && state.railCollapsed ? 'track-app-shell-rail-collapsed' : '',
      ].filter(Boolean).join(' ')}
      style={{ '--track-rail-width': `${state.railWidth}px` } as CSSProperties}
    >
      <WorkspaceSidebar
        activeGroupId={state.activeGroupId}
        activeProject={activeProject}
        activeProjectId={state.activeProjectId}
        busyAction={state.busyAction}
        currentAvatarUrl={state.currentAvatarUrl}
        currentUserBannerStyle={currentTrackUser?.profileBannerStyle}
        currentUserDesignation={state.currentUserDesignation}
        currentUserEmail={state.currentUserEmail}
        currentUserName={state.currentUserName}
        currentUserId={auth.trackUserId}
        logoutConfirmOpen={state.logoutConfirmOpen}
        mobileNavOpen={state.mobileNavOpen}
        navCollapsed={state.navCollapsed}
        onCreateGroup={dialogState.openGroupDialog}
        onCreateProject={dialogState.openProjectDialog}
        onLogoutConfirmOpenChange={update.setLogoutConfirmOpen}
        onMobileNavOpenChange={update.setMobileNavOpen}
        onNavigateProjectSettings={navigation.navigateToProjectSettings}
        onNavCollapsedChange={update.setNavCollapsed}
        onOpenProjectSearch={update.onOpenProjectSearch}
        onPreloadGroupRoute={navigation.preloadGroupRoute}
        onPreloadProjectRoute={navigation.preloadProjectRoute}
        onPreloadProjectSettingsRoute={navigation.preloadProjectSettingsRoute}
        onSelectGroup={navigation.navigateToGroup}
        onSelectProject={navigation.navigateToProject}
        onSignOut={update.onSignOut}
        projectItems={projectItems}
        view={route.view}
        visibleGroups={visibleGroups}
      />

      <section className="track-workspace">
        <WorkspaceHeader
          activeGroup={activeGroup}
          activeProject={activeProject}
          activeProjectId={state.activeProjectId}
          busyAction={state.busyAction}
          extraHeaderMemberCount={presentation.extraHeaderMemberCount}
          fileInputRef={state.fileInputRef}
          headerMemberAvatarUrlById={presentation.headerMemberAvatarUrlById}
          headerMembers={presentation.headerMembers}
          hiddenHeaderMembers={presentation.hiddenHeaderMembers}
          onCreateGroup={dialogState.openGroupDialog}
          onFileSelected={(event) => void attachments.handleFileSelected(event)}
          onInvite={dialogState.openInviteDialog}
          onMobileNavOpen={() => update.setMobileNavOpen(true)}
          onSearchToggle={update.onSearchToggle}
          view={route.view}
        />

        {state.uiError ? <div className="track-error">{state.uiError}</div> : null}
        {route.view === 'group' && state.searchOpen ? (
          <ChatSearchPopover
            activeIndex={state.activeChatMatchIndex}
            matchCount={presentation.chatSearchMatches.length}
            onClose={update.onSearchClose}
            onNext={() => threadInteractions.cycleChatSearchMatch(1)}
            onPrevious={() => threadInteractions.cycleChatSearchMatch(-1)}
            onQueryChange={update.setChatSearchQuery}
            query={state.chatSearchQuery}
          />
        ) : null}

        {route.isProjectLoading || route.isGroupLoading ? (
          <WorkspaceRouteLoader label={route.view === 'group' ? 'Opening channel conversation' : route.view === 'settings' ? 'Loading project settings' : 'Loading project channels'} />
        ) : route.view === 'group' ? (
          <GroupChatPage
            activeGroup={activeGroup}
            activeGroupId={state.activeGroupId}
            activeProjectId={state.activeProjectId}
            activeTypingIndicators={conversation.activeTypingIndicators}
            busyAction={state.busyAction}
            chatSearchMatchKeys={presentation.chatSearchMatchKeys}
            chatSearchMatches={presentation.chatSearchMatches}
            chatSearchTerm={presentation.chatSearchTerm}
            composer={state.composer}
            composerPlaceholder={presentation.composerPlaceholder}
            composerRef={state.composerRef}
            emojiGroups={emojiGroups}
            emojiPickerOpen={state.emojiPickerOpen}
            fileInputRef={state.fileInputRef}
            filteredMentionOptions={conversation.filteredMentionOptions}
            flashingMessageId={state.flashingMessageId}
            hasMoreMessages={hasMoreMessages}
            loadingOlderMessages={state.loadingOlderMessages}
            mentionGroups={conversation.mentionGroups}
            mentionIndex={state.mentionIndex}
            mentionOptionRefs={state.mentionOptionRefs}
            mentionSections={conversation.mentionSections}
            messageAuthorAvatarUrlById={presentation.messageAuthorAvatarUrlById}
            messagesLoaded={messages !== undefined}
            currentUserId={auth.trackUserId}
            onDeleteMessage={messageActions.handleDeleteMessage}
            onComposerBlur={threadInteractions.handleComposerBlur}
            onComposerChange={update.onComposerChange}
            onComposerFocus={threadInteractions.handleComposerFocus}
            onComposerKeyUp={threadInteractions.handleComposerSelection}
            onComposerPaste={attachments.handleComposerPaste}
            onComposerSelect={threadInteractions.handleComposerSelection}
            onEmojiPickerOpenChange={update.setEmojiPickerOpen}
            onForwardMessage={messageActions.handleForwardMessage}
            onInsertComposerText={threadInteractions.insertComposerText}
            onMentionIndexChange={update.setMentionIndex}
            onMentionSelect={threadInteractions.handleMentionSelect}
            onOpenGroup={navigation.navigateToGroup}
            onOpenMessageSource={threadInteractions.handleOpenMessageSource}
            onLoadOlderMessages={update.loadOlderMessages}
            onRecordingChange={update.setVoiceRecordingActive}
            onReplyMessage={threadInteractions.handleReplyMessage}
            onReplyToMessageChange={update.setReplyToMessage}
            onSendMessage={() => void messageActions.handleSendMessage()}
            onShowMentionMenuClose={() => update.setComposerCursor(0)}
            onThreadScroll={() => {
              threadInteractions.handleThreadScroll()
              update.loadOlderMessages()
            }}
            onVoiceNoteRecorded={attachments.handleVoiceNoteRecorded}
            pendingAttachments={attachments.pendingAttachments}
            projectMemberRoleByUserId={projectMemberRoleByUserId}
            removePendingAttachment={attachments.removePendingAttachment}
            replyToMessage={state.replyToMessage}
            scrollThreadToLatest={threadInteractions.scrollThreadToLatest}
            setComposerCursorFromRef={() => update.setComposerCursor(state.composerRef.current?.selectionStart ?? state.composerCursor)}
            showJumpToLatest={state.showJumpToLatest}
            showMentionMenu={conversation.showMentionMenu}
            threadItems={presentation.threadItems}
            threadScrollRef={state.threadScrollRef}
            visibleGroups={visibleGroups}
            visibleMessages={presentation.visibleMessages}
            voiceRecordingActive={state.voiceRecordingActive}
          />
        ) : route.view === 'settings' ? (
          <ProjectSettingsPage
            activeProject={activeProject?.project ?? null}
            busyAction={state.busyAction}
            canDeleteProject={route.canDeleteProject}
            canManageProject={route.canManageProject}
            globalNotificationMode={notifications.globalNotificationMode}
            groupNotificationSettings={notifications.groupNotificationSettings}
            groups={visibleGroups}
            members={activeProjectMembers}
            onDeleteGroup={(groupIdToDelete) => void dialogActions.handleDeleteGroup(groupIdToDelete)}
            onDeleteProject={() => void dialogActions.handleDeleteProject()}
            onEditGroup={dialogState.openEditGroupDialog}
            onEditProject={dialogState.openEditProjectDialog}
            onInvite={dialogState.openInviteDialog}
            onNotificationMode={notifications.handleNotificationMode}
          />
        ) : visibleGroups.length > 0 ? (
          <WorkspaceRouteLoader label="Opening first channel" />
        ) : (
          <div className="track-empty">
            <p className="mono-label m-0">No channels</p>
            <p>Create a channel to start tracking project conversations.</p>
          </div>
        )}
      </section>

      {route.view === 'group' ? (
        <WorkspaceRail
          activeGroup={activeGroup}
          activeProjectId={state.activeProjectId}
          busyAction={notifications.notificationBusyAction ?? state.busyAction}
          globalNotificationMode={notifications.globalNotificationMode}
          groupNotificationMode={notifications.groupNotificationMode}
          notificationPermission={notifications.notificationPermission}
          notificationStatus={notifications.notificationStatus}
          onCollapse={() => update.setRailCollapsed(true)}
          onEnableBrowserNotifications={() => void notifications.handleEnableBrowserNotifications()}
          onExpand={() => update.setRailCollapsed(false)}
          onNotificationMode={(mode) => void notifications.handleNotificationMode(mode)}
          onSendTestNotification={() => void notifications.handleSendTestNotification()}
          onStartResize={() => update.setRailResizing(true)}
          railCollapsed={state.railCollapsed}
          userId={auth.trackUserId}
          visibleMessages={presentation.visibleMessages}
        />
      ) : null}
      <ProjectSearchDialog
        filter={state.projectSearchFilter}
        loading={state.projectSearchOpen && state.projectSearchQuery.trim().length >= 2 && projectSearchResults === undefined}
        onClose={() => update.setProjectSearchOpen(false)}
        onFilterChange={update.setProjectSearchFilter}
        onOpenResult={threadInteractions.handleProjectSearchResult}
        onQueryChange={update.setProjectSearchQuery}
        open={state.projectSearchOpen}
        projectName={activeProject?.project.name ?? 'Project'}
        query={state.projectSearchQuery}
        returnFocusRef={projectSearchReturnFocusRef}
        sections={presentation.projectSearchSections}
        total={presentation.projectSearchTotal}
        updating={projectSearchUpdating}
      />
      <WorkspaceDialogs
        activeGroupId={state.activeGroupId}
        busyAction={state.busyAction}
        groupDialogOpen={dialogState.groupDialogOpen}
        groupDialogMode={dialogState.groupDialogMode}
        groupName={dialogState.groupName}
        inviteAccess={dialogState.inviteAccess}
        inviteDialogOpen={dialogState.inviteDialogOpen}
        inviteEmail={dialogState.inviteEmail}
        inviteRole={dialogState.inviteRole}
        onCreateGroupSubmit={dialogActions.handleCreateGroupSubmit}
        onCreateProjectSubmit={dialogActions.handleCreateProjectSubmit}
        onInviteSubmit={dialogActions.handleInviteSubmit}
        projectClientLabel={dialogState.projectClientLabel}
        projectDialogOpen={dialogState.projectDialogOpen}
        projectDialogMode={dialogState.projectDialogMode}
        projectGroups={visibleGroups}
        projectName={dialogState.projectName}
        setGroupDialogOpen={dialogState.setGroupDialogOpen}
        setGroupName={dialogState.setGroupName}
        setInviteAccess={dialogState.setInviteAccess}
        setInviteDialogOpen={dialogState.setInviteDialogOpen}
        setInviteEmail={dialogState.setInviteEmail}
        setInviteRole={dialogState.setInviteRole}
        setProjectClientLabel={dialogState.setProjectClientLabel}
        setProjectDialogOpen={dialogState.setProjectDialogOpen}
        setProjectName={dialogState.setProjectName}
      />
    </main>
  )
}
