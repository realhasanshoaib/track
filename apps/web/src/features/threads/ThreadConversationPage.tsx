import { parseMentions } from '@track/shared'
import { useAction, useMutation, usePaginatedQuery, useQuery } from 'convex/react'
import { useTranslation } from 'react-i18next'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'

import { api } from '../../../../../convex/_generated/api'
import type { Doc, Id } from '../../../../../convex/_generated/dataModel'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Textarea } from '#/components/ui/textarea'
import { formatDate, formatNumber, useLocale } from '#/i18n'
import { getMentionHandle } from '#/features/workspace/identity'
import { MarkdownText } from '#/features/workspace/markdown'
import {
  AssistantInlineTasks,
  CreateTaskFromAssistant,
  CreateTaskFromMessage,
  MessageInlineTasks,
} from '#/features/tasks/ConversationTaskActions'
import { useReleaseConfig } from '#/lib/release-config'
import type { RepresentedThreadContext } from './thread-navigation'

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
  const { locale } = useLocale()
  const { t } = useTranslation('threads')
  const releaseConfig = useReleaseConfig()
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
  const assistantStreams = useQuery(api.assistant.listForThread, scopedArgs ? { ...scopedArgs, limit: 40 } : 'skip')
  const projectMembers = useQuery(
    api.mobile.listProjectMembers,
    currentUser && navigation?.available
      ? {
          projectId,
          userId: currentUser._id,
          actingCompanyId: context?.actingCompanyId,
          projectMemberId: context?.projectMemberId,
        }
      : 'skip',
  )
  const sendMessage = useMutation(api.messages.send)
  const setFollowing = useMutation(api.channelThreads.setFollowing)
  const markRead = useMutation(api.channelThreads.markRead)
  const setStatus = useMutation(api.channelThreads.setStatus)
  const rename = useMutation(api.channelThreads.rename)
  const generateUploadUrl = useMutation(api.messages.generateUploadUrl)
  const attachFile = useMutation(api.messages.attachFile)
  const deleteMessage = useMutation(api.messages.remove)
  const createReport = useMutation(api.reports.create)
  const askTrack = useAction(api.assistant.ask)
  const [composer, setComposer] = useState('')
  const [renameValue, setRenameValue] = useState('')
  const [attachment, setAttachment] = useState<File | null>(null)
  const [replyTo, setReplyTo] = useState<Id<'messages'> | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const sendKey = useRef<string | null>(null)

  useEffect(() => {
    if (!scopedArgs || !messages || navigation?.readStateImmutable) return
    void markRead(scopedArgs).catch(() => undefined)
  }, [markRead, messages, navigation?.readStateImmutable, scopedArgs])
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
  const streamItems = useMemo(() => [
    ...[...new Map(
      ((messages ?? []) as Array<ThreadMessageDetail>)
        .map((item) => [item.message._id, item] as const),
    ).values()].map((item) => ({
      at: item.message.createdAt,
      id: item.message._id,
      kind: 'message' as const,
      item,
    })),
    ...((assistantStreams ?? []) as Array<Doc<'assistantStreams'>>).map((item) => ({
      at: item.createdAt,
      id: item._id,
      kind: 'assistant' as const,
      item,
    })),
  ].sort((a, b) => a.at - b.at), [assistantStreams, messages])

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
        notificationPreview: attachment && !body ? t('conversation.attachmentSent') : undefined,
      })
      if (attachment) await uploadAttachment(messageId, attachment)
      if (parseMentions(body).includes('track')) {
        await askTrack({
          projectId,
          groupId,
          channelThreadId: threadId,
          requesterId: currentUser._id,
          actingCompanyId: context?.actingCompanyId,
          projectMemberId: context?.projectMemberId,
          promptMessageId: messageId,
          question: body,
        })
      }
      sendKey.current = null
      setComposer('')
      setAttachment(null)
      setReplyTo(null)
    } catch {
      setError(t('errors.save'))
    } finally {
      setBusy(false)
    }
  }

  async function uploadAttachment(messageId: Id<'messages'>, file: File) {
    if (!currentUser) return
    const uploadUrl = await generateUploadUrl({
      groupId,
      channelThreadId: threadId,
      userId: currentUser._id,
      actingCompanyId: context?.actingCompanyId,
      projectMemberId: context?.projectMemberId,
    })
    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    })
    if (!response.ok) throw new Error('upload_failed')
    const { storageId } = await response.json() as { storageId: Id<'_storage'> }
    await attachFile({
      projectId,
      groupId,
      messageId,
      userId: currentUser._id,
      actingCompanyId: context?.actingCompanyId,
      projectMemberId: context?.projectMemberId,
      storageId,
      filename: file.name,
      contentType: file.type || 'application/octet-stream',
      size: file.size,
      kind: file.type.startsWith('audio/') ? 'voice_note' : 'file',
    })
  }

  async function removeMessage(messageId: Id<'messages'>) {
    if (!currentUser || !window.confirm(t('conversation.deleteConfirm'))) return
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
      setNotice(t('conversation.deleted'))
    } catch {
      setError(t('errors.delete'))
    } finally {
      setBusy(false)
    }
  }

  async function toggleFollowing() {
    if (!scopedArgs || !thread) return
    setError(null)
    try {
      await setFollowing({ ...scopedArgs, following: !thread.following })
      setNotice(thread.following ? t('conversation.unfollowed') : t('conversation.followed'))
    } catch {
      setError(t('errors.follow'))
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
        ? t('conversation.conflictRefresh')
        : result.status === 'archived' ? t('conversation.archivedNotice') : t('conversation.reopenedNotice'))
    } catch {
      setError(t('errors.status'))
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
        ? t('conversation.conflictNameRefresh')
        : t('conversation.renamedNotice'))
    } catch {
      setError(t('errors.rename'))
    }
  }

  if (!releaseConfig.threads) return <Unavailable backHref={backHref} />
  if (typeof navigator !== 'undefined' && !navigator.onLine && thread === undefined) {
    return <Unavailable backHref={backHref} detail={t('unavailable.offline')} retry />
  }
  if (!currentUser || navigation === undefined || (navigation.available && thread === undefined)) {
    return <main className="track-thread-route"><p role="status">{t('conversation.opening')}</p></main>
  }
  if (!navigation.available || !thread) return <Unavailable backHref={backHref} />

  const archived = thread.thread.status === 'archived' || navigation.archived
  return (
    <main className="track-thread-route" aria-busy={busy}>
      <header className="track-thread-route-header">
        <a href={backHref}>{t('conversation.back')}</a>
        <div>
          <span className="mono-label">{t('conversation.label')}</span>
          <h1 dir="auto">{thread.thread.name}</h1>
          <p>{thread.replyCount === 1 ? t('browser.replyOne', { count: formatNumber(locale, thread.replyCount) }) : t('browser.replyMany', { count: formatNumber(locale, thread.replyCount) })} · {thread.following ? t('browser.following') : t('conversation.notFollowing')}</p>
        </div>
        <div className="track-thread-route-actions">
          {!navigation.archived ? <Button onClick={() => void toggleFollowing()} variant="outline">
            {thread.following ? t('conversation.unfollow') : t('conversation.follow')}
          </Button> : null}
          {thread.canManage && !navigation.archived ? (
            <Button
              onClick={() => void updateStatus()}
              variant="outline"
            >
              {thread.thread.status === 'active' ? t('conversation.archive') : t('conversation.reopen')}
            </Button>
          ) : null}
        </div>
      </header>
      {thread.canManage && !navigation.archived ? (
        <form
          className="track-thread-rename"
          onSubmit={(event) => void submitRename(event)}
        >
          <Input aria-label={t('conversation.renameAria')} dir="auto" maxLength={100} onChange={(event) => setRenameValue(event.target.value)} value={renameValue} />
          <Button type="submit" variant="outline">{t('conversation.rename')}</Button>
        </form>
      ) : null}
      {thread.source ? (
        <aside className="track-thread-source">
          <strong>{t('conversation.source')}</strong>
          {'unavailable' in thread.source ? (
            <p>{t('conversation.sourceUnavailable')}</p>
          ) : (
            <a href={`${backHref}#message-${thread.source.messageId}`}>
              <span dir="auto">{thread.source.body || t('browser.attachmentMessage')}</span>
            </a>
          )}
        </aside>
      ) : null}
      {notice ? <p className="track-thread-notice" role="status">{notice}</p> : null}
      {error ? <p className="track-error" role="alert">{t('conversation.unsentReply', { error })}</p> : null}
      {archived ? <p className="track-thread-archived" role="status">{t('conversation.readOnly')}</p> : null}
      <section className="track-thread-message-list" role="log" aria-label={t('conversation.messagesAria')}>
        {messagePageStatus === 'CanLoadMore' ? (
          <Button onClick={() => loadMoreMessages(50)} variant="outline">{t('conversation.loadOlder')}</Button>
        ) : null}
        {streamItems.length === 0 ? <p>{messagePageStatus === 'LoadingFirstPage' ? t('conversation.loadingReplies') : t('conversation.noReplies')}</p> : streamItems.map((entry) => entry.kind === 'assistant' ? (
          <article className="track-thread-message assistant" key={entry.id}>
            <header>
              <strong>{t('conversation.assistant')}</strong>
              {releaseConfig.tasks && !archived ? (
                <CreateTaskFromAssistant
                  identity={{ actingCompanyId: context?.actingCompanyId, projectMemberId: context?.projectMemberId }}
                  stream={entry.item}
                />
              ) : null}
            </header>
            <div dir="auto"><MarkdownText text={entry.item.answer || entry.item.status} /></div>
            {releaseConfig.tasks ? (
              <AssistantInlineTasks
                identity={{ actingCompanyId: context?.actingCompanyId, projectMemberId: context?.projectMemberId }}
                stream={entry.item}
              />
            ) : null}
          </article>
        ) : (
          <article className="track-thread-message" id={`message-${entry.id}`} key={entry.id} tabIndex={-1}>
            <header>
              <strong dir="auto">{entry.item.author?.displayName ?? t('browser.unknownMember')}</strong>
              <time>{formatDate(locale, entry.at, { dateStyle: 'medium', timeStyle: 'short' })}</time>
            </header>
            {entry.item.replyTo ? <small dir="auto">{t('conversation.replyingTo', { name: entry.item.replyTo.authorName, body: entry.item.replyTo.body })}</small> : null}
            <div dir="auto"><MarkdownText text={entry.item.message.body || t('browser.attachmentMessage')} /></div>
            {releaseConfig.tasks ? (
              <MessageInlineTasks
                identity={{ actingCompanyId: context?.actingCompanyId, projectMemberId: context?.projectMemberId }}
                message={entry.item.message}
              />
            ) : null}
            {entry.item.attachments.map(({ attachment: file, url }) => url ? (
              <a dir="ltr" href={url} key={file._id} rel="noreferrer" target="_blank">{file.filename}</a>
            ) : null)}
            <footer>
              {!archived ? <button onClick={() => setReplyTo(entry.item.message._id)} type="button">{t('conversation.reply')}</button> : null}
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
                  {t('conversation.delete')}
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
              >{t('conversation.report')}</button>
            </footer>
          </article>
        ))}
      </section>
      {!archived ? (
        <form className="track-thread-composer" onSubmit={(event) => void submitMessage(event)}>
          {replyTo ? <p>{t('conversation.replySelected')} <button onClick={() => setReplyTo(null)} type="button">{t('conversation.cancel')}</button></p> : null}
          <Textarea aria-label={t('conversation.replyAria', { name: thread.thread.name })} dir="auto" onChange={(event) => setComposer(event.target.value)} placeholder={t('conversation.replyPlaceholder')} value={composer} />
          <input aria-label={t('conversation.attachAria')} onChange={(event) => setAttachment(event.target.files?.[0] ?? null)} type="file" />
          <Button disabled={busy || (!composer.trim() && !attachment)} type="submit">{busy ? t('conversation.sending') : t('conversation.send')}</Button>
        </form>
      ) : null}
    </main>
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
  detail,
  retry = false,
}: {
  backHref: string
  detail?: string
  retry?: boolean
}) {
  const { t } = useTranslation('threads')
  return <main className="track-thread-route"><h1>{t('unavailable.title')}</h1><p>{detail ?? t('unavailable.detail')}</p>{retry ? <Button onClick={() => window.location.reload()}>{t('unavailable.retry')}</Button> : null}<a href={backHref}>{t('conversation.back')}</a></main>
}
