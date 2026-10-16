/**
 * Mention autocomplete for the composer. The handles produced here are the same
 * normalised tokens `resolveMentionIds` matches on, so a suggestion the reader
 * taps always resolves back to a project member on send.
 */

export type MentionCandidate = {
  /** The token written after `@`, already normalised. */
  handle: string;
  id: string;
  kind: 'member';
  label: string;
  subtitle: string | null;
};

/** The `@token` the caret currently sits in, as an offset range into the body. */
export type MentionQuery = { end: number; query: string; start: number };

type MentionMember = {
  membership: { _id: string };
  user: { _id: string; displayName: string; email?: string | null } | null;
};

const DELETED_USER_EMAIL = /^deleted\+.*@track\.local$/;
const MENTION_CHAR = /[a-z0-9._-]/i;
const MENTION_STRIP = /[^a-z0-9._-]/g;
const LEADING_SPACE = /^\s/;
const WHITESPACE = /\s/;

export const MentionSuggestionLimit = 5;

/** Normalises a name or email into the token form mentions are matched by. */
export function mentionHandle(value: string): string {
  return value.trim().toLowerCase().replace(MENTION_STRIP, '');
}

/**
 * Returns the mention being typed at `caret`, or null when the caret is not in
 * one. A mention only starts at the beginning of the body or after whitespace,
 * so email addresses and `a@b` never open the list.
 */
export function findMentionQuery(text: string, caret: number): MentionQuery | null {
  const end = Math.max(0, Math.min(caret, text.length));
  let index = end;
  while (index > 0 && MENTION_CHAR.test(text[index - 1])) index -= 1;
  if (index === 0 || text[index - 1] !== '@') return null;
  const start = index - 1;
  if (start > 0 && !WHITESPACE.test(text[start - 1])) return null;
  return { end, query: text.slice(index, end).toLowerCase(), start };
}

/** Replaces the typed token with the chosen handle and reports the new caret. */
export function applyMention(
  text: string,
  range: MentionQuery,
  handle: string,
): { caret: number; text: string } {
  const rest = text.slice(range.end);
  const spaced = LEADING_SPACE.test(rest);
  const insert = spaced ? `@${handle}` : `@${handle} `;
  return {
    caret: range.start + insert.length + (spaced ? 1 : 0),
    text: `${text.slice(0, range.start)}${insert}${rest}`,
  };
}

/**
 * Matches that start a handle or any word of the name lead, so "sh" finds
 * "Hasan Shoaib"; looser substring matches follow, both in candidate order.
 */
export function filterMentionCandidates(
  candidates: MentionCandidate[],
  query: string,
  limit = MentionSuggestionLimit,
): MentionCandidate[] {
  if (!query) return candidates.slice(0, limit);
  const leading: MentionCandidate[] = [];
  const contains: MentionCandidate[] = [];
  for (const candidate of candidates) {
    const label = candidate.label.toLowerCase();
    const startsWord = label.split(WHITESPACE).some((word) => word.startsWith(query));
    if (candidate.handle.startsWith(query) || startsWord) leading.push(candidate);
    else if (candidate.handle.includes(query) || label.includes(query)) contains.push(candidate);
  }
  return [...leading, ...contains].slice(0, limit);
}

/**
 * Builds the suggestion list: members by name. A
 * display name shared by two members cannot be resolved on send, so those
 * members fall back to the local part of their email.
 */
export function buildMentionCandidates(members: MentionMember[]): MentionCandidate[] {
  const rows: Array<{
    alternate: string;
    id: string;
    label: string;
    primary: string;
    subtitle: string | null;
  }> = [];
  const seen = new Set<string>();
  for (const { membership, user } of members) {
    if (!user || seen.has(user._id)) continue;
    // Deleted accounts are tombstoned in place; mentioning one goes nowhere.
    if (user.email && DELETED_USER_EMAIL.test(user.email)) continue;
    seen.add(user._id);
    rows.push({
      alternate: mentionHandle(user.email?.split('@')[0] ?? ''),
      id: String(membership._id),
      label: user.displayName,
      primary: mentionHandle(user.displayName),
      subtitle: user.email ?? null,
    });
  }

  const uses = new Map<string, number>();
  for (const row of rows) uses.set(row.primary, (uses.get(row.primary) ?? 0) + 1);

  const candidates: MentionCandidate[] = [];
  for (const row of [...rows].sort((a, b) => a.label.localeCompare(b.label))) {
    const ambiguous = !row.primary || (uses.get(row.primary) ?? 0) > 1;
    const handle = ambiguous ? row.alternate || row.primary : row.primary;
    if (!handle) continue;
    candidates.push({ handle, id: row.id, kind: 'member', label: row.label, subtitle: row.subtitle });
  }
  return candidates;
}
