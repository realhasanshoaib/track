import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  TRACK_UI_BREAKPOINTS,
  TRACK_UI_CONTROL_SIZES,
  TRACK_UI_LAYOUT,
  TRACK_UI_MESSAGE_ACTION_ORDER,
  TRACK_UI_MOTION_MS,
  TRACK_UI_RADII,
  TRACK_UI_SPACING,
  isTrackSpacing,
} from './foundations'

describe('Track UI foundation contract', () => {
  it('keeps spacing on the documented 4px rhythm', () => {
    expect(TRACK_UI_SPACING).toEqual([4, 8, 12, 16, 20, 24, 32, 40, 48, 64])
    expect(TRACK_UI_SPACING.every((value) => value % 4 === 0)).toBe(true)
    expect(isTrackSpacing(24)).toBe(true)
    expect(isTrackSpacing(22)).toBe(false)
  })

  it('keeps responsive layout thresholds in increasing order', () => {
    expect(TRACK_UI_BREAKPOINTS.mobile).toBeLessThan(TRACK_UI_BREAKPOINTS.navigation)
    expect(TRACK_UI_BREAKPOINTS.navigation).toBeLessThan(TRACK_UI_BREAKPOINTS.contextRail)
    expect(TRACK_UI_BREAKPOINTS.contextRail).toBeLessThan(TRACK_UI_BREAKPOINTS.wide)
  })

  it('keeps the workspace columns usable at the context-rail breakpoint', () => {
    expect(TRACK_UI_LAYOUT).toEqual({
      navigationWidth: 248,
      navigationCollapsedWidth: 48,
      contextRailWidth: 288,
      contentMaxWidth: 1280,
    })
    const requiredWidth = TRACK_UI_LAYOUT.navigationWidth + TRACK_UI_LAYOUT.contextRailWidth + 480
    expect(requiredWidth).toBeLessThanOrEqual(TRACK_UI_BREAKPOINTS.contextRail)
    expect(TRACK_UI_LAYOUT.navigationCollapsedWidth).toBeGreaterThanOrEqual(44)
  })

  it('keeps frequent message actions before forwarding and overflow', () => {
    expect(TRACK_UI_MESSAGE_ACTION_ORDER).toEqual([
      'reply',
      'create-task',
      'forward',
      'more',
    ])
  })

  it('keeps the authoritative CSS free of broad transition declarations', () => {
    const css = readFileSync(join(process.cwd(), 'src/design-system/professional-ui.css'), 'utf8')
    const styles = readFileSync(join(process.cwd(), 'src/styles.css'), 'utf8')
    expect(css).toContain('--surface-canvas:')
    expect(css).toContain('--space-6: 24px;')
    expect(css).toContain('--palette-status-success: #15803d;')
    expect(css).toContain('--palette-status-danger: #b91c1c;')
    expect(css).toContain('--palette-status-info: #1d4ed8;')
    expect(css).toContain('--control-xs: 32px;')
    expect(css).toContain('--control-sm: 36px;')
    expect(css).toContain('--control-md: 40px;')
    expect(css).toContain('--control-lg: 44px;')
    expect(css).toContain('--radius-control: 6px;')
    expect(css).toContain('--radius-card: 8px;')
    expect(css).toContain('--radius-panel: 12px;')
    expect(css).toContain('--motion-feedback: 160ms;')
    expect(css).toContain('--motion-layout: 260ms;')
    expect(css).toContain('--background: var(--surface-canvas);')
    expect(css).toContain('--primary: var(--action-primary);')
    expect(css).toContain('--ring: var(--focus-ring);')
    expect(css).toContain('--color-accent: var(--surface-hover);')
    expect(css).toContain('min-height: var(--control-lg);')
    expect(css).toContain('@media (pointer: coarse) {')
    expect(css).toContain(`.track-ui-v2 :where([data-slot="dialog-overlay"], [data-slot="sheet-overlay"]) {
  background: rgb(8 8 7 / 72%);
  backdrop-filter: none;
}`)
    expect(css).toContain(`.track-ui-v2 .track-drawer-overlay {
  background: rgb(8 8 7 / 64%);
  backdrop-filter: none;
}`)
    expect(styles).toContain('--font-display: "Geist"')
    expect(TRACK_UI_CONTROL_SIZES).toEqual({ compact: 32, regular: 36, default: 40, coarsePointer: 44 })
    expect(TRACK_UI_RADII).toEqual({ control: 6, card: 8, panel: 12 })
    expect(TRACK_UI_MOTION_MS).toEqual({ feedback: 160, layout: 260 })
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
    expect(css).toContain('animation-duration: 1ms !important;')
    expect(css).toContain('transition-duration: 1ms !important;')
    expect(css).not.toMatch(/transition\s*:\s*all\b/)
  })
})
