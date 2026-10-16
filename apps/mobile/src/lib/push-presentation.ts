export type PushContext = {
  projectId?: string;
  groupId?: string;
};

let activeContext: PushContext | null = null;

export function setActivePushContext(context: PushContext | null) {
  activeContext = context;
}

export function shouldPresentPush(data: Record<string, unknown> | null | undefined) {
  if (!activeContext) return true;
  const sameProject = !activeContext.projectId || data?.projectId === activeContext.projectId;
  if (!sameProject) return true;
  if (!activeContext.groupId || data?.groupId !== activeContext.groupId) return true;
  return false;
}
