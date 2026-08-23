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
pnpm exec convex env set SITE_URL http://localhost:3000 --deployment dev
pnpm exec convex env set BETTER_AUTH_URL http://localhost:3000 --deployment dev
pnpm exec convex env set DEV_AUTH_BYPASS 1 --deployment dev
```

These variables are for the development deployment only. The first two keep
email sign-in redirects on the local web app, and the last enables the local
development auth helpers. If the demo sign-in button is enabled, its
`VITE_DEV_AUTH_BYPASS` values belong in `.env.local` and should use a
development-only password.

Then start the web app:

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

Set the `EXPO_PUBLIC_*` values from `.env.example` for the development environment. Native browser OAuth requires a dedicated HTTPS `EXPO_PUBLIC_MOBILE_AUTH_CALLBACK_URL`. The callback host must publish Apple `apple-app-site-association` and Android `assetlinks.json` records for the release identifiers before a production build can sign in. Track exchanges the callback's short-lived, single-use token for a session inside secure app storage, so custom-scheme callbacks are not accepted. Native OAuth, push, and store builds also require operator-owned provider configuration.

## Verification

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm audit --prod
pnpm build
```

CI runs the same gate after a frozen install. The mobile `build` script records that release builds are handled by EAS; web client, SSR, and Worker output is built locally.

## Configuration and safety

- Copy `wrangler.example.toml` to ignored `wrangler.toml` for Cloudflare variables.
- Copy `convex.prod.env.example` to ignored `convex.prod.env` for the production deployment selector.
- Set the production Convex `SITE_URL` and `BETTER_AUTH_URL` values to the exact
  public HTTPS web origin. Non-loopback HTTP origins and path-scoped auth URLs
  are rejected, and production no longer trusts localhost origins.
- Run production Convex deployments only with an exact target confirmation:

  ```sh
  CONFIRM_CONVEX_PRODUCTION_DEPLOYMENT=prod:your-deployment pnpm convex:deploy:prod
  ```

  The command rejects missing, non-production, or mismatched deployment selectors before it invokes Convex.
- Keep credentials in `.env.local`, `.credentials/`, EAS, Convex, Cloudflare, or another provider secret store.
- Never commit deployment identifiers, credentials, personal data, working logs, crash reports, or store-submission material.
- Report security vulnerabilities through GitHub private vulnerability reporting.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for contribution expectations. Track is licensed under the [MIT License](./LICENSE).
