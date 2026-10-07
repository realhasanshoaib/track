import { describe, expect, it } from 'vitest'

import { matchesCompanyTaskFilters } from './company-global-work-state'
import type { CompanyTaskFilter } from './company-view-state'

const filterContext = {
  today: '2026-10-06',
  dueSoonKey: '2026-10-13',
  normalizedSearch: '',
}

function task(category: string, dueDate: string | null, assignee: boolean, name: string, stateName = category) {
  return {
    task: { title: name, dueDate },
    project: { name: 'Patient Portal' },
    state: { name: stateName, category },
    assignee: assignee ? { id: 'person-1' } : null,
  }
}

describe('Company task filters', () => {
  it('keeps completed overdue tasks out of the overdue filter', () => {
    const overdueOpenTask = task('active', '2026-09-19', true, 'Review risks')
    const overdueCompletedTask = task('completed', '2026-09-19', true, 'Close risks')

    expect(matchesCompanyTaskFilters(overdueOpenTask, { ...filterContext, filter: 'overdue' })).toBe(true)
    expect(matchesCompanyTaskFilters(overdueCompletedTask, { ...filterContext, filter: 'overdue' })).toBe(false)
  })

  it('limits due soon, blocked, and unassigned views to open tasks', () => {
    const completedBlockedTask = task('completed', '2026-10-08', false, 'Closed blocker', 'Blocked')

    for (const filter of ['due-soon', 'blocked', 'unassigned'] satisfies CompanyTaskFilter[]) {
      expect(matchesCompanyTaskFilters(completedBlockedTask, { ...filterContext, filter })).toBe(false)
    }
  })

  it('applies the search term after the selected open-task filter', () => {
    const matchingTask = task('active', '2026-09-19', true, 'Review risks')
    const unrelatedTask = task('active', '2026-09-19', true, 'Write update')
    const context = { ...filterContext, filter: 'overdue' as const, normalizedSearch: 'review' }

    expect(matchesCompanyTaskFilters(matchingTask, context)).toBe(true)
    expect(matchesCompanyTaskFilters(unrelatedTask, context)).toBe(false)
  })
})
