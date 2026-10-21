import '@/global.css';

import { Platform, type TextStyle } from 'react-native';

import { appFontVariants, sansFaceForWeight } from '@/lib/mobile-typography';

const appTextVariants = appFontVariants();
const tabularNums = appFontVariants(['tabular-nums']);

export const Colors = {
  light: {
    text: '#1b1917',
    background: '#faf9f7',
    backgroundElement: '#f3f1ed',
    backgroundSelected: '#ebe8e2',
    backgroundElevated: '#ffffff',
    homeBackground: '#faf9f7',
    homeSurface: '#ffffff',
    homeBorder: '#ddd9d1',
    navigationGlass: 'rgba(255,255,255,0.36)',
    navigationSelectionGlass: 'rgba(254,243,199,0.74)',
    textSecondary: '#655f56',
    textTertiary: '#6e675d',
    hairline: '#e3dfd7',
    accent: '#f0b100',
    accentInk: '#1b1917',
    accentSoft: '#fef3c7',
    accentStrong: '#8a6400',
    statAccentSoft: '#fffcf2',
    danger: '#b91c1c',
    dangerSoft: '#fee2e2',
    statDangerSoft: '#fffbfb',
    warning: '#9a3412',
    statWarningSoft: '#fffbf5',
    success: '#15803d',
    successSoft: '#dcfce7',
    statSuccessSoft: '#f8fcf9',
    info: '#1d4ed8',
    statInfoSoft: '#f8faff',
    workflowBacklog: '#7c3aed',
    workflowBacklogSoft: '#f1eafe',
    workflowBacklogStrong: '#6d28d9',
    statPurpleSoft: '#fbf9ff',
    workflowUnstarted: '#2563eb',
    workflowUnstartedSoft: '#eaf2ff',
    workflowUnstartedStrong: '#1d4ed8',
    workflowStarted: '#15803d',
    workflowStartedSoft: '#eaf7ef',
    workflowStartedStrong: '#166534',
    statProgressSoft: '#f8fcf9',
    workflowCompleted: '#0f766e',
    workflowCompletedSoft: '#e6f7f4',
    workflowCompletedStrong: '#115e59',
    workflowCanceled: '#b91c1c',
    workflowCanceledSoft: '#fee2e2',
    workflowCanceledStrong: '#991b1b',
    bubbleOwn: '#f3f1ed',
    bubbleOther: '#fff5d6',
    overlay: 'rgba(27,25,23,0.45)',
    skeleton: '#e9e5dd',
  },
  dark: {
    text: '#faf9f7',
    background: '#1b1917',
    backgroundElement: '#292522',
    backgroundSelected: '#3a3631',
    backgroundElevated: '#232019',
    homeBackground: '#1b1917',
    homeSurface: '#232019',
    homeBorder: '#3a3631',
    navigationGlass: 'rgba(35,32,25,0.36)',
    navigationSelectionGlass: 'rgba(78,67,12,0.78)',
    textSecondary: '#c9c3b8',
    textTertiary: '#9a9488',
    hairline: '#3a3631',
    accent: '#f0b100',
    accentInk: '#1b1917',
    accentSoft: '#4a3800',
    accentStrong: '#f5c53d',
    statAccentSoft: '#4a3800',
    danger: '#fca5a5',
    dangerSoft: '#4c1d1d',
    statDangerSoft: '#4c1d1d',
    warning: '#fdba74',
    statWarningSoft: '#292522',
    success: '#4ade80',
    successSoft: '#214a2c',
    statSuccessSoft: '#214a2c',
    info: '#93c5fd',
    statInfoSoft: '#1e324f',
    workflowBacklog: '#c4b5fd',
    workflowBacklogSoft: '#33264f',
    workflowBacklogStrong: '#ddd6fe',
    statPurpleSoft: '#33264f',
    workflowUnstarted: '#93c5fd',
    workflowUnstartedSoft: '#1e324f',
    workflowUnstartedStrong: '#bfdbfe',
    workflowStarted: '#86efac',
    workflowStartedSoft: '#1f3d2a',
    workflowStartedStrong: '#bbf7d0',
    statProgressSoft: '#1f3d2a',
    workflowCompleted: '#5eead4',
    workflowCompletedSoft: '#143c39',
    workflowCompletedStrong: '#99f6e4',
    workflowCanceled: '#fca5a5',
    workflowCanceledSoft: '#4b2222',
    workflowCanceledStrong: '#fecaca',
    bubbleOwn: '#28251f',
    bubbleOther: '#3d351f',
    overlay: 'rgba(0,0,0,0.6)',
    skeleton: '#332f2a',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: 'ManropeV5-Regular',
    sansRegular: 'ManropeV5-Regular',
    sansMedium: 'ManropeV5-Medium',
    sansSemibold: 'ManropeV5-SemiBold',
    sansBold: 'ManropeV5-Bold',
    sansExtraBold: 'ManropeV5-ExtraBold',
    mono: 'Menlo',
  },
  android: {
    sans: 'Manrope V5',
    sansRegular: 'Manrope V5',
    sansMedium: 'Manrope V5',
    sansSemibold: 'Manrope V5',
    sansBold: 'Manrope V5',
    sansExtraBold: 'Manrope V5',
    mono: 'monospace',
  },
  default: {
    sans: 'sans-serif',
    sansRegular: 'sans-serif',
    sansMedium: 'sans-serif',
    sansSemibold: 'sans-serif',
    sansBold: 'sans-serif',
    sansExtraBold: 'sans-serif',
    mono: 'monospace',
  },
});

export function sansFontForWeight(weight: TextStyle['fontWeight']) {
  if (Platform.OS !== 'ios') return Fonts?.sans;

  return sansFaceForWeight(weight, {
    regular: Fonts?.sansRegular,
    medium: Fonts?.sansMedium,
    semibold: Fonts?.sansSemibold,
    bold: Fonts?.sansBold,
    extraBold: Fonts?.sansExtraBold,
  });
}

/**
 * Sans styles carry prose and metadata. The mono styles are reserved for
 * identifiers (task keys, codes) — never for timestamps, names, or labels.
 */
export const Typography = {
  // Platform-sized navigation titles keep drill-in screens calm and familiar.
  navigationTitle: {
    fontFamily: Fonts?.sansSemibold,
    fontSize: Platform.OS === 'ios' ? 17 : 20,
    fontVariant: appTextVariants,
    lineHeight: Platform.OS === 'ios' ? 22 : 26,
    fontWeight: '600' as const,
  },
  // Prose
  message: {
    fontFamily: Fonts?.sansRegular,
    fontSize: 16,
    fontVariant: appTextVariants,
    lineHeight: 22,
    fontWeight: '400' as const,
  },
  body: {
    fontFamily: Fonts?.sansRegular,
    fontSize: 15,
    fontVariant: appTextVariants,
    lineHeight: 21,
    fontWeight: '400' as const,
  },
  bodyBold: {
    fontFamily: Fonts?.sansSemibold,
    fontSize: 15,
    fontVariant: appTextVariants,
    lineHeight: 21,
    fontWeight: '600' as const,
  },
  // Headings
  display: {
    fontFamily: Fonts?.sansBold,
    fontSize: 28,
    fontVariant: appTextVariants,
    lineHeight: 34,
    fontWeight: '700' as const,
  },
  titleLarge: {
    fontFamily: Fonts?.sansBold,
    fontSize: 20,
    fontVariant: appTextVariants,
    lineHeight: 26,
    fontWeight: '700' as const,
  },
  title: {
    fontFamily: Fonts?.sansSemibold,
    fontSize: 15,
    fontVariant: appTextVariants,
    lineHeight: 20,
    fontWeight: '600' as const,
  },
  subtitle: {
    fontFamily: Fonts?.sansSemibold,
    fontSize: 17,
    fontVariant: appTextVariants,
    lineHeight: 22,
    fontWeight: '600' as const,
  },
  // Secondary text — sans, not mono
  label: {
    fontFamily: Fonts?.sansMedium,
    fontSize: 13,
    fontVariant: appTextVariants,
    lineHeight: 18,
    fontWeight: '500' as const,
  },
  caption: {
    fontFamily: Fonts?.sansRegular,
    fontSize: 12,
    fontVariant: tabularNums,
    lineHeight: 16,
    fontWeight: '400' as const,
  },
  captionBold: {
    fontFamily: Fonts?.sansSemibold,
    fontSize: 12,
    fontVariant: tabularNums,
    lineHeight: 16,
    fontWeight: '600' as const,
  },
  // Identifiers only
  metadata: {
    fontFamily: Fonts?.mono,
    fontSize: 11,
    fontVariant: tabularNums,
    lineHeight: 15,
    fontWeight: Platform.OS === 'android' ? ('700' as const) : ('500' as const),
    letterSpacing: 0.3,
  },
  metadataLabel: {
    fontFamily: Fonts?.mono,
    fontSize: 10.5,
    fontVariant: tabularNums,
    lineHeight: 14,
    fontWeight: Platform.OS === 'android' ? ('700' as const) : ('500' as const),
    letterSpacing: 0.6,
  },
};

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 12,
  four: 16,
  five: 24,
  six: 32,
} as const;

/** Shared timeline rhythm keeps pending and confirmed message rows aligned. */
export const ChatMessageSpacing = {
  grouped: Spacing.half,
  groupStart: Spacing.two,
} as const;

/** Shared spacing for native and content-level mobile headers. */
export const MobileHeaderMetrics = {
  actionGap: Spacing.one,
  contentTop: Spacing.four,
  rowMinHeight: 56,
} as const;

export const Radius = {
  small: 6,
  medium: 8,
  /** Primary grouped surfaces use the same calm radius as the Home cards. */
  large: 16,
  xlarge: 20,
  homeSurface: 16,
  pill: 999,
} as const;

/** Supports the plan's 200% large-text gate while keeping a finite layout contract. */
export const MaxFontScale = 2;

export const TouchTarget = Platform.select({ ios: 44, android: 48 }) ?? 44;

/** Shared visual icon sizes. The control owns the touch target around them. */
export const IconSize = {
  small: 16,
  medium: 20,
  large: 24,
} as const;

/**
 * Space reserved below scrollable content for the floating app navigation.
 * The navigation owns the device safe-area inset; screens only need this
 * stable content reserve so the last row never hides behind the bar.
 */
export const BottomTabInset = 70;
export const AndroidBottomTabHeight = 72;
export const PrimaryCreateActionSize = 56;
export const PrimaryCreateActionClearance = Spacing.three;
export const MaxContentWidth = 800;
