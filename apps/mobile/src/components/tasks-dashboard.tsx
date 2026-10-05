import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AssistantMark } from '@/components/chat/assistant-mark';
import { CompactPillButton } from '@/components/compact-pill-button';
import { EntityMark } from '@/components/entity-mark';
import { PlatformIcon } from '@/components/platform-icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, TouchTarget, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type TaskViewMode = 'board' | 'list';

export function TasksToolbar({ boardName, boardId, boardColorKey, boardIconKey, filterActive, mode, onAttentionPress, onBoardPress, onFilterPress, onModeChange, onSearchPress, projectName, scopeLabel, searchActive, taskCount }: {
  boardName: string; boardId?: string; boardColorKey?: string | null; boardIconKey?: string | null; filterActive: boolean; mode: TaskViewMode; onAttentionPress: () => void; onBoardPress: () => void; onFilterPress: () => void; onModeChange: (mode: TaskViewMode) => void; onSearchPress: () => void; projectName: string; scopeLabel: 'Channel' | 'Project'; searchActive: boolean; taskCount: number;
}) {
  const theme = useTheme();
  return <View style={styles.toolbar}>
    <View style={styles.toolbarLine}>
      <Pressable accessibilityLabel={`Board: ${boardName}. Project: ${projectName}`} accessibilityRole="button" android_ripple={{ color: theme.backgroundSelected }} onPress={onBoardPress} style={[styles.boardSelector, { backgroundColor: theme.backgroundElement }]}>
        {boardId ? <View style={styles.boardMarkWrap}>
          <EntityMark colorKey={boardColorKey} iconKey={boardIconKey} id={boardId} kind="board" name={boardName} size={24} />
        </View> : <PlatformIcon color={theme.accentStrong} name="view-board" size={17} />}
        <View style={styles.boardCopy}><ThemedText numberOfLines={1} style={styles.boardEyebrow} themeColor="textSecondary" type="captionBold">Current Board</ThemedText><ThemedText numberOfLines={1} type="smallBold">{boardName}</ThemedText><ThemedText numberOfLines={1} themeColor="textTertiary" type="caption">{scopeLabel} · {projectName}</ThemedText></View>
        <View style={[styles.boardDropdownCircle, { backgroundColor: theme.homeSurface, borderColor: theme.homeBorder }]}><PlatformIcon color={theme.textSecondary} name="chevron-down" size={13} /></View>
      </Pressable>
      <View style={styles.toolbarActions}>
        <ToolbarIcon active={false} icon="flag" label="Board attention" onPress={onAttentionPress} />
        <ToolbarIcon active={searchActive} icon="search" label="Search tasks" onPress={onSearchPress} />
        <ToolbarIcon active={filterActive} icon="filter" label="Filter and sort tasks" onPress={onFilterPress} />
      </View>
    </View>
    <ScrollView contentContainerStyle={styles.toolbarScrollRow} horizontal showsHorizontalScrollIndicator={false}>
      <View accessibilityLabel="Task view" accessibilityRole="tablist" style={[styles.viewSwitch, { backgroundColor: theme.homeSurface, borderColor: theme.homeBorder }]}><ViewToggle count={taskCount} icon="view-board" label="Board" mode="board" onPress={onModeChange} selected={mode === 'board'} /><ViewToggle icon="list" label="List" mode="list" onPress={onModeChange} selected={mode === 'list'} /></View>
    </ScrollView>
  </View>;
}

function ToolbarIcon({ active, icon, label, onPress }: { active: boolean; icon: 'filter' | 'flag' | 'search'; label: string; onPress: () => void }) {
  const theme = useTheme();
  return <Pressable accessibilityLabel={label} accessibilityRole="button" accessibilityState={{ selected: active }} android_ripple={{ color: theme.backgroundSelected, borderless: true }} onPress={onPress} style={[styles.toolbarIcon, { backgroundColor: active ? theme.accentSoft : theme.backgroundElement }]}><PlatformIcon color={active ? theme.accentStrong : theme.textSecondary} name={icon} size={18} /></Pressable>;
}

function ViewToggle({ count, icon, label, mode, onPress, selected }: { count?: number; icon: 'list' | 'view-board'; label: string; mode: TaskViewMode; onPress: (mode: TaskViewMode) => void; selected: boolean }) {
  const theme = useTheme();
  return <CompactPillButton accessibilityLabel={count === undefined ? `${label} view` : `${label} view, ${count} ${count === 1 ? 'task' : 'tasks'}`} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => onPress(mode)} pillStyle={{ alignSelf: 'center', backgroundColor: selected ? theme.accent : 'transparent', borderColor: selected ? theme.accentStrong : 'transparent', flexGrow: 0, flexShrink: 0, minHeight: 36, maxWidth: '100%' }} pressedPillStyle={{ backgroundColor: theme.backgroundSelected, borderColor: theme.accentStrong }} targetStyle={styles.viewToggleTarget}>
    <PlatformIcon color={selected ? theme.accentInk : theme.textSecondary} name={icon} size={15} />
    <ThemedText numberOfLines={1} style={[styles.viewToggleLabel, { color: selected ? theme.accentInk : theme.textSecondary }]} type="captionBold">{label}</ThemedText>
    {count === undefined ? null : <>
      <View style={[styles.viewCountBadge, { backgroundColor: theme.accentSoft }]}>
        <ThemedText numberOfLines={1} themeColor="accentStrong" type="captionBold">{count > 99 ? '99+' : count}</ThemedText>
      </View>
      <View style={[styles.viewArrowCircle, { backgroundColor: theme.backgroundElevated, borderColor: theme.homeBorder }]}>
        <PlatformIcon color={theme.textSecondary} name="chevron-right" size={12} />
      </View>
    </>}
  </CompactPillButton>;
}

export function TaskSuggestionBanner({ channelName, onDismiss, onReview, title }: { channelName?: string; onDismiss?: () => void; onReview: () => void; title: string }) {
  const theme = useTheme();
  return <View style={[styles.suggestionBanner, { backgroundColor: theme.backgroundElevated, borderColor: theme.hairline }]}>
    <View style={[styles.suggestionRail, { backgroundColor: theme.accentStrong }]} /><AssistantMark size={30} />
    <View style={styles.suggestionBody}>
      <View style={styles.suggestionMeta}><ThemedText themeColor="accentStrong" type="captionBold">Automated capture</ThemedText>{channelName ? <ThemedText themeColor="textTertiary" type="caption">from #{channelName}</ThemedText> : null}</View>
      <ThemedText numberOfLines={2} type="small">“{title}”</ThemedText>
      <View style={styles.suggestionActions}><Pressable accessibilityRole="button" onPress={onReview} style={[styles.reviewButton, { backgroundColor: theme.text }]}><ThemedText style={{ color: theme.background }} type="captionBold">Review &amp; Accept</ThemedText></Pressable>{onDismiss ? <Pressable accessibilityRole="button" onPress={onDismiss} style={styles.dismissButton}><ThemedText themeColor="textSecondary" type="captionBold">Dismiss</ThemedText></Pressable> : null}</View>
    </View>
  </View>;
}

export function SprintFlowHeader({ activeStateId, columnCount, onStatePress, states, taskCount }: {
  activeStateId?: string;
  columnCount: number;
  onStatePress?: (stateId: string) => void;
  states?: Array<{ _id: string; name: string }>;
  taskCount: number;
}) {
  const theme = useTheme();
  const flowStates = states?.length ? states : Array.from({ length: Math.max(1, columnCount) }, (_, index) => ({ _id: String(index), name: `Status ${index + 1}` }));
  return <View style={styles.flowHeader}>
    <View style={styles.flowCopy}><ThemedText numberOfLines={1} themeColor="textSecondary" type="captionBold">Sprint flow</ThemedText><ThemedText numberOfLines={1} themeColor="textSecondary" type="captionBold">{taskCount} {taskCount === 1 ? 'task' : 'tasks'}</ThemedText></View>
    <ScrollView accessibilityLabel="Sprint flow status" accessibilityRole="tablist" contentContainerStyle={styles.flowDots} horizontal showsHorizontalScrollIndicator={false} style={styles.flowDotsScroll}>{flowStates.map((state, index) => {
      const selected = activeStateId ? activeStateId === state._id : index === 0;
      return <CompactPillButton accessibilityLabel={`Show ${state.name}`} accessibilityRole="tab" accessibilityState={{ selected }} key={state._id} onPress={() => onStatePress?.(state._id)} pillStyle={{ backgroundColor: selected ? theme.accentSoft : theme.backgroundElement, borderColor: 'transparent', maxWidth: '100%' }} pressedPillStyle={{ backgroundColor: theme.homeBackground }} targetStyle={styles.flowTabTarget}>
        <View style={[styles.flowDot, { backgroundColor: selected ? theme.accentStrong : theme.textTertiary }]} />
        <ThemedText numberOfLines={1} style={styles.flowTabLabel} themeColor={selected ? 'accentStrong' : 'textSecondary'} type="captionBold">{state.name}</ThemedText>
      </CompactPillButton>;
    })}</ScrollView>
  </View>;
}

export function TaskCreateContext({ boardName, projectName }: { boardName?: string; projectName: string }) {
  const theme = useTheme();
  return <View style={[styles.createContext, { backgroundColor: theme.backgroundElement }]}>
    <PlatformIcon color={theme.accentStrong} name="project" size={20} />
    <View style={styles.boardCopy}>
      <ThemedText numberOfLines={1} type="smallBold">{projectName}</ThemedText>
      {boardName ? <ThemedText numberOfLines={1} themeColor="textSecondary" type="caption">Board · {boardName}</ThemedText> : null}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  boardCopy: { flex: 1, minWidth: 0 },
  boardDropdownCircle: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth, height: 28, justifyContent: 'center', width: 28 },
  boardEyebrow: Typography.captionBold,
  boardMarkWrap: { alignItems: 'center', height: 26, justifyContent: 'center', position: 'relative', width: 26 },
  boardSelector: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.large, flex: 1, flexDirection: 'row', gap: Spacing.two, maxWidth: 270, minHeight: 64, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
  createContext: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.medium, flexDirection: 'row', gap: Spacing.two, minHeight: TouchTarget, padding: Spacing.three },
  dismissButton: { alignItems: 'center', justifyContent: 'center', minHeight: TouchTarget, paddingHorizontal: Spacing.two },
  flowCopy: { alignItems: 'center', flexDirection: 'row', flexShrink: 0, gap: Spacing.two, justifyContent: 'space-between', minHeight: 24 },
  flowDot: { borderRadius: Radius.pill, height: 7, width: 7 },
  flowDots: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two, paddingRight: Spacing.two },
  flowDotsScroll: { flexGrow: 0, minWidth: 0, width: '100%' },
  flowHeader: { alignItems: 'stretch', gap: Spacing.one, paddingTop: Spacing.one },
  flowTabLabel: { flexShrink: 1 },
  flowTabTarget: { flexShrink: 0, maxWidth: 180 },
  reviewButton: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.medium, justifyContent: 'center', minHeight: TouchTarget, paddingHorizontal: Spacing.three },
  suggestionActions: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one, paddingTop: Spacing.one },
  suggestionBanner: { borderCurve: 'continuous', borderRadius: Radius.large, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: Spacing.two, overflow: 'hidden', padding: Spacing.three },
  suggestionBody: { flex: 1, gap: Spacing.one, minWidth: 0 },
  suggestionMeta: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  suggestionPill: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.medium, flexDirection: 'row', gap: Spacing.one, minHeight: TouchTarget, paddingHorizontal: Spacing.three },
  suggestionRail: { bottom: 0, left: 0, position: 'absolute', top: 0, width: 3 },
  toolbar: { gap: Spacing.three },
  toolbarActions: { alignItems: 'center', flexDirection: 'row', gap: Spacing.one },
  toolbarIcon: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.large, height: TouchTarget, justifyContent: 'center', overflow: 'hidden', width: TouchTarget },
  toolbarLine: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two, justifyContent: 'space-between' },
  toolbarScrollRow: { alignItems: 'center', gap: Spacing.two, minWidth: '100%', paddingVertical: Spacing.half },
  viewSwitch: { alignSelf: 'flex-start', borderCurve: 'continuous', borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', maxWidth: '100%', padding: 2 },
  viewToggleTarget: { alignSelf: 'center', flexGrow: 0, flexShrink: 0, minHeight: TouchTarget, minWidth: TouchTarget },
  viewToggleLabel: { flexShrink: 1 },
  viewCountBadge: { alignItems: 'center', borderRadius: Radius.pill, justifyContent: 'center', minWidth: 18, paddingHorizontal: 5, paddingVertical: 2 },
  viewArrowCircle: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth, height: 22, justifyContent: 'center', width: 22 },
});
