import { useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import type { MobileTaskIdentity } from './task-navigation';

type MessageTaskBatch = FunctionReturnType<typeof api.tasks.listForMessages>;
type TaskCard = MessageTaskBatch[number]['tasks'][number];

type TaskLinkBatchValue = {
  messageTasks: ReadonlyMap<string, Array<TaskCard>>;
};

const TaskLinkBatchContext = createContext<TaskLinkBatchValue | null>(null);

export function TaskLinkBatchProvider({
  children,
  enabled = true,
  identity,
  messageIds,
}: {
  children: ReactNode;
  enabled?: boolean;
  identity: MobileTaskIdentity | null;
  messageIds: Array<Id<'messages'>>;
}) {
  const queryIdentity = identity ? {
    actingCompanyId: identity.companyId,
    projectMemberId: identity.membershipId,
  } : {};
  const messageBatch = useQuery(
    api.tasks.listForMessages,
    enabled && messageIds.length ? { messageIds, ...queryIdentity } : 'skip',
  );
  const value = useMemo<TaskLinkBatchValue>(() => ({
    messageTasks: new Map((messageBatch ?? []).map((item) => [String(item.messageId), item.tasks])),
  }), [messageBatch]);
  return <TaskLinkBatchContext.Provider value={value}>{children}</TaskLinkBatchContext.Provider>;
}

export function useTaskLinkBatch() {
  return useContext(TaskLinkBatchContext);
}
