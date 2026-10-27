# Track

Project conversation, tasks, and evidence-grounded assistance in one workspace.

- [theory.md](theory.md): the model, vocabulary, reasons, and scope.
- [Human tracker](tracker-human.md) · [searchable browser view](tracker-human.html):
  generated from [tracker.yaml](tracker.yaml), the single editable outcome source.
- [design.md](design.md): the Google Stitch-compatible design system.

## Reading the tracker

Run `pnpm serve:tracker` for a read-only browser at `http://127.0.0.1:4174`.
It reads the current YAML on each request. Set `TRACKER_PORT` if that port is in use.
After editing `tracker.yaml`, run `pnpm generate:tracker` to refresh both saved
views. `pnpm check:tracker` rejects stale views; `pnpm test:tracker` checks the
schema, generation, escaping, and read-only serving boundaries.

## Development

Use Node 24 and the pnpm version pinned in `package.json`. Start from a development
Convex project; [.env.example](.env.example) describes provider configuration.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm convex:dev
```

Convex writes development selectors to `.env.local`; add the remaining values
without overwriting them with placeholders. Keep Convex running. In another
terminal, configure development-only redirects/helpers and start the web client:

```bash
pnpm exec convex env set SITE_URL http://localhost:3000 --deployment dev
pnpm exec convex env set BETTER_AUTH_URL http://localhost:3000 --deployment dev
pnpm exec convex env set DEV_AUTH_BYPASS 1 --deployment dev
pnpm --filter @track/web dev
```

Keep demo-sign-in credentials development-only and services on localhost.
For mobile, copy `apps/mobile/app.example.json` and `eas.example.json` to their
ignored `app.json` and `eas.json` counterparts, point `EXPO_PUBLIC_*` values at
development, then run `pnpm --filter @track/mobile dev`.

## Verification

Run the standards gate and application checks before handoff:

```bash
pnpm gate
pnpm lint
pnpm typecheck
pnpm test
pnpm audit --prod
pnpm build
```

Both gates check the tracker first. `pnpm gate` then runs change-aware standards
checks; `pnpm gate:full` runs all configured standards lanes.
Neither replaces the application checks. Fix failures or report the exact
blocker; do not remove or weaken tests or grow debt baselines to pass.

For application changes, verify the affected flow and browser console. Install
Chromium with `pnpm exec playwright install chromium`, then use `pnpm e2e` for
the real client and isolated local Convex fixture. `pnpm perf:fixture` measures
browser operations; `pnpm perf:build` measures the completed web build. Reports
live under `artifacts/performance`; CI preserves failed browser evidence. These
fixture timings are not production field measurements.

Maestro flows are opt-in: use `maestro test e2e/maestro/` with an installed app and
signed-in simulator/device. The mobile package's build script is not a native
release build; release builds use EAS. [.github/workflows/ci.yml](.github/workflows/ci.yml)
owns the automated matrix.

## Operator configuration

The `.example` files own local and provider setup. Keep credentials and deployment
selectors in ignored operator files or provider secret stores. Feature controls
are server-authoritative; repository defaults are not proof of live settings.
Production access, migrations, and deployment require explicit authorization.
Existing archive-search migration work is tracked in `tracker.yaml`.

[MIT License](LICENSE) · [Code of conduct](CODE_OF_CONDUCT.md).
