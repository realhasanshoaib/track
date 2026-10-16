import { StyleSheet, View } from 'react-native'

import { ThemedText } from '@/components/themed-text'
import { Radius } from '@/constants/theme'

/**
 * Fixed identity colours, not theme colours: an avatar keeps the same hue in
 * light and dark so a group stays recognisable. Each pair is
 * self-contained, so its contrast (all above 4.8:1) holds in both themes.
 * Colour is never the only signal — the initial and the adjacent name carry it.
 */
const PALETTE = [
  { bg: '#5b6d4a', fg: '#e8f0e3' }, // olive
  { bg: '#7a4a3a', fg: '#f5e8e4' }, // clay
  { bg: '#3a4a6d', fg: '#e3e8f5' }, // blue
  { bg: '#4a3a1c', fg: '#f5ede3' }, // amber-stone
] as const

function hashPalette(seed: string) {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]
}

type Props = {
  label: string
  seed?: string
  size?: number
  shape?: 'circle' | 'rounded'
}

export function ColoredAvatar({ label, seed, size = 40, shape = 'circle' }: Props) {
  const { bg, fg } = hashPalette(seed ?? label)
  const radius = shape === 'circle' ? Radius.pill : Radius.medium
  const fontSize = size * 0.38

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.base,
        { backgroundColor: bg, borderRadius: radius, width: size, height: size },
      ]}
    >
      <ThemedText style={[styles.letter, { color: fg, fontSize, lineHeight: size }]}>
        {label.slice(0, 1).toUpperCase()}
      </ThemedText>
    </View>
  )
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  letter: {
    fontWeight: '700',
    textAlign: 'center',
  },
})
