import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'
import { messageUploadTables } from './schema/messageUploadTables'
const projectRole = v.union(
  v.literal('owner'),
  v.literal('admin'),
  v.literal('staff'),
  v.literal('client'),
)
const groupKind = v.union(
  v.literal('general'),
  v.literal('internal'),
  v.literal('commercials'),
  v.literal('custom'),
)
const notificationMode = v.union(v.literal('all'), v.literal('mentions'), v.literal('none'))
const groupNotificationMode = v.union(
  v.literal('inherit'),
  v.literal('all'),
  v.literal('mentions'),
  v.literal('none'),
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
)
const contentReportReason = v.union(
  v.literal('inaccurate'),
  v.literal('unsafe'),
  v.literal('spam'),
  v.literal('harassment'),
  v.literal('privacy'),
  v.literal('other'),
)
const attachmentKind = v.union(v.literal('file'), v.literal('voice_note'))
const mediaPreviewStatus = v.union(v.literal('pending'), v.literal('ready'), v.literal('failed'))
const mediaPreviewErrorCode = v.union(
  v.literal('not_an_image'),
  v.literal('image_too_large'),
  v.literal('missing_source'),
  v.literal('processor_failed'),
)
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
  diagnosticEvents: defineTable({
    event: v.object({
      version: v.literal(1),
      traceId: v.string(),
      spanId: v.string(),
      eventId: v.string(),
      occurredAt: v.number(),
      source: v.union(v.literal('browser'), v.literal('server')),
      kind: v.union(
        v.literal('navigation'),
        v.literal('request'),
        v.literal('event'),
        v.literal('error'),
        v.literal('span'),
      ),
      name: v.string(),
      status: v.union(v.literal('unset'), v.literal('ok'), v.literal('error')),
      level: v.union(v.literal('info'), v.literal('warning'), v.literal('error')),
      parentSpanId: v.optional(v.string()),
      journeyTraceId: v.optional(v.string()),
      durationMs: v.optional(v.number()),
      requestId: v.optional(v.string()),
      attributes: v.optional(v.record(v.string(), v.union(v.string(), v.number(), v.boolean()))),
      errorClass: v.optional(v.string()),
      safeMessage: v.optional(v.string()),
      safeStackFrames: v.optional(
        v.array(
          v.object({
            file: v.string(),
            line: v.number(),
            column: v.optional(v.number()),
            function: v.optional(v.string()),
          }),
        ),
      ),
    }),
    traceId: v.string(),
    eventId: v.string(),
    journeyTraceId: v.optional(v.string()),
    occurredAt: v.number(),
    receivedAt: v.number(),
    subjectId: v.string(),
    sourceSurface: v.literal('web'),
  })
    .index('by_trace_occurred_at', ['traceId', 'occurredAt'])
    .index('by_trace_event', ['traceId', 'eventId'])
    .index('by_journey_occurred_at', ['journeyTraceId', 'occurredAt'])
    .index('by_subject_received_at', ['subjectId', 'receivedAt'])
    .index('by_received_at', ['receivedAt']),
  diagnosticIngestRequests: defineTable({
    subjectId: v.string(),
    receivedAt: v.number(),
    acceptedCount: v.number(),
  })
    .index('by_subject_received_at', ['subjectId', 'receivedAt'])
    .index('by_received_at', ['receivedAt']),
  ...messageUploadTables,
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
    createdBy: v.id('users'),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_created_by', ['createdBy']),
  projectMembers: defineTable({
    projectId: v.id('projects'),
    userId: v.id('users'),
    role: projectRole,
    status: v.optional(v.union(v.literal('active'), v.literal('removed'))),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_project', ['projectId'])
    .index('by_project_status', ['projectId', 'status'])
    .index('by_user', ['userId'])
    .index('by_project_user', ['projectId', 'userId']),
  groups: defineTable({
    projectId: v.id('projects'),
    kind: groupKind,
    name: v.string(),
    status: v.optional(v.union(v.literal('active'), v.literal('archived'))),
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
      v.union(
        v.literal('active'),
        v.literal('removed'),
      ),
    ),
    endedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_group', ['groupId'])
    .index('by_project_user', ['projectId', 'userId'])
    .index('by_user', ['userId'])
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
    channelSequence: v.optional(v.number()),
    idempotencyKey: v.optional(v.string()),
    body: v.string(),
    mentions: v.array(v.id('users')),
    mentionedProjectMemberIds: v.optional(v.array(v.id('projectMembers'))),
    attachmentIds: v.array(v.id('attachments')),
    replyToMessageId: v.optional(v.id('messages')),
    forwardedFrom: v.optional(forwardedMessageSnapshot),
    notificationPreview: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_group_created_at', ['groupId', 'createdAt'])
    .index('by_group_channel_sequence', ['groupId', 'channelSequence'])
    .index('by_author_idempotency', ['authorProjectMemberId', 'idempotencyKey'])
    .index('by_project_created_at', ['projectId', 'createdAt'])
    .searchIndex('search_body_by_project', {
      searchField: 'body',
      filterFields: ['projectId'],
    }),
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
    .index('by_group', ['groupId']),
  lastActiveContexts: defineTable({
    userId: v.id('users'),
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
    .index('by_group_updated_at', ['groupId', 'updatedAt'])
    .index('by_group_user', ['groupId', 'userId'])
    .index('by_group_project_member', ['groupId', 'projectMemberId'])
    .index('by_user', ['userId']),
  attachments: defineTable({
    projectId: v.id('projects'),
    groupId: v.id('groups'),
    messageId: v.id('messages'),
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
    createdAt: v.number(),
  })
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
    .index('by_user_group', ['userId', 'groupId'])
    .index('by_project_member_group', ['projectMemberId', 'groupId']),
  auditEvents: defineTable({
    projectId: v.optional(v.id('projects')),
    groupId: v.optional(v.id('groups')),
    actorId: v.optional(v.id('users')),
    actorProjectMemberId: v.optional(v.id('projectMembers')),
    entityType: v.string(),
    entityId: v.string(),
    action: v.string(),
    before: v.optional(v.any()),
    after: v.optional(v.any()),
    correlationId: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_project_created_at', ['projectId', 'createdAt'])
    .index('by_group_created_at', ['groupId', 'createdAt'])
    .index('by_entity', ['entityType', 'entityId']),
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
    sourceKind: v.union(v.literal('message'), v.literal('test')),
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
    sourceKind: v.union(v.literal('message'), v.literal('test')),
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
    reporterId: v.id('users'),
    reporterProjectMemberId: v.optional(v.id('projectMembers')),
    targetType: contentReportTargetType,
    targetMessageId: v.optional(v.id('messages')),
    targetAttachmentId: v.optional(v.id('attachments')),
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
