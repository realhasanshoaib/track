import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { usePaginatedQuery, useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';

import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import { ConnectivityBanner } from '@/components/connectivity-banner';
import { CompactPillButton } from '@/components/compact-pill-button';
import { EntityMark } from '@/components/entity-mark';
import { EmptyState } from '@/components/empty-state';
import { IconButton } from '@/components/icon-button';
import { PlatformIcon } from '@/components/platform-icon';
import { ConversationProjectTabs } from '@/components/conversation-project-tabs';
import { ScreenLoading } from '@/components/screen-loading';
import { ThemedText } from '@/components/themed-text';
import { ThemedTextInput } from '@/components/themed-text-input';
import { ThemedView } from '@/components/themed-view';
import { OptionsSheet, SheetNote, SheetRow, SheetSection } from '@/components/options-sheet';
import { MaxFontScale, Radius, Spacing, TouchTarget, Typography } from '@/constants/theme';
import { useCompany } from '@/contexts/company-context';
import { usePrimaryNavigationVisibility } from '@/contexts/primary-navigation-visibility-context';
import { useTrackUser } from '@/contexts/track-user-context';
import { useBottomTabContentInset } from '@/hooks/use-bottom-tab-inset';
import { useTheme } from '@/hooks/use-theme';
import { channelHref, projectOverviewHref, type RepresentedProjectContext } from '@/lib/company-navigation';
import { hapticLight } from '@/lib/haptics';
import { threadConversationHref } from '@/lib/thread-navigation';
import { taskListHref } from '@/lib/task-navigation';
import { useReleaseConfig } from '@/lib/release-config';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type ProjectRow = NonNullable<FunctionReturnType<typeof api.mobile.listProjects>['page'][number]>;
type ChannelRow = FunctionReturnType<typeof api.mobile.listGroupsPage>['page'][number];
type ThreadRow = FunctionReturnType<typeof api.channelThreads.listProjectPage>['page'][number];
type ProjectMessageResult = FunctionReturnType<typeof api.search.project>['messages'][number];
type ConversationFilter = 'all' | 'unread' | 'channels' | 'threads';
type ConversationActionTarget = { context: string; href: Href; label: string; openLabel: string; projectHref: Href };

export default function ConversationsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const routeParams = useLocalSearchParams<{ archive?: string; companyId?: string; membershipId?: string; projectId?: string; startup?: string }>();
  const bottomInset = useBottomTabContentInset(Spacing.five);
  const safeAreaInsets = useSafeAreaInsets();
  const { actingCompany, actingCompanyId, companies, setActingCompanyId } = useCompany();
  const { trackUserId } = useTrackUser();
  const { setCreateAction, setCreateContext } = usePrimaryNavigationVisibility();
  const release = useReleaseConfig();
  const [companySheetOpen, setCompanySheetOpen] = useState(false);
  const [conversationActions, setConversationActions] = useState<ConversationActionTarget | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedRouteProject, setSelectedRouteProject] = useState<ProjectRow | null>(null);
  const [filter, setFilter] = useState<ConversationFilter>('all');
  const [search, setSearch] = useState('');
  const routeSelection = useRef<string | null>(null);
  const startingAtChats = routeParams.startup === '1';
  const activeCompanies = useMemo(() => (companies ?? []).filter(({ company }) => company?.status === 'active'), [companies]);
  useEffect(() => {
    if (startingAtChats) return;
    if (!actingCompanyId && activeCompanies[0]?.company?._id) setActingCompanyId(activeCompanies[0].company._id);
  }, [actingCompanyId, activeCompanies, setActingCompanyId, startingAtChats]);
  useEffect(() => {
    if (startingAtChats) return;
    const requestedCompanyId = routeParams.companyId;
    if (!requestedCompanyId || !activeCompanies.some(({ company }) => String(company?._id) === requestedCompanyId)) return;
    if (actingCompanyId !== requestedCompanyId) setActingCompanyId(requestedCompanyId as Id<'companies'>);
  }, [activeCompanies, actingCompanyId, routeParams.companyId, setActingCompanyId, startingAtChats]);
  const routeCompanyId = startingAtChats ? undefined : routeParams.companyId as Id<'companies'> | undefined;
  const requestedProjectId = startingAtChats ? undefined : routeParams.projectId;
  const projectsPage = usePaginatedQuery(api.mobile.listProjects, trackUserId
    ? { userId: trackUserId, actingCompanyId: routeCompanyId ?? (requestedProjectId ? undefined : actingCompanyId ?? undefined) }
    : 'skip', { initialNumItems: 12 });
  const listedProjects = useMemo(() => (projectsPage.results as Array<ProjectRow | null>)
    .filter((item): item is ProjectRow => Boolean(item && (item.membership.status === 'active' || item.membership.status === 'archived'))),
  [projectsPage.results]);
  const projects = listedProjects.filter((item) => item.membership.status === 'active' && item.membership.companyId === actingCompanyId);
  const selectedProject = projects.find(({ project }) => String(project._id) === selectedProjectId)
    ?? (selectedRouteProject && String(selectedRouteProject.project._id) === selectedProjectId ? selectedRouteProject : null)
    ?? (requestedProjectId ? listedProjects.find(({ project }) => String(project._id) === requestedProjectId) ?? null : null);
  const visibleProjects = selectedProject ? [selectedProject] : projects;
  const independentProjectScope = Boolean(selectedProject && !selectedProject.membership.companyId);
  const companyName = independentProjectScope ? 'Independent Project' : actingCompany?.company?.displayName ?? 'Company';
  const query = search.trim().toLocaleLowerCase();
  const loading = Boolean(trackUserId && actingCompanyId && projectsPage.status === 'LoadingFirstPage');

  useFocusEffect(useCallback(() => {
    if (!selectedProject) {
      setCreateAction(null);
      setCreateContext(null);
      return () => {
        setCreateAction(null);
        setCreateContext(null);
      };
    }
    const projectId = selectedProject.project._id;
    const companyId = selectedProject.membership.companyId;
    const membershipId = selectedProject.membership._id;
    const archived = selectedProject.membership.status === 'archived';
    setCreateContext({
      archive: archived,
      companyId: companyId ? String(companyId) : undefined,
      membershipId: String(membershipId),
      projectId: String(projectId),
      scope: 'project',
    });
    setCreateAction(archived ? null : () => {
      router.push(taskListHref(projectId, companyId ? { companyId, membershipId } : null, undefined, undefined, { create: true }) as never);
    });
    return () => {
      setCreateAction(null);
      setCreateContext(null);
    };
  }, [router, selectedProject, setCreateAction, setCreateContext]));

  useEffect(() => {
    if (startingAtChats) {
      routeSelection.current = null;
      setSelectedProjectId(null);
      setSelectedRouteProject(null);
      router.setParams({ archive: undefined, companyId: undefined, membershipId: undefined, projectId: undefined, startup: undefined });
      return;
    }
    const requestedProjectId = routeParams.projectId;
    if (!requestedProjectId) {
      routeSelection.current = null;
      return;
    }
    const requestedCompanyId = routeParams.companyId;
    const selectionKey = `${requestedCompanyId ?? ''}:${requestedProjectId}`;
    if (routeSelection.current === selectionKey || (requestedCompanyId && actingCompanyId !== requestedCompanyId)) return;
    if (projectsPage.status === 'LoadingFirstPage' || projectsPage.status === 'LoadingMore') return;
    const match = listedProjects.find(({ project }) => String(project._id) === requestedProjectId);
    if (match) {
      routeSelection.current = selectionKey;
      setSelectedProjectId(requestedProjectId);
      setSelectedRouteProject(match);
      if (match.membership.companyId && match.membership.companyId !== actingCompanyId) setActingCompanyId(match.membership.companyId);
      router.setParams({ archive: undefined, companyId: undefined, membershipId: undefined, projectId: undefined });
      return;
    }
    if (projectsPage.status === 'CanLoadMore') {
      projectsPage.loadMore(12);
      return;
    }
    routeSelection.current = selectionKey;
    router.setParams({ archive: undefined, companyId: undefined, membershipId: undefined, projectId: undefined });
  }, [actingCompanyId, listedProjects, projectsPage, routeParams.companyId, routeParams.projectId, router, setActingCompanyId, startingAtChats]);

  useEffect(() => {
    if (selectedProjectId && !projects.some(({ project }) => String(project._id) === selectedProjectId)
      && (!selectedRouteProject || String(selectedRouteProject.project._id) !== selectedProjectId)) setSelectedProjectId(null);
  }, [projects, selectedProjectId, selectedRouteProject]);

  return (
    <ThemedView style={styles.screen}>
      <Stack.Screen options={{ title: 'Chats', headerShown: false }} />
      <FlatList
        contentContainerStyle={[styles.content, { paddingBottom: bottomInset, paddingTop: Spacing.two + safeAreaInsets.top, paddingLeft: Spacing.four + safeAreaInsets.left, paddingRight: Spacing.four + safeAreaInsets.right }]}
        data={visibleProjects}
        keyExtractor={(item) => String(item.project._id)}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={<View style={styles.headerStack}>
          <View style={styles.headingRow}>
            <View style={styles.headingCopy}>
              <ThemedText accessibilityRole="header" numberOfLines={1} style={styles.headingTitle} type="display">Chats</ThemedText>
              <ThemedText numberOfLines={1} style={styles.companyContext} themeColor="textSecondary" type="caption">{companyName}</ThemedText>
            </View>
            <Pressable accessibilityHint="Opens the Company selector" accessibilityLabel={`Switch Company. Current Company: ${companyName}`} accessibilityRole="button" onPress={() => setCompanySheetOpen(true)} style={({ pressed }) => [styles.companySwitchButton, { backgroundColor: pressed ? theme.backgroundSelected : theme.homeSurface, borderColor: theme.homeBorder }]}>
              <EntityMark id={String(actingCompanyId ?? 'company')} imageUrl={actingCompany?.company?.logoUrl} kind="company" name={companyName} size={30} />
              <PlatformIcon color={theme.textSecondary} name="chevron-down" size={14} weight="regular" />
            </Pressable>
          </View>
          <ConversationProjectTabs
            onOpen={(id) => {
              const item = projects.find(({ project }) => String(project._id) === id);
              if (item) router.push(projectOverviewHref(item.project._id, projectContext(item)) as never);
            }}
            onSelect={(id) => { setSelectedProjectId(id); if (!id || projects.some(({ project }) => String(project._id) === id)) setSelectedRouteProject(null); }}
            projects={[...((selectedProject && !projects.some(({ project }) => project._id === selectedProject.project._id)) ? [selectedProject] : projects)].map(({ project }) => ({ colorKey: project.markColorKey, iconKey: project.markIconKey, id: String(project._id), name: project.name }))}
            selectedId={selectedProjectId}
          />
          <View style={[styles.search, { backgroundColor: theme.backgroundElement, borderColor: theme.homeBorder }]}>
            <PlatformIcon color={theme.textTertiary} name="search" size={19} weight="regular" />
            <ThemedTextInput accessibilityLabel="Search conversations" autoCapitalize="none" autoCorrect={false} keyboardAppearance={theme.background === '#1b1917' ? 'dark' : 'light'} maxLength={120} maxFontSizeMultiplier={MaxFontScale} onChangeText={setSearch} placeholder="Search Channels and threads" placeholderTextColor={theme.textTertiary} returnKeyType="search" style={[styles.searchInput, { color: theme.text }]} value={search} />
            {search ? <Pressable accessibilityLabel="Clear search" accessibilityRole="button" onPress={() => setSearch('')} style={styles.clearSearch}><PlatformIcon color={theme.textSecondary} name="close" size={18} weight="regular" /></Pressable> : null}
          </View>
          <ScrollView accessibilityLabel="Conversation filters" accessibilityRole="tablist" contentContainerStyle={styles.filters} horizontal showsHorizontalScrollIndicator={false}>
            {([
              ['all', 'All'], ['unread', 'Unread'], ['channels', 'Channels'], ['threads', 'Threads'],
            ] as const).map(([value, label]) => {
              const active = filter === value;
              return <CompactPillButton key={value} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => { hapticLight(); setFilter(value); }} pillStyle={{ backgroundColor: active ? theme.accentSoft : theme.homeSurface, borderColor: active ? 'transparent' : theme.homeBorder }} pressedPillStyle={{ backgroundColor: theme.backgroundElevated, borderColor: 'transparent' }}>
                <ThemedText style={{ color: active ? theme.text : theme.textSecondary }} type="captionBold">{label}</ThemedText>
              </CompactPillButton>;
            })}
          </ScrollView>
          <ConnectivityBanner message="You are offline. Reconnect to refresh conversations." />
        </View>}
        renderItem={({ item }) => <ProjectConversationSection
          companyId={item.membership.companyId}
          filter={filter}
          membershipId={item.membership._id}
          onChannel={(channel) => router.push(channelHref(item.project._id, channel.group._id, projectContext(item)) as never)}
          onActions={(target) => { hapticLight(); setConversationActions(target); }}
          onSearchMessage={(message) => router.push(message.threadId
            ? threadConversationHref(item.project._id, message.groupId, message.threadId, projectContext(item), message.messageId) as never
            : channelHref(item.project._id, message.groupId, projectContext(item), message.messageId) as never)}
          onThread={(thread) => router.push(threadConversationHref(item.project._id, thread.thread.groupId, thread.thread._id, projectContext(item)) as never)}
          project={item}
          query={query}
          threadsEnabled={release.threads}
          userId={trackUserId as Id<'users'>}
        />}
        ListEmptyComponent={loading ? <ScreenLoading compact variant="chats" /> : <EmptyState icon="message" title={projects.length ? 'No matching conversations' : 'No Projects yet'} body={projects.length ? 'Try a different filter or search term.' : 'Projects you can access in this Company will appear here.'} />}
        ListFooterComponent={projectsPage.status === 'CanLoadMore' || projectsPage.status === 'LoadingMore' ? <Pressable accessibilityRole="button" disabled={projectsPage.status === 'LoadingMore'} onPress={() => projectsPage.loadMore(12)} style={[styles.loadMore, { borderColor: theme.homeBorder }]}><ThemedText type="captionBold">{projectsPage.status === 'LoadingMore' ? 'Loading Projects…' : 'Load more Projects'}</ThemedText></Pressable> : <View style={styles.footerSpace} />}
        onEndReached={() => { if (projectsPage.status === 'CanLoadMore') projectsPage.loadMore(12); }}
        onEndReachedThreshold={0.6}
        removeClippedSubviews
        windowSize={5}
      />
      <OptionsSheet onClose={() => setCompanySheetOpen(false)} title="Switch Company" visible={companySheetOpen}>
        <SheetNote>Company conversations stay within that Company. Independent Project links open one authorized Project at a time.</SheetNote>
        <SheetSection title="Company workspace">
            {activeCompanies.map(({ company }) => company ? <SheetRow detail="Company conversations" key={company._id} label={company.displayName} leading={<EntityMark id={String(company._id)} imageUrl={company.logoUrl} kind="company" name={company.displayName} size={36} />} onPress={() => { setActingCompanyId(company._id); setSelectedProjectId(null); setSelectedRouteProject(null); setCompanySheetOpen(false); }} selected={company._id === actingCompanyId} /> : null)}
        </SheetSection>
      </OptionsSheet>
      <OptionsSheet onClose={() => setConversationActions(null)} title={conversationActions?.openLabel === 'Open Channel' ? 'Channel actions' : 'Thread actions'} visible={Boolean(conversationActions)}>
        {conversationActions ? <>
          <SheetNote>{conversationActions.context}</SheetNote>
          <SheetSection title={conversationActions.label}>
            <SheetRow icon={conversationActions.openLabel === 'Open Channel' ? 'channel' : 'thread'} label={conversationActions.openLabel} onPress={() => { const href = conversationActions.href; setConversationActions(null); router.push(href as never); }} />
            <SheetRow icon="project" label="Open Project" onPress={() => { const href = conversationActions.projectHref; setConversationActions(null); router.push(href as never); }} />
          </SheetSection>
        </> : null}
      </OptionsSheet>
    </ThemedView>
  );
}

function ProjectConversationSection({ companyId, filter, membershipId, onActions, onChannel, onSearchMessage, onThread, project, query, threadsEnabled, userId }: {
  companyId?: Id<'companies'>;
  filter: ConversationFilter;
  membershipId: Id<'projectMembers'>;
  onActions: (target: ConversationActionTarget) => void;
  onChannel: (channel: ChannelRow) => void;
  onSearchMessage: (message: ProjectMessageResult) => void;
  onThread: (thread: ThreadRow) => void;
  project: ProjectRow;
  query: string;
  threadsEnabled: boolean;
  userId: Id<'users'>;
}) {
  const theme = useTheme();
  const groups = usePaginatedQuery(api.mobile.listGroupsPage, { actingCompanyId: companyId, projectId: project.project._id, projectMemberId: membershipId, userId }, { initialNumItems: 16 });
  const threads = usePaginatedQuery(api.channelThreads.listProjectPage, threadsEnabled ? { actingCompanyId: companyId, projectId: project.project._id, projectMemberId: membershipId, status: 'active', userId } : 'skip', { initialNumItems: 16 });
  const messageSearch = useQuery(api.search.project, query.length >= 2 ? {
    actingCompanyId: companyId,
    filter: 'messages',
    limit: 12,
    projectId: project.project._id,
    projectMemberId: membershipId,
    query,
    userId,
  } : 'skip');
  const groupRows = groups.results as ChannelRow[];
  const threadRows = threads.results as ThreadRow[];
  const filteredGroups = useMemo(() => groupRows.filter((channel) => {
    const text = `${channel.group.name} ${channel.lastMessage?.body ?? ''}`.toLocaleLowerCase();
    const relatedThreads = threadRows.filter((thread) => thread.thread.groupId === channel.group._id);
    const matchesSearch = !query || text.includes(query) || relatedThreads.some((thread) => `${thread.thread.name} ${thread.latestReplyPreview ?? ''} ${thread.source && 'body' in thread.source ? thread.source.body : ''}`.toLocaleLowerCase().includes(query));
    const hasUnreadThread = relatedThreads.some((thread) => thread.unread);
    const matchesFilter = filter === 'all' || filter === 'channels' || (filter === 'unread' && (channel.unreadCount > 0 || hasUnreadThread)) || (filter === 'threads' && relatedThreads.length > 0);
    return matchesSearch && matchesFilter;
  }).sort((left, right) => (right.lastMessage?.createdAt ?? 0) - (left.lastMessage?.createdAt ?? 0)), [filter, groupRows, query, threadRows]);
  const standaloneThreads = useMemo(() => threadRows.filter((thread) => !groupRows.some((channel) => channel.group._id === thread.thread.groupId))
    .sort((left, right) => (right.latestReplyAt ?? 0) - (left.latestReplyAt ?? 0)), [groupRows, threadRows]);
  const visible = filteredGroups.length > 0 || standaloneThreads.length > 0;
  const archived = project.membership.status === 'archived';
  const matchedMessages = (messageSearch?.messages ?? []).filter((message) => {
    const channel = groupRows.find((item) => item.group._id === message.groupId);
    const thread = threadRows.find((item) => item.thread._id === message.threadId);
    if (filter === 'threads' && !message.threadId) return false;
    if (filter === 'channels' && message.threadId) return false;
    if (filter === 'unread' && !(channel?.unreadCount || thread?.unread)) return false;
    return true;
  });
  const matchingChannels = query.length >= 2 && filter !== 'threads' ? groupRows.filter((channel) =>
    channel.group.name.toLocaleLowerCase().includes(query) && (filter !== 'unread' || channel.unreadCount > 0),
  ) : [];
  const matchingThreads = query.length >= 2 && filter !== 'channels' ? threadRows.filter((thread) =>
    thread.thread.name.toLocaleLowerCase().includes(query) && (filter !== 'unread' || thread.unread),
  ) : [];

  if (query.length < 2 && groups.status === 'LoadingFirstPage') return <View style={styles.projectSection}><Divider title={project.project.name} /><ScreenLoading compact variant="chats" /></View>;
  return <View style={styles.projectSection}>
    <Divider title={project.project.name} />
    {query.length >= 2 ? messageSearch === undefined ? <ScreenLoading compact variant="chats" /> : <>
      {matchedMessages.map((message) => <Pressable accessibilityLabel={`${message.title}. ${message.subtitle}. Open matching message.`} accessibilityRole="button" key={`message:${String(message.messageId)}`} onPress={() => onSearchMessage(message)} style={({ pressed }) => [styles.searchResult, { backgroundColor: pressed ? theme.backgroundSelected : 'transparent', borderBottomColor: theme.homeBorder }]}>
        <View style={[styles.channelIcon, { backgroundColor: theme.backgroundSelected }]}><PlatformIcon color={theme.accentStrong} name={message.threadId ? 'thread' : 'channel'} size={18} /></View>
        <View style={styles.rowCopy}><ThemedText numberOfLines={1} type="captionBold">{message.threadName ?? message.groupName}</ThemedText><ThemedText numberOfLines={2} themeColor="textSecondary" type="caption">{message.preview}</ThemedText><ThemedText numberOfLines={1} themeColor="textTertiary" type="caption">{message.subtitle}</ThemedText></View>
        <PlatformIcon color={theme.textTertiary} name="chevron-right" size={18} weight="regular" />
      </Pressable>)}
      {matchingChannels.map((channel) => <Pressable accessibilityActions={[{ name: 'showActions', label: 'Show Channel actions' }]} accessibilityHint="Tap to open. Touch and hold or use the Channel actions menu to show options." accessibilityLabel={`${channel.group.name} Channel${channel.unreadCount ? `, ${channel.unreadCount} unread` : ''}`} accessibilityRole="button" delayLongPress={360} key={`channel:${String(channel.group._id)}`} onAccessibilityAction={(event) => { if (event.nativeEvent.actionName === 'showActions') onActions(channelActionTarget(project, channel)); }} onLongPress={() => onActions(channelActionTarget(project, channel))} onPress={() => onChannel(channel)} style={({ pressed }) => [styles.channelRow, {
        backgroundColor: pressed ? theme.backgroundSelected : 'transparent',
        borderColor: pressed ? theme.textTertiary : 'transparent',
        borderRadius: Radius.medium,
        borderWidth: pressed ? StyleSheet.hairlineWidth : 0,
        boxShadow: pressed ? '0 2px 8px rgba(0,0,0,0.16)' : undefined,
        opacity: pressed ? 0.9 : 1,
      }]}>
        <ChannelIcon channel={channel.group} unreadCount={channel.unreadCount} />
        <View style={styles.rowCopy}><ThemedText numberOfLines={1} type="captionBold">{channel.group.name}</ThemedText><ThemedText numberOfLines={1} themeColor="textSecondary" type="caption">{channel.lastMessage?.body?.trim() || 'No messages yet'}</ThemedText></View>
        <PlatformIcon color={theme.textTertiary} name="chevron-right" size={18} weight="regular" />
      </Pressable>)}
      {matchingThreads.map((thread) => <ConversationThreadRow item={thread} key={`thread:${String(thread.thread._id)}`} onLongPress={() => onActions(threadActionTarget(project, thread))} onPress={() => onThread(thread)} />)}
      {!matchedMessages.length && !matchingChannels.length && !matchingThreads.length ? <ThemedText style={styles.emptyProject} themeColor="textTertiary" type="caption">No matching conversations in this Project.</ThemedText> : null}
    </> : null}
    {query.length < 2 ? filteredGroups.map((channel) => {
        const relatedThreads = threadRows.filter((thread) => thread.thread.groupId === channel.group._id)
        .filter((thread) => !query || `${thread.thread.name} ${thread.latestReplyPreview ?? ''} ${thread.source && 'body' in thread.source ? thread.source.body : ''}`.toLocaleLowerCase().includes(query))
        .filter((thread) => filter !== 'unread' || thread.unread)
        .sort((left, right) => (right.latestReplyAt ?? 0) - (left.latestReplyAt ?? 0));
        return <View key={String(channel.group._id)} style={[styles.channelBlock, { borderBottomColor: theme.homeBorder }]}>
          {filter !== 'threads' ? <Pressable accessibilityActions={[{ name: 'showActions', label: 'Show Channel actions' }]} accessibilityHint="Tap to open. Touch and hold or use the Channel actions menu to show options." accessibilityLabel={`${channel.group.name} Channel${channel.unreadCount ? `, ${channel.unreadCount} unread` : ''}`} accessibilityRole="button" delayLongPress={360} onAccessibilityAction={(event) => { if (event.nativeEvent.actionName === 'showActions') onActions(channelActionTarget(project, channel)); }} onLongPress={() => onActions(channelActionTarget(project, channel))} onPress={() => onChannel(channel)} style={({ pressed }) => [styles.channelRow, {
            backgroundColor: pressed ? theme.backgroundSelected : 'transparent',
            borderColor: pressed ? theme.textTertiary : 'transparent',
            borderRadius: Radius.medium,
            borderWidth: pressed ? StyleSheet.hairlineWidth : 0,
            boxShadow: pressed ? '0 2px 8px rgba(0,0,0,0.16)' : undefined,
          }]}>
              <ChannelIcon channel={channel.group} unreadCount={channel.unreadCount} />
              <View style={styles.rowCopy}>
                <ThemedText numberOfLines={1} style={styles.rowTitle} type="smallBold">{channel.group.name}</ThemedText>
                <ThemedText numberOfLines={2} themeColor="textSecondary" type="caption">{channel.lastMessage?.body?.trim() || 'No messages yet'}</ThemedText>
              </View>
              <View style={styles.rowMeta}>{channel.lastMessage ? <ThemedText themeColor="textTertiary" type="caption">{conversationTime(channel.lastMessage.createdAt)}</ThemedText> : null}</View>
          </Pressable> : null}
          {filter === 'threads' ? relatedThreads.map((thread) => <Pressable accessibilityActions={[{ name: 'showActions', label: 'Show Thread actions' }]} accessibilityHint="Tap to open. Touch and hold or use the Thread actions menu to show options." accessibilityLabel={`${thread.thread.name}, thread in ${channel.group.name}${thread.unread ? ', unread' : ''}`} accessibilityRole="button" delayLongPress={360} key={String(thread.thread._id)} onAccessibilityAction={(event) => { if (event.nativeEvent.actionName === 'showActions') onActions(threadActionTarget(project, thread)); }} onLongPress={() => onActions(threadActionTarget(project, thread))} onPress={() => onThread(thread)} style={({ pressed }) => [styles.threadRow, { backgroundColor: pressed ? theme.backgroundSelected : 'transparent' }]}>
          <PlatformIcon color={theme.textTertiary} name="thread" size={16} />
          <View style={styles.rowCopy}>
            <View style={styles.titleLine}><ThemedText numberOfLines={1} style={styles.rowTitle} type="captionBold">{thread.thread.name}</ThemedText>{thread.unread ? <View style={[styles.unreadDot, { backgroundColor: theme.accent }]} /> : null}</View>
            <ThemedText numberOfLines={1} themeColor="textSecondary" type="caption">#{channel.group.name} · {threadPreview(thread)}</ThemedText>
          </View>
          {thread.latestReplyAt ? <ThemedText themeColor="textTertiary" type="caption">{conversationTime(thread.latestReplyAt)}</ThemedText> : null}
          </Pressable>) : null}
      </View>;
    }) : null}
    {query.length < 2 && filter === 'threads' ? standaloneThreads.map((thread) => <ConversationThreadRow item={thread} key={String(thread.thread._id)} onLongPress={() => onActions(threadActionTarget(project, thread))} onPress={() => onThread(thread)} />) : null}
    {query.length < 2 && !visible ? <ThemedText style={styles.emptyProject} themeColor="textTertiary" type="caption">No conversations match this filter.</ThemedText> : null}
    {(groups.status === 'CanLoadMore' || groups.status === 'LoadingMore') && filter !== 'threads' ? <LoadMore disabled={groups.status === 'LoadingMore'} label={groups.status === 'LoadingMore' ? 'Loading Channels…' : 'Load Channels'} onPress={() => groups.loadMore(16)} /> : null}
    {threadsEnabled && (threads.status === 'CanLoadMore' || threads.status === 'LoadingMore') && filter !== 'channels' ? <LoadMore disabled={threads.status === 'LoadingMore'} label={threads.status === 'LoadingMore' ? 'Loading threads…' : 'Load more threads'} onPress={() => threads.loadMore(16)} /> : null}
    {archived ? <ThemedText style={styles.archiveLabel} themeColor="textTertiary" type="caption">Read-only Project archive</ThemedText> : null}
  </View>;
}

function ConversationThreadRow({ item, onLongPress, onPress }: { item: ThreadRow; onLongPress: () => void; onPress: () => void }) {
  const theme = useTheme();
  return <Pressable accessibilityActions={[{ name: 'showActions', label: 'Show Thread actions' }]} accessibilityHint="Tap to open. Touch and hold or use the Thread actions menu to show options." accessibilityLabel={`${item.thread.name}, thread in ${item.channel?.name ?? 'Channel'}`} accessibilityRole="button" delayLongPress={360} onAccessibilityAction={(event) => { if (event.nativeEvent.actionName === 'showActions') onLongPress(); }} onLongPress={onLongPress} onPress={onPress} style={({ pressed }) => [styles.threadRow, { backgroundColor: pressed ? theme.backgroundSelected : 'transparent' }]}>
    <PlatformIcon color={theme.accentStrong} name="thread" size={17} />
    <View style={styles.rowCopy}><ThemedText numberOfLines={1} type="captionBold">{item.thread.name}</ThemedText><ThemedText numberOfLines={1} themeColor="textSecondary" type="caption">{item.channel?.name ?? 'Channel'} · {threadPreview(item)}</ThemedText></View>
    <PlatformIcon color={theme.textTertiary} name="chevron-right" size={16} />
  </Pressable>;
}

function Divider({ title }: { title: string }) {
  const theme = useTheme();
  return <View style={styles.divider}>
    <View style={[styles.dividerLabel, { backgroundColor: theme.background }]}><ThemedText accessibilityRole="header" numberOfLines={1} style={styles.dividerTitle} themeColor="textSecondary" type="captionBold">{title}</ThemedText></View>
    <View style={[styles.dividerLine, { backgroundColor: theme.homeBorder }]} />
  </View>;
}

function LoadMore({ disabled, label, onPress }: { disabled: boolean; label: string; onPress: () => void }) {
  const theme = useTheme();
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.moreButton, { borderColor: theme.homeBorder }]}><ThemedText themeColor="textSecondary" type="captionBold">{label}</ThemedText></Pressable>;
}

function threadPreview(thread: ThreadRow) {
  return thread.latestReplyPreview
    || (thread.source && 'body' in thread.source ? thread.source.body : null)
    || `${thread.replyCount} replies`;
}

function conversationTime(timestamp: number) {
  const date = new Date(timestamp);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (date.getFullYear() === today.getFullYear()) return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short' });
}

function projectContext(item: ProjectRow): RepresentedProjectContext | null {
  if (!item.membership.companyId) return null;
  return { archived: item.membership.status === 'archived', companyId: item.membership.companyId, membershipId: item.membership._id };
}

function channelActionTarget(project: ProjectRow, channel: ChannelRow): ConversationActionTarget {
  return {
    context: `${project.project.name} · ${channel.unreadCount ? `${channel.unreadCount} unread` : 'Channel'}`,
    href: channelHref(project.project._id, channel.group._id, projectContext(project)),
    label: channel.group.name,
    openLabel: 'Open Channel',
    projectHref: projectOverviewHref(project.project._id, projectContext(project)),
  };
}

function threadActionTarget(project: ProjectRow, thread: ThreadRow): ConversationActionTarget {
  return {
    context: `${project.project.name} · ${thread.channel?.name ?? 'Channel'}`,
    href: threadConversationHref(project.project._id, thread.thread.groupId, thread.thread._id, projectContext(project)) as never,
    label: thread.thread.name,
    openLabel: 'Open Thread',
    projectHref: projectOverviewHref(project.project._id, projectContext(project)),
  };
}

function ChannelIcon({ channel, unreadCount }: { channel: ChannelRow['group']; unreadCount: number }) {
  const theme = useTheme();
  return <View style={styles.channelIconWrap}>
    <EntityMark colorKey={channel.markColorKey} iconKey={channel.markIconKey} id={String(channel._id)} kind="channel" name={channel.name} size={42} />
    {unreadCount > 0 ? <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.channelUnreadBadge, { backgroundColor: theme.accent, borderColor: theme.homeSurface }]}><ThemedText style={styles.channelUnreadCount} type="captionBold">{unreadCount > 99 ? '99+' : unreadCount}</ThemedText></View> : null}
  </View>;
}

const styles = StyleSheet.create({
  archiveLabel: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  channelBlock: { borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: Spacing.one },
  channelIcon: { alignItems: 'center', borderRadius: Radius.pill, height: 42, justifyContent: 'center', width: 42 },
  channelIconWrap: { height: 42, position: 'relative', width: 42 },
  channelUnreadBadge: { alignItems: 'center', borderRadius: Radius.pill, borderWidth: 1.5, justifyContent: 'center', minHeight: 24, minWidth: 24, paddingHorizontal: 3, paddingVertical: 2, position: 'absolute', right: -4, top: -4 },
  channelUnreadCount: { ...Typography.captionBold, color: '#1b1917' },
  channelRow: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two, minHeight: 68, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  clearSearch: { alignItems: 'center', height: TouchTarget, justifyContent: 'center', width: TouchTarget },
  companyContext: { maxWidth: '100%' },
  companySwitchButton: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: Spacing.one, height: TouchTarget, justifyContent: 'center', paddingHorizontal: Spacing.one, width: 64 },
  content: { gap: Spacing.one, paddingHorizontal: Spacing.four, paddingTop: Spacing.two },
  divider: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two, paddingHorizontal: Spacing.two, paddingTop: Spacing.two, paddingBottom: Spacing.one },
  dividerLabel: { alignItems: 'center', flexDirection: 'row', gap: Spacing.one, maxWidth: '80%', paddingHorizontal: Spacing.one },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
  dividerTitle: { flexShrink: 1 },
  emptyProject: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  filters: { alignItems: 'center', flexDirection: 'row', gap: Spacing.one },
  footerSpace: { height: Spacing.four },
  headerStack: { gap: Spacing.three, paddingBottom: Spacing.two },
  headingRow: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two, minHeight: TouchTarget },
  headingCopy: { flex: 1, gap: Spacing.two, minWidth: 0 },
  headingTitle: { flex: 1, flexShrink: 1, minWidth: 0 },
  loadMore: { alignItems: 'center', borderRadius: Radius.medium, borderWidth: StyleSheet.hairlineWidth, marginHorizontal: Spacing.three, marginVertical: Spacing.two, minHeight: TouchTarget, justifyContent: 'center' },
  moreButton: { alignItems: 'center', borderRadius: Radius.medium, borderWidth: StyleSheet.hairlineWidth, marginHorizontal: Spacing.three, marginVertical: Spacing.two, minHeight: TouchTarget, justifyContent: 'center' },
  projectCarousel: { gap: Spacing.two, paddingVertical: Spacing.two },
  projectPill: { borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth, maxWidth: 210, minHeight: 38, justifyContent: 'center', paddingHorizontal: Spacing.three },
  projectSection: { marginTop: 0 },
  rowCopy: { flex: 1, gap: 3, minWidth: 0 },
  rowMeta: { alignItems: 'flex-end', gap: Spacing.one },
  searchResult: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: Spacing.three, minHeight: 78, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  rowTitle: { flexShrink: 1 },
  screen: { flex: 1 },
  sheetCompanyMark: { alignItems: 'center', borderRadius: Radius.medium, height: 36, justifyContent: 'center', width: 36 },
  search: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.large, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: Spacing.two, minHeight: TouchTarget, paddingLeft: Spacing.three },
  searchInput: { ...Typography.body, flex: 1, minHeight: TouchTarget, paddingVertical: Spacing.two },
  scopeNote: { alignItems: 'center', alignSelf: 'flex-start', borderRadius: Radius.pill, flexDirection: 'row', gap: Spacing.one, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  selectorLabel: { letterSpacing: 0.8, paddingTop: Spacing.one },
  threadRow: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two, minHeight: 50, paddingLeft: Spacing.four, paddingRight: Spacing.two, paddingVertical: Spacing.one },
  threadStem: { height: 25, marginLeft: 18, width: 1 },
  titleLine: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two, minWidth: 0 },
  unreadDot: { borderRadius: Radius.pill, height: 8, width: 8 },
});
