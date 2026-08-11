import { useMutation } from 'convex/react'
import { ArrowLeft, ArrowRight, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useMemo, useState } from 'react'

import { api } from '../../../../../convex/_generated/api'
import type { Id } from '../../../../../convex/_generated/dataModel'
import { Button } from '#/components/ui/button'
import { formatNumber, useLocale } from '#/i18n'
import { groupTaskViewsByState, type TaskBoardView, type TaskIdentity, type TaskView } from './task-types'
import { DueChip, OriginCaption, PriorityGlyph, StateRing, TaskAvatar } from './ui/TaskVisuals'

export function TaskBoard({
  board,
  identity,
  onAnnounce,
  onCreate,
  onOpen,
  tasks,
}: {
  board: TaskBoardView
  identity: TaskIdentity
  onAnnounce: (message: string) => void
  onCreate: (stateId: Id<'taskWorkflowStates'>) => void
  onOpen: (publicKey: string) => void
  tasks: Array<TaskView>
}) {
  const { locale } = useLocale()
  const { t } = useTranslation('tasks')
  const moveTask = useMutation(api.tasks.move)
  const [optimisticStates, setOptimisticStates] = useState<Record<string, string>>({})
  const [draggedTask, setDraggedTask] = useState<Id<'tasks'> | null>(null)
  const grouped = useMemo(
    () => groupTaskViewsByState(board.states, tasks, optimisticStates),
    [board.states, optimisticStates, tasks],
  )

  async function move(item: TaskView, stateId: Id<'taskWorkflowStates'>, targetIndex: number) {
    setOptimisticStates((current) => ({ ...current, [item.task._id]: stateId }))
    try {
      await moveTask({
        taskId: item.task._id,
        destinationBoardId: board.board._id,
        workflowStateId: stateId,
        targetIndex,
        expectedRevision: item.task.revision,
        ...identity,
      })
      onAnnounce(t('board.moved', { title: item.task.title }))
    } catch {
      onAnnounce(t('board.moveFailed'))
    } finally {
      setOptimisticStates((current) => {
        const next = { ...current }
        delete next[item.task._id]
        return next
      })
    }
  }

  return (
    <div aria-label={board.board.name} className="task-board" role="region">
      {board.states.map((state, stateIndex) => {
        const columnTasks = grouped.get(state._id) ?? []
        return (
          <section
            className="task-column"
            key={state._id}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => {
              const item = tasks.find((candidate) => candidate.task._id === draggedTask)
              if (item) void move(item, state._id, columnTasks.length)
              setDraggedTask(null)
            }}
          >
            <header>
              <StateRing category={state.category} />
              <h2 dir="auto">{state.name}</h2>
              <span>{formatNumber(locale, columnTasks.length)}</span>
              <button aria-label={t('board.addTask', { state: state.name })} className="task-column-add" onClick={() => onCreate(state._id)} type="button"><Plus size={13} /></button>
            </header>
            <div className="task-column-list">
              {columnTasks.map((item) => (
                <article
                  className="task-card"
                  draggable
                  key={item.task._id}
                  onDragEnd={() => setDraggedTask(null)}
                  onDragStart={() => setDraggedTask(item.task._id)}
                >
                  <button className="task-card-open" onClick={() => onOpen(item.task.publicKey)} type="button">
                    <span className="task-card-idline"><span>{item.task.publicKey}</span><StateRing category={state.category} size="dense" /></span>
                    <strong dir="auto">{item.task.title}</strong>
                    <span className="task-card-foot">
                      <TaskAvatar member={item.assignee} />
                      <OriginCaption boardName={board.board.name} item={item} />
                      <span className="task-card-spacer" />
                      <DueChip dueDate={item.task.dueDate} terminal={item.terminal} />
                      <PriorityGlyph priority={item.task.priority} />
                    </span>
                  </button>
                  <div aria-label={t('board.keyboardMoveControls')} className="task-card-moves">
                    <Button
                      aria-label={t('board.moveLeft', { title: item.task.title })}
                      disabled={stateIndex === 0}
                      onClick={() => void move(item, board.states[stateIndex - 1]._id, 0)}
                      size="icon-sm"
                      variant="ghost"
                    ><ArrowLeft size={12} /></Button>
                    <Button
                      aria-label={t('board.moveRight', { title: item.task.title })}
                      disabled={stateIndex === board.states.length - 1}
                      onClick={() => void move(item, board.states[stateIndex + 1]._id, 0)}
                      size="icon-sm"
                      variant="ghost"
                    ><ArrowRight size={12} /></Button>
                  </div>
                </article>
              ))}
              {!columnTasks.length ? <p className="task-column-empty">{t('board.empty')}</p> : null}
            </div>
          </section>
        )
      })}
    </div>
  )
}
