import { Bell, GripVertical, PanelRightClose, PanelRightOpen } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { Doc, Id } from '../../../../../../convex/_generated/dataModel'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { notificationModes } from '#/features/workspace/constants'
import { type WebNotificationPermission } from '#/features/workspace/web-notifications'
import { ChannelTaskPanel } from '#/features/tasks/ConversationTaskActions'
import { ChannelThreadBrowser } from '#/features/threads/ChannelThreadBrowser'
import type { GroupMessageItem } from '#/features/workspace/thread-items'
import { useReleaseConfig } from '#/lib/release-config'
import { formatDate } from '#/i18n'
import { AttachmentTypeIcon } from '../attachment-ui'

type WorkspaceRailProps = {
  activeGroup: Doc<'groups'> | undefined
  activeProjectId: Id<'projects'> | null
  busyAction: string | null
  globalNotificationMode: (typeof notificationModes)[number]
  groupNotificationMode: (typeof notificationModes)[number]
  notificationPermission: WebNotificationPermission
  notificationStatus: string | null
  onCollapse: () => void
  onExpand: () => void
  onNotificationMode: (mode: (typeof notificationModes)[number]) => void
  onSendTestNotification: () => void
  onEnableBrowserNotifications: () => void
  onStartResize: () => void
  railCollapsed: boolean
  userId: Id<'users'>
  visibleMessages: Array<GroupMessageItem>
}

type NotificationMenuProps = Pick<
  WorkspaceRailProps,
  | 'activeProjectId'
  | 'busyAction'
  | 'globalNotificationMode'
  | 'groupNotificationMode'
  | 'notificationPermission'
  | 'notificationStatus'
  | 'onEnableBrowserNotifications'
  | 'onNotificationMode'
  | 'onSendTestNotification'
>

function NotificationMenu({
  activeProjectId,
  busyAction,
  globalNotificationMode,
  groupNotificationMode,
  notificationPermission,
  notificationStatus,
  onEnableBrowserNotifications,
  onNotificationMode,
  onSendTestNotification,
}: NotificationMenuProps) {
  const { t } = useTranslation('workspace')
  const modeLabel = (mode: (typeof notificationModes)[number]) => t(`notifications.mode.${mode}`)
  const permissionLabel = (permission: WebNotificationPermission) => t(`notifications.permission.${permission}`)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t('notifications.settings')}
        className="track-rail-icon-button"
        disabled={!activeProjectId}
      >
        <Bell size={14} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="track-rail-menu">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t('notifications.title')}</DropdownMenuLabel>
          <p className="track-rail-menu-note">{t('notifications.browserStatus', { status: permissionLabel(notificationPermission) })}</p>
          <DropdownMenuItem
            disabled={busyAction === 'notifications' || busyAction === 'test-notifications'}
            onClick={onEnableBrowserNotifications}
          >
            {notificationPermission === 'granted' ? t('notifications.reconnect') : t('notifications.enable')}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={busyAction === 'notifications' || busyAction === 'test-notifications'}
            onClick={onSendTestNotification}
          >
            {t('notifications.sendTest')}
          </DropdownMenuItem>
          {notificationStatus ? <p className="track-rail-menu-note">{notificationStatus}</p> : null}
          <DropdownMenuSeparator />
          <p className="track-rail-menu-note">{t('notifications.global', { mode: modeLabel(globalNotificationMode) })}</p>
          <DropdownMenuRadioGroup
            value={groupNotificationMode}
            onValueChange={(mode) => onNotificationMode(mode as (typeof notificationModes)[number])}
          >
            {notificationModes.map((mode) => (
              <DropdownMenuRadioItem key={mode} value={mode}>
                {modeLabel(mode)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function WorkspaceRail({
  activeGroup,
  activeProjectId,
  busyAction,
  globalNotificationMode,
  groupNotificationMode,
  notificationPermission,
  notificationStatus,
  onCollapse,
  onExpand,
  onNotificationMode,
  onSendTestNotification,
  onEnableBrowserNotifications,
  onStartResize,
  railCollapsed,
  userId,
  visibleMessages,
}: WorkspaceRailProps) {
  const { t } = useTranslation('workspace')
  const releaseConfig = useReleaseConfig()
  const references = visibleMessages
    .flatMap((item) => item.attachments.map((file) => ({
      ...file,
      author: item.author?.displayName ?? t('chat.unknownMember'),
      createdAt: item.message.createdAt,
    })))
    .slice(-4)
    .reverse()
  if (railCollapsed) {
    return (
      <aside className="track-rail collapsed">
        <div className="track-rail-collapsed-actions">
          <button
            aria-label={t('rail.expandDetails')}
            className="track-rail-collapse-button"
            onClick={onExpand}
            type="button"
          >
            <PanelRightOpen size={15} />
          </button>
          <NotificationMenu
            activeProjectId={activeProjectId}
            busyAction={busyAction}
            globalNotificationMode={globalNotificationMode}
            groupNotificationMode={groupNotificationMode}
            notificationPermission={notificationPermission}
            notificationStatus={notificationStatus}
            onEnableBrowserNotifications={onEnableBrowserNotifications}
            onNotificationMode={onNotificationMode}
            onSendTestNotification={onSendTestNotification}
          />
        </div>
      </aside>
    )
  }

  return (
    <aside className="track-rail">
      <button
        aria-label={t('rail.resizeDetails')}
        className="track-rail-resize-handle"
        onPointerDown={(event) => {
          event.preventDefault()
          onStartResize()
        }}
        type="button"
      >
        <span className="track-rail-resize-grip">
          <GripVertical size={14} />
        </span>
      </button>
      <div className="track-rail-toolbar">
        <button
          aria-label={t('rail.collapseDetails')}
          className="track-rail-icon-button"
          onClick={onCollapse}
          type="button"
        >
          <PanelRightClose size={14} />
        </button>
        <NotificationMenu
          activeProjectId={activeProjectId}
          busyAction={busyAction}
          globalNotificationMode={globalNotificationMode}
          groupNotificationMode={groupNotificationMode}
          notificationPermission={notificationPermission}
          notificationStatus={notificationStatus}
          onEnableBrowserNotifications={onEnableBrowserNotifications}
          onNotificationMode={onNotificationMode}
          onSendTestNotification={onSendTestNotification}
        />
      </div>
      <section className="track-rail-section track-rail-reference-section">
        <div className="track-rail-heading-row">
          <span className="track-rail-heading">{t('rail.recentReferences')}</span>
        </div>
        <div className="track-rail-reference-list">
          {references.map(({ attachment, author, createdAt, url }) => {
            const content = (
              <>
                <AttachmentTypeIcon contentType={attachment.contentType} filename={attachment.filename} />
                <span className="track-rail-reference-copy">
                  <strong>{attachment.filename}</strong>
                  <small>{t('rail.referenceFrom', { author, date: formatDate(createdAt) })}</small>
                </span>
              </>
            )
            return url ? (
              <a href={url} key={attachment._id} rel="noreferrer" target="_blank">{content}</a>
            ) : (
              <span className="track-rail-reference" key={attachment._id}>{content}</span>
            )
          })}
          {!references.length ? <p className="track-rail-empty">{t('rail.noReferences')}</p> : null}
        </div>
      </section>
      {releaseConfig.tasks && activeGroup ? <ChannelTaskPanel group={activeGroup} variant="rail" /> : null}
      {releaseConfig.threads && activeGroup && activeProjectId ? (
        <ChannelThreadBrowser
          groupId={activeGroup._id}
          projectId={activeProjectId}
          readOnly={activeGroup.status === 'archived'}
          timelineMessages={visibleMessages}
          userId={userId}
          variant="rail"
        />
      ) : null}
    </aside>
  )
}
