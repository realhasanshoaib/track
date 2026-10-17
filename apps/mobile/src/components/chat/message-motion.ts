import { FadeIn, FadeInUp, FadeOutDown, ZoomIn } from 'react-native-reanimated';
import { MediaPlaceholder, MediaTransition, StateEntering, StateExiting, StateExitDuration, StateLayout, StateTransitionDuration, StateTransitionEasing } from '@/constants/motion';

export const ChatMotionDuration = StateTransitionDuration;
export const ChatMotionExitDuration = StateExitDuration;
export const ChatMotionEasing = StateTransitionEasing;
export const ChatPartEntering = StateEntering;
export const ChatPartExiting = StateExiting;
// The list follows the new row at the same time it is inserted. Avoid adding a
// second vertical movement to the row itself; it makes the viewport look like
// it jumps twice. A short opacity ramp keeps the optimistic state responsive.
export const PendingMessageEntering = FadeIn.duration(120).easing(ChatMotionEasing);
// Animate only image pixels inside their already measured frame. The row's
// width and height stay fixed, so the entry motion cannot move nearby messages.
export const PendingImageEntering = ZoomIn.duration(210).easing(ChatMotionEasing).withInitialValues({
  transform: [{ scale: 0.92 }],
});
// Reconciliation replaces this row with confirmed content in the same commit.
// Keeping an exiting copy would briefly show both and move the scroll anchor.
export const PendingMessageLayout = StateLayout;
export const ChatImagePlaceholder = MediaPlaceholder;
export const ChatImageTransition = MediaTransition;

export const JumpToLatestEntering = FadeInUp.duration(180);
export const JumpToLatestExiting = FadeOutDown.duration(130);
