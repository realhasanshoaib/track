# Track

Track is a project collaboration workspace with realtime conversation,
references, and permission-aware AI assistance. Company collaboration adds peer
Relationships, shared Projects, explicit Channels, immutable Company exit
archives, and guided migration from the legacy Project model across web, mobile,
shared contracts, and Convex. Channel threads add named focused conversations,
follow and unread state, manual lifecycle controls, scoped search, and complete
web and mobile flows.

Task management adds scoped Project and Channel boards, configurable workflows,
task details and lists, conversation evidence, human-reviewed AI suggestions,
search, notifications, and essential native workflows. It operates with legacy
Projects and does not require Channel threads or Company collaboration.

Company collaboration, task management, and Channel threads are enabled by
default through independent server-authoritative controls. An exact `false`
environment override disables any one capability without changing the others.
Clients keep gated surfaces hidden until that server projection is available.

The [target product contract](./docs/PRODUCT.md) also defines dependable mobile
push. Its implemented architecture, product behavior, and release-proof boundary
are maintained in the mobile push specification and runbook.

The web, PWA, iOS, and Android apps support English and Modern Standard Arabic.
The selected language stays in the current browser or device, and Arabic derives
right-to-left layout and locale-aware formatting from one locale registry per
client.

## Repository

```text
apps/web/          TanStack Start web app and PWA
apps/mobile/       Expo Router native app
packages/shared/   Shared domain rules and theme primitives
convex/            Schema, authorization, functions, jobs, AI, and tests
docs/              Maintained product and engineering context
assets/brand/svg/  Final brand masters
```

Read [AGENTS.md](./AGENTS.md) before changing the repository. The maintained documentation is:

- [Product](./docs/PRODUCT.md): target philosophy, product model, and access
  invariants.
- [Architecture](./docs/ARCHITECTURE.md): current stack, boundaries, and data
  flow.
- [Design](./docs/DESIGN.md): interface, tokens, interaction states, and
  accessibility.
- [Roadmap](./docs/ROADMAP.md): approved target behavior that has not shipped.
- [Channel threads specification](./docs/THREADS_SPEC.md): implemented
  thread, unread, lifecycle, AI-context, and integration contract.
- [Task management specification](./docs/TASK_MANAGEMENT_SPEC.md): implemented
  task, board, AI, access, and delivery contract.
- [Company relationships specification](./docs/COMPANY_RELATIONSHIPS_SPEC.md):
  implemented Company, Relationship, shared-Project, Channel,
  access, exit, and migration contract.
- [Mobile push notification specification](./docs/MOBILE_PUSH_NOTIFICATIONS_SPEC.md):
  implemented installation, delivery, privacy, settings, and verification
  contract.
- [Mobile push notification runbook](./docs/MOBILE_PUSH_NOTIFICATIONS_RUNBOOK.md):
  environment setup, delivery operations, diagnostics, and release proof.
- [Arabic i18n and RTL specification](./docs/ARABIC_I18N_RTL_SPEC.md): bundled
  web and native catalogs, local persistence, language behavior, RTL rules, and
  proof.

## Requirements

- Node.js 24 or newer.
- pnpm 10.19.0 through Corepack.
- A Convex project.
- OAuth credentials for enabled providers.
- An OpenRouter API key for AI features.

Cloudflare and Expo accounts are needed only for their deployment paths.

## Local web setup

```bash
git clone https://github.com/hhushhas/track.git
cd track
corepack enable
pnpm install --frozen-lockfile
pnpm convex:dev
```

Keep `pnpm convex:dev` running. In another terminal:

```bash
pnpm --filter @track/web dev
```

Open `http://localhost:3000`. Convex creates the development deployment values in `.env.local`. Add the remaining auth, AI, and optional integration values documented in `.env.example`; do not copy the placeholder Convex deployment values over the generated values.

Company collaboration is enabled when `TRACK_COMPANY_MODEL_ENABLED` is absent or
set to `true`. Set it to `false` on the Convex deployment to disable Company
surfaces. The flag is server-authoritative and independent from
`TRACK_THREADS_ENABLED` and `TRACK_TASKS_ENABLED`. Archive, Company-exit,
redaction, account-deletion, and cleanup enforcement remains server-side while
Company creation surfaces are disabled.

Task routes, controls, and new-message detection are enabled when
`TRACK_TASKS_ENABLED` is absent or set to `true`. Set it to `false` to disable
them. The flag is independent from Company and thread flags; existing
conversation remains usable when tasks are disabled.

Channel threads are enabled when `TRACK_THREADS_ENABLED` is absent or set to
`true`. Set it to `false` to disable them. Threads remain fully usable when
Company collaboration or task management is disabled. The server flag hides
thread discovery, routes, creation, search, and ordinary delivery when off while
retaining lifecycle and cleanup enforcement for persisted data.

## Local mobile setup

Create the ignored operator configuration once:

```bash
cp apps/mobile/app.example.json apps/mobile/app.json
cp apps/mobile/eas.example.json apps/mobile/eas.json
pnpm --filter @track/mobile dev
```

Set the `EXPO_PUBLIC_*` values from `.env.example` for the development environment. Native OAuth, push, and store builds also require operator-owned provider configuration.

## Verification

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @track/web check:i18n
pnpm audit --prod
pnpm build
```

CI runs the same gate after a frozen install. The i18n check proves catalog
shape and translation-key integrity without a network service. The mobile
`build` script records that release builds are handled by EAS; web client, SSR,
and Worker output is built locally.

## Configuration and safety

- Copy `wrangler.example.toml` to ignored `wrangler.toml` for Cloudflare variables.
- Copy `convex.prod.env.example` to ignored `convex.prod.env` for the production deployment selector.
- Keep credentials in `.env.local`, `.credentials/`, EAS, Convex, Cloudflare, or another provider secret store.
- Never commit deployment identifiers, credentials, personal data, working logs, crash reports, or store-submission material.
- Report security vulnerabilities through GitHub private vulnerability reporting.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for contribution expectations. Track is licensed under the [MIT License](./LICENSE).
