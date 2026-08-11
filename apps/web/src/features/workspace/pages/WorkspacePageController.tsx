import { useNavigate } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { api } from '../../../../../../convex/_generated/api'
import type { Id } from '../../../../../../convex/_generated/dataModel'
import { getActiveMention } from '#/features/workspace/identity'
import {
  buildMentionGroups,
  buildMentionSections,
  buildWorkspaceMentionOptions,
  filterMentionOptions,
} from '#/features/workspace/lib/mentions'
import type { GroupMessageItem } from '#/features/workspace/thread-items'
import { usePendingAttachments } from '#/features/workspace/hooks/usePendingAttachments'
import { useWorkspaceDialogActions } from '#/features/workspace/hooks/useWorkspaceDialogActions'
import { useWorkspaceData } from '#/features/workspace/hooks/useWorkspaceData'
import { useWorkspaceDialogState } from '#/features/workspace/hooks/useWorkspaceDialogState'
import { useWorkspaceMessageActions } from '#/features/workspace/hooks/useWorkspaceMessageActions'
import { useWorkspaceNotifications } from '#/features/workspace/hooks/useWorkspaceNotifications'
import { useWorkspacePresentationData } from '#/features/workspace/hooks/useWorkspacePresentationData'
import { useWorkspaceTypingIndicators } from '#/features/workspace/hooks/useWorkspaceTypingIndicators'
import { useWorkspaceSynchronization } from '#/features/workspace/hooks/useWorkspaceSynchronization'
import { useWorkspaceThreadInteractions } from '#/features/workspace/hooks/useWorkspaceThreadInteractions'
import { useWorkspaceNavigation } from '#/features/workspace/hooks/useWorkspaceNavigation'
import type { ProjectSearchFilter } from '#/features/workspace/search/ProjectSearchDialog'
import { authClient } from '#/lib/auth-client'
import { disableDevAuthBypass, useDevAuthBypass } from '#/lib/dev-auth-bypass'
import { useOAuthCallbackPending } from '#/lib/oauth-callback'
import {
  clearResolvedTrackUserIds,
  getResolvedTrackUserId,
  getSessionUser,
} from '#/features/workspace/workspace-session'
import { WorkspacePageSurface } from './WorkspacePageSurface'

type WorkspacePageProps = {
  groupId?: string
  projectId?: string
  view?: 'home' | 'project' | 'group' | 'settings'
}

export function WorkspacePage({ groupId, projectId, view = 'home' }: WorkspacePageProps) {
  const { t } = useTranslation('workspace')
  const navigate = useNavigate()
  const session = authClient.useSession()
  const syncCurrentUser = useMutation(api.auth.syncGoogleUser)
  const syncDevUser = useMutation(api.auth.syncDevUser)
  const ensureStarterProject = useMutation(api.projects.ensureStarter)
  const acceptPendingInvitations = useMutation(api.invitations.acceptPendingForCurrentUser)

  const [trackUserId, setTrackUserId] = useState<Id<'users'> | null>(() => {
    const sessionUser = getSessionUser(authClient.getSessionData?.(), t('identity.trackUser'))
    return sessionUser ? getResolvedTrackUserId(sessionUser.id) : null
  })
  const [activeProjectId, setActiveProjectId] = useState<Id<'projects'> | null>(null)
  const [activeGroupId, setActiveGroupId] = useState<Id<'groups'> | null>(null)
  const [composer, setComposer] = useState('')
  const [replyToMessage, setReplyToMessage] = useState<GroupMessageItem | null>(null)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [uiError, setUiError] = useState<string | null>(null)
  const [composerCursor, setComposerCursor] = useState(0)
  const [mentionIndex, setMentionIndex] = useState(0)
  const [searchOpen, setSearchOpen] = useState(false)
  const [chatSearchQuery, setChatSearchQuery] = useState('')
  const [activeChatMatchIndex, setActiveChatMatchIndex] = useState(0)
  const [projectSearchOpen, setProjectSearchOpen] = useState(false)
  const [projectSearchQuery, setProjectSearchQuery] = useState('')
  const [projectSearchFilter, setProjectSearchFilter] = useState<ProjectSearchFilter>('all')
  const [navCollapsed, setNavCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem('track-nav-collapsed') === 'true'
  })
  const [railCollapsed, setRailCollapsed] = useState(false)
  const [railWidth, setRailWidth] = useState(312)
  const [railResizing, setRailResizing] = useState(false)
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false)
  const [showJumpToLatest, setShowJumpToLatest] = useState(false)
  const [flashingMessageId, setFlashingMessageId] = useState<string | null>(null)
  const [pendingFocusMessageId, setPendingFocusMessageId] = useState<string | null>(null)
  const [voiceRecordingActive, setVoiceRecordingActive] = useState(false)
  const [memoryImportOpen, setMemoryImportOpen] = useState(false)
  const navigation = useWorkspaceNavigation({ activeProjectId, setActiveGroupId, setMobileNavOpen })
  const { navigateToGroup, navigateToProject, navigateToProjectSettings } = navigation
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const composerRef = useRef<HTMLTextAreaElement | null>(null)
  const threadScrollRef = useRef<HTMLDivElement | null>(null)
  const mentionOptionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const shouldFollowLatestRef = useRef(true)
  const lastLoadedGroupIdRef = useRef<Id<'groups'> | null>(null)
  const flashMessageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const attachments = usePendingAttachments({
    activeGroupId,
    composerRef,
    onAfterAdd: () => setEmojiPickerOpen(false),
  })
  const {
    clearPendingAttachments,
    pendingAttachments,
  } = attachments

  useEffect(() => {
    return () => {
      if (flashMessageTimeoutRef.current) {
        clearTimeout(flashMessageTimeoutRef.current)
      }
    }
  }, [])

  const routeProjectId = projectId as Id<'projects'> | undefined
  const routeGroupId = groupId as Id<'groups'> | undefined
  const devAuthBypass = useDevAuthBypass()
  const sessionUser = useMemo(
    () => getSessionUser(session.data ?? devAuthBypass.sessionData, t('identity.trackUser')),
    [devAuthBypass.sessionData, session.data, t],
  )
  const hasSessionAccess = Boolean(session.data || devAuthBypass.enabled)
  const oauthCallbackPending = useOAuthCallbackPending(hasSessionAccess)
  const workspaceData = useWorkspaceData({
    activeGroupId,
    activeProjectId,
    projectSearchFilter,
    projectSearchOpen,
    projectSearchQuery,
    trackUserId,
  })
  const {
    activeChannelMembers,
    activeGroup,
    activeProject,
    activeProjectMembers,
    confirmedActiveGroupId,
    currentAvatarUrl,
    currentTrackProfileIncomplete,
    currentTrackUser,
    groupAssistantStreams,
    groupMessages,
    groups,
    messages,
    projectItems,
    projectMembers,
    projectSearchResults,
    projects,
    visibleGroups,
  } = workspaceData
  const mentionOptions = useMemo(
    () => buildWorkspaceMentionOptions(activeChannelMembers, visibleGroups, {
      assistant: t('assistant.name'),
      channelMember: t('header.channelMember'),
      group: t('common.channel'),
      projectMemory: t('common.projectMemory'),
    }),
    [activeChannelMembers, t, visibleGroups],
  )
  const mentionGroups = useMemo(
    () => buildMentionGroups(activeChannelMembers, visibleGroups),
    [activeChannelMembers, visibleGroups],
  )
  const forwardMentionOptions = useMemo(
    () => buildWorkspaceMentionOptions(activeProjectMembers, visibleGroups, {
      assistant: t('assistant.name'),
      channelMember: t('header.channelMember'),
      group: t('common.channel'),
      projectMemory: t('common.projectMemory'),
    }),
    [activeProjectMembers, t, visibleGroups],
  )
  const activeMention = useMemo(
    () => getActiveMention(composer, composerCursor),
    [composer, composerCursor],
  )
  const filteredMentionOptions = useMemo(
    () => (activeMention ? filterMentionOptions(mentionOptions, activeMention.query) : []),
    [activeMention, mentionOptions],
  )
  const mentionSections = useMemo(
    () => buildMentionSections(filteredMentionOptions, {
      assistant: t('common.assistant'),
      groups: t('common.channels'),
      people: t('common.people'),
    }),
    [filteredMentionOptions, t],
  )
  const showMentionMenu = activeMention !== null && filteredMentionOptions.length > 0
  const composerHasTypingText = composer.trim().length > 0
  const presentation = useWorkspacePresentationData({
    activeChatMatchIndex,
    activeChannelMembers,
    activeGroup,
    chatSearchQuery,
    currentUserId: trackUserId,
    groupAssistantStreams,
    groupMessages,
    projectSearchResults,
  })
  const {
    activeTypingIndicators,
    setComposerFocused,
  } = useWorkspaceTypingIndicators({
    activeGroupId,
    activeProjectId,
    composerHasTypingText,
    pendingAttachmentCount: pendingAttachments.length,
    queryGroupId: confirmedActiveGroupId,
    trackUserId,
    view,
    voiceRecordingActive,
  })

  useWorkspaceSynchronization({
    acceptPendingInvitations,
    activeGroupId,
    activeMentionQuery: activeMention?.query,
    activeProjectId,
    currentTrackProfileIncomplete,
    currentTrackUser,
    devAuthEnabled: devAuthBypass.enabled,
    ensureStarterProject,
    groups,
    mentionIndex,
    mentionOptionRefs,
    navCollapsed,
    projectItems,
    projects,
    railResizing,
    routeGroupId,
    routeProjectId,
    sessionUser,
    setActiveGroupId,
    setActiveProjectId,
    setActionError,
    setLogoutConfirmOpen,
    setMentionIndex,
    setRailResizing,
    setRailWidth,
    setReplyToMessage,
    setShowJumpToLatest,
    setTrackUserId,
    setUiError,
    showMentionMenu,
    syncCurrentUser,
    syncDevUser,
    trackUserId,
    view,
    visibleGroups,
  })

  const dialogState = useWorkspaceDialogState({ activeGroupId })
  const {
    editingGroupId,
    groupDialogMode,
    groupName,
    inviteAccess,
    inviteEmail,
    inviteRole,
    projectClientLabel,
    projectDialogMode,
    projectName,
    setGroupDialogOpen,
    setInviteDialogOpen,
    setProjectDialogOpen,
  } = dialogState
  const currentUserName = currentTrackUser?.displayName ?? sessionUser?.name ?? t('identity.trackUser')
  const currentUserEmail = currentTrackUser?.email ?? sessionUser?.email ?? currentUserName
  const currentUserDesignation = currentTrackUser?.profileDesignation ?? (
    activeProject?.membership.role
      ? t(`dialogs.roles.${activeProject.membership.role}`)
      : t('identity.owner')
  )
  const isProjectRouteLoading =
    trackUserId !== null &&
    (projects === undefined ||
      (activeProjectId !== null && (groups === undefined || projectMembers === undefined)))
  const isGroupRouteLoading =
    view === 'group' &&
    activeGroupId !== null &&
    (groups === undefined || messages === undefined || activeGroup === undefined)
  const { activeChatMatch, chatSearchMatches, chatSearchTerm, latestThreadItemKey, visibleMessages } = presentation

  const threadInteractions = useWorkspaceThreadInteractions({
    activeChatMatch,
    activeChatMatchIndex,
    activeGroupId,
    activeMention,
    activeProjectId,
    chatSearchMatches,
    chatSearchQuery,
    chatSearchTerm,
    clearPendingAttachments,
    composer,
    composerCursor,
    composerRef,
    flashMessageTimeoutRef,
    lastLoadedGroupIdRef,
    latestThreadItemKey,
    messagesLoaded: messages !== undefined,
    navigateToGroup,
    pendingFocusMessageId,
    setActiveChatMatchIndex,
    setComposer,
    setComposerCursor,
    setComposerFocused,
    setFlashingMessageId,
    setMentionIndex,
    setMobileNavOpen,
    setPendingFocusMessageId,
    setProjectSearchOpen,
    setProjectSearchQuery,
    setReplyToMessage,
    setSearchOpen,
    setShowJumpToLatest,
    shouldFollowLatestRef,
    threadScrollRef,
    view,
    visibleMessages,
  })
  const { handleMessageSent } = threadInteractions

  const activeProjectRole = activeProject?.membership.role
  const canManageProject = activeProjectRole === 'owner' || activeProjectRole === 'admin'
  const canDeleteProject = activeProjectRole === 'owner'
  const notifications = useWorkspaceNotifications({
    activeGroup,
    activeGroupId,
    activeProject,
    messagesLoaded: messages !== undefined,
    trackUserId,
    visibleMessages,
  })
  const dialogActions = useWorkspaceDialogActions({
    activeProjectId,
    editingGroupId,
    groupDialogMode,
    groupName,
    inviteAccess,
    inviteEmail,
    inviteRole,
    onBusyChange: setBusyAction,
    onClearError: () => setUiError(null),
    onError: setActionError,
    onGroupCreated: (groupIdToOpen) => {
      if (!activeProjectId) return
      setActiveGroupId(groupIdToOpen)
      void navigate({
        to: '/workspace/projects/$projectId/groups/$groupId',
        params: { groupId: groupIdToOpen, projectId: activeProjectId },
      })
    },
    onGroupDeleted: (deletedGroupId) => {
      if (activeGroupId === deletedGroupId) {
        setActiveGroupId(null)
        navigateToProjectSettings()
      }
    },
    onGroupDialogOpenChange: setGroupDialogOpen,
    onGroupUpdated: () => undefined,
    onInviteDialogOpenChange: setInviteDialogOpen,
    onProjectDeleted: (deletedProjectId) => {
      setActiveProjectId(null)
      setActiveGroupId(null)
      const nextProject = projectItems.find((item) => item.project._id !== deletedProjectId)
      if (nextProject) {
        navigateToProject(nextProject.project._id)
        return
      }
      void navigate({ to: '/workspace' })
    },
    onProjectCreated: (projectIdToOpen) => {
      setActiveGroupId(null)
      navigateToProject(projectIdToOpen)
    },
    onProjectDialogOpenChange: setProjectDialogOpen,
    onProjectUpdated: () => undefined,
    projectClientLabel,
    projectDialogMode,
    projectName,
    trackUserId,
  })
  const messageActions = useWorkspaceMessageActions({
    activeGroupId,
    activeProjectId,
    composer,
    forwardMentionOptions,
    mentionOptions,
    onAfterDelete: (messageId) => {
      if (replyToMessage?.message._id === messageId) setReplyToMessage(null)
    },
    onAfterSend: handleMessageSent,
    onBusyChange: setBusyAction,
    onClearError: () => setUiError(null),
    onError: setActionError,
    pendingAttachments,
    replyToMessage,
    trackUserId,
  })

  function setActionError(_error: unknown) {
    setUiError(t('errors.generic'))
  }

  async function handleSignOut() {
    setLogoutConfirmOpen(false)
    disableDevAuthBypass()
    clearResolvedTrackUserIds()
    setTrackUserId(null)
    setActiveProjectId(null)
    setActiveGroupId(null)
    await authClient.signOut()
    await navigate({ replace: true, to: '/sign-in' })
  }

  return (
    <WorkspacePageSurface
      model={{
        attachments,
        auth: {
          devAuthEnabled: devAuthBypass.enabled,
          hasSessionAccess,
          oauthCallbackPending,
          sessionPending: session.isPending,
          sessionUser,
          trackUserId,
        },
        conversation: {
          activeTypingIndicators,
          filteredMentionOptions,
          mentionGroups,
          mentionSections,
          showMentionMenu,
        },
        data: workspaceData,
        dialogActions,
        dialogState,
        messageActions,
        navigation,
        notifications,
        presentation,
        route: {
          canDeleteProject,
          canManageProject,
          isGroupLoading: isGroupRouteLoading,
          isProjectLoading: isProjectRouteLoading,
          view,
        },
        state: {
          activeChatMatchIndex,
          activeGroupId,
          activeProjectId,
          busyAction,
          chatSearchQuery,
          composer,
          composerCursor,
          composerRef,
          currentAvatarUrl,
          currentUserDesignation,
          currentUserEmail,
          currentUserName,
          emojiPickerOpen,
          fileInputRef,
          flashingMessageId,
          logoutConfirmOpen,
          memoryImportOpen,
          mentionIndex,
          mentionOptionRefs,
          mobileNavOpen,
          navCollapsed,
          projectSearchFilter,
          projectSearchOpen,
          projectSearchQuery,
          railCollapsed,
          railWidth,
          replyToMessage,
          searchOpen,
          showJumpToLatest,
          threadScrollRef,
          uiError,
          voiceRecordingActive,
        },
        threadInteractions,
        update: {
          onActionError: setActionError,
          onComposerChange: (value, cursor) => {
            setComposer(value)
            setComposerCursor(cursor)
          },
          onMemoryImportBusyChange: (busy) => {
            setBusyAction(busy ? 'memory-import' : null)
            if (busy) setUiError(null)
          },
          onOpenProjectSearch: () => {
            setMobileNavOpen(false)
            setProjectSearchOpen(true)
          },
          onSearchClose: () => {
            setChatSearchQuery('')
            setSearchOpen(false)
            requestAnimationFrame(() => composerRef.current?.focus({ preventScroll: true }))
          },
          onSearchToggle: () => {
            setSearchOpen((open) => !open)
            if (searchOpen) setChatSearchQuery('')
          },
          onSignOut: () => void handleSignOut(),
          setActiveChatMatchIndex,
          setChatSearchQuery,
          setComposerCursor,
          setEmojiPickerOpen,
          setMemoryImportOpen,
          setMentionIndex,
          setMobileNavOpen,
          setNavCollapsed,
          setLogoutConfirmOpen,
          setProjectSearchFilter,
          setProjectSearchOpen,
          setProjectSearchQuery,
          setRailCollapsed,
          setRailResizing,
          setReplyToMessage,
          setVoiceRecordingActive,
        },
      }}
    />
  )
}
