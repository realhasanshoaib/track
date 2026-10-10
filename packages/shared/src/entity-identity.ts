export const entityMarkColorKeys = [
  'blue',
  'teal',
  'violet',
  'rose',
  'green',
  'amber',
  'slate',
  'clay',
] as const

export type EntityMarkColorKey = (typeof entityMarkColorKeys)[number]

export const entityMarkIconKeys = [
  'building',
  'project',
  'board',
  'channel',
  'conversation',
  'people',
  'code',
  'design',
  'launch',
  'analytics',
  'calendar',
  'book',
  'shield',
  'archive',
  'bookmark',
  'bug',
  'checklist',
  'files',
  'globe',
  'idea',
  'inbox',
  'integration',
  'milestone',
  'media',
  'mobile',
  'question',
  'support',
  'target',
  'timeline',
  'video',
] as const

export type EntityMarkIconKey = (typeof entityMarkIconKeys)[number]
export type EntityMarkKind = 'company' | 'project' | 'board' | 'channel'

export const entityMarkPalette: Record<EntityMarkColorKey, { background: string; foreground: string }> = {
  blue: { background: '#E9F0F4', foreground: '#355A6A' },
  teal: { background: '#E6F0EE', foreground: '#315F58' },
  violet: { background: '#EFEBF4', foreground: '#605276' },
  rose: { background: '#F4EAED', foreground: '#8A4F60' },
  green: { background: '#E8F0EB', foreground: '#42634E' },
  amber: { background: '#F6F0E2', foreground: '#765A23' },
  slate: { background: '#ECEFF1', foreground: '#4F5C65' },
  clay: { background: '#F4EBE5', foreground: '#80583F' },
}

const defaultIcon: Record<EntityMarkKind, EntityMarkIconKey> = {
  company: 'building',
  project: 'project',
  board: 'board',
  channel: 'channel',
}

const projectTerms: ReadonlyArray<[EntityMarkIconKey, readonly string[]]> = [
  ['code', ['engineering', 'developer', 'software', 'code', 'api']],
  ['design', ['design', 'creative', 'brand', 'visual']],
  ['launch', ['launch', 'release', 'rollout', 'ship']],
  ['analytics', ['analytics', 'data', 'report', 'research']],
  ['calendar', ['planning', 'roadmap', 'schedule', 'event']],
  ['book', ['docs', 'documentation', 'knowledge', 'content']],
  ['shield', ['security', 'privacy', 'compliance', 'risk']],
  ['people', ['people', 'team', 'hiring', 'customer', 'support']],
]

const channelTerms: ReadonlyArray<[EntityMarkIconKey, readonly string[]]> = [
  ['code', ['engineering', 'developer', 'software', 'code', 'api', 'backend', 'frontend']],
  ['design', ['design', 'creative', 'brand', 'visual', 'ui', 'ux']],
  ['launch', ['release', 'launch', 'rollout', 'ship', 'announcement', 'news', 'updates']],
  ['analytics', ['data', 'analytics', 'research', 'metrics', 'report', 'insight']],
  ['calendar', ['planning', 'roadmap', 'schedule', 'event', 'meeting', 'sprint']],
  ['book', ['docs', 'documentation', 'knowledge', 'handbook', 'content']],
  ['shield', ['security', 'privacy', 'legal', 'compliance', 'risk', 'incident']],
  ['bug', ['bug', 'defect', 'qa', 'quality', 'testing']],
  ['checklist', ['task', 'tasks', 'checklist', 'workflow', 'operations', 'process']],
  ['idea', ['idea', 'ideation', 'brainstorm']],
  ['inbox', ['inbox', 'triage']],
  ['integration', ['integration', 'integrations', 'webhook', 'connector']],
  ['target', ['goal', 'goals', 'objective', 'objectives', 'okr', 'okrs']],
  ['timeline', ['timeline', 'milestone', 'milestones']],
  ['video', ['video', 'recording']],
  ['mobile', ['mobile', 'ios', 'android']],
  ['media', ['media', 'photography', 'photos', 'assets']],
  ['globe', ['international', 'localization', 'translation']],
  ['files', ['file', 'files', 'archive']],
  ['bookmark', ['reference', 'resources']],
  ['question', ['faq', 'questions']],
  ['support', ['support', 'helpdesk', 'service desk']],
  ['people', ['internal', 'team', 'staff', 'members', 'customer', 'support', 'sales', 'hiring']],
  ['board', ['task', 'workflow', 'operations', 'process']],
  ['project', ['product', 'project', 'feature']],
  ['conversation', ['general', 'chat', 'discussion', 'feedback', 'questions', 'help', 'community', 'random']],
]

const boardTerms: ReadonlyArray<[EntityMarkIconKey, readonly string[]]> = [
  ['code', ['engineering', 'developer', 'software', 'code', 'api', 'backend', 'frontend']],
  ['design', ['design', 'creative', 'brand', 'visual', 'ui', 'ux']],
  ['launch', ['release', 'launch', 'rollout', 'ship']],
  ['analytics', ['data', 'analytics', 'research', 'metrics', 'report']],
  ['calendar', ['planning', 'roadmap', 'schedule', 'sprint']],
  ['book', ['docs', 'documentation', 'knowledge', 'content']],
  ['shield', ['security', 'privacy', 'legal', 'compliance', 'risk']],
  ['bug', ['bug', 'defect', 'qa', 'quality', 'testing']],
  ['checklist', ['task', 'tasks', 'checklist', 'workflow', 'operations', 'process']],
  ['idea', ['idea', 'ideation', 'brainstorm']],
  ['integration', ['integration', 'integrations', 'webhook', 'connector']],
  ['target', ['goal', 'goals', 'objective', 'objectives', 'okr', 'okrs']],
  ['timeline', ['timeline', 'milestone', 'milestones']],
  ['people', ['team', 'staff', 'customer', 'sales', 'hiring']],
]

const channelFallbackIcons: readonly EntityMarkIconKey[] = [
  'channel', 'conversation', 'people', 'code', 'design', 'launch',
  'analytics', 'calendar', 'book', 'shield', 'board', 'project',
  'archive', 'bookmark', 'bug', 'checklist', 'files', 'globe', 'idea', 'inbox',
  'integration', 'milestone', 'media', 'mobile', 'question', 'support', 'target', 'timeline', 'video',
]

const boardFallbackIcons: readonly EntityMarkIconKey[] = [
  'board', 'checklist', 'target', 'timeline', 'analytics', 'calendar', 'code', 'design',
  'launch', 'bug', 'idea', 'people', 'integration', 'shield', 'book', 'milestone',
  'archive', 'bookmark', 'files', 'globe', 'inbox', 'media', 'mobile', 'question', 'support',
  'channel', 'conversation', 'video', 'project',
]

function stableHash(value: string) {
  let hash = 2166136261
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function matchesNameCue(normalizedName: string, cue: string) {
  const normalizedCue = cue.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  return ` ${normalizedName} `.includes(` ${normalizedCue} `)
}

function iconFromName(kind: EntityMarkKind, id: string, name: string): EntityMarkIconKey {
  const normalizedName = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const terms = kind === 'channel' ? channelTerms : kind === 'board' ? boardTerms : projectTerms
  if (kind === 'company') return defaultIcon.company
  for (const [icon, keywords] of terms) {
    if (keywords.some((keyword) => matchesNameCue(normalizedName, keyword))) return icon
  }
  if (kind === 'channel') return channelFallbackIcons[stableHash(`channel:${id}`) % channelFallbackIcons.length]!
  if (kind === 'board') return boardFallbackIcons[stableHash(`board:${id}`) % boardFallbackIcons.length]!
  return defaultIcon[kind]
}

/** Assigns distinct entity marks within a visible group, while keeping the result stable. */
function resolveDistinctIconKeys(
  kind: 'board' | 'channel',
  entities: readonly { createdAt?: number; id: string; iconKey?: string | null; name: string }[],
  previousAssignments?: ReadonlyMap<string, EntityMarkIconKey>,
) {
  const used = new Set<EntityMarkIconKey>()
  const assignments = new Map<string, EntityMarkIconKey>()
  const fallbackIcons = kind === 'channel' ? channelFallbackIcons : boardFallbackIcons
  const ordered = [...entities].sort((left, right) => Number(previousAssignments?.has(right.id)) - Number(previousAssignments?.has(left.id))
    || (left.createdAt ?? 0) - (right.createdAt ?? 0)
    || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))

  for (const entity of ordered) {
    const preferred = entity.iconKey && isEntityMarkIconKey(entity.iconKey)
      ? entity.iconKey
      : previousAssignments?.get(entity.id) ?? iconFromName(kind, entity.id, entity.name)
    let iconKey = preferred
    if (used.has(iconKey)) {
      const start = stableHash(`${kind}:distinct:${entity.id}`) % fallbackIcons.length
      let alternative: EntityMarkIconKey | undefined
      for (let offset = 0; offset < fallbackIcons.length; offset += 1) {
        const candidate = fallbackIcons[(start + offset) % fallbackIcons.length]
        if (candidate && !used.has(candidate)) {
          alternative = candidate
          break
        }
      }
      if (alternative) iconKey = alternative
    }
    used.add(iconKey)
    assignments.set(entity.id, iconKey)
  }

  return assignments
}

/** Assigns distinct Channel marks within a visible group, while keeping the result stable. */
export function resolveDistinctChannelIconKeys(
  channels: readonly { createdAt?: number; id: string; iconKey?: string | null; name: string }[],
  previousAssignments?: ReadonlyMap<string, EntityMarkIconKey>,
) {
  return resolveDistinctIconKeys('channel', channels, previousAssignments)
}

/** Assigns distinct Board marks within a visible list, while keeping the result stable. */
export function resolveDistinctBoardIconKeys(
  boards: readonly { createdAt?: number; id: string; iconKey?: string | null; name: string }[],
  previousAssignments?: ReadonlyMap<string, EntityMarkIconKey>,
) {
  return resolveDistinctIconKeys('board', boards, previousAssignments)
}

export function isEntityMarkColorKey(value: string): value is EntityMarkColorKey {
  return (entityMarkColorKeys as readonly string[]).includes(value)
}

export function isEntityMarkIconKey(value: string): value is EntityMarkIconKey {
  return (entityMarkIconKeys as readonly string[]).includes(value)
}

/** Stable, cross-platform fallback identity. Never use this color for task state. */
export function resolveEntityMark(input: {
  colorKey?: string | null
  iconKey?: string | null
  id: string
  kind: EntityMarkKind
  name: string
}) {
  const index = stableHash(`${input.kind}:${input.id}`)
  const fallbackColor = entityMarkColorKeys[index % entityMarkColorKeys.length]!
  const colorKey = input.colorKey && isEntityMarkColorKey(input.colorKey) ? input.colorKey : fallbackColor
  const iconKey = input.iconKey && isEntityMarkIconKey(input.iconKey)
    ? input.iconKey
    : iconFromName(input.kind, input.id, input.name)

  return { colorKey, iconKey, palette: entityMarkPalette[colorKey] }
}
