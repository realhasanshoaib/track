# Minimal Mobile UI: A Practical Design Standard

Minimal design is not the removal of detail. It is the careful selection and ordering of detail so people can understand a screen, act with confidence, and recover when something goes wrong. A screen feels clean when every visible element has a clear job and the important job is easiest to see.

This guide turns that idea into a practical standard for designing and building professional mobile apps. It applies to iOS and Android product screens, flows, and shared components. It complements [Track's mobile UI/UX guide](./mobile-ui-ux-guide.md), which defines Track's product behavior, visual language, and screen patterns. When the two documents differ, use the product-specific guide for Track decisions and this guide for general design reasoning.

## Minimal UI starter specification

The [shared app-design checklist](https://x.com/Vedantdzn/status/2105724724617843196) gives a compact starting set of values. Use them to make early screens coherent, then adjust them when real content, platform behavior, or accessibility requires a change. Treat its pixel values as design references: implement with platform-independent points on iOS and density-independent units on Android, not raw device pixels.

| Element | Starting value | How to apply it |
|---|---|---|
| Type family | SF Pro, Regular and Medium | Use SF Pro on Apple platforms where it fits the product. Use the platform's native sans-serif on Android unless the brand has a justified cross-platform font. |
| Type sizes | 14/18, 16/20, and 18/22 px | Read each pair as font size and line height. Assign each pair a stable role, such as compact metadata, body text, and section heading. Check the result with system text scaling. |
| Primary text | `#000000` | Treat this as a light-theme starting color, not a universal token. Map it to a semantic primary-text role and choose a suitable dark-theme value. |
| Subtle text | `#666666` | Use for secondary information only when it remains readable at its actual size and weight against the surface. Avoid reducing opacity without checking the resulting contrast. |
| Label-to-list spacing | 12 px | Keep a label close to the list it introduces so the visual relationship is clear. Increase or decrease it only to resolve a real grouping problem. |
| Section spacing | 28 px | Use this as the default separation between distinct content groups. A consistent section rhythm makes a screen easier to scan. |
| Navigation icons | 24 px | Use a consistent icon box and align each symbol to the same optical center. Keep the containing touch target larger than the glyph. |
| List icons | 28 px | Use when the icon needs to carry more weight beside a list item. The icon's visual size is not its touch-target size. |
| List padding | 12 px vertical, 20 px horizontal | Apply inside each row, then check that the resulting row height supports comfortable touch and long content. |
| Button height | 44 px minimum | Treat this as a minimum visual control height, not a maximum. Follow stricter platform touch-target guidance when required. |
| Button horizontal padding | 16 px | Use as the starting inset around the button's content. Keep button edges aligned with nearby layout rules. |
| Button label inset | 4 px on each side | Apply only when the button composition uses a separate text layer inside the button content. Avoid adding a second inset accidentally through nested components. |
| Button icon gap | 0 px by default | Keep an icon snug to its label when both form one compact action. Add a small gap if the icon and words look crowded or read as separate elements. |

The checklist's `px` values are useful for comparing proportions, but mobile implementation uses logical units rather than physical screen pixels. A 44-point iOS control and a 44-dp Android control do not mean the same physical pixel count on every device. Keep the role and proportion consistent, then verify the rendered control and its full hit area on each platform.

These numbers are defaults, not a design system by themselves. Before reusing them, check the product's existing tokens, theme, platform, content density, localization, and text-size settings. Keep early choices constrained; add variants only when a real screen or user need calls for them.

## 1. Start with the user's task

Before arranging controls, state who is using the screen, what they came to do, and what a successful result looks like. A screen should make one main task clear. If it serves several tasks, give them an order instead of giving them equal visual weight.

Write a one-sentence screen brief:

> For **[person and situation]**, this screen helps them **[task]** by showing **[needed information]** and making **[next action]** clear.

Then answer these questions:

- What does the person need to know before acting?
- What is the primary action, and what changes after it succeeds?
- What context must remain visible so the action is safe and understandable?
- What can fail, and how can the person recover?
- Which details can wait until they are needed?

Do not choose a visual style before these answers are clear. A minimal screen with the wrong content order is still difficult to use.

## 2. Build hierarchy before decoration

People scan a phone screen in short bursts. Put the screen title and most useful content where they can find them quickly. Group information by meaning, then separate groups with spacing, typography, or a quiet divider.

Use this order of emphasis:

1. **Meaning:** put the most important information first and name it plainly.
2. **Position:** place related content together and keep repeated edges aligned.
3. **Space:** use a consistent spacing scale to show grouping and separation.
4. **Type:** use size and weight to distinguish title, body, label, and supporting detail.
5. **Color and shape:** reserve stronger treatments for actions, selection, and meaningful state.

This order keeps hierarchy understandable even when color is unavailable or a person uses a screen reader. Do not use a large card, shadow, accent color, or icon to compensate for unclear content.

## 3. Remove noise without removing meaning

An element earns its place when it helps someone understand, decide, act, recover, or recognize the product. If it does none of these jobs, remove it or show it only when needed.

Before keeping a visible element, ask:

- Does this help the current task?
- Is the information already clear elsewhere?
- Does this need to be visible now, or can it appear after a relevant action?
- Does its visual weight match its importance?
- If I remove it, can the person still understand what to do?

Reduce repeated labels, decorative icons, unnecessary borders, nested cards, redundant summaries, and secondary actions that compete with the main action. Keep necessary status, scope, ownership, pricing, safety, and permission details visible when hiding them could cause a wrong decision.

Minimal does not mean sparse at any cost. Empty space should improve grouping and reading. It should not push useful content below the fold or make a screen feel unfinished.

## 4. Use a small, consistent visual system

Define a compact set of semantic tokens before polishing individual screens. Tokens keep the interface coherent and make later changes safer.

The system should name:

- **Color roles:** canvas, surface, primary and secondary text, border, action, focus, success, warning, and error.
- **Type roles:** screen title, section title, body, control label, and supporting detail.
- **Spacing steps:** a short scale for screen padding, groups, rows, and compact alignments.
- **Shape roles:** control, compact surface, and larger grouped surface radii.
- **Interaction roles:** focus, pressed, selected, disabled, loading, and feedback states.

Use semantic names such as `text.secondary` or `surface.selected` instead of names tied to a specific screen or raw color. Keep one source of truth in the existing theme and component system. Avoid adding one-off values when a defined token can express the same intent.

Choose one purposeful accent and use it consistently. Color must not be the only way to communicate state: pair it with a label, icon, shape, or position. Check contrast in both themes and with the actual text size and weight.

## 5. Make typography easy to scan

Type carries hierarchy and tone. Use a small number of roles and keep their use predictable. Reserve the largest style for the screen's main heading. Use body text for explanations and labels for controls or compact metadata.

- Prefer short, specific headings over clever or vague ones.
- Use sentence case for titles, labels, and actions.
- Keep body text comfortable to read and avoid shrinking essential details to make a layout fit.
- Use weight and spacing before adding more type sizes.
- Keep related metadata together and make its purpose clear.
- Allow text to wrap or grow when system text size increases.

Use real examples during design. Long names, translated labels, large values, and multi-line messages reveal layout failures that placeholder copy hides.

## 6. Design for touch and platform behavior

Mobile controls need room for fingers, clear feedback, and predictable system behavior. Follow the platform's native conventions when they make the task easier to learn. Use custom controls only when they solve a real product need, and give them the expected accessibility and interaction behavior.

- Meet the platform's minimum touch-target guidance and leave enough space between adjacent actions.
- Give every tappable control an immediate, visible pressed or progress state.
- Keep primary actions in a stable, reachable location when the task benefits from it.
- Respect status bars, notches, home indicators, navigation bars, and keyboard insets.
- Make back, dismiss, and cancel behavior predictable on both platforms.
- Use platform pickers, menus, alerts, and navigation patterns where they fit.
- Never make an icon look interactive if it does nothing.

Do not hide a frequent or essential action behind an unfamiliar gesture. Swipes can speed up secondary work, but provide a visible path to the same action.

## 7. Treat words as part of the interface

Good interface writing lowers the amount of interpretation a person must do. Use the user's vocabulary and describe actions from the user's point of view.

- Name buttons with the outcome, such as **Save changes** or **Send reply**.
- Keep the same action name throughout the flow and in its success message.
- Give fields persistent labels; use placeholder text only as an example.
- Explain a disabled action when the reason is not obvious.
- Write errors that say what happened and what the person can do next.
- Write empty states that explain what belongs here and offer one useful next step.
- Keep confirmation messages specific enough to reassure the person that the action completed.

Avoid internal terms, unexplained abbreviations, jokes during failure, and vague messages such as `Something went wrong` when a safe next step is available. Keep the tone calm and respectful.

## 8. Design every state, not only the ideal screen

A screen is a set of states connected by user actions and system events. Design the full set that can occur before implementation so the layout and copy do not collapse when data is missing or a request fails.

Consider these states where they apply:

- **Loading:** show progress that matches the amount and shape of expected content.
- **Empty:** explain why there is no content and offer the next useful action.
- **Partial:** keep available information usable while clearly marking what is missing.
- **Error:** explain the failure safely, preserve user input, and offer retry or another recovery path.
- **Offline:** show whether content is current and whether an action is queued or unavailable.
- **Disabled:** make the unavailable state clear and explain how to make the action available.
- **Success:** confirm what changed and preserve a clear route to the next task.
- **Permission denied:** explain the access boundary without exposing protected information.

Do not clear a form just because submission failed. Prevent accidental double submission, and make irreversible actions clear before they happen. Prefer undo when it is safe and reliable.

## 9. Make accessibility part of the design

Accessibility is a core quality requirement. It makes the interface usable across different vision, movement, hearing, and cognitive needs, and it often improves clarity for everyone.

- Use native controls where possible and provide accessible names for icon-only actions.
- Keep reading and focus order aligned with the visual order.
- Support screen readers, system text scaling, display zoom, and platform contrast settings.
- Provide visible focus for hardware keyboard and switch use where supported.
- Pair color with text or shape so meaning survives color-vision differences.
- Respect reduced-motion and reduced-transparency preferences.
- Ensure dialogs and sheets announce their purpose and can be dismissed predictably.
- Test with assistive technology; automated checks alone do not prove the task works.

Use WCAG 2.2 AA as the general web-content reference where it applies, alongside current Apple and Android platform guidance. Verify the actual native experience on supported devices.

## 10. Use motion only when it explains something

Motion can show where a screen came from, confirm an action, or help a person follow a change. It should not delay a frequent task or make important content move without a reason.

Before adding an animation, name its purpose: feedback, continuity, state change, orientation, or rare delight. If the purpose is unclear, use the platform default or remove the motion. Keep common actions fast, support reduced motion, and test gestures when interrupted as well as when completed.

Workspace state changes use `src/constants/motion.ts`; chat aliases these settings
from `src/components/chat/message-motion.ts`:
200 ms entrances, layout changes, and image cross-fades, with 140 ms control
exits. The composer reserves one fixed slot for send and voice controls so
switching modes does not rewrap the draft. The selected attachment tray expands
or closes with the same easing and closes when sending starts. Message
images reserve their dimensions before decoding and retain those dimensions
on failure. Conversation and thread handoffs warm the confirmed image cache
before replacing a local thumbnail, with a two-second fallback for slow or
failed loads. Reduced motion disables these transitions.

Project expansion, task-board cards, Company rows, Inbox rows, and the task
update composer use the same state easing and timing. Native navigation keeps
its platform animation. Company logos reserve their mark size, display a neutral
placeholder while decoding, and cross-fade into the loaded image.

Submission ownership is synchronous (`src/lib/submission-state.ts`). A second
tap cannot start an overlapping action before React renders its busy state.
Task comments and creation retain their idempotency key when retrying an
unchanged payload. Successful saves clear only the submitted draft; text entered
afterward and reopened editors survive late responses. Dismissing an in-flight
draft detaches its UI ownership while keeping its retry key, so reopening it
cannot duplicate a successful comment or task commit. Project creation protects
draft ownership but does not add server idempotency.

Project and Channel directories load incrementally. Project attention keeps its
heading and loading state visible and offers an explicit continuation button;
it does not fetch the entire Company feed merely to show three updates. Inbox
keeps its search and filters mounted while loading and distinguishes no matches
in loaded pages from a fully exhausted result. Personal Projects stays selected
in My Tasks rather than silently selecting a Company. Its Project, task, and
board requests use the optional `personalOnly` backend scope before pagination
or hydration; existing callers that omit it retain their cross-Company view.

Development-only `/dev/workspace-interaction-preview` exercises the production
Project cards, attention section, board, and task composer with long text,
two-second responses, failures, and a short board viewport without backend writes.

Only one voice note plays at a time across message rows. Starting another note
pauses the previous player. Play and pause actions read the live player state,
so rapid taps do not depend on the next playback-status render.
On iOS, inline voice controls stay outside the SwiftUI context-menu host;
long-press and swipe actions use the existing message-action sheet. Holds on
the playback controls also open actions; waveform holds do not seek, and duplicate
delivery from the waveform and parent bubble opens actions only once. Playback
position on iOS updates every 100 ms and interpolates linearly over 120 ms while
playing. Android keeps its 500 ms native interval to avoid extra polling for
paused notes and projects progress between timestamps at the actual playback
rate. Pause, buffering, and Reduce Motion stop interpolation. Played
bars use the accent color, while unplayed bars remain muted.

Do not use animation to hide slow work. Show progress honestly, keep the interface responsive, and preserve the person's place and input when an operation takes time.

## 11. Protect performance and perceived speed

Fast response supports trust. Show feedback as soon as an action is accepted, then reconcile with the server when the product can do so safely. If an optimistic change fails, explain the rollback and let the person recover.

- Keep lists smooth with stable item identity and appropriate virtualization.
- Load images at a size suited to their rendered space.
- Use skeletons only when the content shape is known; otherwise reveal content progressively.
- Avoid a full-screen spinner for an update that affects only one part of the screen.
- Measure slow startup, typing, scrolling, and transitions on representative devices.
- Optimize measured bottlenecks instead of adding memoization or packages by guesswork.

Performance claims need measurements from the build and devices that represent the supported range. A smooth development preview is not enough evidence for release quality.

## 12. A practical design and review process

Use a short, evidence-led loop. Keep each decision tied to a user task and test the highest-risk assumption early.

1. Define the person, context, screen job, primary action, and success condition.
2. List the required information, permissions, and states before arranging the layout.
3. Inspect the existing app, design tokens, components, platform conventions, and close product references.
4. Sketch the content order and main interaction before choosing visual details.
5. Set the type, spacing, color, and shape rules using the current design system.
6. Build one complete path, including an error or recovery path, before polishing minor states.
7. Run the app on a simulator or device and inspect the result with realistic content.
8. Check both themes, large text, keyboard behavior, safe areas, screen-reader labels, and reduced motion.
9. Remove one element that has no clear purpose, then confirm that meaning and task completion remain intact.
10. Review the changed screens and flows again after the final implementation.

For each major choice, use this reasoning pattern:

> Because **[user need or constraint]**, the screen uses **[design choice]** so the person can **[observable outcome]**. We will check it by **[test or evidence]**.

## 13. Final quality check

Before calling a screen ready, confirm that:

- The screen's purpose and next action are clear at a glance.
- The order of information supports the task and keeps important context visible.
- Visual emphasis matches real importance; decoration does not compete with content.
- Labels, actions, errors, and success messages use clear and consistent language.
- Loading, empty, error, offline, disabled, and permission states work where relevant.
- Touch targets, text scaling, contrast, focus, and screen-reader labels are usable.
- Back, cancel, keyboard, safe-area, and sheet behavior feel correct on the target platforms.
- Long and translated content does not clip, overlap, or hide actions.
- The main flow works on a real simulator or device, not only in a static mockup.
- Every remaining element helps understanding, action, recovery, trust, or identity.

## 14. Regression verification

Run the repository gate: `pnpm lint`, `pnpm typecheck`, `pnpm test`,
`pnpm audit --prod`, and `pnpm build`. With the mobile web development server
running on localhost:8083, run the fixture suite with
`pnpm exec playwright test --config e2e/mobile-workspace.config.ts`.
Its JSON report is `artifacts/mobile-regression/browser-results.json`.

The fixture matrix covers Company selection and Personal scope with demo,
worst-case, empty, one-item, and many-item data at 320, 390, and 834 pixels;
My Tasks search and narrow layouts; interrupted, failed, and retried comment
sends; reopened drafts; optimistic Board moves, undo and rollback; loading
states; dark appearance; reduced motion; and actual browser audio clocks.
Fixture callbacks do not prove authenticated mobile route controllers or iOS
audio behavior. Authenticated web checks separately cover remote Task draft
refresh and Board status changes. Calendar drag-and-drop remains a failing
regression check.

Browser voice controls still have an intermittent first-tap failure: the real
audio test sometimes records no playback call after a single enabled-button tap.
Normal and reduced-motion waveform checks, pause, switching notes, and control
holds have passed in focused runs, but the intermittent tap prevents a complete
browser regression pass. The Profile diagnostic entry check also fails while
the Development checks block remains commented out.

iPhone Expo testing confirms sent-note Play and Pause and smooth waveform
progress after the inline playback touch fix. Other native cases below still
require device verification. The development route `/dev/attachment-preview`
provides the voice playback check; the Profile entry is currently commented out.
The “Native audio check v2” panel uses the bundled audio
asset with independent Play and Pause commands and displays load, playback,
buffering, elapsed time, tap count, and an error flag without private URLs.
Reload the current bundle, play for two seconds, pause, and compare this panel
with the message voice controls below it. Record both sound and timer behavior.
The additional Play/waveform control-hold callbacks have browser evidence but
still need an iPhone check; the earlier iPhone confirmation predates them.

Native checks must also exercise switching notes, rapid taps while buffering,
recording then playback, sending text/voice/images/files with the keyboard
shown and hidden, adding/removing image previews, image reveals on slow
connections, Task drafts edited during saves, and the same flows with iOS
Reduce Motion enabled. Browser evidence cannot substitute for these checks.

For route-opening lag, the development route `/dev/performance-check` provides
the Screen lag check; its Profile entry is currently commented out.
Start a recording, reproduce the Task detail, Tasks / Board,
and Chat opening/back paths, then return and stop. The capture lasts at most
two minutes, keeps four bounded route aggregates in memory, and records no
account identifiers, Project names, or message contents. It measures React
render work inside each focused screen and JavaScript scheduling delays
while the app is active; inactive-screen renders are excluded from the screen
aggregates. It does not measure native FPS, network latency, or
tap-to-first-paint time. Recording does not remount the navigation tree.
Use the same build, device, data, and Reduce Motion setting for comparisons;
separate first openings from repeated openings. Development profiling adds
overhead, so release performance still needs a release build on a device.

## 15. References

- [Track Mobile UI/UX Guide](./mobile-ui-ux-guide.md): Track-specific visual direction, navigation, screen patterns, and product behavior.
- [Track Mobile UI/UX Review](./mobile-ui-ux-review.md): Existing screen review notes and verification evidence.
- [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/): Current Apple platform design guidance.
- [Material Design](https://m3.material.io/): Current Android and cross-platform design guidance.
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/): Accessibility criteria for web content and related interfaces.
