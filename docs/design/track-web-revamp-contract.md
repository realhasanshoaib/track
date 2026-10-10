# Track web revamp: reference study, audit, and Design Contract

**Status:** Design specification ready for review; implementation has not started under this contract.  
**Date:** 2026-10-08  
**Scope:** Every user-facing route and reachable overlay in `apps/web`. Native mobile is outside this specification.  
**Authority:** This is the visual and interaction source of truth for the web revamp. The [existing web quality gates](../ui-ux-professionalization.md) still govern route verification and release evidence. If a value here differs from an existing feature stylesheet, this contract is the target and the stylesheet remains the observed implementation until changed.

## 0. Evidence and interpretation

This specification comes from the generated route tree, the [36-view source census](../audits/2026-10-06-web-ui-ux-phase0-screen-census.md), current source and token files, saved local screenshots, and visual inspection of all 13 linked Dribbble shots on 2026-10-08. The Dribbble images show designed desktop states. They do **not** prove keyboard behavior, actual hover states, mobile layouts, performance, or working product logic. Those behaviors below are Track design decisions, not claims about the shots. Mockup dimensions and colors are approximate visual relationships, not sampled source tokens. Two Xorba Project dashboard shots appear to show substantially the same product composition and count as one pattern family, not two independent confirmations.

The older local screenshots are evidence of a previous working state. The current Company Overview source contains a newer summary, Project rows, work-mix chart, and activity list; no fresh authenticated browser pass could confirm their rendered state because the local development sign-in is unavailable. This limits *audit certainty*, not the completeness of the target contract. No application code or production data was changed for this study.

## 1. Reference deconstruction

### 1. [SaaS B2B Marketing Dashboard](https://dribbble.com/shots/26504537-SaaS-B2B-Marketing-Dashboard-Design)

The composition uses a pale canvas, a fixed left navigation rail, a utility/search header, a narrow band of six KPI blocks, a large three-series time chart, a detailed table, and a small right column of source summaries. The value and label within each KPI have a clear size jump; the chart has the strongest horizontal weight; the table carries the detail. Gray, charcoal, and a restrained burgundy signal provide contrast without a bright background. White cards, soft radii, fine boundaries, and generous outer gutters create depth mostly through surface changes. Repeated card boundaries are visible, but the denser table avoids making every record a separate tile. The source is a static desktop presentation, so actual hover, filter, sort, and breakpoint behavior is unknown. **Track adaptation:** use the scan order “scope → important signal → trend or distribution → actionable records,” but limit the owner overview to four useful signals and avoid marketing metrics, a permanent social rail, and unproved trend lines.

### 2. [Project Management Dashboard](https://dribbble.com/shots/27432969-Project-Management-Dashboard)

Xorba places a top-level product bar above a left teamspace tree and a broad work region. A compact Project header holds the title and actions; List, Board, Timeline, and Calendar appear as one view switch. The list groups work into named sections and repeats aligned fields such as task, status, assignee, due date, and Project. Purple is reserved for a selected view and creation action; neutral row rules provide the rest of the structure. Typography is compact, with task names stronger than metadata and consistent numeric/date columns. Group collapse icons and controls imply behavior, but their transitions and keyboard support cannot be observed. **Track adaptation:** preserve one shared task toolbar and stable columns across views; show a Channel or evidence origin where Track has it. Do not copy Xorba's extra “teamspace” hierarchy or introduce every view simply because the tab exists.

### 3. [Project Management Dashboard Design](https://dribbble.com/shots/27640246-Project-Management-Dashboard-Design)

This Oripio shot repeats much of Xorba's top bar, left navigation, compact Project heading, view tabs, and grouped task-list grammar. The strongest lesson is consistency: line height, avatar size, due dates, and status chips stay aligned across many rows. The layout is dense but readable because it spends whitespace at group boundaries rather than between every cell. It uses the same narrow accent and light neutral surfaces as the previous Xorba example. No reliable mobile or menu-state evidence is visible. **Track adaptation:** make status, assignee, date, source, and task title line up in a desktop table; on narrow screens turn each record into a two-line row with its key status and date still visible. Treat this and reference 2 as one repeated design family.

### 4. [IKI Business Process Management Dashboard](https://dribbble.com/shots/22425228-IKI-Business-Process-Management-Dashboard)

IKI is the calmest work-management reference. It uses a white or near-white canvas, a text-first sidebar, a simple greeting/title, category tabs, small filters, and priority-grouped rows. Status and percent are compact pills; avatars, tags, and file indicators sit at stable row positions. A few dividers and open space distinguish sections, so the page feels less boxed than card dashboards. Small labels are visually light and would need contrast validation in production. A second search field and many parallel tabs add some ambiguity, and the shown desktop view cannot establish mobile behavior. **Track adaptation:** use the row-led grammar for Project directories, Company activity, threads, and evidence; keep a single scoped search at each level and make the active Company and Project explicit.

### 5. [SaaS Project Management Dashboard Design](https://dribbble.com/shots/27348658-SaaS-Project-Management-Dashboard-Design)

Olack gives the Project title, completion rule, collaborators, and one view switch prominence before a four-column Kanban board. Each task card has a category, title, short supporting text, progress signal, people, and small attachment/comment indicators. The board has enough column width to scan and uses one contained card type; the outer shell and white background stay quiet. This is a useful hierarchy for task *details*, but copying every card field would make Track's board noisy. Drag behavior is not demonstrated by the image. **Track adaptation:** board cards show title, state, assignee, due date, and source cue first; extra metadata moves to task detail. Keep click/keyboard state change beside any drag behavior.

### 6. [Dashboard Design for a Shopify Intelligence Platform](https://dribbble.com/shots/27460154-Dashboard-Design-for-a-Shopify-Intelligence-Platform)

Skymetrics uses a light analytic canvas, a measured KPI row, one wide chart, and lower distribution/segment modules. Green acts as a single positive signal against mostly neutral surfaces. A dark variant and AI assistant appear in the video. Large numbers, quiet captions, and plentiful whitespace keep the first scan short; the analytics then move from general to specific. The video uses smooth showreel transitions between scenes, which do not prove the actual dashboard's controls or transition timings. **Track adaptation:** keep the hierarchy of summary, then explanatory chart, then records. Use Track amber only for scope and selected action, semantic colors for work states, and a plain text alternative for every chart. Do not imitate the Shopify business metrics, green brand, dramatic dark-mode reveal, or assistant decoration.

### 7. [AI Web App SaaS Platform](https://dribbble.com/shots/27373221-AI-Web-App-SaaS-Platform)

The AI Manager dashboard uses a soft-gray canvas with white summary and chart surfaces. A right-side detail drawer overlays a dimmed analytics background; the drawer moves from a named entity to key facts and a timeline. Small pink/purple signals separate status from neutral data. The overlay creates a clear reading focus, but a fully dimmed permanent detail view would hide important workspace context. Behavior and focus management are not observable. **Track adaptation:** use a task/evidence drawer for a short review while retaining the underlying Project context; use a full route on narrow screens or for long editing. The drawer must restore focus and preserve the return URL.

### 8. [Create Project Modal](https://dribbble.com/shots/27016444-Project-Management-Dashboard-Create-Project-Modal-UI)

The Proxel concept centers a tall white form over a dimmed Project page. Its fields are grouped in a predictable vertical order: identity, dates, image, client/user, estimates, description, tag, state, then a quiet Cancel and stronger Create action. Paired fields conserve horizontal space, while labels remain above controls. The concept's large number of fields and required Project image would slow Track's primary creation flow. The visible screenshot does not show validation, scrolling, or keyboard mechanics. **Track adaptation:** ask only for Project name, owning Company, and essential access/context initially; place optional details after creation or in a clearly marked secondary section. A small creation form may be modal; a long form needs a page or wide sheet with reachable footer actions.

### 9. [TalentHub Interview Scheduling Calendar](https://dribbble.com/shots/27447901-TalentHub-Automated-Interview-Scheduling-Recruitment-Calenda)

TalentHub has a narrow navigation rail, a second compact filter rail, a broad day/time grid, a right detail inspector, and a small bottom aggregate strip. People form the columns, times form rows, and tinted events carry category and duration. Top controls put date navigation, day/week/agenda mode, timezone, and filtering together. The detail pane expands one item without leaving the schedule. The image is a high-density desktop concept; mobile and overlap behavior are inferred. **Track adaptation:** Track's task calendar groups by date rather than interviewer and must have a clear list/agenda alternative at small widths. Date controls, timezone, and due-state legend should remain understandable without color. Avoid a second filter sidebar and permanent inspector on laptop widths.

### 10. [KirriDesk Automated Macro Responses](https://dribbble.com/shots/27476490-KirriDesk-Automated-macro-responses-for-SaaS-Customer-Service)

KirriDesk keeps a narrow left navigation, a ticket heading/status action, a small set of content tabs, a spacious conversation stream, and a composer anchored at the bottom. A compact searchable macro menu opens beside the composer, so inserting a response stays close to the writing task. Conversation copy has more visual weight than toolbar chrome; thin separators and a white field replace message cards. The shot shows an open menu, not its keyboard or selection behavior. **Track adaptation:** keep Channels and threads text-first, preserve source context and task actions near the relevant message, and keep menus close to the composer or message that opened them. Do not import customer-service ticket states or channel types.

### 11. [KirriDesk AI Drafting and Macros](https://dribbble.com/shots/27504215-Kirridesk-AI-Drafting-Macros-Answer-in-SaaS-Customer-Service)

The same shell shows an AI-generated reply *inside* the composer area, with a tinted draft region, linked reference card, feedback controls, and an explicit Accept & Send action. The empty conversation space makes the draft the temporary focal point. This is a useful disclosure pattern: generated text is visibly distinct and requires a human action. The image does not establish generation failure, citation accuracy, or accessibility. **Track adaptation:** assistant text and conversation-derived task suggestions must be labeled, scoped, and human-confirmed; source evidence stays attached. Do not add an automated send path or customer-service macro language to Track.

### 12. [CRM Add User Modal](https://dribbble.com/shots/26943571-CRM-Webapp-Add-User-Modal)

The centered modal dims a settings screen and puts user information, role, access switch, and final actions in one contained form. Two-column fields reduce height, while a role menu opens directly below the relevant control. The form title, content, and footer have clear visual separation. The example includes extra arbitrary fields and very small supporting text, which would harm clarity if copied. **Track adaptation:** invites and membership edits must explain Company, Project, and Channel access in plain text before confirmation. Keep the permission choice next to its consequence, use explicit Save/Invite labels, and avoid generic “User” roles that hide scope.

### 13. [Marketing Campaign Dashboard](https://dribbble.com/shots/27455647-Marketing-Campaign-Dashboard)

Flowio aligns five KPI tiles above a row of colored quick-action tiles, a weekly performance chart, and a right activity/notification column. The numbers form a fast first scan; chart and feed offer explanation. It uses a neutral app shell, light surfaces, a single blue/purple product accent, and several pastel action areas. Its promo card, many colored quick actions, and simultaneous notification/assistant modules add noise. The shot does not prove live filters or mobile stacking. **Track adaptation:** keep direct links from a Company signal to the relevant Project, task, or thread. Replace colored action tiles with one primary action and quiet text links; do not put ads, generic AI suggestions, or a notification feed beside the work feed.

### Shared reference measurements and limits

Visible desktop concepts typically use a stable rail, a 1–2 row header, one 12-column-like content field, compact controls, and clear left alignment. Their visual system relies on a small neutral surface ladder, one accent, 1px rules, 6–12px apparent corner radii, and very little persistent shadow. Exact pixels, font families, accessible contrast, and responsive breakpoints cannot be reliably extracted from scaled Dribbble mockups. Track therefore uses its own tested tokens below. Static screenshots show selected tabs, open menus, modals, and drawers, but **do not** show hover/focus/disabled/pressed transitions, sorting logic, drag behavior, or reduced-motion support; the contract defines those deliberately.

## 2. Cross-reference design analysis

| Finding | Evidence and judgment | Track decision |
|---|---|---|
| Common useful pattern | IKI, Xorba, KirriDesk, and TalentHub place primary work in aligned rows or a task-specific grid. | Use rows for directories, activity, evidence, threads, and list tasks; reserve cards for independent summaries and board tasks. |
| Common useful pattern | Marketing, Skymetrics, and Flowio move from compact signals to a chart to records. | Owner overview follows “scope → four signals → Project progress and work mix → recent activity.” |
| Common useful pattern | The examples use one accent and quiet neutrals. | Keep Track's graphite/paper identity and amber focus/scope cue; status colors have semantic jobs. |
| Product-specific pattern | Revenue, campaign ROI, hiring slots, support macros, and CRM access fields fit their own domains. | Translate structure only. Track data remains Company, Project, Channel, thread, task, and evidence. |
| Pattern to avoid | Six KPI tiles, repeated card outlines, colored quick-action tiles, duplicated search, promotional boxes, and tiny labels. | No decorative metric or independent surface without a user decision; one search per scope; minimum readable type. |
| Opportunity | Reference charts often lack explicit definitions, denominators, and drill-down paths. | Every Track chart names its population, time window, exclusions, empty state, table/text equivalent, and click destination. |
| Opportunity | Reference overlays look polished but do not show accessible mechanics. | One overlay contract supplies focus, Escape, scrolling, validation, pending state, and return behavior. |

The resulting language is **quiet operational clarity**. Navigation and scope are steady; content rests on a neutral canvas; the next decision is visible; and detail grows only where it helps a person act. There is no universal “dashboard card” applied to every screen. Conversation, tasks, administration, and analytics each use the right information shape within the same type, spacing, surface, and interaction system.

## 3. Current application UI/UX audit

### Product and technical map

Track is a pnpm monorepo. The web app is React 19 with TanStack Start/Router, TypeScript, Vite, Tailwind 4, shared React UI primitives, Convex subscriptions and mutations, Motion, and Recharts. `src/routeTree.gen.ts` defines the route inventory. `src/features` owns Company, workspace, task, thread, and profile surfaces. `src/components/ui` owns controls, dialogs, sheets, menus, tabs, toast, and input primitives. `src/design-system/professional-ui.css` supplies current semantic web colors, type, spacing, geometry, and shell styles; `src/design-system/foundations.ts` mirrors numeric foundations. Feature CSS files add local layout. Fonts are Inter for body, Geist for headings/meta, and Geist Mono for identifiers. Icons mix Lucide and Hugeicons. Track marks and local product imagery are assets; Dribbble art is not an asset source.

The core flow is Company selection → Company hub → represented Project → Channel/thread or task/evidence. A Project can also be entered through legacy Project routes. Conversation is the context source for many tasks, and task detail must keep source links. Company owner Overview is visible only to an owner. The selected Company scopes the Company dashboard. A Company owner may see Company-wide Project and aggregate task counts, while task titles and thread content still require existing Project and Channel access. Authentication, authorization, release flags, and data rules remain under their present owners; this revamp changes their presentation, not their access contracts. These rules are backed by the current owner overview implementation and [the Company access decision](../decisions/ADR-2026-10-08-company-overview-access-and-project-health.md).

### Confirmed friction and implementation risks

| Area | Evidence | Consequence and target |
|---|---|---|
| Surface hierarchy | Older saved Overview screenshots put borders around KPIs, Project rows, activity, workload, chart, partners, and actions. Current Company CSS still gives each summary tile and section its own border. | Too many equal boxes weaken priority. Use at most one containing surface per independent analytic module, borderless rows within it, and open canvas between major sections. |
| Header and first fold | Saved Overview spends a large region on greeting, quote, date, save toast, and decorative metric shells. Current source has removed some of that, but rendered result is unverified. | Put selected Company, page purpose, one action, and the first useful work signals above the fold. No quote or ornamental greeting in an operational view. |
| Navigation and scope | Company hub, represented Project, and legacy Project routes have separate layout/CSS owners. Two task entry paths and Company/Project query scopes create opportunities for visual and context drift. | Keep one shell grammar and scope label, preserve acting Company/member IDs, and make route changes predictable. Do not alter access logic as a design shortcut. |
| Search and filters | Saved Company Tasks/Threads show page search plus nested search in content. The source has separate Company and feature search components. | Use a single search owner per current scope; filters sit beside it, show active state, and have a clear reset. |
| Dashboard data semantics | Current owner view has four signal links, per-Project task completion bars, a task-state ring, and recent activity. Current CSS uses a four-column tile row and a split grid with a 360px minimum secondary column. | The right information exists, but hierarchy and narrower laptop behavior need a planned composition. The ring must show count and denominator; Project task completion must not be mistaken for subjective delivery health. |
| Status language | Current owner Project row shows lifecycle and delivery health and a task completion bar. The source also derives attention counts. | Label these three concepts separately. Lifecycle and delivery health are changed by separate accessible controls in Project administration; completion is computed from task states. |
| Charts | Current `CompanyWorkMixChart` uses an SVG ring with selectable category rows and text count; overdue is an exclusive category in its backend distribution. | Preserve the accessible text breakdown, explicitly exclude canceled work, and provide a direct task-list destination for each category. Avoid presenting a trend without comparable historical data. |
| Mobile length and horizontal overflow | Saved mobile Overview is a long stack of bordered modules. Prior census observed a 671px filter strip and 910px calendar inside a 343px mobile area. | Make Company Overview an intentional short mobile sequence; task calendar offers agenda/list as default on small screens and exposes any horizontal scroll with controls and labels. |
| Typography and alignment | Saved views show tiny muted metadata, inconsistent row starts, small chip text, and uneven control placement. Current stylesheet still sets some 11–12px labels. | Align title, toolbar, section starts, and table columns; enforce readable 12px minimum for secondary operational labels in the target, 14px body, and contrast checks in both themes. |
| Reuse and drift | `professional-ui.css` has semantic tokens, while `company-overview-reference.css`, `company-owner-overview.css`, `company-experience.css`, `company-global-work.css`, and task/workspace CSS can override local geometry. | Adopt a controlled component taxonomy and migrate feature styles to semantic tokens incrementally. Avoid a second token system or sweeping one-shot CSS replacement. |
| Runtime evidence | The prior authenticated census did not independently check Company Tasks and several legacy Project routes. Current local sign-in cannot reopen protected routes. | The design specification covers these routes, but visual and interaction implementation cannot be called done until those paths and all applicable states are observed. |

### Screen and state coverage rule

The audit counts **36 primary route/view combinations** plus **10 overlay families**, not merely unique `.tsx` route files. Public, authentication, onboarding, Company, Project, conversation, tasks, and error/recovery surfaces all share this design system. Every screen needs a populated or normal state and each applicable loading, empty, no-results, denied, read-only/archived, error, pending, success, long-content, and responsive state. The [source census](../audits/2026-10-06-web-ui-ux-phase0-screen-census.md) is the route inventory; Section 6 below gives the target specification for every entry.

## 4. Project-specific design system

### Philosophy and principles

1. **Show the current scope first.** A Company or Project name changes the meaning of counts, tasks, messages, and permissions, so it appears once in a stable header or switcher.
2. **Make the next action evident.** Each screen has one primary task and at most one high-emphasis action in its header. Secondary actions are quiet links or a scoped menu.
3. **Let the data choose its form.** Trends need real time data, distributions need a denominator, and work records need aligned rows. A card is not a default wrapper.
4. **Use progressive detail.** The first scan answers what needs attention; a click opens the exact Project/task/thread. Deep records do not crowd the overview.
5. **Preserve conversation context.** A task or assistant output links to its authorized source; an attractive chart never hides access boundaries.
6. **Make calm measurable.** Persistent shadows, gradients, decorative art, and repeated borders are absent. Density is controlled through alignment, type, and section rhythm.

### Tokens and rationale

The existing `professional-ui.css` semantic roles are the implementation home. Values below are the **target relationships** and current baseline values. Dark-mode values are paired, not created through opacity overlays. Contrast must be checked in the rendered component, so a hex value alone does not imply compliance.

| Role | Light target | Dark target | Use and reason |
|---|---|---|---|
| Canvas `--surface-canvas` | `#faf9f7` | `#151412` | One quiet page field, so modules do not need heavy elevation. |
| Surface `--surface-raised` | `#fffefd` | `#1b1917` | One step of separation for independent panels, menus, and dialogs. |
| Subtle `--surface-subtle` | `#f3f1ed` | `#24211d` | Hover, selected neutral, table head, and grouped controls. |
| Hover `--surface-hover` | `#ebe8e1` | `#2d2924` | Short-lived action feedback, not a permanent third card layer. |
| Primary text `--text-primary` | `#1b1917` | `#f4f1eb` | Headings, task names, amounts, decisions. |
| Secondary text `--text-secondary` | `#514d48` | `#d3cec5` | Descriptions and key metadata. |
| Muted text `--text-muted` | `#716c66` | `#aaa39a` | Timestamps and supporting labels after contrast validation. |
| Subtle rule `--border-subtle` | `#e5e1db` | `#34302a` | Internal row/section division only when whitespace is insufficient. |
| Strong rule `--border-strong` | `#cbc5bc` | `#4b453c` | Inputs, selected outline, structural divider. |
| Track signal `--action-signal` | `#f0b100` | `#f0b100` | Brand and one primary creation cue, not a chart category by default. |
| Signal text/focus `--action-signal-strong` | `#8a6400` | `#f5c53d` | Active scope, focus, text/icon accent; chosen for stronger contrast. |
| Success / danger / info | `#15803d` / `#b91c1c` / `#1d4ed8` | `#5bbf74` / `#f87171` / `#7ea7ff` | Semantic state with a text label and optional quiet tint. |
| Warning | Signal-strong plus signal-soft | Same roles in dark | “At risk,” due soon, and caution, always with words and count. |

Typography uses Inter for 14px/1.5 body and controls, Geist for the 28px/1.2 desktop page title, 24px small-screen title, 18px/1.3 section title, 16px/1.35 subsection, and 12px/1.4 operational metadata. The page title weight is 600–650, section titles 600, normal copy 400–500, and numeric KPIs 600–650 with tabular figures. Geist Mono is restricted to task keys and fixed identifiers. Paragraph measure is 60–75 characters; conversation reading measure is 68–78 characters. Avoid all-caps labels except a rare 11–12px utility eyebrow with adequate contrast. These sizes give numerical hierarchy while keeping long work titles readable.

Spacing follows the existing 4px scale: `4, 8, 12, 16, 20, 24, 32, 40, 48, 64`. Use 4px within a tight label/value pair, 8px between related controls, 12–16px between record fields, 20–24px inside a panel, 24–32px between sections, and 40–48px between separate page chapters. Page gutters are 32px at desktop, 24px at tablet, and 16px at mobile, with a max content width of 1280px. A main reading column should not stretch merely to fill the canvas. The existing shell widths remain 248px navigation, 48px collapsed navigation, and 288px optional context rail. These choices keep existing geometry and reduce migration risk.

Controls are 32px compact only in dense desktop toolbars, 36px regular, 40px default, and at least 44px for coarse-pointer/mobile use. Radius is 6px controls, 8px work cards, 12px independent panels. Pills are limited to status, count, and segmented selection. A border belongs on an input, overlay, or genuinely separate panel; nested cards and every-row outlines are banned. A 1px internal rule may divide records; the outer Company Overview has **no left or right border**. Persistent sections have no shadow. Use existing `--shadow-pop` and `--shadow-sheet` only on temporary popovers, menus, dialogs, and drawers.

Icons use a consistent 16px work-control size, 18–20px primary navigation size, and 1.75–2px apparent stroke. Use one icon family per immediate group; do not mix two render styles in one toolbar. An icon does not replace a status label. The selected navigation item uses a quiet tinted field and text weight; icons remain secondary. Product marks stay product-specific and are not copied from any reference.

### Layout and responsive system

| Width | Shell | Content behavior |
|---|---|---|
| `≥1280px` | 248px navigation; optional 288px context rail when genuinely useful. | Max 1280px content; 12-column grid with 16–24px gaps. Overview uses primary 7/12 and secondary 5/12, but Project rows can span full width. |
| `1080–1279px` | Navigation remains; no permanent context rail. | Two columns only where each remains at least 320px; otherwise one broad column. Keep the chart adjacent to Project progress only if labels fit. |
| `820–1079px` | Navigation may collapse to 48px; contextual detail becomes in-flow or drawer. | Single content column for operational pages; KPI pair grid; tables hide secondary columns, preserving row actions. |
| `700–819px` | Navigation uses sheet below 820px. | Main content single column; filters wrap or become a labeled filter sheet; no permanent right rail. |
| `<700px` | Full-width page and mobile navigation sheet. | 16px gutters; one-column metrics and rows; task calendar defaults to agenda; dialogs become full-height sheets when content is long. |

At 320px, 390px, 768px, 1024px, and 1440px, no page-level horizontal overflow is allowed. Data tables and boards may scroll within a clearly labeled region if the task requires it; a mobile list or agenda alternative is preferred. At 200% zoom, the viewport may enter a smaller layout. No sticky footer may cover the last field. Headings wrap normally; task titles may use two lines in a compact row, then full text in detail. Modal widths are 480px short form and up to 640px grouped form; drawers are 420px on desktop and full-screen on small widths, with `min(100vw, …)` limits.

## 5. Complete Design Contract

### 5.1 Page composition and navigation

Every page follows `scope line or breadcrumb → page title + one-sentence purpose → one primary action → local view switch/filters → primary content → secondary detail`. Omit the purpose sentence when the title and content make it redundant. The heading starts at the same horizontal line as the first content section. The title/toolbar block uses 24px bottom space at desktop and 16px on mobile. The first useful record or signal should be visible without scrolling at a 900px-tall desktop viewport. A page may use a maximum of two information columns unless a task-specific board/calendar requires more; a second column must add information, not repeat the primary column.

Global navigation represents Company, Project, and current destination in that order. Project and Company selection must be explicit and preserve acting membership in route links. Current route is indicated with text and `aria-current`, not amber alone. The optional context rail shows an active thread, task, or evidence context; it never duplicates the main page. On narrow screens navigation becomes a sheet with a named close button, Escape, focus return, and no clipped Company/Project name. Breadcrumbs are links for parent scopes, with current location plain text. Routes and selected views remain URL-addressable; back/forward restores view and filter state.

The UIArc [expanding button group](https://uiarc.dev/components/expanding-button-group) is a **scoped action switch** for the existing Project row, not the global navigation pattern. Each action has an icon, visible label when active/focused, accessible name at all times, stable destination, and keyboard access. Expansion must not shift surrounding columns or hide another action, and reduced motion must preserve full function. A simple labeled link is preferable when only one action exists.

### 5.2 Component specification

| Component | Geometry and hierarchy | States and behavior |
|---|---|---|
| Primary button | 40px high, 12–16px horizontal padding, 6px radius, label 14px/600; 44px on mobile. One high-emphasis button per section. | Hover changes surface; pressed is immediate; disabled explains why when helpful; pending retains width, blocks duplicate submit, and announces progress. |
| Secondary/quiet button | Same height and baseline; neutral fill or text only. Icon precedes label by 8px. | Hover/focus distinct; destructive option is not styled as primary until the explicit confirmation step. |
| Icon button | 36–40px square, 44px touch target on coarse pointer; 16–18px icon. | Requires accessible name, tooltip for desktop discovery, and visible focus. No unlabeled overflow icon. |
| Input/textarea/select | 40px default height, 6px radius, strong rule, 12px inner gap; text area min 96px. Label above, help below. | Focus uses 2px focus ring; error has text and `aria-describedby`; disabled, read-only, pending, and filled states are visually distinct. Native/select popup stays in viewport. |
| Search | One field per scope, 40px height, search icon and clear control; placeholder names object (“Search tasks”). | Debounce only network requests, not visible typing; query and filter state persist in URL where route supports it; no-results states restate query and offer clear. Global command search may coexist only if its scope and shortcut are clearly different. |
| Filter and sort | 36–40px controls next to the content they affect; active count and clear action visible. | Filter choice has text/checked state; sorting exposes direction and stable tie-break; mobile uses a labeled sheet if wrapping would crowd content. |
| Tabs/segmented view switch | 36–40px high, one local row; selected has quiet field or underline plus type weight. | Arrow-key behavior follows the chosen tab pattern; URL updates; no “tab” that secretly changes scope. Hidden views do not retain keyboard focus. |
| Badge/status pill | 20–24px high, 6–12px side padding, 12px/600 text, optional small dot. | Status always includes words; semantic tint is restrained. Count badges use tabular figures. Do not apply rainbow colors to categories. |
| Avatar | 24px in rows, 32px in headers, 40px in detail; initials fallback. | Name available to assistive technology or adjacent text; avatar stacks show `+N` with accessible member summary, not anonymous dots. |
| Tooltip | Short label/help, max ~240px, 12px text. | Opens on hover and focus, dismisses with Escape, never contains required instructions or primary actions. |
| Popover/dropdown | Content-width with 8–12px padding, 6–8px radius, one border and overlay shadow. | Position flips before clipping, focus and Escape work, checked items announce state; destructive actions separated at bottom. |
| Card/panel | 8px card for board task, 12px panel for one independent analytic module; 16–24px padding. | Clickable card has one clear hit area and a separate menu button; no nested link traps. No shadow while persistent. |
| Table/list | Desktop row min 48px, 56px with two-line content; 12–16px cell padding; numeric columns right-aligned, labels left-aligned. | Header labels are explicit; row hover is subtle; sort is announced; keyboard opens the same detail as click. Dividers separate rows only when alignment/space is insufficient. |
| Modal dialog | 480px short form or 640px grouped form, 12px radius; title/description/body/footer; body scrolls and footer remains reachable. | Initial focus goes to title or first useful field; focus is contained; Escape/cancel return focus; error focuses first invalid field; pending prevents duplicate submit. If dismissing loses edits, confirm discard. |
| Drawer/sheet | 420px max desktop task/detail inspector; full-screen small viewport. | URL or route retains context; open focuses heading; close returns to trigger; content scrolls independently; underlying page does not scroll while modal. |
| Toast/notification | Brief feedback in a consistent corner; title names outcome, optional action. | `role=status` for routine success, alert for blocking error; never the only place an error or important result appears. Notification center has read/unread, direct route, empty, and failure states. |
| Skeleton/loader | Mirrors final geometry with restrained neutral tones. | Does not flash for tiny waits; no perpetual shimmer needed. `aria-busy` and a concise status announce load. |
| Empty/error state | Short heading, explanation of why the space is empty or what failed, one useful action. | Differentiate first-use empty, filter no-results, denied, archived/read-only, and failed load. Retry only when a retry can succeed. |

### 5.3 Forms and sensitive actions

Forms use a single vertical reading path. Pair fields only when their meanings are related and both fit at 320px after stacking. Required markers are explained once, not left to an asterisk. Do not use placeholder as the label. Validate after submit and at an appropriate blur/change point; preserve input on failure and focus the first error. Save/Invite/Create labels name the object. A Company owner and a Project owner see controls based on existing permissions; denied controls either disappear when irrelevant or remain disabled with a clear explanation when their existence is important. The server remains authoritative. Access-changing forms state the exact Company, Project, Channel, people, and resulting access before confirmation. No authentication flow changes are part of this revamp.

### 5.4 Work records, charts, and dashboard semantics

The Company owner Overview answers **“How is work progressing?”** and **“What is happening across this Company?”**. Its default first scan is selected Company, active Projects, open/blocked/due-soon task counts, Project progress rows, one work-mix distribution, and recent relevant work. Every signal links to the scoped destination or explicitly says “Summary only.” Project completion is `completed non-canceled tasks / non-canceled tasks`; show `No tasks yet` instead of 0% when the denominator is zero. Delivery health is a separately set assessment (`On track`, `At risk`, `Off track`, or `Not set`), and lifecycle is a separate state (`Proposed`, `Active`, archive-related state). Both appear together in the Project status area with separate labeled controls where the user's role permits changes. Do not derive either from the task-completion percentage or silently replace one with the other.

The work-mix ring is acceptable because the categories are mutually exclusive in current server logic: overdue, in progress, to do, completed; canceled tasks are excluded. The central total, four text rows, explicit counts and percentages, and selected explanation make it readable without color. Each category selection should filter or open the matching Company task view where access permits. If a future change makes categories overlap, replace the ring with bars or separate callouts. The chart never animates from invented values. Recent activity is a chronological row list with actor, verb, object, Project, and timestamp; owner-wide items without Project membership expose only allowed summary text. The empty state explains that recent work will appear here. A time-series chart is added only when the backend supplies a stable history, clear date range, and comparison rule; it needs axes, visible units, no-data handling, and a table/text equivalent. Do not add revenue, “productivity score,” stars, or opaque health gauges.

Project Overview is the Project-specific counterpart: title/scope, lifecycle + delivery health, task progress and attention, Channels/threads where accessible, and recent Project activity. Company Overview is not a Project landing page by default; a person enters a specific Project deliberately from a Project row or directory. Company-wide task counts can include Projects the owner does not directly belong to, but task titles, thread text, member details, and destination links follow existing Project/Channel access. Every chart tooltip and interaction must respect the same boundary.

### 5.5 Motion, feedback, accessibility, and writing

Feedback transitions use 160ms; layout or panel transitions use up to 260ms with `cubic-bezier(0.2, 0, 0, 1)`. Animate opacity and transform where practical. Never animate chart values in a way that changes their meaning or delays reading. Hover can move an icon at most 2px and should not cause layout shift. Press feedback is immediate. Respect `prefers-reduced-motion` by removing nonessential movement while keeping state changes visible. Drawers, menus, and expanding groups must be usable while animation is disabled.

Target [WCAG 2.2 AA](https://www.w3.org/TR/WCAG22/) for text contrast, non-text control boundaries, reflow, keyboard operation, visible and unobscured focus, target size, status messages, and accessible authentication. Use native elements first. The [WAI-ARIA modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) guides modal focus and return. Do not depend on hover, color, shape, animation, or a chart alone to express status. Charts have text/list equivalents. Keyboard alternatives exist for drag and horizontal board/calendar navigation. Announce loading completion, action failure, and successful updates without stealing focus unnecessarily. At 200% zoom, content may reflow but no action is hidden.

Use Track's terms consistently: Company, Project, Channel, thread, task, board, and evidence/reference. Labels say what an action does: “Create Project,” “Open task,” “Archive Channel,” “Retry loading activity.” Empty text says what belongs in the area and what action makes it appear. Errors name the failed operation and whether anything was saved. Avoid decorative greetings, marketing copy, generic “Insights” labels, unexplained abbreviations, and statements of success before the backend confirms success.

### 5.6 Do, do not, and anti-patterns

**Do:** align to one grid; use open canvas around related rows; show a clear scope; use one semantic color per meaning; expose chart denominator; make a full row keyboard reachable; use progressive disclosure; provide compact direct links from summary to detail.

**Do not:** put a border around every tile and again around its contents; use shadows on persistent cards; show a 0% progress bar for a Project without tasks; put a task and thread search in the same Company Tasks panel when the page already has a scoped search; place a quote or oversized greeting above operational data; use unlabeled icons; use color-only status; create a hover-only action; use a carousel, stars, gradient, glass, or decorative chart; or hide access restrictions behind disabled navigation with no explanation.

## 6. Screen-by-screen revamp specification

Each numbered row below matches the generated route/view census. “Current issue” separates source or saved-image evidence from routes that were not freshly observed. The target column specifies hierarchy, layout, components, and primary interaction. The last column specifies responsive behavior, required states, reuse, and priority. P0 establishes the shell and core work journeys, P1 finishes supporting Company/Project paths, and P2 aligns public/account information pages. A row marked “unverified baseline” is still a required implementation and verification target.

### Public, authentication, and profile

| # / route or view | Current UX, visual, and hierarchy issue | Target structure and interaction | Responsive, states, reuse, priority |
|---|---|---|---|
| 1 `/` | Entry is a redirect, so a visual restyle has no direct surface; session/config transition can be unclear. | Use one branded, accessible short loading state before the correct signed-in workspace or sign-in destination. Keep return path safe. | No layout jump at 320px; signed-in, signed-out, config failure, and safe fallback. Shared loader. **P0**. |
| 2 `/about` | Public product text can drift from the conversation-first product and operational visual language. | Narrow 70ch reading column, clear Track purpose, Company → Project → Channel → task explanation, one workspace/sign-in action. | Single column; long copy, links, dark, zoom. Public page shell. **P2**. |
| 3 `/support` | Help topics need task-based grouping and a findable contact path. | Short help index for access, Projects, conversations, privacy/deletion, then contact link; no generic dashboard cards. | Single column; working links, mailto, focus, long text. Public page shell. **P2**. |
| 4 `/privacy` | Long policy pages risk weak heading rhythm and line length. | Document title, date, linked section index, semantic headings, 70ch prose, accessible contact action. | One column at all widths; dark, keyboard index, zoom, no clipped links. Public document template. **P2**. |
| 5 `/terms` | Same long-form readability risk as Privacy; business-use terms need clear scannability. | Reuse policy document template with correct hierarchy and stable anchors. | One column; long content, dark, zoom, keyboard. Public document template. **P2**. |
| 6 `/deletion` | Consequences and retained shared content can be missed in prose. | Step-by-step account deletion guidance with a plainly marked consequence section and contact path. | Single column; link behavior, dark, zoom. Public document template. **P2**. |
| 7 `/sign-in` | Earlier screenshot uses a split visual preview whose example content does not express Track's core work; form remains primary. | Keep authentication methods unchanged. Use a 400–440px form column, concise product statement, labeled email/password and Google actions; any side illustration must be Track-specific and secondary. | Stack to one column below 820px; invalid, pending, provider failure, recovery, disabled, focus. Auth form primitives. **P0**. |
| 8 `/two-factor` | The code, backup option, and trusted-device choice can become competing actions. | One narrow challenge panel: selected method, labeled code, method switch, trust-device help, Verify; clear back/retry path. | Single column; invalid/expired code, pending, success, recovery, keyboard and paste. Auth form primitives. **P0**. |
| 9 `/auth/callback` | A long provider handoff can look stalled. | Focusable/announced “Finishing sign-in” state with stable fallback and actionable error if callback fails. | All widths; loading, success redirect, cancellation, provider failure. Shared loader/error. **P0**. |
| 10 `/profile?panel=profile` | Profile tabs may read as separate forms while save ownership is unclear. | Page title and local index, identity form, one Save action and inline confirmation. | Local index scrolls on mobile; loading, validation, pending, success/error, long values. Settings form. **P1**. |
| 11 `/profile?panel=security` | Security controls carry high consequence and need stronger grouping than generic settings rows. | Group sessions/2FA/security controls by action, explain effect and require explicit confirmation where appropriate. | Single column on mobile; denied/re-auth/pending/error/success. Settings section and confirm dialog. **P1**. |
| 12 `/profile?panel=methods` | Sign-in methods can appear as anonymous provider icons. | Named method rows with connected state, last-used or relevant detail, and explicit Add/Remove controls. | Stacked rows; empty, provider failure, pending, success, keyboard. Settings rows. **P1**. |
| 13 `/onboarding/profile` | Earlier baseline stopped at loading, so completion path and recovery are unverified. | One short required profile sequence with clear progress, why fields matter, and Save/Continue. | One column; loading, invalid, pending, success redirect, failure preserving fields. Auth/settings form. **P0**. |

### Workspace and Company

| # / route or view | Current UX, visual, and hierarchy issue | Target structure and interaction | Responsive, states, reuse, priority |
|---|---|---|---|
| 14 `/workspace` | Entry can become a competing dashboard instead of a clear route to current Company/Project work. | Active scope, recent/accessible Projects, relevant attention, and direct continuation links. No duplicated Company owner analytics. | 2-column directory → 1 column; loading, no Company/Project, denied, data error, long names. Shell, scope switcher, work row. **P0**. |
| 15 Company `overview` | Older image shows too many bordered modules and ornamental greeting; current implementation is newer but rendered result unverified. | Owner-only, selected Company header; four calm linkable signals; primary Project progress rows with task completion plus separate lifecycle/health; one work-mix ring with text breakdown; recent work rows. One creation action. | 7/5 → one column; two-column KPI pair → single on narrow mobile; loading, no Projects, no tasks, no activity, restricted details, search/no results, error, long names. Summary link, chart, row, expanding action group. **P0**. |
| 16 Company `tasks` | Unverified fresh baseline; prior saved page appears to mix task and thread summaries and repeated search. | Company-wide task list with one search, status/assignee/Project filters, count, sortable records, and New task. Respect Project scope on titles and links. | Desktop table → two-line rows; empty, no results, denied task detail, pending mutation, error. Work toolbar, task row, detail drawer. **P0**. |
| 17 Company `threads` | Saved page nests search in Project cards under another search and leaves large empty regions. | One scoped search and Open/Archived switch; Project-grouped thread rows with Channel, last activity, unread/follow status. | Grouped rows → single column; no accessible threads, no results, denied, archived, load/error. Search toolbar, thread row. **P0**. |
| 18 Company `projects` | Saved directory has four summary boxes before the actual Project list and many filter chips. | Company-scoped Project directory first; compact count and owner/collaboration/lifecycle filters; Project row shows owner, access, lifecycle, delivery health, task progress and last activity as permitted. Create Project is primary. | Table → Project rows; unassigned Projects in a named section; empty, no results, denied, proposed, archived, pending. Project row, filter bar. **P0**. |
| 19 Company `relationships` | Administrative relationships can look like ordinary Project work; action consequence is easy to miss. | Relationship status and invitation/action queue first, then Company rows with roles and state. Creation/removal flows state access consequence. | Rows stack; empty, invitation pending, denied, removal pending, error/success. Admin row and confirm dialog. **P1**. |
| 20 Company `people` | Members and invitations need distinct status and permission context. | Current members, pending invitations, and one Invite action; rows show person, Company role, Project scope when relevant, and available management actions. | Two-line member rows; empty, no results, invite pending/revoked, denied, error. People row, avatar, role badge. **P1**. |
| 21 Company `settings` | Multiple management concerns can become one long column of equal panels. | Sticky local index for identity, membership, access, and lifecycle; each section has one save boundary and clear consequence. | Mobile horizontal index and single column; loading, validation, denied, save pending/success/failure, destructive confirmation. Settings section/form. **P1**. |

### Represented Company Projects and legacy Project routes

| # / route or view | Current UX, visual, and hierarchy issue | Target structure and interaction | Responsive, states, reuse, priority |
|---|---|---|---|
| 22 Company Project `overview` | Earlier Project overview shows long content; Company and Project status can be conflated. | Project title/acting Company, concise purpose, lifecycle and delivery health together with distinct controls for authorized owner, computed task progress, attention, Channels/threads, and recent Project events. | Two columns only ≥1080px; otherwise one; no tasks, no Channels, not set health, archived/read-only, denied, error. Project header/status/rows. **P0**. |
| 23 Company Project `channels` | Conversation and Channel selection must remain one clear task; earlier #General content was visible. | Channel selector/directory beside or above conversation; current Channel header, timeline, composer, and thread entry. Keep message actions close to messages. | Selector becomes sheet; no Channel, empty timeline, send pending/failure, archived, denied, long text. Conversation primitives. **P0**. |
| 24 Company Project `evidence` | Earlier view only proved a zero-source empty state. | Scoped evidence search, source list, previews, and memory import state; show provenance and permissions before content. | List → full-width rows; empty, no results, processing, unavailable source, denied, error. Evidence row/preview/import. **P1**. |
| 25 Company Project `settings` | Earlier navigation resolved to a management context, so destination naming and ownership need clarity. | Project identity, membership, lifecycle, delivery health, archive controls in explicit sections; keep represented Company visible throughout. | One column; permission-denied controls, validation, pending, archive/read-only, error/success. Settings form/status controls. **P1**. |
| 26 `/workspace/projects/$projectId` | Legacy Project overview was not independently observed; it risks diverging from represented Project overview. | Use the same Project overview grammar, with the exact Project and acting Company scope shown and authorized tasks/Channels/evidence linked. | Same breakpoints/states as row 22; Project overview composite. **P0**. |
| 27 Project `/channels` | Legacy directory was not independently observed and may differ from represented Project navigation. | One Channel directory: name, purpose, unread, last activity, and Join/Open/Create according to permission. | Rows at all widths; no Channels, no results, denied, pending/error. Channel row and directory toolbar. **P1**. |
| 28 Project `/evidence` | Existing empty evidence and memory states were seen, but import and preview paths were not. | Searchable evidence list and separate memory-source group with scope/provenance; preview preserves origin. | One column on mobile; empty/no results, processing, denied, missing source, error. Evidence components shared with row 24. **P1**. |
| 29 Project `/settings` | Legacy route unverified; duplicated admin layout could drift. | Reuse Project settings sections from row 25, with actual Project role and Company context. | One column; denied, validation, save pending/error/success, archived. Shared Project settings composites. **P1**. |
| 30 Channel conversation | Conversation was observed in represented shell, but legacy route and send path were not independently exercised. | Channel name/scope, readable message rows with day boundaries, source/mention/attachment actions, composer pinned within the workspace. Thread entry is obvious. | No permanent side rail below 1080px; empty, older-load, send pending/failure, offline, archived, denied, long messages. Message/composer/Channel header. **P0**. |
| 31 Focused thread | Source message and replies were observed, but reply submission was not. | Parent Channel return, source message first, reply timeline, composer, follow/unread and archive state. Task-from-thread keeps source link. | Single column on mobile; empty replies, send pending/failure, archived/read-only, denied, long quote. Thread conversation composite. **P0**. |

### Task workspace

| # / route or view | Current UX, visual, and hierarchy issue | Target structure and interaction | Responsive, states, reuse, priority |
|---|---|---|---|
| 32 Tasks `board` | Current board supports multiple states and long titles; dense metadata can crowd cards. | Shared task header/toolbar; workflow columns with count, compact task cards, visible due/assignee/source cue, and click/keyboard move alternative. | Board scroll has labeled region and scroll controls; mobile defaults to grouped list or accessible board switch. Empty lane, no tasks, drag/keyboard move pending/error, denied. Task card/toolbar. **P0**. |
| 33 Tasks `list` | Long task content can break alignment; filters can multiply. | One task toolbar and a sortable row list with task, status, assignee, due, source/Project and concise actions. Open detail without losing filters. | Desktop table → two-line mobile rows; empty/no results, unassigned, overdue, save conflict/error. Task row/detail. **P0**. |
| 34 Tasks `calendar` | Prior 390px capture requires internal scroll of a 910px calendar and 671px filter strip; discovery is poor. | Clear month/date controls, due-date legend and exact date labels; desktop calendar with a linked agenda/list alternative. At small widths, agenda is default and month grid is optional. | No page overflow; empty date, filtered no-results, overdue, task reschedule pending/error, timezone and long title. Calendar/agenda/date control. **P0**. |
| 35 Tasks `my` | Assignment filter should be understood as “my tasks,” not a new data model. | Reuse list composition with persistent “Assigned to me” scope chip and same task detail route. | Mobile rows; no assigned work, no results, unassigned edge, error. Task list/filter. **P1**. |
| 36 Tasks `inbox` | Earlier Suggestions only showed “Inbox is clear,” so review/accept flow is unproved. | Source-grounded suggestion rows with quoted context, proposed task fields, Inspect, Create/Discard decisions; human confirmation is explicit. | Single column; empty, loading, denied source, action pending/failure/success, archived Channel. Suggestion row, evidence preview, task create flow. **P1**. |

### Ten overlay families: required revamp behavior

| Family | Specification and required states |
|---|---|
| 1. Company/Project/Channel/relationship/member/invitation create and edit | Use the 480/640px form-dialog rules; title names scope; access consequences are visible; first invalid input receives focus; pending prevents duplicate submit; cancel/discard and error preserve safe state. Long management forms use a page or wide sheet. |
| 2. Create task and create from conversation | Same task form in both entry points. Conversation source and Channel scope are visible and retained. Completion offers “Open task”; failure retains draft and source. |
| 3. Task workflow administration | Status rows support keyboard reorder or explicit move controls, clear constraints, and save/cancel. Fit 1024px and 200% zoom; pending/error/denied are announced. |
| 4. Task detail drawer | Task title, status, assignee, dates, description, subtasks, comments, evidence, and activity follow one reading order. Focus containment/return, long values, save conflict, and retry are required. |
| 5. Company/task notifications | One notification center with unread/read filter, direct destination, mark/read and clear controls; loading, empty, no match, and error are explicit. No duplicated decorative feed on Overview. |
| 6. Project and conversation search | Search header states exact scope. Results group by object and show Project/Channel provenance. Loading, empty/no result, error, keyboard selection, Escape, and return focus are required. |
| 7. Memory import and evidence preview | Show destination Project/Channel and source provenance; validate file/source; show processing, partial failure, unavailable item, retry, and long-content scrolling. Preview never reveals content outside access scope. |
| 8. Timezone and date picker | Timezone is named where a date/time needs interpretation. Picker fits viewport, supports keyboard date selection, disabled-date explanation, Escape, and return focus. |
| 9. Emoji, mention, forward, and message actions | Menus sit near message/composer, have named triggers, pointer/keyboard/touch parity, no viewport clipping, and source-aware forwarding. Copy/selection feedback does not overwrite the composer. |
| 10. Logout, delete, move, archive, restore, Company exit | Confirmation names exact object, access/data consequence, and reversibility. Destructive action is distinct, pending is locked against repeat, failure retains context, cancel restores focus. No visual redesign changes authorization. |

Global surfaces outside the 36 route/view count also need an explicit target. `NotFoundPage` uses the public or workspace shell that matches the current session, states which route was unavailable, and offers a safe workspace return. `RouteRecoveryPage` names the failed load, preserves a valid return path, and offers retry when possible. `PwaInstallPrompt` remains a quiet, dismissible prompt after the person has context; it never covers a composer, confirmation footer, or form error. `ThemeToggle` changes the whole token set as one state and announces its current choice. Shared loaders and toasts follow Section 5.2. These surfaces need keyboard, mobile, dark, zoom, and error checks even though they do not add route rows.

## 7. Component architecture

Keep the existing feature ownership and migrate in layers; a separate “revamp framework” would duplicate current primitives. `professional-ui.css` owns semantic tokens and global control geometry, with `foundations.ts` as the typed numeric map. `src/components/ui` owns Button, Input, Select, Tabs, Dialog, Sheet, Popover, Menu, Tooltip, Badge, Toast, and the scoped expanding action group. Each primitive exposes size/state variants that map to semantic tokens; feature styles may arrange them but do not redefine their geometry.

Shared composites should correspond to stable product ideas: `WorkspaceShell` and `ScopeHeader`; `PageHeader` and `WorkToolbar`; `ProjectStatus` with distinct lifecycle/health controls; `ProjectProgressRow`; `TaskRow`/`TaskCard`; `ThreadRow`; `EvidenceRow`; `ChartFrame` with legend/text equivalent; `EmptyState`/`ErrorState`; and `ScopedSearch`. These are candidates to extract from existing implementations only when two real routes need the same behavior. Do not create a file for each icon, tiny label, or one-off decorative wrapper. Company Overview composition remains in the Company feature; Task Board/Calendar/Detail remain in the task feature; Channel timeline/composer remain in workspace; permission rules remain in Convex and shared domain contracts. A shared composite receives the already-authorized view model rather than running its own broad data query.

Design tokens flow `palette → semantic role → primitive → feature composition`. Route state flows `TanStack route/search → scope resolver → authorized Convex query/mutation → feature view model → UI`; links preserve Company/Project/Channel context. Loading/error/empty components take concrete titles and actions from the feature, avoiding generic “Something went wrong” screens. Overlay focus and motion rules live in shared primitives, so Project and Company surfaces cannot silently diverge. Keep Lucide/Hugeicons usage deliberate: choose one icon set per component group and replace mismatched glyphs as the route is migrated.

## 8. Implementation roadmap

No implementation begins as part of this document. Each stage has an observable exit condition and should be delivered in small, reviewable route families.

1. **Restore a reliable local baseline and record evidence.** Reopen an approved development identity and current release configuration, capture the 36 routes/views and 10 overlays in light/dark and key widths, and mark each state observed or unavailable. The current sign-in blocker prevents a valid before/after comparison for protected routes.
2. **Lock foundations and shell.** Align `professional-ui.css` and `foundations.ts` with this contract, settle type/icon/control variants, and migrate Company/Project scope header and navigation. Exit when 320/390/768/1024/1440 widths, light/dark, keyboard, and 200% zoom work on the shell without side borders or clipping.
3. **Revamp the owner overview and Project landing.** Implement the scoped Company hierarchy, calm signals, progress rows, chart/table equivalent, activity links, and separate lifecycle/health controls at Project level. Preserve aggregate and detail access boundaries. Exit when owner and Project-owner paths work with populated, empty, denied, long-name, pending, and error states.
4. **Unify work and conversation routes.** Migrate Company Projects/Tasks/Threads, Project Board/List/Calendar/My/Suggestions, Channel/thread, evidence, and details with shared toolbars/rows. Exit when route links preserve scope, task source context persists, and board/calendar keyboard alternatives work.
5. **Finish administration, account, public, and overlays.** Apply the same form, list, dialog, drawer, and content rules to every remaining row/family. Exit when each route meets its state profile and permission-specific behavior.
6. **Run the full quality gate and visual review.** Compare screenshots against this contract, inspect final diff for accidental parallel tokens, complete project lint/type/test/audit/build and real paths when implementation is actually authorized. Report failures and unverified paths explicitly. A build alone is not acceptance.

The order handles cross-cutting foundations before page styling and keeps authentication behavior unchanged. It does not authorize deployment, commit, production data access, or access-policy changes.

## 9. Final design QA checklist and contract consistency review

### Contract consistency review, completed for this document

- **Internal hierarchy:** Every page uses the same scope/title/action/content order; the owner dashboard's Project rows and chart are deliberate page-specific variants, not competing page shells.
- **Reusable geometry:** One token scale, one set of control heights/radii, one shell width model, and one overlay behavior contract apply across all 36 views and 10 overlay families.
- **Responsive feasibility:** Breakpoints reuse the existing `foundations.ts` values (`700/820/1080/1280`), shell widths (`248/48/288`), and `1280px` content cap. Mobile alternatives are specified for board/calendar and long forms.
- **Accessibility feasibility:** Text equivalents, semantic labels, focus rules, reduced motion, keyboard alternatives, and 200% zoom have explicit component and route expectations. Final contrast and interaction compliance require implementation and browser evidence.
- **Product/data fit:** Chart categories follow the current exclusive task distribution; completion, lifecycle, and delivery health are separate concepts; owner-wide summary data and detailed Project/Channel access remain distinct; sign-in is unchanged.
- **Technical fit:** The contract extends existing TanStack/Convex routes, semantic CSS roles, UI primitives, and current feature ownership. It does not require a new chart or component library.

### Acceptance checklist for each changed route

- [ ] The route and current Company/Project/Channel scope are clear, and URL/back-forward restore the selected view.
- [ ] The first scan reveals the page's primary decision; title, toolbar, and content share alignment.
- [ ] There is no decorative greeting, redundant metric, duplicated search, nested card stack, unexplained line, or permanent shadow.
- [ ] Typography, spacing, radii, icons, borders, and colors use semantic tokens; light and dark states remain coherent.
- [ ] Every control has a visible label or accessible name and distinct hover, focus, active, pressed, disabled, pending, and error states where relevant.
- [ ] Loading, first-use empty, no-results, denied, read-only/archived, failure/retry, success, long-name, and long-content states are reviewed where applicable.
- [ ] Data counts name their scope and denominator; charts have labels, units, a text equivalent, an empty state, and authorized drill-down.
- [ ] Keyboard and pointer paths lead to the same outcome; overlays manage focus/Escape/return; drag has a non-drag alternative.
- [ ] At 320, 390, 768, 1024, and 1440px, plus 200% zoom, there is no page overflow or clipped action; any required inner scrolling is discoverable.
- [ ] Reduced motion and both themes preserve hierarchy and usability.
- [ ] Company owner and Project owner see only permitted data/actions; summary-only Projects expose no task title or thread content without membership.
- [ ] Changed routes have real-path evidence, screenshots for material visual changes, and applicable repository gates with PASS/FAIL/BLOCKED outcomes.

**Design completion status:** The specification is coherent and mapped to the current project. Implementation and real-path acceptance remain **not done** because this request explicitly stops before code changes and protected routes cannot currently be reopened in the local browser.
