# Track mobile microinteraction review

Reviewed 2026-10-07. This plan translates the five web-oriented references into native React Native behavior. It keeps Expo Router, native stack transitions, Reanimated, and Expo Haptics as the implementation boundary; it adds no interaction library or sound dependency.

## Reference findings and native decisions

| Reference | Interaction idea | Track implementation |
| --- | --- | --- |
| [Toggles.dev](https://toggles.dev/) | A state change should be legible through a small, direct transition. | The Profile appearance selector moves one shared selection capsule, updates the selected icon, honors Reduce Motion, and gives a light haptic on selection. Keep this interaction in place; do not turn a setting change into route navigation. |
| [Cuelume](https://cuelume.dev/) | Input type and outcome shape the feedback. | Use native touch feedback and semantic haptics: light impact for selection, success feedback for completion, and warning feedback for destructive or failed outcomes. Keep the app silent and do not add web audio behavior to the mobile client. |
| [Blendy](https://blendy.tahazsh.com/) | A source object and its destination should feel related during a transition. | Preserve clear list-to-detail identity through the native stack's platform transition and use Reanimated only within a screen where the same object remains visible. Do not add DOM-based shared-element code to the React Native app. |
| [Monoco](https://somonoco.com/) | Smooth corners should follow the surface as it changes size. | Use React Native's continuous border curve on pills, sheets, and controls. Apply press motion to an inner surface so the outer hit target stays stable. |
| [SSGOI](https://ssgoi.dev/docs) | Route movement should explain whether a person drilled into detail, opened a sheet, or changed peer tabs. | Keep native stack push and interactive-back behavior for routes; use the existing native sheet for temporary choices; keep bottom-tab changes stationary. Avoid a second route-animation system. |

## Interaction rules

- A control answers on touch-down, then settles when released. Its hit target stays at least the platform-sized target even when the visual surface scales.
- Disabled and busy controls do not respond as if an action succeeded.
- Repeated and decorative motion stops or becomes static when Reduce Motion is enabled. Loading text and accessible progress labels remain available.
- Haptics describe the action or result. They do not repeat for every animation frame, and the mobile app does not play UI sounds.
- Route transitions preserve platform back gestures. A tab switch, sheet, and detail push keep distinct spatial meanings.
- Rounded controls use continuous corners where supported; colors, labels, and selected state still carry the meaning without motion.

## Implemented coverage

- The shared press-feedback hook uses a short spring, has a stable hit target, and disables scale movement under Reduce Motion. Compact filters, task rows, Hub rows, channel headers, and Profile options use it.
- Shared action and icon buttons use the same touch-down spring, with lighter scale for full-width actions and standard icon feedback. Existing opacity, ripple, disabled, busy, and haptic behavior remains in place.
- The Profile appearance control animates its shared selection surface and icon, and honors Reduce Motion.
- App toasts map success and failure to semantic haptics. Loading, recording, assistant progress, skeleton, and sign-in motion honor Reduce Motion.
- The primary navigation and native stack retain platform-native route behavior; custom motion remains local to content and temporary sheets.
- Existing conversation swipe, thread swipe, and voice-recording gestures retain their visible affordances, action thresholds, haptics, and recoverable state behavior.
- Channel search now enters and exits with a short panel transition while the message-list area animates its layout. The list keeps its existing visible-position maintenance and scroll behavior, and search still focuses the input.
- Android's keyboard-expanded composer animates its header, row, input area, attachment controls, and send control together. The TextInput stays mounted through the layout change so focus is retained.
- Pending messages and the send icon/spinner now crossfade or move in with short transitions. Stable pending-message IDs and list position maintenance keep the arrival tied to the sent message.
- Voice hold gestures use explicit, sticky cancel and lock thresholds. A normal release finishes only an active unlocked recording; cancel wins if one update crosses both thresholds. The gesture outcome rules have focused unit coverage.
- The shared date field constrains the iOS inline picker and Android date cells to avoid horizontal clipping on narrow layouts.

## Regression checks

1. Run mobile lint, typecheck, and all mobile unit tests after changes to interaction components.
2. Run the Expo export for web, iOS, and Android to catch cross-platform bundle and type regressions.
3. Run the repository gate: lint, typecheck, tests, production dependency audit, and build. Record any existing gate failure without weakening it.
4. On iOS and Android, check tap-down and release feedback, disabled and loading controls, theme selection, task completion, sheets, list-to-detail navigation, and back gestures.
5. Repeat the motion paths with Reduce Motion enabled. Verify controls still communicate selection and status without movement.
6. Check accessibility labels, selected/disabled/busy states, minimum hit targets, high font scale, and edge clipping on narrow devices.

Native simulator/device checks are required to prove haptic delivery, system transition behavior, and rendered motion; JavaScript tests and bundle exports alone do not prove those paths.

## Latest verification

- `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed on the final source state. The build exported the mobile app for web, iOS, and Android.
- `pnpm test` passed: 458 tests across shared (15), web (144), mobile (192), and Convex (107) suites. The focused mobile tests cover voice gesture thresholds and release outcomes, message swipe behavior, unread search empty states, task attention ordering, and navigation geometry.
- `git diff --check` passed. Git reported only existing LF-to-CRLF working-copy warnings.
- `pnpm audit --prod` failed with two high advisories in transitive dependencies: `node-forge` and `braces`. The audit reported no patched versions for either package.
- Dependency regeneration previously failed with `ERR_PNPM_ENOENT` while importing `compression`; package fetches also returned `UND_ERR_DESTROYED`. The lockfile and installed dependency graph may therefore differ, and dependency consistency remains unproved.
- The scoped `codex review` found no additional code correctness issue in its completed pass, but it flagged the native voice-release interaction as unproved. This Windows workspace has no connected Android device, no configured Android emulator, and no iOS Simulator. Haptic delivery, touch animation, keyboard focus during composer reflow, native navigation gestures, Reduce Motion behavior, and native date-picker clipping remain unverified on device.
- Expo export proves that web, iOS, and Android bundles compile. It does not prove native rendering or real touch behavior. The required device checks must be completed on physical or simulated iOS and Android hardware before calling the motion work fully verified.
