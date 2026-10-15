# Track web UI/UX parity audit

Date: 2026-09-14  
Scope: `apps/web` desktop dashboard, all discovered routes, dialogs, sheets, popovers, disclosures, shared controls, and the supplied Figma file.  
Standard: repository UI standard, Vercel Web Interface Guidelines, WCAG 2.2 AA, and the existing Track visual language.

## Verdict

This audit is not closed. The web application has a coherent classical-minimal shell on the main Company, Project, Conversation, Evidence, and Task surfaces, but full Figma parity is unproved because the supplied Figma file is not readable in this session. Two web routes also fail before rendering when the development auth identity is unavailable. The report therefore separates live evidence, source evidence, and blocked verification instead of treating every surface as complete.

## Access and evidence limits

| Area | Result | Consequence |
| --- | --- | --- |
| Figma MCP metadata | Denied with “you don't have edit access to this file”; the alternate connector also reached a plan rate limit. | No frame tree, component metadata, node dimensions, or reliable design tokens could be compared. |
| Figma browser tab | The signed-out/unsynced canvas showed only Figma chrome and no design frames. It also logged a 401 design-system request and a refused local bridge connection. | Pixel-level parity, modal coverage, and visual comparison against the file remain unverified. |
| Chrome profile `zohaibcollabze@gmail.com` | The Computer Use native pipe could not connect. No credentials were requested or exposed. | The user’s existing signed-in Chrome/Figma state could not be inspected. |
| Local web app | Playwright reached the local development app on an available port and rendered the seeded Company and Project shell. The expected port 3000 is occupied by PostgreSQL, and the Convex site allows CORS for `http://localhost:3000` but not the available port. | Desktop DOM, layout boxes, focus targets, overlays, and selected interactions were inspected only where the dev auth state was valid. |
| Development auth | `/profile` and direct Project Settings cannot establish a valid session in the recheck: the available origin is rejected by the Convex auth CORS policy, and bypassing CORS still presents the signed-out state. | Those screens and their dialogs cannot be called visually verified until the local identity bootstrap/origin is repaired or a valid test identity is supplied. |

## What was checked

The audit used route inventory, component and CSS inspection, accessibility snapshots, layout measurements, screenshots, keyboard interaction, dialog Escape behavior, console logs, and the web lint/typecheck gates. The desktop target was treated as primary; narrow widths were checked for containment, not as the design target.

Static checks found no `transition: all` or `transition-all`, image elements include alternative text and explicit dimensions, and interactive handlers are attached to native buttons/links rather than clickable generic containers. Shared Base UI Dialog, Sheet, Popover, Select, Tabs, and DatePicker primitives provide the common focus and overlay behavior. These checks do not prove contrast, screen-reader output, browser history behavior, or every breakpoint.

## Screen inventory and verification matrix

Status meanings: **Live** means the route rendered in the local browser and its key structure was inspected. **Source** means the route/component was inspected but a complete live path was not executed. **Blocked** means an observed runtime or access failure prevented verification. **Figma-blocked** means the web evidence exists but cannot be compared with the supplied design file.

| Screen | Route or component | Status | Evidence and remaining check |
| --- | --- | --- | --- |
| Sign-in | `/sign-in` | Live partial | Desktop and 320/768/1024/1440 width checks reported no document overflow. Password action has a focus ring after the audit fix. Full keyboard, error, OAuth, and high-contrast pass remains. |
| Two-factor | `/two-factor` | Source | Auth form and recovery paths are present. A valid verification code, resend state, invalid state, and focus recovery still need a real browser run. |
| Profile and appearance | `/profile` | Blocked | The page stayed on “Loading profile” while Convex emitted `dev_auth_identity_required`. Appearance System/Light/Dark controls are present in source and the shared sidebar menu was live-checked elsewhere. |
| Onboarding profile | `/onboarding/profile` | Source | Reuses `ProfileSettingsPage` in onboarding mode. Live completion and validation are not proved. |
| Company overview | `/workspace/company` | Live, Figma-blocked | Rendered with the 236px Company navigation, overview header/search, company masthead, Projects, Upcoming, People, Recent activity, notification popover, appearance menu, and no page overflow. |
| Company Projects directory | `/workspace/company?view=projects` | Live from prior desktop pass, Figma-blocked | Search, ownership states, new-project action, and empty/filter states were exercised. The supplied Figma frame remains unavailable for comparison. |
| Company Relationships | `/workspace/company?view=relationships` | Live from prior desktop pass, Figma-blocked | Relationship list, search, filters, and create disclosure were inspected. Partner boundary copy and action ownership remain the main UX contract. |
| Company People and membership | `/workspace/company?view=people` | Live from prior desktop pass, Figma-blocked | People rows, role/status presentation, invitation disclosure, and represented-Company navigation were inspected. |
| Company Settings | `/workspace/company/settings` | Live after fix, Figma-blocked | The route now uses the shared Track shell, 236px sidebar, profile/appearance/logout footer, company workspace navigation, summary strip, anchor rail, identity, membership, roles, invitations, relationships, recovery, and danger sections. Review captures are kept outside the source tree. |
| Project workspace overview | `/workspace/company-projects/$projectId?view=overview` | Live, Figma-blocked | Project identity, brief, Context Channels, participating Companies, shortcuts, and the 292px Company threads rail rendered without document overflow. |
| Channel conversation | `/workspace/company-projects/$projectId?view=channels` | Live, Figma-blocked | Channel list, unread-before-name treatment, message timeline, composer, attachment/voice/mention/emoji actions, and Company threads rail rendered with zero Track console errors. |
| Thread conversation panel | `/workspace/projects/$projectId/groups/$groupId/threads/$threadId` | Source | `ThreadConversationPage` has source context, rename/archive states, messages, reply composer, and back navigation. A valid seeded thread must be opened to verify focus, source links, and archive behavior live. |
| Project Channels directory | `/workspace/projects/$projectId/channels` | Source | `ProjectChannelsPage` and create/edit group dialog are wired. Live channel creation, archive state, and empty results are not proved in this pass. |
| Legacy Project overview | `/workspace/projects/$projectId` | Source | `WorkspacePage` renders the legacy Project overview path. It must be compared against the Company Project overview so users do not see two competing shell hierarchies. |
| Project Evidence hub | `/workspace/company-projects/$projectId?view=evidence` and `/workspace/projects/$projectId/evidence` | Live, Figma-blocked | Evidence list, source integrity/access boundary, source-type filters, empty states, Project memory tab, and right Company threads rail rendered without overflow. |
| Project Memory | Evidence hub memory tab | Live, Figma-blocked | Empty memory state and Import memory dialog rendered. Import dialog had a centered 512px box, contained scrolling, labelled text area, checkbox, active focus, and Escape close. |
| Search Hub | Project search dialog and `ProjectSearchDialog` | Live from prior desktop pass, Figma-blocked | Search dialog rendered around 630px wide with visible scope/filter controls and stable result groups. Route-preserving result navigation needs a valid result dataset for every result type. |
| Evidence Preview drawer | `ProjectEvidencePage` Sheet | Live from prior desktop pass, Figma-blocked | Right drawer showed selected quote, provenance chain, author/date/availability, linked task, and source navigation. Archived/unavailable-source states remain source-verified only. |
| Task board | `/workspace/projects/$projectId/tasks?view=board` | Live, Figma-blocked | Board heading, Backlog/To do/In progress/Done/Canceled columns, filters, New task, task settings, notifications, and bounded horizontal board scroll rendered. No page-level horizontal overflow was observed. |
| Task list | `/workspace/projects/$projectId/tasks?view=list` | Live from prior pass, Figma-blocked | List view and Project/Channel scope were exercised. Large-data rendering at 500/1000 tasks remains unmeasured. |
| My Tasks | task route with `view=my-tasks` | Source | Route state and filters are implemented. Assignee filtering and empty state need a live seeded-user pass. |
| Suggestion inbox | task route with `view=inbox` | Source | Scope, duplicate, assignee, and age filters are present. Accept/reject and duplicate handling need a live run. |
| Task detail drawer | `TaskDetailDrawer` Sheet | Live, Figma-blocked | 520px right sheet, title/description, status/priority/assignee/date controls, labels, subtasks, evidence, comments, mention input, and Escape close were inspected. The Unassigned selector stayed readable. |
| Project Settings | `/workspace/projects/$projectId/settings` | Blocked | Direct navigation produced 33+ repeated `dev_auth_identity_required` errors and no settings surface. Do not claim this screen matches Figma until the auth bootstrap is fixed. |
| Project participation and recovery | `CompanyProjectAdministration` | Live from prior desktop pass, Figma-blocked | Participation role, member access, archive approval, snapshot/retry/finalize states, and Company exit boundary rendered in the Project context rail. Failure and retry paths still need injected backend failures. |
| Public/legal/support | `/about`, `/privacy`, `/terms`, `/support`, `/deletion` | Source | Routes exist and use the shared document/page patterns. Full long-content, link, deletion-confirmation, and responsive checks remain. |

## Modal, sheet, popover, and disclosure inventory

| Overlay or disclosure | Source | Status | UX audit result |
| --- | --- | --- | --- |
| Create/Edit Project | `workspace-dialogs.tsx` | Source | Native Dialog primitive, title/description, labelled fields, cancel/save footer, async busy state, and destructive delete path are present. Need live focus-return and validation run. |
| Create/Edit Channel or Group | `workspace-dialogs.tsx` | Source | Same dialog contract as Project. Confirm that the selected Project/Channel context remains visible when opened from a dense page. |
| Invite Project member | `workspace-dialogs.tsx` | Source | Role and scope controls are present. Need live invitation success/error and first-invalid focus check. |
| Create Task | `TaskCreateDialog.tsx` | Live | Centered dialog, dimmed overlay, labelled form controls, focused first field, and contained scroll were observed. |
| Create Task from Chat | `ConversationTaskActions.tsx` | Source | Source preview and evidence-preserving task copy are present. Need live message-action opening, success toast, task link, and failure retry. |
| Task administration | `TaskAdminDialog.tsx` | Source | Board/workflow administration dialog is wired. Need live keyboard reorder and validation pass. |
| Task detail drawer | `TaskDetailDrawer.tsx` | Live | Right sheet has title/description semantics, close button, fields, comments, mention listbox, evidence, and activity. Comment placeholder is `Type @ to tag someone`. |
| Task notifications | `TaskProjectPage.tsx` | Live | Top-right popover has push preference, event-type/status filters, unread state, Clear/Mark all read, task route links, and a no-match state. |
| Project Search | `ProjectSearchDialog.tsx` | Live from prior pass | Search scope, filter grid, result groups, keyboard instructions, and result navigation are present. Assistive announcement for asynchronous result replacement still needs a screen-reader pass. |
| Chat Search | `ChatSearchPopover.tsx` | Source | Search popover is present in the workspace surface. Needs live keyboard, empty, and source-navigation verification. |
| Import Project Memory | `ProjectMemoryImportDialog.tsx` | Live | Centered dialog, Text/Links/Files choices, scope checkbox, source input, contained scroll, focus, and Escape close were observed. |
| Evidence Preview | `ProjectEvidencePage.tsx` Sheet | Live from prior pass | Source quote, provenance, metadata, unavailable state, and Open original source action are present. |
| Mobile Project controls | `WorkspacePageSurface.tsx` Sheet | Source | Right mobile sheet contains Company threads, references, and notifications. Needs a real touch/keyboard run at the approved mobile safety widths. |
| Logout confirmation | `WorkspaceSidebar.tsx` Dialog | Source | Destructive confirmation exists with explicit title, description, cancel, and logout actions. Need live sign-out and focus-return check. |
| Message actions / Forward | `MessageActions.tsx` Popover | Source | Copy, select, forward, and task actions are present in source. Need live three-dot opening, selection, and direct task creation check. |
| Date picker | `date-picker.tsx` Popover | Live from prior pass | Seven-column calendar grid, ArrowRight navigation, Enter selection, locale labels, clear/today controls, and focus styling were checked. Timezone policy is still undocumented. |
| Appearance menu | `ThemeToggle.tsx` | Live | System/Light/Dark menu items expose `role=menuitemradio`, `aria-checked`, and close behavior. Both theme visual passes remain incomplete. |
| Company management disclosures | `CompanyHubPage.tsx` | Source/live partial | Native `<details>/<summary>` disclosures cover create Company, assign Project, invite member, relationship, and danger controls. Long disclosure content and focus return need live verification. |
| Company Project administration disclosure | `CompanyProjectAdministration.tsx` | Source/live partial | Participation and lifecycle controls use a native disclosure and retain backend ownership boundaries. Failure-state copy and scroll anchoring need verification. |
| Thread create/search disclosures | `CompanyThreadBrowser.tsx`, `ChannelThreadBrowser.tsx` | Source | Native details controls are keyboard-openable. The inner tablists use `aria-selected`; add/verify roving tab focus and `aria-controls` before calling them fully conformant. |

## Findings

### P0: verification blockers

1. **Figma parity cannot be established.** The file cannot be read by either the Figma connector or the browser session. No frame, modal, token, or measured spacing claim can be compared against the supplied design. The next step is to open the file in a Chrome profile that is actually connected to the owner/editor account or grant this session viewer access.
2. **Development auth prevents direct settings/profile verification.** `dev_auth_identity_required` repeats from `auth:syncDevUser` on `/profile` and `/workspace/projects/$projectId/settings`. Fix the local identity bootstrap or provide a stable seeded identity before accepting those routes as working.

### P1: product and accessibility risks

1. **The shell has multiple workspace families.** The Company Project shell is coherent, but legacy `/workspace/projects/$projectId/*` routes still use the older WorkspacePage surface. A route-by-route migration or a documented boundary is needed so users do not see two competing sidebar, rail, and heading systems.
2. **Thread status tabs need a semantics pass.** Several thread controls use `role=tablist` and `aria-selected` but do not visibly prove `aria-controls`, roving keyboard focus, or Home/End behavior. Keep native button activation, then add the complete tab contract or use a plain button group when panels are not directly controlled.
3. **Async search and mutation announcements need one shared contract.** Loading and error text exists on many surfaces, but every dialog, search result replacement, toast, and mutation should use a named live region and preserve the first invalid field.
4. **Large collections are bounded but not measured.** Threads and task boards have bounded pages or scroll containers, but rendering, memory, and interaction latency at 500 and 1000 records remain unproved.
5. **Theme and zoom parity is incomplete.** The semantic token system is in place, but light/dark, forced-colors, 200%/400% zoom, long translated labels, and reduced-motion checks have not covered every screen and overlay.

### P2: polish and consistency

1. Keep the desktop hierarchy stable: selected Company and Project first, current scope second, primary work third, supporting rail last.
2. Keep one spacing/radius/type token ladder across Company settings, legacy WorkspacePage, task surfaces, and thread routes. Raw feature literals still exist in older CSS.
3. Replace ambiguous disclosure labels such as “Find or start a thread” with copy that states the current Channel or Project scope when the surrounding context is not visible.
4. Use the same date/time locale and timezone policy in task activity, Company invitations, thread messages, evidence timestamps, and memory imports.

## Detailed UI/UX gap register

The following findings cover the requested visual and interaction dimensions across the Company, Project, conversation, thread, knowledge, task, profile, and overlay surfaces. A finding is listed once at its clearest source location, even when the same pattern appears in several screens.

### Navigation, active states, and structure

| Severity | Surface | Gap and evidence | Required correction |
| --- | --- | --- | --- |
| P1 | Company workspace navigation | Company view controls use `aria-pressed` on buttons while Tasks and Threads use links, and the legacy workspace uses a third active-link pattern (`CompanyHubPage.tsx:470-573`, `TaskProjectPage.tsx:161-172`). The visual active state and URL state can disagree after a view change. | Use one navigation contract: route-backed views should be links with `aria-current="page"`; state-only filters should be buttons with `aria-pressed`. Keep active styling, keyboard order, and URL state identical. |
| P1 | Project and thread tabs | `ChannelThreadBrowser` uses `role="tablist"` without `aria-controls`, roving `tabIndex`, or Arrow/Home/End handling (`ChannelThreadBrowser.tsx:155-159`, `184-197`). The same pattern is reused in the rail and full Channel screen. | Either use a complete tab pattern with a controlled panel or use a labelled button group. Do not leave a visually tab-shaped control with partial tab semantics. |
| P1 | Knowledge tabs | Evidence/Memory tabs implement roving focus but do not handle the full Home/End contract symmetrically (`ProjectEvidencePage.tsx:156-162`). | Add Home and End behavior to both tabs, keep the selected tab focusable, and verify focus remains inside the visible panel after switching. |
| P2 | Legacy versus Company Project shell | `/workspace/projects/$projectId/*` still renders the older shell while Company Project routes render the newer Company shell. The sidebar width, heading scale, rail density, and action placement differ. | Complete the migration or document the boundary. A person moving from a Company Project to a legacy Project must not learn a second navigation hierarchy. |
| P2 | Mobile navigation | The mobile sidebar traps keyboard focus but does not make the rest of the page inert for assistive technology (`WorkspaceSidebar.tsx:179-198`). | Use a real modal navigation primitive or apply `inert`/aria-hidden to the background while the drawer is open. Restore focus to the invoking control after close. |

### Inputs, dropdowns, and pickers

| Severity | Surface | Gap and evidence | Required correction |
| --- | --- | --- | --- |
| P1 | All dropdowns | The app mixes raw `<select>` elements (`workspace.company.settings.tsx:162`, `CompanyForms.tsx:114,456,486,584`, `ProjectOwnershipPanel.tsx:196`), the Base UI `Select` used by workspace dialogs, and the `NativeSelect` adapter used by task/thread screens. Their arrow, menu, focus, width, and disabled-state treatments are not the same. | Choose one select primitive and one visual contract. Keep native behavior where it is required, but wrap every instance with the same height, padding, icon, focus ring, option density, and overflow rules. |
| P1 | Task assignee controls | Generic `SelectTrigger` defaults to `min-w-36 w-fit` (`components/ui/select.tsx:41-55`), while assignee controls patch width later in CSS. Long member/company labels can still compress differently between Create Task, Task Drawer, and Chat Task. | Give assignee fields a shared minimum width, `min-width: 0` text handling, an explicit truncation title, and one overflow policy. Verify Unassigned, long names, and represented-company suffixes at the narrowest desktop width. |
| P2 | Task filter toolbar | Six filters plus the archive checkbox are forced into a single horizontal scroller (`TaskProjectPage.tsx:229-269`, `styles.css:8713-8734`). There is no visible scroll affordance or grouped “More filters” state, so controls can disappear off-screen. | Group filters by priority/status/date, allow a controlled wrap or filter popover, expose the active-filter count, and preserve the same order at every width. |
| P2 | Company overview search | The primary search input has no `name` or `autoComplete` and its placeholder does not end with an ellipsis (`CompanyHubPage.tsx:590-600`). | Add a stable name, `autoComplete="off"`, and a concise example-style placeholder such as `Search projects, tasks, or people…`. |
| P2 | Thread search and create fields | Company and Channel thread inputs omit stable `name`/autocomplete metadata and use inconsistent placeholders (`CompanyThreadBrowser.tsx:129-134`, `ChannelThreadBrowser.tsx:155-162`, `178-182`, `240-247`). | Standardize field metadata and copy. Search fields should use the same height and `…` placeholder convention; create fields should explain the current Channel scope. |
| P2 | Profile form | Display name, designation, and bio inputs rely on wrapping labels but omit `name`, `autoComplete`, and example placeholders (`ProfileSettingsPage.tsx:625-740`). | Add stable form names, correct autocomplete values, and field-level errors tied with `aria-describedby`. |
| P2 | Timezone picker | The custom timezone menu is not the same primitive as the other dropdowns, its search placeholder is `Search timezone` without `…`, and option focus styling is only hover/selected (`ProfileSettingsPage.tsx:675-721`, `styles.css:1940-1981`). | Use the shared combobox/listbox behavior, add a visible `:focus-visible` state, keep the menu within the viewport, and use `Search time zones…`. |
| P2 | Date picker | DatePicker correctly exposes a grid, but its gridcell implementation, focus restoration, disabled state, and locale/timezone behavior are not covered by the broader picker contract (`components/ui/date-picker.tsx:147-204`). | Add a shared picker test matrix for keyboard, Escape, outside click, disabled dates, locale, timezone, and focus return. Use the same trigger height as task selects. |

### Hover, focus, active states, and visibility of extras

| Severity | Surface | Gap and evidence | Required correction |
| --- | --- | --- | --- |
| P1 | Message actions | Message action controls are `opacity: 0` and `pointer-events: none` until hover/focus (`styles.css:4962-4983`). There is no coarse-pointer override, so touch users do not get a visible action affordance. | Keep an always-visible overflow/action button on coarse pointers and expose the same actions by keyboard without relying on hover. |
| P1 | Custom message action focus | The focus state explicitly removes the outline (`styles.css:4985-5001`) and only changes background/color. This is weaker than the shared ring and can disappear in high-contrast themes. | Keep a consistent `:focus-visible` ring with sufficient contrast; do not use `outline: 0` unless the replacement is a measured ring. |
| P2 | Task labels | Selected labels are represented only by Button `variant` and have no `aria-pressed` (`TaskCreateDialog.tsx:138-144`, `TaskDetailDrawer.tsx:470-473`). | Add `aria-pressed`, a visible selected token, and a consistent pressed/hover/focus treatment. |
| P2 | Thread unread markers | Unread state is applied to a generic `<i aria-label>` (`CompanyThreadBrowser.tsx:204`, `ChannelThreadBrowser.tsx:150,231`). Generic elements with `aria-label` are not a reliable announcement pattern. | Put the unread text in an accessible span or include it in the link name, while keeping the dot/badge decorative. |
| P2 | Hidden task move controls | Task card move controls appear on hover/focus and are only made persistent for `hover: none` (`styles.css:9209-9229`, `9985-9995`). Their behavior differs from message actions and can shift the card footer when revealed. | Define one extra-action pattern for cards: reserve space, use an explicit overflow affordance, and keep the same keyboard/coarse-pointer behavior. |
| P2 | Company notification popover | Company overview notifications render as non-interactive list items with no View action, read state, filters, or keyboard focus management (`CompanyHubPage.tsx:602-655`). The task notification popover has a different, clickable contract. | Make each item actionable, expose read/unread state, add the required filter/clear controls, and use the shared Popover/Dialog behavior with Escape and focus return. |
| P2 | Emoji picker | The composer emoji surface uses a hand-built `role="dialog"` without `aria-modal`, focus entry, focus containment, or focus return (`ConversationComposer.tsx:316-344`). | Use a labelled popover/dialog primitive and verify keyboard traversal, Escape, outside click, and return focus to the composer. |

### Pills, badges, and status formatting

| Severity | Surface | Gap and evidence | Required correction |
| --- | --- | --- | --- |
| P2 | Status/pill family | Company state pills, Company settings pills, memory status pills, task priority chips, notification badges, and evidence scope chips each define their own radius, padding, font size, casing, and color (`company-collaboration.css:171-189`, `company-settings.css:56-60,177-179`, `styles.css:4638-4642,5642`, `task-views.css:86-94`). | Create semantic `status`, `count`, `scope`, and `filter` variants with one height/padding/radius ladder and theme-safe colors. Do not use pill geometry for unrelated controls. |
| P2 | Raw status labels | Several screens display backend enum strings directly or only replace underscores (`TaskProjectPage.tsx:258,355-357`, `ProjectEvidencePage.tsx:188`, `ProjectSettingsPage.tsx:54,112`). This produces lowercase labels such as `due_today`-derived text and inconsistent title casing. | Centralize human-readable status labels and use the same casing, wording, and color mapping in cards, filters, drawers, and notifications. |
| P2 | Counts and metadata | Many counts use 9–10px metadata fonts and different number alignment rules (`styles.css:4250-4255`, `8469-8520`, `9158-9162`). | Set a minimum readable metadata size, apply `font-variant-numeric: tabular-nums` to comparable counts, and align counts to one baseline. |

### Spacing, alignment, sizing, and layout

| Severity | Surface | Gap and evidence | Required correction |
| --- | --- | --- | --- |
| P1 | Input density | Search fields use 30px, 36px, 40px, and 42px heights across the rail, task toolbar, profile, and Company directory (`company-collaboration.css:11-37`, `company-project-navigation.css:531-534`, `styles.css:8476-8490`, `1767-1807`, `4557-4560`). | Define small/regular/large control tokens and apply them by context. Align label baseline, icon size, vertical padding, and focus ring across all fields. |
| P2 | Task board CSS ownership | Task layout is defined once in the global stylesheet (`styles.css:162-320`) and overridden again in `features/tasks/task-views.css` and later global blocks (`styles.css:8533-8738`, `9146-9230`). Cascade order, not component ownership, decides the final board dimensions. | Move task-specific rules into `task-views.css`, remove superseded global rules, and keep one source of truth for column/card/drawer sizing. |
| P2 | Thread layout CSS ownership | Thread route, rail, and message styles are defined in both `styles.css` and `features/threads/thread-workspace.css`. Their max widths, padding, and header rules differ by route. | Consolidate thread tokens and layout rules so Channel thread, focused thread, and Company thread rail share the same header, message, composer, and rail rhythm. |
| P2 | Project context rail | The collapsed context rail exposes only an expand icon and does not retain a visible scope label (`CompanyProjectConversation.tsx:305-320`). | Keep a compact “Context” label or tooltip that is discoverable without hovering; expose the controlled panel relationship with `aria-controls`. |
| P2 | Responsive overflow | Task filters and thread lists use horizontal overflow, while some Company tables switch to a fixed 720px minimum (`company-collaboration.css:231-239`, `styles.css:8713-8719`). | Test 200% zoom and 1280/1024/860px desktop widths with long names. Prefer wrapping/grouping before forcing hidden horizontal content. |
| P2 | Overlay close controls | Shared Dialog/Sheet close buttons and toast dismiss buttons are 28–32px (`components/ui/dialog.tsx:61-74`, `sheet.tsx:63-76`, `styles.css:120-132`). | Keep the visual size if required by the desktop density, but provide a 44px hit area using an invisible expansion target and verify it does not clip the overlay edge. |

### Formatting, destructive actions, and thread-specific behavior

| Severity | Surface | Gap and evidence | Required correction |
| --- | --- | --- | --- |
| P1 | Destructive message action | Thread message deletion uses native `window.confirm` (`ThreadConversationPage.tsx:257-259`) instead of the shared confirmation modal. | Replace it with the shared Dialog, show the exact message context, expose Cancel/Delete, restore focus, and announce success/failure. |
| P1 | Destructive task movement | Moving a task with open subtasks also uses native `window.confirm` (`TaskBoard.tsx:67-73`). | Use the same styled confirmation dialog and include the affected task and open-subtask count. |
| P2 | Thread timestamps | Message times are rendered with `new Date(...).toLocaleString()` and no `dateTime` attribute (`ThreadConversationPage.tsx:419-424`). | Use the shared date formatter, include `dateTime`, and keep timezone/locale policy consistent with task, evidence, and invitation timestamps. |
| P2 | Error copy | Several thread and task errors expose underscore-replaced backend categories directly (`ThreadConversationPage.tsx:270-326`, `TaskDetailDrawer.tsx:493-498`). | Map backend categories to short human copy with a next step. Do not show raw enum wording in the interface. |
| P2 | Long user content | Some title/meta areas clamp or ellipsize, but message replies, thread names, Company names, and select options do not share one long-content rule. | Test empty, short, average, and very long names/messages. Use `min-width: 0`, `overflow-wrap:anywhere`, line clamping only where loss is safe, and a full-value tooltip or details view where it is not. |

### Overlay and modal regression matrix

Every overlay needs the same open, loading, error, empty, success, Escape, outside-click, focus-entry, focus-return, scroll, and long-content checks. The current gaps are concentrated in these surfaces:

| Overlay | Main gap to close |
| --- | --- |
| Create/Edit Project, Channel, member, Company, relationship | Live focus-return, first-invalid focus, async pending copy, and destructive confirmation are not proven on every entry point. |
| Create Task and Create Task from Chat | Label selected state semantics, long assignee labels, and evidence-link success/failure need the same regression fixture. |
| Task Admin | Dense workflow rows need overflow and keyboard reorder checks at 1024px and 200% zoom. |
| Task Detail Drawer | Native selects, label pressed state, hidden comment actions, conflict recovery, and scroll-to-error need a single test path. |
| Notifications | Company and task notification popovers use different interaction models; standardize filters, read state, item navigation, focus, and empty copy. |
| Project Search and Chat Search | Search result replacement needs a live announcement, stable active result, and focus return after opening a source. |
| Import Memory and Evidence Preview | Verify unavailable/archived source copy, long quotes, sticky footer actions, and source-navigation focus return. |
| Timezone and Date Picker | Verify keyboard grid/listbox behavior, focus restoration, locale/timezone, and viewport collision. |
| Emoji, mention, forward, and message-action popovers | Verify one escape path, outside click, coarse pointer access, and no clipping inside scroll containers. |

## Changes made during this audit

- Company Settings now renders inside `CompanyProjectNavigation` and the shared `company-unified-shell` for both the loaded page and loading/unavailable states. The profile link, appearance control, logout action, Company workspace navigation, and content hierarchy therefore stay consistent with the Company overview and Project workspace.
- Auth password/action controls and Evidence filter chips no longer suppress the visible `:focus-visible` outline. The existing hover treatment remains unchanged.
- Route-backed Company destinations now use links with `aria-current`, while state-only filters retain `aria-pressed`. This keeps active styling, URL state, and browser navigation aligned.
- Company and Project settings, ownership, relationship, invitation, and task controls now use the shared `NativeSelect` contract with stable widths, truncation, labels, and focus treatment. Profile, search, thread, and timezone fields now expose stable names, autocomplete metadata, and useful placeholders.
- Message deletion, open-subtask task movement, audience-expanding forwards, Company closure, and settings deletion now use the shared confirmation dialog with pending state, explicit consequences, focus-return behavior, and recoverable failure handling. Browser-native `window.confirm` calls were removed from the web source.
- Message actions and task movement actions remain available to keyboard and coarse-pointer users. Thread unread markers use accessible spans, task labels expose pressed state, the mobile navigation marks background siblings inert, and the collapsed Project context rail exposes its controlled panel.
- Company notification items now have filter buttons, direct View links, focusable rows, and an explicit empty-filter state. Thread and knowledge controls now use complete button-group/tab semantics, including Arrow, Home, and End behavior. The emoji picker now has modal semantics, Escape handling, and focus entry/return.
- Shared enum-label formatting and confirmation behavior now have focused regression tests. The web suite remains green after these changes.

## Regression checks

Passed:

- `pnpm lint` in `apps/web`.
- `pnpm typecheck` in `apps/web`.
- `pnpm test` in `apps/web`: 40 files and 111 tests passed, including the new confirmation-dialog and enum-formatting regressions.
- `pnpm build` in `apps/web`: client, SSR, and Nitro output completed successfully.
- Repository `pnpm lint` and `pnpm typecheck`: web, mobile, shared, and Convex checks passed.
- `git diff --check` for the owned web remediation files: no whitespace errors; only existing line-ending normalization warnings were reported.
- Live Company Settings render after the shell fix: 236px navigation, labelled Company workspace navigation, appearance/logout controls, no horizontal overflow, and no Track console errors.
- Live Company overview, Company Project overview, Channel conversation, Evidence/Memory, Task board, Create Task dialog, Task detail drawer, Task notification popover, date picker, and appearance menu checks from the local development session.

Not passed or not available:

- Figma frame and modal comparison: blocked by access/session limitations.
- Figma account recheck: the connector authenticated as `zohaibcollabze@gmail.com`, but the file is View-only for this session and metadata access is denied; the alternate connector is rate-limited on the Starter plan.
- `/profile` live render: blocked by the local auth origin/session mismatch; no authenticated content was rendered.
- Project Settings live render: blocked by the local auth origin/session mismatch; no authenticated content was rendered.
- Full repository test gate: web passed 40 files and 111 tests, shared passed 5 files and 10 tests, and mobile passed 22 files and 69 tests. The gate still fails in `convex/taskManagement.test.ts:215`: the bounded task-page filter returns `[]` instead of the expected task ID. This backend failure is outside the UI slice and remains open.
- Scoped `codex review`: attempted, but the shared worktree contains a large unrelated staged/unstaged change set, so the CLI expanded into a repository-wide review and was stopped before producing a trustworthy finding set. No review result is claimed.
- Full assistive-technology, high-contrast, zoom, reduced-motion, translated-content, offline, slow-network, failure-injection, and 500/1000-record matrix: not run.

## Acceptance condition for closing this audit

Close only after a signed-in Figma session exposes the actual frames and every matrix row above has either a live browser result or a deliberate product decision. The final pass must include the two blocked routes, all overlay open/close/focus paths, both themes, keyboard-only navigation, 200% zoom, reduced motion, long content, and the repository’s required full gate.
