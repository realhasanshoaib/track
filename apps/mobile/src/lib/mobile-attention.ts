import type { Id } from '../../../../convex/_generated/dataModel';
import { channelHref } from './company-navigation';
import { threadConversationHref } from './thread-navigation';

type AttentionContext = {
  companyId?: Id<'companies'>;
  companyName?: string;
  membershipId?: Id<'projectMembers'>;
  projectId?: Id<'projects'>;
  projectName: string;
};

export type MobileAttentionItem = AttentionContext & ({
  kind: 'task';
  id: Id<'taskNotifications'>;
  projectId: Id<'projects'>;
  membershipId: Id<'projectMembers'>;
  taskId?: Id<'tasks'>;
  taskKey: string;
  taskTitle: string;
  eventType: string;
  createdAt: number;
} | {
  kind: 'message';
  id: Id<'messages'>;
  projectId: Id<'projects'>;
  membershipId: Id<'projectMembers'>;
  groupId: Id<'groups'>;
  groupName: string;
  messageId: Id<'messages'>;
  threadId?: Id<'channelThreads'>;
  threadName?: string;
  senderName: string;
  preview: string;
  eventType: string;
  createdAt: number;
} | {
  kind: 'suggestion';
  id: Id<'taskSuggestions'>;
  projectId: Id<'projects'>;
  membershipId: Id<'projectMembers'>;
  title: string;
  preview: string;
  eventType: 'task_suggestion';
  createdAt: number;
} | {
  kind: 'invitation';
  id: Id<'companyInvitations'>;
  invitationId: Id<'companyInvitations'>;
  companyId: Id<'companies'>;
  companyName: string;
  title: string;
  preview: string;
  eventType: 'company_invitation';
  createdAt: number;
});

export type AttentionSectionKey = 'priority' | 'work' | 'following' | 'other';

export type HomeFeedUpdate = {
  action: string;
  actorName: string;
  companyId?: string;
  companyName?: string;
  createdAt: number;
  groupId?: string;
  groupName?: string;
  id: string;
  kind: 'message' | 'task';
  membershipId: string;
  messageId?: string;
  preview: string;
  projectId: string;
  projectName: string;
  taskKey?: string;
  threadId?: string;
  title: string;
};

export function attentionSection(item: MobileAttentionItem): AttentionSectionKey {
  if (
    item.eventType === 'company_invitation' || item.eventType === 'overdue' ||
    item.eventType === 'urgent_update' || item.eventType === 'mention' ||
    item.eventType === 'direct_reply'
  ) return 'priority';
  if (item.kind === 'task') return 'work';
  if (item.kind === 'message') return 'following';
  return 'other';
}

export function uniqueAttentionIdentities<T extends { id: string; kind: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.kind}:${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function uniqueAttentionItems(items: MobileAttentionItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.kind === 'task' && item.taskId
      ? `task:${item.taskId}`
      : `${item.kind}:${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((left, right) => attentionPriority(left) - attentionPriority(right) || right.createdAt - left.createdAt);
}

export function recentConversationNotifications(items: MobileAttentionItem[], limit = 12) {
  return uniqueAttentionIdentities(items)
    .filter((item): item is Extract<MobileAttentionItem, { kind: 'message' }> => item.kind === 'message')
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, Math.max(0, limit));
}

export type ConversationNotificationSheetState =
  | { kind: 'loading' }
  | { kind: 'empty' }
  | { kind: 'items'; items: Extract<MobileAttentionItem, { kind: 'message' }>[] };

export function conversationNotificationSheetState(
  loadingFirstPage: boolean,
  items: Extract<MobileAttentionItem, { kind: 'message' }>[],
): ConversationNotificationSheetState {
  if (loadingFirstPage) return { kind: 'loading' };
  return items.length ? { kind: 'items', items } : { kind: 'empty' };
}

export function conversationNotificationContext(item: Extract<MobileAttentionItem, { kind: 'message' }>) {
  return [
    item.projectName,
    `#${item.groupName}`,
    item.threadId ? `Thread: ${item.threadName ?? 'activity'}` : null,
  ].filter((part): part is string => Boolean(part)).join(' · ');
}

export function conversationNotificationHref(item: Extract<MobileAttentionItem, { kind: 'message' }>) {
  const context = item.companyId
    ? { companyId: item.companyId, membershipId: item.membershipId, archived: false }
    : null;
  return item.threadId
    ? threadConversationHref(item.projectId, item.groupId, item.threadId, context, item.messageId)
    : channelHref(item.projectId, item.groupId, context, item.messageId);
}

function attentionPriority(item: MobileAttentionItem) {
  if (item.kind === 'invitation') return 0;
  switch (item.eventType) {
    case 'overdue': return 1;
    case 'mention': return 2;
    case 'direct_reply': return 3;
    case 'due_soon': return 4;
    case 'assignment': return 5;
    case 'task_suggestion': return 6;
    default: return 7;
  }
}

/** Home is an action queue, so passive discussions and lost assignments stay in Inbox. */
export function actionableHomeAttention(items: MobileAttentionItem[], limit = 4) {
  return uniqueAttentionItems(items)
    .filter((item) => item.kind === 'invitation'
      || item.kind === 'suggestion'
      || item.eventType === 'assignment'
      || item.eventType === 'direct_reply'
      || item.eventType === 'due_soon'
      || item.eventType === 'mention'
      || item.eventType === 'overdue')
    .slice(0, Math.max(0, limit));
}

/**
 * Builds the Home update preview from the existing permission-filtered mobile
 * feed. This keeps client and server rollouts compatible while excluding raw
 * discussion noise, reminders, invitations, and suggestions.
 */
export function recentHomeUpdates(items: MobileAttentionItem[], limit = Number.POSITIVE_INFINITY): HomeFeedUpdate[] {
  return uniqueAttentionIdentities(items)
    .filter((item): item is Extract<MobileAttentionItem, { kind: 'message' | 'task' }> => {
      if (item.kind === 'message') return ['direct_reply', 'mention', 'thread_activity'].includes(item.eventType);
      return item.eventType !== 'due_soon' && item.eventType !== 'overdue';
    })
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, Math.max(0, limit))
    .map((item) => item.kind === 'message' ? {
      action: item.eventType,
      actorName: item.senderName,
      companyId: item.companyId,
      companyName: item.companyName,
      createdAt: item.createdAt,
      groupId: item.groupId,
      groupName: item.groupName,
      id: String(item.id),
      kind: 'message' as const,
      membershipId: String(item.membershipId),
      messageId: String(item.messageId),
      preview: `${item.senderName} ${item.eventType === 'direct_reply' ? 'replied' : item.eventType === 'mention' ? 'mentioned you' : 'added an update'} in #${item.groupName}`,
      projectId: String(item.projectId),
      projectName: item.projectName,
      threadId: item.threadId ? String(item.threadId) : undefined,
      title: item.eventType === 'direct_reply'
        ? `New reply in ${item.threadName ?? item.groupName}`
        : item.eventType === 'mention'
          ? `New mention in #${item.groupName}`
          : `New update in ${item.threadName ?? item.groupName}`,
    } : {
      action: item.eventType,
      actorName: 'Track',
      companyId: item.companyId,
      companyName: item.companyName,
      createdAt: item.createdAt,
      id: String(item.id),
      kind: 'task' as const,
      membershipId: String(item.membershipId),
      preview: `${item.taskTitle} · ${item.projectName}`,
      projectId: String(item.projectId),
      projectName: item.projectName,
      taskKey: item.taskKey,
      title: item.eventType === 'assignment'
        ? 'Task assigned to you'
        : item.eventType === 'commented'
          ? 'New task comment'
          : 'Task updated',
    });
}

export function attentionTitle(item: MobileAttentionItem) {
  if (item.kind === 'task') return item.taskTitle;
  if (item.kind !== 'message') return item.title;
  return item.eventType === 'mention'
    ? `${item.senderName} mentioned you`
    : item.eventType === 'direct_reply'
      ? `${item.senderName} replied to you`
      : item.eventType === 'thread_activity'
        ? `${item.senderName} added to ${item.threadName ?? 'a thread'}`
        : `${item.senderName} posted in #${item.groupName}`;
}

export function attentionAction(item: MobileAttentionItem) {
  if (item.kind === 'message') {
    if (item.eventType === 'mention') return 'Review mention';
    if (item.eventType === 'direct_reply') return 'Open reply';
    return 'Open discussion';
  }
  if (item.kind === 'suggestion') return 'Review task suggestion';
  if (item.kind === 'invitation') return 'Review Company invitation';
  switch (item.eventType) {
    case 'assignment': return 'Assigned to you';
    case 'assignment_lost': return 'Assignment changed';
    case 'mention': return 'Mentioned on this task';
    case 'due_soon': return 'Due soon';
    case 'overdue': return 'Overdue';
    default: return 'Task updated';
  }
}

export function attentionContext(item: MobileAttentionItem) {
  const parts = [
    item.companyName,
    item.projectName,
    item.kind === 'message' ? `#${item.groupName}` : undefined,
    item.kind === 'task' ? item.taskKey : undefined,
  ].filter((part): part is string => Boolean(part));
  return parts.filter((part, index) => parts.indexOf(part) === index).join(' · ');
}

export function relativeAttentionTime(createdAt: number, now = Date.now()) {
  const minutes = Math.max(1, Math.floor((now - createdAt) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
