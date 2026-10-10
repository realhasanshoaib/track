import { usePathname } from 'expo-router';
import { Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AndroidBottomTabHeight, BottomTabInset, PrimaryCreateActionClearance, PrimaryCreateActionSize, Spacing } from '@/constants/theme';
import { primaryNavigationContentInset, primaryNavigationHeight, primaryNavigationSafeAreaInset, primaryNavigationVisibleForPath } from '@/lib/primary-navigation';

/** Exact floating navigation height on both platforms. */
export function useBottomTabBarInset() {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const { fontScale } = useWindowDimensions();
  if (!primaryNavigationVisibleForPath(pathname)) return 0;
  const isAndroid = Platform.OS === 'android';
  const navigationHeight = primaryNavigationHeight(fontScale, isAndroid ? AndroidBottomTabHeight : BottomTabInset);
  const safeAreaBottom = primaryNavigationSafeAreaInset(insets.bottom, isAndroid ? 0 : Spacing.two, Spacing.one);
  return navigationHeight + Spacing.two + safeAreaBottom;
}

/** Keeps the final row reachable above the floating glass navigation. */
export function useBottomTabContentInset(extra: number = Spacing.two) {
  return primaryNavigationContentInset(
    useBottomTabBarInset(),
    PrimaryCreateActionSize,
    PrimaryCreateActionClearance,
    extra,
  );
}
