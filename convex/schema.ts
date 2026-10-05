import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'
import { entityMarkColorKeys, entityMarkIconKeys } from '@track/shared'

import { companyCoreTables } from './schema/companyCoreTables'
import { companyProjectTables } from './schema/companyProjectTables'
import { messageUploadTables } from './schema/messageUploadTables'
import { projectExitTables } from './schema/projectExitTables'
import { taskAutomationTables } from './schema/taskAutomationTables'
import { taskCoreTables } from './schema/taskCoreTables'
import {
  channelStatus,
  companyProjectRole,
  projectMemberStatus,
  projectOrigin,
  projectStatus,
} from './schema/companyValidators'

const projectRole = v.union(
  v.literal('owner'),
  v.literal('admin'),
  v.literal('staff'),
  v.literal('client'),
  companyProjectRole,
)

const projectAccessProfile = v.union(v.literal('legacy'), v.literal('company'))

const groupKind = v.union(
  v.literal('general'),
  v.literal('internal'),
  v.literal('commercials'),
  v.literal('custom'),
)

const notificationMode = v.union(
  v.literal('all'),
  v.literal('mentions'),
  v.literal('none'),
)

const groupNotificationMode = v.union(
  v.literal('inherit'),
  v.literal('all'),
  v.literal('mentions'),
  v.literal('none'),
)

const taskPushNotificationMode = v.union(
  v.literal('important'),
  v.literal('all'),
  v.literal('muted'),
)

const pushPermissionState = v.union(
  v.literal('not_determined'),
  v.literal('denied'),
  v.literal('granted'),
  v.literal('provisional'),
)

const pushEnvironment = v.union(
  v.literal('development'),
  v.literal('preview'),
  v.literal('production'),
)

const pushDeliveryStatus = v.union(
  v.literal('queued'),
  v.literal('sending'),
  v.literal('ticket_accepted'),
  v.literal('retry_wait'),
  v.literal('delivered'),
  v.literal('canceled'),
  v.literal('permanent_failure'),
  v.literal('expired'),
)

const pushAttemptStatus = v.union(
  v.literal('ticket_accepted'),
  v.literal('transient_failure'),
  v.literal('permanent_failure'),
  v.literal('delivered'),
)

const contentReportTargetType = v.union(
  v.literal('message'),
  v.literal('attachment'),
  v.literal('voice_note'),
  v.literal('assistant_answer'),
  v.literal('task'),
  v.literal('task_comment'),
  v.literal('task_suggestion'),
)

const contentReportReason = v.union(
  v.literal('inaccurate'),
  v.literal('unsafe'),
  v.literal('spam'),
  v.literal('harassment'),
  v.literal('privacy'),
  v.literal('other'),
)

const jobStatus = v.union(
  v.literal('queued'),
  v.literal('running'),
  v.literal('completed'),
  v.literal('failed'),
)

const memoryBoxStatus = v.union(
  v.literal('creating'),
  v.literal('ready'),
  v.literal('paused'),
  v.literal('error'),
  v.literal('deleted'),
)

const memoryImportSourceKind = v.union(
  v.literal('paste'),
  v.literal('file'),
  v.literal('link'),
  v.literal('chat_export'),
  v.literal('track_attachment'),
)

const attachmentKind = v.union(v.literal('file'), v.literal('voice_note'))
const mediaPreviewStatus = v.union(
  v.literal('pending'),
  v.literal('ready'),
  v.literal('failed'),
)
const mediaPreviewErrorCode = v.union(
  v.literal('not_an_image'),
  v.literal('image_too_large'),
  v.literal('missing_source'),
  v.literal('processor_failed'),
)

const evidenceItem = v.object({
  messageId: v.optional(v.id('messages')),
  attachmentId: v.optional(v.id('attachments')),
  quote: v.string(),
  reason: v.optional(v.string()),
})

const forwardedAttachmentSnapshot = v.object({
  filename: v.string(),
  contentType: v.string(),
  size: v.number(),
  kind: v.optional(attachmentKind),
  durationMs: v.optional(v.number()),
})

const forwardedMessageSnapshot = v.object({
  sourceProjectId: v.id('projects'),
  sourceGroupId: v.id('groups'),
  sourceMessageId: v.id('messages'),
  originalAuthorId: v.id('users'),
  originalAuthorName: v.string(),
  originalBody: v.string(),
  originalCreatedAt: v.number(),
  attachmentSnapshots: v.array(forwardedAttachmentSnapshot),
  forwardedAt: v.number(),
})

export default defineSchema({
  ...companyCoreTables,
  ...companyProjectTables,
  ...projectExitTables,
  ...messageUploadTables,
  ...taskCoreTables,
  ...taskAutomationTables,

  users: defineTable({
    googleSubject: v.string(),
    authUserId: v.optional(v.string()),
    normalizedEmail: v.optional(v.string()),
    email: v.string(),
    displayName: v.string(),
    profileDesignation: v.optional(v.string()),
    profileBio: v.optional(v.string()),
    profileBannerStyle: v.optional(v.string()),
    timezone: v.optional(v.string()),
    avatarStorageId: v.optional(v.id('_storage')),
    profileCompletedAt: v.optional(v.number()),
    twoFactorEnabled: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_google_subject', ['googleSubject'])
    .index('by_auth_user_id', ['authUserId'])
    .index('by_normalized_email', ['normalizedEmail']),

  projects: defineTable({
    name: v.string(),
    clientLabel: v.optional(v.string()),
    description: v.optional(v.string()),
    iconStorageId: v.optional(v.id('_storage')),
    markIconKey: v.optional(v.union(...entityMarkIconKeys.map((key) => v.literal(key)))),
    markColorKey: v.optional(v.union(...entityMarkColorKeys.map((key) => v.literal(key)))),
    accessProfile: v.optional(projectAccessProfile),
    owningCompanyId: v.optional(v.id('companies')),
    relationshipId: v.optional(v.id('relationships')),
    proposingCompanyId: v.optional(v.id('companies')),
    origin: v.optional(projectOrigin),
    status: v.optional(projectStatus),
    participantRevision: v.optional(v.number()),
    revision: v.optional(v.number()),
    archiveReason: v.optional(v.string()),
    archivedAt: v.optional(v.number()),
    createdBy: v.id('users'),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_created_by', ['createdBy'])
    .index('by_owning_company_status', ['owningCompanyId', 'status'])
    .index('by_relationship_status', ['relationshipId', 'status'])
    .index('by_proposing_company_status', ['proposingCompanyId', 'status']),

  projectMembers: defineTable({
    projectId: v.id('projects'),
    userId: v.id('users'),
    role: projectRole,
    companyId: v.optional(v.id('companies')),
    projectCompanyId: v.optional(v.id('projectCompanies')),
    status: v.optional(projectMemberStatus),
    term: v.optional(v.number()),
    invitedBy: v.optional(v.id('users')),
    userDisplayNameSnapshot: v.optional(v.string()),
    companyDisplayNameSnapshot: v.optional(v.string()),
    endedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_project', ['projectId'])
    .index('by_project_status', ['projectId', 'status'])
    .index('by_user', ['userId'])
    .index('by_user_status', ['userId', 'status'])
    .index('by_user_company_status', ['userId', 'companyId', 'status'])
    .index('by_company', ['companyId'])
    .index('by_project_user', ['projectId', 'userId'])
    .index('by_project_company_status', ['projectId', 'companyId', 'status'])
    .index('by_project_company_user_term', ['projectId', 'companyId', 'userId', 'term']),

  groups: defineTable({
    projectId: v.id('projects'),
    kind: groupKind,
    name: v.string(),
    markIconKey: v.optional(v.union(...entityMarkIconKeys.map((key) => v.literal(key)))),
    markColorKey: v.optional(v.union(...entityMarkColorKeys.map((key) => v.literal(key)))),
    status: v.optional(channelStatus),
    revision: v.optional(v.number()),
    archivedAt: v.optional(v.number()),
    nextChannelSequence: v.optional(v.number()),
    createdBy: v.id('users'),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_project', ['projectId'])
    .searchIndex('search_name_by_project', {
      searchField: 'name',
      filterFields: ['projectId'],
    }),

  groupMembers: defineTable({
    projectId: v.id('projects'),
    groupId: v.id('groups'),
    userId: v.id('users'),
    projectMemberId: v.optional(v.id('projectMembers')),
    status: v.optional(
      v.union(v.literal('active'), v.literal('suspended'), v.literal('removed'), v.literal('archived')),
    ),
    isSteward: v.optional(v.boolean()),
    endedByProjectMembership: v.optional(v.boolean()),
    endedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_group', ['groupId'])
    .index('by_project_user', ['projectId', 'userId'])
    .index('by_user', ['userId'])
    .index('by_user_status', ['userId', 'status'])
    .index('by_group_user', ['groupId', 'userId'])
    .index('by_group_project_member', ['groupId', 'projectMemberId'])
    .index('by_project_member_status', ['projectMemberId', 'status']),

  invitations: defineTable({
    projectId: v.id('projects'),
    groupId: v.optional(v.id('groups')),
    email: v.string(),
    role: projectRole,
    invitedBy: v.id('users'),
    status: v.union(
      v.literal('pending'),
      v.literal('accepted'),
      v.literal('revoked'),
      v.literal('expired'),
    ),
    token: v.string(),
    expiresAt: v.number(),
    acceptedBy: v.optional(v.id('users')),
    acceptedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_project_status', ['projectId', 'status'])
    .index('by_email_status', ['email', 'status'])
    .index('by_token', ['token']),

  messages: defineTable({
    projectId: v.id('projects'),
    groupId: v.id('groups'),
    authorId: v.id('users'),
    authorProjectMemberId: v.optional(v.id('projectMembers')),
    actingCompanyId: v.optional(v.id('companies')),
    channelThreadId: v.optional(v.id('channelThreads')),
    channelSequence: v.optional(v.number()),
    idempotencyKey: v.optional(v.string()),
    body: v.string(),
    mentions: v.array(v.id('users')),
    mentionedProjectMemberIds: v.optional(v.array(v.id('projectMembers'))),
    attachmentIds: v.array(v.id('attachments')),
    replyToMessageId: v.optional(v.id('messages')),
    forwardedFrom: v.optional(forwardedMessageSnapshot),
    notificationPreview: v.optional(v.string()),
    revision: v.optional(v.number()),
    editedAt: v.optional(v.number()),
    trackInvocationId: v.optional(v.id('assistantStreams')),
    createdAt: v.number(),
  })
    .index('by_group_created_at', ['groupId', 'createdAt'])
    .index('by_group_thread_created_at', ['groupId', 'channelThreadId', 'createdAt'])
    .index('by_thread_created_at', ['channelThreadId', 'createdAt'])
    .index('by_group_channel_sequence', ['groupId', 'channelSequence'])
    .index('by_author_idempotency', ['authorProjectMemberId', 'idempotencyKey'])
    .index('by_project_created_at', ['projectId', 'createdAt'])
    .searchIndex('search_body_by_project', {
      searchField: 'body',
      filterFields: ['projectId'],
    }),

  channelThreads: defineTable({
    projectId: v.id('projects'),
    groupId: v.id('groups'),
    name: v.string(),
    sourceMessageId: v.optional(v.id('messages')),
    creatorUserId: v.id('users'),
    creatorProjectMemberId: v.id('projectMembers'),
    actingCompanyId: v.optional(v.id('companies')),
    status: v.union(v.literal('active'), v.literal('archived')),
    revision: v.number(),
    replyCount: v.optional(v.number()),
    latestReplyAt: v.optional(v.number()),
    latestChannelSequence: v.optional(v.number()),
    idempotencyKey: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    archivedAt: v.optional(v.number()),
  })
    .index('by_project', ['projectId'])
    .index('by_group_status_updated_at', ['groupId', 'status', 'updatedAt'])
    .index('by_group_source', ['groupId', 'sourceMessageId'])
    .index('by_group_idempotency', ['groupId', 'idempotencyKey'])
    .index('by_creator_idempotency', ['creatorProjectMemberId', 'idempotencyKey'])
    .index('by_creator', ['creatorProjectMemberId'])
    .searchIndex('search_name_by_project', {
      searchField: 'name',
      filterFields: ['projectId', 'groupId', 'status'],
    }),

  channelThreadFollowers: defineTable({
    projectId: v.id('projects'),
    groupId: v.id('groups'),
    channelThreadId: v.id('channelThreads'),
    userId: v.id('users'),
    projectMemberId: v.id('projectMembers'),
    actingCompanyId: v.optional(v.id('companies')),
    reason: v.union(
      v.literal('created'),
      v.literal('replied'),
      v.literal('mentioned'),
      v.literal('explicit'),
    ),
    preference: v.union(v.literal('following'), v.literal('unfollowed')),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_project', ['projectId'])
    .index('by_group', ['groupId'])
    .index('by_group_project_member_preference', ['groupId', 'projectMemberId', 'preference'])
    .index('by_thread_project_member', ['channelThreadId', 'projectMemberId'])
    .index('by_project_member_preference', ['projectMemberId', 'preference'])
    .index('by_thread_preference', ['channelThreadId', 'preference']),

  channelThreadReadStates: defineTable({
    projectId: v.id('projects'),
    groupId: v.id('groups'),
    channelThreadId: v.id('channelThreads'),
    userId: v.id('users'),
    projectMemberId: v.id('projectMembers'),
    actingCompanyId: v.optional(v.id('companies')),
    lastReadChannelSequence: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_project', ['projectId'])
    .index('by_thread_project_member', ['channelThreadId', 'projectMemberId'])
    .index('by_project_member_thread', ['projectMemberId', 'channelThreadId'])
    .index('by_group_project_member', ['groupId', 'projectMemberId']),

  groupReadStates: defineTable({
    projectId: v.id('projects'),
    groupId: v.id('groups'),
    userId: v.id('users'),
    projectMemberId: v.optional(v.id('projectMembers')),
    lastReadMessageId: v.optional(v.id('messages')),
    lastReadAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_user_group', ['userId', 'groupId'])
    .index('by_project_member_group', ['projectMemberId', 'groupId'])
    .index('by_user_project', ['userId', 'projectId'])
    .index('by_group', ['groupId'])
    .index('by_project', ['projectId']),

  lastActiveContexts: defineTable({
    userId: v.id('users'),
    actingCompanyId: v.optional(v.id('companies')),
    projectMemberId: v.optional(v.id('projectMembers')),
    projectId: v.optional(v.id('projects')),
    groupId: v.optional(v.id('groups')),
    deviceId: v.optional(v.string()),
    platform: v.optional(v.union(v.literal('web'), v.literal('ios'), v.literal('android'))),
    updatedAt: v.number(),
  })
    .index('by_user', ['userId'])
    .index('by_user_device', ['userId', 'deviceId']),

  typingIndicators: defineTable({
    projectId: v.id('projects'),
    groupId: v.id('groups'),
    userId: v.id('users'),
    projectMemberId: v.optional(v.id('projectMembers')),
    activity: v.optional(
      v.union(v.literal('typing'), v.literal('attaching'), v.literal('recording')),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_project', ['projectId'])
    .index('by_group_updated_at', ['groupId', 'updatedAt'])
    .index('by_group_user', ['groupId', 'userId'])
    .index('by_group_project_member', ['groupId', 'projectMemberId'])
    .index('by_user', ['userId']),

  attachments: defineTable({
    projectId: v.id('projects'),
    groupId: v.id('groups'),
    messageId: v.id('messages'),
    channelThreadId: v.optional(v.id('channelThreads')),
    storageId: v.id('_storage'),
    filename: v.string(),
    contentType: v.string(),
    size: v.number(),
    kind: v.optional(attachmentKind),
    durationMs: v.optional(v.number()),
    previewStorageId: v.optional(v.id('_storage')),
    previewStatus: v.optional(mediaPreviewStatus),
    previewErrorCode: v.optional(mediaPreviewErrorCode),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    previewWidth: v.optional(v.number()),
    previewHeight: v.optional(v.number()),
    uploadedBy: v.id('users'),
    uploadedByProjectMemberId: v.optional(v.id('projectMembers')),
    actingCompanyId: v.optional(v.id('companies')),
    extractionStatus: v.union(
      v.literal('preserved'),
      v.literal('pending'),
      v.literal('extracted'),
      v.literal('failed'),
    ),
    createdAt: v.number(),
  })
    .index('by_project', ['projectId'])
    .index('by_message', ['messageId'])
    .index('by_group', ['groupId'])
    .index('by_storage', ['storageId'])
    .searchIndex('search_filename_by_project', {
      searchField: 'filename',
      filterFields: ['projectId'],
    }),

  notificationSettings: defineTable({
    userId: v.id('users'),
    globalMode: notificationMode,
    taskMode: v.optional(taskPushNotificationMode),
    previewMode: v.optional(v.union(v.literal('full'), v.literal('context'), v.literal('hidden'))),
    soundEnabled: v.optional(v.boolean()),
    badgesEnabled: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_user', ['userId']),

  groupNotificationSettings: defineTable({
    userId: v.id('users'),
    projectMemberId: v.optional(v.id('projectMembers')),
    groupId: v.id('groups'),
    mode: groupNotificationMode,
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_group', ['groupId'])
    .index('by_user_group', ['userId', 'groupId'])
    .index('by_project_member_group', ['projectMemberId', 'groupId']),

  auditEvents: defineTable({
    companyId: v.optional(v.id('companies')),
    relationshipId: v.optional(v.id('relationships')),
    projectId: v.optional(v.id('projects')),
    groupId: v.optional(v.id('groups')),
    channelThreadId: v.optional(v.id('channelThreads')),
    actorId: v.optional(v.id('users')),
    actorProjectMemberId: v.optional(v.id('projectMembers')),
    actingCompanyId: v.optional(v.id('companies')),
    entityType: v.string(),
    entityId: v.string(),
    action: v.string(),
    before: v.optional(v.any()),
    after: v.optional(v.any()),
    correlationId: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_project_created_at', ['projectId', 'createdAt'])
    .index('by_project_action_created_at', ['projectId', 'action', 'createdAt'])
    .index('by_company_created_at', ['companyId', 'createdAt'])
    .index('by_relationship_created_at', ['relationshipId', 'createdAt'])
    .index('by_group_created_at', ['groupId', 'createdAt'])
    .index('by_entity', ['entityType', 'entityId']),

  projectMemoryBoxes: defineTable({
    projectId: v.id('projects'),
    boxId: v.string(),
    runtime: v.string(),
    status: memoryBoxStatus,
    schemaVersion: v.number(),
    createdBy: v.id('users'),
    createdAt: v.number(),
    updatedAt: v.number(),
    lastUsedAt: v.optional(v.number()),
    lastContextUpdatedAt: v.optional(v.number()),
    contextWritePendingRevision: v.optional(v.number()),
    contextLength: v.optional(v.number()),
    error: v.optional(v.string()),
  })
    .index('by_project', ['projectId'])
    .index('by_box', ['boxId'])
    .index('by_status_updated_at', ['status', 'updatedAt']),

  memoryImports: defineTable({
    projectId: v.id('projects'),
    groupId: v.id('groups'),
    actorId: v.id('users'),
    actorProjectMemberId: v.optional(v.id('projectMembers')),
    actingCompanyId: v.optional(v.id('companies')),
    scope: v.optional(v.union(v.literal('project'), v.literal('channel'))),
    status: jobStatus,
    sourceKind: memoryImportSourceKind,
    sourceStorageIds: v.array(v.id('_storage')),
    sourceUrls: v.array(v.string()),
    boxScratchPath: v.optional(v.string()),
    summary: v.optional(v.string()),
    error: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index('by_project_status', ['projectId', 'status'])
    .index('by_project_created_at', ['projectId', 'createdAt'])
    .index('by_group_created_at', ['groupId', 'createdAt'])
    .index('by_status_updated_at', ['status', 'updatedAt']),

  memoryPathLocks: defineTable({
    projectId: v.id('projects'),
    path: v.string(),
    holderId: v.string(),
    expiresAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_project_path', ['projectId', 'path']),

  notificationSubscriptions: defineTable({
    userId: v.id('users'),
    projectMemberId: v.optional(v.id('projectMembers')),
    platform: v.union(v.literal('web'), v.literal('ios'), v.literal('android')),
    tokenOrEndpoint: v.string(),
    enabled: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_user', ['userId']),

  pushInstallations: defineTable({
    installationId: v.string(),
    userId: v.optional(v.id('users')),
    platform: v.union(v.literal('ios'), v.literal('android')),
    environment: pushEnvironment,
    expoPushToken: v.optional(v.string()),
    nativePushToken: v.optional(v.string()),
    enabled: v.boolean(),
    permissionState: pushPermissionState,
    appVersion: v.optional(v.string()),
    failureReason: v.optional(v.string()),
    lastSeenAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_installation_id', ['installationId'])
    .index('by_user', ['userId'])
    .index('by_token', ['expoPushToken'])
    .index('by_native_token', ['nativePushToken']),

  pushDeliveryIntents: defineTable({
    sourceKind: v.union(v.literal('message'), v.literal('task'), v.literal('company_invitation'), v.literal('project_invitation'), v.literal('test')),
    sourceId: v.string(),
    eventKind: v.string(),
    recipientUserId: v.id('users'),
    recipientProjectMemberId: v.optional(v.id('projectMembers')),
    installationId: v.id('pushInstallations'),
    idempotencyKey: v.string(),
    title: v.string(),
    body: v.string(),
    data: v.any(),
    soundEnabled: v.boolean(),
    badge: v.optional(v.number()),
    status: pushDeliveryStatus,
    attemptCount: v.number(),
    nextAttemptAt: v.optional(v.number()),
    acceptedAt: v.optional(v.number()),
    openedAt: v.optional(v.number()),
    duplicateOpenCount: v.optional(v.number()),
    terminalAt: v.optional(v.number()),
    expiresAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_idempotency', ['idempotencyKey'])
    .index('by_status_next_attempt', ['status', 'nextAttemptAt'])
    .index('by_installation_status', ['installationId', 'status'])
    .index('by_created_at', ['createdAt']),

  pushNotificationEvents: defineTable({
    sourceKind: v.union(v.literal('message'), v.literal('task'), v.literal('company_invitation'), v.literal('project_invitation'), v.literal('test')),
    sourceId: v.string(),
    eventKind: v.string(),
    eligibleRecipientCount: v.number(),
    createdIntentCount: v.number(),
    webTargetCount: v.number(),
    createdAt: v.number(),
  }).index('by_source', ['sourceKind', 'sourceId']),

  pushDeliveryAttempts: defineTable({
    intentId: v.id('pushDeliveryIntents'),
    attemptNumber: v.number(),
    status: pushAttemptStatus,
    providerTicketId: v.optional(v.string()),
    resultCategory: v.string(),
    providerLatencyMs: v.number(),
    createdAt: v.number(),
    resolvedAt: v.optional(v.number()),
  })
    .index('by_intent_attempt', ['intentId', 'attemptNumber'])
    .index('by_status_created_at', ['status', 'createdAt'])
    .index('by_ticket', ['providerTicketId']),

  contentReports: defineTable({
    projectId: v.id('projects'),
    groupId: v.optional(v.id('groups')),
    channelThreadId: v.optional(v.id('channelThreads')),
    reporterId: v.id('users'),
    reporterProjectMemberId: v.optional(v.id('projectMembers')),
    actingCompanyId: v.optional(v.id('companies')),
    targetType: contentReportTargetType,
    targetMessageId: v.optional(v.id('messages')),
    targetAttachmentId: v.optional(v.id('attachments')),
    targetAssistantStreamId: v.optional(v.id('assistantStreams')),
    targetTaskId: v.optional(v.id('tasks')),
    targetTaskCommentId: v.optional(v.id('taskComments')),
    targetTaskSuggestionId: v.optional(v.id('taskSuggestions')),
    reason: contentReportReason,
    note: v.optional(v.string()),
    status: v.union(
      v.literal('unassigned'),
      v.literal('open'),
      v.literal('reviewed'),
      v.literal('dismissed'),
      v.literal('actioned'),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_project_status', ['projectId', 'status'])
    .index('by_reporter_created_at', ['reporterId', 'createdAt']),

  accountDeletionRequests: defineTable({
    userId: v.id('users'),
    authUserId: v.optional(v.string()),
    status: v.union(v.literal('requested'), v.literal('completed')),
    requestedAt: v.number(),
    completedAt: v.optional(v.number()),
    retentionNote: v.optional(v.string()),
  })
    .index('by_user', ['userId'])
    .index('by_status', ['status']),

  assistantStreams: defineTable({
    projectId: v.id('projects'),
    groupId: v.id('groups'),
    channelThreadId: v.optional(v.id('channelThreads')),
    requesterId: v.id('users'),
    requesterProjectMemberId: v.optional(v.id('projectMembers')),
    actingCompanyId: v.optional(v.id('companies')),
    promptMessageId: v.optional(v.id('messages')),
    status: jobStatus,
    answer: v.string(),
    evidence: v.array(evidenceItem),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_project', ['projectId'])
    .index('by_group_created_at', ['groupId', 'createdAt'])
    .index('by_group_thread_created_at', ['groupId', 'channelThreadId', 'createdAt'])
    .index('by_thread_created_at', ['channelThreadId', 'createdAt']),

  securityStepUps: defineTable({
    userId: v.id('users'),
    authUserId: v.string(),
    action: v.string(),
    expiresAt: v.number(),
    createdAt: v.number(),
  })
    .index('by_user', ['userId'])
    .index('by_user_action', ['userId', 'action'])
    .index('by_auth_user_action', ['authUserId', 'action']),
})
