import { parseMentions } from '@track/shared'
import { useMutation, usePaginatedQuery, useQuery } from 'convex/react'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'

import { api } from '../../../../../convex/_generated/api'
import type { Doc, Id } from '../../../../../convex/_generated/dataModel'
import TrackLoader from '#/components/TrackLoader'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Textarea } from '#/components/ui/textarea'
import { CompanyProjectNavigation } from '#/features/company/CompanyProjectNavigation'
import {
  getComposerDraftKey,
  readComposerDraft,
  writeComposerDraft,
} from '#/features/workspace/chat/composer-drafts'
import { isUploadResponse } from '#/features/workspace/chat/message-send'
import { getMentionHandle } from '#/features/workspace/identity'
import { MarkdownText } from '#/features/workspace/markdown'
import {
  CreateTaskFromMessage,
  MessageInlineTasks,
} from '#/features/tasks/ConversationTaskActions'
import { TaskLinkBatchProvider } from '#/features/tasks/task-link-context'
import { useReleaseConfigState } from '#/lib/release-config'
import type { RepresentedThreadContext } from './thread-navigation'
import './thread-workspace.css'

export function ThreadConversationPage({
  context,
  groupId,
  projectId,
  threadId,
}: {
  context?: RepresentedThreadContext
  groupId: Id<'groups'>
  projectId: Id<'projects'>
  threadId: Id<'channelThreads'>
}) {
  const releaseState = useReleaseConfigState()
  const releaseConfig = releaseState.config
  const currentUser = useQuery(api.auth.getCurrentUser)
  const navigation = useQuery(
    api.mobile.resolveNavigation,
    currentUser && releaseConfig.threads
      ? {
          projectId,
          groupId,
          userId: currentUser._id,
          actingCompanyId: context?.actingCompanyId,
          projectMemberId: context?.projectMemberId,
        }
      : 'skip',
  )
  const scopedArgs = useMemo(() => currentUser && navigation?.available
    ? {
        threadId,
        userId: currentUser._id,
        actingCompanyId: context?.actingCompanyId,
        projectMemberId: context?.projectMemberId,
      }
    : null, [context?.actingCompanyId, context?.projectMemberId, currentUser, navigation?.available, threadId])
  const thread = useQuery(api.channelThreads.get, scopedArgs ?? 'skip')
  const targetMessageId = typeof window !== 'undefined' && window.location.hash.startsWith('#message-')
    ? decodeURIComponent(window.location.hash.slice('#message-'.length)) as Id<'messages'>
    : undefined
  const {
    results: messages,
    status: messagePageStatus,
    loadMore: loadMoreMessages,
  } = usePaginatedQuery(
    api.channelThreads.listMessagePage,
    scopedArgs ? { ...scopedArgs, targetMessageId } : 'skip',
    { initialNumItems: 50 },
  )
  const combinedMessagePageStatus = messagePageStatus
  const projectMembersPage = usePaginatedQuery(
    api.mobile.listProjectMembersPage,
    currentUser && navigation?.available
      ? {
          projectId,
          userId: currentUser._id,
          actingCompanyId: context?.actingCompanyId,
          projectMemberId: context?.projectMemberId,
        }
      : 'skip',
    { initialNumItems: 100 },
  )
  const projectMembers = projectMembersPage.status === 'LoadingFirstPage'
    ? undefined
    : projectMembersPage.results
  const sendMessage = useMutation(api.messages.send)
  const setFollowing = useMutation(api.channelThreads.setFollowing)
  const markRead = useMutation(api.channelThreads.markRead)
  const setStatus = useMutation(api.channelThreads.setStatus)
  const rename = useMutation(api.channelThreads.rename)
  const generateUploadUrl = useMutation(api.messages.generateUploadUrl)
  const claimUploadIntent = useMutation(api.messages.claimUploadIntent)
  const attachFile = useMutation(api.messages.attachFile)
  const deleteMessage = useMutation(api.messages.remove)
  const createReport = useMutation(api.reports.create)
  const [composerState, setComposerState] = useState<{ scopeKey: string | null; value: string }>({ scopeKey: null, value: '' })
  const [renameValue, setRenameValue] = useState('')
  const [attachment, setAttachment] = useState<File | null>(null)
  const [replyState, setReplyState] = useState<{ scopeKey: string | null; messageId: Id<'messages'> | null }>({ scopeKey: null, messageId: null })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const sendKey = useRef<string | null>(null)
  const messageListRef = useRef<HTMLElement | null>(null)
  const historyAnchorRef = useRef<{ height: number; top: number; count: number } | null>(null)
  const viewedSequenceRef = useRef(0)
  const acknowledgedSequenceRef = useRef(0)
  const acknowledgeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [tabVisible, setTabVisible] = useState(
    () => typeof document === 'undefined' || document.visibilityState === 'visible',
  )
  const composerDraftScope = useMemo(() => currentUser && navigation?.available
    ? {
        actorId: currentUser._id,
        actingCompanyId: context?.actingCompanyId,
        projectMemberId: context?.projectMemberId,
        projectId,
        groupId,
        threadId,
      }
    : null, [context?.actingCompanyId, context?.projectMemberId, currentUser, groupId, navigation?.available, projectId, threadId])
  const composerScopeKey = composerDraftScope ? getComposerDraftKey(composerDraftScope) : null
  const composerDraft = useMemo(
    () => composerDraftScope ? readComposerDraft(composerDraftScope) : null,
    [composerDraftScope],
  )
  const composer = composerState.scopeKey === composerScopeKey
    ? composerState.value
    : composerDraft?.composer ?? ''
  const setComposer = useCallback((nextComposer: string) => {
    setComposerState({ scopeKey: composerScopeKey, value: nextComposer })
  }, [composerScopeKey])
  const draftReplyToMessageId = composerDraft?.replyToMessageId
    ? messages.find((item) => item.message._id === composerDraft.replyToMessageId)?.message._id ?? null
    : null
  const replyTo = replyState.scopeKey === composerScopeKey
    ? replyState.messageId
    : draftReplyToMessageId
  const setReplyTo = useCallback((nextMessageId: Id<'messages'> | null) => {
    setReplyState({ scopeKey: composerScopeKey, messageId: nextMessageId })
  }, [composerScopeKey])
  useEffect(() => {
    if (!composerDraftScope || !composerScopeKey) return
    writeComposerDraft(composerDraftScope, {
      composer,
      replyToMessageId: replyTo,
    })
  }, [composer, composerDraftScope, composerScopeKey, replyTo])
  useEffect(() => {
    if (typeof document === 'undefined') return () => {}
    const handleVisibility = () => setTabVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])
  useEffect(() => {
    if (thread) setRenameValue(thread.thread.name)
  }, [thread])
  useEffect(() => {
    if (!messages || typeof window === 'undefined' || !window.location.hash.startsWith('#message-')) return
    requestAnimationFrame(() => {
      const target = document.getElementById(decodeURIComponent(window.location.hash.slice(1)))
      target?.scrollIntoView({ block: 'center' })
      target?.focus({ preventScroll: true })
    })
  }, [messages])

  const memberHandles = useMemo(() => {
    const handles = new Map<string, Array<{
      projectMemberId: Id<'projectMembers'>
      userId: Id<'users'>
    }>>()
    for (const item of projectMembers ?? []) {
      if (!item.user) continue
      const handle = getMentionHandle(item.user.displayName)
      handles.set(handle, [
        ...(handles.get(handle) ?? []),
        { projectMemberId: item.membership._id, userId: item.user._id },
      ])
    }
    return handles
  }, [projectMembers])
  const streamItems = useMemo(() => {
    const items = [...new Map(
        ((messages ?? []) as Array<ThreadMessageDetail>)
          .map((item) => [item.message._id, item] as const),
      ).values()].map((item) => ({
        at: item.message.createdAt,
        id: item.message._id,
        kind: 'message' as const,
        item,
      }))
    // eslint-disable-next-line unicorn/no-array-sort -- reason: Sort a newly copied array while supporting the web ES2022 target.
    items.sort((a, b) => a.at - b.at)
    return items
  }, [messages])

  const acknowledgeViewedSequence = useCallback((sequence: number) => {
    if (!scopedArgs || !tabVisible || navigation?.readStateImmutable || sequence <= acknowledgedSequenceRef.current) return
    viewedSequenceRef.current = Math.max(viewedSequenceRef.current, sequence)
    if (acknowledgeTimeoutRef.current) return
    acknowledgeTimeoutRef.current = setTimeout(() => {
      acknowledgeTimeoutRef.current = null
      const nextSequence = viewedSequenceRef.current
      if (
        nextSequence <= acknowledgedSequenceRef.current ||
        (typeof document !== 'undefined' && document.visibilityState !== 'visible')
      ) return
      acknowledgedSequenceRef.current = nextSequence
      void markRead({ ...scopedArgs, viewedChannelSequence: nextSequence }).catch(() => {
        acknowledgedSequenceRef.current = Math.min(acknowledgedSequenceRef.current, nextSequence - 1)
      })
    }, 150)
  }, [markRead, navigation?.readStateImmutable, scopedArgs, tabVisible])

  useEffect(() => {
    const list = messageListRef.current
    const messageCount = streamItems.length
    if (!list || !tabVisible || messageCount === 0) return () => {}
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        const sequenceValue = entry.target.getAttribute('data-channel-sequence')
        const sequence = sequenceValue ? Number(sequenceValue) : 0
        if (Number.isInteger(sequence) && sequence > 0) acknowledgeViewedSequence(sequence)
      }
    }, { threshold: 0.6 })
    for (const message of list.querySelectorAll<HTMLElement>('[data-channel-sequence]')) {
      observer.observe(message)
    }
    return () => observer.disconnect()
  }, [acknowledgeViewedSequence, streamItems.length, tabVisible])

  const loadMoreThreadMessages = useCallback(() => {
    const list = messageListRef.current
    if (!list || combinedMessagePageStatus !== 'CanLoadMore' || historyAnchorRef.current) return
    historyAnchorRef.current = {
      count: streamItems.length,
      height: list.scrollHeight,
      top: list.scrollTop,
    }
    if (messagePageStatus === 'CanLoadMore') loadMoreMessages(50)
  }, [combinedMessagePageStatus, loadMoreMessages, messagePageStatus, streamItems.length])

  useEffect(() => {
    const anchor = historyAnchorRef.current
    if (!anchor || combinedMessagePageStatus === 'LoadingMore' || streamItems.length <= anchor.count) return
    historyAnchorRef.current = null
    requestAnimationFrame(() => {
      const list = messageListRef.current
      if (list) list.scrollTop = anchor.top + (list.scrollHeight - anchor.height)
    })
  }, [combinedMessagePageStatus, streamItems.length])

  useEffect(() => () => {
    if (acknowledgeTimeoutRef.current) clearTimeout(acknowledgeTimeoutRef.current)
  }, [])

  const backHref = context
    ? `/workspace/company-projects/${projectId}?companyId=${context.actingCompanyId}&membershipId=${context.projectMemberId}&groupId=${groupId}`
    : `/workspace/projects/${projectId}/groups/${groupId}`

  async function submitMessage(event: FormEvent) {
    event.preventDefault()
    if (!currentUser || !thread || thread.thread.status !== 'active') return
    const body = composer.trim()
    if (!body && !attachment) return
    setBusy(true)
    setError(null)
    sendKey.current ??= crypto.randomUUID()
    try {
      const mentionedMembers = parseMentions(body).flatMap((handle) => {
        const matches = memberHandles.get(handle) ?? []
        return matches.length === 1 ? matches : []
      })
      const messageId = await sendMessage({
        projectId,
        groupId,
        channelThreadId: threadId,
        authorId: currentUser._id,
        actingCompanyId: context?.actingCompanyId,
        projectMemberId: context?.projectMemberId,
        idempotencyKey: sendKey.current,
        body,
        mentions: mentionedMembers.map((member) => member.userId),
        mentionedProjectMemberIds: mentionedMembers.map((member) => member.projectMemberId),
        replyToMessageId: replyTo ?? undefined,
        notificationPreview: attachment && !body ? 'Sent an attachment.' : undefined,
      })
      if (attachment) await uploadAttachment(messageId, attachment)
      sendKey.current = null
      setComposer('')
      setAttachment(null)
      setReplyTo(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message.replaceAll('_', ' ') : "Couldn't save")
    } finally {
      setBusy(false)
    }
  }

  async function uploadAttachment(messageId: Id<'messages'>, file: File) {
    if (!currentUser) return
    const contentType = file.type || 'application/octet-stream'
    const kind = file.type.startsWith('audio/') ? 'voice_note' : 'file'
    const intent = await generateUploadUrl({
      contentType,
      durationMs: undefined,
      groupId,
      channelThreadId: threadId,
      intentKey: `${sendKey.current ?? 'thread-message'}:attachment:${file.name}`,
      filename: file.name,
      userId: currentUser._id,
      actingCompanyId: context?.actingCompanyId,
      kind,
      projectMemberId: context?.projectMemberId,
      size: file.size,
    })
    let storageId = intent.storageId
    if (!storageId) {
      if (!intent.uploadUrl) throw new Error('upload_intent_unavailable')
      const response = await fetch(intent.uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': contentType },
        body: file,
      })
      if (!response.ok) throw new Error('upload_failed')
      const payload: unknown = await response.json()
      if (!isUploadResponse(payload)) throw new Error('upload_response_invalid')
      storageId = payload.storageId
      await claimUploadIntent({
        intentId: intent.intentId,
        storageId,
        userId: currentUser._id,
        actingCompanyId: context?.actingCompanyId,
        projectMemberId: context?.projectMemberId,
      })
    }
    await attachFile({
      projectId,
      groupId,
      messageId,
      userId: currentUser._id,
      actingCompanyId: context?.actingCompanyId,
      projectMemberId: context?.projectMemberId,
      uploadIntentId: intent.intentId,
      storageId,
      filename: file.name,
      contentType,
      size: file.size,
      kind,
    })
  }

  async function removeMessage(messageId: Id<'messages'>) {
    if (!currentUser || !window.confirm('Delete this message? This can’t be undone.')) return
    setBusy(true)
    setError(null)
    try {
      await deleteMessage({
        messageId,
        actorId: currentUser._id,
        actingCompanyId: context?.actingCompanyId,
        projectMemberId: context?.projectMemberId,
      })
      if (replyTo === messageId) setReplyTo(null)
      setNotice('Message deleted.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message.replaceAll('_', ' ') : "Couldn't delete message")
    } finally {
      setBusy(false)
    }
  }

  async function toggleFollowing() {
    if (!scopedArgs || !thread) return
    setError(null)
    try {
      await setFollowing({ ...scopedArgs, following: !thread.following })
      setNotice(thread.following ? 'Thread unfollowed.' : 'Thread followed.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message.replaceAll('_', ' ') : "Couldn't update follow state")
    }
  }

  async function updateStatus() {
    if (!scopedArgs || !thread) return
    setError(null)
    try {
      const result = await setStatus({
        ...scopedArgs,
        expectedRevision: thread.thread.revision,
        status: thread.thread.status === 'active' ? 'archived' : 'active',
      })
      setNotice(result.conflict
        ? 'Thread changed elsewhere. Current state has been refreshed.'
        : result.status === 'archived' ? 'Thread archived.' : 'Thread reopened.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message.replaceAll('_', ' ') : "Couldn't update thread")
    }
  }

  async function submitRename(event: FormEvent) {
    event.preventDefault()
    if (!scopedArgs || !thread) return
    setError(null)
    try {
      const result = await rename({
        ...scopedArgs,
        expectedRevision: thread.thread.revision,
        name: renameValue,
      })
      setNotice(result.conflict
        ? 'Thread changed elsewhere. Current name has been refreshed.'
        : 'Thread renamed.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message.replaceAll('_', ' ') : "Couldn't rename thread")
    }
  }

  if (releaseState.status === 'loading') return <TrackLoader label="Loading thread" />
  if (!releaseConfig.threads) return <Unavailable backHref={backHref} />
  if (typeof navigator !== 'undefined' && !navigator.onLine && thread === undefined) {
    return <Unavailable backHref={backHref} detail="You're offline and this thread isn't available on this device." retry />
  }
  if (!currentUser || navigation === undefined || (navigation.available && thread === undefined)) {
    return <TrackLoader label="Loading thread" />
  }
  if (!navigation.available || !thread) return <Unavailable backHref={backHref} />

  const archived = thread.thread.status === 'archived' || navigation.archived
  const taskLinkMessageIds = streamItems.map((entry) => entry.item.message._id)
  const conversationContent = (
    <main className="track-thread-route" aria-busy={busy}>
      <header className="track-thread-route-header">
        <a href={backHref}>← Back to Channel</a>
        <div>
          <span className="mono-label">Thread</span>
          <h1>{thread.thread.name}</h1>
          <p>{thread.replyCount} {thread.replyCount === 1 ? 'reply' : 'replies'} · {thread.following ? 'Following' : 'Not following'}</p>
        </div>
        <div className="track-thread-route-actions">
          {!navigation.archived ? <Button onClick={() => void toggleFollowing()} variant="outline">
            {thread.following ? 'Unfollow' : 'Follow'}
          </Button> : null}
          {thread.canManage && !navigation.archived ? (
            <Button
              onClick={() => void updateStatus()}
              variant="outline"
            >
              {thread.thread.status === 'active' ? 'Archive' : 'Reopen'}
            </Button>
          ) : null}
        </div>
      </header>
      {thread.canManage && !navigation.archived ? (
        <form
          className="track-thread-rename"
          onSubmit={(event) => void submitRename(event)}
        >
          <Input aria-label="Rename thread" maxLength={100} onChange={(event) => setRenameValue(event.target.value)} value={renameValue} />
          <Button type="submit" variant="outline">Rename</Button>
        </form>
      ) : null}
      {thread.source ? (
        <aside className="track-thread-source">
          <strong>Source message</strong>
          {'unavailable' in thread.source ? (
            <p>Source message unavailable.</p>
          ) : (
            <a href={`${backHref}#message-${thread.source.messageId}`}>
              {thread.source.body || 'Attachment message'}
            </a>
          )}
        </aside>
      ) : null}
      {notice ? <p className="track-thread-notice" role="status">{notice}</p> : null}
      {error ? <p className="track-error" role="alert">{error}. Your unsent reply is still here.</p> : null}
      {archived ? <p className="track-thread-archived" role="status">This thread is read-only.</p> : null}
      <section
        className="track-thread-message-list"
        ref={(element) => { messageListRef.current = element }}
        role="log"
        aria-label="Thread messages"
      >
        {messagePageStatus === 'CanLoadMore' ? (
          <Button onClick={loadMoreThreadMessages} variant="outline">Load older replies</Button>
        ) : null}
        {streamItems.length === 0 ? <p>{messagePageStatus === 'LoadingFirstPage' ? 'Loading replies…' : 'No replies yet.'}</p> : streamItems.map((entry) => (
          <article
            className="track-thread-message"
            data-channel-sequence={entry.item.message.channelSequence}
            id={`message-${entry.id}`}
            key={entry.id}
            tabIndex={-1}
          >
            <header>
              <strong>{entry.item.author?.displayName ?? 'Unknown member'}</strong>
              <time>{new Date(entry.at).toLocaleString()}</time>
            </header>
            {entry.item.replyTo ? <small>Replying to {entry.item.replyTo.authorName}: {entry.item.replyTo.body}</small> : null}
            <MarkdownText text={entry.item.message.body || 'Attachment message'} />
            {releaseConfig.tasks ? (
              <MessageInlineTasks
                identity={{ actingCompanyId: context?.actingCompanyId, projectMemberId: context?.projectMemberId }}
                message={entry.item.message}
              />
            ) : null}
            {entry.item.attachments.map(({ attachment: file, url }) => url ? (
              <a href={url} key={file._id} rel="noreferrer" target="_blank">{file.filename}</a>
            ) : null)}
            <footer>
              {!archived ? <button onClick={() => setReplyTo(entry.item.message._id)} type="button">Reply</button> : null}
              {!archived &&
                entry.item.message.authorId === currentUser._id &&
                (!context?.projectMemberId ||
                  !entry.item.message.authorProjectMemberId ||
                  entry.item.message.authorProjectMemberId === context.projectMemberId) ? (
                <Button
                  disabled={busy}
                  onClick={() => void removeMessage(entry.item.message._id)}
                  variant="destructive"
                >
                  Delete
                </Button>
              ) : null}
              {releaseConfig.tasks && !archived ? (
                <CreateTaskFromMessage
                  identity={{ actingCompanyId: context?.actingCompanyId, projectMemberId: context?.projectMemberId }}
                  message={entry.item.message}
                />
              ) : null}
              <button
                onClick={() => void createReport({
                  projectId,
                  reporterId: currentUser._id,
                  actingCompanyId: context?.actingCompanyId,
                  projectMemberId: context?.projectMemberId,
                  targetType: 'message',
                  targetMessageId: entry.item.message._id,
                  reason: 'other',
                })}
                type="button"
              >Report</button>
            </footer>
          </article>
        ))}
      </section>
      {!archived ? (
        <form className="track-thread-composer" onSubmit={(event) => void submitMessage(event)}>
          {projectMembersPage.status === 'CanLoadMore' || projectMembersPage.status === 'LoadingMore' ? (
            <Button
              disabled={projectMembersPage.status === 'LoadingMore'}
              onClick={() => projectMembersPage.status === 'CanLoadMore' && projectMembersPage.loadMore(100)}
              type="button"
              variant="outline"
            >
              {projectMembersPage.status === 'LoadingMore' ? 'Loading more members…' : 'Load more members'}
            </Button>
          ) : null}
          {replyTo ? <p>Reply selected. <button onClick={() => setReplyTo(null)} type="button">Cancel</button></p> : null}
          <Textarea aria-label={`Reply in ${thread.thread.name}`} onChange={(event) => setComposer(event.target.value)} placeholder="Reply in thread" value={composer} />
          <input aria-label="Attach a file" onChange={(event) => setAttachment(event.target.files?.[0] ?? null)} type="file" />
          <Button disabled={busy || (!composer.trim() && !attachment)} type="submit">{busy ? 'Sending…' : 'Send'}</Button>
        </form>
      ) : null}
    </main>
  )

  const conversation = releaseConfig.tasks ? (
    <TaskLinkBatchProvider
      identity={{ actingCompanyId: context?.actingCompanyId, projectMemberId: context?.projectMemberId }}
      messageIds={taskLinkMessageIds}
    >
      {conversationContent}
    </TaskLinkBatchProvider>
  ) : conversationContent

  if (!context) return conversation

  return (
    <div className="track-company-thread-workspace">
      <CompanyProjectNavigation
        actingCompanyId={context.actingCompanyId}
        activeArea="conversation"
        activeProject={{ projectId, projectMemberId: context.projectMemberId, groupId }}
        tasksEnabled={releaseConfig.tasks}
      />
      {conversation}
    </div>
  )
}

type ThreadMessageDetail = {
  message: Doc<'messages'>
  author: Doc<'users'> | null
  attachments: Array<{ attachment: Doc<'attachments'>; url: string | null }>
  replyTo: { messageId: Id<'messages'>; authorName: string; body: string; createdAt: number } | null
}

function Unavailable({
  backHref,
  detail = 'Thread unavailable or access changed.',
  retry = false,
}: {
  backHref: string
  detail?: string
  retry?: boolean
}) {
  return <main className="track-thread-route"><h1>Thread unavailable</h1><p>{detail}</p>{retry ? <Button onClick={() => window.location.reload()}>Retry</Button> : null}<a href={backHref}>Back to Channel</a></main>
}
