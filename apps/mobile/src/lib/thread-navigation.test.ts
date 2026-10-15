import { describe, expect, it } from 'vitest';

import type { Id } from '../../../../convex/_generated/dataModel';
import { forwardedSourceHref, threadConversationHref } from './thread-navigation';

const projectId = 'project' as Id<'projects'>;
const groupId = 'group' as Id<'groups'>;
const messageId = 'message' as Id<'messages'>;
const threadId = 'thread' as Id<'channelThreads'>;

describe('forwardedSourceHref', () => {
  it('routes a forwarded thread message to its original thread and message', () => {
    expect(forwardedSourceHref(projectId, groupId, messageId, threadId))
      .toBe('/thread?projectId=project&groupId=group&threadId=thread&messageId=message');
  });

  it('routes a forwarded channel message to its original channel and message', () => {
    expect(forwardedSourceHref(projectId, groupId, messageId, undefined))
      .toBe('/conversation?projectId=project&groupId=group&messageId=message');
  });
});

describe('threadConversationHref', () => {
  it('routes a message thread to its Channel conversation', () => {
    expect(threadConversationHref(projectId, groupId, threadId))
      .toBe('/thread?projectId=project&groupId=group&threadId=thread');
  });
});
