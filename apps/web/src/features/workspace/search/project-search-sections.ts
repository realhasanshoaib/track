import type { FunctionReturnType } from 'convex/server'
import type { api } from '../../../../../../convex/_generated/api'
import type { ProjectSearchResult } from '#/features/workspace/search/ProjectSearchDialog'

export type ProjectSearchSection = {
  key: 'messages' | 'files' | 'threads' | 'groups'
  label: string
  results: ProjectSearchResult[]
}

type ProjectSearchResultsPayload = FunctionReturnType<typeof api.search.project> | null | undefined

export function buildProjectSearchSections(
  results: ProjectSearchResultsPayload,
): Array<ProjectSearchSection> {
  return [
    {
      key: 'messages',
      label: 'Messages',
      results: results?.messages ?? [],
    },
    {
      key: 'files',
      label: 'Files',
      results: results?.files ?? [],
    },
    {
      key: 'threads',
      label: 'Threads',
      results: results?.threads ?? [],
    },
    {
      key: 'groups',
      label: 'Groups',
      results: results?.groups ?? [],
    },
  ]
}

export function getProjectSearchTotal(sections: Array<ProjectSearchSection>) {
  return sections.reduce((total, section) => total + section.results.length, 0)
}
