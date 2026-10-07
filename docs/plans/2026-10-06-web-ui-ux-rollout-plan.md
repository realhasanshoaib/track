# Track Web UI/UX Rollout Plan

**Status:** Phase 0 in progress (36-screen census mapped; authenticated baseline and runtime flag verification remain blocked by current development access)
**Date:** 2026-10-06
**Scope:** Full user-facing web experience in apps/web
**Estimate:** 63–93 unique files across the rollout

This plan turns the route inventory and existing UI contract into a staged implementation. It covers the full web product, including public pages, workspace navigation, Company and Project surfaces, Channels, threads, tasks, evidence, search, memory, profile, and settings.

The existing [Track Web UI/UX Contract and Quality Gates](../ui-ux-professionalization.md) is binding. The earlier [Web UI/UX Remediation Plan](2026-09-14-web-ui-ux-remediation-plan.md) remains the source for detailed route, overlay, accessibility, and failure-path checks. This rollout plan organizes that coverage into implementation phases and estimates the work. It does not replace either document.

## Count and scope

The route tree contains 28 route modules: 27 file routes, including 26 user-facing routes and one auth API route, plus the root route. Four user-facing routes provide nested workspace shells; the other 22 user-facing routes render page content or a redirect. The screen count excludes the auth API route and route-shell-only modules.

Profile has three rendered panels, the Company hub has six rendered views, the represented Project has four views, and Tasks has five views. The Company hub settings value redirects to the separate Company settings page, so it is counted once. With those URL-selected views, the 22 page routes produce 36 primary route and view combinations. This count excludes drawers, dialogs, menus, loading and failure states, responsive layouts, and feature-flag variations. Those are interaction states within a screen. The existing remediation plan tracks 10 overlay families separately.

| Screen family | Count | Included surfaces |
| --- | ---: | --- |
| Public and help pages | 6 | Home, About, Support, Privacy, Terms, Deletion |
| Authentication | 3 | Sign in, two-factor, auth callback |
| Profile and onboarding | 4 | Profile panels for profile, security, and methods; onboarding profile |
| Workspace entry | 1 | Workspace home |
| Company hub and settings | 7 | Six rendered Company hub views; Company settings route |
| Company-represented Project | 4 | Overview, Channels, Evidence, Settings |
| Project workspace | 4 | Project overview, Channel directory, Evidence and Memory, Project settings |
| Conversation | 2 | Channel conversation, focused thread |
| Task workspace | 5 | Board, List, Calendar, My tasks, Suggestions |
| **Total** | **36** | Primary route and view combinations only |

Some views are gated by release configuration. The shared target defaults enable companyModel, projectSnapshots, tasks, and threads. A prior authenticated local session rendered Company, Project, Channel, thread, and task surfaces, but those screens do not prove every runtime flag value. The read-only query to dev:glad-finch-553 is currently denied by the configured CLI project access. See the Phase 0 screen census for observed routes and remaining checks.

The current feature folders contain 94 workspace, 46 Company, 30 task, and 1 profile TS, TSX, and CSS files. The thread feature has 6 such files. The shared UI folder has 30 component modules. These counts describe the codebase, including tests and supporting files; they are not the implementation target. The inspected feature areas contain 76 TSX files, plus the 30 shared UI modules, so the plan expects to reuse most existing components.

The estimated total is 63–93 unique files. Each file is assigned to one phase for the estimate, even when a shared component supports several screens. The range includes UI source and styles, focused test updates, and rollout evidence or documentation. It does not mean all 28 route modules will change. Route files mostly connect URLs to feature pages; most visual work belongs in shared shells and feature components.

## Rollout phases

| Phase | Scope | Estimated files | Completion gate |
| --- | --- | ---: | --- |
| 0. Screen census and baseline | Confirm all 36 route/view combinations, feature flags, overlays, screen jobs, primary actions, access scope, and current visual baseline. Reconcile the older remediation plan and capture representative desktop and narrow-width states. | 3–5 | Every screen has an owner, route, user job, main action, and required states in the matrix. Existing behavior and known failures are recorded before code changes. |
| 1. Design foundation and shared controls | Settle semantic color, type, spacing, shape, border, and motion tokens. Align shared buttons, inputs, selects, tabs, badges, menus, dialogs, sheets, and feedback states. Remove competing global rules where the same role has conflicting styles. | 10–14 | Shared primitives pass the visual, interaction, keyboard, focus, theme, and reduced-motion checks in the UI contract. |
| 2. Workspace shell and Company surfaces | Refine the workspace header, sidebar, rail, navigation, scope cues, workspace home, Company hub, Company settings entry, and Company-represented Project overview. Establish consistent page widths, title/action alignment, and content density. | 8–12 | The user can identify Company, Project, Channel, and current location at every shell width; primary actions and access scope stay clear. |
| 3. Channels, conversation, and threads | Refine the Channel directory, Channel conversation, message timeline, composer, message actions, attachment and voice previews, focused thread, and conversation navigation. Preserve source-message context and Channel access boundaries. | 10–14 | Send, reply, attachment, mention, thread navigation, archive, and error-recovery paths work with pointer and keyboard input; context and scope remain visible. |
| 4. Task views and task actions | Refine Board, List, Calendar, My tasks, Suggestions, filters, create flow, task detail drawer, task administration, and task notifications. Make task status, ownership, priority, dates, and source conversation easy to scan. | 8–12 | Every view preserves URL state and filters; task create, edit, move, schedule, assignment, evidence link, and failure recovery pass their route checks. |
| 5. Search, Evidence, and Memory | Refine Project and conversation search, result states, Evidence pages and previews, Memory import, source metadata, scope indicators, and return navigation. | 6–9 | Results and previews retain Company, Project, and Channel scope; loading, empty, error, unavailable, retry, and focus-return paths are clear. |
| 6. Account, settings, authentication, and public pages | Refine profile panels, onboarding, sign-in, two-factor, Company and Project settings, forms, recovery and destructive confirmations, plus public and legal pages. | 10–15 | Forms and protected actions show labels, validation, pending, success, and failure states; recovery and access boundaries remain explicit. |
| 7. Cross-screen hardening and release evidence | Check all screen families at approved widths, themes, zoom, keyboard-only, coarse pointer, forced colors, and reduced motion. Verify long content, route transitions, console/network failures, and the full repository gate. | 8–12 | Every applicable contract gate passes for all affected routes. The final route matrix contains observed pass, fail, or blocker evidence; no route is accepted from shared-shell review alone. |

The phase estimates total 63–93 unique files. They are planning ranges, not a promise that every listed file will change. Phase 0 can reduce the range by marking already-correct components as complete; it can increase the range if the browser audit finds route-specific layouts or state handling that the source inventory does not reveal.

## Candidate component owners by phase

Paths below are relative to apps/web/src. Phase 0 confirms the final file list from actual browser states. Shared files are assigned to the phase that first owns their main visual or behavior change.

- **Phase 0:** The 28 route modules under routes/, the 36-row screen census, the existing route and overlay regression matrices, and representative baseline captures. No product UI file should change in this phase. The current census maps all rows and all 10 overlay families, but the development sign-in, active flag values, legacy route baselines, and durable screenshot artifacts remain open.
- **Phase 1:** styles.css, design-system/professional-ui.css, and components/ui/. The 30 existing UI modules are candidates; change only the controls that fail the shared contract.
- **Phase 2:** features/workspace/components/WorkspaceHeader.tsx, WorkspaceSidebar.tsx, and WorkspaceRail.tsx; features/workspace/pages/WorkspacePageSurface.tsx and WorkspaceHomePage.tsx; features/company/CompanyHubPage.tsx, CompanyOverviewDashboard.tsx, CompanyProjectNavigation.tsx, and CompanyProjectOverview.tsx. These own the shared navigation frame and the main Company entry screens.
- **Phase 3:** features/workspace/pages/ProjectChannelsPage.tsx; features/workspace/components/GroupChatPage.tsx, ConversationComposer.tsx, ScopedConversationComposer.tsx, and MessageActions.tsx; features/company/CompanyProjectConversation.tsx; features/threads/ThreadConversationPage.tsx, ChannelThreadBrowser.tsx, CompanyThreadBrowser.tsx, and thread-workspace.css. These own channel discovery, conversation, composer, and thread paths.
- **Phase 4:** features/tasks/TaskProjectPage.tsx, TaskBoard.tsx, TaskListView.tsx, TaskCalendarView.tsx, TaskInbox.tsx, TaskCreateDialog.tsx, TaskDetailDrawer.tsx, TaskAdminDialog.tsx, TaskNotificationButton.tsx, task-views.css, and ui/TaskVisuals.tsx. These own the five task views and their main actions.
- **Phase 5:** features/workspace/search/ProjectSearchDialog.tsx and ChatSearchPopover.tsx; features/workspace/pages/ProjectEvidencePage.tsx; features/company/CompanyProjectEvidence.tsx; features/workspace/components/ProjectMemoryImportDialog.tsx and MediaPreview.tsx. These own search, evidence, imported memory, and source preview paths.
- **Phase 6:** features/profile/ProfileSettingsPage.tsx; features/workspace/settings/ProjectSettingsPage.tsx; features/company/CompanyForms.tsx and CompanyProjectAdministration.tsx; routes/workspace.company.settings.tsx, routes/workspace.projects.$projectId.settings.tsx, routes/sign-in.tsx, routes/two-factor.tsx, routes/auth.callback.tsx, routes/onboarding.profile.tsx, and the public or legal route files. These pages need the same shell, form, confirmation, and error rules as the core workspace.
- **Phase 7:** Focused tests near the changed components, route and overlay evidence, responsive captures, and the final browser regression matrix. Add a test or fixture when the changed behavior needs proof; do not create a duplicate test harness if the current one can cover it.

This is a candidate map, not an instruction to rewrite every named component. If an existing component passes the contract and needs no change, Phase 0 marks it complete and removes it from the implementation count.

## Rules for each phase

1. Start with the screen's user job, content hierarchy, and primary action. Then refine spacing, type, color, borders, and component details.
2. Keep the interface calm and compact enough for daily work. Use restrained surfaces and separators, consistent alignment, and clear typography. Do not add decoration that competes with project work.
3. Reuse shared primitives when the screens have the same interaction contract. Keep a local component when it represents a distinct product behavior.
4. For each changed screen, cover populated, loading, empty, error, denied, and long-content states where they apply. Check success and recovery after every important mutation.
5. Preserve URL state, Company and Project scope, Channel access boundaries, evidence provenance, and task-to-conversation links.
6. Capture before-and-after evidence at the same viewport and theme for material visual changes. Record a deliberate difference when product behavior requires it.
7. Finish and review one phase before expanding into the next. If a shared control causes a route regression, fix the owning phase before continuing.

## Phase exit checklist

A phase is complete only when all applicable items are true:

- Its screens and components meet all five gates in the UI/UX contract.
- Focused tests for changed behavior pass, and the affected browser paths have been exercised.
- Keyboard, touch/coarse pointer, narrow layouts, zoom, theme, and reduced-motion behavior are checked where applicable.
- No scope, authorization, navigation, or data behavior changed by accident.
- The focused diff contains no unrelated work, generated output, or debug code.
- The next phase can use the completed shared pieces without carrying a known visual or interaction defect.

The final phase also runs the repository gate from the web project instructions, checks the full route and overlay matrices, and reviews the final diff. If a required check cannot run, the handoff records the exact blocker and the behavior it leaves unproved.

## Phase 0 deliverable

The first implementation step is a screen census with one row per route/view combination and a linked set of overlay families. Each row records:

- Route and URL-selected view.
- User job and primary action.
- Page shell and owning feature components.
- Required data and permission scope.
- Loading, empty, error, denied, and long-content states.
- Responsive behavior and keyboard entry/exit.
- Baseline screenshot or an explicit reason no screenshot applies.
- Existing test coverage and known failures.

After this census, update the estimate using the observed component reuse. Then start Phase 1 with the shared design foundation before changing route-specific visuals.

