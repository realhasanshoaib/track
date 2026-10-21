# Track mobile interaction quality contract

**Status:** target behavior and review standard. This document does not claim that every screen currently meets it.

**Scope:** the iOS and Android mobile app: Companies, Projects, Channels, threads, My Tasks, boards, task detail, Inbox, Profile, settings, search, sheets, media, and shared navigation. The [chat interaction contract](chat-interaction-contract.md) remains the detailed source for composer, message, media, selection, and timeline behavior.

## The standard learned from chat

The chat review began with what a person could see and feel: a bubble changed width after sending, a receipt left an empty patch, a checkbox moved the voice player, deleting a message moved the timeline, a video changed shape when its thumbnail arrived, and the composer stayed busy after a send. Each defect was treated as a state transition, not an isolated screenshot. The same standard applies to every mobile screen.

For any reported hitch, record **the state before the action, the input, the first visible response, every intermediate layout, the settled state, and recovery after failure or cancellation**. Compare the same element's position, size, content, and identity across those frames. A polished final screenshot does not excuse a one-second blank view or a jump during the transition.

| Chat symptom that exposed the problem | Cause to trace | Shared correction |
| --- | --- | --- |
| Pending text or media changed bubble shape after acknowledgement. | Pending and confirmed render paths used different measurements or received media dimensions at different times. | Give one item a stable identity and reserved geometry from creation through confirmation. Progress and receipts update inside that frame. |
| A checkbox appeared too far from a bubble, and a voice player became narrower in selection mode. | The selection rail affected content width or removed a sender avatar. | Place selection outside the content frame; keep bubble width, avatar position, and row height independent of selection. |
| Deleting while reading history jumped toward the top or left a gap until a pill vanished. | A stale absolute scroll offset or delayed row removal competed with list anchoring and feedback lifetime. | Preserve a visible-row anchor. Update the deleted row immediately, and let the notification pill have its own lifecycle. |
| Text left a large empty area above the time and receipt, or media showed two receipts. | Metadata reserved a separate area or more than one component owned the same receipt. | Give metadata one owner and place it in the lower corner without adding a second row or unused height. |
| A video first appeared as a portrait blank tile, then changed shape when its thumbnail arrived. | Thumbnail decoding or late metadata determined layout after the row was visible. | Reserve the aspect-ratio frame before decoding; use the same frame and thumbnail identity in draft, pending, and confirmed states. |
| The composer could not be used while a previous message uploaded. | A screen-level busy flag was coupled to one message's network work. | Move progress, failure, and retry state onto that message. Clear the submitted draft promptly and keep the composer available. |
| A loader or “Load previous messages” control interrupted reading. | Pagination feedback entered or left the message layout and disturbed the visible anchor. | Fetch at the relevant edge, keep any progress region stable, and preserve the first visible row and its offset. |

These are diagnostic patterns, not permission to guess a cause. A fix requires tracing the active code path and reproducing the before and after states. If a cause has not been confirmed for a new screen, record it as a hypothesis until the trace supports it.

## Shared behavior invariants

1. **Immediate response.** A tap, hold, swipe, or submission visibly acknowledges input on the next available frame. Network work cannot delay basic press feedback, pending state, or the next independent action.
2. **Stable geometry.** A control, card, row, badge, avatar, and its surrounding content keep the same frame when only their status changes. Reserve space for content whose size is already known. A list-wide entrance or layout animation must not run for a local update.
3. **Stable identity.** A locally created item keeps its key through pending, success, failure, retry, and reconciliation. A server result replaces its matching local state; it never briefly duplicates the item.
4. **One owner per inset and status.** Navigation, safe area, keyboard, sheet, sticky action, and toast each have a defined layout owner. Do not add the same bottom or keyboard clearance twice. Only one element presents each count, timestamp, progress state, or receipt.
5. **Scroll follows intent.** If the person is following the newest content, new content remains visible. If they are reading an older position, preserve their visible item and pixel offset. A scope change may reset position deliberately, but a background query, deletion, or acknowledgement cannot do so silently.
6. **Local busy state.** Saving one setting, accepting one invitation, uploading one file, or updating one task disables only the action that could be submitted twice. Other valid controls remain usable. Every busy state ends on success, failure, cancellation, timeout, and screen return.
7. **Consistent recovery.** Failure preserves entered text, selected files, task edits, and the relevant context. Feedback names the problem in plain language and offers the next useful action. Retry does not create a second item.
8. **No false empty state.** A loading page, filtered page, or unresolved Company/Project scope cannot be presented as “nothing here.” Counts retain a clearly defined scope when filters change.
9. **Motion explains change.** A peer tab change, detail push, sheet, inline status update, and item removal have distinct movement. Motion stays local to the changed object. Reduced Motion removes decorative movement while leaving state feedback and controls clear.
10. **Accessible interaction.** Every action has a usable touch target, readable label, selected/busy/disabled state, and VoiceOver or TalkBack order. Larger text and long real names may grow or wrap without clipping the action or moving it off screen.

## Screen contracts

| Surface | Required interaction and layout behavior | States to inspect |
| --- | --- | --- |
| Primary navigation | The active destination is unmistakable. The create action never covers the final list item, form control, or task action. Tab changes keep the navigation frame stable and preserve each tab's useful position. | First and last scroll position, keyboard, sheet, large text, light and dark appearance. |
| Companies | Company identity and handle distinguish equal display names. Switching Company updates every scoped count, Project, Channel, task, and invitation together; old Company content is not shown as if it belongs to the new one. One invitation decision does not freeze other invitations. | Two same-name Companies, no Company, pending invitations, rapid switches, slow/failing decision. |
| Projects | Project selection does not insert a new header row or briefly blank the list. Opening a Project preserves its identity from the selected row to its overview. Project summaries and attention items belong to that Project. | Many Projects, long names, archived/inaccessible Project, loading, empty attention, pagination. |
| Channels and threads | Apply the [chat interaction contract](chat-interaction-contract.md) to both screens. Text, image, video, voice, selection, deletion, keyboard, pagination, and retry follow the same rules. | One-line and long text, all media forms, incoming activity, offline, history, rapid send, bulk delete. |
| My Tasks and boards | Filters and view switches keep the surrounding controls fixed. A local task change updates its card and count without recentering the board or moving the reader to another column. The last card and its actions remain reachable. | Empty and long boards, many cards, drag/move, pending update, failure, large text. |
| Task detail | Status, assignee, priority, due date, evidence, and updates keep their meaning while a mutation runs. Fixed actions remain reachable above system insets. Back navigation retains the task and prior list/board context. | Long title/description, keyboard, date picker, concurrent update, access change, offline retry. |
| Inbox | The unread count describes a stable full set unless the label explicitly says it is filtered. Filter and search changes update results inside the content area without shifting the header. One invitation or task action affects its own row. | All/mentions/invitations, no results, many results, unread updates, pagination, failure. |
| Profile and settings | Inputs remain visible and focused while the keyboard opens. Appearance and notification choices acknowledge selection immediately and persist or clearly revert on failure. Save controls never sit behind navigation. | Unsaved edit, validation error, permission prompt, large text, theme change, back/reopen. |
| Sheets, menus, and feedback | A sheet opens from the triggering action, has predictable dismissal and back behavior, and does not change the underlying screen's scroll anchor. A toast or pill confirms one state with one message and cannot block the next action. | Open/dismiss repeatedly, keyboard open, long labels, destructive action, Undo, Retry. |

## iOS and Android: same outcome, native interaction

The meaning, order, persistence, scope, and recovery of an action are the same on both platforms. Materials and system gestures may differ.

| Concern | iOS | Android | Common acceptance |
| --- | --- | --- | --- |
| Keyboard and input | Track the native keyboard frame, including interactive dismissal and safe area. | Use the app's resize policy and system back dismissal without double-counting the keyboard inset. | Focus and caret remain visible; no gap, overlap, or list jump. |
| Navigation | Respect the native back swipe and sheet presentation. | Respect system Back, predictive back where supported, and Android sheet dismissal. | Return to the same Company, Project, item, filter, and sensible scroll position. |
| Press and selection | Use the established iOS material and a restrained haptic when available. | Use the established Android surface and ripple/press feedback; haptic behavior follows device capability and settings. | The action is identifiable without motion or haptics, and the hit area does not move. |
| Confirmation and deletion | The compact confirmation pill may use the approved rounded glass treatment and yellow tone. | Use an opaque, readable pill with the same text, duration, Undo/Retry rule, and safe-area clearance. | Feedback appears once; content changes promptly; the pill never holds layout space after dismissal. |
| Media | Present a full-screen viewer with native safe-area controls and playback. | Present the equivalent viewer using native-capable playback and system Back. | The same thumbnail/frame is visible before playback, and opening or closing the viewer does not disturb the source list. |

Never infer a platform's behavior from the other platform's screenshot. Native modules, keyboard events, safe areas, font metrics, haptics, and back gestures require their own device checks. A JavaScript bundle passing does not prove a native playback module exists in the installed build.

## How to find and fix a defect

1. **Capture the real path.** Record a full-speed session from a clean starting state. Note device, OS, build, screen, Company/Project scope, font scale, theme, connectivity, and refresh rate. Replay the reported action at least twice, then step through frames around the first visible defect.
2. **Write the expected transition.** Name the trigger, the item whose identity must persist, the frame or scroll anchor that must stay fixed, the first feedback, the settled result, and the failure/cancel result. Use the same sentence for iOS and Android before specifying native differences.
3. **Trace ownership.** Follow the input through navigation, local state, query or mutation, optimistic item, list key, layout measurement, animation, and final render. Check for duplicate inset owners, screen-level busy flags, late dimensions, stale offsets, changing keys, and conditional elements inserted above content.
4. **Confirm the cause.** Capture measurements or logs that show where the first wrong frame or state appears. A visual symptom alone is not proof that animation is the cause. Record competing explanations and rule them out.
5. **Fix the shared rule.** Change the owner of the state or measurement, not just a margin in the final screenshot. Keep platform branches only for real native differences. Make the smallest reversible change that preserves existing scope and data rules.
6. **Compare every transition.** Repeat normal, rapid, interrupted, failed, retry, empty, long-content, and background/return paths. Check both the starting and settled frames, plus the frames between them. A correction that fixes one bubble or card but shifts neighboring content fails this contract.

## Evidence and release bar

Maintain one review row per defect with: **screen and state; action; expected response; observed response; first wrong frame/time; root cause and proof; changed owner; Android result; iOS result; regression artifact; remaining limit**. Link recordings and still frames without storing private messages or account data in the repository.

For each changed screen, check normal and large text, light and dark appearance, short and realistic long names, zero/one/many items, offline and slow network, rapid repeated taps, cancellation, background/return, and Reduce Motion. Inspect the first viewport and the last scroll position. A stable screenshot, passing unit suite, or export alone cannot establish smoothness; use full-speed playback, frame-by-frame comparison, and device performance traces for motion claims.

At 60 Hz, a frame has about `16.7 ms`; at 120 Hz, about `8.3 ms`. These are Track profiling targets, not measured results or claims about another app's internals. No sustained visible hitch, unintended geometry shift, duplicate item, blocked independent action, lost draft, or unexplained scroll jump is acceptable. Report unverified iOS or Android behavior as unverified instead of calling the contract complete.
