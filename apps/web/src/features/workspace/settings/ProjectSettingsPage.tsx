import { Bell, Pencil, Settings2, Trash2, Upload } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { Doc, Id } from '../../../../../../convex/_generated/dataModel'
import { Button } from '#/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '#/components/ui/toggle-group'
import { notificationModes } from '#/features/workspace/constants'
import { getGroupAvatar } from '#/features/workspace/group-avatar'
import { formatNumber } from '#/i18n'

export function ProjectSettingsPage({
  activeProject,
  canDeleteProject,
  canManageProject,
  busyAction,
  globalNotificationMode,
  groupNotificationSettings,
  groups,
  members,
  onDeleteGroup,
  onDeleteProject,
  onEditGroup,
  onEditProject,
  onInvite,
  onNotificationMode,
}: {
  activeProject: Doc<'projects'> | null
  canDeleteProject: boolean
  canManageProject: boolean
  busyAction: string | null
  globalNotificationMode: (typeof notificationModes)[number]
  groupNotificationSettings: Array<Doc<'groupNotificationSettings'>>
  groups: Array<Doc<'groups'>>
  members: Array<{ membership: Doc<'projectMembers'>; user: Doc<'users'> | null }>
  onDeleteGroup: (groupId: Id<'groups'>) => void | Promise<void>
  onDeleteProject: () => void | Promise<void>
  onEditGroup: (group: Doc<'groups'>) => void
  onEditProject: (project: Doc<'projects'>) => void
  onInvite: () => void | Promise<void>
  onNotificationMode: (mode: (typeof notificationModes)[number]) => Promise<void>
}) {
  const { t } = useTranslation('workspace')
  return (
    <div className="track-settings-page">
      <section className="track-settings-panel">
        <div className="track-settings-section">
          <div className="track-settings-section-head">
            <div>
              <span className="mono-label">{t('settings.general')}</span>
              <h2>{t('settings.projectIdentity')}</h2>
            </div>
            <Settings2 size={15} />
          </div>
          <div className="track-settings-row">
            <span>{t('settings.name')}</span>
            <strong>{activeProject?.name ?? t('settings.untitledProject')}</strong>
          </div>
          <div className="track-settings-row">
            <span>{t('settings.label')}</span>
            <strong>{activeProject?.clientLabel ?? t('settings.none')}</strong>
          </div>
          <div className="track-settings-row">
            <span>{t('common.channels')}</span>
            <strong>{formatNumber(groups.length)}</strong>
          </div>
          {canManageProject && activeProject ? (
            <div className="track-settings-actions">
              <Button className="track-button" onClick={() => onEditProject(activeProject)} type="button">
                <Pencil size={14} />
                {t('settings.editProject')}
              </Button>
              {canDeleteProject ? (
                <Button
                  className="track-button danger"
                  disabled={busyAction === 'delete-project'}
                  onClick={() => {
                    if (window.confirm(t('settings.deleteProjectConfirm', { project: activeProject.name }))) {
                      void onDeleteProject()
                    }
                  }}
                  type="button"
                >
                  <Trash2 size={14} />
                  {t('settings.deleteProject')}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>

        {canManageProject ? (
          <div className="track-settings-section">
            <div className="track-settings-section-head">
              <div>
                <span className="mono-label">{t('common.channels')}</span>
                <h2>{t('settings.conversationLanes')}</h2>
              </div>
              <Settings2 size={14} />
            </div>
            <div className="track-settings-group-list">
              {groups.map((group) => {
                const { Icon, tone } = getGroupAvatar(group)
                return (
                  <div className="track-settings-group-row" key={group._id}>
                    <span className={`track-nav-group-icon ${tone}`}>
                      <Icon size={14} />
                    </span>
                    <span className="track-settings-group-copy">
                      <strong>{group.name}</strong>
                      <small>{t('settings.channelKind', { kind: group.kind.replaceAll('_', ' ') })}</small>
                    </span>
                    <Button
                      aria-label={t('settings.editChannel', { channel: group.name })}
                      className="track-nav-footer-button"
                      onClick={() => onEditGroup(group)}
                      title={t('settings.editChannel', { channel: group.name })}
                      type="button"
                    >
                      <Pencil size={14} />
                    </Button>
                    <Button
                      aria-label={t('settings.deleteChannel', { channel: group.name })}
                      className="track-nav-footer-button danger"
                      disabled={busyAction === 'delete-group'}
                      onClick={() => {
                        if (window.confirm(t('settings.deleteChannelConfirm', { channel: group.name }))) {
                          void onDeleteGroup(group._id)
                        }
                      }}
                      title={t('settings.deleteChannel', { channel: group.name })}
                      type="button"
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                )
              })}
              {groups.length === 0 ? <p className="track-settings-empty">{t('settings.noChannels')}</p> : null}
            </div>
          </div>
        ) : null}

        <div className="track-settings-section">
          <div className="track-settings-section-head">
            <div>
              <span className="mono-label">{t('notifications.title')}</span>
              <h2>{t('settings.defaultNotificationMode')}</h2>
            </div>
            <Bell size={14} />
          </div>
          <ToggleGroup
            className="track-mode-grid"
            value={[globalNotificationMode]}
            onValueChange={(value) => {
              const mode = value.at(-1) as (typeof notificationModes)[number] | undefined
              if (mode && mode !== 'inherit') void onNotificationMode(mode)
            }}
          >
            {notificationModes.filter((mode) => mode !== 'inherit').map((mode) => (
              <ToggleGroupItem
                className={mode === globalNotificationMode ? 'track-chip active' : 'track-chip'}
                key={mode}
                value={mode}
              >
                {t(`notifications.mode.${mode}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <div className="track-settings-row">
            <span>{t('settings.channelOverrides')}</span>
            <strong>{formatNumber(groupNotificationSettings.length)}</strong>
          </div>
        </div>

        <div className="track-settings-section">
          <div className="track-settings-section-head">
            <div>
              <span className="mono-label">{t('dialogs.access')}</span>
              <h2>{t('settings.projectMembers')}</h2>
            </div>
            <Upload size={14} />
          </div>
          <div className="track-settings-row">
            <span>{t('settings.members')}</span>
            <strong>{formatNumber(members.length)}</strong>
          </div>
          <div className="track-settings-actions">
            <Button className="track-button" onClick={() => void onInvite()} type="button">
              {t('dialogs.inviteMember')}
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}
