# Changelog

## 2026-08-11

### Added

- Added bundled English and Modern Standard Arabic catalogs to the web, PWA,
  iOS, and Android apps, with local language controls, locale-aware dates and
  numbers, and offline catalog gates.
- Added Arabic right-to-left presentation across web and native shell,
  conversation, Company, task, thread, profile, settings, auth, support, and
  notification surfaces.

### Changed

- Web direction now comes from locale metadata, mixed user content keeps its
  natural direction, and technical values remain isolated left-to-right.
- Kept language preferences client-local: browser storage on web and device
  storage on iOS and Android, with no account or Convex preference.

## 2026-07-30

### Added

- Added four high-fidelity mobile task-management concept boards covering core
  task flows, creation and editing, system states, keyboard behavior, and
  light/dark parity.
- Rebuilt the mobile task experience around those concepts with live Kanban,
  personal and all-task views, richer task cards, create and update sheets,
  checklist progress, linked context, task discussion, activity history, and
  functional loading, empty, offline, conflict, restricted, archive, and dark
  states.
- Added direct APNs and Firebase Cloud Messaging delivery for native device
  tokens, including environment-specific Apple credentials, per-device provider
  outcomes, bounded retries, invalid-token cleanup, and native Android audible
  and silent channels.
- Added full notification previews for message bodies and task titles alongside
  the existing context-only and hidden choices.

### Changed

- Retained `expo-notifications` for native permission, token, presentation, and
  tap handling while removing the Expo Push Service from backend delivery.

### Fixed

- Unified mobile theme resolution across React surfaces and native navigation
  so Project, Channel, task, and other cards update immediately with the
  selected light, dark, or system appearance.
- Kept Channel and thread composers above the native keyboard with Android
  window resizing, iOS keyboard avoidance, keyboard-aware safe-area spacing,
  interactive dismissal, and automatic focus on the latest message.
- Preserved the legacy CommonJS API required by React Native codegen while
  retaining patched `brace-expansion` limits, and linked Reanimated and Expo
  Modules Core to the deterministic Worklets prefab output used by current
  Android Gradle builds.

### Security

- Limited full preview copy to bounded APNs or FCM payloads and active retry
  intents, then redacted it from terminal delivery records. Operational metrics
  and provider attempt records remain content-free.
- Updated Better Auth and forced patched PostCSS and `brace-expansion` releases
  after the production dependency audit identified account-takeover,
  source-map traversal, and denial-of-service advisories.

## 2026-07-23

### Added

- Added author-only message deletion to Channel timelines and threads on web,
  iOS, and Android, including confirmation prompts, attachment cleanup,
  unavailable task-evidence handling, audit events, and repaired thread counts.

### Security

- Forced vulnerable transitive Sharp releases to the patched 0.35.3 line so
  Miniflare-based web tooling no longer includes the affected libvips build.

## 2026-07-18

### Added

- Implemented reliable iOS and Android push delivery with account-owned
  installations, token rotation, sign-out isolation, idempotent delivery
  intents, bounded Expo batches, retries, ticket and receipt reconciliation,
  invalid-token cleanup, latency diagnostics, and development test alerts.
- Added contextual notification education, denial recovery, global conversation
  and task defaults, privacy-safe preview controls, sound and badge settings,
  exact message/thread/task routing, persistent duplicate-open suppression, and
  exact-context foreground suppression.

### Fixed

- Aligned customer-facing mobile terminology with the shipped product model by
  naming collaboration spaces Channels and linked context References.
- Development bypass sign-in now establishes its credential-backed mobile
  session before entering the app, and sheet form fields expose stable native
  accessibility labels for automation and assistive technology.
- Android notification channels now use the platform default sound without
  asking Expo to resolve a nonexistent custom sound resource.

### Security

- Removed conversation and task content from native push payloads. Expo receives
  only the selected sender and work-location context plus opaque authorization
  identifiers; environments are matched explicitly and sign-out fails closed if
  the device cannot be detached safely.

## 2026-07-17

The combined Company, task-management, Channel-thread, and supporting UI work
ships with independent server-authoritative controls enabled by default.

### Added

- Default-on Company, task-management, and Channel-thread release controls
  across web, mobile, and Convex, with exact independent disable overrides.
- Framework-independent domain contracts, additive Convex schema and generated
  declarations, authenticated actor resolution, and a central legacy/Company
  Project and Channel policy seam without enabling the feature domains.

- Task management across shared contracts, Convex, web, and mobile,
  including scoped boards and workflows, ranked tasks and subtasks, labels,
  comments, evidence, activity, task search, notification feeds, due reminders,
  Company-exit archives, and legacy/Company authorization.
- Human-reviewed task suggestions from automatic Channel detection, explicit
  assistant requests, bounded history scans, and traceable memory imports through
  the existing model provider and a deterministic fake test adapter.
- Web Kanban/list planning, routable task details, keyboard movement, task
  administration, conversation cards, and URL filters; plus native state-grouped
  task lists, editing, Inbox decisions, deep links, long-press creation, and
  inline cards.
- Channel threads across web and mobile, including direct and
  source-message creation, focused paginated conversation, follow and unread
  state, source links, manual archive and reopen, scoped search, reporting,
  attachments, voice notes, assistant invocation, and exact deep links.
- Server-issued Channel ordering, bounded thread summaries, follower-only
  delivery, exact represented-membership mentions, and Company-exit thread
  snapshots without introducing a task-management dependency.
- Conditional thread-to-task creation, inline task cards, grounded suggestions,
  search, migration reconciliation, and Company-exit task snapshots when both
  independently controlled releases are enabled.
- Company collaboration across web and mobile, including private
  Company discovery, memberships, peer Relationships, shared Project proposals,
  explicit Channels, represented identity, and Company-aware conversation.
- Unanimous Relationship removal and Project or Channel archive lifecycles with
  participant-revision protection against stale approvals.
- Two-phase shared-Project exit with immediate live revocation, exact read-only
  entitlements, immutable scoped-memory snapshots, verified hashes, safe cancel,
  and retryable orphan cleanup.
- Owner-led guided migration that maps every legacy member explicitly, requires
  counterpart confirmation, preserves exact Group membership, and activates
  neutral Project roles atomically.

### Security

- Central authenticated-actor and Project/Channel authorization adapters now
  protect conversation, attachment, search, audit, report, notification,
  assistant, memory, typing, read-state, and mobile paths without trusting
  caller-supplied user identifiers.

### Fixed

- Workspace header avatars, composer participant copy, and people mentions now
  share the selected Channel's active membership projection, including valid
  status-less legacy rows while excluding ended, inactive, missing,
  other-Channel, and stale transition results.
- Rebuilt the authenticated web visual system around the approved conversation-led UI direction, with denser amber-accent navigation, Channel view tabs, live reference/task/thread rail sections, shared state rings, priority marks, avatars and evidence connectors, prototype-shaped board cards and grouped task rows, a compact editable task drawer, and aligned Company and thread surfaces across desktop and responsive layouts.
- Local demo authentication now establishes a credential-backed Better Auth
  session before resolving its provisioned developer user through Convex, while
  remaining exact-opt-in and restricted to loopback development URLs.
- Company-exit archives now retain only active entitlements and frozen member,
  Channel, thread, and message metadata in archive views and search.
- Company-aware message delivery now uses exact membership overlap for
  forwarding disclosure and generates Company workspace push destinations.
- Task assignment now validates the complete active Company membership chain;
  late successful detection leases can commit safely, and workflow-category
  changes reconcile terminal state and due reminders.
- Archived tasks can be restored by an active-scope task administrator, while
  archived boards freeze task writes and hide their tasks from normal lists.
- Board and task archive transitions now cancel or restore eligible reminders,
  and read-only Company-exit participants cannot mutate task comments or follow
  state.
- Subtasks now remain on their parent board, and parent-board moves plus workflow
  state removal reconcile every affected due reminder.
- Channel-scoped imports retain bounded evidence for authorized task extraction;
  Channel participant changes invalidate stale archive votes, and
  archive-pending Channels are read-only on web and mobile.
- Company reactivation, direct Company routes, and message composer behavior
  now fail closed when their release or send operation is unavailable.

## 2026-07-16

- Reframed Track's target philosophy around conversation-led communication and first-class task management: peer Companies collaborate through Projects, Channels, Discord-style threads, scoped memory, and human-confirmed AI work.
- Split Channel threads into an independent implementation specification, kept task management conditionally thread-compatible, and added threads plus WhatsApp-style mobile push notifications to the roadmap.
- Expanded the approved memory direction so imports may declare Project or Channel scope and explicit scans produce same-scope task suggestions.

## 2026-07-13

- Completed the production removal of Records, Draft Records, AI review, and record exports by retiring the legacy Convex functions, data, fields, audit entries, and obsolete assistant prompts.
- Updated Better Auth to 1.6.15 across the monorepo so Convex production bundles build successfully with the current Kysely dependency.
- Removed invitation emails and audit history from the web workspace rail, stopped fetching both datasets there, collapsed the rail by default, kept notification settings accessible beneath its expand control, and cleared the route's mention-rendering key warning.

## 2026-07-12

- Specified the approved first-class task-management direction: multiple project and Channel boards, task suggestions grounded in chat, human confirmation, live conversation cards, scoped collaboration, permissions, web and mobile behavior, backend boundaries, and phased verification.
- Specified the approved first-class Company direction: multi-company Relationships, consent-based shared Projects, neutral roles, explicit Channel access, private discovery, peer governance, retained read-only history, guided legacy migration, task integration, and phased verification.

## 2026-07-11

- Added keyboard-aware mobile email/password sign-in with two-factor completion for reusable store-review and team access.
- Removed unused overlay and legacy external-storage permissions from Android release manifests.
- Replaced overlapping product, specification, design, and user-story monoliths with maintained product, architecture, design, and roadmap documentation plus a repository-level agent guide.
- Removed Records, Draft Records, AI review, and record exports from the product model and live application while preserving conversation, evidence, assistant, memory, search, and audit workflows.
- Resolved the code-quality backlog by modularizing workspace UI responsibilities, restoring typed Convex memory calls, surfacing retryable mobile failures, adding a web not-found experience, and moving the workspace to stable TypeScript 7.0.2.
- Hardened local tooling with warning-free pnpm configuration, Nitro-aware preview and Wrangler settings, and consistent Convex environment aliases.
- Removed obsolete prototypes, starter utilities and assets, demo fixtures, unused UI components, sign-in experiments, and logo-generation tooling while retaining the final brand masters.
- Removed internal work logs and operator-owned deployment configuration from version control, added public configuration templates, and sanitized documented environment values.
- Added open-source project documentation, community policies, and dependency automation.
- Updated vulnerable production dependencies and added a clean production dependency audit to CI.

## 2026-06-05

- Added the Phase 1 project memory substrate with Upstash Box pointers, memory import jobs, scoped memory tools, context gateway checks, scoped run-view cleanup, audit events, fake-adapter tests, and Convex import/audit regression coverage.
- Added bounded `context.md` loading to Track Assistant prompts and a web import dialog for pasted context, links, and files.
- Fixed Track Assistant prod memory answers by moving model work to a Node action, routing text prompts through OpenRouter REST, and skipping oversized image attachments before provider rejection.

## 2026-06-04

- Fixed production Google sign-in by ensuring the Cloudflare Worker and browser client have the Convex production URLs and by explicitly following the OAuth redirect returned by Better Auth.
- Added local Track Assistant text extraction for `.docx` and plain text attachments so common documents can be read even when the model file reader rejects uploaded files.

## 2026-05-23

- Fixed mobile sign-out and delete-account crashes by removing automatic native notification permission checks from auth startup.
- Added native auth-session restore handling so the mobile app does not redirect to sign-in while a persisted Better Auth session is still rehydrating.

## 2026-05-17

- Replaced the mobile app icon, splash, in-app mark, Android adaptive icon layers, favicon, and sign-in Google icon with assets derived from the official web Track logo set.
- Polished the mobile sign-in surface, icon buttons, row icons, conversation bubbles, account actions, and scrollable option sheets, including an exposed Sign out action.

## 2026-05-16

- Implemented the mobile v1 conversation scope with native Project/Group navigation, unread counts, conversation composer, attachments, voice notes, Track Assistant answers, reporting, notification preferences, account deletion, Apple sign-in configuration, and store-readiness notes.
- Added mobile backend contracts for Project/Group lists, read state, native push token registration/delivery, content reports, last active context, and account deletion requests.
- Added public Terms and in-app Privacy/Terms/Support access for mobile store review readiness.

## 2026-05-01

- Decomposed the workspace page into focused chat, sidebar, header, rail, search, records, settings, and hook modules.
- Added regression coverage for route state, record filtering, search result shaping, mentions, message sending, and notification body copy.
- Improved workspace notification diagnostics, pending attachment handling, project record export flows, and assistant/chat data shaping.
- Added a production Convex deploy selector so `pnpm convex:deploy:prod` uses the operator's production environment file even when local development values are present.

## 2026-04-29

- Added email/password access next to Google sign-in, including new-email account creation and the Google-proof flow for adding a password to an existing Google account.
- Added profile onboarding and profile settings for display name, designation, timezone, avatar, and bio.
- Added optional two-factor setup with authenticator apps, trusted devices, backup-code verification, and Track step-up freshness storage for sensitive actions.
- Polished profile settings UI with workspace navigation, provider icons, a custom timezone picker, 2FA status summaries, and richer teammate hover cards.
- Refined profile settings polish with flatter navigation, cleaner tab styling, top-aligned 2FA actions, member avatar URLs in hover cards, and avatar-derived card banners.
- Flattened profile onboarding into a single form surface and wired project export actions through a reusable two-factor step-up prompt.
- Reworked protected-action verification into a non-blocking floating 2FA panel and added a security-settings reset for the 10-minute grace period.
- Cleaned up the security settings hierarchy and showed stored profile photos in message row avatars.
- Enforced export 2FA step-up on the server and preserved 2FA state during workspace auth sync so CSV/PDF exports cannot bypass the prompt.
- Refined the sign-in screen into a flatter split layout with cleaner inputs, password visibility toggles, a single-line divider, clearer branding, and an icon-led email action.
- Added two interactive sign-in comparison routes with animated Track conversation previews for evaluating live-message entrance treatments.
- Improved the option B sign-in preview with transparent logo artwork, a higher page anchor, more conversation rows, and an infinite masked feed animation.
- Promoted the option B conversation-feed sign-in experience to the official `/sign-in` page.
- Updated privacy language for email/password auth, two-factor data, and expanded profile fields.
