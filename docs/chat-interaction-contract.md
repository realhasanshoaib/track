# Chat Interaction & Behavior Contract

**Status:** implementation contract for the mobile Channel and thread chat
surfaces

**Scope:** interaction, motion, layout stability, and message submission. This
does not authorize new chat features.

## Reference and limits

This contract uses the iPhone Messages interaction model as a behavioral
reference: the composer remains docked to the keyboard, conversation context
stays visible while replying, attachment selection flows into the draft, and a
send produces immediate visible feedback. Apple's public guide documents the
message, reply, and attachment affordances, but does not publish Messages'
internal spring constants, frame timings, list algorithms, or implementation
details. Those values below are Track engineering targets, not claims about
Apple's private implementation.

Reference: [Send and reply to messages on iPhone](https://support.apple.com/en-ca/guide/iphone/-iph82fb73ba3/ios).
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
   scrolls inside the input; it does not move or resize message rows.
7. Attachments remain visible either as draft previews in the composer or as
   the same files in the optimistic outgoing bubble. They must not disappear
   between those states.

## Requirements and acceptance criteria

### R1 — Keyboard docking

**Trigger:** the message input gains or loses focus; the keyboard opens,
closes, changes height, or is dragged interactively.

**Behavior:** move the composer as a whole with the native keyboard frame using
the same progress and timing supplied by the operating system. Do not run a
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
subtle opacity/vertical entrance for the new item only (`160 ms`, ease out,
vertical offset `6 pt` to `0 pt`). Do not apply layout animation to
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
  its visual indicator occupies a leading column outside the bubble, and the full
  row toggles it. Media, links, playback, and swipe actions do not intercept a
  selection tap. Web keyboard users can toggle the focused row with Space or Enter.
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

## iMessage behavior comparison

| Area | Messages reference behavior supported by public material | Track contract |
| --- | --- | --- |
| Keyboard/composer | Composer is presented directly above the on-screen keyboard in the conversation workflow; Apple's public guide does not publish timing constants. | Native frame-following sticky composer, zero external gap. |
| Sending | A message is composed in the conversation and sent with the send action. Internal optimistic timing is not publicly specified. | Immediate local pending bubble with idempotent reconciliation. |
| Attachments | Add control opens message attachment choices; selected media/content is sent in the conversation. | Stable preview identity and no-gap preview-to-message handoff. |
| Reply context | Inline reply keeps the source message context in focus. | Reply preview remains bound to the source message until sent/cancelled. |
| Scrolling, insertion, frame pacing | No public implementation contract located. | Explicit anchored-scroll, row-frame, and profiling acceptance criteria above. |

This is a behavior-level comparison, not a claim of pixel/frame parity. The
current environment has no iOS Simulator or Xcode, so actual iPhone Messages
side-by-side capture and 60/120 Hz profiling remain device-validation items.

## Hard release prohibitions

- No composer/keyboard overlap or composer displayed above the keyboard.
- No send action that remains busy after the request settles.
- No duplicate message after optimistic/server reconciliation or retry.
- No movement or remeasurement of existing rows caused by sending.
- No attachment that disappears between selection, send, failure, and retry.
- No history prepend that loses the reader's visible anchor.
- No assertion of iMessage's private timing constants without measured device
  evidence.
