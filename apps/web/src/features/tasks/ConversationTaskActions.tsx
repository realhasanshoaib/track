import { useMutation, useQuery } from 'convex/react'
import { ListPlus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useState, type FormEvent } from 'react'

import { api } from '../../../../../convex/_generated/api'
import type { Doc, Id } from '../../../../../convex/_generated/dataModel'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { NativeSelect, NativeSelectOption } from '#/components/ui/native-select'
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from '#/components/ui/popover'
import { formatNumber, useLocale } from '#/i18n'
import { useReleaseConfig } from '#/lib/release-config'
import { Textarea } from '#/components/ui/textarea'
import { taskError } from './TaskCreateDialog'
import type { TaskIdentity } from './task-types'
import { DueChip, formatTaskDate, PriorityGlyph, StateRing, TaskAvatar } from './ui/TaskVisuals'

type TaskCard = {
  task: Doc<'tasks'>
  state: Doc<'taskWorkflowStates'> | null
  assignee: Doc<'projectMembers'> | null
}

export function CreateTaskFromMessage({ message, identity = {} }: { message: Doc<'messages'>; identity?: TaskIdentity }) {
  const { t } = useTranslation('tasks')
  return <TaskSourceCreate
    defaultTitle={message.body.slice(0, 180) || t('sourceCreate.followUpMessage')}
    groupId={message.groupId}
    projectId={message.projectId}
    reference={{ type: 'message', messageId: message._id }}
    identity={identity}
  />
}

export function CreateTaskFromAssistant({ stream, identity = {} }: { stream: Doc<'assistantStreams'>; identity?: TaskIdentity }) {
  const { t } = useTranslation('tasks')
  if (stream.status !== 'completed') return null
  return <TaskSourceCreate
    defaultTitle={stream.answer.slice(0, 180) || t('sourceCreate.followUpAssistant')}
    groupId={stream.groupId}
    projectId={stream.projectId}
    reference={{ type: 'assistant_answer', assistantStreamId: stream._id }}
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
  reference: { type: 'message'; messageId: Id<'messages'> } | { type: 'assistant_answer'; assistantStreamId: Id<'assistantStreams'> }
  identity: TaskIdentity
}) {
  const { t } = useTranslation('tasks')
  const release = useReleaseConfig()
  const createTask = useMutation(api.tasks.create)
  const boards = useQuery(api.taskBoards.list, release.tasks ? { projectId, ...identity } : 'skip')
  const assignees = useQuery(api.tasks.listEligibleAssignees, release.tasks ? { projectId, groupId, ...identity } : 'skip')
  const labels = useQuery(api.taskLabels.list, release.tasks ? { projectId, ...identity } : 'skip')
  const compatibleBoards = boards?.filter((item) => item.board.groupId === groupId) ?? []
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState(defaultTitle)
  const [description, setDescription] = useState('')
  const [boardId, setBoardId] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [priority, setPriority] = useState<'none' | 'urgent' | 'high' | 'medium' | 'low'>('none')
  const [dueDate, setDueDate] = useState('')
  const [labelIds, setLabelIds] = useState<Array<Id<'taskLabels'>>>([])
  const [error, setError] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    try {
      await createTask({
        projectId, groupId, boardId: boardId ? boardId as Id<'taskBoards'> : undefined,
        title, description: description.trim() || undefined,
        assigneeProjectMemberId: assigneeId ? assigneeId as Id<'projectMembers'> : undefined,
        priority, dueDate: dueDate || undefined, labelIds, references: [{ ...reference, isPrimary: true }],
        idempotencyKey: crypto.randomUUID(),
        ...identity,
      })
      setOpen(false)
    } catch (failure) {
      setError(taskError(failure, (key) => t(key)))
    }
  }
  if (!release.tasks) return null
  return <Popover onOpenChange={setOpen} open={open}>
    <PopoverTrigger render={<Button aria-label={t('sourceCreate.createAria')} className="icon-button track-message-action-button" title={t('sourceCreate.createTitle')} type="button" />}><ListPlus size={14} /></PopoverTrigger>
    <PopoverContent align="end" className="task-source-popover" side="top">
      <PopoverHeader><PopoverTitle>{t('sourceCreate.createTitle')}</PopoverTitle><PopoverDescription>{t('sourceCreate.description')}</PopoverDescription></PopoverHeader>
      <form className="task-form" onSubmit={(event) => void submit(event)}><label>{t('sourceCreate.title')}<Input dir="auto" maxLength={180} onChange={(event) => setTitle(event.target.value)} required value={title} /></label><label>{t('sourceCreate.descriptionLabel')}<Textarea dir="auto" onChange={(event) => setDescription(event.target.value)} value={description} /></label><div className="task-form-grid">
        <label>{t('sourceCreate.board')}<NativeSelect onChange={(event) => setBoardId(event.target.value)} value={boardId || compatibleBoards.find((item) => item.board.isDefault)?.board._id || compatibleBoards[0]?.board._id || ''}><NativeSelectOption value="">{t('sourceCreate.automaticBoard')}</NativeSelectOption>{compatibleBoards.map((item) => <NativeSelectOption dir="auto" key={item.board._id} value={item.board._id}>{item.board.name}</NativeSelectOption>)}</NativeSelect></label>
        <label>{t('sourceCreate.assignee')}<NativeSelect onChange={(event) => setAssigneeId(event.target.value)} value={assigneeId}><NativeSelectOption value="">{t('create.unassigned')}</NativeSelectOption>{assignees?.map((item) => <NativeSelectOption dir="auto" key={item.member._id} value={item.member._id}>{item.user.displayName}{item.company ? ` · ${item.company.displayName}` : ''}</NativeSelectOption>)}</NativeSelect></label>
        <label>{t('sourceCreate.priority')}<NativeSelect onChange={(event) => setPriority(event.target.value as typeof priority)} value={priority}>{['none', 'urgent', 'high', 'medium', 'low'].map((value) => <NativeSelectOption key={value} value={value}>{t(`priority.${value}`)}</NativeSelectOption>)}</NativeSelect></label>
        <label>{t('sourceCreate.dueDate')}<Input onChange={(event) => setDueDate(event.target.value)} type="date" value={dueDate} /></label>
      </div><fieldset><legend>{t('sourceCreate.labels')}</legend><div className="task-detail-actions">{labels?.map((label) => <Button dir="auto" key={label._id} onClick={() => setLabelIds((current) => current.includes(label._id) ? current.filter((id) => id !== label._id) : [...current, label._id])} size="sm" type="button" variant={labelIds.includes(label._id) ? 'default' : 'outline'}>{label.name}</Button>)}</div></fieldset>{error ? <p className="task-form-error" role="alert">{error}</p> : null}<Button disabled={!title.trim()} type="submit">{t('sourceCreate.create')}</Button></form>
    </PopoverContent>
  </Popover>
}

export function MessageInlineTasks({ message, identity = {} }: { message: Doc<'messages'>; identity?: TaskIdentity }) {
  const release = useReleaseConfig()
  const cards = useQuery(api.tasks.listForMessage, release.tasks ? { messageId: message._id, ...identity } : 'skip') as Array<TaskCard> | undefined
  return <InlineCards cards={cards} identity={identity} projectId={message.projectId} sourceLabel="this Channel message" />
}

export function AssistantInlineTasks({ stream, identity = {} }: { stream: Doc<'assistantStreams'>; identity?: TaskIdentity }) {
  const release = useReleaseConfig()
  const cards = useQuery(api.tasks.listForAssistant, release.tasks ? { assistantStreamId: stream._id, ...identity } : 'skip') as Array<TaskCard> | undefined
  return <InlineCards cards={cards} identity={identity} projectId={stream.projectId} sourceLabel="this Assistant answer" />
}

function InlineCards({ cards, identity, projectId, sourceLabel }: { cards: Array<TaskCard> | undefined; identity: TaskIdentity; projectId: Id<'projects'>; sourceLabel: string }) {
  const { t } = useTranslation('tasks')
  if (!cards?.length) return null
  const identityQuery = identity.actingCompanyId && identity.projectMemberId
    ? `&actingCompanyId=${identity.actingCompanyId}&projectMemberId=${identity.projectMemberId}` : ''
  return <div className="task-inline-cards">{cards.map((card) => <a href={`/workspace/projects/${projectId}/tasks?view=board&task=${card.task.publicKey}${identityQuery}`} key={card.task._id}>
    <span className="task-inline-idline"><span>{card.task.publicKey}</span><StateRing category={card.state?.category ?? 'backlog'} size="dense" /></span>
    <strong dir="auto">{card.task.title}</strong>
    <span className="task-inline-properties"><TaskAvatar member={card.assignee} /><span dir="auto">{card.state?.name ?? t('sourceCreate.unavailableStatus')}</span><DueChip dueDate={card.task.dueDate} terminal={card.state?.category === 'completed' || card.state?.category === 'canceled'} /><PriorityGlyph priority={card.task.priority} /></span>
    <small>{t('sourceCreate.linkedTo', { source: sourceLabel })}</small>
  </a>)}</div>
}

export function ChannelTaskPanel({ group, identity = {}, variant = 'panel' }: { group: Doc<'groups'>; identity?: TaskIdentity; variant?: 'panel' | 'rail' }) {
  const { locale } = useLocale()
  const { t } = useTranslation('tasks')
  const release = useReleaseConfig()
  const tasks = useQuery(
    api.tasks.list,
    release.tasks ? { projectId: group.projectId, groupId: group._id, ...identity } : 'skip',
  ) as Array<TaskCard & { terminal: boolean }> | undefined
  const detection = useQuery(api.taskDetection.getSetting, release.tasks ? { projectId: group.projectId, groupId: group._id, ...identity } : 'skip')
  const setDetection = useMutation(api.taskDetection.setEnabled)
  const requestHistory = useMutation(api.taskDetection.requestHistoryScan)
  const [historyFrom, setHistoryFrom] = useState(() => new Date(Date.now() - 7 * 86_400_000).toLocaleDateString('en-CA'))
  const [historyTo, setHistoryTo] = useState(() => new Date().toLocaleDateString('en-CA'))
  const [detectionError, setDetectionError] = useState('')
  const open = tasks?.filter((item) => !item.terminal) ?? []
  const identityQuery = identity.actingCompanyId && identity.projectMemberId
    ? `&actingCompanyId=${identity.actingCompanyId}&projectMemberId=${identity.projectMemberId}` : ''
  if (!release.tasks) return null
  async function run(action: () => Promise<unknown>) {
    setDetectionError('')
    try { await action() } catch (failure) { setDetectionError(taskError(failure, (key) => t(key))) }
  }
  const detectionStatus = detection?.lastRunStatus && ['queued', 'running', 'completed', 'failed', 'canceled'].includes(detection.lastRunStatus)
    ? t(`channelPanel.status.${detection.lastRunStatus}`)
    : t('channelPanel.idle')
  const detectionErrorCategory = detection?.lastErrorCategory === 'invalid_output'
    ? t('channelPanel.errorInvalidOutput')
    : detection?.lastErrorCategory === 'provider_failure'
      ? t('channelPanel.errorProvider')
      : detection?.lastErrorCategory
        ? t('channelPanel.errorUnknown')
        : ''
  const boardQuery = open[0]?.task.boardId ? `&board=${open[0].task.boardId}` : ''
  if (variant === 'rail') return <section aria-label={t('channelPanel.channelTasks')} className="track-rail-task-section">
    <header><span>{t('channelPanel.openTasks')}</span><a href={`/workspace/projects/${group.projectId}/tasks?view=board${boardQuery}${identityQuery}`}>{t('channelPanel.board')}</a></header>
    <div className="track-rail-task-list">
      {open.slice(0, 4).map((item) => <a href={`/workspace/projects/${group.projectId}/tasks?view=board&task=${item.task.publicKey}${identityQuery}`} key={item.task._id}>
        <StateRing category={item.state?.category ?? 'backlog'} size="dense" />
        <span><strong dir="auto">{item.task.title}</strong><small>{item.task.publicKey}{item.task.dueDate ? ` · ${formatTaskDate(item.task.dueDate)}` : ''}</small></span>
        <TaskAvatar member={item.assignee} size="rail" />
      </a>)}
      {!open.length ? <p className="track-rail-empty">{t('channelPanel.noOpenTasks')}</p> : null}
    </div>
    {detection?.canManage ? <details className="track-rail-task-settings"><summary>{t('channelPanel.taskDetection')} · {detection.enabled ? t('channelPanel.on') : t('channelPanel.off')} · {detectionStatus}</summary>
      <Button onClick={() => void run(() => setDetection({ projectId: group.projectId, groupId: group._id, enabled: !detection.enabled, ...identity }))} size="sm" variant="ghost">{detection.enabled ? t('channelPanel.turnOff') : t('channelPanel.turnOn')}</Button>
      <div><Input aria-label={t('channelPanel.historyStart')} onChange={(event) => setHistoryFrom(event.target.value)} type="date" value={historyFrom} /><Input aria-label={t('channelPanel.historyEnd')} onChange={(event) => setHistoryTo(event.target.value)} type="date" value={historyTo} /><Button onClick={() => void run(() => requestHistory({ projectId: group.projectId, groupId: group._id, from: new Date(`${historyFrom}T00:00:00`).getTime(), to: new Date(`${historyTo}T23:59:59.999`).getTime(), ...identity }))} size="sm">{t('channelPanel.scanHistory')}</Button></div>
      {detectionErrorCategory ? <p role="alert">{t('channelPanel.detectionFailed', { status: detectionErrorCategory })}</p> : null}
      {detectionError ? <p role="alert">{detectionError}</p> : null}
    </details> : null}
  </section>
  return <aside className="task-channel-panel" aria-label={t('channelPanel.channelTasks')}>
    <div><ListPlus size={14} /><strong>{open.length === 1 ? t('channelPanel.taskCountOne', { count: formatNumber(locale, open.length) }) : t('channelPanel.taskCountMany', { count: formatNumber(locale, open.length) })}</strong></div>
    <div>{open.slice(0, 3).map((item) => <a dir="auto" href={`/workspace/projects/${group.projectId}/tasks?view=board&task=${item.task.publicKey}${identityQuery}`} key={item.task._id}>{item.task.publicKey} · {item.task.title}</a>)}</div>
    <a href={`/workspace/projects/${group.projectId}/tasks?view=board${identityQuery}`}>{t('channelPanel.openBoard')}</a>
    {detection?.canManage ? <details className="task-detection-settings"><summary>{t('channelPanel.taskDetection')} · {detection.enabled ? t('channelPanel.on') : t('channelPanel.off')} · {detectionStatus}</summary>
      <p>{t('channelPanel.description')}</p>
      <Button onClick={() => void run(() => setDetection({ projectId: group.projectId, groupId: group._id, enabled: !detection.enabled, ...identity }))} size="sm" variant="outline">{detection.enabled ? t('channelPanel.turnOff') : t('channelPanel.turnOn')}</Button>
      <div className="task-history-controls"><Input aria-label={t('channelPanel.historyStart')} onChange={(event) => setHistoryFrom(event.target.value)} type="date" value={historyFrom} /><Input aria-label={t('channelPanel.historyEnd')} onChange={(event) => setHistoryTo(event.target.value)} type="date" value={historyTo} /><Button onClick={() => void run(() => requestHistory({ projectId: group.projectId, groupId: group._id, from: new Date(`${historyFrom}T00:00:00`).getTime(), to: new Date(`${historyTo}T23:59:59.999`).getTime(), ...identity }))} size="sm">{t('channelPanel.findHistory')}</Button></div>
      {detectionErrorCategory ? <p role="alert">{t('channelPanel.detectionFailed', { status: detectionErrorCategory })}</p> : null}
      {detectionError ? <p role="alert">{detectionError}</p> : null}
    </details> : null}
  </aside>
}
