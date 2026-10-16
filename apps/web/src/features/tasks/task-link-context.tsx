import { useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { createContext, useContext, useMemo, type ReactNode } from 'react'

import { api } from '../../../../../convex/_generated/api'
import type { Id } from '../../../../../convex/_generated/dataModel'
import type { TaskIdentity } from './task-types'

type MessageTaskBatch = FunctionReturnType<typeof api.tasks.listForMessages>
type TaskCard = MessageTaskBatch[number]['tasks'][number]

type TaskLinkBatchValue = {
  messageTasks: ReadonlyMap<string, Array<TaskCard>>
}

const TaskLinkBatchContext = createContext<TaskLinkBatchValue | null>(null)

export function indexTaskLinks<Row extends { tasks: Array<Task> }, Task>(
  rows: ReadonlyArray<Row>,
  keyFor: (row: Row) => string,
): ReadonlyMap<string, Array<Task>> {
  return new Map(rows.map((row) => [keyFor(row), row.tasks]))
}

export function TaskLinkBatchProvider({
  children,
  identity,
  messageIds,
}: {
  children: ReactNode
  identity?: TaskIdentity
  messageIds: Array<Id<'messages'>>
}) {
  const messageBatch = useQuery(
    api.tasks.listForMessages,
    messageIds.length ? { messageIds, ...identity } : 'skip',
  )
  const value = useMemo<TaskLinkBatchValue>(() => ({
    messageTasks: indexTaskLinks(messageBatch ?? [], (item) => String(item.messageId)),
  }), [messageBatch])
  return <TaskLinkBatchContext.Provider value={value}>{children}</TaskLinkBatchContext.Provider>
}

export function useTaskLinkBatch() {
  return useContext(TaskLinkBatchContext)
}
