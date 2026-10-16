import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#1b1917',
    background: '#faf9f7',
    backgroundElement: '#f3f1ed',
    backgroundSelected: '#ebe8e2',
    backgroundElevated: '#ffffff',
    textSecondary: '#6b655c',
    textTertiary: '#8b857a',
    hairline: '#e3dfd7',
    accent: '#f0b100',
    accentSoft: '#fef3c7',
    accentStrong: '#8a6400',
    danger: '#b91c1c',
    dangerSoft: '#fee2e2',
    warning: '#9a3412',
    success: '#15803d',
    successSoft: '#dcfce7',
    info: '#1d4ed8',
    bubbleOwn: '#fdf0c8',
    bubbleOther: '#f3f1ed',
    overlay: 'rgba(27,25,23,0.45)',
    skeleton: '#e9e5dd',
  },
  dark: {
    text: '#faf9f7',
    background: '#1b1917',
    backgroundElement: '#292522',
    backgroundSelected: '#3a3631',
    backgroundElevated: '#232019',
    textSecondary: '#c9c3b8',
    textTertiary: '#9a9488',
    hairline: '#3a3631',
    accent: '#f0b100',
    accentSoft: '#4a3800',
    accentStrong: '#f5c53d',
    danger: '#fca5a5',
    dangerSoft: '#4c1d1d',
    warning: '#fdba74',
    success: '#4ade80',
    successSoft: '#214a2c',
    info: '#93c5fd',
    bubbleOwn: '#4a3d16',
    bubbleOther: '#292522',
    overlay: 'rgba(0,0,0,0.6)',
    skeleton: '#332f2a',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: undefined,
    mono: 'Menlo',
  },
  android: {
    sans: 'sans-serif',
    mono: 'monospace',
  },
  default: {
    sans: 'sans-serif',
    mono: 'monospace',
  },
});

/**
 * Sans styles carry prose and metadata. The mono styles are reserved for
 * identifiers (codes, codes) — never for timestamps, names, or labels.
 */
export const Typography = {
  // Prose
  message: {
    fontFamily: Fonts?.sans,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '400' as const,
  },
  body: {
    fontFamily: Fonts?.sans,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '400' as const,
  },
  bodyBold: {
    fontFamily: Fonts?.sans,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600' as const,
  },
  // Headings
  display: {
    fontFamily: Fonts?.sans,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700' as const,
  },
  titleLarge: {
    fontFamily: Fonts?.sans,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700' as const,
  },
  title: {
    fontFamily: Fonts?.sans,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600' as const,
  },
  subtitle: {
    fontFamily: Fonts?.sans,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600' as const,
  },
  // Secondary text — sans, not mono
  label: {
    fontFamily: Fonts?.sans,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500' as const,
  },
  caption: {
    fontFamily: Fonts?.sans,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '400' as const,
  },
  captionBold: {
    fontFamily: Fonts?.sans,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600' as const,
  },
  // Identifiers only
  metadata: {
    fontFamily: Fonts?.mono,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: Platform.OS === 'android' ? ('700' as const) : ('500' as const),
    letterSpacing: 0.3,
  },
  metadataLabel: {
    fontFamily: Fonts?.mono,
    fontSize: 10.5,
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

export const Radius = {
  small: 6,
  medium: 8,
  large: 12,
  xlarge: 20,
  pill: 999,
} as const;

/** Caps Dynamic Type growth so dense chat layouts stay intact. */
export const MaxFontScale = 1.3;

export const TouchTarget = Platform.select({ ios: 44, android: 48 }) ?? 44;

export const BottomTabInset = Platform.select({ ios: 50, android: 72 }) ?? 0;
export const MaxContentWidth = 800;
