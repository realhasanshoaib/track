import { useCallback, useSyncExternalStore, type SetStateAction } from 'react';

import {
  composerDraftKey,
  readComposerDraft,
  writeComposerDraft,
  type MobileComposerDraft,
  type MobileComposerDraftScope,
} from '@/lib/composer-drafts';

const emptyDraft: MobileComposerDraft = { composer: '', replyToMessageId: null };

type DraftListener = () => void;
type DraftStoreEntry = {
  draft: MobileComposerDraft;
  listeners: Set<DraftListener>;
};

const draftStore = new Map<string, DraftStoreEntry>();

function getDraftEntry(scopeKey: string, scope: MobileComposerDraftScope): DraftStoreEntry {
  const existing = draftStore.get(scopeKey);
  if (existing) return existing;
  const entry: DraftStoreEntry = {
    draft: readComposerDraft(scope) ?? emptyDraft,
    listeners: new Set(),
  };
  draftStore.set(scopeKey, entry);
  return entry;
}

export function useComposerDraft(scope: MobileComposerDraftScope | null, options: { subscribeToChanges?: boolean } = {}) {
  const subscribeToChanges = options.subscribeToChanges ?? true;
  const scopeKey = scope ? composerDraftKey(scope) : null;
  const subscribe = useCallback((listener: DraftListener) => {
    if (!subscribeToChanges || !scope || !scopeKey) return () => {};
    const entry = getDraftEntry(scopeKey, scope);
    entry.listeners.add(listener);
    return () => entry.listeners.delete(listener);
  }, [scope, scopeKey, subscribeToChanges]);
  const getSnapshot = useCallback(() => {
    if (!scope || !scopeKey) return emptyDraft;
    return getDraftEntry(scopeKey, scope).draft;
  }, [scope, scopeKey]);
  const draft = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const setDraft = useCallback((nextDraft: SetStateAction<MobileComposerDraft>) => {
    if (!scope || !scopeKey) return;
    const entry = getDraftEntry(scopeKey, scope);
    const next = typeof nextDraft === 'function' ? nextDraft(entry.draft) : nextDraft;
    if (next === entry.draft) return;
    entry.draft = next;
    writeComposerDraft(scope, next);
    for (const listener of entry.listeners) listener();
  }, [scope, scopeKey]);

  return { draft, readyScopeKey: scopeKey, scopeKey, setDraft };
}
