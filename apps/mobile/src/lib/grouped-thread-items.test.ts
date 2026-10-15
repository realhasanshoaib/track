import { describe, expect, it } from 'vitest';

import { groupThreadTimeline } from './grouped-thread-items';

type Message = {
  message: { _id: string; createdAt: number };
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
});
