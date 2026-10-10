# Track mobile UI audit checklist

This checklist covers the shipped Expo routes and their shared interaction surfaces. A checked item needs a real device or simulator observation in both light and dark mode. Source review alone is recorded separately. Keep unresolved items visible; do not treat a build or a screenshot as proof that a flow works.

## Screen coverage

| Surface | Android light | Android dark | iOS light | iOS dark | Flow and accessibility |
| --- | --- | --- | --- | --- | --- |
| Launch, session restore, sign in, password reset | ☐ | ☐ | ☐ | ☐ | ☐ |
| Chats list, search, Project selection | ☐ | ☐ | ☐ | ☐ | ☐ |
| Channel conversation, composer, attachments | ☐ | ☐ | ☐ | ☐ | ☐ |
| Message actions, create task, forward, report | ☐ | ☐ | ☐ | ☐ | ☐ |
| Thread, replies, swipe actions, camera | ☐ | ☐ | ☐ | ☐ | ☐ |
| Project list, Project detail, Project settings | ☐ | ☐ | ☐ | ☐ | ☐ |
| Tasks home, Board, List, filters, search | ☐ | ☐ | ☐ | ☐ | ☐ |
| Task detail, linked evidence, edit actions | ☐ | ☐ | ☐ | ☐ | ☐ |
| Inbox, notifications | ☐ | ☐ | ☐ | ☐ | ☐ |
| Company, Profile, theme and account settings | ☐ | ☐ | ☐ | ☐ | ☐ |

## Checks for each surface

- [ ] The main action and current Company, Project, Channel, or task scope are clear without duplicate controls or decorative space.
- [ ] Text wraps or truncates deliberately at normal and 1.3× system font size; no label, timestamp, pill, or input overlaps another control.
- [ ] Text, icons, borders, disabled states, and selected states remain legible in light and dark mode. Meaning does not rely on color alone.
- [ ] Controls have clear accessible names, roles, states, reading order, and at least 44 pt on iOS or 48 dp on Android of usable touch area.
- [ ] Screen reader focus stays on the active screen or sheet; opening, closing, navigation, and errors give useful feedback.
- [ ] Headers, sheets, scrolling content, composer, keyboard, tab bar, status bar, and home indicator respect their safe areas.
- [ ] Loading, empty, error, offline, permission denied, and long-content states have a useful next action when one is possible.
- [ ] Each visible action works, shows a result or error, and returns to the expected place. Back, swipe, and dismiss behave consistently.
- [ ] Corners, icon size, spacing rhythm, alignment, row density, and sheet padding follow the shared Track tokens.
- [ ] Reduced motion preserves meaning and avoids delaying access to the screen.

## Reported flows to verify

- [ ] A message's three-dot menu opens one compact sheet with labelled, visible actions. Create task opens a review sheet and creates a task linked to that message.
- [ ] Forward opens a destination picker, preserves the optional note, and gives a clear result or error. Report opens reasons, accepts required detail, and confirms submission.
- [ ] Review task and all other sheets open above the current screen on Android and iOS, scroll only when needed, and remain usable with the keyboard and large text.
- [ ] The iOS thread back and more controls use the intended jelly pill in both themes. Sender name, time, and more control stay separated at the trailing edge.
- [ ] Thread swipe actions move with the message in the expected direction. Images meet the message border without an unintended left inset. The iOS camera opens after choosing Camera.
- [ ] Task detail title fits two to four lines by default, can reveal the full text, and does not leave excessive space under the content. The Project control has no redundant arrow.
- [ ] Board header and pill padding align. Board and task headings have compact spacing. Only status columns scroll vertically; the Board screen and tab bar remain stable.
- [ ] Board and List keep the same screen alignment when switching views. Task cards omit the code, and the priority badge does not squeeze the title or adjacent row.
- [ ] Board search and filter controls use the same circular surface in both themes. Filters retain their selected state and do not shift the content.
- [ ] The yellow Pollution mark sits in the requested position and does not overlap its surrounding content.
- [ ] Android cold launch enters the app when Metro is available and shows a complete branded transition. The development launcher remains a known blocker until native config is applied without violating the no-prebuild instruction.

## Current findings

| ID | Severity | Finding | State |
| --- | --- | --- | --- |
| A1 | Major | Android cold launch opens the Expo development launcher before the app's React loading view. The config plugin now describes a localhost launch URL, but the installed native manifest has not received it. | Open; native regeneration is excluded by user instruction. |
| A2 | Major | Light and dark screenshots and interaction evidence are missing for most routes and sheets. | Audit in progress. |
| A3 | Major | iOS device evidence is unavailable in this Windows workspace. Source review can find likely issues but cannot prove native sheet, camera, or material behavior. | Open; needs iOS device evidence after the next native build. |
| A4 | Major | Pending attachment tiles grouped their Remove control into the parent accessibility element. | Source fixed; Android screen reader check pending. |
| A5 | Moderate | Sheet rows without an action gave press feedback and could absorb focus from a nested switch. | Source fixed; Android screen reader check pending. |
| A6 | Moderate | Board priority occupied the task title line and reduced space for long titles. | Fixed by moving priority to the footer; observed on Android in light and dark mode. |
| A7 | Minor | The Forward sheet's loading and empty copy touched the section edge. | Source fixed with section padding; the populated destination sheet was observed on Android in dark mode. Loading and empty states remain unverified. |
| A8 | Major | On this Windows host, Metro bound to IPv6 localhost while Android ADB reverse needed IPv4, so the dev client showed a connection error. | Existing dev scripts now start Expo with IPv4-first DNS; Android opened the bundle. |
| A9 | Major | Android Board content disappeared after loading while the tab bar remained visible. | Removed the Board entrance animation; Board stayed visible after load and List switching in light and dark mode. |
| A10 | Moderate | Board List used a narrow trailing column that truncated both the title and due date; it also showed the task code. | Moved due date and status below the title and hid the code in this list; observed in light and dark mode. |
| A11 | Major | The Android task detail dock lost its button label and icon after scrolling. | Replaced the shared action button's animated pressable with a normal pressable; the dock label stayed visible after scrolling in dark mode. Other action buttons need a focused visual check. |
| A12 | Major | Android thread content began behind its transparent header. | Made the Android header occupy its own layout space; the source card starts below it on fresh navigation in dark mode. iOS remains unverified. |
| A13 | Moderate | The Android message action sheet, Create task review sheet, Forward destination sheet, and Report sheet open with their actions and context visible. | Observed on Android; Report reasons and required note remained usable at 1.3× font scale. Submission and iOS behavior remain unverified. |
| A14 | Major | A left message swipe moved the message against the gesture and the tray button could close before receiving a tap. | The message now translates left to reveal a fixed tray on the right, and a tap no longer cancels the pan. Swiping and opening the tray action were observed on Android in the Channel screen. |
| A15 | Major | The iOS Camera action had no Track-specific native camera permission message in app config. | Expo image picker is now configured with explicit camera and photo messages, confirmed by Expo config introspection. An iOS native build and camera check remain necessary. |

## Handoff rule

Mark a row complete only after its visual and interaction checks pass. Record remaining defects here with the affected screen, theme, device, and observed result. Keep the original request open until all reachable gaps are fixed and the remaining platform limits are stated plainly.
