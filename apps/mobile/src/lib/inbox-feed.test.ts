import { describe, expect, it } from 'vitest';

import { filterInboxItems, inboxPageFeedback, sortInboxItems } from './inbox-feed';

describe('sortInboxItems', () => {
  it('keeps the feed newest first so date headings remain grouped', () => {
    const sorted = sortInboxItems([
      { createdAt: 300, eventType: 'assignment', kind: 'task', id: 'new-task' },
      { createdAt: 100, eventType: 'mention', kind: 'message', id: 'old-mention' },
      { createdAt: 200, eventType: 'direct_reply', kind: 'message', id: 'reply' },
    ]);

    expect(sorted.map(({ id }) => id)).toEqual(['new-task', 'reply', 'old-mention']);
  });

  it('uses message urgency to break equal-time ties and pins a routed invitation', () => {
    const items = [
      { createdAt: 100, eventType: 'assignment', kind: 'task', id: 'task' },
      { createdAt: 100, eventType: 'mention', kind: 'message', id: 'mention' },
      { createdAt: 50, eventType: 'company_invitation', kind: 'invitation', id: 'invitation' },
    ];

    expect(sortInboxItems(items).map(({ id }) => id)).toEqual(['mention', 'task', 'invitation']);
    expect(sortInboxItems(items, ({ id }) => id === 'invitation').map(({ id }) => id)).toEqual(['invitation', 'mention', 'task']);
  });
});

describe('Inbox search and pagination feedback', () => {
  const task = { id: 'task', kind: 'task', createdAt: 3, eventType: 'assignment', projectName: 'Atlas', taskTitle: 'Verify release', companyName: 'Northstar' };
  const mention = { id: 'mention', kind: 'message', createdAt: 2, eventType: 'mention', projectName: 'Atlas', senderName: 'Aleksandra', preview: 'Release evidence', groupName: 'delivery', threadName: 'Accessibility' };
  const reply = { ...mention, id: 'reply', eventType: 'direct_reply', createdAt: 1 };
  const rows = [task, mention, reply, mention];
  const event = () => 'Assigned to you';
  it('deduplicates loaded rows and retains newest-first ordering', () => {
    expect(filterInboxItems(rows, 'all', '', event).map((item) => item.id)).toEqual(['task', 'mention', 'reply']);
  });
  it('keeps Mentions and Replies separate from other message events', () => {
    expect(filterInboxItems(rows, 'mentions', '', event).map((item) => item.id)).toEqual(['mention']);
    expect(filterInboxItems(rows, 'replies', '', event).map((item) => item.id)).toEqual(['reply']);
    expect(filterInboxItems(rows, 'tasks', '', event).map((item) => item.id)).toEqual(['task']);
  });
  it.each([' NORTHSTAR ', 'assigned to you'])('searches task Company and event copy: %s', (query) => {
    expect(filterInboxItems(rows, 'all', query, event).map((item) => item.id)).toEqual(['task']);
  });
  it('searches thread context and treats whitespace as an empty query', () => {
    expect(filterInboxItems(rows, 'all', 'accessibility', event).map((item) => item.id)).toEqual(['mention', 'reply']);
    expect(filterInboxItems(rows, 'all', '   ', event)).toHaveLength(3);
  });
  const empty = { title: 'No task updates', body: 'Task updates will appear here.' };
  it.each(['CanLoadMore', 'LoadingMore'])('does not imply complete search results at %s', (status) => {
    expect(inboxPageFeedback(status, 'missing', empty)).toMatchObject({ hasMore: true, title: 'No matches in loaded updates' });
  });
  it('distinguishes initial loading, exhausted search, and an exhausted empty filter', () => {
    expect(inboxPageFeedback('LoadingFirstPage', '', empty).loading).toBe(true);
    expect(inboxPageFeedback('Exhausted', 'missing', empty)).toMatchObject({ hasMore: false, title: 'No matching updates' });
    expect(inboxPageFeedback('Exhausted', '   ', empty)).toMatchObject(empty);
  });
});
