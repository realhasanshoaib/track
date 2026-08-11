import { FlatList, Platform, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useQuery } from 'convex/react';

import { api } from '../../../../convex/_generated/api';
import type { Doc, Id } from '../../../../convex/_generated/dataModel';
import { useTrackUser } from '@/contexts/track-user-context';
import { ColoredAvatar } from '@/components/colored-avatar';
import { EmptyState } from '@/components/empty-state';
import { PlatformIcon } from '@/components/platform-icon';
import { SkeletonRow } from '@/components/skeleton-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { hapticLight } from '@/lib/haptics';
import { useTheme } from '@/hooks/use-theme';
import { channelHref } from '@/lib/company-navigation';
import { useReleaseConfig } from '@/lib/release-config';
import { taskListHref } from '@/lib/task-navigation';
import { usePushNotifications } from '@/lib/push-notifications';
import { formatNumber, useLocale } from '@/i18n';
import { useTranslation } from 'react-i18next';

type MobileGroup = {
  group: Doc<'groups'>;
  membership: Doc<'groupMembers'>;
  lastMessage: Doc<'messages'> | null;
  unreadCount: number;
};

export default function GroupsScreen() {
  const theme = useTheme();
  const { t } = useTranslation('work');
  const router = useRouter();
  const release = useReleaseConfig();
  const { trackUserId } = useTrackUser();
  const push = usePushNotifications();
  const { projectId, companyId, membershipId, archive } = useLocalSearchParams<{ projectId: string; companyId?: string; membershipId?: string; archive?: string }>();
  const [refreshing, setRefreshing] = useState(false);

  const projects = useQuery(
    api.mobile.listProjects,
    trackUserId ? { userId: trackUserId, actingCompanyId: companyId as Id<'companies'> | undefined } : 'skip',
  );
  const navigation = useQuery(api.mobile.resolveNavigation, trackUserId && projectId ? {
    userId: trackUserId,
    projectId: projectId as Id<'projects'>,
    actingCompanyId: companyId as Id<'companies'> | undefined,
    projectMemberId: membershipId as Id<'projectMembers'> | undefined,
  } : 'skip');
  const groups = useQuery(
    api.mobile.listGroups,
    trackUserId && projectId && navigation?.available ? {
      userId: trackUserId,
      projectId: projectId as Id<'projects'>,
      actingCompanyId: companyId as Id<'companies'> | undefined,
      projectMemberId: membershipId as Id<'projectMembers'> | undefined,
    } : 'skip',
  );

  const groupItems = (groups ?? []) as MobileGroup[];
  const projectName = (projects as { project: Doc<'projects'> }[] | undefined)
    ?.find((p) => p.project._id === projectId)?.project.name ?? t('channels.projectFallback');

  function onRefresh() {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  }

  function navigate(item: MobileGroup) {
    hapticLight();
    router.push(channelHref(projectId as Id<'projects'>, item.group._id, companyId && membershipId ? {
      archived: archive === '1',
      companyId: companyId as Id<'companies'>,
      membershipId: membershipId as Id<'projectMembers'>,
    } : null));
  }

  return (
    <ThemedView style={styles.screen}>
      <Stack.Screen
        options={{
          title: projectName,
          headerLargeTitle: Platform.OS === 'ios',
          headerTransparent: Platform.OS === 'ios',
          headerBlurEffect: 'systemMaterial',
          headerRight: () => release.tasks ? (
            <Pressable
              accessibilityLabel={t('tasks.openInbox')}
              hitSlop={8}
              onPress={() => router.push(taskListHref(projectId as Id<'projects'>, companyId && membershipId ? {
                archived: archive === '1',
                companyId: companyId as Id<'companies'>,
                membershipId: membershipId as Id<'projectMembers'>,
              } : null))}
              style={styles.headerButton}>
              <PlatformIcon color={theme.accent} name="briefcase-outline" size={22} />
            </Pressable>
          ) : null,
        }}
      />

      {navigation && !navigation.available ? <View style={styles.list}><EmptyState icon="shield-lock-outline" title={t('channels.projectUnavailable')} body={companyId ? t('channels.representedUnavailable') : t('channels.projectAccessEnded')} /></View> : null}

      {!navigation || navigation.available && groups === undefined ? (
        <View style={styles.list}>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </View>
      ) : navigation.available ? (
        <FlatList
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={styles.list}
          data={groupItems}
          keyExtractor={(item) => item.group._id}
          renderItem={({ item }) => <GroupRow item={item} onPress={() => navigate(item)} />}
          ListHeaderComponent={push.permissionState === 'not_determined' ? (
            <View style={[styles.notificationCard, { backgroundColor: theme.backgroundElement }]}>
              <PlatformIcon color={theme.accent} name="bell-outline" size={24} />
              <View style={styles.notificationCopy}>
                <ThemedText contentDirection="auto" type="smallBold">{t('channels.keepUp', { project: projectName })}</ThemedText>
                <ThemedText style={{ color: theme.textSecondary }} type="small">{t('channels.notificationBody')}</ThemedText>
              </View>
              <Pressable accessibilityRole="button" disabled={push.syncing} onPress={() => void push.requestPermission()} style={[styles.enableButton, { backgroundColor: theme.text }]}>
                <ThemedText style={{ color: theme.background }} type="smallBold">{t('channels.enable')}</ThemedText>
              </Pressable>
            </View>
          ) : null}
          ListEmptyComponent={
            <EmptyState icon="forum-outline" title={t('channels.noChannels')} body={t('channels.noChannelsBody')} />
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} colors={[theme.accent]} />
          }
        />
      ) : null}
    </ThemedView>
  );
}

function GroupRow({ item, onPress }: { item: MobileGroup; onPress: () => void }) {
  const theme = useTheme();
  const { direction, locale } = useLocale();
  const { t } = useTranslation('work');
  return (
    <Pressable
      android_ripple={{ color: theme.backgroundSelected }}
      hitSlop={4}
      onPress={() => { hapticLight(); onPress(); }}
      style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
      <ColoredAvatar label={item.group.name} seed={item.group._id} shape="rounded" size={44} />
      <View style={styles.rowBody}>
        <ThemedText contentDirection="auto" type="smallBold">{item.group.name}</ThemedText>
        <ThemedText contentDirection="auto" numberOfLines={1} style={{ color: theme.textSecondary }} type="code">
          {item.lastMessage?.body || t('channels.noMessages')}
          {item.group.status === 'archived' ? ` · ${t('channels.archivedReadOnly')}` : ''}
        </ThemedText>
      </View>
      {item.unreadCount > 0 ? (
        <View style={[styles.badge, { backgroundColor: theme.accent }]}>
          <ThemedText contentDirection="ltr" style={styles.badgeText}>
            {item.unreadCount > 99 ? '99+' : formatNumber(locale, item.unreadCount)}
          </ThemedText>
        </View>
      ) : (
        <PlatformIcon color={theme.hairline} name={direction === 'rtl' ? 'chevron-left' : 'chevron-right'} size={18} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    borderRadius: 12,
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    color: '#1b1917',
    fontFamily: 'ui-monospace',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 16,
  },
  enableButton: {
    alignItems: 'center',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: Spacing.three,
  },
  list: {
    gap: Spacing.two,
    padding: Spacing.three,
    paddingTop: Spacing.two,
  },
  notificationCard: {
    alignItems: 'center',
    borderRadius: 10,
    flexDirection: 'row',
    gap: Spacing.three,
    marginBottom: Spacing.two,
    padding: Spacing.three,
  },
  notificationCopy: {
    flex: 1,
    gap: Spacing.one,
  },
  headerButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  row: {
    alignItems: 'center',
    borderRadius: 10,
    flexDirection: 'row',
    gap: Spacing.three,
    minHeight: 64,
    overflow: 'hidden',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  rowBody: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  screen: {
    flex: 1,
  },
});
