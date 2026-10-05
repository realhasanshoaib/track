import { useMutation, useQuery } from 'convex/react'
import { EyeOff, GitMerge, Sparkles, X } from 'lucide-react'
import { useRef, useState } from 'react'

import { api } from '../../../../../convex/_generated/api'
import type { Doc, Id } from '../../../../../convex/_generated/dataModel'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { NativeSelect, NativeSelectOption } from '#/components/ui/native-select'
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
  const suggestions = useQuery(api.taskSuggestions.list, { projectId, ...identity }) as Array<SuggestionRow> | undefined
  const [scopeFilter, setScopeFilter] = useState('all')
  const [duplicateFilter, setDuplicateFilter] = useState('all')
  const [assigneeFilter, setAssigneeFilter] = useState('all')
  const [ageFilter, setAgeFilter] = useState('all')
  if (suggestions === undefined) return <div className="task-loading"><span /><span /><span /></div>
  if (!suggestions.length) return <div className="task-empty"><Sparkles size={26} /><h2>Inbox is clear</h2><p>Grounded task suggestions from accessible conversation will appear here for human review.</p></div>
  const assigneeOptions = suggestions.flatMap((row) => row.proposedAssignee ? [row.proposedAssignee] : []).filter((value, index, values) => values.findIndex((candidate) => candidate.member._id === value.member._id) === index)
  const filtered = suggestions.filter((row) =>
    (scopeFilter === 'all' || (scopeFilter === 'project' ? !row.suggestion.groupId : Boolean(row.suggestion.groupId))) &&
    (duplicateFilter === 'all' || (duplicateFilter === 'duplicate') === Boolean(row.possibleDuplicateTask)) &&
    (assigneeFilter === 'all' || row.suggestion.proposedAssigneeProjectMemberId === assigneeFilter) &&
    (ageFilter === 'all' || row.suggestion.createdAt >= Date.now() - Number(ageFilter) * 86_400_000),
  )
  return <section className="task-inbox"><header><div><h2>Suggestion inbox</h2><p>{filtered.length} of {suggestions.length} pending suggestions</p></div><div className="task-inbox-filters"><NativeSelect aria-label="Suggestion scope" onChange={(event) => setScopeFilter(event.target.value)} value={scopeFilter}><NativeSelectOption value="all">All scopes</NativeSelectOption><NativeSelectOption value="project">Project scope</NativeSelectOption><NativeSelectOption value="channel">Channel scope</NativeSelectOption></NativeSelect><NativeSelect aria-label="Suggestion duplicate state" onChange={(event) => setDuplicateFilter(event.target.value)} value={duplicateFilter}><NativeSelectOption value="all">All duplicate states</NativeSelectOption><NativeSelectOption value="duplicate">Possible duplicates</NativeSelectOption><NativeSelectOption value="unique">No duplicate</NativeSelectOption></NativeSelect><NativeSelect aria-label="Suggestion assignee" onChange={(event) => setAssigneeFilter(event.target.value)} searchable={assigneeOptions.length >= 8} value={assigneeFilter}><NativeSelectOption value="all">All assignees</NativeSelectOption>{assigneeOptions.map((item) => <NativeSelectOption key={item.member._id} value={item.member._id}>{item.user.displayName}</NativeSelectOption>)}</NativeSelect><NativeSelect aria-label="Suggestion age" onChange={(event) => setAgeFilter(event.target.value)} value={ageFilter}><NativeSelectOption value="all">Any age</NativeSelectOption><NativeSelectOption value="1">Last day</NativeSelectOption><NativeSelectOption value="7">Last 7 days</NativeSelectOption><NativeSelectOption value="30">Last 30 days</NativeSelectOption></NativeSelect></div></header>
    <div className="task-inbox-list">{filtered.map((row) => <SuggestionCard boards={boards} identity={identity} key={row.suggestion._id} onAnnounce={onAnnounce} row={row} />)}</div>
    {!filtered.length ? <div className="task-empty"><Sparkles size={22} /><h2>No suggestion matches</h2><p>Change the Inbox filters.</p></div> : null}
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
  const compatibleBoards = boards.filter((item) => item.board.groupId === row.suggestion.groupId)
  const defaultBoard = compatibleBoards.find((item) => item.board.isDefault) ?? compatibleBoards[0]
  const [title, setTitle] = useState(row.suggestion.proposedTitle)
  const [boardId, setBoardId] = useState<string>(defaultBoard?.board._id ?? '')
  const [error, setError] = useState('')
  const [accepting, setAccepting] = useState(false)
  const acceptIntentRef = useRef(crypto.randomUUID())
  const acceptPendingRef = useRef(false)
  const accept = useMutation(api.taskSuggestions.accept)
  const dismiss = useMutation(api.taskSuggestions.dismiss)
  const hide = useMutation(api.taskSuggestions.hide)
  const link = useMutation(api.taskSuggestions.linkToExisting)

  async function run(action: () => Promise<unknown>, message: string) {
    setError('')
    try {
      await action()
      onAnnounce(message)
      return true
    } catch (failure) {
      setError(taskError(failure))
      return false
    }
  }

  async function acceptSuggestion() {
    if (!boardId || !title.trim() || acceptPendingRef.current) return
    acceptPendingRef.current = true
    setAccepting(true)
    const succeeded = await run(() => accept({
      suggestionId: row.suggestion._id,
      boardId: boardId as Id<'taskBoards'>,
      title,
      description: row.suggestion.proposedDescription,
      priority: row.suggestion.proposedPriority,
      dueDate: row.suggestion.proposedDueDate,
      assigneeProjectMemberId: row.suggestion.proposedAssigneeProjectMemberId,
      duplicateOverride: Boolean(row.possibleDuplicateTask),
      idempotencyKey: acceptIntentRef.current,
      ...identity,
    }), 'Suggestion accepted and task created.')
    if (succeeded) acceptIntentRef.current = crypto.randomUUID()
    acceptPendingRef.current = false
    setAccepting(false)
  }

  return <article className="task-suggestion-card">
    <div className="task-suggestion-copy"><span className="task-eyebrow">{row.suggestion.groupId ? 'Channel suggestion' : 'Project suggestion'} · {Math.round(row.suggestion.confidence * 100)}% confidence</span>
      <Input aria-label="Suggestion title" onChange={(event) => setTitle(event.target.value)} value={title} />
      {row.suggestion.proposedDescription ? <p>{row.suggestion.proposedDescription}</p> : null}
      <p className="task-grounding">{row.suggestion.groundingReason}</p>
      {row.proposedAssignee ? <p>Proposed assignee: <strong>{row.proposedAssignee.user.displayName}</strong>{row.proposedAssignee.company ? ` · ${row.proposedAssignee.company.displayName}` : ''}</p> : null}
      {row.references.map((reference) => <blockquote key={reference._id}>{reference.quote ?? 'Source unavailable'}</blockquote>)}
      {row.possibleDuplicateTask ? <p className="task-duplicate"><GitMerge size={13} /> Possible duplicate: {row.possibleDuplicateTask.publicKey} · {row.possibleDuplicateTask.title}</p> : null}
    </div>
    <div className="task-suggestion-actions">
      <NativeSelect aria-label="Destination board" disabled={!compatibleBoards.length} onChange={(event) => setBoardId(event.target.value)} value={boardId}>
        {compatibleBoards.map((item) => <NativeSelectOption key={item.board._id} value={item.board._id}>{item.board.name}</NativeSelectOption>)}
      </NativeSelect>
      <Button disabled={accepting || !boardId || !title.trim()} onClick={() => void acceptSuggestion()}>{accepting ? 'Accepting…' : 'Accept'}{row.possibleDuplicateTask ? ' separately' : ''}</Button>
      {row.possibleDuplicateTask ? <Button onClick={() => void run(() => link({
        suggestionId: row.suggestion._id,
        taskId: row.possibleDuplicateTask!._id,
        idempotencyKey: crypto.randomUUID(),
        ...identity,
      }), 'Evidence added to the existing task.')} variant="outline"><GitMerge size={13} /> Add evidence</Button> : null}
      {row.canDismiss ? <Button onClick={() => void run(() => dismiss({ suggestionId: row.suggestion._id, reason: 'not_actionable', idempotencyKey: crypto.randomUUID(), ...identity }), 'Suggestion dismissed.')} variant="ghost"><X size={13} /> Dismiss</Button> : null}
      <Button onClick={() => void run(() => hide({ suggestionId: row.suggestion._id, ...identity }), 'Suggestion hidden for this Project membership.')} variant="ghost"><EyeOff size={13} /> Hide for me</Button>
    </div>
    {error ? <p className="task-form-error" role="alert">{error}</p> : null}
  </article>
}
