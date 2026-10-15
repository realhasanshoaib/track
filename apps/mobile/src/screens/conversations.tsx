import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, SectionList, StyleSheet, View, type ViewToken } from 'react-native';
import { Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { usePaginatedQuery, useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import Animated, { FadeIn, FadeOut, LinearTransition, useReducedMotion } from 'react-native-reanimated';

import { resolveDistinctChannelIconKeys, type EntityMarkIconKey } from '@track/shared';
import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import { ConnectivityBanner } from '@/components/connectivity-banner';
import { EntityMark } from '@/components/entity-mark';
import { EmptyState } from '@/components/empty-state';
import { PlatformIcon } from '@/components/platform-icon';
import { ConversationProjectTabs } from '@/components/conversation-project-tabs';
import { ScreenLoading } from '@/components/screen-loading';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WorkspaceTopControls } from '@/components/workspace-top-controls';
import { OptionsSheet, SheetNote, SheetRow, SheetSection } from '@/components/options-sheet';
import { MobileHeaderMetrics, Radius, Spacing, TouchTarget, Typography } from '@/constants/theme';
import { useCompany } from '@/contexts/company-context';
import { useTrackUser } from '@/contexts/track-user-context';
import { useBottomTabContentInset } from '@/hooks/use-bottom-tab-inset';
import { useTheme } from '@/hooks/use-theme';
import { channelHref, projectOverviewHref, type RepresentedProjectContext } from '@/lib/company-navigation';
import { channelSearchMessages, hasChannelMessageMatches } from '@/lib/conversation-search';
import { hapticLight } from '@/lib/haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { entityDirectoryRow, entityDirectoryRowStyle } from '@/lib/entity-directory-row';

type ProjectRow = NonNullable<FunctionReturnType<typeof api.mobile.listProjects>['page'][number]>;
type ChannelRow = FunctionReturnType<typeof api.mobile.listGroupsPage>['page'][number];
type ProjectConversationSearch = FunctionReturnType<typeof api.search.conversations>['projects'][number]['results'];
type ProjectMessageResult = ProjectConversationSearch['messages'][number];
type ConversationActionTarget = { context: string; href: Href; label: string; openLabel: 'Open Channel'; projectHref: Href };
type ConversationListItem =
  | { key: string; type: 'channel'; channel: ChannelRow; iconKey: EntityMarkIconKey }
  | { key: string; type: 'message'; message: ProjectMessageResult; iconKey?: EntityMarkIconKey }
  | { key: string; type: 'loadMore'; disabled: boolean; label: string; onPress: () => void }
  | { key: string; type: 'empty'; label: string }
  | { key: string; type: 'loading' }
  | { key: string; type: 'archive' };
type ConversationSection = { key: string; title: string; project: ProjectRow; data: ConversationListItem[] };
const chatViewabilityConfig = { itemVisiblePercentThreshold: 10 };
const channelIconSize = entityDirectoryRow.iconSize;
const searchResultChannelIconSize = 42;

export default function ConversationsScreen() {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const router = useRouter();
  const routeParams = useLocalSearchParams<{ archive?: string; companyId?: string; membershipId?: string; projectId?: string; startup?: string }>();
  const bottomInset = useBottomTabContentInset(Spacing.five);
  const safeAreaInsets = useSafeAreaInsets();
  const { actingCompany, actingCompanyId, companies, setActingCompanyId } = useCompany();
  const { trackUserId } = useTrackUser();
  const [companySheetOpen, setCompanySheetOpen] = useState(false);
  const [conversationActions, setConversationActions] = useState<ConversationActionTarget | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedRouteProject, setSelectedRouteProject] = useState<ProjectRow | null>(null);
  const [search, setSearch] = useState('');
  const [settledQuery, setSettledQuery] = useState('');
  const [projectConversationRows, setProjectConversationRows] = useState<Record<string, ConversationListItem[]>>({});
  const [mountedProjectIds, setMountedProjectIds] = useState<Set<string>>(() => new Set());
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
  const projects = useMemo(() => listedProjects.filter((item) => item.membership.status === 'active' && item.membership.companyId === actingCompanyId), [actingCompanyId, listedProjects]);
  const selectedProject = projects.find(({ project }) => String(project._id) === selectedProjectId)
    ?? (selectedRouteProject && String(selectedRouteProject.project._id) === selectedProjectId ? selectedRouteProject : null)
    ?? (requestedProjectId ? listedProjects.find(({ project }) => String(project._id) === requestedProjectId) ?? null : null);
  const visibleProjects = useMemo(() => selectedProject ? [selectedProject] : projects, [projects, selectedProject]);
  const visibleProjectsRef = useRef(visibleProjects);
  visibleProjectsRef.current = visibleProjects;
  const independentProjectScope = Boolean(selectedProject && !selectedProject.membership.companyId);
  const companyName = independentProjectScope ? 'Independent Project' : actingCompany?.company?.displayName ?? 'Company';
  const searchPlaceholder = 'Search Channels or messages';
  const query = search.trim().toLocaleLowerCase();
  useEffect(() => {
    if (query.length < 2) {
      setSettledQuery(query);
      return;
    }
    const timeout = setTimeout(() => setSettledQuery(query), 180);
    return () => clearTimeout(timeout);
  }, [query]);
  const searchScopes = useMemo(() => visibleProjects.map((item) => ({
    actingCompanyId: item.membership.companyId,
    projectId: item.project._id,
    projectMemberId: item.membership._id,
  })), [visibleProjects]);
  const projectScopeKey = searchScopes.map(({ projectId, projectMemberId }) => `${String(projectId)}:${String(projectMemberId)}`).join(',');
  const searchScopeKey = `${actingCompanyId ?? ''}:${selectedProjectId ?? 'all'}:${settledQuery}:${projectScopeKey}`;
  const conversationSearch = useQuery(api.search.conversations, settledQuery.length >= 2 && trackUserId && searchScopes.length > 0 ? {
    projects: searchScopes,
    query: settledQuery,
    unreadOnly: false,
    userId: trackUserId as Id<'users'>,
  } : 'skip');
  useEffect(() => {
    const activeProjectIds = new Set(searchScopes.map(({ projectId }) => String(projectId)));
    setProjectConversationRows((previous) => {
      const retained = Object.fromEntries(Object.entries(previous).filter(([projectId]) => activeProjectIds.has(projectId)));
      return Object.keys(retained).length === Object.keys(previous).length ? previous : retained;
    });
    setMountedProjectIds((previous) => {
      const retained = new Set([...previous].filter((projectId) => activeProjectIds.has(projectId)));
      return sameStringSet(previous, retained) ? previous : retained;
    });
  }, [searchScopes]);
  const searchPending = query.length >= 2 && (query !== settledQuery || projectsPage.status === 'LoadingMore' || conversationSearch === undefined);
  const searchResultsReady = query === settledQuery && conversationSearch !== undefined;
  const searchResultsByProject = useMemo(() => new Map((searchResultsReady ? conversationSearch?.projects ?? [] : []).map((entry) => [String(entry.projectId), entry.results])), [conversationSearch, searchResultsReady]);
  const showSearchEmptyState = query.length >= 2 && !searchPending && searchResultsReady
    && visibleProjects.length > 0
    && !(conversationSearch?.projects ?? []).some(({ results }) => hasChannelMessageMatches(results.messages));
  const reportProjectRows = useCallback((projectId: string, rows: ConversationListItem[]) => {
    setProjectConversationRows((previous) => sameConversationRows(previous[projectId], rows) ? previous : { ...previous, [projectId]: rows });
  }, []);
  const conversationSections = useMemo<ConversationSection[]>(() => visibleProjects.flatMap((project) => {
    const projectId = String(project.project._id);
    const results = searchResultsByProject.get(projectId);
    const matchingMessages = channelSearchMessages(results?.messages ?? []);
    const searchChannelSeeds = matchingMessages.map((message) => ({ id: String(message.groupId), name: message.groupName }));
    const cachedChannelIconKeys = new Map<string, EntityMarkIconKey>();
    for (const row of projectConversationRows[projectId] ?? []) {
      if (row.type === 'channel') cachedChannelIconKeys.set(String(row.channel.group._id), row.iconKey);
    }
    const searchChannelIconKeys = resolveDistinctChannelIconKeys(searchChannelSeeds, cachedChannelIconKeys);
    const data: ConversationListItem[] = query.length >= 2
      ? matchingMessages.map((message) => ({ key: `message:${String(message.messageId)}`, type: 'message' as const, message, iconKey: searchChannelIconKeys.get(String(message.groupId)) }))
      : projectConversationRows[projectId] ?? [{ key: `loading:${projectId}`, type: 'loading' as const }];
    if (query.length >= 2 && data.length === 0) return [];
    return [{ key: projectId, title: project.project.name, project, data }];
  }), [projectConversationRows, query, searchResultsByProject, visibleProjects]);
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: Array<ViewToken<ConversationListItem>> }) => {
    const visibleProjectIndexes = new Set(viewableItems.flatMap(({ section }) => {
      const sectionKey = (section as ConversationSection | undefined)?.key;
      const index = visibleProjectsRef.current.findIndex((project) => String(project.project._id) === sectionKey);
      return index >= 0 ? [index] : [];
    }));
    const activeProjectIds = new Set<string>();
    for (const index of visibleProjectIndexes) {
      for (const neighbor of [index - 1, index, index + 1]) {
        const project = visibleProjectsRef.current[neighbor];
        if (project) activeProjectIds.add(String(project.project._id));
      }
    }
    setMountedProjectIds((previous) => sameStringSet(previous, activeProjectIds) ? previous : activeProjectIds);
  }).current;
  const loading = Boolean(trackUserId && actingCompanyId && projectsPage.status === 'LoadingFirstPage');

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
      {query.length < 2 ? visibleProjects.filter((item) => mountedProjectIds.has(String(item.project._id))).map((item) => <ProjectConversationSection
        companyId={item.membership.companyId}
        membershipId={item.membership._id}
        onRowsChange={reportProjectRows}
        project={item}
        query={query}
        userId={trackUserId as Id<'users'>}
        key={String(item.project._id)}
      />) : null}
      <SectionList
        contentContainerStyle={[styles.content, { paddingBottom: bottomInset, paddingTop: MobileHeaderMetrics.contentTop + safeAreaInsets.top, paddingLeft: Spacing.four + safeAreaInsets.left, paddingRight: Spacing.four + safeAreaInsets.right }]}
        sections={conversationSections}
        keyExtractor={(item) => item.key}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={<View style={styles.headerStack}>
          <WorkspaceTopControls
            companyId={actingCompanyId ? String(actingCompanyId) : null}
            companyLogoUrl={actingCompany?.company?.logoUrl ?? null}
            companyName={companyName}
            disabled={activeCompanies.length === 0}
            maxSearchLength={120}
            onSearchChange={setSearch}
            onSwitchCompany={() => setCompanySheetOpen(true)}
            search={search}
            searchAccessibilityLabel={searchPlaceholder}
            searchPlaceholder={searchPlaceholder}
            title="Chats"
          />
          <ConversationProjectTabs
            onOpen={(id) => {
              const item = projects.find(({ project }) => String(project._id) === id);
              if (item) router.push(projectOverviewHref(item.project._id, projectContext(item)) as never);
            }}
            onSelect={(id) => { setSelectedProjectId(id); if (!id || projects.some(({ project }) => String(project._id) === id)) setSelectedRouteProject(null); }}
            projects={[...((selectedProject && !projects.some(({ project }) => project._id === selectedProject.project._id)) ? [selectedProject] : projects)].map(({ project }) => ({ colorKey: project.markColorKey, iconKey: project.markIconKey, id: String(project._id), name: project.name }))}
            selectedId={selectedProjectId}
          />
          {searchPending ? <View accessibilityLiveRegion="polite" style={styles.searchStatus}><ActivityIndicator color={theme.accentStrong} size="small" /><ThemedText themeColor="textSecondary" type="caption">Searching messages…</ThemedText></View> : null}
          <ConnectivityBanner message="You are offline. Reconnect to refresh conversations." />
        </View>}
        extraData={searchScopeKey}
        renderSectionHeader={({ section }) => <Divider title={section.title} />}
        renderItem={({ item, section }) => {
          const isSearchResult = item.type === 'message';
          return <Animated.View
            entering={!reducedMotion && isSearchResult ? FadeIn.duration(120) : undefined}
            exiting={!reducedMotion && isSearchResult ? FadeOut.duration(90) : undefined}
            layout={!reducedMotion ? LinearTransition.duration(150) : undefined}
          >
            <ConversationListRow
              item={item}
              project={section.project}
              onActions={(target) => { hapticLight(); setConversationActions(target); }}
              onChannel={(channelId) => router.push(channelHref(section.project.project._id, channelId, projectContext(section.project)) as never)}
              onMessage={(message) => router.push(channelHref(section.project.project._id, message.groupId, projectContext(section.project), message.messageId) as never)}
            />
          </Animated.View>;
        }}
        stickySectionHeadersEnabled={false}
        ListEmptyComponent={query.length >= 2 ? null : loading ? <ScreenLoading compact variant="chats" /> : <EmptyState icon="message" title={projects.length ? 'No Channels found' : 'No Projects yet'} body={projects.length ? 'Channels in this Company will appear here.' : 'Projects you can access in this Company will appear here.'} />}
        ListFooterComponent={<>
          {showSearchEmptyState ? <EmptyState icon="search" title="No message matches" body={projectsPage.status === 'CanLoadMore' ? 'No matches in the loaded Projects. Load more Projects to search the rest.' : 'Try another message phrase.'} /> : null}
          {projectsPage.status === 'CanLoadMore' || projectsPage.status === 'LoadingMore' ? <Pressable accessibilityRole="button" disabled={projectsPage.status === 'LoadingMore'} onPress={() => projectsPage.loadMore(12)} style={[styles.loadMore, { borderColor: theme.homeBorder }]}><ThemedText type="captionBold">{projectsPage.status === 'LoadingMore' ? 'Loading Projects…' : 'Load more Projects'}</ThemedText></Pressable> : <View style={styles.footerSpace} />}
        </>}
        onEndReached={() => { if (projectsPage.status === 'CanLoadMore') projectsPage.loadMore(12); }}
        onEndReachedThreshold={0.6}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={chatViewabilityConfig}
        initialNumToRender={12}
        maxToRenderPerBatch={8}
        removeClippedSubviews
        updateCellsBatchingPeriod={50}
        windowSize={5}
      />
      <OptionsSheet onClose={() => setCompanySheetOpen(false)} title="Switch Company" visible={companySheetOpen}>
        <SheetSection title="Company workspace">
            {activeCompanies.map(({ company }) => company ? <SheetRow detail="Company conversations" key={company._id} label={company.displayName} leading={<EntityMark id={String(company._id)} imageUrl={company.logoUrl} kind="company" name={company.displayName} size={36} />} onPress={() => { setActingCompanyId(company._id); setSelectedProjectId(null); setSelectedRouteProject(null); setCompanySheetOpen(false); }} selected={company._id === actingCompanyId} /> : null)}
        </SheetSection>
      </OptionsSheet>
      <OptionsSheet onClose={() => setConversationActions(null)} title="Channel actions" visible={Boolean(conversationActions)}>
        {conversationActions ? <>
          <SheetNote>{conversationActions.context}</SheetNote>
          <SheetSection title={conversationActions.label}>
            <SheetRow icon="channel" label={conversationActions.openLabel} onPress={() => { const href = conversationActions.href; setConversationActions(null); router.push(href as never); }} />
            <SheetRow icon="project" label="Open Project" onPress={() => { const href = conversationActions.projectHref; setConversationActions(null); router.push(href as never); }} />
          </SheetSection>
        </> : null}
      </OptionsSheet>
    </ThemedView>
  );
}

function ProjectConversationSection({ companyId, membershipId, onRowsChange, project, query, userId }: {
  companyId?: Id<'companies'>;
  membershipId: Id<'projectMembers'>;
  onRowsChange: (projectId: string, rows: ConversationListItem[]) => void;
  project: ProjectRow;
  query: string;
  userId: Id<'users'>;
}) {
  const groups = usePaginatedQuery(api.mobile.listGroupsPage, { actingCompanyId: companyId, projectId: project.project._id, projectMemberId: membershipId, userId }, { initialNumItems: 16 });
  const groupRows = groups.results as ChannelRow[];
  const previousChannelIconKeys = useRef(new Map<string, EntityMarkIconKey>());
  const channelIconKeys = useMemo(() => {
    const assignments = resolveDistinctChannelIconKeys(groupRows.map(({ group }) => ({
      id: String(group._id),
      iconKey: group.markIconKey,
      name: group.name,
    })), previousChannelIconKeys.current);
    previousChannelIconKeys.current = assignments;
    return assignments;
  }, [groupRows]);
  const filteredGroups = useMemo(() => groupRows.filter((channel) => {
    const text = `${channel.group.name} ${channel.lastMessage?.body ?? ''}`.toLocaleLowerCase();
    return !query || text.includes(query);
  }), [groupRows, query]);
  const archived = project.membership.status === 'archived';
  const rows = useMemo<ConversationListItem[]>(() => {
    if (groups.status === 'LoadingFirstPage') return [{ key: `loading:${String(project.project._id)}`, type: 'loading' }];
    const visibleRows: ConversationListItem[] = [];
    for (const channel of filteredGroups) visibleRows.push({
      key: `channel:${String(channel.group._id)}`,
      type: 'channel',
      channel,
      iconKey: channelIconKeys.get(String(channel.group._id)) ?? 'channel',
    });
    if (visibleRows.length === 0 && groups.status !== 'LoadingMore') {
      visibleRows.push({ key: `empty:${String(project.project._id)}`, type: 'empty', label: 'No Channels in this Project yet.' });
    }
    if (groups.status === 'CanLoadMore' || groups.status === 'LoadingMore') {
      visibleRows.push({ key: `load-channels:${String(project.project._id)}`, type: 'loadMore', disabled: groups.status === 'LoadingMore', label: groups.status === 'LoadingMore' ? 'Loading Channels…' : 'Load Channels', onPress: () => groups.loadMore(16) });
    }
    if (archived) visibleRows.push({ key: `archive:${String(project.project._id)}`, type: 'archive' });
    return visibleRows;
  }, [archived, channelIconKeys, filteredGroups, groups.loadMore, groups.status, project.project._id]);

  useEffect(() => onRowsChange(String(project.project._id), rows), [onRowsChange, project.project._id, rows]);
  return null;
}

function ConversationListRow({ item, onActions, onChannel, onMessage, project }: {
  item: ConversationListItem;
  onActions: (target: ConversationActionTarget) => void;
  onChannel: (channelId: Id<'groups'>) => void;
  onMessage: (message: ProjectMessageResult) => void;
  project: ProjectRow;
}) {
  const theme = useTheme();
  const [longPressed, setLongPressed] = useState(false);
  if (item.type === 'loading') return <ScreenLoading compact variant="chats" />;
  if (item.type === 'empty') return <ThemedText style={styles.emptyProject} themeColor="textTertiary" type="caption">{item.label}</ThemedText>;
  if (item.type === 'loadMore') return <LoadMore disabled={item.disabled} label={item.label} onPress={item.onPress} />;
  if (item.type === 'archive') return <ThemedText style={styles.archiveLabel} themeColor="textTertiary" type="caption">Read-only Project archive</ThemedText>;
  if (item.type === 'message') return <Pressable accessibilityLabel={`${item.message.title}. ${item.message.subtitle}. Open matching message.`} accessibilityRole="button" android_ripple={{ color: theme.backgroundSelected }} onPress={() => onMessage(item.message)} style={({ pressed }) => [styles.searchResult, { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElevated, borderColor: theme.homeBorder }]}>
    <View style={[styles.channelIcon, { backgroundColor: theme.backgroundSelected }]}><EntityMark id={String(item.message.groupId)} iconKey={item.iconKey} kind="channel" name={item.message.groupName} size={26} /></View>
    <View style={styles.rowCopy}><ThemedText numberOfLines={1} type="captionBold">{item.message.groupName}</ThemedText><ThemedText numberOfLines={2} themeColor="textSecondary" type="caption">{item.message.preview}</ThemedText><ThemedText numberOfLines={1} themeColor="textTertiary" type="caption">{item.message.subtitle}</ThemedText></View>
    <PlatformIcon color={theme.textTertiary} name="chevron-right" size={18} weight="regular" />
  </Pressable>;
  if (item.type === 'channel') {
    const channel = item.channel;
    const target = channelActionTarget(project, channel);
    return <View style={[styles.channelBlock, { borderBottomColor: theme.homeBorder }]}><Pressable accessibilityActions={[{ name: 'showActions', label: 'Show Channel actions' }]} accessibilityHint="Tap to open. Touch and hold or use the Channel actions menu to show options." accessibilityLabel={`${channel.group.name} Channel${channel.unreadCount ? `, ${channel.unreadCount} unread` : ''}`} accessibilityRole="button" android_ripple={{ color: theme.backgroundSelected }} delayLongPress={360} onAccessibilityAction={(event) => { if (event.nativeEvent.actionName === 'showActions') onActions(target); }} onLongPress={() => { setLongPressed(true); onActions(target); }} onPressOut={() => setLongPressed(false)} onPress={() => onChannel(channel.group._id)} style={({ pressed }) => [styles.channelRow, { backgroundColor: longPressed ? theme.accentSoft : pressed ? theme.backgroundSelected : 'transparent' }]}>
      <ChannelIcon id={String(channel.group._id)} channel={channel.group} iconKey={item.iconKey} name={channel.group.name} unreadCount={channel.unreadCount} />
      <View style={styles.channelCopy}>
        <View style={styles.channelTopLine}>
          <ThemedText numberOfLines={1} style={[styles.rowTitle, styles.channelName]} type="subtitle">{channel.group.name}</ThemedText>
          {channel.lastMessage ? <ThemedText style={styles.channelDate} themeColor="textTertiary" type="caption">{conversationTime(channel.lastMessage.createdAt)}</ThemedText> : null}
        </View>
        <ThemedText numberOfLines={2} style={styles.channelPreview} themeColor="textSecondary" type="caption">{channel.lastMessage?.body?.trim() || 'No messages yet'}</ThemedText>
      </View>
    </Pressable></View>;
  }
  return null;
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

function conversationTime(timestamp: number) {
  const date = new Date(timestamp);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (date.getFullYear() === today.getFullYear()) return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short' });
}

function sameConversationRows(previous: ConversationListItem[] | undefined, next: ConversationListItem[]) {
  return previous === next || Boolean(previous && previous.length === next.length && previous.every((item, index) => {
    const candidate = next[index];
    if (!candidate || item.key !== candidate.key || item.type !== candidate.type) return false;
    if (item.type === 'channel' && candidate.type === 'channel') return item.channel === candidate.channel && item.iconKey === candidate.iconKey;
    if (item.type === 'message' && candidate.type === 'message') return item.message === candidate.message && item.iconKey === candidate.iconKey;
    if (item.type === 'loadMore' && candidate.type === 'loadMore') return item.disabled === candidate.disabled && item.label === candidate.label;
    if (item.type === 'empty' && candidate.type === 'empty') return item.label === candidate.label;
    return true;
  }));
}

function sameStringSet(left: Set<string>, right: Set<string>) {
  return left.size === right.size && [...left].every((value) => right.has(value));
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

function ChannelIcon({ channel, id, iconKey, name, unreadCount }: { channel?: ChannelRow['group']; id: string; iconKey: EntityMarkIconKey; name: string; unreadCount: number }) {
  const theme = useTheme();
  return <View style={styles.channelIconWrap}>
    <EntityMark colorKey={channel?.markColorKey} iconKey={iconKey} id={id} kind="channel" name={name} size={channelIconSize} />
    {unreadCount > 0 ? <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.channelUnreadBadge, { backgroundColor: theme.accent, borderColor: theme.homeSurface }]}><ThemedText style={styles.channelUnreadCount} type="captionBold">{unreadCount > 99 ? '99+' : unreadCount}</ThemedText></View> : null}
  </View>;
}

const styles = StyleSheet.create({
  archiveLabel: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  channelBlock: { borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: entityDirectoryRow.separatorPadding },
  channelIcon: { alignItems: 'center', borderRadius: Radius.pill, height: searchResultChannelIconSize, justifyContent: 'center', width: searchResultChannelIconSize },
  channelIconWrap: { borderRadius: Radius.pill, flexShrink: 0, height: channelIconSize, position: 'relative', width: channelIconSize },
  channelUnreadBadge: { alignItems: 'center', borderRadius: Radius.pill, borderWidth: 1.5, justifyContent: 'center', minHeight: 24, minWidth: 24, paddingHorizontal: 3, paddingVertical: 2, position: 'absolute', right: -4, top: -4 },
  channelUnreadCount: { ...Typography.captionBold, color: '#1b1917' },
  channelRow: entityDirectoryRowStyle,
  content: { gap: Spacing.one, paddingHorizontal: Spacing.four, paddingTop: Spacing.two },
  divider: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two, paddingHorizontal: Spacing.two, paddingTop: Spacing.two, paddingBottom: Spacing.one },
  dividerLabel: { alignItems: 'center', flexDirection: 'row', gap: Spacing.one, maxWidth: '80%', paddingHorizontal: Spacing.one },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
  dividerTitle: { flexShrink: 1 },
  emptyProject: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  footerSpace: { height: Spacing.four },
  headerStack: { gap: Spacing.two, paddingBottom: Spacing.two },
  loadMore: { alignItems: 'center', borderRadius: Radius.medium, borderWidth: StyleSheet.hairlineWidth, marginHorizontal: Spacing.three, marginVertical: Spacing.two, minHeight: TouchTarget, justifyContent: 'center' },
  moreButton: { alignItems: 'center', borderRadius: Radius.medium, borderWidth: StyleSheet.hairlineWidth, marginHorizontal: Spacing.three, marginVertical: Spacing.two, minHeight: TouchTarget, justifyContent: 'center' },
  projectCarousel: { gap: Spacing.two, paddingVertical: Spacing.two },
  projectPill: { borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth, maxWidth: 210, minHeight: 38, justifyContent: 'center', paddingHorizontal: Spacing.three },
  projectSection: { marginTop: 0 },
  channelCopy: { flex: 1, gap: Spacing.one, minWidth: 0 },
  channelTopLine: { alignItems: 'flex-start', flexDirection: 'row', gap: Spacing.two, minWidth: 0 },
  channelName: { flex: 1, minWidth: 0 },
  channelDate: { flexShrink: 0, textAlign: 'right' },
  channelPreview: { marginTop: Spacing.half },
  rowCopy: { flex: 1, gap: entityDirectoryRow.copyGap, minWidth: 0 },
  searchResult: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.large, borderWidth: StyleSheet.hairlineWidth, elevation: 1, flexDirection: 'row', gap: Spacing.three, marginBottom: Spacing.two, marginHorizontal: Spacing.one, minHeight: 78, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, shadowColor: '#000', shadowOffset: { height: 1, width: 0 }, shadowOpacity: 0.04, shadowRadius: 2 },
  rowTitle: { flexShrink: 1 },
  screen: { flex: 1 },
  sheetCompanyMark: { alignItems: 'center', borderRadius: Radius.medium, height: 36, justifyContent: 'center', width: 36 },
  searchStatus: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two, minHeight: TouchTarget, paddingHorizontal: Spacing.three },
  scopeNote: { alignItems: 'center', alignSelf: 'flex-start', borderRadius: Radius.pill, flexDirection: 'row', gap: Spacing.one, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  selectorLabel: { letterSpacing: 0.8, paddingTop: Spacing.one },
});
