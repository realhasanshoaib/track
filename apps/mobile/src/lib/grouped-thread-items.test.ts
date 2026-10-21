import { describe, expect, it } from 'vitest';

import { groupThreadTimeline, visibleTimelineItems } from './grouped-thread-items';

type Message = {
  message: { _id: string; createdAt: number; deletedAt?: number; idempotencyKey?: string };
  author: { _id: string } | null;
};

function at(day: number, hour: number, minute = 0, second = 0): number {
  return new Date(2026, 9, day, hour, minute, second).getTime();
}

function message(id: string, createdAt: number, authorId = 'member-1'): Message {
  return { message: { _id: id, createdAt }, author: authorId ? { _id: authorId } : null };
}

describe('groupThreadTimeline', () => {
  it('orders messages and assistant streams, removes duplicates, and omits pending messages', () => {
    const today = new Date(2026, 9, 14, 12);
    const timeline = groupThreadTimeline({
      assistantStreams: [
        { _id: 'assistant-1', createdAt: at(14, 9, 30) },
        { _id: 'assistant-1', createdAt: at(14, 9, 30) },
      ],
      deduplicateAssistantStreams: true,
      messages: [
        message('later', at(14, 10)),
        message('pending', at(14, 9, 45)),
        message('earlier', at(14, 9)),
        message('later', at(14, 10)),
      ],
      missingAuthorKey: 'anon',
      pendingMessageIds: new Set(['pending']),
      today,
    });

    expect(timeline.map(({ kind, key }) => `${kind}:${key}`)).toEqual([
      'date-sep:sep-' + at(14, 9),
      'message:earlier',
      'assistant:assistant-1',
      'message:later',
    ]);
    expect(timeline[0]).toMatchObject({ label: 'Today' });
  });

  it('keeps the optimistic copy as the only row while a send result races the live query', () => {
    const confirmed = message('confirmed', at(14, 10));
    confirmed.message.idempotencyKey = 'send-key';
    const timeline = groupThreadTimeline({
      messages: [
        confirmed,
        message('other', at(14, 10, 1)),
      ],
      missingAuthorKey: 'anon',
      pendingMessageIdempotencyKeys: new Set(['send-key']),
      today: new Date(2026, 9, 14, 12),
    });

    expect(timeline.filter((item) => item.kind === 'message').map(({ key }) => key)).toEqual(['other']);
  });

  it('starts groups after a date, author, long pause, assistant, or card row', () => {
    const timeline = groupThreadTimeline({
      assistantStreams: [{ _id: 'assistant', createdAt: at(14, 8, 12) }],
      cardRowIds: new Set(['second-author']),
      messages: [
        message('first', at(13, 8)),
        message('same-author', at(13, 8, 5)),
        message('long-pause', at(13, 8, 10, 1)),
        message('second-author', at(13, 8, 11), 'member-2'),
        message('after-card', at(13, 8, 12), 'member-2'),
        message('today', at(14, 8, 13), 'member-2'),
      ],
      missingAuthorKey: 'unknown',
      today: new Date(2026, 9, 14, 12),
    });
    const messages = timeline.filter((item) => item.kind === 'message');

    expect(messages.map(({ key, isFirstInGroup }) => [key, isFirstInGroup])).toEqual([
      ['first', true],
      ['same-author', false],
      ['long-pause', true],
      ['second-author', true],
      ['after-card', true],
      ['today', true],
    ]);
    expect(timeline.filter((item) => item.kind === 'date-sep').map(({ label }) => label)).toEqual(['Yesterday', 'Today']);
  });

  it('omits a date pill after its last visible message is hidden or deleted', () => {
    const deleted = message('deleted', at(14, 9));
    deleted.message.deletedAt = at(14, 10);
    const timeline = groupThreadTimeline({
      messages: [deleted, message('hidden', at(14, 8)), message('yesterday', at(13, 8))],
      missingAuthorKey: 'anon',
      today: new Date(2026, 9, 14, 12),
    });
    const visible = visibleTimelineItems(timeline, new Set(['hidden']));
    expect(visible.map((item) => item.kind === 'date-sep' ? item.label : item.key)).toEqual([
      'Yesterday', 'yesterday', 'deleted',
    ]);
  });

  it('keeps consecutive deleted bubbles evenly spaced across a hidden day boundary', () => {
    const earlier = message('earlier', at(13, 20, 41));
    earlier.message.deletedAt = at(14, 9);
    const later = message('later', at(14, 17, 6));
    later.message.deletedAt = at(14, 18);
    const timeline = groupThreadTimeline({
      messages: [later, earlier],
      missingAuthorKey: 'anon',
      today: new Date(2026, 9, 14, 19),
    });

    const visible = visibleTimelineItems(timeline);
    expect(visible.map((item) => [item.kind, item.kind === 'message' ? item.isFirstInGroup : null])).toEqual([
      ['message', true],
      ['message', false],
    ]);
  });

  it('preserves group spacing when deleted bubbles have different authors', () => {
    const first = message('first', at(14, 17, 6), 'member-1');
    first.message.deletedAt = at(14, 18);
    const second = message('second', at(14, 17, 7), 'member-2');
    second.message.deletedAt = at(14, 18);
    const timeline = groupThreadTimeline({
      messages: [second, first],
      missingAuthorKey: 'anon',
      today: new Date(2026, 9, 14, 19),
    });

    expect(visibleTimelineItems(timeline).filter((item) => item.kind === 'message').map((item) => item.isFirstInGroup)).toEqual([true, true]);
  });
});
