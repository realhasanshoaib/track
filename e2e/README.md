# Deterministic browser journeys

The curated Playwright suite runs the real web client against an ephemeral
local Convex deployment. `e2e/playwright.config.ts` starts
[`scripts/e2e/run-local-stack.mjs`](../scripts/e2e/run-local-stack.mjs), which
deploys the fixture backend, seeds scoped Projects/Channels/messages/tasks,
and starts Vite on `http://127.0.0.1:4173`. Fixture reset/seed calls are
guarded by a per-run token and only accept loopback origins.

Install the browser once, then run the journeys:

```bash
pnpm exec playwright install chromium
pnpm e2e
```

The journeys cover Better Auth demo bootstrap, a real conversation write,
Project scope switching, a source-linked task board route, archived
Channel read-only behavior, dirty task drafts during realtime updates, and
board workflow moves. The core journeys capture screenshot checkpoints;
Playwright retains traces, screenshots, and video when a test fails. CI
uploads those files as the `track-browser-evidence` artifact.

## Performance budgets

`pnpm perf:fixture` performs repeated navigation to the seeded conversation
and task routes, sends real messages through the composer, scrolls the visible
conversation surface, and records browser resource timing. Its report is
written separately for each attempt to
`artifacts/performance/fixture-performance.chromium.retry-<n>.json` and checked
against [`performance/budgets.json`](./performance/budgets.json).
Its separate guarded fixture adds 24 older messages and requires the actual
conversation scroller to overflow and move on every measured step. These are
production-build fixture timings, not production field measurements. The
performance command builds an isolated checkout and serves the Cloudflare
worker locally through Wrangler, using the same deterministic Convex backend.
It signs in through normal email authentication; the development demo bypass
remains disabled in the production build. Browser journeys still use Vite dev.

The report labels only browser-observable values: route/task/send/scroll
durations, same-origin resource entry count and transfer/encoded bytes, and
the raw resource entries used to calculate those totals. It does not claim
database document counts or internal subscription totals.

`pnpm perf:build` measures the production web output after `pnpm build`,
including public bytes, JavaScript bytes, largest JavaScript asset, stylesheet
bytes, and route-oriented asset totals. These JSON files are CI evidence, not
durable application telemetry, and contain no message bodies or credentials.
