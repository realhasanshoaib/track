import type { Id } from '../../../../convex/_generated/dataModel';

export type ReviewableMessageTaskDraft = {
  idempotencyKey: string;
  references: Array<
    | { type: 'message'; messageId: Id<'messages'>; isPrimary: true }
    | { type: 'assistant_answer'; assistantStreamId: Id<'assistantStreams'>; isPrimary: true }
  >;
  sourceText: string;
  title: string;
};

export function messageTaskDraft(body: string, messageId: Id<'messages'>, actionKey: string): ReviewableMessageTaskDraft {
  return {
    idempotencyKey: `message-task:${actionKey}`,
    references: [{ type: 'message' as const, messageId, isPrimary: true }],
    sourceText: body,
    title: body.trim().slice(0, 180) || 'Follow up',
  };
}

export function assistantTaskDraft(answer: string, assistantStreamId: Id<'assistantStreams'>, actionKey: string): ReviewableMessageTaskDraft {
  return {
    idempotencyKey: `message-task:${actionKey}`,
    references: [{ type: 'assistant_answer', assistantStreamId, isPrimary: true }],
    sourceText: answer,
    title: answer.trim().slice(0, 180) || 'Follow up',
  };
}
