import { useMutation, useQuery } from 'convex/react'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'

import { api } from '../../../../../convex/_generated/api'
import type { Id } from '../../../../../convex/_generated/dataModel'
import { appToast } from '#/components/ui/app-toast'
import { Button } from '#/components/ui/button'
import { DatePicker } from '#/components/ui/date-picker'
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
  const createIntentRef = useRef(crypto.randomUUID())
  const pendingRef = useRef(false)
  const projectBoards = useMemo(
    () => boards.filter((item) => item.board.projectId === projectId),
    [boards, projectId],
  )
  const board = projectBoards.find((item) => item.board._id === boardId)
  const assignees = useQuery(
    api.tasks.listEligibleAssignees,
    open ? { projectId, groupId: board?.board.groupId, ...identity } : 'skip',
  )
  const labels = useQuery(api.taskLabels.list, open ? { projectId, ...identity } : 'skip')

  useEffect(() => {
    if (!open) return
    if (!projectBoards.length) {
      setBoardId('')
      setWorkflowStateId('')
      return
    }
    const initialBoard = projectBoards.find((item) => item.board._id === initialBoardId)
      ?? projectBoards.find((item) => item.board.isDefault)
      ?? projectBoards[0]
    setBoardId(initialBoard.board._id)
    const initialState = initialBoard.states.find((item) => item._id === initialWorkflowStateId)
      ?? initialBoard.states.find((item) => item.isDefault)
      ?? initialBoard.states[0]
    setWorkflowStateId(initialState?._id ?? '')
  }, [initialBoardId, initialWorkflowStateId, open, projectBoards])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (pendingRef.current) return
    if (!title.trim()) {
      setError('Enter a task title.')
      return
    }
    if (boardId && !board) {
      setError('The selected board is no longer available for this project.')
      return
    }
    pendingRef.current = true
    setSaving(true)
    setError('')
    try {
      const result = await createTask({
        projectId,
        boardId: boardId ? boardId as Id<'taskBoards'> : undefined,
        workflowStateId: workflowStateId ? workflowStateId as Id<'taskWorkflowStates'> : undefined,
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        dueDate: dueDate || undefined,
        assigneeProjectMemberId: assignee ? assignee as Id<'projectMembers'> : undefined,
        labelIds,
        idempotencyKey: createIntentRef.current,
        ...identity,
      })
      setTitle('')
      setDescription('')
      setDueDate('')
      setAssignee('')
      setLabelIds([])
      createIntentRef.current = crypto.randomUUID()
      onCreated(result.publicKey)
      appToast.success('Task created', `${result.publicKey} is ready.`)
    } catch (failure) {
      const message = taskError(failure)
      setError(message)
      appToast.error('Task not created', message)
    } finally {
      pendingRef.current = false
      setSaving(false)
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="task-create-dialog">
        <DialogHeader><DialogTitle>Create task</DialogTitle><DialogDescription>Turn work into a durable Project task. Channel scope follows the selected board.</DialogDescription></DialogHeader>
        <form className="task-form" onSubmit={(event) => void submit(event)}>
          <label>Title<Input autoComplete="off" maxLength={180} name="title" onChange={(event) => { setTitle(event.target.value); if (error && event.target.value.trim()) setError('') }} placeholder="For example, review the launch checklist…" required value={title} /></label>
          <label>Description<Textarea autoComplete="off" maxLength={20_000} name="description" onChange={(event) => setDescription(event.target.value)} placeholder="Add the outcome, context, or acceptance criteria…" value={description} /></label>
          <div className="task-form-grid">
            <label>Board<NativeSelect aria-label="Board" autoComplete="off" disabled={!projectBoards.length} name="boardId" onChange={(event) => {
              const nextBoard = projectBoards.find((item) => item.board._id === event.target.value)
              setBoardId(event.target.value)
              setWorkflowStateId(nextBoard?.states.find((item) => item.isDefault)?._id ?? nextBoard?.states[0]?._id ?? '')
            }} value={boardId}>
              {!projectBoards.length ? <NativeSelectOption value="">Project tasks (create automatically)</NativeSelectOption> : null}
              {projectBoards.map((item) => <NativeSelectOption key={item.board._id} value={item.board._id}>{item.board.name}</NativeSelectOption>)}
            </NativeSelect></label>
            <label>Status<NativeSelect aria-label="Task status" autoComplete="off" disabled={!board?.states.length} name="workflowStateId" onChange={(event) => setWorkflowStateId(event.target.value)} value={workflowStateId}>
              {board?.states.length ? board.states.map((item) => <NativeSelectOption key={item._id} value={item._id}>{item.name}</NativeSelectOption>) : <NativeSelectOption value="">No workflow status available</NativeSelectOption>}
            </NativeSelect></label>
            <label>Priority<NativeSelect aria-label="Priority" autoComplete="off" name="priority" onChange={(event) => setPriority(event.target.value as typeof priority)} value={priority}>
              {['none', 'urgent', 'high', 'medium', 'low'].map((value) => <NativeSelectOption key={value} value={value}>{value}</NativeSelectOption>)}
            </NativeSelect></label>
            <label>Assignee<NativeSelect aria-label="Assignee" autoComplete="off" name="assigneeProjectMemberId" onChange={(event) => setAssignee(event.target.value)} searchable={Boolean(assignees?.length && assignees.length >= 8)} value={assignee}>
              <NativeSelectOption value="">Unassigned</NativeSelectOption>
              {assignees?.map((item) => <NativeSelectOption key={item.member._id} value={item.member._id}>{item.user.displayName}{item.company ? ` · ${item.company.displayName}` : ''}</NativeSelectOption>)}
            </NativeSelect></label>
            <label>Due date<DatePicker aria-label="Due date" onChange={setDueDate} value={dueDate} /></label>
          </div>
          <fieldset aria-label="Task labels" className="task-label-picker">
            <legend>Labels</legend>
            <div className="task-label-picker-options">
              {labels?.map((label) => <Button aria-pressed={labelIds.includes(label._id)} key={label._id} onClick={() => setLabelIds((current) => current.includes(label._id) ? current.filter((id) => id !== label._id) : [...current, label._id])} size="sm" type="button" variant={labelIds.includes(label._id) ? 'default' : 'outline'}>{label.name}</Button>)}
              {labels?.length === 0 ? <span className="task-label-picker-empty">No labels yet. Add them from Task settings.</span> : null}
              {labels === undefined ? <span className="task-label-picker-empty">Loading labels…</span> : null}
            </div>
          </fieldset>
          {error ? <p className="task-form-error" role="alert">{error}</p> : null}
          <DialogFooter><Button disabled={saving} onClick={() => onOpenChange(false)} type="button" variant="outline">Cancel</Button><Button disabled={saving || !title.trim()} type="submit">{saving ? 'Creating…' : 'Create task'}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function taskError(error: unknown) {
  const message = error instanceof Error ? error.message : 'task_save_failed'
  if (message.includes('task_conflict')) return 'This task changed while you were editing. Review the current values and try again.'
  if (message.includes('task_access_changed')) return 'Task unavailable or access changed.'
  if (message.includes('task_destination_invalid')) return 'The selected board or status is no longer available.'
  return "Couldn't save. Your draft is still here; retry when ready."
}
