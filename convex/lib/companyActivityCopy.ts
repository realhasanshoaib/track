const auditActions = {
  'company_project.created': { action: 'Created project', verb: 'created the project' },
  'project.created': { action: 'Created project', verb: 'created the project' },
  'project.updated': { action: 'Updated project', verb: 'updated the project' },
  'project.delivery_health_changed': { action: 'Delivery health', verb: 'updated delivery health for' },
  'shared_project.proposed': { action: 'Proposed project', verb: 'proposed the shared project' },
  'project_ownership.assigned': { action: 'Assigned ownership', verb: 'assigned ownership of' },
  'project_ownership.requested': { action: 'Requested ownership', verb: 'requested ownership of' },
  'project_company.invited': { action: 'Invited company', verb: 'invited a company to' },
} as const

export const companyFeedAuditActions = Object.keys(auditActions)

export function describeCompanyAuditActivity(action: string, actorName: string, projectName: string) {
  const description = auditActions[action as keyof typeof auditActions]
  if (!description) return null
  return {
    action: description.action,
    preview: `${actorName} ${description.verb} ${projectName}.`,
  }
}
