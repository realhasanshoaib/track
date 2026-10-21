# Chat Interaction & Behavior Contract

**Status:** implementation contract for the mobile Channel and thread chat
surfaces

**Scope:** interaction, motion, layout stability, and message submission. This
does not authorize new chat features.

## Reference and limits

This contract uses WhatsApp's publicly documented chat and media flows as a
behavioral reference: text is composed in the conversation, media is selected
before sending, and media can be edited, captioned, and sent with a quality
choice. Meta also describes an expandable attachment tray on iOS. Public
material does not publish WhatsApp's private animation timings, keyboard
tracking implementation, list anchoring algorithm, or frame budget. Values
below are Track engineering targets, not claims about WhatsApp's internals.

References: [WhatsApp media editing](https://faq.whatsapp.com/812276063311533/?cms_platform=iphone&locale=en_US),
[WhatsApp Enter key behavior](https://faq.whatsapp.com/android/chats/how-to-configure-the-enter-key?lang=sq),
and [Meta's WhatsApp interface update](https://www.meta.com/design-at-meta/blog/whatsapp-user-interface-update/).
Track uses `react-native-keyboard-controller`'s frame-synchronized
`KeyboardStickyView` for the docked composer. Its documented behavior moves the
view with the keyboard without resizing its contents:
[KeyboardStickyView](https://kirillzyusko.github.io/react-native-keyboard-controller/docs/next/api/components/keyboard-sticky-view).

## Layout invariants

1. The composer is one docked surface. Its bottom edge is at the keyboard's top
   edge while the keyboard is visible, with a `0 pt` external gap. Safe-area
   padding belongs inside the composer surface; keyboard height must not become
   composer content padding.
2. The message list owns its viewport and scroll position. Sending appends one
   optimistic tail item; it does not change the measured height or position of
   any existing row.
3. Each message row has a stable key for its lifetime. A server-confirmed
   message reconciles with the matching pending item instead of appearing as a
   second row.
4. When the reader is at the latest edge, new outgoing and incoming messages
   keep the latest edge visible. When the reader is reading history, new
   messages do not pull the viewport away.
5. Loading older messages above the viewport preserves the first visible
   message and its pixel offset. The date marker and message geometry remain
   stable while this happens.
6. The composer supports one through four visible text lines. Further text
   scrolls inside the input; it does not move or resize message rows. Deleting
   text keeps the last measured height until the native input reports its new
   size, so a line does not collapse and rebound between keystrokes.
7. Attachments remain visible either as draft previews in the composer or as
   the same files in the optimistic outgoing bubble. They must not disappear
   between those states.
8. Text bubbles stay within `70%` of the screen width (capped at `480 pt`) and
   wrap to their content width when they do not need the full cap. Timestamps
   and read receipts sit snugly in the lower trailing corner; they must not
   leave a conspicuous empty area above them. Media receipts stay inside the
   lower trailing corner of the media frame and appear once.
9. Selection indicators sit outside each bubble with a fixed `8 pt` gap: left
   of outgoing messages and right of incoming messages. Entering selection keeps
   the bubble and voice-note widths and incoming sender avatars.
10. Deleting selected messages hides them immediately and shows a compact pill
    above the composer for about 2.5 seconds. Its confirmation text remains
    "Message deleted" (or "Messages deleted") with the same Undo button and
    yellow surface until it disappears; no second confirmation state appears.
    Undo is available until the delete request starts. Delete-for-everyone immediately
    changes each selected bubble to its deleted-message label; Hide for me
    collapses the selected rows once. Undo restores the original content at the
    same scroll anchor. Row height changes use the shared chat layout transition
    and do not collapse then reopen during the Undo window. A failed delete
    restores the original content and keeps a compact Retry pill until retry
    succeeds.
11. Pending and confirmed rows use the same vertical gaps in Channel and Thread
    views. Consecutive messages from the same sender remain grouped; a sender
    change uses the same wider gap before and after acknowledgement. Adjacent
    deleted messages from that sender keep the grouped gap when a date pill is
    hidden because the day has no remaining content. Pending and confirmed text
    use the same rule for placing delivery metadata inline or below the body.
12. Failed image and video attachments stay removable. Their Retry pill remains
    visible until retry succeeds or the failed attachment is removed. The compact
    Retry pill floats centered above the composer without resizing the chat
    viewport. A sending message alone stays pending while the composer remains
    available for another draft. A short server send limit waits and retries
    with the same idempotency key in submission order; a persistent limit leaves
    the failed item recoverable without weakening the server limit.
13. A selected video uses a frame thumbnail, duration, and play control in the
    composer, without a filename bar. The sent video uses the frame's aspect
    ratio, with portrait previews capped to the chat viewport, and keeps its thumbnail, duration, and one timestamp/read receipt
    inside the video frame. Only the play control opens full-screen playback;
    holding the frame opens message actions. Sending leaves no empty tile under
    the composer. A measured ratio is cached on device for later chat mounts;
    a newly encountered video still needs server dimensions to reserve its
    exact frame before the thumbnail is decoded. A generated thumbnail is kept
    in a bounded local disk cache under the video's stable ID, so acknowledgement
    and reopening do not decode the signed video again. Stored JPEG posters use
    a stable image-cache key even when their signed URL rotates. When the backend action is available,
    new sends publish a small JPEG poster on the attachment after the video
    send succeeds, giving other members an image-sized source on first open.
    Failure to load or write the optional local poster cache does not fail a
    completed video upload or block its message attachment.
    Older videos without a stored poster
    still need one frame extraction per device.
    Opening the player presents
    the full-screen viewer immediately with the cached thumbnail while native
    playback loads, then reveals the first rendered video frame.
14. The composer keeps the cursor and content vertically centered as it grows
    through four visible lines, then scrolls internally. Clearing a draft also
    clears its old measured height.
15. Text and voice recording activity is scoped to the current Channel or
    Thread. Incoming activity appears as an avatar and animated three-dot
    bubble, with a floating microphone badge while recording. It follows the
    latest edge only when the reader is already following latest.
16. A task created from a message or assistant answer appears within that
    source bubble as an inset section. It does not add a second timeline row or
    change the spacing of the next message when task links load.

## Requirements and acceptance criteria

### R1 — Keyboard docking

**Trigger:** the message input gains or loses focus; the keyboard opens,
closes, changes height, or is dragged interactively.

**Behavior:** move the composer as a whole with the native keyboard frame using
the same progress and timing supplied by the operating system. Android uses
`adjustResize` to dock it; iOS uses the keyboard frame. Do not run a
second JS timer or independent spring. Keep the composer bottom edge flush with
the keyboard top (`0 pt` gap); on dismissal, return it to the normal safe-area
and tab-bar position. A hardware keyboard or floating/split keyboard must not
cause the composer to jump by a guessed full-screen keyboard height.

**Acceptance:** at every sampled keyboard frame, the composer does not overlap
the keyboard and does not leave a visible gap. Focus does not drop during the
transition. Interactive drag dismissal tracks the finger and settles with the
keyboard. Rotation and keyboard-height changes recalculate the dock without a
stale offset.

### R2 — Non-blocking optimistic send

**Trigger:** Send is pressed with non-empty text, one or more attachments, or
both.

**Behavior:** synchronously guard against duplicate taps, insert one pending
message on the next UI commit, clear only the submitted draft, and start upload
or persistence without waiting to reveal the message. Keep the pending item
visible with a non-blocking sending state. Reconcile it by stable client key and
server id. A failed request returns the draft and offers retry; an attachment
failure keeps successful message text and failed file identities recoverable.
Backend mutations are bounded to `30 s`; raw file uploads are bounded to
`120 s`. Timeout returns the composer to a retryable state and preserves the
idempotency key for the same draft.

**Acceptance:** the pending item appears before the network response; exactly
one confirmed message remains after acknowledgement; repeated taps create at
most one submission; no control remains permanently busy after success,
failure, cancellation, or screen backgrounding. Retry uses the original
idempotency identity for the same draft.

### R3 — Stable list insertion and anchoring

**Trigger:** a pending or confirmed message is inserted, attachment geometry
resolves, or an incoming item arrives.

**Behavior:** append at the tail without remeasuring neighboring rows. Use a
short opacity entrance for the new item only; the list already moves to follow
the inserted row. Do not apply layout animation to
existing rows during send acknowledgement. If the reader is within `80 pt` of
the latest edge, keep the latest edge pinned; otherwise preserve their current
offset and show the new-message affordance.

**Acceptance:** record the visible row keys and frame positions immediately
before and after send. Every pre-existing row retains its frame within `1 pt`
after layout settles. At the latest edge the outgoing message is fully visible;
away from the edge the scroll offset remains within `1 pt`.

### R4 — History prepend

**Trigger:** the reader requests older messages or pagination prepends them.

**Behavior:** maintain the first visible row and its relative offset while
older rows are inserted before it. Keep pagination and loading indicators
outside message identity and row keys.

**Acceptance:** the same first visible message remains at the same screen Y
coordinate within `1 pt` after pagination completes. Repeated paging does not
duplicate messages or jump to the latest edge.

### R5 — Attachment draft and send handoff

**Trigger:** the person selects, removes, retries, or sends one or more files.

**Behavior:** render each selected file in the composer preview strip with a
stable identity, thumbnail or file icon, filename, and upload state. Add/remove
uses a local layout transition (`200 ms`, cubic ease out); the list and
keyboard do not animate as a side effect. On send, transfer those exact file
identities to the optimistic message in the same commit that clears the draft.
Failed uploads remain retryable and cannot silently disappear.

**Acceptance:** every selected file appears once in the composer; removal
removes only that file; after send, every file appears once in the pending or
confirmed message; retry sends only failed files; switching app state does not
leave the send control stuck.

### R6 — Composer growth

**Trigger:** text crosses line boundaries or an attachment/reply preview is
added or removed.

**Behavior:** grow the input through four visible lines. Animate composer height
changes with a layout transition (`200 ms`, ease in/out); preserve the
input caret and current bottom-edge relationship. Scroll content receives the
new composer clearance without changing message row heights.

**Acceptance:** test 1, 2, 4, and 5+ lines, adding/removing previews, and typing
while the keyboard is opening. No clipping, caret reset, row reflow, or change
to keyboard docking occurs.

### R7 — Keyboard dismissal and scroll

**Trigger:** drag the conversation list while the keyboard is open, tap a
non-input action, or use the platform keyboard-dismiss gesture.

**Behavior:** on iOS, list drag uses interactive keyboard dismissal; on
Android, drag dismisses the keyboard. Tapping controls that operate within the
composer does not dismiss it. The latest-edge anchor is updated only in
response to real user scroll, not a keyboard frame event.

**Acceptance:** downward drag moves the keyboard and composer together; a
deliberate scroll away from latest cancels automatic tail pinning; tapping an
attachment or send control performs its action without an unexpected keyboard
flash.

### R8 — Jump-to-latest affordance

**Trigger:** the reader is more than `80 pt` from latest and new messages arrive.

**Behavior:** show a `44 pt` minimum target above the composer, with an optional
new-message count. Enter uses opacity/vertical movement over `180 ms`; exit
uses `130 ms`. Press scales to `0.96` over a `140 ms` spring and returns over
`170 ms`. Activating it haptically acknowledges the action
and scrolls to latest.

**Acceptance:** it never covers the composer or latest message controls, count
clears at latest, and it is absent when already within the threshold.

### R9 — Reply and message actions

**Trigger:** swipe to reply, long-press a message, or tap a quoted message.

**Behavior:** reply context is shown above the input and stays until sent or
explicitly dismissed. Long-press actions use a minimum `44 pt` target and do
not accidentally trigger the row's normal tap. Quoted-message navigation
preserves the current thread scope.

**Acceptance:** reply target identity remains correct during pagination and
incoming messages; dismissal clears only reply context; action menus do not
move the composer or alter row measurements.

### R10 — Feedback and accessibility

**Trigger:** send, add/remove attachment, jump to latest, reply, or destructive
message action.

**Behavior:** use a light haptic for navigation and attachment actions, a
medium haptic for send, and platform accessibility labels/states for busy,
failed, retry, and attachment removal. Respect reduced-motion settings by
removing nonessential transforms and transitions while preserving state
feedback.

**Acceptance:** all chat actions can be identified and activated with VoiceOver
and TalkBack; sending/failure announcements are polite and do not repeat on
every upload progress update; reduced-motion mode has no decorative movement.

### R11 — Background, foreground, and rotation

**Trigger:** app backgrounds during typing/upload, resumes, or device rotates.

**Behavior:** preserve the draft, pending identity, attachment identities, and
retry state. Recompute safe area, keyboard frame, composer clearance, and row
width from current dimensions. A backgrounded request may complete, but its
completion must not replace a newer draft.

**Acceptance:** resume shows no duplicate message, stale busy state, keyboard
overlay, stale image size, or lost unsent file. Rotation preserves the visible
message anchor and send/reply state.

### R12 — Frame and motion budget

**Trigger:** all keyboard, send, attachment, list, and composer transitions.

**Behavior:** keyboard motion is frame-driven by the native keyboard events.
Other interaction animations run on the UI thread where supported. Target
`<= 16.7 ms` per frame at 60 Hz and `<= 8.3 ms` at 120 Hz. Avoid synchronous
image decoding, network waits, and list-wide layout transitions on the send
path.

**Acceptance:** profile keyboard open/close, attachment add/remove, send,
acknowledgement, and history prepend on representative low- and high-refresh
devices. No sustained frame-budget overrun or visually apparent dropped frame
is allowed. Record device, OS, refresh rate, and trace with release evidence.

## Message selection and layout

- Selection exposes one checkbox per message row. Its checked state is announced,
  its visual indicator sits outside the edge opposite the bubble: left of outgoing
  messages and right of incoming messages. The full row toggles it. Media, links,
  playback, and swipe actions do not intercept a selection tap. Web keyboard users
  can toggle the focused row with Space or Enter.
- Entering selection mode and toggling a checkbox preserve message row heights,
  bubble alignment, media dimensions, and the offsets between neighboring rows.
  The indicator overlays the row gutter and never reserves bubble width or removes
  an adjacent media action's layout slot.
- The selected-message count appears inside the delete control. When the selected
  messages cannot be deleted, the control stays disabled and retains the count;
  the existing server permission checks remain authoritative.
- iOS selection indicators and action pills use the shared rounded glass material,
  including its fallback on older systems. Cancel/cross controls retain their
  existing appearance.
- Small text follows its sender's side within the bubble. Timestamps and read
  receipts stay against the bubble's right inset.
- Image-only messages have no vertical padding or border spacer around portrait
  or landscape media. Sender names remain outside that image bubble; captions,
  replies, and thread controls keep their separate content spacing.
- Voice-note width is independent of selection mode. Video messages use a stable
  aspect-ratio preview in both their optimistic and confirmed states; the native
  player is created only after the person taps Play.
- Pending and confirmed text use the same body wrapper and a fixed-width
  delivery indicator slot, so clock and receipt changes do not rewrap text.
- After deleting messages while reading history, preserve the native visible-row
  anchor. Do not replay a saved absolute offset after the timeline changes. Readers
  already at latest remain pinned to latest.
- Bulk deletion fades selected rows together before removing them from the list,
  then offers an Undo pill for about 2.5 seconds. The transition keeps the list anchored and
  does not animate unrelated rows or media geometry. The centered pill confirms
  the action with haptics, uses iOS glass on iOS, and uses an opaque yellow
  surface on Android. Long pressing a regular message opens the native iOS
  options bubble without a raised, shadowed copy of the message; voice and video playback surfaces use the action sheet so
  their controls remain responsive. Android long press opens the action sheet.
- The one-line composer remains a rounded pill. It grows through four visible
  lines, then scrolls the text inside the fixed-height input.
- Channel and Thread history controls stay mounted while a page is loading.
  Reaching the older edge after a deliberate scroll requests another page while
  the fixed-height loading row shows progress and the visible anchor stays put.

## Regression findings from the supplied recording

The supplied 90-second recording is Track's General channel, not WhatsApp. It
shows the defects to fix in Track; WhatsApp remains the public behavior reference
for the broader interaction contract. The implementation changes below need the
Android visual pass before they count as device-verified.

| Observed state | Defect in Track | Implementation change | Visual check |
| --- | --- | --- | --- |
| Photo selected and upload states progress from preparation to completion | Media rows must remain one stable item through upload and server acknowledgement. | Keep the known image frame and local preview through acknowledgement; use one shared media width calculation for optimistic and confirmed rows. | Record one image send at latest and in history; compare the same row bounds before upload, during progress, and after confirmation. |
| Selection mode on outgoing and incoming bubbles | The checkbox side and gap were inconsistent, incoming avatars disappeared, and wide bubbles left the checkbox detached. | Anchor the indicator to the bubble with a fixed gap, keep incoming avatars, and cap text bubble width. | Capture selected incoming/outgoing short text, multiline, image, file, and deleted rows; verify bubble frame, avatar, and checkbox spacing. |
| Voice-note row after selection begins | The player width subtracted the selection rail, shrinking the voice bubble. | Compute player width without selection state; only disable playback gestures while selecting. | Compare voice-note frame width before and after selection for both senders and both chat screens. |
| Message deletion while away from latest | A stale absolute `offsetY` was replayed after rows changed, which could pull the view to the top or another unrelated position. | Let FlatList's visible-content anchor preserve history position; explicitly follow latest only for readers who were already pinned there. Failed deletion does not issue a scroll. | Delete rows above, inside, and below the viewport in Channel and Thread; verify the same visible surviving row remains in place. |
| Bulk deletion and older history loading | Selected rows vanished at once; the history control disappeared during `LoadingMore`, and Thread showed no progress indicator. Older pages required a manual tap. | Fade selected rows together before removing them; keep a shared loading row visible and request older pages when the reader reaches the top. | Delete a mixed batch in both screens, then scroll through multiple older pages; verify no jump, repeated request, missing page, or disappearing loading row. |
| Video selected or sent | Video was shown as a generic document and had no stable pending-to-confirmed media frame. | Add gallery/document video detection, persist dimensions, show the same aspect-ratio preview during upload and after send, and defer native playback creation until Play. | Send landscape and portrait videos from both pickers; compare pending and confirmed bounds, playback, cancel, offline, and retry states. |
| Composer focus, growth, and keyboard transitions | Channel and Thread had different Android expansion policy, and focus while reading history could force the latest edge. | Use the shared non-expanding composer policy and follow latest on focus only when already at latest. | Repeat empty, one-line, multiline, long-text, keyboard open/close, and history-focus cases on both screens. |
| Delete and failed-media feedback | Delete-for-everyone rows collapsed and reopened before the server label arrived; the action pill stretched across the composer. | Show the deleted label optimistically, animate the single row-height change, collapse only Hide for me, and size the Undo/Retry pill to its content. | Delete above/inside/below the viewport; Undo each, wait for commit, force failure, retry, and remove a failed image/video. |
| Video composer preview and send completion | A selected video looked like a document; the composer left a blank reserved tile after sending. | Generate one queued video frame for the composer tile and collapse its empty strip while sending. Keep duration and one delivery indicator in the sent video frame. | Select/cancel/send a video, inspect thumbnail and duration, and verify there is no empty strip below the timeline. |

The selection, deletion, and media-width changes have unit coverage. Emulator
captures, full-speed motion review, and iOS capture remain separate verification
requirements; a passing unit suite does not establish smoothness on a device.

The development Attachment preview exercises normal and selection modes with
short and long text, incoming and outgoing images, voice notes, files, and deleted
messages. The mobile browser regression suite checks row interaction and geometry
at 320, 390, and 834 CSS pixels in both themes. Browser checks do not establish
native glass appearance or native gesture behavior on iOS or Android.

## Motion tokens

| Interaction | Track target |
| --- | --- |
| Keyboard open/close/interactive drag | Native keyboard frames; no parallel easing or fixed duration |
| New outgoing message entrance | `160 ms`, ease out, `6 pt` vertical offset to zero, opacity `0` to `1` |
| Attachment add/remove and composer height | `200 ms`, cubic ease-out layout transition |
| Jump-to-latest enter/exit | `180 ms` enter / `130 ms` exit, opacity + small vertical movement |
| Press response | `0.96` scale; spring damping ratio `0.78`, `140 ms` down / `170 ms` release |
| Reduced motion | State changes remain immediate; decorative motion removed |

Do not assign a guessed keyboard spring (including damping/stiffness constants):
the keyboard owns its timing and can be interactively dragged. Matching its
frame stream is more accurate than approximating it with an independent spring.

## WhatsApp behavior comparison

| Area | WhatsApp behavior supported by public material | Track contract |
| --- | --- | --- |
| Composer | Android can configure Enter to send or insert a newline; public help does not specify exact composer growth or keyboard animation timing. | One through four visible lines, consistent behavior across Channel and Thread, native keyboard-frame docking. |
| Sending feedback | WhatsApp documents unsent, sent, delivered, and read indicators, but not its optimistic-send implementation. | Immediate pending bubble, one idempotent submission, and explicit retry/reconciliation behavior. |
| Attachments | iOS uses an expandable attachment tray; media can be edited and captioned before send. | Stable selected-media preview and no-gap preview-to-message handoff. |
| Media quality | Standard and HD options trade image/video quality against data use and send time. | Preserve media identity and metadata through selection, upload, retry, and render; quality controls require product scope before implementation. |
| Scrolling, insertion, frame pacing | Public material does not specify list anchoring or frame timings. | Explicit anchored-scroll, stable-row, and profiling targets above. |

This is a behavior-level comparison, not a claim of pixel/frame parity. Actual
WhatsApp side-by-side capture and 60/120 Hz profiling remain device-validation
items; public material does not expose private animation or list implementation
details.

## Hard release prohibitions

- No composer/keyboard overlap or composer displayed above the keyboard.
- No send action that remains busy after the request settles.
- No duplicate message after optimistic/server reconciliation or retry.
- No movement or remeasurement of existing rows caused by sending.
- No attachment that disappears between selection, send, failure, and retry.
- No history prepend that loses the reader's visible anchor.
- No assertion of iMessage's private timing constants without measured device
  evidence.
