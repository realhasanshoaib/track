import { useMutation, useQuery } from 'convex/react'
import { useTranslation } from 'react-i18next'
import { useEffect, useState, type FormEvent } from 'react'

import { api } from '../../../../../convex/_generated/api'
import type { Id } from '../../../../../convex/_generated/dataModel'
import { Button } from '#/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import { NativeSelect, NativeSelectOption } from '#/components/ui/native-select'
import { Textarea } from '#/components/ui/textarea'
import type { TaskBoardView, TaskIdentity } from './task-types'

export function TaskCreateDialog({
  boards,
  identity,
  initialBoardId,
  initialWorkflowStateId,
  onCreated,
  onOpenChange,
  open,
  projectId,
}: {
  boards: Array<TaskBoardView>
  identity: TaskIdentity
  initialBoardId?: Id<'taskBoards'>
  initialWorkflowStateId?: Id<'taskWorkflowStates'>
  onCreated: (publicKey: string) => void
  onOpenChange: (open: boolean) => void
  open: boolean
  projectId: Id<'projects'>
}) {
  const { t } = useTranslation('tasks')
  const createTask = useMutation(api.tasks.create)
  const [boardId, setBoardId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [workflowStateId, setWorkflowStateId] = useState('')
  const [priority, setPriority] = useState<'none' | 'urgent' | 'high' | 'medium' | 'low'>('none')
  const [dueDate, setDueDate] = useState('')
  const [assignee, setAssignee] = useState('')
  const [labelIds, setLabelIds] = useState<Array<Id<'taskLabels'>>>([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const board = boards.find((item) => item.board._id === boardId)
  const assignees = useQuery(
    api.tasks.listEligibleAssignees,
    open ? { projectId, groupId: board?.board.groupId, ...identity } : 'skip',
  )
  const labels = useQuery(api.taskLabels.list, open ? { projectId, ...identity } : 'skip')

  useEffect(() => {
    if (!open || !boards.length) return
    const initialBoard = boards.find((item) => item.board._id === initialBoardId)
      ?? boards.find((item) => item.board.isDefault)
      ?? boards[0]
    setBoardId(initialBoard.board._id)
    const initialState = initialBoard.states.find((item) => item._id === initialWorkflowStateId)
      ?? initialBoard.states.find((item) => item.isDefault)
      ?? initialBoard.states[0]
    setWorkflowStateId(initialState?._id ?? '')
  }, [boards, initialBoardId, initialWorkflowStateId, open])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const result = await createTask({
        projectId,
        boardId: boardId ? boardId as Id<'taskBoards'> : undefined,
        workflowStateId: workflowStateId ? workflowStateId as Id<'taskWorkflowStates'> : undefined,
        title,
        description: description || undefined,
        priority,
        dueDate: dueDate || undefined,
        assigneeProjectMemberId: assignee ? assignee as Id<'projectMembers'> : undefined,
        labelIds,
        idempotencyKey: crypto.randomUUID(),
        ...identity,
      })
      setTitle('')
      setDescription('')
      setDueDate('')
      setAssignee('')
      setLabelIds([])
      onCreated(result.publicKey)
    } catch (failure) {
      setError(taskError(failure, (key) => t(key)))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="task-create-dialog">
        <DialogHeader><DialogTitle>{t('create.title')}</DialogTitle><DialogDescription>{t('create.description')}</DialogDescription></DialogHeader>
        <form className="task-form" onSubmit={(event) => void submit(event)}>
          <label>{t('create.titleLabel')}<Input autoFocus dir="auto" maxLength={180} onChange={(event) => setTitle(event.target.value)} required value={title} /></label>
          <label>{t('create.descriptionLabel')}<Textarea dir="auto" maxLength={20_000} onChange={(event) => setDescription(event.target.value)} value={description} /></label>
          <div className="task-form-grid">
            <label>{t('create.boardLabel')}<NativeSelect disabled={!boards.length} onChange={(event) => {
              const nextBoard = boards.find((item) => item.board._id === event.target.value)
              setBoardId(event.target.value)
              setWorkflowStateId(nextBoard?.states.find((item) => item.isDefault)?._id ?? nextBoard?.states[0]?._id ?? '')
            }} value={boardId}>
              {!boards.length ? <NativeSelectOption value="">{t('create.projectTasksAutomatic')}</NativeSelectOption> : null}
              {boards.map((item) => <NativeSelectOption dir="auto" key={item.board._id} value={item.board._id}>{item.board.name}</NativeSelectOption>)}
            </NativeSelect></label>
            <label>{t('create.statusLabel')}<NativeSelect disabled={!board?.states.length} onChange={(event) => setWorkflowStateId(event.target.value)} value={workflowStateId}>
              {board?.states.map((item) => <NativeSelectOption dir="auto" key={item._id} value={item._id}>{item.name}</NativeSelectOption>)}
            </NativeSelect></label>
            <label>{t('create.priorityLabel')}<NativeSelect onChange={(event) => setPriority(event.target.value as typeof priority)} value={priority}>
              {['none', 'urgent', 'high', 'medium', 'low'].map((value) => <NativeSelectOption key={value} value={value}>{t(`priority.${value}`)}</NativeSelectOption>)}
            </NativeSelect></label>
            <label>{t('create.assigneeLabel')}<NativeSelect onChange={(event) => setAssignee(event.target.value)} value={assignee}>
              <NativeSelectOption value="">{t('create.unassigned')}</NativeSelectOption>
              {assignees?.map((item) => <NativeSelectOption dir="auto" key={item.member._id} value={item.member._id}>{item.user.displayName}{item.company ? ` · ${item.company.displayName}` : ''}</NativeSelectOption>)}
            </NativeSelect></label>
            <label>{t('create.dueDateLabel')}<Input onChange={(event) => setDueDate(event.target.value)} type="date" value={dueDate} /></label>
          </div>
          <fieldset><legend>{t('create.labels')}</legend><div className="task-detail-actions">{labels?.map((label) => <Button dir="auto" key={label._id} onClick={() => setLabelIds((current) => current.includes(label._id) ? current.filter((id) => id !== label._id) : [...current, label._id])} size="sm" type="button" variant={labelIds.includes(label._id) ? 'default' : 'outline'}>{label.name}</Button>)}</div></fieldset>
          {error ? <p className="task-form-error" role="alert">{error}</p> : null}
          <DialogFooter><Button disabled={saving || !title.trim()} type="submit">{saving ? t('create.creating') : t('create.create')}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function taskError(error: unknown, translate?: (key: string) => string) {
  const message = error instanceof Error ? error.message : 'task_save_failed'
  const key = message.includes('task_conflict')
    ? 'errors.conflict'
    : message.includes('task_access_changed')
      ? 'errors.accessChanged'
      : message.includes('task_destination_invalid')
        ? 'errors.destinationInvalid'
        : 'errors.saveFailed'
  if (translate) return translate(key)
  if (key === 'errors.conflict') return 'This task changed while you were editing. Review the current values and try again.'
  if (key === 'errors.accessChanged') return 'Task unavailable or access changed.'
  if (key === 'errors.destinationInvalid') return 'The selected board or status is no longer available.'
  return "Couldn't save. Your draft is still here; retry when ready."
}
