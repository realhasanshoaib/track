import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import type { Doc } from '../../../../../../convex/_generated/dataModel'
import { i18nReady } from '#/i18n'
import { DueChip, PriorityGlyph, StateRing, TaskAvatar } from './TaskVisuals'

afterEach(cleanup)
beforeAll(async () => { await i18nReady })

describe('TaskVisuals', () => {
  it('exposes workflow state as a visual primitive without duplicating visible text', () => {
    const { container } = render(<StateRing category="started" size="dense" />)

    expect(container.querySelector('.task-state-ring.started.dense')).toBeTruthy()
    expect(container.textContent).toBe('')
  })

  it('gives priority marks an accessible name and an optional visible label', () => {
    render(<PriorityGlyph priority="urgent" showLabel />)

    expect(screen.getByLabelText('Priority: Urgent')).toBeTruthy()
    expect(screen.getByText('Urgent')).toBeTruthy()
  })

  it('marks historic due dates as overdue', () => {
    render(<DueChip dueDate="2000-01-01" />)

    expect(screen.getByText('Jan 1 · overdue')).toBeTruthy()
  })

  it('does not call a terminal task overdue', () => {
    render(<DueChip dueDate="2000-01-01" terminal />)

    expect(screen.getByText('Jan 1')).toBeTruthy()
    expect(screen.queryByText(/overdue/)).toBeNull()
  })

  it('uses a represented member name for initials and the accessible label', () => {
    const member = { userDisplayNameSnapshot: 'Amara Okafor' } as Doc<'projectMembers'>
    render(<TaskAvatar member={member} />)

    expect(screen.getByLabelText('Amara Okafor').textContent).toBe('AO')
  })
})
