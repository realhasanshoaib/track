import { describe, expect, it } from 'vitest'

import { getWorkspaceHeaderLabels } from './workspace-header-labels'

describe('getWorkspaceHeaderLabels', () => {
  it.each([
    ['project', 'Overview'],
    ['channels', 'Channels'],
    ['evidence', 'Evidence'],
    ['settings', 'Project settings'],
  ] as const)('names the %s location', (view, title) => {
    expect(getWorkspaceHeaderLabels({ companyName: 'Acme Health', projectName: 'Patient Portal', view }).title)
      .toBe(title)
  })

  it('keeps Company, Project, and Channel scope in the accessible label', () => {
    expect(getWorkspaceHeaderLabels({
      companyName: 'Acme Health',
      groupName: 'Launch',
      projectName: 'Patient Portal',
      view: 'group',
    })).toEqual({
      projectScopeLabel: 'Acme Health · Patient Portal',
      scopeLabel: 'Acme Health · Patient Portal, #Launch',
      title: '#Launch',
    })
  })

  it('does not invent a Company name for a Project without Company context', () => {
    expect(getWorkspaceHeaderLabels({ projectName: 'Patient Portal', view: 'project' })).toEqual({
      projectScopeLabel: 'Patient Portal',
      scopeLabel: 'Patient Portal',
      title: 'Overview',
    })
  })

  it('uses Workspace labels when no Project is selected', () => {
    expect(getWorkspaceHeaderLabels({ view: 'home' })).toEqual({
      projectScopeLabel: null,
      scopeLabel: 'Workspace',
      title: 'Projects',
    })
  })
})
