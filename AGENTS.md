# Track repository guide

Track is a pnpm monorepo for a project communication and task-management
application. The web client and mobile client share domain contracts, while
Convex owns persistence and backend functions.

## Product philosophy

Track unifies Project communication and task management so teams do not need a
chat product beside Linear, Jira, or another work tracker. Conversation leads:
tasks are first-class and manually creatable, but discussion is their default
source of context, and conversation-derived tasks retain durable links to the
messages and evidence that produced them. Board, list, task-detail, Channel, and
thread surfaces are views of the same Project work, so ownership and status
changes stay visible and actionable without copying context between tools.

Companies collaborate through Projects and explicitly joined Channels. A
Discord-style thread is a focused conversation inside one Channel and inherits
that Channel's access boundary; Track has no direct-message surface outside
Projects and Channels. Imported memory is explicitly Project- or Channel-scoped,
and every retrieval, task, AI run, and evidence preview preserves that scope.

Future communication sources may include inline video conferencing and
transcripts, with human-confirmed task extraction or assignment from that
material. Those conferencing capabilities are not part of the approved thread
or task-management releases; architecture should preserve an extensible,
permission-aware evidence boundary without introducing speculative meeting
infrastructure.

## Repository map

- `apps/web`: TanStack Start web application.
- `apps/mobile`: Expo mobile application.
- `packages/shared`: framework-independent domain helpers and contracts.
- `convex`: schema, queries, mutations, actions, and backend tests.
- `docs`: target product, current architecture, design, specifications, and
  roadmap documentation.

## Local setup

Use Node 24 and pnpm. Copy `.env.example` to `.env.local`, then provide a
development Convex deployment and the authentication values described in the
template.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

The web application runs on `http://localhost:3000`. Keep development services
bound to localhost.

## Required verification

Run the complete gate before handing off a change:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm audit --prod
pnpm build
```

Load the affected application locally after the automated gate passes. Verify
the changed route or workflow and check the browser console for errors.

Never remove, skip, or weaken a failing test to make the gate pass. Fix the
failure or report the exact blocker.

## Web UI/UX contract

All user-facing work in `apps/web` MUST follow the [Track Web UI/UX Contract
and Quality Gates](docs/ui-ux-professionalization.md). It applies to every
route, shared component, overlay, async state, and responsive layout. Each
changed route MUST pass every applicable gate with browser and interaction
evidence; checking only the shared shell does not prove every route. The
generated route tree is the source of truth for route coverage.

## Change boundaries

- Preserve unrelated work in a dirty worktree.
- Keep shared domain contracts in `packages/shared` free of framework imports.
- Keep Convex schema and generated API declarations aligned with backend code.
- Regenerate the TanStack route tree when routes change.
- Update current documentation when product behavior or architecture changes.
- Do not deploy or access production systems without explicit approval.
- Do not commit secrets, local environment files, generated build output, or
  scratchpad session logs.

## Product boundary

Track's target model centers on Companies, Projects, Channels, threads,
conversation, evidence, tasks, boards, search, assistant responses, and scoped
memory. Records, Draft Records, general AI review queues, record exports, and
direct messages are outside the product model. Do not reintroduce those concepts
without an approved product decision.
