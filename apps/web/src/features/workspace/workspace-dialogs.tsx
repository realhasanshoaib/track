import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import '#/i18n'

import type { Doc, Id } from '../../../../../convex/_generated/dataModel'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
} from '#/components/ui/select'
import { getGroupAvatar } from './group-avatar'

export function WorkspaceDialogs({
  activeGroupId,
  busyAction,
  groupDialogOpen,
  groupDialogMode,
  groupName,
  inviteDialogOpen,
  inviteEmail,
  inviteRole,
  inviteAccess,
  projectClientLabel,
  projectDialogOpen,
  projectDialogMode,
  projectGroups,
  projectName,
  setGroupDialogOpen,
  setGroupName,
  setInviteDialogOpen,
  setInviteEmail,
  setInviteRole,
  setInviteAccess,
  setProjectClientLabel,
  setProjectDialogOpen,
  setProjectName,
  onCreateGroupSubmit,
  onCreateProjectSubmit,
  onInviteSubmit,
}: {
  activeGroupId: Id<'groups'> | null
  busyAction: string | null
  groupDialogOpen: boolean
  groupDialogMode: 'create' | 'edit'
  groupName: string
  inviteDialogOpen: boolean
  inviteEmail: string
  inviteRole: 'admin' | 'staff' | 'client'
  inviteAccess: string
  projectClientLabel: string
  projectDialogOpen: boolean
  projectDialogMode: 'create' | 'edit'
  projectGroups: Array<Doc<'groups'>>
  projectName: string
  setGroupDialogOpen: (open: boolean) => void
  setGroupName: (value: string) => void
  setInviteDialogOpen: (open: boolean) => void
  setInviteEmail: (value: string) => void
  setInviteRole: (value: 'admin' | 'staff' | 'client') => void
  setInviteAccess: (value: string) => void
  setProjectClientLabel: (value: string) => void
  setProjectDialogOpen: (open: boolean) => void
  setProjectName: (value: string) => void
  onCreateGroupSubmit: (event: FormEvent<HTMLFormElement>) => void
  onCreateProjectSubmit: (event: FormEvent<HTMLFormElement>) => void
  onInviteSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  const { t } = useTranslation('workspace')
  const selectedInviteGroup = inviteAccess.startsWith('group:')
    ? projectGroups.find((group) => `group:${group._id}` === inviteAccess)
    : null
  const selectedInviteGroupAvatar = selectedInviteGroup ? getGroupAvatar(selectedInviteGroup) : null
  const SelectedInviteGroupIcon = selectedInviteGroupAvatar?.Icon

  return (
    <>
      <Dialog open={projectDialogOpen} onOpenChange={setProjectDialogOpen}>
        <DialogContent className="track-dialog">
          <form onSubmit={onCreateProjectSubmit}>
            <DialogHeader>
              <DialogTitle>{projectDialogMode === 'edit' ? t('dialogs.editProject') : t('dialogs.createProject')}</DialogTitle>
              <DialogDescription>
                {projectDialogMode === 'edit'
                  ? t('dialogs.updateProjectDescription')
                  : t('dialogs.createProjectDescription')}
              </DialogDescription>
            </DialogHeader>
            <div className="track-dialog-fields">
              <label className="track-dialog-field">
                <span>{t('dialogs.projectName')}</span>
                <Input
                  autoFocus
                  onChange={(event) => setProjectName(event.currentTarget.value)}
                  value={projectName}
                />
              </label>
              <label className="track-dialog-field">
                <span>{t('dialogs.clientLabel')}</span>
                <Input
                  onChange={(event) => setProjectClientLabel(event.currentTarget.value)}
                  value={projectClientLabel}
                />
              </label>
            </div>
            <DialogFooter>
              <Button className="track-button" type="button" onClick={() => setProjectDialogOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                className="track-button track-button-primary"
                disabled={!projectName.trim() || busyAction === 'create-project' || busyAction === 'edit-project'}
                type="submit"
              >
                {projectDialogMode === 'edit' ? t('common.save') : t('common.create')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen}>
        <DialogContent className="track-dialog">
          <form onSubmit={onCreateGroupSubmit}>
            <DialogHeader>
              <DialogTitle>{groupDialogMode === 'edit' ? t('dialogs.editChannel') : t('dialogs.createChannel')}</DialogTitle>
              <DialogDescription>
                {groupDialogMode === 'edit'
                  ? t('dialogs.updateChannelDescription')
                  : t('dialogs.createChannelDescription')}
              </DialogDescription>
            </DialogHeader>
            <div className="track-dialog-fields">
              <label className="track-dialog-field">
                <span>{t('dialogs.channelName')}</span>
                <Input
                  autoFocus
                  onChange={(event) => setGroupName(event.currentTarget.value)}
                  value={groupName}
                />
              </label>
            </div>
            <DialogFooter>
              <Button className="track-button" type="button" onClick={() => setGroupDialogOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                className="track-button track-button-primary"
                disabled={!groupName.trim() || busyAction === 'create-group' || busyAction === 'edit-group'}
                type="submit"
              >
                {groupDialogMode === 'edit' ? t('common.save') : t('common.create')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent className="track-dialog">
          <form onSubmit={onInviteSubmit}>
            <DialogHeader>
              <DialogTitle>{t('dialogs.inviteMember')}</DialogTitle>
              <DialogDescription>{t('dialogs.inviteDescription')}</DialogDescription>
            </DialogHeader>
            <div className="track-dialog-fields">
              <label className="track-dialog-field">
                <span>{t('dialogs.email')}</span>
                <Input
                  autoFocus
                  onChange={(event) => setInviteEmail(event.currentTarget.value)}
                  type="email"
                  value={inviteEmail}
                />
              </label>
              <label className="track-dialog-field">
                <span>{t('dialogs.role')}</span>
                <Select
                  onValueChange={(value) => setInviteRole((value ?? 'staff') as typeof inviteRole)}
                  value={inviteRole}
                >
                  <SelectTrigger className="track-dialog-select-trigger">
                    <span className="track-dialog-select-value">{t(`dialogs.roles.${inviteRole}`)}</span>
                  </SelectTrigger>
                  <SelectContent className="track-dialog-select-content">
                    <SelectGroup>
                      <SelectItem value="admin">{t('dialogs.roles.admin')}</SelectItem>
                      <SelectItem value="staff">{t('dialogs.roles.staff')}</SelectItem>
                      <SelectItem value="client">{t('dialogs.roles.client')}</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </label>
              <label className="track-dialog-field">
                <span>{t('dialogs.access')}</span>
                <Select
                  onValueChange={(value) => setInviteAccess(value ?? 'project')}
                  value={inviteAccess}
                >
                  <SelectTrigger className="track-dialog-select-trigger">
                    {selectedInviteGroup && selectedInviteGroupAvatar && SelectedInviteGroupIcon ? (
                      <span className="track-invite-access-trigger">
                        <span className={`track-nav-group-icon ${selectedInviteGroupAvatar.tone}`}>
                          <SelectedInviteGroupIcon size={14} />
                        </span>
                        <span className="track-dialog-select-value">{selectedInviteGroup.name}</span>
                      </span>
                    ) : (
                      <span className="track-dialog-select-value">{t('dialogs.entireProject')}</span>
                    )}
                  </SelectTrigger>
                  <SelectContent className="track-dialog-select-content">
                    <SelectGroup>
                      <SelectItem value="project">{t('dialogs.entireProject')}</SelectItem>
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel>{t('common.channels')}</SelectLabel>
                      {projectGroups.length > 0 ? (
                        projectGroups.map((group) => {
                          const { Icon, tone } = getGroupAvatar(group)
                          return (
                            <SelectItem
                              key={group._id}
                              label={group.name}
                              value={`group:${group._id}`}
                            >
                              <span className={`track-nav-group-icon ${tone}`}>
                                <Icon size={14} />
                              </span>
                              <span className="track-invite-access-option">
                                <strong>{group.name}</strong>
                                <small>
                                  {group._id === activeGroupId ? t('dialogs.currentChannel') : t('dialogs.channelKind', { kind: group.kind.replaceAll('_', ' ') })}
                                </small>
                              </span>
                            </SelectItem>
                          )
                        })
                      ) : (
                        <SelectItem disabled value="no-groups">
                          {t('sidebar.noChannels')}
                        </SelectItem>
                      )}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </label>
            </div>
            <DialogFooter>
              <Button className="track-button" type="button" onClick={() => setInviteDialogOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                className="track-button track-button-primary"
                disabled={!inviteEmail.trim() || busyAction === 'invite'}
                type="submit"
              >
                {t('common.invite')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

    </>
  )
}
