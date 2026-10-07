import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { AssistantMark } from '@/components/chat/assistant-mark';
import { ColoredAvatar } from '@/components/colored-avatar';
import { EntityMark } from '@/components/entity-mark';
import { PlatformIcon, type IconName } from '@/components/platform-icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { AnimatedPressable, usePressFeedback } from '@/hooks/use-press-feedback';
import { attentionAction, attentionContext, attentionTitle, relativeAttentionTime, type MobileAttentionItem } from '@/lib/mobile-attention';

export function ProjectHero({ archived, colorKey, company, description, iconKey, memberCount, name, projectId, role }: { archived: boolean; colorKey?: string | null; company: string; description?: string; iconKey?: string | null; memberCount?: number | string; name: string; projectId: string; role: string }) {
  const theme = useTheme();
  const largeText = useWindowDimensions().fontScale > 1.2;
  const statusColor = archived ? theme.textTertiary : theme.success;
  return <View style={[styles.hero, { backgroundColor: theme.homeSurface, borderColor: theme.homeBorder }]}>
    <View style={[styles.heroTopline, largeText && styles.heroToplineLarge]}>
      <View style={styles.companyLine}><PlatformIcon color={theme.textTertiary} name="office-building" size={14} /><ThemedText numberOfLines={2} style={styles.company} themeColor="textSecondary" type="captionBold">{company}</ThemedText></View>
      <ThemedText themeColor="textSecondary" type="captionBold">{role}</ThemedText>
    </View>
    <View style={styles.heroIdentity}>
      <EntityMark colorKey={colorKey} iconKey={iconKey} id={projectId} kind="project" name={name} size={48} />
      <ThemedText numberOfLines={largeText ? undefined : 2} style={styles.heroName} type="titleLarge">{name}</ThemedText>
    </View>
    {description ? <ThemedText numberOfLines={largeText ? undefined : 3} themeColor="textSecondary" type="small">{description}</ThemedText> : null}
    <View style={[styles.heroFooter, { borderTopColor: theme.hairline }]}>
      <View style={styles.statusLine}><View style={[styles.statusDot, { backgroundColor: statusColor }]} /><ThemedText style={{ color: statusColor }} type="captionBold">{archived ? 'Archived Project' : 'Active Project'}</ThemedText></View>
      {memberCount !== undefined ? <View style={styles.statusLine}><PlatformIcon color={theme.textTertiary} name="account-group" size={15} /><ThemedText themeColor="textSecondary" type="caption">{memberCount} {memberCount === 1 || memberCount === '1' ? 'member' : 'members'}</ThemedText></View> : null}
    </View>
  </View>;
}

export function ProjectMetrics({ channels, people, tasks, tasksEnabled, unread }: { channels: number; people: number | string; tasks: number; tasksEnabled: boolean; unread: number }) {
  const largeText = useWindowDimensions().fontScale > 1.2;
  return <View style={[styles.metrics, largeText && styles.metricsLarge]}>
    <Metric detail={`${unread} unread`} emphasis={unread > 0} label="Channels" value={channels} />
    {tasksEnabled ? <Metric detail="open" label="Tasks" value={tasks} /> : null}
    <Metric detail="collabs" label="People" value={people} />
  </View>;
}

export function ProjectProgress({ completed, total }: { completed: number; total: number }) {
  const theme = useTheme();
  const percent = total ? Math.round((completed / total) * 100) : 0;
  return <View style={[styles.progress, { backgroundColor: theme.homeSurface, borderColor: theme.homeBorder }]}>
    <View style={styles.progressHeading}>
      <View>
        <ThemedText type="title">Project progress</ThemedText>
        <ThemedText themeColor="textSecondary" type="caption">{completed} of {total} tasks complete</ThemedText>
      </View>
      <ThemedText style={styles.progressValue} type="subtitle">{percent}%</ThemedText>
    </View>
    <View accessibilityLabel={`${percent} percent complete`} accessibilityRole="progressbar" accessibilityValue={{ max: 100, min: 0, now: percent }} style={[styles.progressTrack, { backgroundColor: theme.backgroundSelected }]}>
      <View style={[styles.progressFill, { backgroundColor: theme.accent, width: `${percent}%` }]} />
    </View>
  </View>;
}

function Metric({ detail, emphasis, label, value }: { detail: string; emphasis?: boolean; label: string; value: number | string }) {
  const theme = useTheme();
  return <View style={[styles.metric, { backgroundColor: theme.homeSurface }]}><ThemedText style={styles.metricLabel} themeColor="textSecondary" type="captionBold">{label}</ThemedText><View style={styles.metricResult}><ThemedText style={styles.metricValue}>{value}</ThemedText><ThemedText numberOfLines={1} themeColor={emphasis ? 'accentStrong' : 'textSecondary'} type="caption">{detail}</ThemedText></View></View>;
}

export function ProjectWorkHub({ channelCount, dueSoonCount, onBoard, onChannels, onTasks, openTaskCount, tasksEnabled, unreadCount }: { channelCount: number; dueSoonCount: number; onBoard: () => void; onChannels: () => void; onTasks: () => void; openTaskCount: number; tasksEnabled: boolean; unreadCount: number }) {
  const largeText = useWindowDimensions().fontScale > 1.2;
  return <View style={styles.workSection}>
    <SectionHeading title="Project workspace" />
    <View style={styles.workGrid}>
      <HubRow detail={`${channelCount} ${channelCount === 1 ? 'Channel' : 'Channels'}${unreadCount ? ` \u00b7 ${unreadCount} unread` : ''}`} icon="channel" label="Channels" onPress={onChannels} wide />
      {tasksEnabled ? <View style={[styles.workPair, largeText && styles.workPairLarge]}>
        <HubRow detail={`${openTaskCount} open${dueSoonCount ? ` · ${dueSoonCount} due soon` : ''}`} icon="task" label="Tasks" onPress={onTasks} />
        <HubRow detail="View work by status" icon="view-board" label="Board" onPress={onBoard} />
      </View> : null}
    </View>
  </View>;
}

function HubRow({ detail, icon, label, onPress, wide = false }: { detail: string; icon: IconName; label: string; onPress: () => void; wide?: boolean }) {
  const theme = useTheme();
  const { animatedStyle, onPressIn, onPressOut } = usePressFeedback({ pressedScale: 0.985 });
  return <AnimatedPressable accessibilityLabel={`${label}. ${detail}`} accessibilityRole="button" android_ripple={{ color: theme.backgroundSelected }} onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut} style={[styles.hubRow, wide ? styles.hubRowWide : styles.hubRowTile, { backgroundColor: theme.homeSurface, borderColor: theme.homeBorder }, animatedStyle]}>
    <View style={[styles.hubIcon, { backgroundColor: theme.backgroundElement }]}><PlatformIcon color={theme.text} name={icon} size={17} /></View>
    <View style={styles.flex}><ThemedText type="title">{label}</ThemedText><ThemedText numberOfLines={2} themeColor="textSecondary" type="caption">{detail}</ThemedText></View>
    <View style={wide ? undefined : styles.hubTileArrow}><PlatformIcon color={theme.textTertiary} name="chevron-right" size={16} /></View>
  </AnimatedPressable>;
}

export function ProjectAttention({ items, onOpen }: { items: MobileAttentionItem[]; onOpen: (item: MobileAttentionItem) => void }) {
  const theme = useTheme();
  if (!items.length) return null;
  return <View style={styles.attentionSection}>
    <SectionHeading title="Needs your attention" />
    <View style={[styles.attentionList, { backgroundColor: theme.homeSurface, borderColor: theme.homeBorder }]}>
      {items.map((item, index) => <AttentionCard item={item} key={`${item.kind}:${item.id}`} last={index === items.length - 1} onPress={() => onOpen(item)} />)}
    </View>
  </View>;
}

function AttentionCard({ item, last, onPress }: { item: MobileAttentionItem; last: boolean; onPress: () => void }) {
  const theme = useTheme();
  const largeText = useWindowDimensions().fontScale > 1.2;
  const task = item.kind === 'task';
  const suggestion = item.kind === 'suggestion';
  const message = item.kind === 'message';
  const urgent = task && (item.eventType === 'overdue' || item.eventType === 'due_soon');
  const identity = message ? `${item.senderName} in #${item.groupName}` : task ? item.taskKey : suggestion ? 'Track assistant' : item.companyName;
  const actionLabel = suggestion ? 'Review & Create' : task ? 'View Task' : message ? item.threadId ? 'Reply in thread' : 'Open Channel' : 'Review invitation';
  return <View style={[styles.attentionSurface, { borderBottomColor: theme.hairline, borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth }]}>
    <Pressable accessibilityLabel={`${attentionTitle(item)}. ${attentionAction(item)}. ${attentionContext(item)}`} accessibilityRole="button" android_ripple={{ color: theme.backgroundSelected }} onPress={onPress} style={({ pressed }) => [styles.attentionCard, pressed && { backgroundColor: theme.backgroundElement }]}>
    <View style={styles.attentionTopline}>
      <View style={styles.attentionIdentity}>{suggestion ? <AssistantMark size={24} /> : message ? <ColoredAvatar label={item.senderName} seed={item.senderName} size={24} /> : <View style={[styles.attentionIcon, { backgroundColor: urgent ? theme.dangerSoft : theme.backgroundElement }]}><PlatformIcon color={urgent ? theme.danger : theme.textSecondary} name="check-circle" size={14} /></View>}<ThemedText numberOfLines={1} style={styles.flex} themeColor="textSecondary" type="captionBold">{identity}</ThemedText></View>
      <ThemedText themeColor={urgent ? 'danger' : 'textTertiary'} type="caption">{relativeAttentionTime(item.createdAt)}</ThemedText>
    </View>
    {message ? <ThemedText numberOfLines={3} type="caption">{item.preview}</ThemedText> : <><ThemedText numberOfLines={2} type="title">{attentionTitle(item)}</ThemedText>{suggestion || item.kind === 'invitation' ? <ThemedText numberOfLines={2} themeColor="textSecondary" type="caption">{item.preview}</ThemedText> : null}</>}
    <View style={[styles.attentionFooter, largeText && styles.attentionFooterLarge]}><ThemedText style={styles.flex} themeColor="textTertiary" type="caption">{attentionAction(item)}</ThemedText><View style={[styles.inlineAction, { backgroundColor: suggestion ? theme.accent : theme.backgroundElement }]}><ThemedText style={suggestion ? styles.actionInk : { color: theme.text }} type="captionBold">{actionLabel}</ThemedText></View></View>
    </Pressable>
  </View>;
}

function SectionHeading({ title }: { title: string }) {
  return <View style={styles.sectionHeading}><ThemedText style={styles.sectionTitle} type="subtitle">{title}</ThemedText></View>;
}

const styles = StyleSheet.create({
  actionInk: { color: '#1b1917' },
  attentionCard: { gap: Spacing.two, padding: Spacing.three },
  attentionFooter: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two, justifyContent: 'space-between' },
  attentionFooterLarge: { alignItems: 'flex-start', flexDirection: 'column' },
  attentionIcon: { alignItems: 'center', borderRadius: Radius.medium, height: 24, justifyContent: 'center', width: 24 },
  attentionIdentity: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: Spacing.two, minWidth: 0 },
  attentionList: { borderCurve: 'continuous', borderRadius: Radius.large, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  attentionSection: { gap: Spacing.one },
  attentionSurface: { overflow: 'hidden' },
  attentionTopline: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two },
  company: { flexShrink: 1 },
  companyLine: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: Spacing.one, minWidth: 0 },
  flex: { flex: 1, minWidth: 0 },
  hero: { borderCurve: 'continuous', borderRadius: Radius.large, borderWidth: StyleSheet.hairlineWidth, gap: Spacing.three, padding: Spacing.four },
  heroFooter: { alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three, paddingTop: Spacing.three },
  heroIdentity: { alignItems: 'center', flexDirection: 'row', gap: Spacing.three, minWidth: 0 },
  heroName: { flex: 1, minWidth: 0 },
  heroTopline: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two, justifyContent: 'space-between' },
  heroToplineLarge: { alignItems: 'flex-start', flexDirection: 'column' },
  hubIcon: { alignItems: 'center', borderRadius: Radius.medium, height: 40, justifyContent: 'center', width: 40 },
  hubRow: { borderCurve: 'continuous', borderRadius: Radius.large, borderWidth: StyleSheet.hairlineWidth, gap: Spacing.two, overflow: 'hidden', padding: Spacing.three },
  hubRowTile: { flex: 1, minHeight: 132 },
  hubRowWide: { alignItems: 'center', flexDirection: 'row', minHeight: 80 },
  hubTileArrow: { alignSelf: 'flex-end' },
  inlineAction: { borderRadius: Radius.small, minHeight: 30, paddingHorizontal: Spacing.two, paddingVertical: 7 },
  metric: { borderCurve: 'continuous', borderRadius: Radius.medium, flex: 1, gap: 2, minWidth: 0, padding: Spacing.three },
  metricLabel: Typography.captionBold,
  metricResult: { alignItems: 'baseline', flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  metrics: { flexDirection: 'row', gap: Spacing.three },
  metricsLarge: { flexDirection: 'column' },
  metricValue: { fontSize: 16, fontVariant: ['tabular-nums'], fontWeight: '700', lineHeight: 22 },
  progress: { borderCurve: 'continuous', borderRadius: Radius.large, borderWidth: StyleSheet.hairlineWidth, gap: Spacing.three, padding: Spacing.four },
  progressFill: { borderRadius: Radius.pill, bottom: 0, left: 0, position: 'absolute', top: 0 },
  progressHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  progressTrack: { borderRadius: Radius.pill, height: 8, overflow: 'hidden' },
  progressValue: { fontVariant: ['tabular-nums'] },
  sectionHeading: { marginBottom: Spacing.one, marginTop: Spacing.two },
  sectionTitle: { letterSpacing: -0.15 },
  statusDot: { borderRadius: Radius.pill, height: 7, width: 7 },
  statusLine: { alignItems: 'center', flexDirection: 'row', gap: Spacing.one },
  workGrid: { gap: Spacing.two },
  workPair: { flexDirection: 'row', gap: Spacing.two },
  workPairLarge: { flexDirection: 'column' },
  workSection: { gap: Spacing.one },
});
