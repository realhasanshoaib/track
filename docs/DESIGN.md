# Track interface design

Track is a conversation-led workspace for project teams. The mobile app opens on **Messages**, where people can scan recent Channel conversations and enter the work already in progress. Conversation is the product's front door; Projects and tasks stay close to the discussion that gives them context.

The interface should feel quiet, clear, and dependable. Minimalism means removing visual noise and repeated explanation. It does not mean hiding useful context, weakening navigation, or removing working capabilities. Every visible element should help someone find a conversation, understand its scope, read it, or act on it.

## Product hierarchy

Use the product's real structure in this order:

1. **Company** is the shared organization and access boundary.
2. **Project** is the body of team work.
3. **Channel** is the conversation space inside a Project.
4. **Thread** is a focused conversation inside a Channel.
5. **Task** is work that can be discussed, assigned, and tracked with links back to its source conversation.

Keep the active Company, Project, and Channel understandable while a person moves between messages, threads, and tasks. Do not make a generic workspace selector stand in for these identities. A conversation row must make its Channel and Project clear; the current Company scope must remain visible in the screen header or its explicit scope control.

Track has no direct-message surface outside Projects and Channels. Do not borrow one-to-one chat patterns that imply a private conversation outside those access boundaries. Company collaboration can involve several Companies, but a Company label is supporting context and must stay quieter than the people and conversation.

## Web product flow

The web client uses the same Company → Project → Channel → thread → task hierarchy, with desktop navigation and work views. The persistent left rail holds the Company and Project scope, Channel list, project search, Tasks, and settings. A compact header names the current Channel or Project. A right context rail appears only when it helps with the current conversation, such as its open tasks, threads, or project controls. At narrower widths, each rail can collapse or move into a labeled drawer without losing the current scope.

The workspace home groups accessible Projects by ownership and collaboration. A Project row shows its Company, role, recent activity, and Channel count, then opens the Project conversation. Company has separate Overview, Projects, and Threads destinations: Overview summarizes active work and recent activity; Projects is the searchable directory; Threads finds active and archived conversations across accessible Channels. Company administration and account settings stay in their own settings surfaces.

A Project conversation opens on its selected Channel. Its header keeps the Company and Project identity available, while the message stream remains the main reading surface. The composer stays attached to the stream and keeps message, file, voice, mention, and memory actions close to the send action. Channel tabs lead to Tasks and Evidence without changing Company, Project, or represented membership scope.

Tasks keep Board, List, Calendar, Inbox, and detail as views of the same Project work. The view switcher and filters stay near the task content; search and filter choices remain in the route state so a task can be opened and closed without losing the current view. Task detail keeps its source conversation and evidence near its title and status. Moving or scheduling a task gives immediate feedback and preserves the current Project and Channel context.

Evidence is a provenance index for task-linked messages, threads, files, assistant responses, and memory excerpts. Selecting a reference opens its source with the same access scope. When a Project has no evidence, explain how evidence is created and offer a direct route to its Channel. A focused thread keeps its parent Channel, source message, replies, and thread actions together; its context rail explains the Project and participants without duplicating the conversation.

Company and Project settings organize identity, people, Channels, notifications, access, and lifecycle actions into labeled sections. Destructive or audience-expanding actions state the affected Company, Project, and people before confirmation. Settings pages do not hide current scope or rely on hover to reveal important information.

On wide screens, the conversation or current work view receives the largest share of the canvas. Navigation and context rails are secondary and use quiet surfaces with clear separators. On small screens, content stacks or moves into drawers; tables and boards may scroll inside their own region, while the page itself avoids accidental horizontal overflow. Focus, escape-to-close, return paths, and visible scope remain predictable across mouse, keyboard, and touch.

The [Track Web UI/UX Contract and Quality Gates](ui-ux-professionalization.md) defines the required route inventory, visual rules, interaction behavior, and browser evidence for web changes.

## Mobile product flow

### First screen: Messages

After sign-in, open the Messages list rather than a metrics dashboard. The list is the mobile home. It shows accessible Channels ordered by recent conversation activity, with unread Channels and direct replies easy to notice without a separate decorative dashboard.

The first screen has a compact safe-area-aware header, a clear **Messages** title, the active Company scope, and only the actions needed to search, change scope, or open the account. Put search directly below the header when it is useful for finding a person, Project, or Channel. Do not add a greeting, large hero, task totals, charts, decorative illustration, or a second overview of work above the list.

Each conversation row has one clear scan path:

- A small Channel mark or the latest human speaker's avatar anchors the row. Use a real profile image when one is available and an initials fallback when it is not.
- The Channel name is the primary label. Keep it on one line and truncate it before it collides with time or unread state.
- The Project name is the secondary scope label. Show the Company only when it adds information beyond the active scope.
- A single-line latest-message preview follows, with the speaker named when that makes the preview easier to understand. Use “Attachment”, “Voice message”, or similar plain copy when there is no useful text.
- A quiet relative or clock time aligns to the trailing edge. Unread state uses a restrained dot or count plus accessible text; it never relies on color alone.
- A thin divider separates rows. Do not wrap every row in its own raised card.

Use a steady row height and alignment so the eye can compare names, previews, and times. Rows should remain comfortable to tap and work with larger system text. The whole row opens its Channel. Search, filters, and overflow actions have their own touch targets and accessible names.

### Channel conversation

Opening a row takes the person directly into that Channel's conversation. The compact header names the Channel and shows its Project as secondary context. Back returns to the same list position and preserves the search or filter state. Keep overflow actions limited to real Channel actions such as search, members, and details.

The message timeline is the main surface. Use readable message text, clear author and time hierarchy, and enough spacing to distinguish messages without turning each one into a heavy card. Group consecutive messages from the same author where that improves reading, but repeat the author identity when the speaker changes. Replies, attachments, reactions, task references, and assistant responses must be visually distinct by structure and label, not by color alone.

Keep the composer fixed above the safe area and keyboard. It should read as one calm input with a small set of purposeful attachment and send controls. Show the send action only when it can be used, preserve draft text after recoverable failures, and give clear sending, sent, offline, and retry feedback. Do not let the bottom navigation cover the composer or the last message.

### Thread and task context

A thread stays inside its parent Channel. The header provides a direct return to that Channel, names the thread, and keeps the source message visible when the thread was opened from a specific reply or reference. Thread creation, archive, and reopen controls appear only for people who can use them.

Tasks should retain durable links to the messages and evidence that explain them. On mobile, show those references near the task title and status, not in a detached decorative panel. Keep Project and Channel scope visible on task detail and preserve that scope when returning to the conversation.

## Primary navigation

Messages is the first and most prominent destination. Keep the persistent navigation short and stable. The center Create action stays centered in its own cell and raised only enough to be easy to reach; place its center at about 40% of the navigation bar's height as specified for the mobile control. Give every other item equal spacing and remove accidental gaps between icons and labels.

Do not give every feature equal visual weight. Messages leads. Tasks remains a direct destination because it is core work. Company, Project, Channel, Team, Inbox, search, settings, and history remain reachable through clear contextual navigation or a compact secondary surface. Combine duplicate entry points when they lead to the same action. Keep rare administration and account controls out of the primary bar.

Do not delete a route or remove a capability to make the interface look minimal. First remove repeated dashboard summaries, decorative wrappers, and redundant navigation. Move a low-frequency action into the relevant Project, Channel, task, or account menu only when its owner, access rules, and return path remain clear. A feature can be removed only after its product purpose and dependencies are confirmed.

## Visual language

### Palette and surfaces

Use Track's semantic theme tokens and preserve light and dark themes:

- Primary stone: `#1b1917`.
- Accent yellow: `#f0b100`.
- Accent strong: light `#8a6400`, dark `#f5c53d`.
- Paper: `#faf9f7`.
- Secondary paper: `#f3f1ed`.
- Success: `#15803d`.
- Danger: `#b91c1c`.
- Information: `#1d4ed8`.

These values are reference tokens, not permission to hard-code colors in components. Use the maintained mobile, web, and shared theme values. Keep page backgrounds quiet, surfaces close in tone, and separators subtle but visible. Reserve yellow for the main action, selection, unread emphasis, and other meaningful state. Use text-safe accent colors for labels and icons on yellow surfaces.

Light and dark themes share the same layout, hierarchy, and interaction states. Every text field, placeholder, cursor, keyboard appearance, icon, border, sheet, system bar, and prominent action must update with the selected theme. Theme changes apply as one state transition, not as a mixture of old and new colors. Check contrast in both themes.

### Type and spacing

Typography is platform-specific. Operational web surfaces use Inter for interface text, Geist for headings and metadata, and Geist Mono for fixed identifiers through the web design tokens. The native mobile app uses Manrope V5 Static for app-owned text and the platform monospace for fixed identifiers. Native controls keep their platform font. Mobile bundles the original static Manrope files and shows the required attribution in the account's Fonts and licenses section. Avoid oversized headings on operational screens.

Use the platform's shared spacing tokens. Web uses a 4px base scale, with 8px as the normal structural step; mobile follows its native spacing scale. Align row starts, titles, metadata, input edges, and navigation cells to consistent vertical lines. Prefer whitespace and a hairline divider to a border around every component. Use the shared 6px, 8px, and 12px radii for ordinary controls; reserve pill and circular shapes for controls whose meaning benefits from that shape.

### What to remove

Remove decoration that competes with conversation or repeats information:

- Large greeting blocks, dashboard metrics, decorative artwork, and duplicated task summaries from the Messages landing screen.
- Repeated elevated cards around content that already has clear list or section structure.
- Gradients, glass effects, ornamental shadows, thick borders, and large empty banners without a user task.
- Redundant labels, multiple rows of filters, duplicated Company or Project names, and icon-only actions with no accessible name.
- Motion that does not explain navigation, state change, or completion.

Do not remove message identity, access scope, unread state, task-source links, error recovery, or controls required to complete a task. A quiet interface must still explain what is happening and what the person can do next.

## Interaction and responsive behavior

Use native full-screen navigation for mobile destinations. Keep primary touch targets at least 44 points, respect safe areas and keyboard insets, and avoid fixed widths that clip names, avatars, actions, or text at small device widths. Let rows and cards grow when system text is enlarged. Do not solve clipping by shrinking text below a comfortable reading size.

Motion should clarify cause and destination. Keep transitions short and subtle, respect reduced-motion settings, and never delay access to a Channel or its composer for visual effect. Press feedback should be immediate and consistent. Avoid nested touch targets; a row action must not trigger the row action beneath it.

Every asynchronous surface needs loading, empty, success, and failure states. Empty copy should say what belongs there and how it will appear. Failures should name the failed action and give a safe retry when retry is valid. Offline, denied, archived, and read-only states need explicit text. Destructive actions require clear intent and confirmation where recovery is not available.

## Project and Company navigation

Company is the umbrella for owned and collaborating Projects, not a separate application mode. Group Projects by Company without duplicating a Project's work. A Project can be internal and does not need a partner relationship. Existing Projects without a confirmed Company assignment stay reachable from the Company hub. Assignment is explicit; navigation never silently assigns a Project or widens access.

Show Company identity when it changes interpretation. Acting Company is explicit in scope controls and Project administration. Compact Company labels may accompany a person, invitation, represented Project membership, or approval when needed. The label remains secondary to the person or conversation.

When navigation collapses, preserve Company and Project identity, grouped controls, accessible names, and header actions. Long names must truncate inside their own space and must not push the scope switcher or actions off-screen. Conversation and task routes use the same Company and Project context.

Restricted administrative surfaces explain the access boundary without exposing Channel names, counts, snippets, or member activity. Audience-expanding invitations name the Companies and people that gain access before confirmation. Exit archives state the owning Company and frozen cutoff clearly. Snapshot preparation has a temporary read-only state until capture succeeds or is canceled; only authorized Company administrators see capture controls.

## Threads, references, and assistant responses

Thread lists live inside their parent Channel and separate active from archived discussion. Each row states follow and unread status in text. Loading older replies must not replace the current stream. Archived threads and archived parent Channels have no composer or creation controls.

Keep `@track` responses close to the accessible references that support them and label assistant responses as assistant content. Do not turn an AI answer into a durable work item without a human creating or confirming a task. Imported memory, references, task suggestions, and previews preserve their Company, Project, and Channel access scope.

Mobile Channel conversations use the shared composer for files, voice, mentions, emoji, and scoped memory import. Each action preserves the represented Company membership and destination Channel. Preserve unsent text after a send failure. Distinguish loading, empty, offline, denied, conflict, and read-only states without relying on color.

## Implementation boundaries

Keep design decisions in the owning feature and keep semantic colors, spacing, type, and interaction primitives shared. In the web app, `CompanyProjectPage` resolves route scope and subscriptions, `CompanyProjectConversation` composes navigation, timeline, and composer, and `CompanyProjectAdministration` owns membership and archive controls. `CompanyProjectNavigation` and typed Company Project links preserve represented membership context across conversation and task routes.

In mobile, Expo Router owns destination and back-stack behavior. Shared conversation, thread, composer, task, and Company/Project components own their respective content. Do not copy platform or framework imports into `packages/shared` theme and domain helpers.

## Accessibility and quality bar

- Support keyboard navigation and visible focus on web.
- Use semantic controls with concise accessible names and state announcements.
- Keep mobile touch targets at least 44 points.
- Meet WCAG AA contrast for text and meaningful controls in light and dark themes.
- Support system text scaling without clipping or hiding actions.
- Announce async failures and significant state changes to assistive technology.
- Make permission, unread, mention, report, blocked, and read-only states understandable without color alone.
- Keep references and permission explanations readable without hover.

The product terms are Company, Project, Channel, thread, task, board, and reference. Use those terms consistently in labels and empty states. Task management and Channel threads are production features and stay independently controlled by server-authoritative release settings.
