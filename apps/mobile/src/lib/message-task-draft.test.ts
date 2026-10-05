import { describe, expect, it } from 'vitest';

import { assistantTaskDraft, messageTaskDraft } from './message-task-draft';

describe('task drafts from messages', () => {
  it('keeps the source message primary and uses a stable action key', () => {
    expect(messageTaskDraft('  Review the release notes  ', 'message-1' as never, 'message-1'))
      .toEqual({
        idempotencyKey: 'message-task:message-1',
        references: [{ type: 'message', messageId: 'message-1', isPrimary: true }],
        sourceText: '  Review the release notes  ',
        title: 'Review the release notes',
      });
  });

  it('keeps assistant answers linked as the primary source too', () => {
    expect(assistantTaskDraft('  Confirm the launch date  ', 'answer-1' as never, 'answer-1')).toEqual({
      idempotencyKey: 'message-task:answer-1',
      references: [{ type: 'assistant_answer', assistantStreamId: 'answer-1', isPrimary: true }],
      sourceText: '  Confirm the launch date  ',
      title: 'Confirm the launch date',
    });
  });

  it('limits task titles and gives empty messages a useful fallback', () => {
    expect(messageTaskDraft(' '.repeat(4), 'message-2' as never, 'message-2').title).toBe('Follow up');
    expect(messageTaskDraft('x'.repeat(220), 'message-3' as never, 'message-3').title).toHaveLength(180);
  });
});
