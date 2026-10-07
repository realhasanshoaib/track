import { Link } from '@tanstack/react-router'
import { ArrowUpRight, Building2, Clock3, FolderKanban, Users } from 'lucide-react'

import type { Doc, Id } from '../../../../../../convex/_generated/dataModel'
import './workspace-home.css'

type WorkspaceProject = {
  project: Doc<'projects'>
  membership: Doc<'projectMembers'>
  company: { _id: Id<'companies'>; displayName: string } | null
  projectType: 'legacy' | 'company' | 'shared'
  role: Doc<'projectMembers'>['role']
  projectStatus: 'proposed' | 'active' | 'archive_pending' | 'archived'
  memberCount: number
  memberCountTruncated: boolean
  channelCount: number
  channelCountTruncated: boolean
  lastActivityAt: number
}

const projectGroups = [
  { key: 'company', title: 'Company projects', description: 'Work owned by one company.' },
  { key: 'shared', title: 'Shared projects', description: 'Work coordinated across participating companies.' },
  { key: 'legacy', title: 'Legacy projects', description: 'Projects using the original Track access model.' },
] as const

function projectRoleLabel(role: WorkspaceProject['role']) {
  switch (role) {
    case 'manager': return 'Project manager'
    case 'member': return 'Project member'
    case 'owner': return 'Project owner'
    case 'admin': return 'Project admin'
    case 'staff': return 'Project staff'
    case 'client': return 'Project client'
  }
}

export function WorkspaceHomePage({ projects }: { projects: Array<WorkspaceProject> }) {
  return (
    <div className="track-workspace-home">
      <header className="track-workspace-home-intro">
        <div>
          <h2>Projects</h2>
          <p>Continue in a project, channel, or task without losing the conversation around it.</p>
        </div>
        <Link className="track-workspace-directory-link" search={{ view: 'overview', taskFilter: undefined }} to="/workspace/company">
          <Building2 aria-hidden="true" size={15} /> Companies
        </Link>
      </header>

      {projects.length === 0 ? (
        <section className="track-guided-empty">
          <FolderKanban aria-hidden="true" size={24} />
          <h3>No projects yet</h3>
          <p>Create a project or accept an invitation to start working with your team.</p>
        </section>
      ) : (
        <div className="track-workspace-project-groups">
          {projectGroups.map((group) => {
            const groupedProjects = projects.filter((project) => project.projectType === group.key)
            if (groupedProjects.length === 0) return null
            return (
              <section className="track-workspace-project-section" key={group.key}>
                <div className="track-section-heading">
                  <div><h3>{group.title}</h3><p>{group.description}</p></div>
                  <span>{groupedProjects.length}</span>
                </div>
                <ul className="track-workspace-project-list">
                  {groupedProjects.map((item) => {
                    const metrics = `${item.memberCount}${item.memberCountTruncated ? '+' : ''} members / ${item.channelCount}${item.channelCountTruncated ? '+' : ''} channels`
                    const content = <>
                      <div className="track-workspace-project-copy">
                        <span className="track-workspace-project-type">{item.company?.displayName ?? 'Legacy workspace'}</span>
                        <strong>{item.project.name}</strong>
                        <p>{item.project.description?.trim() || 'No project description has been added.'}</p>
                      </div>
                      <div className="track-workspace-project-meta">
                        <span>{projectRoleLabel(item.role)}</span>
                        <span><Users aria-hidden="true" size={14} />{metrics}</span>
                        <span><Clock3 aria-hidden="true" size={14} />Updated {new Date(item.lastActivityAt).toLocaleDateString()}</span>
                        <span className="track-status-stamp"><i aria-hidden="true" />{item.projectStatus.replaceAll('_', ' ')}</span>
                        <span className="track-workspace-project-open">Open channels <ArrowUpRight aria-hidden="true" size={14} /></span>
                      </div>
                    </>
                    return (
                      <li key={item.membership._id}>
                        {item.projectType === 'legacy' || !item.company ? (
                          <Link className="track-workspace-project-row" params={{ projectId: item.project._id }} to="/workspace/projects/$projectId">{content}</Link>
                        ) : (
                          <Link
                            className="track-workspace-project-row"
                            params={{ projectId: item.project._id }}
                            search={{ companyId: item.company._id, groupId: '', membershipId: item.membership._id, view: 'channels' }}
                            to="/workspace/company-projects/$projectId"
                          >{content}</Link>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
