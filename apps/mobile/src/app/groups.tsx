import { channelHref, navigationUnavailableCopy } from '@/lib/navigation'
import { FlatList, Platform, Pressable, StyleSheet, View } from 'react-native'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { usePaginatedQuery, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import { useTrackUser } from '@/contexts/track-user-context'
import { ColoredAvatar } from '@/components/colored-avatar'
import { EmptyState } from '@/components/empty-state'
import { PlatformIcon } from '@/components/platform-icon'
import { SkeletonList } from '@/components/skeleton-row'
import { ThemedText } from '@/components/themed-text'
import { ThemedView } from '@/components/themed-view'
import { Colors, Radius, Spacing, TouchTarget } from '@/constants/theme'
import { hapticLight } from '@/lib/haptics'
import { useTheme } from '@/hooks/use-theme'
import { usePushNotifications } from '@/lib/push-notifications'
type MobileGroup = FunctionReturnType<typeof api.mobile.listGroupsPage>['page'][number]
export default function GroupsScreen() {
  const theme = useTheme()
  const router = useRouter()
  const { trackUserId } = useTrackUser()
  const push = usePushNotifications()
  const { projectId, membershipId, archive } = useLocalSearchParams<{
    projectId: string
    membershipId?: string
    archive?: string
  }>()
  const projects = useQuery(api.mobile.listProjects, trackUserId ? { userId: trackUserId } : 'skip')
  const navigation = useQuery(
    api.mobile.resolveNavigation,
    trackUserId && projectId
      ? {
          userId: trackUserId,
          projectId: projectId as Id<'projects'>,
          projectMemberId: membershipId as Id<'projectMembers'> | undefined,
        }
      : 'skip',
  )
  const {
    results: groups,
    status: groupsStatus,
    loadMore: loadMoreGroups,
  } = usePaginatedQuery(
    api.mobile.listGroupsPage,
    trackUserId && projectId && navigation?.available
      ? {
          userId: trackUserId,
          projectId: projectId as Id<'projects'>,
          projectMemberId: membershipId as Id<'projectMembers'> | undefined,
        }
      : 'skip',
    { initialNumItems: 50 },
  )
  const projectName = projects?.find((p) => p.project._id === projectId)?.project.name ?? 'Channels'
  const readOnlyArchive = archive === '1' || navigation?.archived === true
  function navigate(item: MobileGroup) {
    hapticLight()
    router.push(channelHref(projectId, item.group._id))
  }
  return (
    <ThemedView style={styles.screen}>
      <Stack.Screen
        options={{
          title: projectName,
          headerLargeTitle: Platform.OS === 'ios',
          headerTransparent: Platform.OS === 'ios',
          headerBlurEffect: 'systemMaterial',
        }}
      />

      {navigation && !navigation.available ? (
        <View style={styles.list}>
          <EmptyState
            icon="shield-lock-outline"
            title="Project unavailable"
            body={navigationUnavailableCopy()}
          />
        </View>
      ) : null}

      {!navigation || (navigation.available && groupsStatus === 'LoadingFirstPage') ? (
        <SkeletonList label="Loading Channels" />
      ) : navigation.available ? (
        <FlatList
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={styles.list}
          data={groups}
          keyExtractor={(item) => item.group._id}
          renderItem={({ item }) => (
            <GroupRow archived={readOnlyArchive} item={item} onPress={() => navigate(item)} />
          )}
          ListHeaderComponent={
            push.permissionState === 'not_determined' ? (
              <View style={[styles.notificationCard, { backgroundColor: theme.backgroundElement }]}>
                <PlatformIcon color={theme.accent} name="bell-outline" size={24} />
                <View style={styles.notificationCopy}>
                  <ThemedText type="title">Keep up with {projectName}</ThemedText>
                  <ThemedText themeColor="textSecondary" type="caption">
                    Get timely Project activity with full, context-only, or hidden previews you
                    control.
                  </ThemedText>
                </View>
                <Pressable
                  accessibilityRole="button"
                  disabled={push.syncing}
                  onPress={() => void push.requestPermission()}
                  style={[styles.enableButton, { backgroundColor: theme.text }]}
                >
                  <ThemedText style={{ color: theme.background }} type="title">
                    Enable
                  </ThemedText>
                </Pressable>
              </View>
            ) : null
          }
          ListFooterComponent={
            groupsStatus === 'CanLoadMore' || groupsStatus === 'LoadingMore' ? (
              <Pressable
                accessibilityRole="button"
                disabled={groupsStatus === 'LoadingMore'}
                onPress={() => loadMoreGroups(50)}
                style={styles.loadMore}
              >
                <ThemedText type="smallBold">
                  {groupsStatus === 'LoadingMore' ? 'Loading more Channels…' : 'Load more Channels'}
                </ThemedText>
              </Pressable>
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              icon="forum-outline"
              title="No Channels visible"
              body="Only Channels explicitly granted to this represented membership appear here."
            />
          }
        />
      ) : null}
    </ThemedView>
  )
}
function GroupRow({
  archived,
  item,
  onPress,
}: {
  archived: boolean
  item: MobileGroup
  onPress: () => void
}) {
  const theme = useTheme()
  return (
    // See projects.tsx: a themed fill and a ripple on the same pressable share
    // one Android drawable that never repaints on a theme change.
    <View style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
      <Pressable
        android_ripple={{ color: theme.backgroundSelected }}
        hitSlop={4}
        onPress={() => {
          hapticLight()
          onPress()
        }}
        style={styles.rowPressable}
      >
        <ColoredAvatar label={item.group.name} seed={item.group._id} shape="rounded" size={44} />
        <View style={styles.rowBody}>
          <ThemedText numberOfLines={1} type="title">
            {item.group.name}
          </ThemedText>
          <ThemedText numberOfLines={1} themeColor="textSecondary" type="caption">
            {item.lastMessage?.body || 'No messages yet'}
            {archived ? ' · read-only archive' : ''}
          </ThemedText>
        </View>
        {item.unreadCount > 0 ? (
          <View
            accessibilityLabel={`${item.unreadCount} unread`}
            style={[styles.badge, { backgroundColor: theme.accent }]}
          >
            <ThemedText style={styles.badgeText} type="captionBold">
              {item.unreadCount > 99 ? '99+' : String(item.unreadCount)}
            </ThemedText>
          </View>
        ) : (
          <PlatformIcon color={theme.textTertiary} name="chevron-right" size={18} />
        )}
      </Pressable>
    </View>
  )
}
const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    borderRadius: Radius.pill,
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  // The accent is the same yellow in both themes, so the badge ink is fixed
  // to the light-theme stone that clears AA against it (9.18:1).
  badgeText: {
    color: Colors.light.text,
  },
  enableButton: {
    alignItems: 'center',
    borderRadius: Radius.medium,
    justifyContent: 'center',
    minHeight: TouchTarget,
    paddingHorizontal: Spacing.three,
  },
  list: {
    gap: Spacing.two,
    padding: Spacing.three,
    paddingTop: Spacing.two,
  },
  loadMore: {
    alignItems: 'center',
    minHeight: TouchTarget,
    justifyContent: 'center',
    padding: Spacing.two,
  },
  notificationCard: {
    alignItems: 'center',
    borderRadius: Radius.large,
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
    height: TouchTarget,
    justifyContent: 'center',
    width: TouchTarget,
  },
  row: {
    borderRadius: Radius.large,
    overflow: 'hidden',
  },
  rowBody: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  rowPressable: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.three,
    minHeight: 64,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  screen: {
    flex: 1,
  },
})
