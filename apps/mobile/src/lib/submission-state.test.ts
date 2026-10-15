import { describe, expect, it, vi } from 'vitest';
import { createDraftSubmissionState, createSubmissionGate } from './submission-state';

describe('submission ownership', () => {
  it('rejects overlapping actions before a busy render occurs', () => {
    const gate = createSubmissionGate();
    const first = gate.begin();
    expect(first).not.toBeNull();
    expect(gate.begin()).toBeNull();
    expect(gate.finish(Symbol('unrelated'))).toBe(false);
    expect(gate.begin()).toBeNull();
    if (first) expect(gate.finish(first)).toBe(true);
    expect(gate.begin()).not.toBeNull();
  });
  it('does not let an earlier finally block release a newer operation', () => {
    const gate = createSubmissionGate();
    const first = gate.begin();
    if (!first) throw new Error('missing first token');
    gate.finish(first);
    const second = gate.begin();
    expect(gate.finish(first)).toBe(false);
    expect(gate.begin()).toBeNull();
    if (second) expect(gate.finish(second)).toBe(true);
  });
  it('accepts only one action during a burst of taps and becomes reusable after settlement', () => {
    const gate = createSubmissionGate();
    const accepted = Array.from({ length: 30 }, () => gate.begin()).filter((token) => token !== null);
    expect(accepted).toHaveLength(1);
    expect(gate.finish(accepted[0])).toBe(true);
    expect(gate.begin()).not.toBeNull();
  });
});

describe('draft submissions', () => {
  it('retires a successful key while preserving a newer draft, allowing a deliberate repeated message', () => {
    const state = createDraftSubmissionState();
    const sent = state.capture('Comment A', () => 'first');
    expect(state.settleSuccess(sent, 'Comment B')).toBe(false);
    const repeated = state.capture('Comment A', () => 'new-comment');
    expect(repeated.key).toBe('new-comment');
    expect(state.settleSuccess(repeated, 'Comment A')).toBe(true);
    expect(state.capture('Comment A', () => 'another-comment').key).toBe('another-comment');
  });
  it('retains a committed key for a dismissed unchanged draft without closing a reopened editor', () => {
    const state = createDraftSubmissionState();
    const sent = state.capture('Comment A', () => 'first');
    state.dismiss();
    expect(state.settleSuccess(sent, 'Comment A')).toBe(false);
    const retry = state.capture('Comment A', () => 'wrong');
    expect(retry.key).toBe('first');
    expect(state.settleSuccess(retry, 'Comment A')).toBe(true);
  });
  it('reuses the same key after an ambiguous failure', () => {
    const state = createDraftSubmissionState();
    const createKey = vi.fn(() => 'retry-key');
    const first = state.capture('project:title:description', createKey);
    expect(state.capture('project:title:description', createKey)).toBe(first);
    expect(createKey).toHaveBeenCalledOnce();
  });
  it('preserves text entered after submission', () => {
    const state = createDraftSubmissionState();
    const submitted = state.capture('First comment', () => 'first');
    expect(state.isCurrent(submitted, 'Next comment')).toBe(false);
    expect(state.isCurrent(submitted, 'First comment')).toBe(true);
  });
  it('rejects completion from a dismissed and reopened editor', () => {
    const state = createDraftSubmissionState();
    const submitted = state.capture('Same title', () => 'first');
    state.invalidate();
    const reopened = state.capture('Same title', () => 'second');
    expect(state.isCurrent(submitted, 'Same title')).toBe(false);
    expect(state.isCurrent(reopened, 'Same title')).toBe(true);
    expect(reopened.key).not.toBe(submitted.key);
  });
  it('creates a new key when the payload or destination changes', () => {
    const state = createDraftSubmissionState();
    let sequence = 0;
    const key = () => String(++sequence);
    const first = state.capture('company-a:title', key);
    const second = state.capture('company-b:title', key);
    expect(second.key).not.toBe(first.key);
    expect(state.isCurrent(first, 'company-a:title')).toBe(false);
  });
  it('detaches a dismissed editor while retaining retry identity for an in-flight commit', () => {
    const state = createDraftSubmissionState();
    const submitted = state.capture('Same comment', () => 'original-key');
    state.dismiss();
    expect(state.isCurrent(submitted, 'Same comment')).toBe(false);
    const reopened = state.capture('Same comment', () => 'duplicate-key');
    expect(reopened.key).toBe('original-key');
    expect(state.isCurrent(reopened, 'Same comment')).toBe(true);
    expect(state.isCurrent(submitted, 'Same comment')).toBe(false);
    state.invalidate();
    expect(state.capture('Same comment', () => 'new-intent').key).toBe('new-intent');
  });
  it('keeps a dismissed failed submission retryable without accepting its late UI completion', () => {
    const state = createDraftSubmissionState();
    const submitted = state.capture('task-a:body:mention-a', () => 'retry');
    state.dismiss();
    state.dismiss();
    const reopened = state.capture('task-a:body:mention-a', () => 'wrong');
    expect(reopened.key).toBe(submitted.key);
    expect(state.isCurrent(submitted, reopened.signature)).toBe(false);
    expect(state.isCurrent(reopened, reopened.signature)).toBe(true);
  });
  it.each(['task-b:body:mention-a', 'task-a:body:mention-b', 'task-a:edited:mention-a'])(
    'treats a changed task, mention selection, or body as a new submission: %s', (signature) => {
      const state = createDraftSubmissionState();
      const submitted = state.capture('task-a:body:mention-a', () => 'first');
      const next = state.capture(signature, () => 'next');
      expect(next.key).not.toBe(submitted.key);
      expect(state.isCurrent(submitted, signature)).toBe(false);
    },
  );
});
