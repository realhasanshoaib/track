import { useMutation, useQuery } from 'convex/react'
import { useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { api } from '../../../../../convex/_generated/api'
import type { Id } from '../../../../../convex/_generated/dataModel'
import { Button } from '#/components/ui/button'
import { formatNumber, useLocale } from '#/i18n'

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
  const { t } = useTranslation('company')
  const { locale } = useLocale()
  const legacyProjects = useQuery(api.projects.list, { userId: currentUserId })
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
  const companyChoices = useMemo(() => {
    const choices = selectedRelationship?.participants ?? []
    return choices.some((company) => company._id === actingCompanyId)
      ? choices
      : [{ _id: actingCompanyId, displayName: t('labels.actingCompany') }, ...choices]
  }, [actingCompanyId, selectedRelationship, t])

  const upgradeStatusLabel = (status: string) => {
    if (status === 'ready') return t('migration.statusReady')
    if (status === 'awaiting_confirmation') return t('migration.statusAwaitingConfirmation')
    if (status === 'activated') return t('migration.statusActivated')
    if (status === 'cancelled') return t('migration.statusCancelled')
    return status
  }

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

  return <section className="company-panel">
    <h2>{t('migration.heading')}</h2>
    <p>{t('migration.description')}</p>
    <form className="company-migration-form" onSubmit={(event) => void submit(event)}>
      <label>{t('migration.legacyProject')}<select onChange={(event) => {
        setProjectId(event.target.value as Id<'projects'>)
        setCompanyByMember({})
        setRoleByMember({})
      }} required value={projectId}><option value="">{t('migration.selectProject')}</option>{legacyProjects?.filter((item) => item.membership.role === 'owner').map((item) => <option dir="auto" key={item.project._id} value={item.project._id}>{item.project.name}</option>)}</select></label>
      <label>{t('migration.relationshipMultiple')}<select onChange={(event) => setRelationshipId(event.target.value as Id<'relationships'>)} value={relationshipId}><option value="">{t('migration.singleCompany')}</option>{relationships.map((item) => <option dir="auto" key={item.relationship._id} value={item.relationship._id}>{item.relationship.name}</option>)}</select></label>
      {members?.map(({ membership, user }) => <fieldset key={membership._id}><legend dir="auto">{user?.displayName ?? t('labels.unknownMember')}</legend><label>{t('migration.representedCompany')}<select onChange={(event) => setCompanyByMember((current) => ({ ...current, [membership._id]: event.target.value }))} required value={companyByMember[membership._id] ?? ''}><option value="">{t('migration.chooseExplicitly')}</option>{companyChoices.map((company) => <option dir="auto" key={company._id} value={company._id}>{company.displayName}</option>)}</select></label><label>{t('migration.neutralRole')}<select onChange={(event) => setRoleByMember((current) => ({ ...current, [membership._id]: event.target.value as 'manager' | 'member' }))} required value={roleByMember[membership._id] ?? ''}><option value="">{t('migration.chooseExplicitly')}</option><option value="manager">{t('roles.manager')}</option><option value="member">{t('roles.member')}</option></select></label></fieldset>)}
      <Button disabled={!projectId || Boolean(upgrade)} type="submit">{t('migration.start')}</Button>
    </form>
    {upgrade ? <div className="company-admin-card"><strong dir="auto">{t('migration.status', { status: upgradeStatusLabel(upgrade.upgrade.status) })}</strong><p>{t('migration.confirmed', { confirmed: formatNumber(locale, upgrade.companies.filter((item) => item.status === 'confirmed').length), total: formatNumber(locale, upgrade.companies.length) })}</p>{upgrade.upgrade.status === 'ready' ? <Button onClick={() => void run(() => activate({ upgradeId: upgrade.upgrade._id }))}>{t('migration.activate')}</Button> : null}{upgrade.upgrade.status !== 'activated' ? <Button onClick={() => void run(() => cancel({ upgradeId: upgrade.upgrade._id }))} variant="outline">{t('migration.cancel')}</Button> : null}</div> : null}
    {(pending ?? []).map((item) => item.upgrade && item.project ? <div className="company-admin-card" key={item.confirmation._id}><strong dir="auto">{t('migration.confirmProject', { project: item.project.name })}</strong><p>{t('migration.confirmDescription')}</p>{item.ownMappings.map(({ mapping, user }) => <label dir="auto" key={mapping._id}><input checked={managerSelections[item.upgrade!._id]?.has(mapping.legacyProjectMemberId) ?? false} onChange={(event) => setManagerSelections((current) => {
          const next = new Set(current[item.upgrade!._id] ?? [])
          if (event.target.checked) next.add(mapping.legacyProjectMemberId)
          else next.delete(mapping.legacyProjectMemberId)
          return { ...current, [item.upgrade!._id]: next }
        })} type="checkbox" /> {user?.displayName ?? t('labels.unknownMember')} {t('migration.asManager')}</label>)}<Button onClick={() => void run(() => confirmCompany({ actingCompanyId, managerProjectMemberIds: Array.from(managerSelections[item.upgrade!._id] ?? []) as Array<Id<'projectMembers'>>, upgradeId: item.upgrade!._id }))}>{t('migration.confirmMapping')}</Button></div> : null)}
  </section>
}
