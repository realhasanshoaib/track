# Track Web UI/UX Contract and Quality Gates

Status: required project standard
Owner: Track web
Last reviewed: 2026-10-05

## Scope and authority

This contract applies to every user-facing route in `apps/web/src/routes`,
every search-parameter view, and every shared component or state users can open
from those routes. This includes public pages, sign-in, onboarding, Company and
Project workspaces, Channels, threads, tasks, Evidence, Memory, settings,
profile, search, dialogs, sheets, popovers, menus, and notifications.

The generated TanStack route tree is the route inventory. A new route or view
adds a row to the coverage record. A shared-component change must be checked on
each affected route family. Public and account pages use the same visual,
responsive, interaction, and accessibility gates, even when they do not use
the workspace shell.

Product behavior and access boundaries come from the root `AGENTS.md` and
[`DESIGN.md`](DESIGN.md). This contract defines how web screens must present
and prove that behavior. The six supplied Dribbble shots are visual references
only: borrow restraint, hierarchy, and useful project navigation; do not copy
their brands, layouts, text, direct messages, or dashboard metrics as product
requirements.

## Outcome

Track presents one calm, professional product across all public and signed-in
web surfaces. Each screen makes its purpose, current scope, main work area, and
next useful action clear without making people scan decorative summaries or
repeated containers.

The product-specific visual idea is an operational ledger: conversations,
tasks, and evidence share aligned rows and fine rules, while a restrained amber
signal marks current scope, active navigation, and actionable work. The amber
signal is never used as decoration.

## Visual references

Use these shots to discuss visual restraint, hierarchy, and project-work
patterns. They are not product specifications or proof that a flow is usable.

- [B2B Website, SaaS CRM Platform](https://dribbble.com/shots/27722186-B2B-Website-SaaS-CRM-Platform)
- [Project Management Dashboard](https://dribbble.com/shots/27062240-Project-Management-Dashboard)
- [Task.pro Task Management Dashboard](https://dribbble.com/shots/24720976-Task-pro-Task-management-dashboard)
- [Project Management Dashboard UI](https://dribbble.com/shots/27162714-Project-Management-Dashboard-UI)
- [Oripio Project Management Dashboard](https://dribbble.com/shots/27649420-Oripio-Project-Management-Dashboard)
- [Team Management Dashboard UI](https://dribbble.com/shots/27174255-Team-Management-Dashboard-UI)

## Acceptance criteria

1. Every route uses shared semantic color, spacing, type, radius, control,
   focus, and motion tokens. Feature styles do not create a competing system.
2. Company, Project, Channel, thread, task, and evidence context stays visible
   where it changes what a person can see or do.
3. Each screen has a clear hierarchy for scope, title, supporting context,
   primary action, main work, and optional secondary controls.
4. Panels mark real boundaries. Whitespace and quiet rules group ordinary
   content; nested cards, duplicate summaries, and redundant controls are removed.
5. Conversation messages use one anatomy for author, time, body, reply context,
   attachments, linked work, and actions.
6. Every action works with keyboard and pointer; touch actions do not depend on
   hover. Destructive actions state their impact and support recovery where safe.
7. Applicable routes pass every gate below at supported widths, both themes,
   200% zoom, reduced motion, realistic content, and required async states.
8. Changed routes have no browser console errors, the required repository and
   browser checks pass, and evidence is recorded for every affected route family.

## Required quality gates

Every applicable gate must pass before a web UI change is reported as done.
If a route cannot be checked because of missing data, access, or environment
setup, mark it **BLOCKED** and report the exact reason; do not mark it passed.

### Gate 1: Route and task coverage

- List every changed route, search-parameter view, shared component, and overlay.
- For each changed screen, state the user's job, main action, visible Company,
  Project, and Channel scope, and the expected successful result.
- Map the empty, loading, error, denied, archived, and recovery states that can
  occur on that screen.
- Preserve the current product model and capabilities. A visual cleanup does
  not remove a route, action, permission boundary, or task-to-source link.

**Pass evidence:** the change record names affected routes and the route-family
coverage below; no changed screen or reachable overlay is missing from it.

### Gate 2: Hierarchy and visual consistency

- Use the existing web design tokens and shared components. A route must not
  add private color, type, spacing, radius, focus, or motion values for a rule
  already owned by the design system.
- Give the screen one primary work area. Keep navigation and page headers
  stable; show a context rail only when it adds information for the current job.
- Prefer alignment, type, spacing, and a quiet divider over an outline around
  each section. A card or bordered panel must represent a real group, state, or
  interactive boundary. Do not put cards inside cards without a clear reason.
- Remove repeated labels, duplicate search/filter controls, decorative metrics,
  and activity summaries that do not help the screen's primary job.
- Keep action names and selected, unread, status, and permission states
  consistent across routes. Never use color as the only status signal.

**Pass evidence:** side-by-side captures show a shared grid, type hierarchy,
spacing rhythm, surface treatment, and active-state language across changed
routes in the same family.

### Gate 3: Interaction and feedback

- Use links for navigation and buttons for in-place actions. Custom widgets
  implement their complete keyboard and focus behavior.
- Every visible control has a clear name, purpose, and state. Hover may add
  feedback but is never the only way to find or use an action.
- Async actions show pending, success, and useful failure feedback. A recoverable
  failure keeps user input and offers a safe retry. Empty states explain what
  belongs there and provide the next useful action.
- Dialogs, sheets, menus, and popovers open, close, restore focus, and preserve
  the return path. Route-backed filters and view choices preserve URL and back
  navigation state when the product requires it.
- Motion is short and explains focus, cause, location, or completion. Reduced
  motion keeps all information and actions available without animation.

**Pass evidence:** complete the primary task with pointer and keyboard, then
check the applicable overlay, error, retry, and return paths in a real browser.

### Gate 4: Accessibility and responsive behavior

- Meet WCAG 2.2 AA for text contrast, controls, focus, semantics, and reflow.
- Keep a visible focus indicator and a logical tab order. Announce async errors
  and important state changes to assistive technology.
- Support 200% zoom and reflow at 320 CSS pixels without page-level horizontal
  scrolling. Board and table regions may scroll internally when the scroll area
  is bounded, labeled, and usable by keyboard.
- Verify 320, 390, 768, 1024, and 1440 CSS-pixel widths, plus widths adjacent to
  any changed breakpoint. No title, action, menu, rail, or field may clip or
  overlap. Coarse-pointer targets must remain comfortably tappable.
- Keep coarse-pointer targets at least 44 by 44 CSS pixels, except for inline
  text links where their surrounding line remains an easy target.
- Check both light and dark themes, long names and labels, large counts, and
  reduced motion. Text must not shrink to hide overflow.

**Pass evidence:** captures and an interaction note cover the required widths,
themes, zoom, and keyboard path for each changed route family.

### Gate 5: Real-path and regression proof

- Open every changed route in the local application with realistic development
  data and complete its main user path. Check browser console output.
- Run the full repository checks from `AGENTS.md` and `pnpm e2e` for web UI
  changes. Run any focused browser check needed for a route not covered by the
  existing E2E suite.
- Recheck every route family that shares a changed shell, component, or token.
  A passing component test does not prove the full screen or route works.
- Inspect the final diff and the evidence for unintended layout changes,
  generated files, or removed functionality.

**Pass evidence:** check results, route list, browser paths, console result, and
desktop/mobile captures are reported together. A compile or screenshot alone is
not proof that a user path works.

## Foundation contract

### Color

- Canvas: neutral porcelain, not warm cream.
- Raised surface: white in light mode and quiet graphite in dark mode.
- Text: graphite with two quieter levels.
- Rules: neutral gray with a stronger control border.
- Signal: Track amber, reserved for current scope, focus, and primary creation.
- Status colors: semantic green, red, and blue with quiet tinted backgrounds.

Components consume semantic roles such as `--surface-canvas` and
`--text-secondary`. Raw palette values are private implementation details.

### Typography

- Inter is the reading face for body copy and controls.
- Geist is the display and utility face for headings, metadata, and numbers.
- Page titles use 28px on desktop and 24px on small screens.
- Message body copy uses 14px with a 1.55 line height.
- Supporting text never falls below 11px.
- Headings use balanced wrapping and numbers use tabular figures where useful.

### Spacing and shape

- Spacing follows a 4px base scale: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64.
- Controls use 32px, 36px, or 40px heights.
- Controls use a 6px radius, cards 8px, and large panels 12px.
- Shadows are reserved for temporary overlays. Persistent panels use rules.

### Motion

- Feedback transitions take 120 to 180ms.
- Layout transitions take at most 260ms.
- Only opacity and transform animate where practical.
- Reduced motion reduces transitions to 1ms and removes nonessential animation.

## Layout contract

### Workspace

```text
Global navigation | Main workspace | Optional context rail
248px             | flexible       | 288px
```

The global navigation collapses to 48px. The context rail disappears below
1080px and becomes in-flow context. Below 820px, navigation uses the existing
mobile sheet and the main content becomes one column.

### Conversation

```text
Conversation header
Message timeline
Composer
```

The timeline has one readable content measure and consistent gutters. Messages
are rows, not independent floating cards. A thin conversation spine connects
avatars and day boundaries without reducing text contrast.

Message action order is Reply, Create task, Forward, More. Low-frequency and
destructive actions remain in More. If reactions are added later, React belongs
between Reply and Create task.

### Company and settings

Company routes retain the global navigation and use the same page-header and
content widths as Project routes. Settings use a sticky local index on desktop
and a horizontally scrollable index on small screens.

### Tasks

Task views share the same navigation density, page header, toolbar, and control
tokens as conversations. Board columns may scroll horizontally, but every drag
operation must keep its existing click or keyboard alternative.

## Route-family coverage

The exact paths come from `apps/web/src/routes` and the generated route tree.
The families below organize review; they do not permit unlisted routes to skip
the gates.

- **Public and authentication:** `/`, `/about`, `/privacy`, `/terms`,
  `/support`, `/deletion`, `/sign-in`, `/two-factor`, and `/auth/callback`.
- **Profile and onboarding:** `/profile` and `/onboarding/profile`, including
  validation, save, and recovery states.
- **Workspace home:** `/workspace`, including project search, loading, empty,
  and populated states.
- **Company hub:** `/workspace/company` overview, Projects, Threads,
  Relationships, and People views, plus `/workspace/company/settings`.
- **Company Project:** `/workspace/company-projects/$projectId` overview,
  Channels, Evidence, and relevant administration states.
- **Project and Channel:** `/workspace/projects/$projectId`,
  `/workspace/projects/$projectId/channels`,
  `/workspace/projects/$projectId/groups/$groupId`,
  `/workspace/projects/$projectId/groups/$groupId/threads/$threadId`, and
  `/workspace/projects/$projectId/settings`.
- **Project work:** `/workspace/projects/$projectId/tasks` Board, List,
  Calendar, My Tasks, Inbox, filters, and task detail; also
  `/workspace/projects/$projectId/evidence` and Project Memory.
- **Shared overlays and controls:** search, create/edit, invite, delete/archive,
  notifications, pickers, menus, dialogs, sheets, and popovers reachable from
  the routes above.

For every changed route family, record at least one populated path and each
applicable empty, loading, permission-denied, error, and success state. A route
may share screenshots with a sibling only when its layout and interaction are
the same; route-specific content and permissions still need a direct check.

## Verification

Automated checks:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm audit --prod
pnpm build
pnpm e2e
```

Browser checks:

1. Inventory the exact changed routes from the generated route tree and check
   each route directly; include the route families in the section above.
2. Check 1440px, 1024px, 768px, 390px, and 320px widths, plus changed
   breakpoints. Keep captures for the main desktop and narrow mobile views.
3. Complete each changed primary path with pointer and keyboard. Check focus,
   menus, dialogs, sheets, route return, and recoverable failure paths.
4. Check light, dark, reduced-motion, 200% zoom, long content, and applicable
   empty, loading, denied, error, and success states.
5. Confirm there are no console errors, clipped controls, page-level horizontal
   overflow, missing accessible names, or hidden focus targets.
6. Report each gate as PASS, FAIL, or BLOCKED with its evidence. Any FAIL or
   BLOCKED gate means the UI change is not done.

## Migration rule

`professional-ui.css` owns the semantic web tokens and shared visual layer.
Feature styles may own page-specific composition and behavior, but may not
redefine shared control geometry or introduce a parallel token scale. Routes
that still use legacy styles must meet the same contract; new work must not add
to that drift. Remove obsolete overrides only in a separately reviewed change
with route-family screenshot comparison.
