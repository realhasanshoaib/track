import { useEffect, useRef } from 'react';
import { FlatList, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { PlatformIcon } from '@/components/platform-icon';
import { CompactPillButton } from '@/components/compact-pill-button';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, TouchTarget, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { hapticLight } from '@/lib/haptics';
import { EntityMark } from '@/components/entity-mark';

export type ConversationProjectTab = {
  actionBusy?: boolean;
  assignedCount?: number;
  colorKey?: string;
  countPartial?: boolean;
  iconKey?: string;
  id: string;
  name: string;
};

/** Compact, scrollable Project tabs keep the selected scope visible and unclipped. */
export function ConversationProjectTabs({ projects, selectedId, onSelect, onOpen , showProjectMarks = true, showAssignedCountOnMark = false }: {
  projects: ConversationProjectTab[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onOpen?: (id: string) => void;
  showProjectMarks?: boolean;
  showAssignedCountOnMark?: boolean;
}) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const tabListRef = useRef<FlatList<ConversationProjectTab>>(null);
  const tabs = [{ id: '', name: 'All Projects' }, ...projects];
  const selectedProject = projects.find((project) => project.id === selectedId);
  const selectedIndex = selectedProject ? projects.findIndex((project) => project.id === selectedProject.id) + 1 : 0;
  const maxTabWidth = Math.max(132, Math.min(248, width - Spacing.six));

  useEffect(() => {
    if (selectedIndex <= 0) return;
    const frame = requestAnimationFrame(() => tabListRef.current?.scrollToIndex({ index: selectedIndex, animated: false, viewPosition: 0.5 }));
    return () => cancelAnimationFrame(frame);
  }, [selectedIndex]);

  return <View style={styles.section}>
    {selectedProject && onOpen ? <View style={styles.sectionHeading}>
      <Pressable
        accessibilityLabel={`Open ${selectedProject.name} Project`}
        accessibilityRole="button"
        hitSlop={8}
        onPress={() => { hapticLight(); onOpen(selectedProject.id); }}
        style={({ pressed }) => [styles.openProject, { backgroundColor: pressed ? theme.backgroundSelected : 'transparent' }]}
      >
        <ThemedText themeColor="accentStrong" type="captionBold">Open Project</ThemedText>
        <PlatformIcon color={theme.accentStrong} name="chevron-right" size={16} weight="regular" />
      </Pressable>
    </View> : null}

    <FlatList
      accessibilityLabel="Project scope"
      accessibilityRole="tablist"
      contentContainerStyle={styles.tabs}
      data={tabs}
      horizontal
      keyExtractor={(item) => item.id || 'all-projects'}
      onScrollToIndexFailed={({ averageItemLength, index }) => {
        requestAnimationFrame(() => tabListRef.current?.scrollToOffset({ offset: Math.max(1, averageItemLength || maxTabWidth / 2) * index, animated: false }));
      }}
      ref={tabListRef}
      renderItem={({ item }) => {
        const selected = (selectedId ?? '') === item.id;
        const accessibleCount = item.assignedCount === undefined
          ? ''
          : `, ${item.assignedCount}${item.countPartial ? ' or more' : ''} assigned ${item.assignedCount === 1 ? 'task' : 'tasks'}`;
        const projectMark = item.id && showProjectMarks
          ? <View style={styles.projectMarkWrap}>
            <EntityMark colorKey={item.colorKey} iconKey={item.iconKey} id={item.id} kind="project" name={item.name} size={22} />
            {showAssignedCountOnMark && item.assignedCount !== undefined ? <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={[styles.projectCountBadge, { backgroundColor: theme.accent, borderColor: theme.homeBackground }]}
            ><ThemedText style={styles.projectCountText} themeColor="accentInk" type="captionBold">{item.assignedCount > 99 ? '99+' : `${item.assignedCount}${item.countPartial ? '+' : ''}`}</ThemedText></View> : null}
          </View>
          : <PlatformIcon color={selected ? theme.accentStrong : theme.textSecondary} name={item.id ? 'project' : 'office-building'} size={15} weight="regular" />;
        const projectPill = <CompactPillButton
          accessibilityLabel={`${item.name}${accessibleCount}${selected ? ', selected' : ''}`}
          accessibilityRole="tab"
          accessibilityState={{ selected }}
          onPress={() => { hapticLight(); onSelect(item.id || null); }}
          targetStyle={{ maxWidth: maxTabWidth }}
          pillStyle={{
            backgroundColor: selected ? theme.accentSoft : theme.homeSurface,
            borderColor: selected ? 'transparent' : theme.homeBorder,
            flexShrink: 0,
            maxWidth: maxTabWidth,
          }}
          pressedPillStyle={{ backgroundColor: theme.backgroundElevated, borderColor: 'transparent' }}
        >
          {projectMark}
          <ThemedText numberOfLines={1} style={styles.tabLabel} type={selected ? 'captionBold' : 'caption'}>{item.name}</ThemedText>
          {item.id && !showAssignedCountOnMark && item.assignedCount !== undefined ? <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.countBadge, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText style={styles.tabularNumber} themeColor="textSecondary" type="captionBold">{item.assignedCount > 99 ? '99+' : `${item.assignedCount}${item.countPartial ? '+' : ''}`}</ThemedText>
          </View> : null}
          {selected ? <PlatformIcon color={theme.accentStrong} name="check" size={14} weight="semibold" /> : null}
        </CompactPillButton>;
        return projectPill;
      }}
      showsHorizontalScrollIndicator={false}
    />

  </View>;
}

const styles = StyleSheet.create({
  openProject: { alignItems: 'center', borderRadius: Radius.small, flexDirection: 'row', gap: Spacing.one, minHeight: TouchTarget, paddingHorizontal: Spacing.two },
  section: { gap: Spacing.one },
  sectionHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 32 },
  countBadge: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.pill, justifyContent: 'center', minHeight: 22, minWidth: 22, paddingHorizontal: Spacing.one },
  projectMarkWrap: { height: 24, marginRight: 2, position: 'relative', width: 24 },
  projectCountBadge: { alignItems: 'center', borderRadius: Radius.pill, borderWidth: 1.5, justifyContent: 'center', minHeight: 24, minWidth: 24, paddingHorizontal: 3, paddingVertical: 2, position: 'absolute', right: -7, top: -5 },
  projectCountText: Typography.captionBold,
  tabularNumber: { fontVariant: ['tabular-nums'] },
  tabLabel: { flexShrink: 1, minWidth: 0 },
  tabs: { alignItems: 'center', gap: Spacing.two, paddingRight: Spacing.four },
});
