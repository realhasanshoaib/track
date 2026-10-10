import { describe, expect, it } from 'vitest'

import { entityMarkColorKeys, entityMarkIconKeys, entityMarkPalette, resolveDistinctBoardIconKeys, resolveDistinctChannelIconKeys, resolveEntityMark } from './entity-identity'

describe('resolveEntityMark', () => {
  it('uses light, readable surfaces for Company, Project, and Board marks', () => {
    for (const palette of Object.values(entityMarkPalette)) {
      const luminance = (hex: string) => {
        const channels = hex.match(/[0-9a-f]{2}/gi)?.map((channel) => Number.parseInt(channel, 16) / 255) ?? []
        const linear = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
        return linear.length === 3 ? linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722 : 0
      }
      const background = luminance(palette.background)
      const foreground = luminance(palette.foreground)
      expect(background).toBeGreaterThan(0.8)
      expect((background + 0.05) / (foreground + 0.05)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('is stable across calls and distinguishes the same id in different scopes', () => {
    const first = resolveEntityMark({ id: 'entity-1', kind: 'project', name: 'Project North' })
    expect(resolveEntityMark({ id: 'entity-1', kind: 'project', name: 'Renamed Project' }).colorKey).toBe(first.colorKey)
    expect(resolveEntityMark({ id: 'entity-1', kind: 'company', name: 'Company North' }).colorKey).not.toBe(first.colorKey)
  })

  it('uses semantic name cues for Project and Channel glyphs', () => {
    expect(resolveEntityMark({ id: 'p1', kind: 'project', name: 'Mobile Engineering' }).iconKey).toBe('code')
    expect(resolveEntityMark({ id: 'c1', kind: 'channel', name: 'Design discussion' }).iconKey).toBe('design')
    expect(resolveEntityMark({ id: 'c2', kind: 'channel', name: 'General' }).iconKey).toBe('conversation')
  })

  it('gives common work Channels distinct icons that match their purpose', () => {
    const channels = [
      ['general', 'General'],
      ['announcements', 'Announcements'],
      ['engineering', 'Engineering'],
      ['design', 'Design'],
      ['planning', 'Planning'],
      ['docs', 'Documentation'],
      ['security', 'Security'],
      ['analytics', 'Analytics'],
      ['team', 'Team'],
      ['tasks', 'Task workflow'],
    ] as const
    const icons = channels.map(([id, name]) => resolveEntityMark({ id, kind: 'channel', name }).iconKey)

    expect(new Set(icons).size).toBe(channels.length)
  })

  it('uses a stable varied icon for Channels without a recognized name cue', () => {
    const first = resolveEntityMark({ id: 'custom-channel-one', kind: 'channel', name: 'Orchid' })
    const repeated = resolveEntityMark({ id: 'custom-channel-one', kind: 'channel', name: 'Orchid renamed' })
    const second = resolveEntityMark({ id: 'custom-channel-two', kind: 'channel', name: 'Orchid' })

    expect(repeated.iconKey).toBe(first.iconKey)
    expect(second.iconKey).not.toBe(first.iconKey)
  })

  it('assigns distinct icons to all Channels in a visible group', () => {
    const channels = Array.from({ length: 20 }, (_, index) => ({
      id: `channel-${index}`,
      name: `General ${index}`,
    }))
    const icons = resolveDistinctChannelIconKeys(channels)

    expect(new Set(icons.values()).size).toBe(channels.length)
  })

  it('keeps existing Channel icons when a later-created Channel is added', () => {
    const channels = Array.from({ length: 20 }, (_, index) => ({
      createdAt: index,
      id: `channel-${index.toString().padStart(2, '0')}`,
      name: `General ${index}`,
    }))
    const existing = resolveDistinctChannelIconKeys(channels)
    const withNewChannel = resolveDistinctChannelIconKeys([
      ...channels,
      { createdAt: 20, id: 'aa-new-channel', name: 'Planning' },
    ])

    expect(new Set(withNewChannel.values()).size).toBe(channels.length + 1)
    for (const channel of channels) expect(withNewChannel.get(channel.id)).toBe(existing.get(channel.id))
  })

  it('keeps visible Channel icons when a newly loaded page has no creation timestamp', () => {
    const channels = Array.from({ length: 12 }, (_, index) => ({
      id: `channel-${index}`,
      name: `General ${index}`,
    }))
    const existing = resolveDistinctChannelIconKeys(channels)
    const withNextPage = resolveDistinctChannelIconKeys([
      ...channels,
      { id: 'aa-new-channel', name: 'Engineering' },
    ], existing)

    expect(new Set(withNextPage.values()).size).toBe(channels.length + 1)
    for (const channel of channels) expect(withNextPage.get(channel.id)).toBe(existing.get(channel.id))
  })

  it('uses work-relevant glyphs for common Channel purposes', () => {
    expect(resolveEntityMark({ id: 'bug-channel', kind: 'channel', name: 'Bug triage' }).iconKey).toBe('bug')
    expect(resolveEntityMark({ id: 'goal-channel', kind: 'channel', name: 'Quarterly OKRs' }).iconKey).toBe('target')
    expect(resolveEntityMark({ id: 'integration-channel', kind: 'channel', name: 'Webhooks and integrations' }).iconKey).toBe('integration')
    expect(resolveEntityMark({ id: 'video-channel', kind: 'channel', name: 'Video recordings' }).iconKey).toBe('video')
    expect(resolveEntityMark({ id: 'building-channel', kind: 'channel', name: 'Building' }).iconKey).not.toBe('design')
    expect(resolveEntityMark({ id: 'ui-channel', kind: 'channel', name: 'UI design' }).iconKey).toBe('design')
  })

  it('uses work-relevant glyphs for common Board purposes', () => {
    expect(resolveEntityMark({ id: 'board-code', kind: 'board', name: 'Engineering' }).iconKey).toBe('code')
    expect(resolveEntityMark({ id: 'board-design', kind: 'board', name: 'Design' }).iconKey).toBe('design')
    expect(resolveEntityMark({ id: 'board-sprint', kind: 'board', name: 'Sprint planning' }).iconKey).toBe('calendar')
    expect(resolveEntityMark({ id: 'board-ops', kind: 'board', name: 'Operations' }).iconKey).toBe('checklist')
    expect(resolveEntityMark({ id: 'building-board', kind: 'board', name: 'Building' }).iconKey).not.toBe('design')
  })

  it('assigns distinct stable Board icons to existing Boards and a newly added Board', () => {
    const boards = Array.from({ length: 20 }, (_, index) => ({
      createdAt: index,
      id: `board-${index.toString().padStart(2, '0')}`,
      name: `Sprint Board ${index}`,
    }))
    const existing = resolveDistinctBoardIconKeys(boards)
    const withNewBoard = resolveDistinctBoardIconKeys([...boards, { createdAt: 20, id: 'aa-new-board', name: 'New planning Board' }])

    expect(new Set(existing.values()).size).toBe(boards.length)
    expect(new Set(withNewBoard.values()).size).toBe(boards.length + 1)
    expect(withNewBoard.get('aa-new-board')).toBeDefined()
    for (const board of boards) expect(withNewBoard.get(board.id)).toBe(existing.get(board.id))
    expect(resolveDistinctBoardIconKeys([...boards].reverse())).toEqual(existing)
  })

  it('keeps visible Board icons when more Boards are loaded', () => {
    const boards = Array.from({ length: 12 }, (_, index) => ({
      createdAt: index,
      id: `board-${index}`,
      name: `Planning ${index}`,
    }))
    const existing = resolveDistinctBoardIconKeys(boards)
    const withNextPage = resolveDistinctBoardIconKeys([
      ...boards,
      { createdAt: 12, id: 'aa-new-board', name: 'Engineering' },
    ], existing)

    expect(new Set(withNextPage.values()).size).toBe(boards.length + 1)
    for (const board of boards) expect(withNextPage.get(board.id)).toBe(existing.get(board.id))
  })

  it('falls back safely for missing or invalid customization keys', () => {
    const result = resolveEntityMark({
      colorKey: 'danger',
      iconKey: 'trash',
      id: 'p1',
      kind: 'project',
      name: 'Project',
    })
    expect(entityMarkColorKeys).toContain(result.colorKey)
    expect(entityMarkIconKeys).toContain(result.iconKey)
  })

  it('uses valid configured icon and color tokens', () => {
    expect(resolveEntityMark({
      colorKey: 'teal',
      iconKey: 'launch',
      id: 'p1',
      kind: 'project',
      name: 'Project',
    })).toMatchObject({ colorKey: 'teal', iconKey: 'launch' })
  })
})
