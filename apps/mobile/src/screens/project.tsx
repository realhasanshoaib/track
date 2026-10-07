import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { usePaginatedQuery, useQuery } from 'convex/react';
import { useCallback, useEffect, useState } from 'react';

import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import { ConnectivityBanner } from '@/components/connectivity-banner';
import { EmptyState } from '@/components/empty-state';
import { IconButton } from '@/components/icon-button';
import { OptionsSheet, SheetRow, SheetSection } from '@/components/options-sheet';
import {
  ProjectAttention,
  ProjectHero,
  ProjectProgress,
  ProjectWorkHub,
} from '@/components/project-overview-dashboard';
import { ScreenEntrance } from '@/components/screen-entrance';
import { ScreenLoading } from '@/components/screen-loading';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTrackUser } from '@/contexts/track-user-context';
import { usePrimaryNavigationVisibility } from '@/contexts/primary-navigation-visibility-context';
import { useBottomTabContentInset } from '@/hooks/use-bottom-tab-inset';
import { channelHref, projectChannelsHref, projectSettingsHref } from '@/lib/company-navigation';
import type { MobileAttentionItem } from '@/lib/mobile-attention';
import { projectRoleLabel } from '@/lib/role-label';
import { useReleaseConfig } from '@/lib/release-config';
import { taskDetailHref, taskListHref, type MobileTaskIdentity } from '@/lib/task-navigation';
import { threadConversationHref } from '@/lib/thread-navigation';

export default function ProjectOverviewScreen() {
  const bottomContentInset = useBottomTabContentInset();
  const router = useRouter();
  const release = useReleaseConfig();
  const { setCreateContext } = usePrimaryNavigationVisibility();
  const { trackUserId } = useTrackUser();
  const [optionsOpen, setOptionsOpen] = useState(false);
  const params = useLocalSearchParams<{ projectId?: string; companyId?: string; membershipId?: string; archive?: string }>();
  const projectId = typeof params.projectId === 'string' ? params.projectId as Id<'projects'> : undefined;
  const companyId = typeof params.companyId === 'string' ? params.companyId as Id<'companies'> : undefined;
  const membershipId = typeof params.membershipId === 'string' ? params.membershipId as Id<'projectMembers'> : undefined;
  const archived = params.archive === '1';
  const context = companyId && membershipId ? { archived, companyId, membershipId } : null;

  useFocusEffect(useCallback(() => {
    if (!projectId) {
      setCreateContext(null);
      return undefined;
    }
    setCreateContext({ archive: archived, companyId, membershipId, projectId, scope: 'project' });
    return () => setCreateContext(null);
  }, [archived, companyId, membershipId, projectId, setCreateContext]));

  const navigation = useQuery(api.mobile.resolveNavigation, trackUserId && projectId ? {
    userId: trackUserId, projectId, actingCompanyId: companyId, projectMemberId: membershipId,
  } : 'skip');
  const groups = useQuery(api.mobile.listGroups, trackUserId && projectId && navigation?.available ? {
    userId: trackUserId, projectId, actingCompanyId: companyId, projectMemberId: membershipId,
  } : 'skip');
  const tasks = useQuery(api.tasks.list, release.tasks && trackUserId && projectId && navigation?.available ? {
    projectId, actingCompanyId: companyId, projectMemberId: membershipId,
  } : 'skip');
  const members = usePaginatedQuery(api.mobile.listProjectMembersPage, trackUserId && projectId && navigation?.available ? {
    userId: trackUserId, projectId, actingCompanyId: companyId, projectMemberId: membershipId,
  } : 'skip', { initialNumItems: 100 });
  const attentionPages = usePaginatedQuery(api.mobile.listAttention, trackUserId ? {
    userId: trackUserId, actingCompanyId: companyId,
  } : 'skip', { initialNumItems: 10 });
  useEffect(() => {
    if (attentionPages.status === 'CanLoadMore') attentionPages.loadMore(10);
  }, [attentionPages.loadMore, attentionPages.status]);
  const project = navigation?.available && navigation.project && navigation.membership ? navigation : undefined;
  const projectName = project?.project.name ?? 'Project overview';
  const projectAttention = (attentionPages.results as MobileAttentionItem[])
    .filter((item) => item.projectId === projectId)
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, 3);
  const completedTaskCount = tasks?.filter((item) => item.state?.category === 'completed').length ?? 0;
  const openTaskCount = tasks?.filter((item) => item.state?.category !== 'completed' && item.state?.category !== 'canceled').length ?? 0;
  const totalTaskCount = tasks?.filter((item) => item.state?.category !== 'canceled').length ?? 0;
  const channelCount = groups?.length ?? 0;
  const unreadCount = groups?.reduce((count, group) => count + group.unreadCount, 0) ?? 0;
  const today = new Date();
  const sevenDaysFromNow = new Date(today);
  sevenDaysFromNow.setDate(today.getDate() + 7);
  const todayDate = localDateKey(today);
  const dueSoonDate = localDateKey(sevenDaysFromNow);
  const dueSoonCount = tasks?.filter((item) => item.task.dueDate && item.task.dueDate >= todayDate && item.task.dueDate <= dueSoonDate).length ?? 0;
  const projectCompany = project?.membership.companyDisplayNameSnapshot ?? 'Independent Project';
  const projectRole = projectRoleLabel(project?.membership.role);
  const memberCount = `${members.results.length}${members.status === 'CanLoadMore' ? '+' : ''}`;
  // Navigation resolves before the dependent counts. Keep the dashboard in its
  // loading state until those queries finish so it never announces false zeros.
  const loading = !projectId || navigation === undefined || (navigation.available && (
    groups === undefined || (release.tasks && tasks === undefined)
    || members.status === 'LoadingFirstPage'
  ));

  function openBoard() {
    if (projectId && release.tasks) router.push(`${taskListHref(projectId, context)}&view=board` as never);
  }
  function openTasks() {
    if (projectId && release.tasks) router.push(`${taskListHref(projectId, context)}&view=list` as never);
  }
  function openChannels() {
    if (projectId) router.push(projectChannelsHref(projectId, context));
  }
  function openAttention(item: MobileAttentionItem) {
    const identity: MobileTaskIdentity | null = item.companyId && item.membershipId ? { companyId: item.companyId, membershipId: item.membershipId } : null;
    const represented = identity ? { companyId: identity.companyId, membershipId: identity.membershipId, archived: false } : null;
    if (item.kind === 'task') return router.push(taskDetailHref(item.projectId, item.taskKey, identity, { companyId: item.companyId, id: item.id, membershipId: item.membershipId }));
    if (item.kind === 'suggestion') return router.push(taskListHref(item.projectId, identity, 'inbox', item.id));
    if (item.kind === 'invitation') return router.push(`/inbox?filter=invitations&invitationId=${encodeURIComponent(item.invitationId)}`);
    return router.push((item.threadId
      ? threadConversationHref(item.projectId, item.groupId, item.threadId, represented, item.messageId)
      : channelHref(item.projectId, item.groupId, represented, item.messageId)) as never);
  }

  return <ThemedView style={styles.screen}>
    <Stack.Screen options={{
      headerLeft: () => <IconButton accessibilityLabel="Back" appearance="plain" icon="arrow-left" onPress={() => {
        if (router.canGoBack()) router.back();
        else router.replace('/');
      }} />,
      headerRight: () => <View style={styles.headerActions}>
        <IconButton accessibilityLabel="Project options" appearance={Platform.OS === 'ios' ? 'plain' : 'surface'} icon="tune" onPress={() => setOptionsOpen(true)} />
      </View>,
      title: 'Project',
    }} />
    <ConnectivityBanner style={styles.connection} />
    {loading ? <ScreenEntrance style={styles.screenContent}><ScreenLoading variant="project" /></ScreenEntrance> : navigation && !navigation.available ? (
      <View style={styles.centered}><EmptyState body="This Project isn’t available with your current Company access." icon="shield-lock-outline" title="Project unavailable" /></View>
    ) : projectId && project ? (
      <ScreenEntrance style={styles.screenContent}><ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomContentInset }]} contentInsetAdjustmentBehavior="automatic" showsVerticalScrollIndicator={false}>
        <ProjectHero archived={navigation.archived} colorKey={project.project.markColorKey} company={project.project.clientLabel ?? projectCompany} description={project.project.description} iconKey={project.project.markIconKey} memberCount={memberCount} name={projectName} projectId={String(projectId)} role={projectRole} />
        <ProjectAttention items={projectAttention} onOpen={openAttention} />
        <ProjectWorkHub channelCount={channelCount} dueSoonCount={dueSoonCount} onBoard={openBoard} onChannels={openChannels} onTasks={openTasks} openTaskCount={openTaskCount} tasksEnabled={release.tasks} unreadCount={unreadCount} />
        {release.tasks ? <ProjectProgress completed={completedTaskCount} total={totalTaskCount} /> : null}
      </ScrollView></ScreenEntrance>
    ) : <View style={styles.centered}><EmptyState body="Open a Project to see its Channels, tasks, and recent work." icon="project" title="Choose a Project" /></View>}
    <OptionsSheet onClose={() => setOptionsOpen(false)} title="Project options" visible={optionsOpen}>
      <SheetSection title={projectName}>
        <SheetRow icon="channel" label="Open Channels" onPress={() => { setOptionsOpen(false); openChannels(); }} />
        {release.tasks ? <SheetRow icon="task" label="Open Tasks" onPress={() => { setOptionsOpen(false); openTasks(); }} /> : null}
        {release.tasks ? <SheetRow icon="view-board" label="Open Board" onPress={() => { setOptionsOpen(false); openBoard(); }} /> : null}
        {projectId ? <SheetRow icon="tune" label="Project settings" onPress={() => { setOptionsOpen(false); router.push(projectSettingsHref(projectId, context)); }} /> : null}
      </SheetSection>
    </OptionsSheet>
  </ThemedView>;
}

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center' },
  connection: { marginHorizontal: Spacing.three, marginTop: Spacing.two },
  content: { gap: Spacing.four, padding: Spacing.four },
  headerActions: { alignItems: 'center', flexDirection: 'row' },
  screen: { flex: 1 },
  screenContent: { flex: 1 },
});
