import type { CompanyTaskFilter } from './company-view-state'

type CompanyTaskFilterRow = {
  assignee?: unknown
  project: { name: string }
  state?: { category?: string; name: string } | null
  task: { dueDate?: string | null; title: string }
}

type CompanyTaskFilterContext = {
  dueSoonKey: string
  filter: CompanyTaskFilter
  normalizedSearch: string
  today: string
}

export function isOpenCompanyTask(item: CompanyTaskFilterRow) {
  return item.state?.category !== 'completed' && item.state?.category !== 'canceled'
}

export function matchesCompanyTaskFilters(item: CompanyTaskFilterRow, { dueSoonKey, filter, normalizedSearch, today }: CompanyTaskFilterContext) {
  const dueDate = item.task.dueDate
  if (filter === 'active' && !isOpenCompanyTask(item)) return false
  if (filter === 'completed' && isOpenCompanyTask(item)) return false
  if (filter === 'overdue' && (!isOpenCompanyTask(item) || !dueDate || dueDate >= today)) return false
  if (filter === 'due-soon' && (!isOpenCompanyTask(item) || !dueDate || dueDate < today || dueDate > dueSoonKey)) return false
  if (filter === 'blocked' && (!isOpenCompanyTask(item) || item.state?.name.trim().toLocaleLowerCase() !== 'blocked')) return false
  if (filter === 'unassigned' && (!isOpenCompanyTask(item) || item.assignee)) return false
  return !normalizedSearch || `${item.task.title} ${item.project.name} ${item.state?.name ?? ''}`.toLocaleLowerCase().includes(normalizedSearch)
}
