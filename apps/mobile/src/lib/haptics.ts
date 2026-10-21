import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

const native = Platform.OS !== 'web';

function safelyPlay(play: () => Promise<void>) {
  // Haptics are an enhancement. Older or limited native clients may not have
  // the module available, so feedback must never break the action itself.
  try {
    void play().catch(() => undefined);
  } catch {
    // Some native bridges throw synchronously when a module is unavailable.
  }
}

export function hapticLight() {
  if (native) safelyPlay(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

export function hapticMedium() {
  if (native) safelyPlay(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}

export function hapticDestructive() {
  if (native) safelyPlay(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
}

export function hapticSuccess() {
  if (native) safelyPlay(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}
