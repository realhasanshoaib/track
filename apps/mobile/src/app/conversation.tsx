import { useAction, useMutation, useQuery } from 'convex/react';
import { RecordingPresets, requestRecordingPermissionsAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import * as DocumentPicker from 'expo-document-picker';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View, type ListRenderItem } from 'react-native';
import { api } from '../../../../convex/_generated/api';
import type { Doc, Id } from '../../../../convex/_generated/dataModel';
import { useTrackUser } from '@/contexts/track-user-context';
import { Composer } from '@/components/composer';
import { MessageActions } from '@/components/message-actions';
import { PlatformIcon } from '@/components/platform-icon';
import { TaskInlineCards } from '@/components/task-inline-cards';
import { DateSeparator, ThreadRow, type DetailedMessage, type GroupedThreadItem, type ProjectMemberRow, resolveMentionIds } from '@/components/thread-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { OptionsSheet, SheetSection, SheetRow } from '@/components/options-sheet';
import { Spacing, TouchTarget } from '@/constants/theme';
import { formatDate, type Locale, useLocale } from '@/i18n';
import { hapticLight, hapticMedium, hapticDestructive } from '@/lib/haptics';
import { useTheme } from '@/hooks/use-theme';
import { channelHref } from '@/lib/company-navigation';
import { useReleaseConfig } from '@/lib/release-config';
import type { MobileTaskIdentity } from '@/lib/task-navigation';
import { threadConversationHref, threadListHref } from '@/lib/thread-navigation';
import { setActivePushContext } from '@/lib/push-presentation';
import { useTranslation } from 'react-i18next';

const reportReasons = ['inaccurate', 'unsafe', 'spam', 'harassment', 'privacy', 'other'] as const;

type PendingMessage = { id: string; body: string; at: number };

function dateSepLabel(ts: number, locale: Locale, t: (key: string) => string) {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return t('date.today');
  if (d.toDateString() === yesterday.toDateString()) return t('date.yesterday');
  return formatDate(locale, ts);
}

export default function ConversationScreen() {
  const theme = useTheme();
  const { direction, locale } = useLocale();
  const { t } = useTranslation('chat');
  const router = useRouter();
  const { trackUserId } = useTrackUser();
  const releaseConfig = useReleaseConfig();
  const { groupId, projectId, companyId, membershipId, archive, messageId } = useLocalSearchParams<{ groupId: string; projectId: string; companyId?: string; membershipId?: string; archive?: string; messageId?: string }>();

  const sendMessage = useMutation(api.messages.send);
  const generateUploadUrl = useMutation(api.messages.generateUploadUrl);
  const attachFile = useMutation(api.messages.attachFile);
  const askTrack = useAction(api.assistant.ask);
  const markRead = useMutation(api.mobile.markGroupRead);
  const setLastActive = useMutation(api.mobile.setLastActiveContext);
  const setGlobalNotif = useMutation(api.notifications.setGlobalMode);
  const setGroupNotif = useMutation(api.notifications.setGroupMode);
  const createReport = useMutation(api.reports.create);
  const createTask = useMutation(api.tasks.create);
  const deleteMessage = useMutation(api.messages.remove);

  const gid = groupId as Id<'groups'> | undefined;
  const pid = projectId as Id<'projects'> | undefined;
  const cid = companyId as Id<'companies'> | undefined;
  const pmid = membershipId as Id<'projectMembers'> | undefined;
  const targetMessageId = messageId as Id<'messages'> | undefined;
  useFocusEffect(useCallback(() => {
    if (pid && gid) setActivePushContext({ projectId: pid, groupId: gid });
    return () => setActivePushContext(null);
  }, [gid, pid]));
  const navigation = useQuery(api.mobile.resolveNavigation, trackUserId && pid && gid ? { userId: trackUserId, projectId: pid, groupId: gid, actingCompanyId: cid, projectMemberId: pmid } : 'skip');
  const readOnly = archive === '1' || navigation?.archived === true;
  const taskIdentity: MobileTaskIdentity | null = cid && pmid ? {
    archived: readOnly,
    companyId: cid,
    membershipId: pmid,
  } : null;

  const groups = useQuery(api.mobile.listGroups, trackUserId && pid && navigation?.available ? { userId: trackUserId, projectId: pid, actingCompanyId: cid, projectMemberId: pmid } : 'skip');
  const messages = useQuery(api.messages.listDetailed, trackUserId && gid && navigation?.available ? { userId: trackUserId, groupId: gid, actingCompanyId: cid, projectMemberId: pmid, limit: 120, targetMessageId } : 'skip');
  const assistantStreams = useQuery(api.assistant.listForGroup, trackUserId && gid && navigation?.available ? { userId: trackUserId, groupId: gid, actingCompanyId: cid, projectMemberId: pmid, limit: 40 } : 'skip');
  const notifSettings = useQuery(api.notifications.getSettings, trackUserId ? { userId: trackUserId, projectMemberId: pmid } : 'skip');
  const projectMembers = useQuery(api.mobile.listProjectMembers, trackUserId && pid && navigation?.available ? { userId: trackUserId, projectId: pid, actingCompanyId: cid, projectMemberId: pmid } : 'skip');

  const listRef = useRef<FlatList<GroupedThreadItem>>(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recordingState = useAudioRecorderState(recorder, 250);

  const [composer, setComposer] = useState('');
  const [replyTo, setReplyTo] = useState<DetailedMessage | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pendingMessages, setPendingMessages] = useState<PendingMessage[]>([]);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [groupSwitchOpen, setGroupSwitchOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState<GroupedThreadItem | null>(null);
  const [reportReason, setReportReason] = useState<(typeof reportReasons)[number]>('inaccurate');
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const [actionTarget, setActionTarget] = useState<GroupedThreadItem | null>(null);

  const groupItems = useMemo(() => (groups ?? []) as { group: Doc<'groups'>; membership: Doc<'groupMembers'>; lastMessage: Doc<'messages'> | null; unreadCount: number }[], [groups]);
  const memberItems = useMemo(() => (projectMembers ?? []) as ProjectMemberRow[], [projectMembers]);
  const activeGroup = groupItems.find((g) => g.group._id === gid)?.group ?? null;
  const globalMode = notifSettings?.global?.globalMode ?? 'all';
  const groupMode = notifSettings?.groups?.find((g) => g.groupId === gid)?.mode ?? 'inherit';

  const threadItems = useMemo<GroupedThreadItem[]>(() => {
    const msgs = [...((messages ?? []) as DetailedMessage[]).reverse()].map((item) => ({
      kind: 'message' as const, key: item.message._id, at: item.message.createdAt, item, isFirstInGroup: true,
    }));
    const streams = ((assistantStreams ?? []) as Doc<'assistantStreams'>[]).map((stream) => ({
      kind: 'assistant' as const, key: stream._id, at: stream.createdAt, stream, isFirstInGroup: true,
    }));
    const sorted: Array<{ kind: 'message'; key: string; at: number; item: DetailedMessage; isFirstInGroup: boolean } | { kind: 'assistant'; key: string; at: number; stream: Doc<'assistantStreams'>; isFirstInGroup: boolean }> =
      [...msgs, ...streams].sort((a, b) => a.at - b.at);

    const result: GroupedThreadItem[] = [];
    let lastDateStr = '';
    let lastAuthorKey = '';
    let lastAt = 0;
    let lastWasDateSep = false;

    for (const raw of sorted) {
      const dateStr = new Date(raw.at).toDateString();
      if (dateStr !== lastDateStr) {
        result.push({ kind: 'date-sep', key: `sep-${raw.at}`, at: raw.at, label: dateSepLabel(raw.at, locale, t) });
        lastDateStr = dateStr;
        lastWasDateSep = true;
      }

      const authorKey = raw.kind === 'message' ? (raw.item.author?._id ?? 'anon') : '__assistant__';
      const tooLong = raw.at - lastAt > 5 * 60 * 1000;
      const isFirstInGroup = lastWasDateSep || authorKey !== lastAuthorKey || tooLong;

      result.push({ ...raw, isFirstInGroup });
      lastAuthorKey = authorKey;
      lastAt = raw.at;
      lastWasDateSep = false;
    }

    return result;
  }, [assistantStreams, locale, messages, t]);
  useEffect(() => {
    if (!targetMessageId) return;
    const index = threadItems.findIndex((item) => item.kind === 'message' && item.item.message._id === targetMessageId);
    if (index < 0) return;
    requestAnimationFrame(() => listRef.current?.scrollToIndex({ animated: true, index, viewPosition: 0.5 }));
  }, [targetMessageId, threadItems]);

  const messageActions = useMemo(() => {
    if (!actionTarget || actionTarget.kind === 'date-sep') return [];
    return [
      ...(releaseConfig.threads && actionTarget.kind === 'message' && pid && gid ? [{
        label: actionTarget.item.channelThread ? t('actions.openThread') : t('actions.startThread'),
        icon: 'forum-outline' as const,
        onPress: () => {
          if (actionTarget.item.channelThread) {
            router.push(threadConversationHref(pid, gid, actionTarget.item.channelThread.threadId, cid && pmid ? { companyId: cid, membershipId: pmid, archived: readOnly } : null) as never);
            return;
          }
          router.push(threadListHref(pid, gid, cid && pmid ? { companyId: cid, membershipId: pmid, archived: readOnly } : null, actionTarget.item.message._id) as never);
        },
      }] : []),
      ...(!readOnly ? [{
        label: t('actions.reply'),
        icon: 'arrow-up' as const,
        onPress: () => {
          if (actionTarget.kind === 'message') setReplyTo(actionTarget.item);
        },
      }] : []),
      ...(!readOnly && releaseConfig.tasks ? [{
        label: t('actions.createTask'),
        icon: 'plus' as const,
        onPress: () => {
          const source = actionTarget.kind === 'message' ? actionTarget.item.message.body : actionTarget.stream.answer;
          const reference = actionTarget.kind === 'message'
            ? { type: 'message' as const, messageId: actionTarget.item.message._id, isPrimary: true }
            : { type: 'assistant_answer' as const, assistantStreamId: actionTarget.stream._id, isPrimary: true };
          if (!pid || !gid) return;
          void createTask({
            projectId: pid,
            groupId: gid,
            title: source.trim().slice(0, 180) || t('actions.followUp'),
            priority: 'none',
            references: [reference],
            idempotencyKey: `${actionTarget.key}:${Date.now()}`,
            actingCompanyId: cid,
            projectMemberId: pmid,
          }).catch(() => Alert.alert(t('errors.task'), t('alerts.connectionRetry')));
        },
      }] : []),
      ...(!readOnly &&
        actionTarget.kind === 'message' &&
        actionTarget.item.message.authorId === trackUserId &&
        (!pmid || !actionTarget.item.message.authorProjectMemberId ||
          actionTarget.item.message.authorProjectMemberId === pmid) ? [{
        label: t('actions.deleteMessage'),
        icon: 'trash-can-outline' as const,
        destructive: true,
        onPress: () => {
          Alert.alert(
            t('alerts.deleteTitle'),
            t('alerts.deleteBody'),
            [
              { text: t('alerts.cancel'), style: 'cancel' },
              {
                text: t('alerts.delete'),
                style: 'destructive',
                onPress: () => {
                  setBusy(`delete-${actionTarget.item.message._id}`);
                  void deleteMessage({
                    messageId: actionTarget.item.message._id,
                    actorId: trackUserId,
                    actingCompanyId: cid,
                    projectMemberId: pmid,
                  }).then(() => {
                    setReplyTo((current) => current?.message._id === actionTarget.item.message._id ? null : current);
                  }).catch(() => {
                    Alert.alert(t('alerts.messageNotDeletedTitle'), t('alerts.connectionRetry'));
                  }).finally(() => setBusy(null));
                },
              },
            ],
          );
        },
      }] : []),
      {
        label: t('actions.report'),
        icon: 'trash-can-outline' as const,
        destructive: true,
        onPress: () => setReportTarget(actionTarget),
      },
    ];
  }, [actionTarget, cid, createTask, deleteMessage, gid, pid, pmid, readOnly, releaseConfig.tasks, releaseConfig.threads, router, t, trackUserId]);

  // Clear pending messages when the real message arrives from the server
  useEffect(() => {
    if (!pendingMessages.length || !messages) return;
    const now = Date.now();
    const recentBodies = new Set(
      (messages as DetailedMessage[])
        .filter((m) => now - m.message.createdAt < 30_000)
        .map((m) => m.message.body),
    );
    setPendingMessages((prev) => prev.filter((p) => !recentBodies.has(p.body)));
  }, [messages, pendingMessages.length]);

  useEffect(() => {
    if (!trackUserId || !pid || !gid || !navigation?.available) return;
    void setLastActive({
      userId: trackUserId, projectId: pid, groupId: gid,
      actingCompanyId: cid, projectMemberId: pmid,
      platform: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web',
    }).catch(() => undefined);
  }, [cid, gid, navigation?.available, pid, pmid, setLastActive, trackUserId]);

  useEffect(() => {
    if (!trackUserId || !gid || navigation?.readStateImmutable || threadItems.length === 0) return;
    const last = [...threadItems].reverse().find((i) => i.kind === 'message');
    void markRead({
      userId: trackUserId, groupId: gid,
      actingCompanyId: cid, projectMemberId: pmid,
      lastReadMessageId: last?.kind === 'message' ? last.item.message._id : undefined,
    }).catch(() => undefined);
  }, [cid, gid, markRead, navigation?.readStateImmutable, pmid, threadItems, trackUserId]);

  async function withBusy(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    try { await fn(); } finally { setBusy(null); }
  }

  async function handleSend() {
    if (!trackUserId || !pid || !gid) return;
    const body = composer.trim();
    if (!body) return;
    hapticMedium();
    const replyToMessageId = replyTo?.message._id;
    setComposer('');
    setReplyTo(null);
    const pendingId = Date.now().toString();
    setPendingMessages((prev) => [...prev, { id: pendingId, body, at: Date.now() }]);
    try {
      await withBusy('send', async () => {
        const { parseMentions } = await import('@track/shared');
        const messageId = await sendMessage({
          projectId: pid, groupId: gid, authorId: trackUserId,
          actingCompanyId: cid, projectMemberId: pmid,
          body, mentions: resolveMentionIds(body, memberItems),
          replyToMessageId, notificationPreview: body,
        });
        if (parseMentions(body).includes('track')) {
          await askTrack({ projectId: pid, groupId: gid, requesterId: trackUserId, actingCompanyId: cid, projectMemberId: pmid, promptMessageId: messageId, question: body });
        }
      });
    } catch {
      Alert.alert(t('errors.sendTitle'), t('errors.sendBody'));
    }
  }

  async function uploadAttachment(input: { uri: string; filename: string; contentType: string; body: string; kind?: 'file' | 'voice_note'; durationMs?: number }) {
    if (!trackUserId || !pid || !gid) return;
    try {
      await withBusy(input.kind ?? 'attach', async () => {
        const uploadUrl = await generateUploadUrl({ groupId: gid, userId: trackUserId, actingCompanyId: cid, projectMemberId: pmid });
        const blob = await (await fetch(input.uri)).blob();
        const res = await fetch(uploadUrl, { method: 'POST', headers: { 'Content-Type': input.contentType }, body: blob });
        if (!res.ok) throw new Error('upload_failed');
        const { storageId } = await res.json() as { storageId: Id<'_storage'> };
        const messageId = await sendMessage({
          projectId: pid, groupId: gid, authorId: trackUserId,
          actingCompanyId: cid, projectMemberId: pmid,
          body: input.body, mentions: resolveMentionIds(input.body, memberItems),
          replyToMessageId: replyTo?.message._id, notificationPreview: input.body,
        });
        await attachFile({
          projectId: pid, groupId: gid, messageId, userId: trackUserId,
          actingCompanyId: cid, projectMemberId: pmid,
          storageId, filename: input.filename, contentType: input.contentType,
          size: blob.size, kind: input.kind, durationMs: input.durationMs,
        });
        setComposer('');
        setReplyTo(null);
      });
    } catch {
      Alert.alert(t('errors.uploadTitle'), t('errors.uploadBody'));
    }
  }

  async function pickDocument() {
    hapticLight();
    try {
      const picked = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
      if (picked.canceled || !picked.assets[0]) return;
      const file = picked.assets[0];
      await uploadAttachment({ uri: file.uri, filename: file.name, contentType: file.mimeType ?? 'application/octet-stream', body: composer.trim() || t('composer.attached', { filename: file.name }), kind: 'file' });
    } catch {
      Alert.alert(t('errors.uploadTitle'), t('errors.uploadBody'));
    }
  }

  async function toggleRecording() {
    try {
      if (recordingState.isRecording) {
        await recorder.stop();
        const uri = recorder.uri;
        if (!uri) return;
        await uploadAttachment({ uri, filename: `voice-note-${Date.now()}.m4a`, contentType: 'audio/mp4', body: composer.trim() || t('composer.voiceNoteSent'), kind: 'voice_note', durationMs: Math.max(0, Math.round(recordingState.durationMillis)) });
        return;
      }
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(t('errors.microphoneTitle'), t('errors.microphoneBody'));
        return;
      }
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch {
      Alert.alert(t('errors.microphoneTitle'), t('errors.microphoneBody'));
    }
  }

  async function submitReport() {
    if (!trackUserId || !pid || !reportTarget || reportTarget.kind === 'date-sep') return;
    hapticDestructive();
    try {
      await withBusy('report', async () => {
        await createReport({
          projectId: pid, reporterId: trackUserId, groupId: gid,
          actingCompanyId: cid, projectMemberId: pmid,
          targetType: reportTarget.kind === 'assistant' ? 'assistant_answer' : 'message',
          targetMessageId: reportTarget.kind === 'message' ? reportTarget.item.message._id : undefined,
          targetAssistantStreamId: reportTarget.kind === 'assistant' ? reportTarget.stream._id : undefined,
          reason: reportReason, note: '',
        });
        setReportTarget(null);
      });
    } catch {
      Alert.alert(t('errors.reportTitle'), t('errors.reportBody'));
    }
  }

  const renderItem = useCallback<ListRenderItem<GroupedThreadItem>>(({ item }) => {
    if (item.kind === 'date-sep') return <DateSeparator label={item.label} />;
    const isOwnMessage = item.kind === 'message' && item.item.author?._id === trackUserId;
    return (
      <View>
        <ThreadRow
          item={item}
          isFirstInGroup={item.isFirstInGroup}
          isOwnMessage={isOwnMessage}
          onLongPress={() => {
            hapticLight();
            setActionTarget(item);
            setActionSheetOpen(true);
          }}
          onSwipeReply={readOnly ? undefined : () => {
            hapticLight();
            if (item.kind === 'message') setReplyTo(item.item);
          }}
        />
        {releaseConfig.tasks && pid ? <TaskInlineCards
          assistantStreamId={item.kind === 'assistant' ? item.stream._id : undefined}
          identity={taskIdentity}
          messageId={item.kind === 'message' ? item.item.message._id : undefined}
          projectId={pid}
        /> : null}
      </View>
    );
  }, [pid, readOnly, releaseConfig.tasks, taskIdentity, trackUserId]);

  if (navigation && !navigation.available) return <ThemedView style={styles.screen}><Stack.Screen options={{ title: t('channel.unavailable') }} /><View style={styles.empty}><ThemedText type="subtitle">{t('channel.unavailable')}</ThemedText><ThemedText style={{ color: theme.textSecondary }}>{cid ? t('channel.navigationCompany') : t('channel.navigationProject')}</ThemedText></View></ThemedView>;

  return (
    <ThemedView style={styles.screen}>
      <Stack.Screen
        options={{
          headerTransparent: Platform.OS === 'ios',
          headerBlurEffect: 'systemMaterial',
          headerTitle: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('channel.switch')}
              hitSlop={8}
              onPress={() => { hapticLight(); setGroupSwitchOpen(true); }}
              style={[styles.headerTitle, direction === 'rtl' && styles.rtlRow]}>
              <ThemedText contentDirection="auto" numberOfLines={1} type="smallBold">{activeGroup?.name ?? t('channel.conversation')}</ThemedText>
              <PlatformIcon color={theme.textSecondary} name="chevron-down" size={16} />
            </Pressable>
          ),
          headerRight: () => !readOnly ? (
            <Pressable
              accessibilityLabel={t('notifications.accessibilityLabel')}
              android_ripple={{ color: theme.backgroundSelected, borderless: true }}
              hitSlop={8}
              onPress={() => { hapticLight(); setToolsOpen(true); }}
              style={styles.headerButton}>
              <PlatformIcon color={theme.text} name="dots-horizontal" size={22} />
            </Pressable>
          ) : null,
        }}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}>
        <FlatList
          ref={listRef}
          contentContainerStyle={styles.thread}
          contentInsetAdjustmentBehavior="automatic"
          data={threadItems}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
          onScrollToIndexFailed={({ index }) => requestAnimationFrame(() => listRef.current?.scrollToIndex({ animated: false, index, viewPosition: 0.5 }))}
          initialNumToRender={24}
          keyExtractor={(item) => item.key}
          maxToRenderPerBatch={16}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          removeClippedSubviews={false}
          renderItem={renderItem}
          windowSize={9}
          ListEmptyComponent={
            messages === undefined ? (
              <View style={styles.empty}>
                <ThemedText style={{ color: theme.textSecondary }} type="small">{t('channel.loading')}</ThemedText>
              </View>
            ) : (
              <View style={styles.empty}>
                <ThemedText style={{ color: theme.textSecondary }} type="small">{t('channel.start')}</ThemedText>
              </View>
            )
          }
          ListFooterComponent={
            pendingMessages.length > 0 ? (
              <View>
                {pendingMessages.map((m) => (
                  <View key={m.id} style={[styles.pendingRow, direction === 'rtl' && styles.rtlRow]}>
                    <View style={styles.pendingAvatarSpacer} />
                    <View style={[styles.pendingBody, direction === 'rtl' && styles.rtlRow]}>
                      <PlatformIcon color={theme.textSecondary} name="clock-outline" size={12} />
                      <ThemedText contentDirection="auto" style={styles.pendingText} type="small">{m.body}</ThemedText>
                    </View>
                  </View>
                ))}
              </View>
            ) : null
          }
        />

        {readOnly ? <View style={[styles.archiveBanner, { backgroundColor: theme.backgroundElement }]}><ThemedText type="smallBold">{t('archive.companyTitle')}</ThemedText><ThemedText style={{ color: theme.textSecondary }} type="small">{t('archive.companyBody')}</ThemedText></View> : <Composer
          activeGroupName={activeGroup?.name ?? null}
          busy={busy === 'send'}
          isRecording={recordingState.isRecording}
          recordingDuration={recordingState.durationMillis}
          onAttach={() => void pickDocument()}
          onCancelReply={() => setReplyTo(null)}
          onChangeText={setComposer}
          onFocus={() => requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }))}
          onRecord={() => void toggleRecording()}
          onSend={() => void handleSend()}
          replyTo={replyTo}
          value={composer}
        />}
      </KeyboardAvoidingView>

      <OptionsSheet onClose={() => setGroupSwitchOpen(false)} title={t('channel.switch')} visible={groupSwitchOpen}>
        <SheetSection>
          {groupItems.map((item) => (
            <SheetRow
              key={item.group._id}
              label={item.group.name}
              selected={item.group._id === gid}
              onPress={() => {
                setGroupSwitchOpen(false);
                hapticLight();
                router.replace(channelHref(pid!, item.group._id, cid && pmid ? { archived: readOnly, companyId: cid, membershipId: pmid } : null));
              }}
            />
          ))}
        </SheetSection>
      </OptionsSheet>

      <OptionsSheet onClose={() => setToolsOpen(false)} title={t('notifications.title')} visible={toolsOpen}>
        <SheetSection>
          <SheetRow
            icon="bell-outline"
            label={t('notifications.manage')}
            onPress={() => {
              setToolsOpen(false);
              router.push('/notifications');
            }}
          />
        </SheetSection>
        {releaseConfig.threads && pid && gid ? <SheetSection title={t('notifications.conversation')}>
          <SheetRow
            icon="forum-outline"
            label={t('notifications.threads')}
            onPress={() => {
              setToolsOpen(false);
              router.push(threadListHref(pid, gid, cid && pmid ? { companyId: cid, membershipId: pmid, archived: readOnly } : null) as never);
            }}
          />
        </SheetSection> : null}
        <SheetSection title={t('notifications.global')}>
          {(['all', 'mentions', 'none'] as const).map((mode) => (
            <SheetRow
              key={mode}
              label={mode === 'all' ? t('notifications.allMessages') : mode === 'mentions' ? t('notifications.mentionsOnly') : t('notifications.off')}
              selected={globalMode === mode}
              onPress={() => trackUserId && void setGlobalNotif({ userId: trackUserId, mode }).catch(() => Alert.alert(t('notifications.title'), t('alerts.connectionRetry')))}
            />
          ))}
        </SheetSection>
        <SheetSection title={t('notifications.thisChannel')}>
          {(['inherit', 'all', 'mentions', 'none'] as const).map((mode) => (
            <SheetRow
              key={mode}
              label={mode === 'inherit' ? t('notifications.followGlobal') : mode === 'all' ? t('notifications.allMessages') : mode === 'mentions' ? t('notifications.mentionsOnly') : t('notifications.off')}
              selected={groupMode === mode}
              onPress={() => trackUserId && gid && void setGroupNotif({ userId: trackUserId, groupId: gid, actingCompanyId: cid, projectMemberId: pmid, mode }).catch(() => Alert.alert(t('notifications.title'), t('alerts.connectionRetry')))}
            />
          ))}
        </SheetSection>
      </OptionsSheet>

      <OptionsSheet onClose={() => setReportTarget(null)} title={t('report.title')} visible={Boolean(reportTarget)}>
        <SheetSection title={t('report.reason')}>
          <View style={[styles.reasonGrid, direction === 'rtl' && styles.rtlRow]}>
            {reportReasons.map((r) => (
              <Pressable
                key={r}
                onPress={() => setReportReason(r)}
                style={[styles.reasonChip, { backgroundColor: reportReason === r ? theme.backgroundSelected : theme.backgroundElement }]}>
                <ThemedText type="code">{t(`report.${r}`)}</ThemedText>
              </Pressable>
            ))}
          </View>
        </SheetSection>
        <Pressable
          disabled={busy === 'report'}
          onPress={() => void submitReport()}
          style={[styles.reportButton, { backgroundColor: busy === 'report' ? theme.hairline : '#b91c1c' }]}>
          <ThemedText style={{ color: '#fff' }} type="smallBold">{t('report.submit')}</ThemedText>
        </Pressable>
      </OptionsSheet>

      <MessageActions
        visible={actionSheetOpen}
        onClose={() => setActionSheetOpen(false)}
        actions={messageActions}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  archiveBanner: { gap: Spacing.one, padding: Spacing.three },
  empty: { alignItems: 'center', padding: Spacing.six },
  flex: { flex: 1 },
  headerButton: { alignItems: 'center', height: TouchTarget, justifyContent: 'center', width: TouchTarget },
  headerTitle: { alignItems: 'center', flexDirection: 'row', gap: 4 },
  pendingAvatarSpacer: { width: 36 },
  pendingBody: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: Spacing.two, minWidth: 0, opacity: 0.6 },
  pendingRow: { flexDirection: 'row', gap: Spacing.three, paddingHorizontal: Spacing.three, paddingVertical: 2 },
  pendingText: { flex: 1 },
  reasonChip: { borderRadius: 8, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  reasonGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, padding: Spacing.three },
  reportButton: { alignItems: 'center', borderRadius: 10, justifyContent: 'center', minHeight: 46, paddingHorizontal: Spacing.four },
  rtlRow: { flexDirection: 'row-reverse' },
  screen: { flex: 1 },
  thread: { paddingBottom: Spacing.two, paddingTop: Spacing.two },
});
