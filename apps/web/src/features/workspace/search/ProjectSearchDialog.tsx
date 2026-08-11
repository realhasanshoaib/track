import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { Id } from '../../../../../../convex/_generated/dataModel'
import { FolderKanban, ListTodo, LoaderCircle, MessagesSquare, Paperclip, Search, X } from 'lucide-react'

import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { AttachmentTypeIcon } from '#/features/workspace/attachment-ui'
import { useReleaseConfig } from '#/lib/release-config'
import { formatNumber } from '#/i18n'

export type ProjectSearchFilter = 'all' | 'messages' | 'files' | 'groups' | 'tasks' | 'threads'

export type ProjectSearchResult = {
  attachmentId?: Id<'attachments'>
  contentType?: string
  createdAt: number
  groupId?: Id<'groups'>
  groupName: string
  id: string
  kind: 'message' | 'file' | 'group' | 'task' | 'thread'
  messageId?: Id<'messages'>
  taskKey?: string
  threadId?: Id<'channelThreads'>
  threadName?: string
  preview: string
  subtitle: string
  title: string
}

export function ProjectSearchDialog({
  filter,
  loading,
  onClose,
  onFilterChange,
  onOpenResult,
  onQueryChange,
  open,
  projectName,
  query,
  sections,
  total,
}: {
  filter: ProjectSearchFilter
  loading: boolean
  onClose: () => void
  onFilterChange: (filter: ProjectSearchFilter) => void
  onOpenResult: (result: ProjectSearchResult) => void
  onQueryChange: (query: string) => void
  open: boolean
  projectName: string
  query: string
  sections: Array<{ key: string; label: string; results: ProjectSearchResult[] }>
  total: number
}) {
  const { t } = useTranslation('workspace')
  const releaseConfig = useReleaseConfig()
  const resultButtonsRef = useRef<Array<HTMLButtonElement | null>>([])
  const flatResults = useMemo(
    () => sections.flatMap((section) => section.results),
    [sections],
  )
  const [activeResultIndex, setActiveResultIndex] = useState(0)

  useEffect(() => {
    if (!open) return
    function handleKeyboard(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActiveResultIndex((index) =>
          flatResults.length > 0 ? (index + 1) % flatResults.length : 0,
        )
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActiveResultIndex((index) =>
          flatResults.length > 0 ? (index - 1 + flatResults.length) % flatResults.length : 0,
        )
        return
      }
      if (event.key === 'Enter' && flatResults[activeResultIndex]) {
        event.preventDefault()
        onOpenResult(flatResults[activeResultIndex])
      }
    }

    window.addEventListener('keydown', handleKeyboard)
    return () => window.removeEventListener('keydown', handleKeyboard)
  }, [activeResultIndex, flatResults, onClose, onOpenResult, open])

  useEffect(() => {
    setActiveResultIndex(0)
  }, [filter, query])

  useEffect(() => {
    if (activeResultIndex < flatResults.length) return
    setActiveResultIndex(Math.max(flatResults.length - 1, 0))
  }, [activeResultIndex, flatResults.length])

  useEffect(() => {
    resultButtonsRef.current[activeResultIndex]?.scrollIntoView({
      block: 'nearest',
    })
  }, [activeResultIndex])

  if (!open) return null

  const filters: Array<{ Icon: typeof Search; label: string; value: ProjectSearchFilter }> = [
    { Icon: Search, label: t('search.filters.all'), value: 'all' },
    { Icon: MessagesSquare, label: t('search.filters.messages'), value: 'messages' },
    { Icon: Paperclip, label: t('search.filters.files'), value: 'files' },
    { Icon: FolderKanban, label: t('search.filters.channels'), value: 'groups' },
    ...(releaseConfig.tasks ? [{ Icon: ListTodo, label: t('common.tasks'), value: 'tasks' as const }] : []),
    ...(releaseConfig.threads ? [{ Icon: MessagesSquare, label: t('common.threads'), value: 'threads' as const }] : []),
  ]
  const hasQuery = query.trim().length >= 2
  let resultIndex = -1

  return (
    <div className="track-project-search-overlay" role="presentation" onMouseDown={onClose}>
      <section
        aria-label={t('search.projectSearch')}
        aria-modal="true"
        className="track-project-search"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="track-project-search-header">
          <div>
            <span className="mono-label">{t('search.currentProject')}</span>
            <h2>{projectName}</h2>
          </div>
          <Button aria-label={t('search.closeProjectSearch')} className="icon-button" onClick={onClose} type="button">
            <X size={15} />
          </Button>
        </header>
        <div className="track-project-search-box">
          <Search size={16} />
          <Input
            autoFocus
            className="track-project-search-input"
            onChange={(event) => onQueryChange(event.currentTarget.value)}
            placeholder={releaseConfig.tasks && releaseConfig.threads
              ? t('search.placeholderAll')
              : releaseConfig.tasks
                ? t('search.placeholderTasks')
                : releaseConfig.threads
                  ? t('search.placeholderThreads')
                  : t('search.placeholderBasic')}
            value={query}
          />
          <span>{t('search.resultCount', { count: formatNumber(total) })}</span>
        </div>
        <div className="track-project-search-filters" role="list" aria-label={t('search.filtersLabel')}>
          {filters.map((item) => (
            <button
              className={filter === item.value ? 'active' : ''}
              key={item.value}
              onClick={() => onFilterChange(item.value)}
              title={item.label}
              type="button"
            >
              <item.Icon size={15} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
        <div className="track-project-search-results" role={total > 0 ? 'listbox' : undefined}>
          {!hasQuery ? (
            <div className="track-project-search-state">
              <Search size={18} />
              <p>{t('search.typeMore')}</p>
              <small>{t('search.shortcuts')}</small>
            </div>
          ) : loading ? (
            <div className="track-project-search-state">
              <LoaderCircle className="spin" size={18} />
              <p>{t('search.searchingProject')}</p>
            </div>
          ) : total === 0 ? (
            <div className="track-project-search-state">
              <Search size={18} />
              <p>{t('search.noResults', { query: query.trim() })}</p>
            </div>
          ) : (
            sections.map((section) =>
              section.results.length > 0 ? (
                <div className="track-project-search-section" key={section.key}>
                  <p className="track-project-search-section-label">{t(`search.filters.${section.key}`)}</p>
                  {section.results.map((result) => {
                    resultIndex += 1
                    const currentResultIndex = resultIndex
                    const isActive = currentResultIndex === activeResultIndex
                    return (
                      <button
                        aria-selected={isActive}
                        className={isActive ? 'track-project-search-result active' : 'track-project-search-result'}
                        key={`${result.kind}-${result.id}`}
                        onClick={() => onOpenResult(result)}
                        ref={(element) => {
                          resultButtonsRef.current[currentResultIndex] = element
                        }}
                        role="option"
                        type="button"
                      >
                        <span className={`track-project-search-icon ${result.kind}`}>
                          {result.kind === 'file' ? (
                            <AttachmentTypeIcon
                              contentType={result.contentType ?? 'application/octet-stream'}
                              filename={result.title}
                              size={16}
                            />
                          ) : result.kind === 'group' ? (
                            <FolderKanban size={16} />
                          ) : result.kind === 'task' ? (
                            <ListTodo size={16} />
                          ) : (
                            <MessagesSquare size={16} />
                          )}
                        </span>
                        <span className="track-project-search-copy">
                          <strong>{result.title}</strong>
                          <small>{result.subtitle}</small>
                          <span>{result.preview}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              ) : null,
            )
          )}
        </div>
      </section>
    </div>
  )
}
