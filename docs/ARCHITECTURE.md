# Architecture

Status: current repository architecture. Company collaboration, task management,
and Channel threads are production capabilities behind independent,
server-authoritative controls that are enabled by default. Other approved target
changes remain in the roadmap and companion specifications.

Track is a pnpm monorepo with a TanStack Start web application, an Expo mobile application, shared TypeScript domain code, and a Convex backend.

## Runtime stack

- Node.js 24, pnpm 10.19.0, TypeScript 7.0.2.
- React 19, TanStack Start/Router, Vite, Tailwind CSS, Base UI, i18next, and
  react-i18next on web.
- Expo 55, Expo Router, and React Native on mobile.
- Convex for persistence, realtime queries, files, scheduled jobs, search, and server functions.
- Better Auth for sessions, OAuth, two-factor authentication, and the Convex auth bridge.
- AI SDK with OpenRouter for assistant model calls.
- Upstash Box for imported project-memory storage; Convex retains metadata, access state, and audit events.
- Cloudflare Workers for the web runtime and EAS for native builds.

## Package boundaries

`apps/web` owns browser routes, PWA behavior, workspace presentation, search, and browser integrations. `apps/mobile` owns native navigation and native platform capabilities. `packages/shared` contains platform-neutral Company, Project, Channel, task-policy, thread, role, notification, mention, and theme primitives. `convex` owns all persistent data and server-side authorization.

Clients may hide unavailable controls for usability, but Convex functions enforce every permission boundary. Public functions validate identity and access before reading or mutating data. Internal functions are used for trusted jobs and multi-step workflows.

Missing server release variables select the enabled product defaults. Web and
mobile keep Company, task, and thread surfaces closed until the authoritative
server projection arrives, so explicit disable overrides never fail open during
loading or offline startup.

## Core data flow

1. Better Auth establishes a session and the Convex bridge supplies its token.
2. Convex resolves the application user and project/group membership.
3. Reactive queries deliver accessible project, group, conversation, search, and notification state.
4. Mutations validate access, write the domain change, and emit audit or notification effects where required.
5. AI workflows assemble permission-filtered context, stream or persist results, and retain references.

The schema in `convex/schema.ts` is the authoritative inventory of persisted data. Shared domain constants in `packages/shared/src/domain.ts` must match schema validators.

## Client localization

The web app bundles Git-owned English and Modern Standard Arabic catalogs. One
typed locale registry owns each locale's self-name, text direction, and formatter
locale. The active browser value is stored under `track:locale:v1`; it is not an
account field and never reaches Convex. A root script applies language and
direction before paint, while the React locale provider adopts the browser value
after the stable English server render.

English and Arabic namespaces must have the same keys, interpolation variables,
and plural forms. Web checks and native catalog tests enforce that shape without
a runtime catalog backend. Browser and device language matching map regional
Arabic tags to generic `ar` for this release. Future `ar-SA` and `ar-AE` support
requires separate registry values, catalogs, and switcher entries.

Presentation formatters use the active locale, including `ar-u-nu-latn` for
Arabic language rules with `0–9` digit glyphs. Machine dates, route values, IDs,
and storage keys stay stable. Product chrome follows the locale direction;
user-authored and model content keeps its natural direction, and technical tokens
render as isolated left-to-right values.

Expo owns a separate bundled catalog and locale provider under `apps/mobile`.
It reads the device language through `expo-localization`, stores an explicit
selection through the existing device storage adapter, and derives native
direction from the same locale registry. A switch between left-to-right and
right-to-left saves first, updates `I18nManager`, and reloads once so Expo Router
headers, gestures, and app content cannot disagree. Convex never stores either
client's locale.

## Company collaboration and authorization

Company-model Projects use an explicit chain: authenticated user → active
Company membership → active or archived Project membership → exact Channel
membership or frozen archive entitlement. The central request-authorization
adapter owns this chain and the compatibility read for legacy Projects. Company
or Relationship administration never substitutes for content membership.

Companies have owner, admin, and member roles. Company-model Projects use only
manager and member roles. Relationship terms, Project-Company terms, Project
memberships, and Channel memberships retain lifecycle history instead of being
overwritten or hard-deleted. Participant revisions make unanimous removal and
archive approvals stale when eligibility changes.

Shared-Project exit is a two-phase saga. Preparation revokes live access and
captures the Project, Channel, member, task, thread, and memory cutoff state.
A Node action copies only the leaving Company's authorized Project and Channel
memory sources to immutable paths, records content hashes, and verifies the
manifest before finalization can create read-only entitlements. Provider failure
blocks finalization; cancellation retains a retryable cleanup pointer until
orphan cleanup succeeds.

Guided legacy migration records an explicit Company and neutral role for every
member, requires each mapped Company to confirm its own people, preserves every
Group membership exactly, and activates the new policy atomically. No Company
identity or neutral role is inferred from legacy roles, labels, email domains,
or Group access.

## Channel threads

Threads use `channelThreads` for lifecycle and indexed summary state, while
their replies remain ordinary `messages` with a `channelThreadId`. One
server-issued Channel sequence spans timeline and thread messages. Followers
and read cursors are keyed by exact Project membership, so one user acting for
two Companies never shares thread state across represented contexts.

Thread authorization always resolves through the parent Project and Channel.
There is no thread membership table or private-thread policy. Source links,
search, notifications, reports, assistant context, attachments, deep links,
unread aggregation, and Company-exit snapshots apply that same boundary.
Focused message history is cursor-paginated, while denormalized counters keep
thread lists and source chips bounded.

Authors may delete their own messages only while the parent Channel and, for a
reply, its thread remain writable. The mutation revalidates the authenticated
user's exact Project membership, removes unshared attachment storage, repairs
thread summary state, invalidates task and assistant evidence previews, and
emits a body-free audit event. A deleted source message never deletes its
thread.

`TRACK_THREADS_ENABLED` is independent from Company collaboration and task
management. When it is off, public reads fail closed or return empty generic
states, mutation surfaces reject thread work, and clients hide thread routes and
controls. Persisted data remains available to cleanup, redaction, account
deletion, and archive enforcement.

## AI and memory

Assistant requests start from the current group and may broaden only to other accessible project context. Model calls receive bounded conversation, attachment text, and imported memory. Results stream through Convex and cite evidence where available.

Project-memory imports are asynchronous jobs. Convex tracks import ownership and status while Upstash Box stores the imported content. Typed public and internal Convex references preserve the trust boundary between user actions and background processing.

## Mobile push delivery

One `pushInstallations` record represents an installed native app and its current
account attachment, permission state, environment, and native APNs or FCM token.
Registration atomically moves an installation between accounts, token refresh
updates the same record, and sign-out detaches it before local credentials are
removed. Web push subscriptions remain separate because their browser endpoint
lifecycle differs.

Message and task effects resolve current membership, preference, mute, and
installation eligibility into idempotent `pushDeliveryIntents`. Provider work is
batched in groups of at most 100, partitioned between direct APNs HTTP/2 requests
and Firebase Admin sends. Every attempt records a sanitized outcome; transient
network, availability, and rate-limit failures retry with bounded backoff, while
permanent token failures disable the installation. Provider acceptance never
represents proof that an operating system displayed the alert.

Native payloads contain versioned opaque route identifiers and the selected
full, context-only, or hidden preview. Full previews may include a bounded
message body or task title; terminal delivery records redact that copy. The app
freshly authorizes every destination, suppresses a foreground banner only for
the exact visible context, and persists response consumption to prevent a cold
start or remount from opening the route twice. The operational contract,
provider privacy boundary, and environment separation are documented in
[MOBILE_PUSH_NOTIFICATIONS_RUNBOOK.md](./MOBILE_PUSH_NOTIFICATIONS_RUNBOOK.md).

## Task management

Convex is authoritative for boards, workflow states, ranked tasks, labels,
references, comments, followers, activity, suggestion decisions, detection
cursors, reminders, notifications, and Company-exit snapshots. One central task
policy resolves legacy or exact Acting Company membership and rechecks Channel
access for every read and write. Project and Channel boards share the same task
model; original-scope evidence and history retain their own access boundary
after a task scope change.

New Channel messages schedule debounced, generation-safe detection jobs. The
Node task adapter routes live, bounded history, and traceable memory-import scans
through the existing OpenRouter provider. Structured output is validated before
suggestions are persisted, cursor advancement and candidate persistence share a
transaction, and durable tasks still require a human decision. The same adapter
has a deterministic fake for tests.

Web supplies Kanban/list views, routable task details, administration, Project
search, Channel panels, inline conversation cards, and suggestion review. Expo
uses state-grouped lists and status pickers, preserves task deep-link context,
and exposes no task dependency when the release flag is off.

## Generated files

- TanStack Router generates `apps/web/src/routeTree.gen.ts` from route files.
- Convex generates `convex/_generated/` from the schema and exported functions.

Regenerate these artifacts through their owning tool. Do not hand-maintain generated declarations as source design.

## Verification and delivery

CI installs with the frozen lockfile, then runs lint, typecheck, tests, the production dependency audit, and build. Web production output is generated under `apps/web/.output`. Native release builds are produced through EAS. Deployment identifiers and credentials stay in ignored local files or provider secret stores.
