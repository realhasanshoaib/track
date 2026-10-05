/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as assistant from "../assistant.js";
import type * as assistantNode from "../assistantNode.js";
import type * as audit from "../audit.js";
import type * as auth from "../auth.js";
import type * as authEmails from "../authEmails.js";
import type * as busyDemoSeed from "../busyDemoSeed.js";
import type * as channelThreads from "../channelThreads.js";
import type * as channels from "../channels.js";
import type * as companies from "../companies.js";
import type * as companyMigration from "../companyMigration.js";
import type * as companyOverview from "../companyOverview.js";
import type * as crons from "../crons.js";
import type * as demoSeed from "../demoSeed.js";
import type * as e2eFixtures from "../e2eFixtures.js";
import type * as evidence from "../evidence.js";
import type * as foundation from "../foundation.js";
import type * as groups from "../groups.js";
import type * as http from "../http.js";
import type * as invitations from "../invitations.js";
import type * as lib_actorContext from "../lib/actorContext.js";
import type * as lib_ai from "../lib/ai.js";
import type * as lib_apns from "../lib/apns.js";
import type * as lib_archivedProjectSearch from "../lib/archivedProjectSearch.js";
import type * as lib_assistantAttachments from "../lib/assistantAttachments.js";
import type * as lib_attachmentTextExtraction from "../lib/attachmentTextExtraction.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_box from "../lib/box.js";
import type * as lib_channelMembership from "../lib/channelMembership.js";
import type * as lib_channelThreadPolicy from "../lib/channelThreadPolicy.js";
import type * as lib_companyActivityCopy from "../lib/companyActivityCopy.js";
import type * as lib_companyInvitations from "../lib/companyInvitations.js";
import type * as lib_companyPolicy from "../lib/companyPolicy.js";
import type * as lib_companyProjectLifecycle from "../lib/companyProjectLifecycle.js";
import type * as lib_devAuth from "../lib/devAuth.js";
import type * as lib_fcm from "../lib/fcm.js";
import type * as lib_legacyArchiveSnapshot from "../lib/legacyArchiveSnapshot.js";
import type * as lib_mediaPreview from "../lib/mediaPreview.js";
import type * as lib_memoryPolicy from "../lib/memoryPolicy.js";
import type * as lib_messageUpload from "../lib/messageUpload.js";
import type * as lib_nativePush from "../lib/nativePush.js";
import type * as lib_observability from "../lib/observability.js";
import type * as lib_permissions from "../lib/permissions.js";
import type * as lib_passwordResetEmail from "../lib/passwordResetEmail.js";
import type * as lib_projectChannelPolicy from "../lib/projectChannelPolicy.js";
import type * as lib_projectExitArchive from "../lib/projectExitArchive.js";
import type * as lib_projectExitCapture from "../lib/projectExitCapture.js";
import type * as lib_projectOverviewMetrics from "../lib/projectOverviewMetrics.js";
import type * as lib_projectSnapshotLock from "../lib/projectSnapshotLock.js";
import type * as lib_pushDelivery from "../lib/pushDelivery.js";
import type * as lib_pushProviderTypes from "../lib/pushProviderTypes.js";
import type * as lib_pushTokens from "../lib/pushTokens.js";
import type * as lib_rateLimit from "../lib/rateLimit.js";
import type * as lib_relationshipLifecycle from "../lib/relationshipLifecycle.js";
import type * as lib_requestAuthorization from "../lib/requestAuthorization.js";
import type * as lib_taskData from "../lib/taskData.js";
import type * as lib_taskEvidence from "../lib/taskEvidence.js";
import type * as lib_taskLifecycle from "../lib/taskLifecycle.js";
import type * as lib_taskModel from "../lib/taskModel.js";
import type * as lib_taskNotifications from "../lib/taskNotifications.js";
import type * as lib_taskPolicy from "../lib/taskPolicy.js";
import type * as mediaPreview from "../mediaPreview.js";
import type * as memory from "../memory.js";
import type * as memoryActions from "../memoryActions.js";
import type * as messages from "../messages.js";
import type * as mobile from "../mobile.js";
import type * as multiCompanyDemoSeed from "../multiCompanyDemoSeed.js";
import type * as notifications from "../notifications.js";
import type * as projectArchives from "../projectArchives.js";
import type * as projectExit from "../projectExit.js";
import type * as projectExitActions from "../projectExitActions.js";
import type * as projectOwnership from "../projectOwnership.js";
import type * as projects from "../projects.js";
import type * as pushDelivery from "../pushDelivery.js";
import type * as pushNotifications from "../pushNotifications.js";
import type * as relationships from "../relationships.js";
import type * as releaseConfig from "../releaseConfig.js";
import type * as reports from "../reports.js";
import type * as roleDemoSeed from "../roleDemoSeed.js";
import type * as schema_companyCoreTables from "../schema/companyCoreTables.js";
import type * as schema_companyProjectTables from "../schema/companyProjectTables.js";
import type * as schema_companyValidators from "../schema/companyValidators.js";
import type * as schema_messageUploadTables from "../schema/messageUploadTables.js";
import type * as schema_projectExitTables from "../schema/projectExitTables.js";
import type * as schema_taskAutomationTables from "../schema/taskAutomationTables.js";
import type * as schema_taskCoreTables from "../schema/taskCoreTables.js";
import type * as schema_taskValidators from "../schema/taskValidators.js";
import type * as search from "../search.js";
import type * as sharedProjects from "../sharedProjects.js";
import type * as taskArchiveMaintenance from "../taskArchiveMaintenance.js";
import type * as taskBoards from "../taskBoards.js";
import type * as taskComments from "../taskComments.js";
import type * as taskDetection from "../taskDetection.js";
import type * as taskDetectionNode from "../taskDetectionNode.js";
import type * as taskLabels from "../taskLabels.js";
import type * as taskMemoryExtraction from "../taskMemoryExtraction.js";
import type * as taskMemoryExtractionNode from "../taskMemoryExtractionNode.js";
import type * as taskNotifications from "../taskNotifications.js";
import type * as taskReminders from "../taskReminders.js";
import type * as taskSearch from "../taskSearch.js";
import type * as taskSuggestions from "../taskSuggestions.js";
import type * as tasks from "../tasks.js";
import type * as typingIndicators from "../typingIndicators.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  assistant: typeof assistant;
  assistantNode: typeof assistantNode;
  audit: typeof audit;
  auth: typeof auth;
  authEmails: typeof authEmails;
  busyDemoSeed: typeof busyDemoSeed;
  channelThreads: typeof channelThreads;
  channels: typeof channels;
  companies: typeof companies;
  companyMigration: typeof companyMigration;
  companyOverview: typeof companyOverview;
  crons: typeof crons;
  demoSeed: typeof demoSeed;
  e2eFixtures: typeof e2eFixtures;
  evidence: typeof evidence;
  foundation: typeof foundation;
  groups: typeof groups;
  http: typeof http;
  invitations: typeof invitations;
  "lib/actorContext": typeof lib_actorContext;
  "lib/ai": typeof lib_ai;
  "lib/apns": typeof lib_apns;
  "lib/archivedProjectSearch": typeof lib_archivedProjectSearch;
  "lib/assistantAttachments": typeof lib_assistantAttachments;
  "lib/attachmentTextExtraction": typeof lib_attachmentTextExtraction;
  "lib/audit": typeof lib_audit;
  "lib/box": typeof lib_box;
  "lib/channelMembership": typeof lib_channelMembership;
  "lib/channelThreadPolicy": typeof lib_channelThreadPolicy;
  "lib/companyActivityCopy": typeof lib_companyActivityCopy;
  "lib/companyInvitations": typeof lib_companyInvitations;
  "lib/companyPolicy": typeof lib_companyPolicy;
  "lib/companyProjectLifecycle": typeof lib_companyProjectLifecycle;
  "lib/devAuth": typeof lib_devAuth;
  "lib/fcm": typeof lib_fcm;
  "lib/legacyArchiveSnapshot": typeof lib_legacyArchiveSnapshot;
  "lib/mediaPreview": typeof lib_mediaPreview;
  "lib/memoryPolicy": typeof lib_memoryPolicy;
  "lib/messageUpload": typeof lib_messageUpload;
  "lib/nativePush": typeof lib_nativePush;
  "lib/observability": typeof lib_observability;
  "lib/permissions": typeof lib_permissions;
  "lib/passwordResetEmail": typeof lib_passwordResetEmail;
  "lib/projectChannelPolicy": typeof lib_projectChannelPolicy;
  "lib/projectExitArchive": typeof lib_projectExitArchive;
  "lib/projectExitCapture": typeof lib_projectExitCapture;
  "lib/projectOverviewMetrics": typeof lib_projectOverviewMetrics;
  "lib/projectSnapshotLock": typeof lib_projectSnapshotLock;
  "lib/pushDelivery": typeof lib_pushDelivery;
  "lib/pushProviderTypes": typeof lib_pushProviderTypes;
  "lib/pushTokens": typeof lib_pushTokens;
  "lib/rateLimit": typeof lib_rateLimit;
  "lib/relationshipLifecycle": typeof lib_relationshipLifecycle;
  "lib/requestAuthorization": typeof lib_requestAuthorization;
  "lib/taskData": typeof lib_taskData;
  "lib/taskEvidence": typeof lib_taskEvidence;
  "lib/taskLifecycle": typeof lib_taskLifecycle;
  "lib/taskModel": typeof lib_taskModel;
  "lib/taskNotifications": typeof lib_taskNotifications;
  "lib/taskPolicy": typeof lib_taskPolicy;
  mediaPreview: typeof mediaPreview;
  memory: typeof memory;
  memoryActions: typeof memoryActions;
  messages: typeof messages;
  mobile: typeof mobile;
  multiCompanyDemoSeed: typeof multiCompanyDemoSeed;
  notifications: typeof notifications;
  projectArchives: typeof projectArchives;
  projectExit: typeof projectExit;
  projectExitActions: typeof projectExitActions;
  projectOwnership: typeof projectOwnership;
  projects: typeof projects;
  pushDelivery: typeof pushDelivery;
  pushNotifications: typeof pushNotifications;
  relationships: typeof relationships;
  releaseConfig: typeof releaseConfig;
  reports: typeof reports;
  roleDemoSeed: typeof roleDemoSeed;
  "schema/companyCoreTables": typeof schema_companyCoreTables;
  "schema/companyProjectTables": typeof schema_companyProjectTables;
  "schema/companyValidators": typeof schema_companyValidators;
  "schema/messageUploadTables": typeof schema_messageUploadTables;
  "schema/projectExitTables": typeof schema_projectExitTables;
  "schema/taskAutomationTables": typeof schema_taskAutomationTables;
  "schema/taskCoreTables": typeof schema_taskCoreTables;
  "schema/taskValidators": typeof schema_taskValidators;
  search: typeof search;
  sharedProjects: typeof sharedProjects;
  taskArchiveMaintenance: typeof taskArchiveMaintenance;
  taskBoards: typeof taskBoards;
  taskComments: typeof taskComments;
  taskDetection: typeof taskDetection;
  taskDetectionNode: typeof taskDetectionNode;
  taskLabels: typeof taskLabels;
  taskMemoryExtraction: typeof taskMemoryExtraction;
  taskMemoryExtractionNode: typeof taskMemoryExtractionNode;
  taskNotifications: typeof taskNotifications;
  taskReminders: typeof taskReminders;
  taskSearch: typeof taskSearch;
  taskSuggestions: typeof taskSuggestions;
  tasks: typeof tasks;
  typingIndicators: typeof typingIndicators;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
