export type MobileComposerDraftScope = {
  actorId: string;
  actingCompanyId?: string;
  projectMemberId?: string;
  projectId: string;
  groupId: string;
};

export type MobileComposerDraft = {
  composer: string;
  replyToMessageId: string | null;
};

const drafts = new Map<string, MobileComposerDraft>();

export function composerDraftKey(scope: MobileComposerDraftScope) {
  return [
    scope.actorId,
    scope.actingCompanyId ?? 'legacy-company',
    scope.projectMemberId ?? 'legacy-membership',
    scope.projectId,
    scope.groupId,
    'channel',
  ].join(':');
}

export function readComposerDraft(scope: MobileComposerDraftScope) {
  return drafts.get(composerDraftKey(scope)) ?? null;
}

export function writeComposerDraft(scope: MobileComposerDraftScope, draft: MobileComposerDraft) {
  const key = composerDraftKey(scope);
  if (!draft.composer && draft.replyToMessageId === null) {
    drafts.delete(key);
    return;
  }
  drafts.set(key, draft);
}

export function clearComposerDrafts() {
  drafts.clear();
}
