/** A synchronous guard: React's busy render can arrive after a second tap. */
export function createSubmissionGate() {
  let active: symbol | null = null;
  return {
    begin(): symbol | null {
      if (active) return null;
      active = Symbol('submission');
      return active;
    },
    finish(token: symbol): boolean {
      if (active !== token) return false;
      active = null;
      return true;
    },
  };
}

export type DraftSubmission = { generation: number; signature: string; key: string };

/** Preserve retry identity and keep old completions out of a reopened editor. */
export function createDraftSubmissionState() {
  let generation = 0;
  let previous: DraftSubmission | null = null;
  return {
    capture(signature: string, createKey: () => string): DraftSubmission {
      if (!previous || previous.signature !== signature) {
        previous = { generation: ++generation, signature, key: createKey() };
      }
      return previous;
    },
    isCurrent(token: DraftSubmission, signature: string): boolean {
      return token.generation === generation && token.signature === signature;
    },
    settleSuccess(token: DraftSubmission, signature: string): boolean {
      const ownsDraft = token.generation === generation && token.signature === signature;
      // A different draft is preserved, but the committed key is no longer a
      // retry for it. Dismissed, unchanged drafts keep their key for deduplication.
      if ((ownsDraft || token.signature !== signature) && previous?.key === token.key) {
        generation += 1;
        previous = null;
      }
      return ownsDraft;
    },
    dismiss() {
      generation += 1;
      // Dismissal detaches UI ownership, but the request can still commit.
      // Retain its key so reopening the same draft cannot duplicate that commit.
      if (previous) previous = { ...previous, generation };
    },
    invalidate() { generation += 1; previous = null; },
  };
}
