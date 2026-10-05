import { useMutation, useQuery } from 'convex/react'
import { useMemo, useState, type FormEvent } from 'react'

import { api } from '../../../../../convex/_generated/api'
import type { Id } from '../../../../../convex/_generated/dataModel'
import { Button } from '#/components/ui/button'
import { NativeSelect, NativeSelectOption } from '#/components/ui/native-select'

type RelationshipItem = {
  relationship: { _id: Id<'relationships'>; name: string }
  participants: Array<{ _id: Id<'companies'>; displayName: string }>
}

export function MigrationPanel({
  actingCompanyId,
  currentUserId,
  relationships,
  run,
}: {
  actingCompanyId: Id<'companies'>
  currentUserId: Id<'users'>
  relationships: Array<RelationshipItem>
  run: (action: () => Promise<unknown>) => Promise<void>
}) {
  const accessibleProjects = useQuery(api.projects.listAccessible, {})
  const pending = useQuery(api.companyMigration.listPendingForCompany, { actingCompanyId })
  const [projectId, setProjectId] = useState<Id<'projects'> | ''>('')
  const [relationshipId, setRelationshipId] = useState<Id<'relationships'> | ''>('')
  const [companyByMember, setCompanyByMember] = useState<Record<string, string>>({})
  const [roleByMember, setRoleByMember] = useState<Record<string, 'manager' | 'member'>>({})
  const [managerSelections, setManagerSelections] = useState<Record<string, Set<string>>>({})
  const members = useQuery(api.projects.listMembers, projectId ? { projectId, userId: currentUserId } : 'skip')
  const upgrade = useQuery(api.companyMigration.get, projectId ? { projectId } : 'skip')
  const initiate = useMutation(api.companyMigration.initiate)
  const confirmCompany = useMutation(api.companyMigration.confirmCompany)
  const activate = useMutation(api.companyMigration.activate)
  const cancel = useMutation(api.companyMigration.cancel)
  const selectedRelationship = relationships.find((item) => item.relationship._id === relationshipId)
  const eligibleProjects = useMemo(
    () => (accessibleProjects ?? []).filter((item) =>
      item.project.status === 'active' &&
      (item.membership.role === 'owner' || item.membership.role === 'manager'),
    ),
    [accessibleProjects],
  )
  const companyChoices = useMemo(() => {
    const choices = selectedRelationship?.participants ?? []
    return choices.some((company) => company._id === actingCompanyId)
      ? choices
      : [{ _id: actingCompanyId, displayName: 'Acting Company' }, ...choices]
  }, [actingCompanyId, selectedRelationship])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!projectId || !members) return
    const mappings = members.map(({ membership }) => ({
      projectMemberId: membership._id,
      companyId: companyByMember[membership._id] as Id<'companies'>,
      neutralRole: roleByMember[membership._id],
    }))
    if (mappings.some((mapping) => !mapping.companyId || !mapping.neutralRole)) return
    await run(() => initiate({
      idempotencyKey: crypto.randomUUID(),
      initiatingCompanyId: actingCompanyId,
      mappings,
      projectId,
      relationshipId: relationshipId || undefined,
    }))
  }

  return <section className="company-panel company-panel-wide">
    <h2>Assign an existing Project</h2>
    <p>Track will not assume Company identity or Project roles. Map every person explicitly; existing Channel membership is preserved exactly.</p>
    <form className="company-migration-form" onSubmit={(event) => void submit(event)}>
      <label>Existing Project<NativeSelect aria-label="Existing Project" onChange={(event) => {
        setProjectId(event.target.value as Id<'projects'>)
        setCompanyByMember({})
        setRoleByMember({})
      }} required searchable={eligibleProjects.length >= 8} value={projectId}><NativeSelectOption value="">Select Project</NativeSelectOption>{eligibleProjects.map((item) => <NativeSelectOption key={item.project._id} value={item.project._id}>{item.project.name}</NativeSelectOption>)}</NativeSelect></label>
      {accessibleProjects !== undefined && eligibleProjects.length === 0 ? (
        <p className="company-form-hint">
          No eligible legacy Projects found. Active Company Projects already
          use Company ownership and do not need migration. Only legacy
          Projects where you are an owner or manager can be assigned here.
        </p>
      ) : null}
      <label>Relationship for multiple Companies<NativeSelect aria-label="Relationship for multiple Companies" onChange={(event) => setRelationshipId(event.target.value as Id<'relationships'>)} value={relationshipId}><NativeSelectOption value="">Single-Company upgrade</NativeSelectOption>{relationships.map((item) => <NativeSelectOption key={item.relationship._id} value={item.relationship._id}>{item.relationship.name}</NativeSelectOption>)}</NativeSelect><span className="company-field-hint">Optional: choose a relationship when this Project should link to more than one Company. Leave “Single-Company upgrade” for a normal Project assignment.</span>{relationships.length === 0 ? <span className="company-field-hint">No multi-Company relationships are available for this Company yet. Create one in Relationships first, or continue with a single-Company assignment.</span> : null}</label>
      {members?.map(({ membership, user }) => <fieldset key={membership._id}><legend>{user?.displayName ?? 'Unknown member'}</legend><label>Represented Company<NativeSelect aria-label={`Represented Company for ${user?.displayName ?? 'member'}`} onChange={(event) => setCompanyByMember((current) => ({ ...current, [membership._id]: event.target.value }))} required searchable={companyChoices.length >= 8} value={companyByMember[membership._id] ?? ''}><NativeSelectOption value="">Choose explicitly</NativeSelectOption>{companyChoices.map((company) => <NativeSelectOption key={company._id} value={company._id}>{company.displayName}</NativeSelectOption>)}</NativeSelect></label><label>Project role after assignment<NativeSelect aria-label={`Project role for ${user?.displayName ?? 'member'}`} onChange={(event) => setRoleByMember((current) => ({ ...current, [membership._id]: event.target.value as 'manager' | 'member' }))} required value={roleByMember[membership._id] ?? ''}><NativeSelectOption value="">Choose explicitly</NativeSelectOption><NativeSelectOption value="manager">Manager</NativeSelectOption><NativeSelectOption value="member">Member</NativeSelectOption></NativeSelect></label></fieldset>)}
      <Button disabled={!projectId || Boolean(upgrade)} type="submit">Start reviewed assignment</Button>
    </form>
    {upgrade ? <div className="company-admin-card"><strong>Upgrade status: {upgrade.upgrade.status}</strong><p>{upgrade.companies.filter((item) => item.status === 'confirmed').length} of {upgrade.companies.length} Companies confirmed.</p>{upgrade.upgrade.status === 'ready' ? <Button onClick={() => void run(() => activate({ upgradeId: upgrade.upgrade._id }))}>Activate atomically</Button> : null}{upgrade.upgrade.status !== 'activated' ? <Button onClick={() => void run(() => cancel({ upgradeId: upgrade.upgrade._id }))} variant="outline">Cancel draft</Button> : null}</div> : null}
    {(pending ?? []).map((item) => item.upgrade && item.project ? <div className="company-admin-card" key={item.confirmation._id}><strong>Confirm {item.project.name}</strong><p>Select at least one manager from your Company; this confirms identity and roles for your people.</p>{item.ownMappings.map(({ mapping, user }) => <label key={mapping._id}><input checked={managerSelections[item.upgrade!._id]?.has(mapping.legacyProjectMemberId) ?? false} onChange={(event) => setManagerSelections((current) => {
          const next = new Set(current[item.upgrade!._id] ?? [])
          if (event.target.checked) next.add(mapping.legacyProjectMemberId)
          else next.delete(mapping.legacyProjectMemberId)
          return { ...current, [item.upgrade!._id]: next }
        })} type="checkbox" /> {user?.displayName ?? 'Unknown member'} as manager</label>)}<Button onClick={() => void run(() => confirmCompany({ actingCompanyId, managerProjectMemberIds: Array.from(managerSelections[item.upgrade!._id] ?? []) as Array<Id<'projectMembers'>>, upgradeId: item.upgrade!._id }))}>Confirm Company mapping</Button></div> : null)}
  </section>
}
