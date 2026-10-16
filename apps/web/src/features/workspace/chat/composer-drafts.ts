export type ComposerDraftScope = {
  actorId: string
  projectMemberId?: string
  projectId: string
  groupId: string
}
export type ComposerDraft = {
  composer: string
  replyToMessageId: string | null
}
const sessionStorageKey = 'track:composer-drafts:v1'
const memoryDrafts = new Map<string, ComposerDraft>()
export function getComposerDraftKey(scope: ComposerDraftScope) {
  return [
    scope.actorId,
    scope.projectMemberId ?? 'legacy-membership',
    scope.projectId,
    scope.groupId,
    'channel',
  ].join(':')
}
export function readComposerDraft(scope: ComposerDraftScope): ComposerDraft | null {
  const key = getComposerDraftKey(scope)
  const memoryDraft = memoryDrafts.get(key)
  if (memoryDraft) return memoryDraft
  if (typeof window === 'undefined') return null
  try {
    const stored = window.sessionStorage.getItem(sessionStorageKey)
    if (!stored) return null
    const parsed = parse(JSON.parse(stored))
    if (!parsed || !Object.prototype.hasOwnProperty.call(parsed, key)) return null
    const storedDraft = parsed[key]
    const normalized: ComposerDraft = {
      composer: storedDraft.composer,
      replyToMessageId: storedDraft.replyToMessageId ?? null,
    }
    memoryDrafts.set(key, normalized)
    return normalized
  } catch {
    return null
  }
}
export function writeComposerDraft(scope: ComposerDraftScope, draft: ComposerDraft) {
  const key = getComposerDraftKey(scope)
  if (!draft.composer && draft.replyToMessageId === null) {
    clearComposerDraft(scope)
    return
  }
  memoryDrafts.set(key, draft)
  if (typeof window === 'undefined') return
  try {
    const stored = window.sessionStorage.getItem(sessionStorageKey)
    const parsed = stored ? parse(JSON.parse(stored)) : null
    const next = parsed ?? {}
    next[key] = draft
    window.sessionStorage.setItem(sessionStorageKey, JSON.stringify(next))
  } catch {
    // Session storage is an optional enhancement; the in-memory session remains usable.
  }
}
export function clearComposerDraft(scope: ComposerDraftScope) {
  const key = getComposerDraftKey(scope)
  memoryDrafts.delete(key)
  if (typeof window === 'undefined') return
  try {
    const stored = window.sessionStorage.getItem(sessionStorageKey)
    const parsed = stored ? parse(JSON.parse(stored)) : null
    if (!parsed) return
    delete parsed[key]
    window.sessionStorage.setItem(sessionStorageKey, JSON.stringify(parsed))
  } catch {
    // Nothing else is required when optional session storage is unavailable.
  }
}
export function clearAllComposerDrafts() {
  memoryDrafts.clear()
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(sessionStorageKey)
  } catch {
    // Nothing else is required when optional session storage is unavailable.
  }
}
type StoredComposerDraft = {
  composer: string
  replyToMessageId?: string | null
}
type DraftMap = {
  [key: string]: StoredComposerDraft
}
function parse(value: unknown): DraftMap | null {
  return isDraftMap(value) ? value : null
}
function isDraftMap(value: unknown): value is DraftMap {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  return Object.values(value).every(isStoredComposerDraft)
}
function isStoredComposerDraft(value: unknown): value is StoredComposerDraft {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  if (!('composer' in value) || typeof value.composer !== 'string') return false
  return (
    !('replyToMessageId' in value) ||
    value.replyToMessageId === null ||
    typeof value.replyToMessageId === 'string'
  )
}
