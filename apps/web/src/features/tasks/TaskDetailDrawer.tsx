import { useMutation, useQuery } from 'convex/react'
import { Archive, Check, Link2, MessageSquare, Plus, UserRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useEffect, useState, type FormEvent } from 'react'

import { api } from '../../../../../convex/_generated/api'
import type { Id } from '../../../../../convex/_generated/dataModel'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { NativeSelect, NativeSelectOption } from '#/components/ui/native-select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '#/components/ui/sheet'
import { Textarea } from '#/components/ui/textarea'
import { formatDate, formatNumber, useLocale } from '#/i18n'
import { MarkdownText } from '#/features/workspace/markdown'
import type { TaskIdentity, TaskView } from './task-types'
import { taskError } from './TaskCreateDialog'
import { PriorityGlyph, StateRing, TaskAvatar } from './ui/TaskVisuals'

type TaskDetail = TaskView & {
  comments: Array<{ _id: Id<'taskComments'>; authorProjectMemberId: Id<'projectMembers'>; body: string; createdAt: number; updatedAt: number; archivedAt?: number; revision: number }>
  activities: Array<{ _id: Id<'taskActivities'>; action: string; createdAt: number }>
  following: boolean
  capabilities: {
    canEdit: boolean
    canArchive: boolean
    canComment: boolean
    canChangeScope: boolean
  }
  restrictedEarlierContext: boolean
  currentProjectMemberId: Id<'projectMembers'>
}

function activityLabel(action: string, translate: (key: string) => string) {
  const labels: Record<string, string> = {
    created: 'detail.actionCreated',
    title_changed: 'detail.actionTitleChanged',
    description_changed: 'detail.actionDescriptionChanged',
    state_changed: 'detail.actionStateChanged',
    assignee_changed: 'detail.actionAssigneeChanged',
    priority_changed: 'detail.actionPriorityChanged',
    due_date_changed: 'detail.actionDueDateChanged',
    labels_changed: 'detail.actionLabelsChanged',
    board_changed: 'detail.actionBoardChanged',
    scope_changed: 'detail.actionScopeChanged',
    commented: 'detail.actionCommented',
    archived: 'detail.actionArchived',
    restored: 'detail.actionRestored',
  }
  return translate(labels[action] ?? 'detail.actionUpdated')
}

export function TaskDetailDrawer({
  identity,
  onAnnounce,
  onOpenChange,
  projectId,
  taskKey,
}: {
  identity: TaskIdentity
  onAnnounce: (message: string) => void
  onOpenChange: (open: boolean) => void
  projectId: Id<'projects'>
  taskKey?: string
}) {
  const { locale } = useLocale()
  const { t } = useTranslation('tasks')
  const detail = useQuery(
    api.tasks.getByKey,
    taskKey ? { projectId, publicKey: taskKey, ...identity } : 'skip',
  ) as TaskDetail | null | undefined
  const boardRows = useQuery(api.taskBoards.list, taskKey ? { projectId, ...identity } : 'skip')
  const assignees = useQuery(
    api.tasks.listEligibleAssignees,
    detail ? { projectId, groupId: detail.task.groupId, ...identity } : 'skip',
  )
  const tasks = useQuery(api.tasks.list, taskKey ? { projectId, ...identity } : 'skip') as Array<TaskView> | undefined
  const labels = useQuery(api.taskLabels.list, taskKey ? { projectId, ...identity } : 'skip')
  const updateTask = useMutation(api.tasks.update)
  const createTask = useMutation(api.tasks.create)
  const createComment = useMutation(api.taskComments.create)
  const editComment = useMutation(api.taskComments.edit)
  const archiveComment = useMutation(api.taskComments.archive)
  const setFollowing = useMutation(api.tasks.setFollowing)
  const setArchived = useMutation(api.tasks.setArchived)
  const setTaskLabels = useMutation(api.taskLabels.setTaskLabels)
  const changeScope = useMutation(api.tasks.changeScope)
  const [draft, setDraft] = useState({ title: '', description: '', priority: 'none', dueDate: '', stateId: '', assigneeId: '' })
  const [comment, setComment] = useState('')
  const [mentionIds, setMentionIds] = useState<Array<Id<'projectMembers'>>>([])
  const [editingComment, setEditingComment] = useState<{ id: Id<'taskComments'>; body: string; revision: number }>()
  const [subtaskTitle, setSubtaskTitle] = useState('')
  const [labelIds, setLabelIds] = useState<Array<Id<'taskLabels'>>>([])
  const [scopeBoardId, setScopeBoardId] = useState('')
  const [scopeConfirmed, setScopeConfirmed] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!detail) return
    setDraft({
      title: detail.task.title,
      description: detail.task.description ?? '',
      priority: detail.task.priority,
      dueDate: detail.task.dueDate ?? '',
      stateId: detail.task.workflowStateId,
      assigneeId: detail.task.assigneeProjectMemberId ?? '',
    })
    setLabelIds(detail.labels.map((label) => label._id))
    setError('')
  }, [detail])

  const board = boardRows?.find((item) => item.board._id === detail?.task.boardId)
  const subtasks = tasks?.filter((item) => item.task.parentTaskId === detail?.task._id) ?? []
  const selectedState = board?.states.find((state) => state._id === draft.stateId) ?? detail?.state
  const selectedAssignee = draft.assigneeId
    ? assignees?.find((item) => item.member._id === draft.assigneeId)?.member
      ?? (detail?.assignee?._id === draft.assigneeId ? detail.assignee : null)
    : null

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!detail) return
    setSaving(true)
    setError('')
    try {
      await updateTask({
        taskId: detail.task._id,
        expectedRevision: detail.task.revision,
        title: draft.title,
        description: draft.description || null,
        priority: draft.priority as typeof detail.task.priority,
        dueDate: draft.dueDate || null,
        workflowStateId: draft.stateId as Id<'taskWorkflowStates'>,
        assigneeProjectMemberId: draft.assigneeId ? draft.assigneeId as Id<'projectMembers'> : null,
        confirmOpenSubtasks: true,
        ...identity,
      })
      onAnnounce(`${detail.task.publicKey} ${t('detail.saved')}`)
    } catch (failure) {
      setError(taskError(failure, (key) => t(key)))
    } finally {
      setSaving(false)
    }
  }

  async function addComment(event: FormEvent) {
    event.preventDefault()
    if (!detail || !comment.trim()) return
    try {
      await createComment({
        taskId: detail.task._id,
        body: comment,
        mentionedProjectMemberIds: mentionIds,
        idempotencyKey: crypto.randomUUID(),
        ...identity,
      })
      setComment('')
      setMentionIds([])
      onAnnounce(t('detail.commentAdded'))
    } catch (failure) {
      setError(taskError(failure, (key) => t(key)))
    }
  }

  async function addSubtask(event: FormEvent) {
    event.preventDefault()
    if (!detail || !subtaskTitle.trim()) return
    try {
      await createTask({
        projectId,
        boardId: detail.task.boardId,
        parentTaskId: detail.task._id,
        title: subtaskTitle,
        priority: 'none',
        idempotencyKey: crypto.randomUUID(),
        ...identity,
      })
      setSubtaskTitle('')
      onAnnounce(t('detail.subtaskCreated'))
    } catch (failure) {
      setError(taskError(failure, (key) => t(key)))
    }
  }

  return (
    <Sheet onOpenChange={onOpenChange} open={Boolean(taskKey)}>
      <SheetContent className="task-detail-sheet">
        {detail === undefined ? <div className="task-detail-loading">{t('detail.loading')}</div> : detail === null ? (
          <div className="task-detail-unavailable"><h2>{t('detail.unavailableTitle')}</h2><p>{t('detail.unavailableBody')}</p></div>
        ) : (
          <>
            <SheetHeader>
              <div className="task-detail-topline">
                <StateRing category={selectedState?.category ?? 'backlog'} />
                <span><b dir="ltr">{detail.task.publicKey}</b> · <span dir="auto">{detail.board?.name ?? t('detail.archivedBoard')}</span></span>
              </div>
              <SheetTitle className="sr-only">{detail.task.title}</SheetTitle>
              <SheetDescription className="sr-only">{detail.state?.name ?? t('visuals.unavailableStatus')}</SheetDescription>
            </SheetHeader>
            <div className="task-detail-body">
              <form className="task-detail-editor" onSubmit={(event) => void save(event)}>
                <Input aria-label={t('create.titleLabel')} className="task-detail-title-input" dir="auto" disabled={!detail.capabilities.canEdit} onChange={(event) => setDraft({ ...draft, title: event.target.value })} value={draft.title} />
                <Textarea aria-label={t('create.descriptionLabel')} className="task-detail-description" dir="auto" disabled={!detail.capabilities.canEdit} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder={t('detail.descriptionPlaceholder')} value={draft.description} />
                <div className="task-property-row">
                  <label className="task-property-control"><StateRing category={selectedState?.category ?? 'backlog'} size="dense" /><span className="sr-only">{t('detail.status')}</span><NativeSelect disabled={!detail.capabilities.canEdit} onChange={(event) => setDraft({ ...draft, stateId: event.target.value })} value={draft.stateId}>
                    {board?.states.map((state) => <NativeSelectOption dir="auto" key={state._id} value={state._id}>{state.name} · {t(`stateCategory.${state.category}`)}</NativeSelectOption>)}
                  </NativeSelect></label>
                  <label className="task-property-control"><PriorityGlyph priority={draft.priority as TaskView['task']['priority']} /><span className="sr-only">{t('detail.priority')}</span><NativeSelect disabled={!detail.capabilities.canEdit} onChange={(event) => setDraft({ ...draft, priority: event.target.value })} value={draft.priority}>
                    {['none', 'urgent', 'high', 'medium', 'low'].map((value) => <NativeSelectOption key={value} value={value}>{t(`priority.${value}`)}</NativeSelectOption>)}
                  </NativeSelect></label>
                  <label className="task-property-control"><TaskAvatar member={selectedAssignee} /><span className="sr-only">{t('detail.assignee')}</span><NativeSelect disabled={!detail.capabilities.canEdit} onChange={(event) => setDraft({ ...draft, assigneeId: event.target.value })} value={draft.assigneeId}>
                    <NativeSelectOption value="">{t('create.unassigned')}</NativeSelectOption>
                    {assignees?.map((item) => <NativeSelectOption dir="auto" key={item.member._id} value={item.member._id}>{item.user.displayName}{item.company ? ` · ${item.company.displayName}` : ''}</NativeSelectOption>)}
                  </NativeSelect></label>
                  <label className="task-property-control"><span className="sr-only">{t('detail.dueDate')}</span><Input disabled={!detail.capabilities.canEdit} onChange={(event) => setDraft({ ...draft, dueDate: event.target.value })} type="date" value={draft.dueDate} /></label>
                </div>
                {detail.capabilities.canEdit ? <Button className="task-save-button" disabled={saving} size="sm" type="submit"><Check size={13} /> {saving ? t('detail.saving') : t('detail.saveChanges')}</Button> : <p className="task-read-only">{t('detail.readOnly')}</p>}
              </form>

              {error ? <p className="task-form-error" role="alert">{error}</p> : null}
              <div className="task-detail-actions">
                <Button onClick={() => void setFollowing({ taskId: detail.task._id, enabled: !detail.following, ...identity })} variant="outline"><UserRound size={13} /> {detail.following ? t('detail.unfollow') : t('detail.follow')}</Button>
                {detail.capabilities.canArchive ? <Button onClick={() => void setArchived({ taskId: detail.task._id, archived: !detail.task.archivedAt, ...identity })} variant="outline"><Archive size={13} /> {detail.task.archivedAt ? t('detail.restore') : t('detail.archive')}</Button> : null}
              </div>

              <section className="task-detail-section"><h3>{t('detail.labels')}</h3><div className="task-detail-actions">
                {labels?.map((label) => <Button dir="auto" key={label._id} onClick={() => setLabelIds((current) => current.includes(label._id) ? current.filter((id) => id !== label._id) : [...current, label._id])} size="sm" variant={labelIds.includes(label._id) ? 'default' : 'outline'}>{label.name}</Button>)}
                {detail.capabilities.canEdit ? <Button onClick={() => void setTaskLabels({ taskId: detail.task._id, labelIds, expectedRevision: detail.task.revision, ...identity })} size="sm" variant="outline">{t('detail.applyLabels')}</Button> : null}
              </div></section>

              {detail.capabilities.canChangeScope && !detail.task.parentTaskId ? <section className="task-detail-section"><h3>{t('detail.changeScopeTitle')}</h3><p>{t('detail.changeScopeBody')}</p><NativeSelect aria-label={t('detail.destinationScopeAria')} onChange={(event) => { setScopeBoardId(event.target.value); setScopeConfirmed(false) }} value={scopeBoardId}><NativeSelectOption value="">{t('detail.chooseDestination')}</NativeSelectOption>{boardRows?.filter((item) => item.board.groupId !== detail.task.groupId).map((item) => <NativeSelectOption dir="auto" key={item.board._id} value={item.board._id}>{item.board.name} · {item.board.groupId ? t('detail.channelScope') : t('detail.projectScope')}</NativeSelectOption>)}</NativeSelect><label className="task-scope-confirm"><input checked={scopeConfirmed} onChange={(event) => setScopeConfirmed(event.target.checked)} type="checkbox" /> {t('detail.scopeConfirmation')}</label><Button disabled={!scopeBoardId || !scopeConfirmed} onClick={() => void changeScope({ taskId: detail.task._id, destinationBoardId: scopeBoardId as Id<'taskBoards'>, declassificationConfirmed: Boolean(detail.task.groupId), audienceReductionConfirmed: !detail.task.groupId, ...identity }).then(() => { setScopeBoardId(''); setScopeConfirmed(false); onAnnounce(t('detail.scopeChanged')) })} variant="outline">{t('detail.changeScope')}</Button></section> : null}

              <section className="task-detail-section"><h3><span>{t('detail.subtasks')}</span><small>{formatNumber(locale, subtasks.filter((item) => item.terminal).length)}/{formatNumber(locale, subtasks.length)}</small></h3>
                {subtasks.map((item) => <div className={`task-subtask${item.terminal ? ' terminal' : ''}`} key={item.task._id}><StateRing category={item.state?.category ?? 'backlog'} size="subtask" /><strong dir="auto">{item.task.title}</strong><span dir="auto">{item.state?.name}</span></div>)}
                {detail.capabilities.canEdit && !detail.task.parentTaskId ? <form className="task-inline-form" onSubmit={(event) => void addSubtask(event)}><Input aria-label={t('detail.subtaskTitleAria')} dir="auto" onChange={(event) => setSubtaskTitle(event.target.value)} placeholder={t('detail.addSubtaskPlaceholder')} value={subtaskTitle} /><Button disabled={!subtaskTitle.trim()} size="sm" type="submit"><Plus size={12} /> {t('detail.add')}</Button></form> : null}
              </section>

              <section className="task-detail-section"><h3><Link2 size={14} /> {t('detail.evidence')}</h3>
                {detail.references.length ? detail.references.map((reference) => <div className="task-origin-evidence" key={reference._id}><svg aria-hidden="true" className="task-origin-track" viewBox="0 0 18 72"><path d="M15 2C4 10 4 24 9 34s5 24-6 36" /></svg><blockquote dir="auto">{reference.quote ?? t('inbox.sourceUnavailable')}<span>{reference.channelThreadId ? t('detail.thread') : reference.type === 'message' ? t('visuals.originChannelMessage') : reference.type === 'attachment' ? t('visuals.originAttachment') : reference.type === 'assistant_answer' ? t('visuals.originAssistantAnswer') : t('visuals.originMemoryExcerpt')}</span></blockquote></div>) : <p className="task-empty-note">{t('detail.noEvidence')}</p>}
                {detail.restrictedEarlierContext ? <p className="task-restricted-context">{t('detail.restrictedContext')}</p> : null}
              </section>

              <section className="task-detail-section"><h3><MessageSquare size={14} /> {t('detail.commentsActivity')}</h3>
                <div className="task-activity-list">
                  {detail.comments.filter((item) => !item.archivedAt).map((item) => {
                    const author = assignees?.find((candidate) => candidate.member._id === item.authorProjectMemberId)
                    return <article className="task-comment" key={item._id}><TaskAvatar member={author?.member ?? null} /><div className="task-comment-copy"><div className="task-comment-meta"><strong dir="auto">{author?.user.displayName ?? t('visuals.projectMember')}</strong><time>{formatDate(locale, item.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}{item.updatedAt > item.createdAt ? ` · ${t('detail.edited')}` : ''}</time></div>{editingComment?.id === item._id ? <form className="task-inline-form" onSubmit={(event) => { event.preventDefault(); void editComment({ commentId: item._id, expectedRevision: editingComment.revision, body: editingComment.body, ...identity }).then(() => setEditingComment(undefined)) }}><Input dir="auto" onChange={(event) => setEditingComment({ ...editingComment, body: event.target.value })} value={editingComment.body} /><Button size="sm" type="submit">{t('detail.save')}</Button></form> : <MarkdownText text={item.body} />}<div className="task-detail-actions">{item.authorProjectMemberId === detail.currentProjectMemberId ? <Button onClick={() => setEditingComment({ id: item._id, body: item.body, revision: item.revision })} size="sm" variant="ghost">{t('detail.edit')}</Button> : null}{item.authorProjectMemberId === detail.currentProjectMemberId || detail.capabilities.canArchive ? <Button onClick={() => void archiveComment({ commentId: item._id, ...identity })} size="sm" variant="ghost">{t('detail.archiveComment')}</Button> : null}</div></div></article>
                  })}
                  {detail.activities.map((item) => <p className="task-activity" key={item._id}><StateRing category="completed" size="dense" /><span>{activityLabel(item.action, t)}</span><time>{formatDate(locale, item.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}</time></p>)}
                </div>
                {detail.capabilities.canComment ? <form className="task-comment-form" onSubmit={(event) => void addComment(event)}><Textarea aria-label={t('detail.commentAria')} dir="auto" onChange={(event) => setComment(event.target.value)} placeholder={t('detail.commentPlaceholder')} value={comment} /><div className="task-detail-actions">{assignees?.map((item) => <Button dir="auto" key={item.member._id} onClick={() => setMentionIds((current) => current.includes(item.member._id) ? current.filter((id) => id !== item.member._id) : [...current, item.member._id])} size="sm" type="button" variant={mentionIds.includes(item.member._id) ? 'default' : 'outline'}>@{item.user.displayName}{item.company ? ` · ${item.company.displayName}` : ''}</Button>)}</div><Button disabled={!comment.trim()} type="submit">{t('detail.comment')}</Button></form> : null}
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
