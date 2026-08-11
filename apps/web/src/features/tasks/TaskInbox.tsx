import { useMutation, useQuery } from 'convex/react'
import { EyeOff, GitMerge, Sparkles, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useState } from 'react'

import { api } from '../../../../../convex/_generated/api'
import type { Doc, Id } from '../../../../../convex/_generated/dataModel'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { NativeSelect, NativeSelectOption } from '#/components/ui/native-select'
import { formatNumber, useLocale } from '#/i18n'
import type { TaskBoardView, TaskIdentity } from './task-types'
import { taskError } from './TaskCreateDialog'

type SuggestionRow = {
  suggestion: Doc<'taskSuggestions'>
  references: Array<Doc<'taskSuggestionReferences'>>
  canDismiss: boolean
  possibleDuplicateTask: { _id: Id<'tasks'>; publicKey: string; title: string } | null
  proposedAssignee: { member: Doc<'projectMembers'>; user: { _id: Id<'users'>; displayName: string }; company: Doc<'companies'> | null } | null
}

export function TaskInbox({
  boards,
  identity,
  onAnnounce,
  projectId,
}: {
  boards: Array<TaskBoardView>
  identity: TaskIdentity
  onAnnounce: (message: string) => void
  projectId: Id<'projects'>
}) {
  const { locale } = useLocale()
  const { t } = useTranslation('tasks')
  const suggestions = useQuery(api.taskSuggestions.list, { projectId, ...identity }) as Array<SuggestionRow> | undefined
  const [scopeFilter, setScopeFilter] = useState('all')
  const [duplicateFilter, setDuplicateFilter] = useState('all')
  const [assigneeFilter, setAssigneeFilter] = useState('all')
  const [ageFilter, setAgeFilter] = useState('all')
  if (suggestions === undefined) return <div className="task-loading"><span /><span /><span /></div>
  if (!suggestions.length) return <div className="task-empty"><Sparkles size={26} /><h2>{t('inbox.clearTitle')}</h2><p>{t('inbox.clearBody')}</p></div>
  const assigneeOptions = suggestions.flatMap((row) => row.proposedAssignee ? [row.proposedAssignee] : []).filter((value, index, values) => values.findIndex((candidate) => candidate.member._id === value.member._id) === index)
  const filtered = suggestions.filter((row) =>
    (scopeFilter === 'all' || (scopeFilter === 'project' ? !row.suggestion.groupId : Boolean(row.suggestion.groupId))) &&
    (duplicateFilter === 'all' || (duplicateFilter === 'duplicate') === Boolean(row.possibleDuplicateTask)) &&
    (assigneeFilter === 'all' || row.suggestion.proposedAssigneeProjectMemberId === assigneeFilter) &&
    (ageFilter === 'all' || row.suggestion.createdAt >= Date.now() - Number(ageFilter) * 86_400_000),
  )
  return <section className="task-inbox"><header><div><h2>{t('inbox.title')}</h2><p>{t('inbox.pending', { filtered: formatNumber(locale, filtered.length), total: formatNumber(locale, suggestions.length) })}</p></div><div className="task-inbox-filters"><NativeSelect aria-label={t('inbox.scopeAria')} onChange={(event) => setScopeFilter(event.target.value)} value={scopeFilter}><NativeSelectOption value="all">{t('inbox.allScopes')}</NativeSelectOption><NativeSelectOption value="project">{t('inbox.projectScope')}</NativeSelectOption><NativeSelectOption value="channel">{t('inbox.channelScope')}</NativeSelectOption></NativeSelect><NativeSelect aria-label={t('inbox.duplicateAria')} onChange={(event) => setDuplicateFilter(event.target.value)} value={duplicateFilter}><NativeSelectOption value="all">{t('inbox.allDuplicateStates')}</NativeSelectOption><NativeSelectOption value="duplicate">{t('inbox.possibleDuplicates')}</NativeSelectOption><NativeSelectOption value="unique">{t('inbox.noDuplicate')}</NativeSelectOption></NativeSelect><NativeSelect aria-label={t('inbox.assigneeAria')} onChange={(event) => setAssigneeFilter(event.target.value)} value={assigneeFilter}><NativeSelectOption value="all">{t('inbox.allAssignees')}</NativeSelectOption>{assigneeOptions.map((item) => <NativeSelectOption dir="auto" key={item.member._id} value={item.member._id}>{item.user.displayName}</NativeSelectOption>)}</NativeSelect><NativeSelect aria-label={t('inbox.ageAria')} onChange={(event) => setAgeFilter(event.target.value)} value={ageFilter}><NativeSelectOption value="all">{t('inbox.anyAge')}</NativeSelectOption><NativeSelectOption value="1">{t('inbox.lastDay')}</NativeSelectOption><NativeSelectOption value="7">{t('inbox.last7Days')}</NativeSelectOption><NativeSelectOption value="30">{t('inbox.last30Days')}</NativeSelectOption></NativeSelect></div></header>
    <div className="task-inbox-list">{filtered.map((row) => <SuggestionCard boards={boards} identity={identity} key={row.suggestion._id} onAnnounce={onAnnounce} row={row} />)}</div>
    {!filtered.length ? <div className="task-empty"><Sparkles size={22} /><h2>{t('inbox.noMatchTitle')}</h2><p>{t('inbox.noMatchBody')}</p></div> : null}
  </section>
}

function SuggestionCard({
  boards,
  identity,
  onAnnounce,
  row,
}: {
  boards: Array<TaskBoardView>
  identity: TaskIdentity
  onAnnounce: (message: string) => void
  row: SuggestionRow
}) {
  const { locale } = useLocale()
  const { t } = useTranslation('tasks')
  const compatibleBoards = boards.filter((item) => item.board.groupId === row.suggestion.groupId)
  const defaultBoard = compatibleBoards.find((item) => item.board.isDefault) ?? compatibleBoards[0]
  const [title, setTitle] = useState(row.suggestion.proposedTitle)
  const [boardId, setBoardId] = useState<string>(defaultBoard?.board._id ?? '')
  const [error, setError] = useState('')
  const accept = useMutation(api.taskSuggestions.accept)
  const dismiss = useMutation(api.taskSuggestions.dismiss)
  const hide = useMutation(api.taskSuggestions.hide)
  const link = useMutation(api.taskSuggestions.linkToExisting)

  async function run(action: () => Promise<unknown>, message: string) {
    setError('')
    try {
      await action()
      onAnnounce(message)
    } catch (failure) {
      setError(taskError(failure, (key) => t(key)))
    }
  }

  return <article className="task-suggestion-card">
    <div className="task-suggestion-copy"><span className="task-eyebrow">{row.suggestion.groupId ? t('inbox.channelSuggestion') : t('inbox.projectSuggestion')} · {t('inbox.confidence', { value: formatNumber(locale, row.suggestion.confidence, { style: 'percent' }) })}</span>
      <Input aria-label={t('inbox.suggestionTitleAria')} dir="auto" onChange={(event) => setTitle(event.target.value)} value={title} />
      {row.suggestion.proposedDescription ? <p dir="auto">{row.suggestion.proposedDescription}</p> : null}
      <p className="task-grounding" dir="auto">{row.suggestion.groundingReason}</p>
      {row.proposedAssignee ? <p>{t('inbox.proposedAssignee', { name: row.proposedAssignee.user.displayName, company: row.proposedAssignee.company ? ` · ${row.proposedAssignee.company.displayName}` : '' })}</p> : null}
      {row.references.map((reference) => <blockquote dir="auto" key={reference._id}>{reference.quote ?? t('inbox.sourceUnavailable')}</blockquote>)}
      {row.possibleDuplicateTask ? <p className="task-duplicate"><GitMerge size={13} /> {t('inbox.possibleDuplicate', { key: row.possibleDuplicateTask.publicKey, title: row.possibleDuplicateTask.title })}</p> : null}
    </div>
    <div className="task-suggestion-actions">
      <NativeSelect aria-label={t('inbox.destinationBoardAria')} disabled={!compatibleBoards.length} onChange={(event) => setBoardId(event.target.value)} value={boardId}>
        {compatibleBoards.map((item) => <NativeSelectOption dir="auto" key={item.board._id} value={item.board._id}>{item.board.name}</NativeSelectOption>)}
      </NativeSelect>
      <Button disabled={!boardId || !title.trim()} onClick={() => void run(() => accept({
        suggestionId: row.suggestion._id,
        boardId: boardId as Id<'taskBoards'>,
        title,
        description: row.suggestion.proposedDescription,
        priority: row.suggestion.proposedPriority,
        dueDate: row.suggestion.proposedDueDate,
        assigneeProjectMemberId: row.suggestion.proposedAssigneeProjectMemberId,
        duplicateOverride: Boolean(row.possibleDuplicateTask),
        idempotencyKey: crypto.randomUUID(),
        ...identity,
      }), t('inbox.accepted'))}>{row.possibleDuplicateTask ? t('inbox.acceptSeparately') : t('inbox.accept')}</Button>
      {row.possibleDuplicateTask ? <Button onClick={() => void run(() => link({
        suggestionId: row.suggestion._id,
        taskId: row.possibleDuplicateTask!._id,
        idempotencyKey: crypto.randomUUID(),
        ...identity,
      }), t('inbox.evidenceAdded'))} variant="outline"><GitMerge size={13} /> {t('inbox.addEvidence')}</Button> : null}
      {row.canDismiss ? <Button onClick={() => void run(() => dismiss({ suggestionId: row.suggestion._id, reason: 'not_actionable', idempotencyKey: crypto.randomUUID(), ...identity }), t('inbox.dismissed'))} variant="ghost"><X size={13} /> {t('inbox.dismiss')}</Button> : null}
      <Button onClick={() => void run(() => hide({ suggestionId: row.suggestion._id, ...identity }), t('inbox.hidden'))} variant="ghost"><EyeOff size={13} /> {t('inbox.hideForMe')}</Button>
    </div>
    {error ? <p className="task-form-error" role="alert">{error}</p> : null}
  </article>
}
