import { useMutation, usePaginatedQuery, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { ListPlus } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'

import { api } from '../../../../../convex/_generated/api'
import type { Doc, Id } from '../../../../../convex/_generated/dataModel'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { NativeSelect, NativeSelectOption } from '#/components/ui/native-select'
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from '#/components/ui/popover'
import { useReleaseConfig } from '#/lib/release-config'
import { Textarea } from '#/components/ui/textarea'
import { taskError } from './TaskCreateDialog'
import { useTaskLinkBatch } from './task-link-context'
import type { TaskIdentity } from './task-types'
import { DueChip, formatTaskDate, PriorityGlyph, StateRing, TaskAvatar } from './ui/TaskVisuals'

type TaskCard = FunctionReturnType<typeof api.tasks.listForMessage>[number]

export function CreateTaskFromMessage({ message, identity = {} }: { message: Doc<'messages'>; identity?: TaskIdentity }) {
  return <TaskSourceCreate
    defaultTitle={message.body.slice(0, 180) || 'Follow up on this message'}
    groupId={message.groupId}
    projectId={message.projectId}
    reference={{ type: 'message', messageId: message._id }}
    identity={identity}
  />
}

function TaskSourceCreate({
  defaultTitle,
  groupId,
  projectId,
  reference,
  identity,
}: {
  defaultTitle: string
  groupId: Id<'groups'>
  projectId: Id<'projects'>
  reference: { type: 'message'; messageId: Id<'messages'> }
  identity: TaskIdentity
}) {
  const release = useReleaseConfig()
  const createTask = useMutation(api.tasks.create)
  const [open, setOpen] = useState(false)
  const boards = useQuery(api.taskBoards.list, release.tasks && open ? { projectId, ...identity } : 'skip')
  const assignees = useQuery(api.tasks.listEligibleAssignees, release.tasks && open ? { projectId, groupId, ...identity } : 'skip')
  const labels = useQuery(api.taskLabels.list, release.tasks && open ? { projectId, ...identity } : 'skip')
  const compatibleBoards = boards?.filter((item) => item.board.groupId === groupId) ?? []
  const [title, setTitle] = useState(defaultTitle)
  const [description, setDescription] = useState('')
  const [boardId, setBoardId] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [priority, setPriority] = useState<'none' | 'urgent' | 'high' | 'medium' | 'low'>('none')
  const [dueDate, setDueDate] = useState('')
  const [labelIds, setLabelIds] = useState<Array<Id<'taskLabels'>>>([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const createIntentRef = useRef(crypto.randomUUID())
  const pendingRef = useRef(false)
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (pendingRef.current || !title.trim()) return
    pendingRef.current = true
    setSaving(true)
    setError('')
    try {
      await createTask({
        projectId, groupId, boardId: boardId ? boardId as Id<'taskBoards'> : undefined,
        title, description: description.trim() || undefined,
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
      setAssigneeId('')
      setPriority('none')
      setDueDate('')
      setLabelIds([])
    } catch (failure) {
      setError(taskError(failure))
    } finally {
      pendingRef.current = false
      setSaving(false)
    }
  }
  if (!release.tasks) return null
  return <Popover onOpenChange={setOpen} open={open}>
    <PopoverTrigger render={<Button aria-label="Create task from this source" className="icon-button track-message-action-button" disabled={saving} title="Create task" type="button" />}><ListPlus size={14} /></PopoverTrigger>
    <PopoverContent align="end" className="task-source-popover" side="top">
      <PopoverHeader><PopoverTitle>Create task</PopoverTitle><PopoverDescription>The source stays attached as Channel-scoped evidence.</PopoverDescription></PopoverHeader>
      <form className="task-form" onSubmit={(event) => void submit(event)}><label>Title<Input maxLength={180} onChange={(event) => setTitle(event.target.value)} required value={title} /></label><label>Description<Textarea onChange={(event) => setDescription(event.target.value)} value={description} /></label><div className="task-form-grid">
        <label>Board<NativeSelect onChange={(event) => setBoardId(event.target.value)} value={boardId || compatibleBoards.find((item) => item.board.isDefault)?.board._id || compatibleBoards[0]?.board._id || ''}><NativeSelectOption value="">Automatic Channel board</NativeSelectOption>{compatibleBoards.map((item) => <NativeSelectOption key={item.board._id} value={item.board._id}>{item.board.name}</NativeSelectOption>)}</NativeSelect></label>
        <label>Assignee<NativeSelect onChange={(event) => setAssigneeId(event.target.value)} value={assigneeId}><NativeSelectOption value="">Unassigned</NativeSelectOption>{assignees?.map((item) => <NativeSelectOption key={item.member._id} value={item.member._id}>{item.user.displayName}{item.company ? ` · ${item.company.displayName}` : ''}</NativeSelectOption>)}</NativeSelect></label>
        <label>Priority<NativeSelect onChange={(event) => setPriority(event.target.value as typeof priority)} value={priority}>{['none', 'urgent', 'high', 'medium', 'low'].map((value) => <NativeSelectOption key={value} value={value}>{value}</NativeSelectOption>)}</NativeSelect></label>
        <label>Due date<Input onChange={(event) => setDueDate(event.target.value)} type="date" value={dueDate} /></label>
      </div><fieldset><legend>Labels</legend><div className="task-detail-actions">{labels?.map((label) => <Button key={label._id} onClick={() => setLabelIds((current) => current.includes(label._id) ? current.filter((id) => id !== label._id) : [...current, label._id])} size="sm" type="button" variant={labelIds.includes(label._id) ? 'default' : 'outline'}>{label.name}</Button>)}</div></fieldset>{error ? <p className="task-form-error" role="alert">{error}</p> : null}<Button disabled={saving || !title.trim()} type="submit">{saving ? 'Creating…' : 'Create task'}</Button></form>
    </PopoverContent>
  </Popover>
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

function taskRouteContextQuery(identity: TaskIdentity, groupId: Id<'groups'>) {
  const identityQuery = identity.actingCompanyId && identity.projectMemberId
    ? `&actingCompanyId=${identity.actingCompanyId}&projectMemberId=${identity.projectMemberId}` : ''
  return `${identityQuery}&groupId=${encodeURIComponent(groupId)}`
}

function InlineCards({ cards, groupId, identity, projectId, sourceLabel }: { cards: Array<TaskCard> | undefined; groupId: Id<'groups'>; identity: TaskIdentity; projectId: Id<'projects'>; sourceLabel: string }) {
  if (!cards?.length) return null
  const contextQuery = taskRouteContextQuery(identity, groupId)
  return <div className="task-inline-cards">{cards.map((card) => <a href={`/workspace/projects/${projectId}/tasks?view=board&task=${card.task.publicKey}${contextQuery}`} key={card.task._id}>
    <span className="task-inline-idline"><span>{card.task.publicKey}</span><StateRing category={card.state?.category ?? 'backlog'} size="dense" /></span>
    <strong>{card.task.title}</strong>
    <span className="task-inline-properties"><TaskAvatar member={card.assignee} /><span>{card.state?.name ?? 'Unavailable status'}</span><DueChip dueDate={card.task.dueDate} terminal={card.state?.category === 'completed' || card.state?.category === 'canceled'} /><PriorityGlyph priority={card.task.priority} /></span>
    <small>Linked to {sourceLabel}</small>
  </a>)}</div>
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
  const [historyFrom, setHistoryFrom] = useState(() => new Date(Date.now() - 7 * 86_400_000).toLocaleDateString('en-CA'))
  const [historyTo, setHistoryTo] = useState(() => new Date().toLocaleDateString('en-CA'))
  const [detectionError, setDetectionError] = useState('')
  const open = taskPage.results.filter((item) => item.state?.category !== 'completed' && item.state?.category !== 'canceled')
  const contextQuery = taskRouteContextQuery(identity, group._id)
  if (!release.tasks) return null
  async function run(action: () => Promise<unknown>) {
    setDetectionError('')
    try { await action() } catch (failure) { setDetectionError(taskError(failure)) }
  }
  const boardQuery = open[0]?.task.boardId ? `&board=${open[0].task.boardId}` : ''
  if (variant === 'rail') return <section aria-label="Channel tasks" className="track-rail-task-section">
    <header><span>Open tasks · this Channel</span><a href={`/workspace/projects/${group.projectId}/tasks?view=board${boardQuery}${contextQuery}`}>Board →</a></header>
    <div className="track-rail-task-list">
      {open.slice(0, 4).map((item) => <a href={`/workspace/projects/${group.projectId}/tasks?view=board&task=${item.task.publicKey}${contextQuery}`} key={item.task._id}>
        <StateRing category={item.state?.category ?? 'backlog'} size="dense" />
        <span><strong>{item.task.title}</strong><small>{item.task.publicKey}{item.task.dueDate ? ` · due ${formatTaskDate(item.task.dueDate)}` : ''}</small></span>
        <TaskAvatar member={item.assignee} size="rail" />
      </a>)}
      {!open.length ? <p className="track-rail-empty">No open tasks in this Channel.</p> : null}
    </div>
    {detection?.canManage ? <details className="track-rail-task-settings"><summary>Task detection · {detection.enabled ? 'on' : 'off'} · {detection.lastRunStatus ?? 'idle'}</summary>
      <Button onClick={() => void run(() => setDetection({ projectId: group.projectId, groupId: group._id, enabled: !detection.enabled, ...identity }))} size="sm" variant="ghost">Turn {detection.enabled ? 'off' : 'on'}</Button>
      <div><Input aria-label="History start date" onChange={(event) => setHistoryFrom(event.target.value)} type="date" value={historyFrom} /><Input aria-label="History end date" onChange={(event) => setHistoryTo(event.target.value)} type="date" value={historyTo} /><Button onClick={() => void run(() => requestHistory({ projectId: group.projectId, groupId: group._id, from: new Date(`${historyFrom}T00:00:00`).getTime(), to: new Date(`${historyTo}T23:59:59.999`).getTime(), ...identity }))} size="sm">Scan history</Button></div>
      {detection.lastErrorCategory ? <p role="alert">Detection failed: {detection.lastErrorCategory.replaceAll('_', ' ')}</p> : null}
      {detectionError ? <p role="alert">{detectionError}</p> : null}
    </details> : null}
  </section>
  return <aside className="task-channel-panel" aria-label="Channel tasks">
    <div><ListPlus size={14} /><strong>{open.length} open task{open.length === 1 ? '' : 's'}</strong></div>
    <div>{open.slice(0, 3).map((item) => <a href={`/workspace/projects/${group.projectId}/tasks?view=board&task=${item.task.publicKey}${contextQuery}`} key={item.task._id}>{item.task.publicKey} · {item.task.title}</a>)}</div>
    <a href={`/workspace/projects/${group.projectId}/tasks?view=board${contextQuery}`}>Open Channel board</a>
    {detection?.canManage ? <details className="task-detection-settings"><summary>Task detection · {detection.enabled ? 'on' : 'off'} · {detection.lastRunStatus ?? 'idle'}</summary>
      <p>Eligible Channel messages are sent to the configured AI provider. Disabling does not cancel a provider request already in flight; stale results are discarded.</p>
      <Button onClick={() => void run(() => setDetection({ projectId: group.projectId, groupId: group._id, enabled: !detection.enabled, ...identity }))} size="sm" variant="outline">Turn {detection.enabled ? 'off' : 'on'}</Button>
      <div className="task-history-controls"><Input aria-label="History start date" onChange={(event) => setHistoryFrom(event.target.value)} type="date" value={historyFrom} /><Input aria-label="History end date" onChange={(event) => setHistoryTo(event.target.value)} type="date" value={historyTo} /><Button onClick={() => void run(() => requestHistory({ projectId: group.projectId, groupId: group._id, from: new Date(`${historyFrom}T00:00:00`).getTime(), to: new Date(`${historyTo}T23:59:59.999`).getTime(), ...identity }))} size="sm">Find tasks in history</Button></div>
      {detection.lastErrorCategory ? <p role="alert">Detection failed: {detection.lastErrorCategory.replaceAll('_', ' ')}</p> : null}
      {detectionError ? <p role="alert">{detectionError}</p> : null}
    </details> : null}
  </aside>
}
