import type { ImageTransition } from 'expo-image';
import { Easing, FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

export const StateTransitionDuration = 200;
export const StateExitDuration = 140;
export const StateTransitionEasing = Easing.bezier(0, 0, 0.58, 1);
export const StateEntering = FadeIn.duration(StateTransitionDuration).easing(StateTransitionEasing);
export const StateExiting = FadeOut.duration(StateExitDuration).easing(StateTransitionEasing);
export const StateLayout = LinearTransition.duration(StateTransitionDuration).easing(StateTransitionEasing);
export const MediaPlaceholder = { blurhash: 'L6Ptp*~q00%M?bofM{WB00Rj_3M{' };
export const MediaTransition: ImageTransition = {
  duration: StateTransitionDuration,
  effect: 'cross-dissolve',
  timing: 'ease-out',
};
