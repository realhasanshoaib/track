import { useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import type { Dispatch, RefObject, SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import '#/i18n'

import type { Doc, Id } from '../../../../../../convex/_generated/dataModel'
import type { GroupMessageItem } from '../thread-items'
import { findVisibleRouteGroupId } from '../lib/route-state'
import { getResolvedTrackUserId, setResolvedTrackUserId } from '../workspace-session'

type WorkspaceView = 'home' | 'project' | 'group' | 'settings'
type SessionUser = { id: string; email: string; name: string }

export function useWorkspaceSynchronization({
  acceptPendingInvitations,
  activeGroupId,
  activeMentionQuery,
  activeProjectId,
  currentTrackProfileIncomplete,
  currentTrackUser,
  devAuthEnabled,
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
}: {
  acceptPendingInvitations: (args: { userId: Id<'users'> }) => Promise<unknown>
  activeGroupId: Id<'groups'> | null
  activeMentionQuery: string | undefined
  activeProjectId: Id<'projects'> | null
  currentTrackProfileIncomplete: boolean
  currentTrackUser: Doc<'users'> | null | undefined
  devAuthEnabled: boolean
  ensureStarterProject: (args: { userId: Id<'users'> }) => Promise<Id<'projects'>>
  groups: Array<Doc<'groups'>> | undefined
  mentionIndex: number
  mentionOptionRefs: RefObject<Array<HTMLButtonElement | null>>
  navCollapsed: boolean
  projectItems: Array<{ project: Doc<'projects'>; membership: Doc<'projectMembers'> }>
  projects: unknown[] | undefined
  railResizing: boolean
  routeGroupId: Id<'groups'> | undefined
  routeProjectId: Id<'projects'> | undefined
  sessionUser: SessionUser | null
  setActiveGroupId: Dispatch<SetStateAction<Id<'groups'> | null>>
  setActiveProjectId: Dispatch<SetStateAction<Id<'projects'> | null>>
  setActionError: (error: unknown) => void
  setLogoutConfirmOpen: Dispatch<SetStateAction<boolean>>
  setMentionIndex: Dispatch<SetStateAction<number>>
  setRailResizing: Dispatch<SetStateAction<boolean>>
  setRailWidth: Dispatch<SetStateAction<number>>
  setReplyToMessage: Dispatch<SetStateAction<GroupMessageItem | null>>
  setShowJumpToLatest: Dispatch<SetStateAction<boolean>>
  setTrackUserId: Dispatch<SetStateAction<Id<'users'> | null>>
  setUiError: Dispatch<SetStateAction<string | null>>
  showMentionMenu: boolean
  syncCurrentUser: (args: {
    googleSubject: string
    email: string
    displayName: string
  }) => Promise<Id<'users'>>
  syncDevUser: () => Promise<Id<'users'>>
  trackUserId: Id<'users'> | null
  view: WorkspaceView
  visibleGroups: Array<Doc<'groups'>>
}) {
  const { t } = useTranslation('workspace')
  const navigate = useNavigate()

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('track-nav-collapsed', String(navCollapsed))
  }, [navCollapsed])

  useEffect(() => setLogoutConfirmOpen(false), [navCollapsed, setLogoutConfirmOpen])
  useEffect(() => setMentionIndex(0), [activeMentionQuery, setMentionIndex])

  useEffect(() => {
    if (!showMentionMenu) return
    mentionOptionRefs.current[mentionIndex]?.scrollIntoView({ block: 'nearest' })
  }, [mentionIndex, mentionOptionRefs, showMentionMenu])

  useEffect(() => setReplyToMessage(null), [activeGroupId, setReplyToMessage])

  useEffect(() => {
    if (!railResizing) return
    function handlePointerMove(event: PointerEvent) {
      setRailWidth(Math.min(460, Math.max(280, window.innerWidth - event.clientX)))
    }
    function handlePointerUp() {
      setRailResizing(false)
    }
    document.body.classList.add('track-rail-resizing')
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp, { once: true })
    return () => {
      document.body.classList.remove('track-rail-resizing')
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [railResizing, setRailResizing, setRailWidth])

  useEffect(() => {
    if (routeProjectId && routeProjectId !== activeProjectId) setActiveProjectId(routeProjectId)
  }, [activeProjectId, routeProjectId, setActiveProjectId])

  useEffect(() => {
    if (!sessionUser?.id) {
      setTrackUserId(null)
      return
    }
    const cachedTrackUserId = getResolvedTrackUserId(sessionUser.id)
    if (cachedTrackUserId) {
      if (trackUserId !== cachedTrackUserId) setTrackUserId(cachedTrackUserId)
      return
    }
    if (trackUserId) return
    const syncUser = devAuthEnabled
      ? syncDevUser()
      : syncCurrentUser({
          googleSubject: sessionUser.id,
          email: sessionUser.email,
          displayName: sessionUser.name,
        })
    void syncUser.then(async (userId) => {
      setResolvedTrackUserId(sessionUser.id, userId)
      setTrackUserId(userId)
      await acceptPendingInvitations({ userId })
    }).catch(setActionError)
  }, [acceptPendingInvitations, devAuthEnabled, sessionUser, setActionError, setTrackUserId, syncCurrentUser, syncDevUser, trackUserId])

  useEffect(() => {
    if (!trackUserId || projects === undefined || projectItems.length > 0) return
    if (currentTrackProfileIncomplete) return
    void ensureStarterProject({ userId: trackUserId }).then((starterProjectId) => {
      setActiveProjectId(starterProjectId)
      void navigate({ to: '/workspace/projects/$projectId', params: { projectId: starterProjectId } })
    }).catch(setActionError)
  }, [currentTrackProfileIncomplete, ensureStarterProject, navigate, projectItems.length, projects, setActionError, setActiveProjectId, trackUserId])

  useEffect(() => {
    if (!trackUserId || currentTrackUser === undefined || !currentTrackProfileIncomplete) return
    const next = `${window.location.pathname}${window.location.search}`
    window.location.href = `/onboarding/profile?next=${encodeURIComponent(next)}`
  }, [currentTrackProfileIncomplete, currentTrackUser, trackUserId])

  useEffect(() => {
    if (!projectItems.length || activeProjectId) return
    const firstProjectId = projectItems[0]?.project._id ?? null
    setActiveProjectId(firstProjectId)
    if (view === 'home' && firstProjectId) {
      void navigate({ to: '/workspace/projects/$projectId', params: { projectId: firstProjectId } })
    }
  }, [activeProjectId, navigate, projectItems, setActiveProjectId, view])

  useEffect(() => {
    if (routeProjectId && activeProjectId !== routeProjectId) return
    if (view !== 'group') {
      setActiveGroupId(null)
      setShowJumpToLatest(false)
      return
    }
    if (routeGroupId) {
      if (groups === undefined) return
      const visibleRouteGroupId = findVisibleRouteGroupId(routeGroupId, visibleGroups)
      if (visibleRouteGroupId) {
        if (activeGroupId !== visibleRouteGroupId) setActiveGroupId(visibleRouteGroupId)
        return
      }
      if (activeGroupId !== null) setActiveGroupId(null)
      const firstGroupId = visibleGroups[0]?._id
      const projectIdToOpen = activeProjectId ?? routeProjectId
      if (firstGroupId && projectIdToOpen) {
        void navigate({ to: '/workspace/projects/$projectId/groups/$groupId', params: { groupId: firstGroupId, projectId: projectIdToOpen } })
      } else if (!visibleGroups.length) {
        setUiError(t('errors.groupNotVisible'))
      }
      return
    }
    if (groups === undefined) return
    if (!visibleGroups.length) {
      setActiveGroupId(null)
      return
    }
    if (!activeGroupId || !visibleGroups.some((group) => group._id === activeGroupId)) {
      setActiveGroupId(visibleGroups[0]?._id ?? null)
    }
  }, [activeGroupId, activeProjectId, groups, navigate, routeGroupId, routeProjectId, setActiveGroupId, setShowJumpToLatest, setUiError, t, view, visibleGroups])

  useEffect(() => {
    const firstGroupId = visibleGroups[0]?._id
    if (routeProjectId && activeProjectId !== routeProjectId) return
    if (view !== 'project' || groups === undefined || !activeProjectId || !firstGroupId) return
    void navigate({ to: '/workspace/projects/$projectId/groups/$groupId', params: { groupId: firstGroupId, projectId: activeProjectId } })
  }, [activeProjectId, groups, navigate, routeProjectId, view, visibleGroups])
}
