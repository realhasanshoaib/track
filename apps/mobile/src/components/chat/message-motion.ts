import { FadeInUp, FadeOutDown } from 'react-native-reanimated';
import { MediaPlaceholder, MediaTransition, StateEntering, StateExiting, StateExitDuration, StateLayout, StateTransitionDuration, StateTransitionEasing } from '@/constants/motion';

export const ChatMotionDuration = StateTransitionDuration;
export const ChatMotionExitDuration = StateExitDuration;
export const ChatMotionEasing = StateTransitionEasing;
export const ChatPartEntering = StateEntering;
export const ChatPartExiting = StateExiting;
export const PendingMessageEntering = FadeInUp.duration(160)
  .easing(ChatMotionEasing)
  .withInitialValues({ transform: [{ translateY: 6 }] });
// Reconciliation replaces this row with confirmed content in the same commit.
// Keeping an exiting copy would briefly show both and move the scroll anchor.
export const PendingMessageLayout = StateLayout;
export const ChatImagePlaceholder = MediaPlaceholder;
export const ChatImageTransition = MediaTransition;

export const JumpToLatestEntering = FadeInUp.duration(180);
export const JumpToLatestExiting = FadeOutDown.duration(130);
