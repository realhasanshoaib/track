import { describe, expect, it } from 'vitest'

import { entityDirectoryRow, entityDirectoryRowStyle } from './entity-directory-row'

describe('Channel and Board directory row geometry', () => {
  it('keeps both row types on the same comfortable, aligned layout', () => {
    expect(entityDirectoryRow).toEqual({
      iconSize: 42,
      minHeight: 68,
      gap: 8,
      copyGap: 3,
      horizontalMargin: 4,
      horizontalPadding: 12,
      verticalPadding: 8,
      separatorPadding: 4,
      borderRadius: 8,
    })
    expect(entityDirectoryRow.minHeight).toBeGreaterThanOrEqual(48)
    expect(entityDirectoryRow.minHeight).toBeGreaterThanOrEqual(entityDirectoryRow.iconSize + entityDirectoryRow.verticalPadding * 2)
    expect(entityDirectoryRowStyle).toEqual({
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
    })
  })
})
