# Mobile code map

This guide shows where to start when changing a mobile route or behavior. Keep it current when route ownership or module boundaries change.

## Follow a route

Expo Router files under `src/app/` own URL parameters, navigation groups, and route-level layout. Most screen routes are thin wrappers that render the matching workflow under `src/screens/`.

| User flow | Route entry | Workflow | Main supporting code |
| --- | --- | --- | --- |
| Project Channel conversation | `src/app/(tabs)/(home)/(projects)/conversation.tsx` | `src/screens/conversation.tsx` | `src/components/chat/`, `src/components/composer.tsx`, `src/lib/grouped-thread-items.ts`, `src/lib/attachment-upload.ts`, `src/lib/pending-messages.ts` |
| Channel thread | `src/app/(tabs)/(home)/(projects)/thread.tsx` | `src/screens/thread.tsx` | `src/components/chat/`, `src/components/thread-row.tsx`, `src/lib/grouped-thread-items.ts`, `src/lib/thread-navigation.ts` |
| Project tasks | `src/app/(tabs)/(tasks)/tasks.tsx` | `src/screens/tasks.tsx` | `src/components/task-board.tsx`, `src/components/task-list-content.tsx`, task-focused `src/lib/` modules |
| Task detail | `src/app/(tabs)/(tasks)/task.tsx` | `src/screens/task.tsx` | `src/components/task-detail-content.tsx`, `src/components/task-ui.tsx`, task-focused `src/lib/` modules |
| Project directory and detail | `src/app/(tabs)/(home)/(projects)/projects.tsx`, `project.tsx`, `project-settings.tsx` | Matching files in `src/screens/` | `src/components/projects-directory.tsx`, project-focused `src/lib/` modules |
| Home conversations | `src/app/(tabs)/(home)/conversations.tsx` | `src/screens/conversations.tsx` | `src/components/home-dashboard.tsx`, feed-focused `src/lib/` modules |

If a route file contains more than parameter parsing and screen selection, check whether the workflow belongs in `src/screens/` instead. If a screen owns several independent behaviors, look for a cohesive seam with its existing components, hooks, or pure `src/lib/` functions before adding another layer.

## Find shared code

- `src/components/` contains reusable mobile UI. `src/components/chat/` owns message and attachment presentation.
- `src/hooks/` contains stateful behavior shared by screens or components.
- `src/lib/` contains framework-independent decisions, formatting, navigation builders, and adapters. Pure rules here are the simplest place to add focused tests.
- `src/contexts/` owns app-wide user, company, and theme state.
- `src/constants/theme.ts` owns shared visual tokens.
- `src/types/` contains mobile-specific type declarations.

Keep shared domain contracts framework-independent in `packages/shared`; keep persistence and backend rules in `convex`.

## Tests and checks

Mobile tests use Vitest with a Node environment. Put focused tests beside the pure module as `*.test.ts`; test observable inputs, outputs, and failure behavior. This suite does not render React Native screens, so its passing tests do not prove full screen interactions.

Run the focused mobile checks with:

```sh
pnpm --filter @track/mobile test
pnpm --filter @track/mobile typecheck
pnpm --filter @track/mobile lint
```
