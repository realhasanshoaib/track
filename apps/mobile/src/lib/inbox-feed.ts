type InboxOrderItem = { createdAt: number; eventType: string; kind: string };

export type InboxFilter = 'all' | 'mentions' | 'replies' | 'tasks' | 'suggestions' | 'invitations';
type InboxSearchItem = InboxOrderItem & {
  id: string;
  companyName?: string;
  projectName: string;
  taskTitle?: string;
  senderName?: string;
  preview?: string;
  groupName?: string;
  threadName?: string;
  title?: string;
};

/** Search only describes loaded, authorized rows; pagination owns completeness. */
export function filterInboxItems<T extends InboxSearchItem>(
  items: readonly T[], filter: InboxFilter, search: string,
  taskEventText: (event: string) => string, isPinned?: (item: T) => boolean,
) {
  const seen = new Set<string>();
  const query = search.trim().toLocaleLowerCase();
  const filtered = items.filter((item) => {
    const key = `${item.kind}:${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    const matchesKind = filter === 'all'
      || (filter === 'tasks' && item.kind === 'task')
      || (filter === 'mentions' && item.kind === 'message' && item.eventType === 'mention')
      || (filter === 'replies' && item.kind === 'message' && item.eventType === 'direct_reply')
      || (filter === 'suggestions' && item.kind === 'suggestion')
      || (filter === 'invitations' && item.kind === 'invitation');
    if (!matchesKind) return false;
    if (!query) return true;
    const fields = item.kind === 'task'
      ? [item.taskTitle, item.projectName, item.companyName, taskEventText(item.eventType)]
      : item.kind === 'message'
        ? [item.senderName, item.preview, item.projectName, item.groupName, item.threadName, item.companyName]
        : [item.title, item.preview, item.projectName, item.companyName];
    return fields.filter(Boolean).join(' ').toLocaleLowerCase().includes(query);
  });
  return sortInboxItems(filtered, isPinned);
}

export function inboxPageFeedback(status: string, search: string, empty: { title: string; body: string }) {
  const hasMore = status === 'CanLoadMore' || status === 'LoadingMore';
  return {
    hasMore,
    loading: status === 'LoadingFirstPage',
    title: hasMore ? 'No matches in loaded updates' : search.trim() ? 'No matching updates' : empty.title,
    body: hasMore ? 'Load earlier updates to continue checking this view.'
      : search.trim() ? 'Try a different name, Project, Channel, or update.' : empty.body,
  };
}

function eventPriority(item: InboxOrderItem) {
  if (item.kind === 'message' && item.eventType === 'mention') return 0;
  if (item.kind === 'message' && item.eventType === 'direct_reply') return 1;
  if (item.kind === 'task') return 2;
  if (item.kind === 'message') return 3;
  return 4;
}

/** Keeps date sections chronological and uses event importance only to break ties. */
export function sortInboxItems<T extends InboxOrderItem>(items: readonly T[], isPinned?: (item: T) => boolean) {
  return [...items].sort((left, right) => {
    const pinnedOrder = Number(Boolean(isPinned?.(right))) - Number(Boolean(isPinned?.(left)));
    return pinnedOrder || right.createdAt - left.createdAt || eventPriority(left) - eventPriority(right);
  });
}
