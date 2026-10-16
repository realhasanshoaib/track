import { useNavigate } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'

import { api } from '../../../../../../convex/_generated/api'
import type { Id } from '../../../../../../convex/_generated/dataModel'
import { getActiveMention } from '#/features/workspace/identity'
import {
  clearAllComposerDrafts,
  clearComposerDraft,
  getComposerDraftKey,
  readComposerDraft,
  writeComposerDraft,
} from '#/features/workspace/chat/composer-drafts'
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
import type { ProjectSearchFilter, ProjectSearchResult } from '#/features/workspace/search/ProjectSearchDialog'
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
  const navigate = useNavigate()
  const session = authClient.useSession()
  const syncCurrentUser = useMutation(api.auth.syncGoogleUser)
  const syncDevUser = useMutation(api.auth.syncDevUser)
  const ensureStarterProject = useMutation(api.projects.ensureStarter)
  const acceptPendingInvitations = useMutation(api.invitations.acceptPendingForCurrentUser)
  const markGroupRead = useMutation(api.mobile.markGroupRead)

  const [trackUserId, setTrackUserId] = useState<Id<'users'> | null>(() => {
    const sessionUser = getSessionUser(authClient.getSessionData?.())
    return sessionUser ? getResolvedTrackUserId(sessionUser.id) : null
  })
  const [activeProjectId, setActiveProjectId] = useState<Id<'projects'> | null>(null)
  const [activeGroupId, setActiveGroupId] = useState<Id<'groups'> | null>(null)
  const [composerState, setComposerState] = useState<{ scopeKey: string | null; value: string }>({ scopeKey: null, value: '' })
  const [replyState, setReplyState] = useState<{ scopeKey: string | null; value: GroupMessageItem | null }>({ scopeKey: null, value: null })
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [uiError, setUiError] = useState<string | null>(null)
  const [composerCursorState, setComposerCursorState] = useState<{ scopeKey: string | null; value: number }>({ scopeKey: null, value: 0 })
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
  const [pendingFocusMessageId, setPendingFocusMessageId] = useState<Id<'messages'> | null>(null)
  const [tabVisible, setTabVisible] = useState(
    () => typeof document === 'undefined' || document.visibilityState === 'visible',
  )
  const [voiceRecordingActive, setVoiceRecordingActive] = useState(false)
  const navigation = useWorkspaceNavigation({ activeProjectId, setActiveGroupId, setMobileNavOpen })
  const { navigateToGroup, navigateToProject, navigateToProjectSettings } = navigation
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const composerRef = useRef<HTMLTextAreaElement | null>(null)
  const projectSearchReturnFocusRef = useRef<HTMLElement | null>(null)
  const threadScrollRef = useRef<HTMLDivElement | null>(null)
  const mentionOptionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const shouldFollowLatestRef = useRef(true)
  const lastLoadedGroupIdRef = useRef<Id<'groups'> | null>(null)
  const flashMessageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const historyAnchorRef = useRef<{ count: number; height: number; top: number } | null>(null)
  const historyLoadingRef = useRef(false)
  const viewedGroupSequenceRef = useRef(0)
  const acknowledgedGroupSequenceRef = useRef(0)
  const groupReadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const previousReadGroupIdRef = useRef<Id<'groups'> | null>(null)
  const openProjectSearch = useCallback(() => {
    const activeElement = typeof document === 'undefined' ? null : document.activeElement
    projectSearchReturnFocusRef.current = activeElement instanceof HTMLElement ? activeElement : null
    setMobileNavOpen(false)
    setProjectSearchOpen(true)
  }, [])
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
    const timeoutRef = flashMessageTimeoutRef
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  const routeProjectId = projectId as Id<'projects'> | undefined
  const routeGroupId = groupId as Id<'groups'> | undefined
  const devAuthBypass = useDevAuthBypass()
  const sessionUser = useMemo(
    () => getSessionUser(session.data ?? devAuthBypass.sessionData),
    [devAuthBypass.sessionData, session.data],
  )
  const hasSessionAccess = Boolean(session.data || devAuthBypass.enabled)
  const oauthCallbackPending = useOAuthCallbackPending(hasSessionAccess)
  const workspaceData = useWorkspaceData({
    activeGroupId,
    activeProjectId,
    projectSearchFilter,
    projectSearchOpen,
    projectSearchQuery,
    targetMessageId: pendingFocusMessageId,
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
    groupMessages,
    groups,
    hasMoreMessages,
    loadMoreMessages,
    messagePageStatus,
    messages,
    projectItems,
    projectMembers,
    projectSearchResults,
    projects,
    visibleGroups,
  } = workspaceData
  const loadingOlderMessages = messagePageStatus === 'LoadingMore'

  useEffect(() => {
    if (previousReadGroupIdRef.current === confirmedActiveGroupId) return
    previousReadGroupIdRef.current = confirmedActiveGroupId
    historyLoadingRef.current = false
    historyAnchorRef.current = null
    viewedGroupSequenceRef.current = 0
    acknowledgedGroupSequenceRef.current = 0
  }, [confirmedActiveGroupId])

  const loadOlderMessages = useCallback(() => {
    const element = threadScrollRef.current
    if (!element || !hasMoreMessages || messagePageStatus !== 'CanLoadMore' || historyLoadingRef.current) return
    historyLoadingRef.current = true
    historyAnchorRef.current = {
      height: element.scrollHeight,
      count: (messages?.length ?? 0),
      top: element.scrollTop,
    }
    loadMoreMessages(80)
  }, [hasMoreMessages, loadMoreMessages, messagePageStatus, messages])

  useEffect(() => {
    const anchor = historyAnchorRef.current
    if (!anchor || !messages || messagePageStatus === 'LoadingMore') return
    const currentCount = messages.length
    if (currentCount <= anchor.count && messagePageStatus !== 'Exhausted') return
    historyAnchorRef.current = null
    historyLoadingRef.current = false
    requestAnimationFrame(() => {
      const element = threadScrollRef.current
      if (!element) return
      element.scrollTop = anchor.top + (element.scrollHeight - anchor.height)
    })
  }, [messagePageStatus, messages])

  useEffect(() => {
    if (typeof document === 'undefined') return () => {}
    const handleVisibilityChange = () => setTabVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])
  const composerDraftScope = useMemo(
    () => trackUserId && activeProjectId && confirmedActiveGroupId
      ? {
          actorId: trackUserId,
          groupId: confirmedActiveGroupId,
          projectId: activeProjectId,
          projectMemberId: activeProject?.membership._id,
        }
      : null,
    [activeProject?.membership._id, activeProjectId, confirmedActiveGroupId, trackUserId],
  )
  const composerScopeKey = composerDraftScope ? getComposerDraftKey(composerDraftScope) : null
  const composerDraft = useMemo(
    () => composerDraftScope ? readComposerDraft(composerDraftScope) : null,
    [composerDraftScope],
  )
  const composer = composerState.scopeKey === composerScopeKey
    ? composerState.value
    : composerDraft?.composer ?? ''
  const setComposer = useCallback<Dispatch<SetStateAction<string>>>((nextComposer) => {
    setComposerState((current) => {
      const currentValue = current.scopeKey === composerScopeKey
        ? current.value
        : composerDraft?.composer ?? ''
      const nextValue = typeof nextComposer === 'function' ? nextComposer(currentValue) : nextComposer
      return current.scopeKey === composerScopeKey && current.value === nextValue
        ? current
        : { scopeKey: composerScopeKey, value: nextValue }
    })
  }, [composerDraft?.composer, composerScopeKey])
  const composerCursor = composerCursorState.scopeKey === composerScopeKey
    ? composerCursorState.value
    : composer.length
  const setComposerCursor = useCallback<Dispatch<SetStateAction<number>>>((nextCursor) => {
    setComposerCursorState((current) => {
      const currentValue = current.scopeKey === composerScopeKey ? current.value : composer.length
      const nextValue = typeof nextCursor === 'function' ? nextCursor(currentValue) : nextCursor
      return current.scopeKey === composerScopeKey && current.value === nextValue
        ? current
        : { scopeKey: composerScopeKey, value: nextValue }
    })
  }, [composer, composerScopeKey])
  const draftReply = composerDraft?.replyToMessageId
    ? groupMessages.find((item) => item.message._id === composerDraft.replyToMessageId) ?? null
    : null
  const replyToMessage = replyState.scopeKey === composerScopeKey ? replyState.value : draftReply
  const setReplyToMessage = useCallback<Dispatch<SetStateAction<GroupMessageItem | null>>>((nextReply) => {
    setReplyState((current) => {
      const currentValue = current.scopeKey === composerScopeKey ? current.value : null
      const nextValue = typeof nextReply === 'function' ? nextReply(currentValue) : nextReply
      return current.scopeKey === composerScopeKey && current.value === nextValue
        ? current
        : { scopeKey: composerScopeKey, value: nextValue }
    })
  }, [composerScopeKey])
  const previousComposerScopeKeyRef = useRef<string | null>(null)
  const previousComposerDraftScopeRef = useRef<typeof composerDraftScope>(null)
  const mentionOptions = useMemo(
    () => buildWorkspaceMentionOptions(activeChannelMembers, visibleGroups),
    [activeChannelMembers, visibleGroups],
  )
  const mentionGroups = useMemo(
    () => buildMentionGroups(activeChannelMembers, visibleGroups),
    [activeChannelMembers, visibleGroups],
  )
  const forwardMentionOptions = useMemo(
    () => buildWorkspaceMentionOptions(activeProjectMembers, visibleGroups),
    [activeProjectMembers, visibleGroups],
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
    () => buildMentionSections(filteredMentionOptions),
    [filteredMentionOptions],
  )
  const showMentionMenu = activeMention !== null && filteredMentionOptions.length > 0
  const composerHasTypingText = composer.trim().length > 0
  const presentation = useWorkspacePresentationData({
    activeChatMatchIndex,
    activeChannelMembers,
    activeGroup,
    chatSearchQuery,
    currentUserId: trackUserId,
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

  const navigateToSearchResult = useCallback((result: ProjectSearchResult) => {
    if (!activeProjectId) return

    if (result.threadId && result.groupId) {
      void navigate({
        to: '/workspace/projects/$projectId/groups/$groupId/threads/$threadId',
        params: {
          groupId: result.groupId,
          projectId: activeProjectId,
          threadId: result.threadId,
        },
        search: { companyId: '', membershipId: '' },
        hash: result.messageId ? `message-${result.messageId}` : undefined,
      })
    }
  }, [activeProjectId, navigate])

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

  useEffect(() => {
    const previousKey = previousComposerScopeKeyRef.current
    if (
      previousKey &&
      composerScopeKey === null &&
      groups !== undefined &&
      activeGroupId !== null &&
      confirmedActiveGroupId === null
    ) {
      const previousDraftScope = previousComposerDraftScopeRef.current
      if (previousDraftScope) clearComposerDraft(previousDraftScope)
    }
    previousComposerScopeKeyRef.current = composerScopeKey
    previousComposerDraftScopeRef.current = composerDraftScope
  }, [activeGroupId, composerDraftScope, composerScopeKey, confirmedActiveGroupId, groups])

  useEffect(() => {
    if (!composerDraftScope || !composerScopeKey) return
    writeComposerDraft(composerDraftScope, {
      composer,
      replyToMessageId: replyToMessage?.message._id ?? null,
    })
  }, [composer, composerDraftScope, composerScopeKey, replyToMessage])

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
  const currentUserName = currentTrackUser?.displayName ?? sessionUser?.name ?? 'Track User'
  const currentUserEmail = currentTrackUser?.email ?? sessionUser?.email ?? currentUserName
  const currentUserDesignation = currentTrackUser?.profileDesignation ?? activeProject?.membership.role ?? 'owner'
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
    navigateToSearchResult,
    openProjectSearch,
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

  useEffect(() => {
    const scrollElement = threadScrollRef.current
    if (
      view !== 'group' ||
      !scrollElement ||
      !tabVisible ||
      !trackUserId ||
      !activeGroupId ||
      activeGroup?.status === 'archived'
    ) return () => {}
    const messageBySequence = new Map(
      visibleMessages.flatMap((item) => item.message.channelSequence
        ? [[item.message.channelSequence, item.message._id] as const]
        : []),
    )
    const observer = new IntersectionObserver((entries) => {
      let highestSequence = viewedGroupSequenceRef.current
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        const sequenceValue = entry.target.getAttribute('data-channel-sequence')
        const sequence = sequenceValue ? Number(sequenceValue) : 0
        if (Number.isInteger(sequence)) highestSequence = Math.max(highestSequence, sequence)
      }
      if (highestSequence <= acknowledgedGroupSequenceRef.current) return
      viewedGroupSequenceRef.current = highestSequence
      if (groupReadTimeoutRef.current) return
      groupReadTimeoutRef.current = setTimeout(() => {
        groupReadTimeoutRef.current = null
        const messageId = messageBySequence.get(viewedGroupSequenceRef.current)
        if (!messageId || viewedGroupSequenceRef.current <= acknowledgedGroupSequenceRef.current) return
        const acknowledgedSequence = viewedGroupSequenceRef.current
        acknowledgedGroupSequenceRef.current = acknowledgedSequence
        void markGroupRead({
          groupId: activeGroupId,
          lastReadMessageId: messageId,
          userId: trackUserId,
        }).catch(() => {
          acknowledgedGroupSequenceRef.current = Math.min(acknowledgedGroupSequenceRef.current, acknowledgedSequence - 1)
        })
      }, 150)
    }, { root: scrollElement, threshold: 0.6 })
    for (const element of scrollElement.querySelectorAll<HTMLElement>('[data-channel-sequence]')) {
      observer.observe(element)
    }
    return () => observer.disconnect()
  }, [activeGroup?.status, activeGroupId, markGroupRead, tabVisible, trackUserId, view, visibleMessages])

  useEffect(() => () => {
    if (groupReadTimeoutRef.current) clearTimeout(groupReadTimeoutRef.current)
  }, [])

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
    onGroupUpdated: () => {},
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
    onProjectUpdated: () => {},
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

  function setActionError(error: unknown) {
    setUiError(error instanceof Error ? error.message : 'Something went wrong')
  }

  async function handleSignOut() {
    setLogoutConfirmOpen(false)
    disableDevAuthBypass()
    clearResolvedTrackUserIds()
    clearAllComposerDrafts()
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
        projectSearchReturnFocusRef,
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
          loadingOlderMessages,
          logoutConfirmOpen,
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
          loadOlderMessages,
          onActionError: setActionError,
          onComposerChange: (value, cursor) => {
            setComposer(value)
            setComposerCursor(cursor)
          },
          onOpenProjectSearch: openProjectSearch,
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
