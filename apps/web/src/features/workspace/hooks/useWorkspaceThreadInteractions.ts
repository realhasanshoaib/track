import { useCallback, useEffect, useRef } from 'react'
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react'

import type { Id } from '../../../../../../convex/_generated/dataModel'
import type { GroupMessageItem } from '../thread-items'
import type { ChatSearchMatch } from '../search/chat-search'
import type { ProjectSearchResult } from '../search/ProjectSearchDialog'

type ActiveMention = { start: number; end: number } | null

export function useWorkspaceThreadInteractions({
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
  messagesLoaded,
  navigateToGroup,
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
}: {
  activeChatMatch: ChatSearchMatch | null
  activeChatMatchIndex: number
  activeGroupId: Id<'groups'> | null
  activeMention: ActiveMention
  activeProjectId: Id<'projects'> | null
  chatSearchMatches: Array<ChatSearchMatch>
  chatSearchQuery: string
  chatSearchTerm: string
  clearPendingAttachments: () => void
  composer: string
  composerCursor: number
  composerRef: RefObject<HTMLTextAreaElement | null>
  flashMessageTimeoutRef: MutableRefObject<ReturnType<typeof setTimeout> | null>
  lastLoadedGroupIdRef: MutableRefObject<Id<'groups'> | null>
  latestThreadItemKey: string | null
  messagesLoaded: boolean
  navigateToGroup: (groupId: Id<'groups'>) => void
  openProjectSearch: () => void
  pendingFocusMessageId: Id<'messages'> | null
  setActiveChatMatchIndex: Dispatch<SetStateAction<number>>
  setComposer: Dispatch<SetStateAction<string>>
  setComposerCursor: Dispatch<SetStateAction<number>>
  setComposerFocused: (focused: boolean) => void
  setFlashingMessageId: Dispatch<SetStateAction<string | null>>
  setMentionIndex: Dispatch<SetStateAction<number>>
  setMobileNavOpen: Dispatch<SetStateAction<boolean>>
  setPendingFocusMessageId: Dispatch<SetStateAction<Id<'messages'> | null>>
  setProjectSearchOpen: Dispatch<SetStateAction<boolean>>
  setProjectSearchQuery: Dispatch<SetStateAction<string>>
  setReplyToMessage: Dispatch<SetStateAction<GroupMessageItem | null>>
  setSearchOpen: Dispatch<SetStateAction<boolean>>
  setShowJumpToLatest: Dispatch<SetStateAction<boolean>>
  shouldFollowLatestRef: MutableRefObject<boolean>
  threadScrollRef: RefObject<HTMLDivElement | null>
  view: 'home' | 'project' | 'group' | 'settings'
  visibleMessages: Array<GroupMessageItem>
}) {
  const focusedPendingMessageIdRef = useRef<Id<'messages'> | null>(null)
  const scrollThreadToLatest = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const scrollElement = threadScrollRef.current
    if (!scrollElement) return
    scrollElement.scrollTo({ top: scrollElement.scrollHeight, behavior })
    shouldFollowLatestRef.current = true
    setShowJumpToLatest(false)
  }, [setShowJumpToLatest, shouldFollowLatestRef, threadScrollRef])

  const scrollThreadItemIntoView = useCallback((threadItemKey: string, behavior: ScrollBehavior = 'smooth') => {
    const target = threadScrollRef.current?.querySelector<HTMLElement>(
      `[data-thread-item-key="${CSS.escape(threadItemKey)}"]`,
    )
    if (!target) return
    target.scrollIntoView({ behavior, block: 'center' })
    shouldFollowLatestRef.current = false
    setShowJumpToLatest(true)
  }, [setShowJumpToLatest, shouldFollowLatestRef, threadScrollRef])

  const requestThreadScrollToLatest = useCallback((behavior: ScrollBehavior = 'smooth') => {
    requestAnimationFrame(() => requestAnimationFrame(() => scrollThreadToLatest(behavior)))
  }, [scrollThreadToLatest])

  const requestThreadItemScroll = useCallback((threadItemKey: string, behavior: ScrollBehavior = 'smooth') => {
    requestAnimationFrame(() => requestAnimationFrame(() => scrollThreadItemIntoView(threadItemKey, behavior)))
  }, [scrollThreadItemIntoView])

  const requestMessageFlash = useCallback((messageId: Id<'messages'> | string) => {
    if (flashMessageTimeoutRef.current) clearTimeout(flashMessageTimeoutRef.current)
    setFlashingMessageId(String(messageId))
    flashMessageTimeoutRef.current = setTimeout(() => {
      setFlashingMessageId(null)
      flashMessageTimeoutRef.current = null
    }, 1500)
  }, [flashMessageTimeoutRef, setFlashingMessageId])

  const requestMessageFocus = useCallback((messageId: Id<'messages'> | string, behavior: ScrollBehavior = 'smooth') => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      document.getElementById(`message-${messageId}`)?.scrollIntoView({ behavior, block: 'center' })
      requestMessageFlash(messageId)
    }))
  }, [requestMessageFlash])

  const focusComposer = useCallback(() => {
    requestAnimationFrame(() => composerRef.current?.focus({ preventScroll: true }))
  }, [composerRef])

  useEffect(() => {
    if (view !== 'group' || !messagesLoaded) return
    if (lastLoadedGroupIdRef.current === activeGroupId) return
    lastLoadedGroupIdRef.current = activeGroupId
    shouldFollowLatestRef.current = true
    requestThreadScrollToLatest('auto')
    focusComposer()
  }, [activeGroupId, focusComposer, lastLoadedGroupIdRef, messagesLoaded, requestThreadScrollToLatest, shouldFollowLatestRef, view])

  useEffect(() => {
    if (view !== 'group') lastLoadedGroupIdRef.current = null
  }, [lastLoadedGroupIdRef, view])

  useEffect(() => {
    if (view !== 'group') return
    focusComposer()
  }, [focusComposer, view])

  useEffect(() => {
    if (view === 'group' && !chatSearchQuery.trim() && latestThreadItemKey !== null && shouldFollowLatestRef.current) {
      requestThreadScrollToLatest('smooth')
    }
  }, [chatSearchQuery, latestThreadItemKey, requestThreadScrollToLatest, shouldFollowLatestRef, view])

  useEffect(() => {
    if (!chatSearchTerm) return
    setActiveChatMatchIndex(0)
  }, [chatSearchTerm, setActiveChatMatchIndex])

  useEffect(() => {
    if (activeChatMatchIndex < chatSearchMatches.length) return
    setActiveChatMatchIndex(Math.max(chatSearchMatches.length - 1, 0))
  }, [activeChatMatchIndex, chatSearchMatches.length, setActiveChatMatchIndex])

  useEffect(() => {
    if (view !== 'group' || !activeChatMatch) return
    requestThreadItemScroll(activeChatMatch.key)
    if (activeChatMatch.kind === 'message' && activeChatMatch.messageId) requestMessageFlash(activeChatMatch.messageId)
  }, [activeChatMatch, requestMessageFlash, requestThreadItemScroll, view])

  useEffect(() => {
    if (view !== 'group' || !pendingFocusMessageId || !messagesLoaded) return
    if (!visibleMessages.some((item) => item.message._id === pendingFocusMessageId)) return
    if (focusedPendingMessageIdRef.current === pendingFocusMessageId) return
    requestMessageFocus(pendingFocusMessageId)
    focusedPendingMessageIdRef.current = pendingFocusMessageId
  }, [messagesLoaded, pendingFocusMessageId, requestMessageFocus, view, visibleMessages])

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        openProjectSearch()
      }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [openProjectSearch])

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (view !== 'group' || event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target
      const isEditable = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable)
      const isEmptyComposer = composerRef.current !== null && target === composerRef.current && !composerRef.current.value.trim()
      if (isEditable && !isEmptyComposer) return
      event.preventDefault()
      setSearchOpen(true)
      requestAnimationFrame(() => document.querySelector<HTMLInputElement>('.track-chat-search-popover-input')?.focus())
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [composerRef, setSearchOpen, view])

  function handleMessageSent() {
    setComposer('')
    setComposerCursor(0)
    setReplyToMessage(null)
    clearPendingAttachments()
    shouldFollowLatestRef.current = true
    requestThreadScrollToLatest('smooth')
    requestAnimationFrame(() => composerRef.current?.focus({ preventScroll: true }))
  }

  function handleReplyMessage(item: GroupMessageItem) {
    if (item.message.groupId !== activeGroupId) return
    setReplyToMessage(item)
    requestAnimationFrame(() => composerRef.current?.focus({ preventScroll: true }))
  }

  function handleOpenMessageSource(groupId: Id<'groups'>, messageId: Id<'messages'>) {
    if (!activeProjectId) return
    navigateToGroup(groupId)
    setPendingFocusMessageId(messageId)
    if (groupId === activeGroupId) requestMessageFocus(messageId)
  }

  function handleThreadScroll() {
    const element = threadScrollRef.current
    if (!element) return
    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight
    shouldFollowLatestRef.current = distanceFromBottom < 180
    setShowJumpToLatest(distanceFromBottom > 220)
  }

  function handleComposerSelection() {
    setComposerCursor(composerRef.current?.selectionStart ?? composer.length)
  }

  function handleComposerFocus() {
    setComposerFocused(true)
    handleComposerSelection()
  }

  function handleComposerBlur() {
    handleComposerSelection()
    setComposerFocused(false)
  }

  function handleMentionSelect(option: { handle: string }) {
    if (!activeMention) return
    const nextComposer = `${composer.slice(0, activeMention.start)}@${option.handle} ${composer.slice(activeMention.end)}`
    const nextCursor = activeMention.start + option.handle.length + 2
    setComposer(nextComposer)
    setComposerCursor(nextCursor)
    setMentionIndex(0)
    requestAnimationFrame(() => {
      composerRef.current?.focus()
      composerRef.current?.setSelectionRange(nextCursor, nextCursor)
    })
  }

  function insertComposerText(text: string) {
    const cursor = composerRef.current?.selectionStart ?? composerCursor
    const nextComposer = `${composer.slice(0, cursor)}${text}${composer.slice(cursor)}`
    const nextCursor = cursor + text.length
    setComposer(nextComposer)
    setComposerCursor(nextCursor)
    requestAnimationFrame(() => {
      composerRef.current?.focus()
      composerRef.current?.setSelectionRange(nextCursor, nextCursor)
    })
  }

  function cycleChatSearchMatch(direction: 1 | -1) {
    if (!chatSearchMatches.length) return
    setActiveChatMatchIndex((index) => (index + direction + chatSearchMatches.length) % chatSearchMatches.length)
  }

  function handleProjectSearchResult(result: ProjectSearchResult) {
    setProjectSearchOpen(false)
    setProjectSearchQuery('')
    setMobileNavOpen(false)

    if (!result.groupId) return
    navigateToGroup(result.groupId)
    if (!result.messageId) return
    setPendingFocusMessageId(result.messageId)
    if (result.groupId === activeGroupId) requestMessageFocus(result.messageId)
  }

  return {
    cycleChatSearchMatch,
    handleComposerBlur,
    handleComposerFocus,
    handleComposerSelection,
    handleMentionSelect,
    handleMessageSent,
    handleOpenMessageSource,
    handleProjectSearchResult,
    handleReplyMessage,
    handleThreadScroll,
    insertComposerText,
    requestMessageFocus,
    scrollThreadToLatest,
  }
}
