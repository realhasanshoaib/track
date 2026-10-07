import { createFileRoute, Link } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { AlertTriangle, ArrowLeft, FolderKanban, Handshake, LayoutGrid, MessageSquareText, Plus, ShieldCheck, Users } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'

import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import { Button } from '#/components/ui/button'
import { ConfirmDialog } from '#/components/ui/confirm-dialog'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '#/components/ui/dialog'
import { CompanyProfileForm, CreateCompanyForm } from '#/features/company/CompanyForms'
import { EntityMark } from '#/features/workspace/entity-mark'
import { CompanyProjectNavigation } from '#/features/company/CompanyProjectNavigation'
import { MigrationPanel } from '#/features/company/MigrationPanel'
import { useActingCompany } from '#/features/company/use-acting-company'
import { resolveReleaseConfig, useReleaseConfigProjection } from '#/lib/release-config'

import '#/features/company/company-settings.css'
import '#/features/company/company-experience.css'

export const Route = createFileRoute('/workspace/company/settings')({ component: CompanySettingsPage })

function CompanySettingsShell({ actingCompanyId, children, onCompanyChange, tasksEnabled }: {
  actingCompanyId: NonNullable<ReturnType<typeof useActingCompany>['actingCompanyId']> | null
  children: ReactNode
  onCompanyChange: (companyId: Id<'companies'>) => void
  tasksEnabled: boolean
}) {
  return (
    <main className="company-hub-shell company-unified-shell">
      <CompanyProjectNavigation
        activeArea="company"
        actingCompanyId={actingCompanyId}
        onCompanyChange={onCompanyChange}
        companyNavigation={
          <nav aria-label="Company workspace">
            <span className="company-project-nav-label">Workspace</span>
            <Link className="company-project-nav-item" to="/workspace/company" search={{ view: 'overview', taskFilter: undefined }}><LayoutGrid aria-hidden="true" size={14} />Overview</Link>
            <Link className="company-project-nav-item" to="/workspace/company" search={{ view: 'projects', taskFilter: undefined }}><FolderKanban aria-hidden="true" size={14} />Projects</Link>
            <Link className="company-project-nav-item" to="/workspace/company" search={{ view: 'threads', taskFilter: undefined }}><MessageSquareText aria-hidden="true" size={14} />Threads</Link>
            <Link className="company-project-nav-item" to="/workspace/company" search={{ view: 'relationships', taskFilter: undefined }}><Handshake aria-hidden="true" size={14} />Relationships</Link>
            <Link className="company-project-nav-item" to="/workspace/company" search={{ view: 'people', taskFilter: undefined }}><Users aria-hidden="true" size={14} />People</Link>
            <Link aria-current="page" className="company-project-nav-item active" to="/workspace/company/settings"><ShieldCheck aria-hidden="true" size={14} />Settings</Link>
          </nav>
        }
        tasksEnabled={tasksEnabled}
      />
      <section className="company-settings-page">{children}</section>
    </main>
  )
}

function CompanySettingsPage() {
  const releaseConfigProjection = useReleaseConfigProjection()
  const releaseConfig = resolveReleaseConfig(releaseConfigProjection)
  const currentUser = useQuery(api.auth.getCurrentUser, releaseConfig.companyModel ? {} : 'skip')
  const companies = useQuery(api.companies.listMine, releaseConfig.companyModel ? {} : 'skip')
  const availableCompanyIds = useMemo(
    () => (companies ?? []).flatMap((item) => item.company && item.company.status !== 'closed' ? [item.company._id] : []),
    [companies],
  )
  const { actingCompanyId, setActingCompanyId } = useActingCompany(availableCompanyIds)
  const actingCompany = companies?.find((item) => item.company?._id === actingCompanyId)
  const canAdminister = Boolean(actingCompany && actingCompany.membership.role !== 'member')
  const administration = useQuery(api.companies.getAdministration, actingCompanyId && canAdminister ? { companyId: actingCompanyId } : 'skip')
  const relationships = useQuery(api.relationships.listMine, actingCompanyId && canAdminister ? { actingCompanyId } : 'skip')
  const setSuspended = useMutation(api.companies.setSuspended)
  const closeCompany = useMutation(api.companies.close)
  const [notice, setNotice] = useState<{ message: string; error: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [suspendOpen, setSuspendOpen] = useState(false)
  const [closeOpen, setCloseOpen] = useState(false)

  async function run(action: () => Promise<unknown>, success = 'Changes saved.') {
    setNotice(null)
    setBusy(true)
    try {
      await action()
      setNotice({ message: success, error: false })
      return true
    } catch (error) {
      setNotice({ message: error instanceof Error ? error.message.replaceAll('_', ' ') : 'The action failed. Try again.', error: true })
      return false
    } finally {
      setBusy(false)
    }
  }

  const shell = (content: ReactNode) => <CompanySettingsShell actingCompanyId={actingCompanyId} onCompanyChange={setActingCompanyId} tasksEnabled={releaseConfig.tasks}>{content}</CompanySettingsShell>
  if (releaseConfigProjection === undefined || companies === undefined || currentUser === undefined) {
    return shell(<section className="track-guided-empty" role="status"><h1>Loading company settings…</h1><p>Checking your company access.</p></section>)
  }
  if (!releaseConfig.companyModel) {
    return shell(<section className="track-guided-empty"><h1>Company settings unavailable</h1><p>Company collaboration is disabled for this environment.</p><Link to="/workspace">Back to workspace</Link></section>)
  }
  if (!currentUser) {
    return shell(<section className="track-guided-empty"><h1>Sign in required</h1><p>Sign in to manage Company settings.</p><Link to="/workspace">Back to workspace</Link></section>)
  }
  if (!actingCompany || !canAdminister) {
    return shell(<section className="track-guided-empty"><h1>Company settings unavailable</h1><p>Company settings are available to company owners and admins.</p><Link search={{ view: 'overview', taskFilter: undefined }} to="/workspace/company">Back to companies</Link></section>)
  }
  if (!actingCompanyId || administration === undefined) {
    return shell(<section className="track-guided-empty" role="status"><h1>Loading company settings…</h1><p>Loading the company profile.</p></section>)
  }

  const { company, membership } = administration
  const isOwner = membership.role === 'owner'
  const isSuspended = company.status === 'suspended'
  const activeRelationships = (relationships ?? []).filter(({ relationship }) => relationship.status === 'active')

  return shell(
    <div className="company-settings-content">
      <header className="company-settings-header">
        <div>
          <Link aria-label="Back to company overview" className="company-settings-back" search={{ view: 'overview', taskFilter: undefined }} to="/workspace/company"><ArrowLeft aria-hidden="true" size={14} />Company overview</Link>
          <h1>Company profile</h1>
          <p>Manage the identity people see across Projects and shared work.</p>
        </div>
      </header>

      {notice ? <p aria-live={notice.error ? 'assertive' : 'polite'} className={`company-settings-notice${notice.error ? ' is-error' : ''}`}>{notice.message}</p> : null}

      <section aria-labelledby="company-profile-heading" className="company-settings-profile">
        <div className="company-settings-identity">
          <EntityMark id={String(company._id)} imageUrl={company.logoUrl} kind="company" name={company.displayName} size={72} />
          <div className="company-settings-identity-copy">
            <div className="company-settings-identity-title"><h2 id="company-profile-heading">{company.displayName}</h2><span className="company-settings-current">Current company</span></div>
            <p>{company.normalizedHandle}</p>
          </div>
          <p className="company-settings-identity-hint">This name is visible to company members across Projects, Channels, and shared resources.</p>
        </div>
        <div className="company-settings-profile-form">
          <CompanyProfileForm actingCompanyId={actingCompanyId} description={company.description} displayName={company.displayName} handle={company.normalizedHandle} key={actingCompanyId} logoStorageId={company.logoStorageId} logoUrl={company.logoUrl} run={run} />
        </div>
      </section>

      <section className="company-settings-action-row company-settings-create-company">
        <span aria-hidden="true" className="company-settings-action-icon"><Plus size={20} /></span>
        <div><h2>Create another Company</h2><p>Set up a separate identity, team, Projects, and access.</p></div>
        <Button disabled={busy} onClick={() => setCreateOpen(true)} type="button" variant="outline">Create Company</Button>
      </section>

      <section className="company-settings-action-row">
        <span aria-hidden="true" className="company-settings-action-icon"><FolderKanban size={19} /></span>
        <div><h2>Assign an existing Project</h2><p>Map people and roles before connecting a legacy Project to this Company.</p></div>
        <Button disabled={busy} onClick={() => setAssignOpen(true)} type="button" variant="outline">Assign Project</Button>
      </section>

      <section aria-labelledby="company-lifecycle-heading" className="company-settings-action-row company-settings-danger">
        <span aria-hidden="true" className="company-settings-action-icon"><AlertTriangle size={19} /></span>
        <div><h2 id="company-lifecycle-heading">Suspend or close Company</h2><p>Suspension pauses access and can be reversed. Closing requires active Projects and Relationships to be resolved first.</p></div>
        {isOwner ? <div className="company-settings-danger-actions">
          <Button disabled={busy} onClick={() => setSuspendOpen(true)} type="button" variant="outline">{isSuspended ? 'Reactivate Company' : 'Suspend Company'}</Button>
          {company.status !== 'closed' ? <Button disabled={busy} onClick={() => setCloseOpen(true)} type="button" variant="destructive">Close Company</Button> : null}
        </div> : <p className="company-settings-owner-note">Only the Company owner can change its lifecycle.</p>}
      </section>

      <Dialog onOpenChange={setCreateOpen} open={createOpen}>
        <DialogContent className="company-settings-create-dialog">
          <DialogHeader><DialogTitle>Create another Company</DialogTitle><DialogDescription>This Company will have separate people, Projects, and access.</DialogDescription></DialogHeader>
          <CreateCompanyForm run={async (action) => {
            const saved = await run(action, 'Company created.')
            if (saved) setCreateOpen(false)
            return saved
          }} />
        </DialogContent>
      </Dialog>
      <Dialog onOpenChange={setAssignOpen} open={assignOpen}>
        <DialogContent className="company-settings-assign-dialog">
          <DialogHeader><DialogTitle>Assign an existing Project</DialogTitle><DialogDescription>Review each person and role before Company ownership changes.</DialogDescription></DialogHeader>
          <MigrationPanel actingCompanyId={actingCompanyId} currentUserId={currentUser._id} relationships={activeRelationships} run={async (action) => { await run(action, 'Project assignment updated.') }} />
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        confirmLabel={isSuspended ? 'Reactivate Company' : 'Suspend Company'}
        description={isSuspended ? `Reactivate ${company.displayName} and restore Company access?` : `Suspend ${company.displayName}? Company access will pause until an owner reactivates it.`}
        onConfirm={() => run(() => setSuspended({ companyId: actingCompanyId, suspended: !isSuspended }), isSuspended ? 'Company reactivated.' : 'Company suspended.')}
        onOpenChange={setSuspendOpen}
        open={suspendOpen}
        title={`${isSuspended ? 'Reactivate' : 'Suspend'} ${company.displayName}?`}
      />
      <ConfirmDialog
        confirmLabel="Close Company"
        description={`Closing ${company.displayName} is irreversible after active Projects, Relationships, and invitations are resolved.`}
        onConfirm={() => run(() => closeCompany({ companyId: actingCompanyId, retentionConfirmed: true }), 'Company closed.')}
        onOpenChange={setCloseOpen}
        open={closeOpen}
        title={`Close ${company.displayName}?`}
      />
    </div>,
  )
}
