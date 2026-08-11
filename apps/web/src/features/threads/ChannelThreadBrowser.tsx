import { useMutation, useQuery } from 'convex/react'
import { MessageSquare, Plus, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useMemo, useRef, useState, type FormEvent } from 'react'

import { api } from '../../../../../convex/_generated/api'
import type { Id } from '../../../../../convex/_generated/dataModel'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { formatNumber, useLocale } from '#/i18n'
import { useReleaseConfig } from '#/lib/release-config'
import { threadHref, type RepresentedThreadContext } from './thread-navigation'

type TimelineMessage = {
  message: {
    _id: Id<'messages'>
    body: string
    createdAt: number
  }
  author: { displayName: string } | null
  channelThread?: { threadId: Id<'channelThreads'> } | null
}

export function ChannelThreadBrowser({
  context,
  groupId,
  projectId,
  readOnly,
  timelineMessages,
  userId,
  variant = 'panel',
}: {
  context?: RepresentedThreadContext
  groupId: Id<'groups'>
  projectId: Id<'projects'>
  readOnly: boolean
  timelineMessages: Array<TimelineMessage>
  userId: Id<'users'>
  variant?: 'panel' | 'rail'
}) {
  const { locale } = useLocale()
  const { t } = useTranslation('threads')
  const releaseConfig = useReleaseConfig()
  const [status, setStatus] = useState<'active' | 'archived'>('active')
  const [name, setName] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [sourceMessageId, setSourceMessageId] = useState<Id<'messages'> | ''>('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const idempotencyKey = useRef<string | null>(null)
  const queryArgs = releaseConfig.threads
    ? {
        groupId,
        userId,
        status,
        actingCompanyId: context?.actingCompanyId,
        projectMemberId: context?.projectMemberId,
      }
    : 'skip'
  const threads = useQuery(api.channelThreads.list, queryArgs)
  const searchTerm = searchQuery.trim()
  const searchResults = useQuery(
    api.search.project,
    releaseConfig.threads && searchTerm.length >= 2
      ? {
          projectId,
          query: searchTerm,
          userId,
          actingCompanyId: context?.actingCompanyId,
          projectMemberId: context?.projectMemberId,
          filter: 'all',
          limit: 12,
        }
      : 'skip',
  )
  const createThread = useMutation(api.channelThreads.create)
  const availableSources = useMemo(
    () => timelineMessages.filter((item) => !item.channelThread),
    [timelineMessages],
  )
  const searchRows = useMemo(() => [
    ...(searchResults?.threads ?? []).map((item) => ({
      id: `thread-${item.id}`,
      groupId: item.groupId,
      messageId: undefined,
      threadId: item.threadId,
      title: item.title,
      detail: `${item.preview} · ${item.groupName}`,
    })),
    ...(searchResults?.messages ?? []).flatMap((item) => item.threadId ? [{
      id: `message-${item.id}`,
      groupId: item.groupId,
      messageId: item.messageId,
      threadId: item.threadId,
      title: item.threadName ?? t('browser.threadReply'),
      detail: `${item.preview} · ${item.groupName}`,
    }] : []),
    ...(searchResults?.files ?? []).flatMap((item) => item.threadId ? [{
      id: `file-${item.id}`,
      groupId: item.groupId,
      messageId: item.messageId,
      threadId: item.threadId,
      title: item.title,
      detail: `${item.threadName ?? t('browser.threadAttachment')} · ${item.groupName}`,
    }] : []),
  ], [searchResults, t])

  if (!releaseConfig.threads) return null

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    idempotencyKey.current ??= crypto.randomUUID()
    try {
      const threadId = await createThread({
        projectId,
        groupId,
        creatorId: userId,
        actingCompanyId: context?.actingCompanyId,
        projectMemberId: context?.projectMemberId,
        idempotencyKey: idempotencyKey.current,
        name,
        sourceMessageId: sourceMessageId || undefined,
      })
      idempotencyKey.current = null
      window.location.assign(threadHref(projectId, groupId, threadId, context))
    } catch {
      setError(t('errors.save'))
    } finally {
      setSaving(false)
    }
  }

  if (variant === 'rail') return (
    <section aria-label={t('browser.ariaLabel')} className="track-rail-thread-section">
      <header><span>{t('browser.title')}</span></header>
      {threads === undefined ? <p role="status">{t('browser.loading')}</p> : threads.length ? (
        <ul>{threads.slice(0, 4).map((item) => <li key={item.thread._id}><a href={threadHref(projectId, groupId, item.thread._id, context)}>
          <MessageSquare aria-hidden="true" size={13} />
          <strong dir="auto">{item.thread.name}</strong>
          <span>{item.replyCount === 1 ? t('browser.replyOne', { count: formatNumber(locale, item.replyCount) }) : t('browser.replyMany', { count: formatNumber(locale, item.replyCount) })}</span>
          {item.unread ? <i aria-label={t('browser.unreadAria')} /> : null}
        </a></li>)}</ul>
      ) : <p className="track-rail-empty">{t(status === 'active' ? 'browser.emptyActive' : 'browser.emptyArchived')}</p>}
      <details className="track-rail-thread-tools">
        <summary><Search size={12} /> {t('browser.findOrStart')}</summary>
        <div className="track-thread-tabs" role="tablist" aria-label={t('browser.statusAria')}>
          {(['active', 'archived'] as const).map((value) => <button aria-selected={status === value} className={status === value ? 'active' : ''} key={value} onClick={() => setStatus(value)} role="tab" type="button">{value === 'active' ? t('browser.active') : t('browser.archived')}</button>)}
        </div>
        <Input aria-label={t('browser.searchAria')} onChange={(event) => setSearchQuery(event.target.value)} placeholder={t('browser.searchPlaceholder')} value={searchQuery} />
        {searchTerm.length >= 2 ? <ul className="track-thread-list">{searchRows.slice(0, 4).map((item) => <li key={item.id}><a href={threadHref(projectId, item.groupId, item.threadId, context, item.messageId)}><span><strong dir="auto">{item.title}</strong><small dir="auto">{item.detail}</small></span></a></li>)}</ul> : null}
        {!readOnly && status === 'active' ? <form className="track-thread-create" onSubmit={(event) => void submit(event)}>
          <Input aria-label={t('browser.threadNameAria')} dir="auto" maxLength={100} onChange={(event) => setName(event.target.value)} placeholder={t('browser.threadNamePlaceholder')} required value={name} />
          <label><span className="sr-only">{t('browser.optionalSourceAria')}</span><select aria-label={t('browser.optionalSourceAria')} onChange={(event) => setSourceMessageId(event.target.value as Id<'messages'> | '')} value={sourceMessageId}><option value="">{t('browser.startDirectly')}</option>{availableSources.map((item) => <option dir="auto" key={item.message._id} value={item.message._id}>{item.author?.displayName ?? t('browser.unknownMember')}: {item.message.body || t('browser.attachmentMessage')}</option>)}</select></label>
          <Button disabled={saving || !name.trim()} size="sm" type="submit"><Plus size={12} /> {saving ? t('browser.starting') : t('browser.start')}</Button>
        </form> : null}
      </details>
      {error ? <p className="track-error" role="alert">{t('browser.errorRetry', { error })}</p> : null}
    </section>
  )

  return (
    <section className="track-channel-threads" aria-label={t('browser.ariaLabel')}>
      <header>
        <div>
          <span className="mono-label">{t('browser.title')}</span>
          <p>{t('browser.description')}</p>
        </div>
        <div className="track-thread-tabs" role="tablist" aria-label={t('browser.statusAria')}>
          {(['active', 'archived'] as const).map((value) => (
            <button
              aria-selected={status === value}
              className={status === value ? 'active' : ''}
              key={value}
              onClick={() => setStatus(value)}
              role="tab"
              type="button"
            >
              {value === 'active' ? t('browser.active') : t('browser.archived')}
            </button>
          ))}
        </div>
      </header>

      <Input
        aria-label={t('browser.searchAria')}
        onChange={(event) => setSearchQuery(event.target.value)}
        placeholder={t('browser.searchProjectPlaceholder')}
        value={searchQuery}
      />

      {searchTerm.length >= 2 ? searchResults === undefined ? (
        <p role="status">{t('browser.searching')}</p>
      ) : searchRows.length === 0 ? (
        <p className="track-thread-empty" dir="auto">{t('browser.resultEmpty', { query: searchTerm })}</p>
      ) : (
        <ul className="track-thread-list" aria-label={t('browser.searchResultsAria')}>
          {searchRows.map((item) => (
            <li key={item.id}>
              <a href={threadHref(projectId, item.groupId, item.threadId, context, item.messageId)}>
                <span><strong dir="auto">{item.title}</strong><small dir="auto">{item.detail}</small></span>
              </a>
            </li>
          ))}
        </ul>
      ) : threads === undefined ? (
        <p role="status">{t('browser.loading')}</p>
      ) : threads.length === 0 ? (
        <p className="track-thread-empty">{t(status === 'active' ? 'browser.emptyActive' : 'browser.emptyArchived')}</p>
      ) : (
        <ul className="track-thread-list">
          {threads.map((item) => (
            <li key={item.thread._id}>
              <a href={threadHref(projectId, groupId, item.thread._id, context)}>
                <span>
                  <strong dir="auto">{item.thread.name}</strong>
                  <small>
                    {item.replyCount === 1 ? t('browser.replyOne', { count: formatNumber(locale, item.replyCount) }) : t('browser.replyMany', { count: formatNumber(locale, item.replyCount) })}
                    {item.following ? ` · ${t('browser.following')}` : ''}
                  </small>
                </span>
                {item.unread ? <b aria-label={t('browser.unreadAria')}>{t('browser.unread')}</b> : null}
              </a>
            </li>
          ))}
        </ul>
      )}

      {!readOnly && status === 'active' ? (
        <form className="track-thread-create" onSubmit={(event) => void submit(event)}>
          <Input
            aria-label={t('browser.threadNameAria')}
            maxLength={100}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('browser.threadNamePlaceholder')}
            required
            value={name}
          />
          <label>
            <span className="sr-only">{t('browser.optionalSourceAria')}</span>
            <select
              aria-label={t('browser.optionalSourceAria')}
              onChange={(event) => setSourceMessageId(event.target.value as Id<'messages'> | '')}
              value={sourceMessageId}
            >
              <option value="">{t('browser.startDirectly')}</option>
              {availableSources.map((item) => (
                <option key={item.message._id} value={item.message._id}>
                  {item.author?.displayName ?? t('browser.unknownMember')}: {item.message.body || t('browser.attachmentMessage')}
                </option>
              ))}
            </select>
          </label>
          <Button disabled={saving || !name.trim()} type="submit">
            {saving ? t('browser.starting') : t('browser.start')}
          </Button>
        </form>
      ) : null}
      {error ? <p className="track-error" role="alert">{t('browser.errorRetry', { error })}</p> : null}
    </section>
  )
}
