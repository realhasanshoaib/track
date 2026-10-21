import { useMutation, useQuery } from 'convex/react';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';

export type ChatActivity = 'typing' | 'attaching' | 'recording' | null;

const HeartbeatIntervalMs = 2_500;
const ActivityTimeoutMs = 3_200;

/** Publishes short-lived, correctly scoped activity for a Channel or Thread. */
export function useChatTypingPresence({
  actingCompanyId,
  channelThreadId,
  enabled = true,
  groupId,
  projectId,
  projectMemberId,
  userId,
}: {
  actingCompanyId?: Id<'companies'>;
  channelThreadId?: Id<'channelThreads'>;
  enabled?: boolean;
  groupId?: Id<'groups'>;
  projectId?: Id<'projects'>;
  projectMemberId?: Id<'projectMembers'>;
  userId?: Id<'users'>;
}) {
  const scope = useMemo(() => enabled && groupId && projectId && userId ? {
    ...(actingCompanyId ? { actingCompanyId } : {}),
    ...(channelThreadId ? { channelThreadId } : {}),
    groupId,
    projectId,
    ...(projectMemberId ? { projectMemberId } : {}),
    userId,
  } : null, [actingCompanyId, channelThreadId, enabled, groupId, projectId, projectMemberId, userId]);
  const queryArgs = useMemo(() => scope ? {
    ...(scope.actingCompanyId ? { actingCompanyId: scope.actingCompanyId } : {}),
    ...(scope.channelThreadId ? { channelThreadId: scope.channelThreadId } : {}),
    groupId: scope.groupId,
    ...(scope.projectMemberId ? { projectMemberId: scope.projectMemberId } : {}),
    userId: scope.userId,
  } : 'skip' as const, [scope]);
  const people = useQuery(api.typingIndicators.list, queryArgs);
  const heartbeat = useMutation(api.typingIndicators.heartbeat);
  const clear = useMutation(api.typingIndicators.clear);
  const lastHeartbeatAt = useRef(0);
  const lastActivity = useRef<Exclude<ChatActivity, null> | null>(null);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPresence = useCallback((target = scope) => {
    if (clearTimer.current !== null) clearTimeout(clearTimer.current);
    clearTimer.current = null;
    if (!target || lastActivity.current === null) return;
    lastActivity.current = null;
    lastHeartbeatAt.current = 0;
    void clear({
      ...(target.actingCompanyId ? { actingCompanyId: target.actingCompanyId } : {}),
      ...(target.channelThreadId ? { channelThreadId: target.channelThreadId } : {}),
      groupId: target.groupId,
      ...(target.projectMemberId ? { projectMemberId: target.projectMemberId } : {}),
      userId: target.userId,
    }).catch(() => undefined);
  }, [clear, scope]);

  const reportActivity = useCallback((activity: ChatActivity) => {
    if (!scope) return;
    if (activity === null) {
      clearPresence(scope);
      return;
    }

    const now = Date.now();
    if (lastActivity.current !== activity || now - lastHeartbeatAt.current >= HeartbeatIntervalMs) {
      lastActivity.current = activity;
      lastHeartbeatAt.current = now;
      void heartbeat({ ...scope, activity }).catch(() => undefined);
    }
    if (clearTimer.current !== null) clearTimeout(clearTimer.current);
    clearTimer.current = setTimeout(() => clearPresence(scope), ActivityTimeoutMs);
  }, [clearPresence, heartbeat, scope]);

  useEffect(() => () => clearPresence(scope), [clearPresence, scope]);

  return {
    people: people ?? [],
    reportActivity,
  };
}
