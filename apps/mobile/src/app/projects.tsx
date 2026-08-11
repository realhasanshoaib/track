import { FlatList, Linking, Platform, Pressable, RefreshControl, StyleSheet, View, Alert } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';

import { api } from '../../../../convex/_generated/api';
import type { Doc } from '../../../../convex/_generated/dataModel';
import { useTrackUser } from '@/contexts/track-user-context';
import { useCompany } from '@/contexts/company-context';
import { useThemeOverride } from '@/contexts/theme-override-context';
import { ColoredAvatar } from '@/components/colored-avatar';
import { PlatformIcon } from '@/components/platform-icon';
import { SkeletonRow } from '@/components/skeleton-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { EmptyState } from '@/components/empty-state';
import { OptionsSheet, SheetInput, SheetSection, SheetRow } from '@/components/options-sheet';
import { LanguageSwitcher, formatNumber } from '@/i18n';
import { useLocale } from '@/contexts/locale-context';
import { Spacing, TouchTarget } from '@/constants/theme';
import { hapticLight, hapticDestructive } from '@/lib/haptics';
import { useTheme } from '@/hooks/use-theme';
import { projectChannelsHref } from '@/lib/company-navigation';

type MobileProject = {
  project: Doc<'projects'>;
  membership: Doc<'projectMembers'>;
  groupCount: number;
  unreadCount: number;
};

export default function ProjectsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation('common');
  const { direction, locale } = useLocale();
  const { trackUserId, signOut, openProfileSheet } = useTrackUser();
  const { actingCompanyId, actingCompany, companyModelEnabled } = useCompany();
  const { themeOverride, setThemeOverride } = useThemeOverride();
  const [toolsOpen, setToolsOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [projectClientLabel, setProjectClientLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const createProject = useMutation(api.projects.create);
  const ensureStarter = useMutation(api.projects.ensureStarter);
  const requestAccountDeletion = useMutation(api.auth.requestAccountDeletion);

  const projects = useQuery(api.mobile.listProjects, trackUserId ? { userId: trackUserId, actingCompanyId: actingCompanyId ?? undefined } : 'skip');
  const projectItems = (projects ?? []) as MobileProject[];

  function onRefresh() {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  }

  function openTools() {
    hapticLight();
    setToolsOpen(true);
  }

  function openCreateProject() {
    hapticLight();
    setCreateOpen(true);
  }

  function closeCreateProject() {
    if (creating) return;
    setCreateOpen(false);
  }

  async function submitCreateProject() {
    if (!trackUserId) return;
    const name = projectName.trim();
    if (!name) return;

    setCreating(true);
    try {
      const projectId = await createProject({
        userId: trackUserId,
        name,
        clientLabel: projectClientLabel.trim() || undefined,
      });
      setProjectName('');
      setProjectClientLabel('');
      setCreateOpen(false);
      router.push(`/groups?projectId=${projectId}`);
    } catch (error) {
      Alert.alert(
        t('projects.projectNotCreated'),
        error instanceof Error && error.message === 'not_allowed_to_create_project'
          ? t('projects.createProjectRestricted')
          : t('projects.checkProjectDetails'),
      );
    } finally {
      setCreating(false);
    }
  }

  async function navigateToProject(item: MobileProject) {
    hapticLight();
    if (!trackUserId) return;

    if (projectItems.length === 0) {
      const projectId = await ensureStarter({ userId: trackUserId });
      router.push(projectChannelsHref(projectId, null));
    } else {
      router.push(projectChannelsHref(item.project._id, actingCompanyId ? {
        archived: item.membership.status === 'archived',
        companyId: actingCompanyId,
        membershipId: item.membership._id,
      } : null));
    }
  }

  function confirmDeletion() {
    if (!trackUserId) return;
    hapticDestructive();
    Alert.alert(
      t('projects.deleteAccount'),
      t('projects.deleteAccountBody'),
      [
        { text: t('generic.cancel'), style: 'cancel' },
        {
          text: t('projects.deleteAccountConfirm'),
          style: 'destructive',
          onPress: () => {
            void deleteAccount();
          },
        },
      ],
    );
  }

  async function deleteAccount() {
    if (!trackUserId || deletingAccount) return;
    setDeletingAccount(true);
    try {
      await requestAccountDeletion({ userId: trackUserId });
      await signOut();
    } catch {
      Alert.alert(t('projects.deleteAccountFailed'), t('projects.deleteAccountRetry'));
    } finally {
      setDeletingAccount(false);
    }
  }

  return (
    <ThemedView style={[styles.screen, { direction }]}>
      <Stack.Screen
        options={{
          title: t('projects.title'),
          headerLargeTitle: Platform.OS === 'ios',
          headerTransparent: Platform.OS === 'ios',
          headerBlurEffect: 'systemMaterial',
          headerRight: () => (
            <View style={styles.headerActions}>
              {companyModelEnabled ? <Pressable
                accessibilityLabel={t('projects.switchCompany')}
                android_ripple={{ color: theme.backgroundSelected, borderless: true }}
                hitSlop={8}
                onPress={() => router.push('/company')}
                style={styles.headerButton}>
                <PlatformIcon color={theme.text} name="briefcase-outline" size={22} />
              </Pressable> : null}
              {!actingCompanyId ? (
              <Pressable
                accessibilityLabel={t('projects.createProject')}
                android_ripple={{ color: theme.backgroundSelected, borderless: true }}
                hitSlop={8}
                onPress={openCreateProject}
                style={styles.headerButton}>
                <PlatformIcon color={theme.text} name="plus" size={22} />
              </Pressable>
              ) : null}
              <Pressable
                accessibilityLabel={t('projects.accountAndSettings')}
                android_ripple={{ color: theme.backgroundSelected, borderless: true }}
                hitSlop={8}
                onPress={openTools}
                style={styles.headerButton}>
                <PlatformIcon color={theme.text} name="dots-horizontal" size={22} />
              </Pressable>
            </View>
          ),
        }}
      />

      {actingCompanyId ? <View style={[styles.contextBanner, { backgroundColor: theme.backgroundElement }]}><ThemedText type="smallBold">{t('projects.representing', { company: actingCompany?.company?.displayName ?? '' })}</ThemedText><ThemedText style={{ color: theme.textSecondary }} type="small">{t('projects.companyActions')}</ThemedText></View> : null}

      {projects === undefined ? (
        <View style={styles.list}>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </View>
      ) : (
        <FlatList
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={styles.list}
          data={projectItems}
          keyExtractor={(item) => item.membership._id}
          renderItem={({ item }) => (
            <ProjectRow item={item} onPress={() => void navigateToProject(item)} />
          )}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <EmptyState icon="briefcase-outline" title={t('projects.noProjects')} body={actingCompanyId ? t('projects.sharedProjectsBody') : t('projects.createProjectBody')} />
              {!actingCompanyId ? <Pressable
                accessibilityRole="button"
                android_ripple={{ color: theme.backgroundSelected }}
                onPress={openCreateProject}
                style={[styles.primaryButton, { backgroundColor: theme.text }]}>
                <ThemedText style={{ color: theme.background }} type="smallBold">
                  {t('projects.createProject')}
                </ThemedText>
              </Pressable> : null}
            </View>
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} colors={[theme.accent]} />
          }
        />
      )}

      <OptionsSheet onClose={closeCreateProject} title={t('projects.createProject')} visible={createOpen}>
        <SheetSection>
          <View style={styles.createInputs}>
            <SheetInput label={t('projects.projectName')} onChangeText={setProjectName} value={projectName} />
            <SheetInput label={t('projects.clientLabel')} onChangeText={setProjectClientLabel} value={projectClientLabel} />
          </View>
        </SheetSection>
        <Pressable
          accessibilityLabel={t('projects.submitCreateProject')}
          accessibilityRole="button"
          disabled={!projectName.trim() || creating}
          onPress={() => void submitCreateProject()}
          style={[
            styles.primaryButton,
            { backgroundColor: !projectName.trim() || creating ? theme.hairline : theme.text },
          ]}>
          <ThemedText style={{ color: theme.background }} type="smallBold">
            {creating ? t('projects.creating') : t('projects.createProject')}
          </ThemedText>
        </Pressable>
      </OptionsSheet>

      <OptionsSheet onClose={() => setToolsOpen(false)} title={t('account.title')} visible={toolsOpen}>
        <SheetSection title={t('account.appearance')}>
          <SheetRow icon="white-balance-sunny" label={t('account.light')} selected={themeOverride === 'light'} onPress={() => setThemeOverride('light')} />
          <SheetRow icon="theme-light-dark" label={t('account.system')} selected={themeOverride === 'system'} onPress={() => setThemeOverride('system')} />
          <SheetRow icon="moon-waning-crescent" label={t('account.dark')} selected={themeOverride === 'dark'} onPress={() => setThemeOverride('dark')} />
        </SheetSection>
        <SheetSection title={t('language.label')}>
          <LanguageSwitcher compact />
        </SheetSection>
        <SheetSection>
          <SheetRow icon="account-edit-outline" label={t('account.editProfile')} onPress={() => { setToolsOpen(false); openProfileSheet(); }} />
          <SheetRow icon="bell-outline" label={t('account.notifications')} onPress={() => { setToolsOpen(false); router.push('/notifications'); }} />
          <SheetRow icon="shield-lock-outline" label={t('account.privacyPolicy')} onPress={() => void Linking.openURL('https://track.q9labs.ai/privacy')} />
          <SheetRow icon="file-document-outline" label={t('account.terms')} onPress={() => void Linking.openURL('https://track.q9labs.ai/terms')} />
          <SheetRow icon="email-outline" label={t('account.support')} onPress={() => void Linking.openURL('mailto:q9labs.ai@gmail.com')} />
          <SheetRow icon="logout" label={t('account.signOut')} onPress={() => { setToolsOpen(false); void signOut(); }} />
          <SheetRow destructive icon="trash-can-outline" label={deletingAccount ? t('projects.deletingAccount') : t('projects.deleteAccount')} onPress={() => { setToolsOpen(false); confirmDeletion(); }} />
        </SheetSection>
      </OptionsSheet>
    </ThemedView>
  );
}

function ProjectRow({ item, onPress }: { item: MobileProject; onPress: () => void }) {
  const theme = useTheme();
  const { t } = useTranslation('common');
  const { direction, locale } = useLocale();
  const role = item.membership.role === 'owner'
    ? t('projects.roleOwner')
    : item.membership.role === 'admin'
      ? t('projects.roleAdmin')
      : t('projects.roleMember');
  const channelLabel = t('projects.channelCount', {
    count: item.groupCount,
    formattedCount: formatNumber(locale, item.groupCount),
  });
  const projectMeta = [
    item.membership.companyDisplayNameSnapshot,
    role,
    channelLabel,
    item.membership.status === 'archived' ? t('projects.archive') : null,
  ].filter(Boolean).join(' · ');
  return (
    <Pressable
      android_ripple={{ color: theme.backgroundSelected }}
      hitSlop={4}
      onPress={() => { hapticLight(); onPress(); }}
      style={[styles.row, { backgroundColor: theme.backgroundElement, direction }]}>
      <ColoredAvatar label={item.project.name} seed={item.project._id} shape="rounded" size={44} />
      <View style={styles.rowBody}>
        <ThemedText contentDirection="auto" type="smallBold">{item.project.name}</ThemedText>
        <ThemedText contentDirection="auto" style={{ color: theme.textSecondary }} type="code">{projectMeta}</ThemedText>
      </View>
      {item.unreadCount > 0 ? (
        <View style={[styles.badge, { backgroundColor: theme.accent }]}>
          <ThemedText style={styles.badgeText}>
            {item.unreadCount > 99 ? `${formatNumber(locale, 99)}+` : formatNumber(locale, item.unreadCount)}
          </ThemedText>
        </View>
      ) : (
        <PlatformIcon color={theme.hairline} directional name="chevron-right" size={18} />
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
  contextBanner: {
    gap: Spacing.one,
    marginHorizontal: Spacing.three,
    marginTop: Spacing.two,
    padding: Spacing.three,
    borderRadius: 10,
  },
  createInputs: {
    gap: Spacing.three,
    padding: Spacing.three,
  },
  emptyWrap: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  headerActions: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  headerButton: {
    alignItems: 'center',
    height: TouchTarget,
    justifyContent: 'center',
    width: TouchTarget,
  },
  list: {
    gap: Spacing.two,
    padding: Spacing.three,
    paddingTop: Spacing.two,
  },
  primaryButton: {
    alignItems: 'center',
    borderRadius: 10,
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: Spacing.four,
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
