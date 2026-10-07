export const TRACK_UI_VERSION = '2.0' as const

export const TRACK_UI_BREAKPOINTS = {
  mobile: 700,
  navigation: 820,
  contextRail: 1080,
  wide: 1280,
} as const

export const TRACK_UI_LAYOUT = {
  navigationWidth: 248,
  navigationCollapsedWidth: 48,
  contextRailWidth: 288,
  contentMaxWidth: 1280,
} as const

export const TRACK_UI_CONTROL_SIZES = {
  compact: 32,
  regular: 36,
  default: 40,
  coarsePointer: 44,
} as const

export const TRACK_UI_RADII = {
  control: 6,
  card: 8,
  panel: 12,
} as const

export const TRACK_UI_MOTION_MS = {
  feedback: 160,
  layout: 260,
} as const

export const TRACK_UI_MESSAGE_ACTION_ORDER = [
  'reply',
  'create-task',
  'forward',
  'more',
] as const

export const TRACK_UI_SPACING = [4, 8, 12, 16, 20, 24, 32, 40, 48, 64] as const

export function isTrackSpacing(value: number) {
  return TRACK_UI_SPACING.includes(value as (typeof TRACK_UI_SPACING)[number])
}
