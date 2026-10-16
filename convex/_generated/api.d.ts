/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as audit from "../audit.js";
import type * as auth from "../auth.js";
import type * as crons from "../crons.js";
import type * as demoSeed from "../demoSeed.js";
import type * as diagnostics from "../diagnostics.js";
import type * as diagnostics_lookup from "../diagnostics/lookup.js";
import type * as e2eFixtures from "../e2eFixtures.js";
import type * as foundation from "../foundation.js";
import type * as groups from "../groups.js";
import type * as http from "../http.js";
import type * as invitations from "../invitations.js";
import type * as lib_actorContext from "../lib/actorContext.js";
import type * as lib_apns from "../lib/apns.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_channelMembership from "../lib/channelMembership.js";
import type * as lib_devAuth from "../lib/devAuth.js";
import type * as lib_fcm from "../lib/fcm.js";
import type * as lib_mediaPreview from "../lib/mediaPreview.js";
import type * as lib_messageUpload from "../lib/messageUpload.js";
import type * as lib_nativePush from "../lib/nativePush.js";
import type * as lib_observability from "../lib/observability.js";
import type * as lib_permissions from "../lib/permissions.js";
import type * as lib_pushDelivery from "../lib/pushDelivery.js";
import type * as lib_pushProviderTypes from "../lib/pushProviderTypes.js";
import type * as lib_pushTokens from "../lib/pushTokens.js";
import type * as lib_rateLimit from "../lib/rateLimit.js";
import type * as lib_requestAuthorization from "../lib/requestAuthorization.js";
import type * as mediaPreview from "../mediaPreview.js";
import type * as messages from "../messages.js";
import type * as mobile from "../mobile.js";
import type * as notifications from "../notifications.js";
import type * as projects from "../projects.js";
import type * as pushDelivery from "../pushDelivery.js";
import type * as pushNotifications from "../pushNotifications.js";
import type * as reports from "../reports.js";
import type * as schema_messageUploadTables from "../schema/messageUploadTables.js";
import type * as search from "../search.js";
import type * as typingIndicators from "../typingIndicators.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  audit: typeof audit;
  auth: typeof auth;
  crons: typeof crons;
  demoSeed: typeof demoSeed;
  diagnostics: typeof diagnostics;
  "diagnostics/lookup": typeof diagnostics_lookup;
  e2eFixtures: typeof e2eFixtures;
  foundation: typeof foundation;
  groups: typeof groups;
  http: typeof http;
  invitations: typeof invitations;
  "lib/actorContext": typeof lib_actorContext;
  "lib/apns": typeof lib_apns;
  "lib/audit": typeof lib_audit;
  "lib/channelMembership": typeof lib_channelMembership;
  "lib/devAuth": typeof lib_devAuth;
  "lib/fcm": typeof lib_fcm;
  "lib/mediaPreview": typeof lib_mediaPreview;
  "lib/messageUpload": typeof lib_messageUpload;
  "lib/nativePush": typeof lib_nativePush;
  "lib/observability": typeof lib_observability;
  "lib/permissions": typeof lib_permissions;
  "lib/pushDelivery": typeof lib_pushDelivery;
  "lib/pushProviderTypes": typeof lib_pushProviderTypes;
  "lib/pushTokens": typeof lib_pushTokens;
  "lib/rateLimit": typeof lib_rateLimit;
  "lib/requestAuthorization": typeof lib_requestAuthorization;
  mediaPreview: typeof mediaPreview;
  messages: typeof messages;
  mobile: typeof mobile;
  notifications: typeof notifications;
  projects: typeof projects;
  pushDelivery: typeof pushDelivery;
  pushNotifications: typeof pushNotifications;
  reports: typeof reports;
  "schema/messageUploadTables": typeof schema_messageUploadTables;
  search: typeof search;
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
