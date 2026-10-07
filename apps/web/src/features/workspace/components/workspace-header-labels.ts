export type WorkspaceHeaderView = 'home' | 'project' | 'channels' | 'group' | 'evidence' | 'settings'

type WorkspaceHeaderLabelsInput = {
  companyName?: string | null
  groupName?: string
  projectName?: string
  view: WorkspaceHeaderView
}

export function getWorkspaceHeaderLabels({
  companyName,
  groupName,
  projectName,
  view,
}: WorkspaceHeaderLabelsInput) {
  const projectScopeLabel = projectName
    ? companyName
      ? `${companyName} · ${projectName}`
      : projectName
    : null

  let title = 'Select a Project'
  switch (view) {
    case 'home':
      title = 'Projects'
      break
    case 'group':
      title = groupName ? `#${groupName}` : 'Channel'
      break
    case 'project':
      title = projectName ? 'Overview' : 'Select a Project'
      break
    case 'channels':
      title = projectName ? 'Channels' : 'Select a Project'
      break
    case 'evidence':
      title = projectName ? 'Evidence' : 'Select a Project'
      break
    case 'settings':
      title = projectName ? 'Project settings' : 'Select a Project'
      break
  }

  const scopeLabel = projectScopeLabel
    ? view === 'group' && groupName
      ? `${projectScopeLabel}, #${groupName}`
      : projectScopeLabel
    : 'Workspace'

  return { projectScopeLabel, scopeLabel, title }
}
