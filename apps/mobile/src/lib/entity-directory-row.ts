/** Shared geometry for tappable Channel and Board rows. */
export const entityDirectoryRow = {
  iconSize: 48,
  minHeight: 68,
  gap: 8,
  copyGap: 3,
  horizontalMargin: 4,
  horizontalPadding: 12,
  verticalPadding: 8,
  separatorPadding: 4,
  borderRadius: 8,
} as const;

/** One layout contract for tappable Channel and Board directory rows. */
export const entityDirectoryRowStyle = {
  alignItems: 'center',
  borderCurve: 'continuous',
  borderRadius: entityDirectoryRow.borderRadius,
  flexDirection: 'row',
  gap: entityDirectoryRow.gap,
  marginHorizontal: entityDirectoryRow.horizontalMargin,
  minHeight: entityDirectoryRow.minHeight,
  overflow: 'hidden',
  paddingHorizontal: entityDirectoryRow.horizontalPadding,
  paddingVertical: entityDirectoryRow.verticalPadding,
} as const;
