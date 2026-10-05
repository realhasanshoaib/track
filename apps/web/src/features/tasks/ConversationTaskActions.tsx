import { useMutation, usePaginatedQuery, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { Link } from '@tanstack/react-router'
import { Link2, ListPlus } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'

import { api } from '../../../../../convex/_generated/api'
import type { Doc, Id } from '../../../../../convex/_generated/dataModel'
import { appToast } from '#/components/ui/app-toast'
import { Button } from '#/components/ui/button'
import { DatePicker } from '#/components/ui/date-picker'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import { NativeSelect, NativeSelectOption } from '#/components/ui/native-select'
import { useReleaseConfig } from '#/lib/release-config'
import { Textarea } from '#/components/ui/textarea'
import { taskError } from './TaskCreateDialog'
import { formatDateInputValue } from './task-date'
import { resolveWorkflowStateId } from './task-form-state'
import { useTaskLinkBatch } from './task-link-context'
import type { TaskIdentity } from './task-types'
import { DueChip, formatTaskDate, PriorityGlyph, StateRing, TaskAvatar } from './ui/TaskVisuals'
import { formatEnumLabel } from '#/features/workspace/lib/formatting'
import './task-views.css'

type TaskCard = FunctionReturnType<typeof api.tasks.listForMessage>[number]

function detectionErrorMessage(category: string) {
  if (category.includes('provider')) return 'Task detection could not reach the AI provider. Try scanning history again.'
  if (category.includes('permission') || category.includes('access')) return 'You no longer have permission to run task detection in this Channel.'
  if (category.includes('limit')) return 'This history scan is too large. Narrow the date range and try again.'
  return `Task detection failed: ${formatEnumLabel(category)}. Try scanning history again.`
}

function isValidDateInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function historyDateRangeError(from: string, to: string) {
  if (!isValidDateInput(from)) return 'Choose a start date.'
  if (!isValidDateInput(to)) return 'Choose an end date.'
  if (from > to) return 'The start date must be on or before the end date.'
  return ''
}

export function CreateTaskFromMessage({ message, identity = {} }: { message: Doc<'messages'>; identity?: TaskIdentity }) {
  return <TaskSourceCreate
    defaultTitle={message.body.slice(0, 180) || 'Follow up on this message'}
    groupId={message.groupId}
    projectId={message.projectId}
    reference={{ type: 'message', messageId: message._id }}
    sourceExcerpt={message.body}
    sourceLabel="Channel message"
    identity={identity}
  />
}

export function CreateTaskFromAssistant({ stream, identity = {} }: { stream: Doc<'assistantStreams'>; identity?: TaskIdentity }) {
  if (stream.status !== 'completed') return null
  return <TaskSourceCreate
    defaultTitle={stream.answer.slice(0, 180) || 'Follow up on Track Assistant answer'}
    groupId={stream.groupId}
    projectId={stream.projectId}
    reference={{ type: 'assistant_answer', assistantStreamId: stream._id }}
    sourceExcerpt={stream.answer}
    sourceLabel="Assistant answer"
    identity={identity}
  />
}

function TaskSourceCreate({
  defaultTitle,
  groupId,
  projectId,
  reference,
  sourceExcerpt,
  sourceLabel,
  identity,
}: {
  defaultTitle: string
  groupId: Id<'groups'>
  projectId: Id<'projects'>
  reference: { type: 'message'; messageId: Id<'messages'> } | { type: 'assistant_answer'; assistantStreamId: Id<'assistantStreams'> }
  sourceExcerpt: string
  sourceLabel: string
  identity: TaskIdentity
}) {
  const release = useReleaseConfig()
  const createTask = useMutation(api.tasks.create)
  const [open, setOpen] = useState(false)
  const boards = useQuery(api.taskBoards.list, release.tasks && open ? { projectId, ...identity } : 'skip')
  const assignees = useQuery(api.tasks.listEligibleAssignees, release.tasks && open ? { projectId, groupId, ...identity } : 'skip')
  const labels = useQuery(api.taskLabels.list, release.tasks && open ? { projectId, ...identity } : 'skip')
  const compatibleBoards = useMemo(
    () => boards?.filter((item) => item.board.groupId === groupId) ?? [],
    [boards, groupId],
  )
  const [title, setTitle] = useState(defaultTitle)
  const [description, setDescription] = useState('')
  const [boardId, setBoardId] = useState('')
  const [workflowStateId, setWorkflowStateId] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [priority, setPriority] = useState<'none' | 'urgent' | 'high' | 'medium' | 'low'>('none')
  const [dueDate, setDueDate] = useState('')
  const [labelIds, setLabelIds] = useState<Array<Id<'taskLabels'>>>([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const createIntentRef = useRef(crypto.randomUUID())
  const pendingRef = useRef(false)
  useEffect(() => {
    if (!open || !compatibleBoards.length) return
    const nextBoard = compatibleBoards.find((item) => item.board._id === boardId)
      ?? compatibleBoards.find((item) => item.board.isDefault)
      ?? compatibleBoards[0]
    if (!nextBoard) return
    const boardChanged = nextBoard.board._id !== boardId
    if (boardChanged) setBoardId(nextBoard.board._id)
    const nextStateId = resolveWorkflowStateId(nextBoard.states, boardChanged ? '' : workflowStateId)
    if (nextStateId !== workflowStateId) setWorkflowStateId(nextStateId)
  }, [boardId, compatibleBoards, open, workflowStateId])
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (pendingRef.current || !title.trim()) return
    pendingRef.current = true
    setSaving(true)
    setError('')
    try {
      const result = await createTask({
        projectId, groupId, boardId: boardId ? boardId as Id<'taskBoards'> : undefined,
        workflowStateId: workflowStateId ? workflowStateId as Id<'taskWorkflowStates'> : undefined,
        title: title.trim(), description: description.trim() || undefined,
        assigneeProjectMemberId: assigneeId ? assigneeId as Id<'projectMembers'> : undefined,
        priority, dueDate: dueDate || undefined, labelIds, references: [{ ...reference, isPrimary: true }],
        idempotencyKey: createIntentRef.current,
        ...identity,
      })
      setOpen(false)
      createIntentRef.current = crypto.randomUUID()
      setTitle(defaultTitle)
      setDescription('')
      setBoardId('')
      setWorkflowStateId('')
      setAssigneeId('')
      setPriority('none')
      setDueDate('')
      setLabelIds([])
      appToast.success('Task created from conversation', `${result.publicKey} keeps a link to this ${sourceLabel.toLowerCase()}.`)
    } catch (failure) {
      const message = taskError(failure)
      setError(message)
      appToast.error('Task not created', message)
    } finally {
      pendingRef.current = false
      setSaving(false)
    }
  }
  if (!release.tasks) return null
  return <Dialog onOpenChange={setOpen} open={open}>
    <Button aria-label="Create task from this source" className="icon-button track-message-action-button" disabled={saving} onClick={() => setOpen(true)} title="Create task" type="button"><ListPlus aria-hidden="true" size={14} /></Button>
    <DialogContent className="task-source-dialog">
      <DialogHeader><span className="task-source-eyebrow">Conversation to task</span><DialogTitle>Create task</DialogTitle><DialogDescription>Turn this source into accountable work without losing its Channel context.</DialogDescription></DialogHeader>
      <div className="task-source-evidence"><Link2 aria-hidden="true" size={15} /><span><strong>{sourceLabel}</strong><small>Attached as scoped evidence</small></span><blockquote>{sourceExcerpt.slice(0, 240) || 'Source content is unavailable.'}</blockquote></div>
      <form className="task-form" onSubmit={(event) => void submit(event)}>
        <label>Title<Input autoComplete="off" maxLength={180} name="title" onChange={(event) => { setTitle(event.target.value); if (error && event.target.value.trim()) setError('') }} placeholder="For example, follow up with the client…" required value={title} /></label>
        <label>Description<Textarea autoComplete="off" maxLength={20_000} name="description" onChange={(event) => setDescription(event.target.value)} placeholder="Add the expected outcome or acceptance criteria…" value={description} /></label>
        <div className="task-form-grid">
          <label>Board<NativeSelect aria-label="Task board" autoComplete="off" disabled={boards === undefined} name="boardId" onChange={(event) => { const nextBoard = compatibleBoards.find((item) => item.board._id === event.target.value); setBoardId(event.target.value); setWorkflowStateId(resolveWorkflowStateId(nextBoard?.states ?? [], '')) }} value={boardId}>{boards === undefined ? <NativeSelectOption value="">Loading boards…</NativeSelectOption> : null}{boards !== undefined && compatibleBoards.length === 0 ? <NativeSelectOption value="">Channel board creates automatically</NativeSelectOption> : null}{compatibleBoards.map((item) => <NativeSelectOption key={item.board._id} value={item.board._id}>{item.board.name}</NativeSelectOption>)}</NativeSelect></label>
          <label>Status<NativeSelect aria-label="Task status" autoComplete="off" disabled={boards === undefined || !compatibleBoards.find((item) => item.board._id === boardId)?.states.length} name="workflowStateId" onChange={(event) => setWorkflowStateId(event.target.value)} value={workflowStateId}>{boards === undefined ? <NativeSelectOption value="">Loading statuses…</NativeSelectOption> : compatibleBoards.find((item) => item.board._id === boardId)?.states.length ? compatibleBoards.find((item) => item.board._id === boardId)?.states.map((item) => <NativeSelectOption key={item._id} value={item._id}>{item.name}</NativeSelectOption>) : <NativeSelectOption value="">Default status creates automatically</NativeSelectOption>}</NativeSelect></label>
          <label>Assignee<NativeSelect aria-label="Assignee" autoComplete="off" name="assigneeProjectMemberId" onChange={(event) => setAssigneeId(event.target.value)} searchable={Boolean(assignees?.length && assignees.length >= 8)} value={assigneeId}><NativeSelectOption value="">Unassigned</NativeSelectOption>{assignees?.map((item) => <NativeSelectOption key={item.member._id} value={item.member._id}>{item.user.displayName}{item.company ? ` · ${item.company.displayName}` : ''}</NativeSelectOption>)}</NativeSelect></label>
          <label>Priority<NativeSelect aria-label="Priority" autoComplete="off" name="priority" onChange={(event) => setPriority(event.target.value as typeof priority)} value={priority}>{['none', 'urgent', 'high', 'medium', 'low'].map((value) => <NativeSelectOption key={value} value={value}>{value}</NativeSelectOption>)}</NativeSelect></label>
          <label>Due date<DatePicker aria-label="Due date" onChange={setDueDate} value={dueDate} /></label>
        </div>
        <fieldset aria-label="Task labels" className="task-label-picker"><legend>Labels</legend><div className="task-label-picker-options">{labels?.map((label) => <Button aria-pressed={labelIds.includes(label._id)} key={label._id} onClick={() => setLabelIds((current) => current.includes(label._id) ? current.filter((id) => id !== label._id) : [...current, label._id])} size="sm" type="button" variant={labelIds.includes(label._id) ? 'default' : 'outline'}>{label.name}</Button>)}{labels?.length === 0 ? <span className="task-label-picker-empty">No labels yet. Add them from Task settings.</span> : null}{labels === undefined ? <span className="task-label-picker-empty">Loading labels…</span> : null}</div></fieldset>
        {error ? <p className="task-form-error" role="alert">{error}</p> : null}
        <DialogFooter><Button disabled={saving} onClick={() => setOpen(false)} type="button" variant="outline">Cancel</Button><Button disabled={saving || !title.trim()} type="submit">{saving ? 'Creating…' : 'Create task'}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
}

export function MessageInlineTasks({ message, identity = {} }: { message: Doc<'messages'>; identity?: TaskIdentity }) {
  const release = useReleaseConfig()
  const batch = useTaskLinkBatch()
  const individualCards = useQuery(
    api.tasks.listForMessage,
    release.tasks && !batch ? { messageId: message._id, ...identity } : 'skip',
  )
  const cards = batch?.messageTasks.get(String(message._id)) ?? individualCards
  return <InlineCards cards={cards} groupId={message.groupId} identity={identity} projectId={message.projectId} sourceLabel="this Channel message" />
}

export function AssistantInlineTasks({ stream, identity = {} }: { stream: Doc<'assistantStreams'>; identity?: TaskIdentity }) {
  const release = useReleaseConfig()
  const batch = useTaskLinkBatch()
  const individualCards = useQuery(
    api.tasks.listForAssistant,
    release.tasks && !batch ? { assistantStreamId: stream._id, ...identity } : 'skip',
  )
  const cards = batch?.assistantTasks.get(String(stream._id)) ?? individualCards
  return <InlineCards cards={cards} groupId={stream.groupId} identity={identity} projectId={stream.projectId} sourceLabel="this Assistant answer" />
}

function taskRouteSearch(identity: TaskIdentity, groupId: Id<'groups'>, extra: { task?: string; board?: string }) {
  return {
    view: 'board' as const,
    groupId: String(groupId),
    actingCompanyId: identity.actingCompanyId,
    projectMemberId: identity.projectMemberId,
    ...extra,
  }
}

function InlineCards({ cards, groupId, identity, projectId, sourceLabel }: { cards: Array<TaskCard> | undefined; groupId: Id<'groups'>; identity: TaskIdentity; projectId: Id<'projects'>; sourceLabel: string }) {
  if (!cards?.length) return null
  return <div className="task-inline-cards">{cards.map((card) => <Link
    key={card.task._id}
    params={{ projectId }}
    search={taskRouteSearch(identity, groupId, { task: card.task.publicKey })}
    to="/workspace/projects/$projectId/tasks"
  >
    <span className="task-inline-idline"><span>{card.task.publicKey}</span><StateRing category={card.state?.category ?? 'backlog'} size="dense" /></span>
    <strong>{card.task.title}</strong>
    <span className="task-inline-properties"><TaskAvatar member={card.assignee} /><span>{card.state?.name ?? 'Unavailable status'}</span><DueChip dueDate={card.task.dueDate} terminal={card.state?.category === 'completed' || card.state?.category === 'canceled'} /><PriorityGlyph priority={card.task.priority} /></span>
    <small>Linked to {sourceLabel}</small>
  </Link>)}</div>
}

export function ChannelTaskPanel({ group, identity = {}, variant = 'panel' }: { group: Doc<'groups'>; identity?: TaskIdentity; variant?: 'panel' | 'rail' }) {
  const release = useReleaseConfig()
  const taskPage = usePaginatedQuery(
    api.tasks.listPage,
    release.tasks ? { projectId: group.projectId, groupId: group._id, ...identity } : 'skip',
    { initialNumItems: 50 },
  )
  const detection = useQuery(api.taskDetection.getSetting, release.tasks ? { projectId: group.projectId, groupId: group._id, ...identity } : 'skip')
  const setDetection = useMutation(api.taskDetection.setEnabled)
  const requestHistory = useMutation(api.taskDetection.requestHistoryScan)
  const [historyFrom, setHistoryFrom] = useState(() => formatDateInputValue(new Date(Date.now() - 7 * 86_400_000)))
  const [historyTo, setHistoryTo] = useState(() => formatDateInputValue(new Date()))
  const [detectionError, setDetectionError] = useState('')
  const historyRangeErrorId = useId()
  const historyRangeError = historyDateRangeError(historyFrom, historyTo)
  const historyFromInvalid = !isValidDateInput(historyFrom) || (isValidDateInput(historyTo) && historyFrom > historyTo)
  const historyToInvalid = !isValidDateInput(historyTo) || (isValidDateInput(historyFrom) && historyFrom > historyTo)
  const open = taskPage.results.filter((item) => item.state?.category !== 'completed' && item.state?.category !== 'canceled')
  if (!release.tasks) return null
  async function run(action: () => Promise<unknown>) {
    setDetectionError('')
    try { await action() } catch (failure) { setDetectionError(taskError(failure)) }
  }
  const boardId = open[0]?.task.boardId
  const historyDateRangeControls = <>
    <div aria-describedby={historyRangeError ? historyRangeErrorId : undefined} aria-label="History date range" className="task-history-controls" role="group">
      <div className="task-history-date-field"><span>From</span><DatePicker aria-describedby={historyFromInvalid ? historyRangeErrorId : undefined} aria-invalid={historyFromInvalid || undefined} aria-label="History start date" onChange={setHistoryFrom} value={historyFrom} /></div>
      <div className="task-history-date-field"><span>Through</span><DatePicker aria-describedby={historyToInvalid ? historyRangeErrorId : undefined} aria-invalid={historyToInvalid || undefined} aria-label="History end date" onChange={setHistoryTo} value={historyTo} /></div>
      <Button disabled={Boolean(historyRangeError)} onClick={() => void run(() => requestHistory({ projectId: group.projectId, groupId: group._id, from: new Date(`${historyFrom}T00:00:00`).getTime(), to: new Date(`${historyTo}T23:59:59.999`).getTime(), ...identity }))} size="sm">{variant === 'rail' ? 'Scan history' : 'Find tasks in history'}</Button>
    </div>
    {historyRangeError ? <p className="task-history-range-error" id={historyRangeErrorId} role="alert">{historyRangeError}</p> : null}
  </>
  if (variant === 'rail') return <section aria-label="Channel tasks" className="track-rail-task-section">
    <header><span>Open tasks · this Channel</span><Link params={{ projectId: group.projectId }} search={taskRouteSearch(identity, group._id, { board: boardId })} to="/workspace/projects/$projectId/tasks">Board →</Link></header>
    <div className="track-rail-task-list">
      {open.slice(0, 4).map((item) => <Link key={item.task._id} params={{ projectId: group.projectId }} search={taskRouteSearch(identity, group._id, { task: item.task.publicKey, board: item.task.boardId })} to="/workspace/projects/$projectId/tasks">
        <StateRing category={item.state?.category ?? 'backlog'} size="dense" />
        <span><strong>{item.task.title}</strong><small>{item.task.publicKey}{item.task.dueDate ? ` · due ${formatTaskDate(item.task.dueDate)}` : ''}</small></span>
        <TaskAvatar member={item.assignee} size="rail" />
      </Link>)}
      {!open.length ? <p className="track-rail-empty">No open tasks in this Channel.</p> : null}
    </div>
    {detection?.canManage ? <details className="track-rail-task-settings"><summary>Task detection · {detection.enabled ? 'on' : 'off'} · {detection.lastRunStatus ?? 'idle'}</summary>
      <Button onClick={() => void run(() => setDetection({ projectId: group.projectId, groupId: group._id, enabled: !detection.enabled, ...identity }))} size="sm" variant="ghost">Turn {detection.enabled ? 'off' : 'on'}</Button>
      {historyDateRangeControls}
      {detection.lastErrorCategory ? <p role="alert">{detectionErrorMessage(detection.lastErrorCategory)}</p> : null}
      {detectionError ? <p role="alert">{detectionError}</p> : null}
    </details> : null}
  </section>
  return <aside className="task-channel-panel" aria-label="Channel tasks">
    <div><ListPlus aria-hidden="true" size={14} /><strong>{open.length} open task{open.length === 1 ? '' : 's'}</strong></div>
    <div>{open.slice(0, 3).map((item) => <Link
      key={item.task._id}
      params={{ projectId: group.projectId }}
      search={taskRouteSearch(identity, group._id, { task: item.task.publicKey, board: item.task.boardId })}
      to="/workspace/projects/$projectId/tasks"
    >{item.task.publicKey} · {item.task.title}</Link>)}</div>
    <Link params={{ projectId: group.projectId }} search={taskRouteSearch(identity, group._id, {})} to="/workspace/projects/$projectId/tasks">Open Channel board</Link>
    {detection?.canManage ? <details className="task-detection-settings"><summary>Task detection · {detection.enabled ? 'on' : 'off'} · {detection.lastRunStatus ?? 'idle'}</summary>
      <p>Eligible Channel messages are sent to the configured AI provider. Disabling does not cancel a provider request already in flight; stale results are discarded.</p>
      <Button onClick={() => void run(() => setDetection({ projectId: group.projectId, groupId: group._id, enabled: !detection.enabled, ...identity }))} size="sm" variant="outline">Turn {detection.enabled ? 'off' : 'on'}</Button>
      {historyDateRangeControls}
      {detection.lastErrorCategory ? <p role="alert">{detectionErrorMessage(detection.lastErrorCategory)}</p> : null}
      {detectionError ? <p role="alert">{detectionError}</p> : null}
    </details> : null}
  </aside>
}
