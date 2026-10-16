import { Pressable, StyleSheet, View } from 'react-native';

import { ColoredAvatar } from '@/components/colored-avatar';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { hapticLight } from '@/lib/haptics';
import type { MentionCandidate } from '@/lib/mention-autocomplete';

const AVATAR_SIZE = 28;

/**
 * The list that opens above the composer while an `@token` is being typed.
 * Nothing here steals focus, so the keyboard stays up through the whole pick.
 */
export function MentionSuggestions({
  canLoadMore = false,
  candidates,
  loadingMore = false,
  onLoadMore,
  onSelect,
}: {
  canLoadMore?: boolean;
  candidates: MentionCandidate[];
  loadingMore?: boolean;
  onLoadMore?: () => void;
  onSelect: (candidate: MentionCandidate) => void;
}) {
  const theme = useTheme();
  if (!candidates.length && !canLoadMore && !loadingMore) return null;

  return (
    <View
      accessibilityLabel="Mention suggestions"
      accessibilityRole="menu"
      style={[styles.sheet, { backgroundColor: theme.backgroundElevated, borderColor: theme.hairline }]}>
      {candidates.map((candidate, index) => (
        <Pressable
          accessibilityHint="Adds this mention to your message"
          accessibilityLabel={`${candidate.label}, @${candidate.handle}`}
          accessibilityRole="menuitem"
          android_ripple={{ color: theme.backgroundSelected }}
          key={candidate.id}
          onPress={() => {
            hapticLight();
            onSelect(candidate);
          }}
          style={[styles.row, index > 0 && { borderTopColor: theme.hairline, borderTopWidth: StyleSheet.hairlineWidth }]}>
            <ColoredAvatar label={candidate.label} seed={candidate.id} size={AVATAR_SIZE} />
          <View style={styles.body}>
            <ThemedText numberOfLines={1} type="smallBold">
              {candidate.label}
            </ThemedText>
            {candidate.subtitle ? (
              <ThemedText numberOfLines={1} themeColor="textSecondary" type="caption">
                {candidate.subtitle}
              </ThemedText>
            ) : null}
          </View>
          <ThemedText numberOfLines={1} style={styles.handle} themeColor="textTertiary" type="mono">
          {`@${candidate.handle}`}
          </ThemedText>
        </Pressable>
      ))}
      {canLoadMore || loadingMore ? (
        <Pressable
          accessibilityLabel={loadingMore ? 'Loading more mention suggestions' : 'Load more mention suggestions'}
          accessibilityRole="button"
          accessibilityState={{ busy: loadingMore, disabled: loadingMore }}
          disabled={loadingMore}
          onPress={() => {
            if (!onLoadMore || loadingMore) return;
            hapticLight();
            onLoadMore();
          }}
          style={[styles.loadMore, candidates.length > 0 && { borderTopColor: theme.hairline, borderTopWidth: StyleSheet.hairlineWidth }]}
        >
          <ThemedText themeColor="textSecondary" type="captionBold">
            {loadingMore ? 'Loading more members…' : 'Load more members'}
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    flexShrink: 1,
    gap: 1,
    minWidth: 0,
  },
  handle: {
    flexShrink: 0,
    marginLeft: 'auto',
  },
  loadMore: {
    alignItems: 'center',
    minHeight: TouchTarget,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.two,
    minHeight: TouchTarget,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  sheet: {
    borderRadius: Radius.large,
    borderWidth: StyleSheet.hairlineWidth,
    marginHorizontal: Spacing.three,
    overflow: 'hidden',
  },
});
