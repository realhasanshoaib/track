# Track

- `theory.md` owns the product model and its reasons. Change it when intent changes,
  not to mirror implementation.
- `tracker.yaml` owns observable outcomes, remaining work, sizing, and uncertainty.
  Keep affected entries aligned with code; regenerate the human views with `pnpm generate:tracker`.
  Do not treat missing checks as product defects.
- `design.md` owns the Stitch-compatible design system. Use it for interface changes.
- Keep pure domain rules in `packages/shared`; Convex owns authorization and
  persistence. Preserve represented Company, Project, and Channel scope throughout.
- Keep Convex schema/generated API and the TanStack route tree aligned with changes.
- Run [verification](README.md#verification); do not expand debt baselines to
  accept new violations. Load affected application flows and check their consoles.
- Keep development services on localhost. Production access, migrations, and
  deployment require explicit authorization.
- Web and Convex diagnostics follow the [Convex diagnostics recipe](https://github.com/Q9Labs/q9stack/blob/main/recipes/diagnostics-convex.md).
  Run `pnpm diag check` before an operator lookup and `pnpm diag trace <code>` for an error-page code.
