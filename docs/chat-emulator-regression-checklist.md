# Mobile chat visual regression checklist

Run this checklist on the same Android device/build for Channel and Thread. Use
a private development channel with test messages from both the current user and
another test user. Do not use a production conversation for send/delete cases.

## Before testing

- [ ] Install a development build made from the current worktree. Video playback
      requires the native `expo-video` module to be included in that build.
- [ ] Prepare one small landscape image, one portrait image, one landscape
      video, one portrait video, and one voice message.
- [ ] Ensure the test conversation has short text, multiline text, incoming and
      outgoing messages, media, a voice note, and enough history to scroll.
- [ ] Start a 60 fps screen recording. Record device, OS, app build, channel or
      thread, and whether the reader starts at latest or in history.
- [ ] For each case, record the action, visible response, scroll position, and
      final state. Review both at normal speed and frame by frame.

If the app has not been rebuilt, verify its build/version before testing. A
development client without the new native video module cannot verify video
playback.

## Test cases

### C1. Empty and one-line composer

1. Open a Channel, then repeat in a Thread.
2. Tap the empty composer and open the keyboard; type a short one-line message.
3. Dismiss and reopen the keyboard, then send.

**Pass:** the one-line composer is a rounded pill and stays docked immediately
above the keyboard with no visible gap or overlap. The input keeps focus and its
text. Sending shows one pending bubble promptly and leaves exactly one confirmed
bubble.

### C2. Multiline and long text

1. Type 2 lines, then 4 lines, then more than 4 lines.
2. Move the caret within the text and continue typing while the keyboard is
   opening.
3. Send, then repeat with a reply or attachment preview present.

**Pass:** iOS top-aligns the input as soon as the second line appears. The
composer grows to four visible lines, then scrolls text inside the input. The
caret does not reset. Message rows do not resize, and the composer does not jump
when a preview is added or removed.

### C3. Focus while reading history

1. Scroll well above the latest message.
2. Tap the composer, type without sending, dismiss the keyboard, and reopen it.

**Pass:** focusing the composer does not jump to latest. The same visible
message stays at the same screen position after the keyboard settles.

### C4. Send at latest and rapid taps

1. Scroll to latest and send a short text message.
2. On the next send, tap Send rapidly twice.
3. Repeat while sending a multiline message.

**Pass:** at latest, the new message remains visible. Rapid taps create one
submission and one bubble. Existing rows keep their positions; acknowledgement
does not insert a duplicate or visibly resize neighboring rows.

### C5. Image selection, cancel, caption, and send

1. Open Photos & videos and choose a landscape image; repeat with a portrait
   image.
2. Observe the composer preview, remove it, and confirm only that preview is
   removed.
3. Choose the image again, add a caption, and send.
4. Record the pending/uploading state and the confirmed message.

**Pass:** the preview stays visible until send. The image appears once in the
pending state and once after reconciliation, with the same frame dimensions and
caption. Progress/acknowledgement does not flash, blank, resize, or move the
timeline. Sending leaves no empty attachment-strip height below the timeline.
Cancel leaves no message. On failed upload, the remove X works and the compact
Retry pill remains visible until retry succeeds or the failed image is removed.

### C6. Video from gallery and Documents

1. Select a landscape video from Photos & videos, add a caption, and send.
2. Repeat with a portrait video.
3. Select a video through Documents and send it.
4. Tap Play, close playback, and check the same conversation position.

**Pass:** the composer shows a video frame thumbnail, filename, and play affordance.
Videos are presented as video messages, not generic documents. The pending and
confirmed previews keep the same aspect ratio and dimensions; the sent bubble
shows its filename and lower-corner delivery receipt. A video does not start
playing until tapped; closing playback returns to the same scroll position.
Captions and progress remain visible and stable. Failed videos can be removed,
and their compact Retry pill persists until retry succeeds or the file is removed.

### C7. Checkbox side and selection geometry

1. Long-press an outgoing text bubble to enter selection mode.
2. Long-press or tap an incoming bubble to select it too.
3. Repeat with a multiline bubble, image, video, file, deleted row, and voice
   note. Capture before entering selection and after.

**Pass:** each checkbox is outside the bubble edge with the same 8 pt gap: left
of outgoing bubbles and right of incoming bubbles. Incoming sender avatars stay
visible. Text bubbles stay within 70% of the screen width; timestamps and read
receipts sit in the lower trailing corner. Selection does not change bubble
width, alignment, media frame, voice-note width, or the spacing between adjacent
rows. The media action slot does not cause the bubble to shift.

### C8. Delete while in history

1. Scroll away from latest and note the first visible surviving message.
2. Select a test-owned message above the viewport, delete it, and repeat for a
   message inside and below the viewport.
3. Repeat in Thread.

**Pass:** selected rows fade together briefly, then leave the list without a
visible hitch. Deletion does not jump to the top or latest. The same visible
surviving message stays in place after the timeline settles. If deletion fails,
the reader stays at the same position. At latest, the list remains pinned there.
A centered Undo pill appears above the composer for five seconds with a light
haptic. It uses the iOS glass material on iOS and an opaque elevated white surface
on Android. Undo restores the rows at the same anchor; without Undo, the delete
commits. A failed delete restores the rows and changes the pill to Retry.

### C9. Incoming message while typing or reading

1. Use a second test account to send a message while the first user is typing.
2. Repeat while the first user is reading history, then while at latest.

**Pass:** the draft and caret survive. An incoming message does not pull a
history reader to latest; a reader already at latest continues following it.

### C10. Failure and retry

1. Disable network access and send test text, an image, and a video.
2. Restore connectivity and retry each failed item.

**Pass:** pending items remain identifiable and in place, with a clear waiting
or failure state. Retry sends one copy, retains the attachment/caption, and
reconciles to one confirmed message without a size or scroll jump.
The failure pill stays until retry succeeds. Failed image/video remove controls
work and clear the retry state when no failed media remains.

### C11. Long history loading

1. Open a Channel and Thread with more than two pages of messages.
2. Scroll upward from latest until the oldest loaded message is reached.
3. Continue through at least three page loads; repeat with the visible Load older
   control.

**Pass:** older messages load as the reader reaches the top; the loading row
remains visible and shows a spinner for the full request. The visible message
anchor does not jump, duplicate pages do not appear, and scrolling toward latest
rearms loading for the next older-page request.

## Final pass criteria

- [ ] C1–C11 pass on Channel and Thread where applicable.
- [ ] No composer/keyboard gap, overlap, or focus loss.
- [ ] No bubble, voice-note, or media-frame resize when selection appears.
- [ ] Selection keeps incoming avatars and the fixed checkbox gap; receipts stay
      in the bubble's lower trailing corner.
- [ ] Delete Undo stays available for five seconds and returns the same scroll
      anchor; failed media remains removable with persistent Retry feedback.
- [ ] Video drafts show a thumbnail and sent videos show filename and receipt.
- [ ] Sending an image/video leaves no empty composer strip or extra bottom gap.
- [ ] No scroll jump after send, acknowledgement, incoming message, or deletion.
- [ ] No duplicate bubbles or missing drafts/attachments after retry.
- [ ] No sustained visible hitch during typing, media progress, keyboard motion,
      or message reconciliation.
- [ ] Save the recording and before/after screenshots with the device/build
      details. Mark each case Pass, Fail, or Not run; do not infer a device pass
      from unit tests alone.
