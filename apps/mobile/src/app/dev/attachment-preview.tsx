import { Stack, Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image as NativeImage, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { Doc, Id } from '../../../../../convex/_generated/dataModel';
import { Composer } from '@/components/composer';
import { PendingMessageBubble } from '@/components/chat/pending-attachment-message';
import { ImageAttachments } from '@/components/chat/image-attachment';
import { MessageBubble, MessageBubbleFrame } from '@/components/chat/message-bubble';
import { MessageText } from '@/components/chat/message-text';
import { MessageDeliveryMeta } from '@/components/chat/message-delivery-meta';
import { ColoredAvatar } from '@/components/colored-avatar';
import { IconButton } from '@/components/icon-button';
import type { AttachmentWithUrl, DetailedMessage, ViewableImage } from '@/components/chat/types';
import { DateSeparator, ThreadRow, type GroupedThreadItem } from '@/components/thread-row';
import { PendingAttachmentStrip, type PendingAttachment } from '@/components/chat-attach-menu';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { threadConversationHref } from '@/lib/thread-navigation';
import { canOpenExistingThread, useReleaseConfigState } from '@/lib/release-config';

const STATES = ['demo', 'worst', 'offline', 'empty', 'one', 'ten'] as const;
type PreviewState = typeof STATES[number];

const STATE_LABELS: Record<PreviewState, string> = {
  demo: 'Demo',
  empty: 'Empty',
  offline: 'Offline',
  one: 'One',
  ten: 'Limit 10',
  worst: 'Worst case',
};

const previewImageAsset = require('../../../assets/images/project-card-art.webp');
const previewAudioAsset = require('../../../assets/audio/voice-preview.wav');
const previewFallbackUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320"><rect width="480" height="320" fill="#c9c6bf"/><path d="M0 250 150 110l110 100 84-78 136 138v50H0z" fill="#9a968d"/><circle cx="364" cy="86" r="32" fill="#d4a72c"/></svg>')}`;
const previewUri = (typeof previewImageAsset === 'string' ? previewImageAsset : null)
  || (previewImageAsset as { uri?: string } | undefined)?.uri
  || NativeImage.resolveAssetSource?.(previewImageAsset)?.uri
  || previewFallbackUri;
const previewAudioUri = (typeof previewAudioAsset === 'string' ? previewAudioAsset : null)
  || (previewAudioAsset as { uri?: string } | undefined)?.uri
  || NativeImage.resolveAssetSource?.(previewAudioAsset)?.uri
  || '';
const worstComposerDraft = 'Please review the proposed handoff, confirm the owner for the Compliance Hub release, and share any accessibility concerns before Friday. The team will use this update to close open decisions and keep the delivery timeline clear.';
const previewVoiceAttachment = {
  _id: 'attachments:voice-preview' as Id<'attachments'>,
  contentType: 'audio/wav',
  durationMs: 10_000,
  filename: 'voice-preview.wav',
  kind: 'voice_note',
  size: 160_044,
} as unknown as Doc<'attachments'>;
const previewVoiceEntry = {
  attachment: previewVoiceAttachment,
  url: previewAudioUri,
} as unknown as AttachmentWithUrl;
const previewImageEntry = {
  attachment: {
    _id: 'attachments:image-preview' as Id<'attachments'>,
    contentType: 'image/jpeg',
    filename: 'Patient Portal handoff image.jpg',
    kind: 'file',
    size: 1_240_000,
  } as unknown as Doc<'attachments'>,
  url: previewUri,
} as unknown as AttachmentWithUrl;
const previewLongFileEntry = {
  attachment: {
    _id: 'attachments:file-preview' as Id<'attachments'>,
    contentType: 'application/pdf',
    filename: 'Q3 Board Deck — FINAL (revised) v12 [approved by legal].pdf',
    kind: 'file',
    size: 842_100,
  } as unknown as Doc<'attachments'>,
  url: previewUri,
} as unknown as AttachmentWithUrl;

function previewAttachmentMessage(senderName: string, id: string, body: string, attachments: AttachmentWithUrl[]): DetailedMessage {
  return {
    attachments,
    author: { _id: id, displayName: senderName } as unknown as Doc<'users'>,
    message: {
      _id: id as Id<'messages'>,
      authorId: id,
      body,
      createdAt: Date.UTC(2026, 8, 30, 23, 59),
      deletedAt: null,
    } as unknown as Doc<'messages'>,
  };
}

function previewVoiceMessage(senderName: string, id: string): DetailedMessage {
  return previewAttachmentMessage(senderName, id, 'Voice note', [previewVoiceEntry]);
}

function previewTextMessage(senderName: string, id: string, body: string): DetailedMessage {
  return {
    attachments: [],
    author: { _id: id, displayName: senderName } as unknown as Doc<'users'>,
    message: {
      _id: id as Id<'messages'>,
      authorId: id,
      body,
      createdAt: Date.UTC(2026, 8, 30, 23, 59),
      deletedAt: null,
    } as unknown as Doc<'messages'>,
  };
}

function previewDeletedMessage(senderName: string, id: string): DetailedMessage {
  const preview = previewTextMessage(senderName, id, '');
  return {
    ...preview,
    message: { ...preview.message, deletedAt: Date.UTC(2026, 8, 30, 23, 59) } as unknown as Doc<'messages'>,
  };
}

function previewThreadImageMessage(): DetailedMessage {
  const preview = previewAttachmentMessage('You', 'messages:preview-thread-image', 'Attached 1 image', [previewImageEntry]);
  return {
    ...preview,
    channelThread: {
      threadId: 'channelThreads:preview-thread' as Id<'channelThreads'>,
      name: 'Patient Portal handoff',
      status: 'active',
      replyCount: 3,
      latestReplyAt: Date.UTC(2026, 8, 30, 23, 59),
    },
  };
}

function previewThreadRowItem(message: DetailedMessage, key: string): Extract<GroupedThreadItem, { kind: 'message' }> {
  return {
    kind: 'message',
    key,
    at: message.message.createdAt,
    item: message,
    isFirstInGroup: true,
  };
}

function selectedState(value?: string): PreviewState {
  return STATES.find((state) => state === value) ?? 'demo';
}

/** Separate native commands from the message's gestures and playback coordinator. */
function NativeAudioCheck() {
  const player = useAudioPlayer(previewAudioAsset, { updateInterval: 100 });
  const status = useAudioPlayerStatus(player);
  const [lastCommand, setLastCommand] = useState('No taps yet');
  const [commandError, setCommandError] = useState(false);
  const taps = useRef(0);

  function command(action: 'play' | 'pause') {
    taps.current += 1;
    setLastCommand(`${action}: tap ${taps.current}`);
    try {
      player[action]();
      setCommandError(false);
    } catch {
      // Do not display native errors that may contain private media URLs.
      setCommandError(true);
    }
  }

  return <View style={{ gap: Spacing.two }}>
    <ThemedText type="smallBold">Native audio check v2</ThemedText>
    <ThemedText selectable type="small">{`Loaded: ${status.isLoaded}; playing: ${status.playing}; buffering: ${status.isBuffering}; time: ${status.currentTime.toFixed(1)}s`}</ThemedText>
    <ThemedText selectable type="small">{`${lastCommand}; error: ${commandError || Boolean(status.error)}`}</ThemedText>
    <View style={{ flexDirection: 'row', gap: Spacing.two }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Diagnostic Play" onPress={() => command('play')} style={{ minHeight: 48, minWidth: 80, justifyContent: 'center', alignItems: 'center' }}><ThemedText type="smallBold">Play</ThemedText></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Diagnostic Pause" onPress={() => command('pause')} style={{ minHeight: 48, minWidth: 80, justifyContent: 'center', alignItems: 'center' }}><ThemedText type="smallBold">Pause</ThemedText></Pressable>
    </View>
    <ThemedText themeColor="textSecondary" type="small">Tap Play, wait two seconds, then Pause. Compare with the voice notes below.</ThemedText>
  </View>;
}

export default function AttachmentPreviewScreen() {
  const theme = useTheme();
  const router = useRouter();
  const releaseConfig = useReleaseConfigState();
  const { data } = useLocalSearchParams<{ data?: string }>();
  const state = selectedState(data);
  const canOpenThread = canOpenExistingThread(releaseConfig.isLoading, releaseConfig.config.threads);
  const attachments = useMemo(() => fixtureAttachments(state, previewUri), [state]);
  const [composerDraft, setComposerDraft] = useState(state === 'worst' ? worstComposerDraft : '');
  const [threadRouteStatus, setThreadRouteStatus] = useState('Tap the conversation thread chip to check navigation.');
  const [voiceActionCount, setVoiceActionCount] = useState(0);
  const body = state === 'worst'
    ? 'Aleksandra Wiśniewska-Kowalczyk shared the revised Q3 handoff plan and asked the Patient Portal team to review the next release steps before Friday.'
    : '';

  useEffect(() => {
    setComposerDraft(state === 'worst' ? worstComposerDraft : '');
  }, [state]);

  if (!__DEV__) return <Redirect href="/" />;

  return (
    <ThemedView style={styles.screen}>
      <Stack.Screen options={{ title: 'Attachment preview' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText accessibilityRole="header" style={styles.title} type="titleLarge">Attachment preview</ThemedText>
        <ThemedText themeColor="textSecondary" type="small">Development-only states for the message image flow.</ThemedText>
        <NativeAudioCheck />
        <ThemedText style={styles.sectionLabel} type="captionBold">Composer preview</ThemedText>
        <PendingAttachmentStrip disabled items={attachments} onRemove={() => undefined} />
        <Composer
          activeGroupName="Leadership"
          busy={false}
          onCancelReply={() => undefined}
          onChangeText={setComposerDraft}
          onSendMessage={async () => ({ failedIds: [], messageId: 'messages:attachment-preview' as Id<'messages'> })}
          replyTo={null}
          value={composerDraft}
        />
        <ThemedText style={styles.sectionLabel} type="captionBold">Sending in conversation</ThemedText>
        {attachments.length ? <PendingMessageBubble at={Date.UTC(2026, 8, 30, 23, 59)} attachments={attachments} body={body} offline={state === 'offline'} /> : (
          <View style={[styles.empty, { borderColor: theme.homeBorder }]}>
            <ThemedText themeColor="textSecondary" type="small">No image selected.</ThemedText>
          </View>
        )}
        <ThemedText style={styles.sectionLabel} type="captionBold">Sent time and read receipts</ThemedText>
        <View style={[styles.messagePreview, { backgroundColor: theme.bubbleOwn }]}>
          <ThemedText numberOfLines={state === 'worst' ? 3 : 2} type="message">
            {state === 'worst'
              ? 'Aleksandra Wiśniewska-Kowalczyk shared the revised Patient Portal release plan for review.'
              : 'The latest handoff is ready to review.'}
          </ThemedText>
          <MessageDeliveryMeta
            isOwnMessage
            readReceipt={deliveryReceipt(state)}
            timeLabel={state === 'worst' ? '23:59' : '16:31'}
          />
        </View>
        <ThemedText style={styles.sectionLabel} type="captionBold">Deleted message bubble height</ThemedText>
        <MessageBubble
          contextActions={[]}
          isFirstInGroup
          isOwnMessage
          message={previewDeletedMessage('You', 'messages:preview-deleted-own')}
          timeLabel="16:32"
        />
        <MessageBubble
          contextActions={[]}
          isFirstInGroup
          isOwnMessage={false}
          message={previewDeletedMessage(
            state === 'worst' ? 'Aleksandra Wiśniewska-Kowalczyk' : 'Mateo Chen',
            'messages:preview-deleted-other',
          )}
          timeLabel="16:33"
        />
        <ThemedText style={styles.sectionLabel} type="captionBold">Message bubble wrapping</ThemedText>
        <DateSeparator label={state === 'worst' ? 'Monday, September 30' : 'Today'} />
        <View style={styles.incomingRow}>
          <ColoredAvatar label={state === 'worst' ? 'Aleksandra Wiśniewska-Kowalczyk' : 'Mateo Chen'} seed="preview-sender" size={32} />
          <MessageBubbleFrame isOwnMessage={false}>
            <ThemedText style={{ color: theme.accentStrong }} type="smallBold">
              {state === 'worst' ? 'Aleksandra Wiśniewska-Kowalczyk' : 'Mateo Chen'}
            </ThemedText>
            <MessageText body={state === 'worst'
              ? 'Please review the Q3 handoff, confirm the owner for the Patient Portal release, and share any accessibility issues before Friday.'
              : 'The latest handoff is ready to review.'} />
            <View style={styles.messageDelivery}>
              <MessageDeliveryMeta isOwnMessage={false} timeLabel={state === 'worst' ? '23:58' : '16:30'} />
            </View>
          </MessageBubbleFrame>
        </View>
        <View style={styles.messageBubbleRow}>
          <MessageBubbleFrame isOwnMessage>
            <MessageText body={state === 'worst'
              ? 'Aleksandra Wisniewska-Kowalczyk shared the revised Patient Portal release plan with 1,283 readers. Please review the next release steps and confirm who owns the handoff before Friday.'
              : 'The latest handoff is ready to review.'} />
            <View style={styles.messageDelivery}>
              <MessageDeliveryMeta isOwnMessage readReceipt={deliveryReceipt(state)} timeLabel={state === 'worst' ? '23:59' : '16:31'} />
            </View>
          </MessageBubbleFrame>
        </View>
        <ThemedText style={styles.sectionLabel} type="captionBold">Voice message borders</ThemedText>
        <ThemedText accessibilityLabel="Voice action count" type="caption">{`Voice actions opened: ${voiceActionCount}`}</ThemedText>
        <MessageBubble
          contextActions={[{ icon: 'reply', label: 'Reply', onPress: () => undefined }]}
          isFirstInGroup
          isOwnMessage
          message={previewVoiceMessage('Aleksandra Kowalczyk', 'users:voice-preview-own')}
           onLongPress={() => setVoiceActionCount((count) => count + 1)}
          readReceipt={deliveryReceipt(state)}
          timeLabel="23:59"
        />
        <MessageBubble
          contextActions={[{ icon: 'reply', label: 'Reply', onPress: () => undefined }]}
          isFirstInGroup
          isOwnMessage={false}
          message={previewVoiceMessage('Mateo Chen', 'users:voice-preview-other')}
          timeLabel="23:58"
        />
        <ThemedText style={styles.sectionLabel} type="captionBold">Long text bubble width</ThemedText>
        <MessageBubble
          contextActions={[{ icon: 'reply', label: 'Reply', onPress: () => undefined }]}
          isFirstInGroup
          isOwnMessage
          message={previewTextMessage('You', 'messages:preview-own-text', state === 'worst' ? worstComposerDraft : 'The handoff is ready to review.')}
          readReceipt={deliveryReceipt(state)}
          timeLabel="23:59"
        />
        <MessageBubble
          contextActions={[{ icon: 'reply', label: 'Reply', onPress: () => undefined }]}
          isFirstInGroup
          isOwnMessage={false}
          message={previewTextMessage(
            state === 'worst' ? 'Aleksandra Wiśniewska-Kowalczyk' : 'Mateo Chen',
            'messages:preview-other-text',
            state === 'worst' ? worstComposerDraft : 'The handoff is ready to review.',
          )}
          timeLabel="23:58"
        />
        {state === 'worst' ? <>
          <ThemedText style={styles.sectionLabel} type="captionBold">Sent image with receipt inside the image</ThemedText>
          <MessageBubble
            contextActions={[]}
            isFirstInGroup
            isOwnMessage
            message={previewAttachmentMessage('You', 'messages:preview-image', 'Attached 1 image', [previewImageEntry])}
            onForwardMedia={() => undefined}
            readReceipt={deliveryReceipt(state)}
            timeLabel="16:31"
          />
          <ThemedText style={styles.sectionLabel} type="captionBold">Sent file download feedback</ThemedText>
          <MessageBubble
            contextActions={[]}
            isFirstInGroup
            isOwnMessage
            message={previewAttachmentMessage('You', 'messages:preview-file', 'Attached file', [previewLongFileEntry])}
            readReceipt={deliveryReceipt(state)}
            timeLabel="16:32"
          />
          <ThemedText style={styles.sectionLabel} type="captionBold">Conversation row interactions</ThemedText>
          <ThemedText accessibilityLiveRegion="polite" themeColor="textSecondary" type="caption">
            {`Existing thread route ${canOpenThread ? 'enabled' : 'disabled'}${releaseConfig.isLoading ? ' while release settings load' : ''}.`}
          </ThemedText>
          <ThreadRow
            contextActions={[]}
            isFirstInGroup
            isOwnMessage
            item={previewThreadRowItem(previewThreadImageMessage(), 'conversation-thread-image')}
            onLongPress={() => undefined}
            onOpenThread={canOpenThread ? () => {
              setThreadRouteStatus('Thread chip pressed. Requesting the thread route.');
              router.push(threadConversationHref(
                'projects:preview' as Id<'projects'>,
                'groups:preview' as Id<'groups'>,
                'channelThreads:preview-thread' as Id<'channelThreads'>,
              ));
            } : undefined}
            onSwipeForward={() => undefined}
            onSwipeReport={() => undefined}
            onSwipeReply={() => undefined}
            variant="conversation"
          />
          <ThemedText accessibilityLiveRegion="polite" themeColor="textSecondary" type="caption">{threadRouteStatus}</ThemedText>
          <ThemedText style={styles.sectionLabel} type="captionBold">Thread row image interaction</ThemedText>
          <ThreadRow
            contextActions={[]}
            isFirstInGroup
            isOwnMessage
            item={previewThreadRowItem(previewAttachmentMessage('You', 'messages:preview-thread-row-image', 'Attached 1 image', [previewImageEntry]), 'thread-image')}
            onLongPress={() => undefined}
            onSwipeForward={() => undefined}
            onSwipeReport={() => undefined}
            onSwipeReply={() => undefined}
            variant="thread"
          />
          <SelectionLayoutPreview worst={state === 'worst'} />
          <ThemedText style={styles.sectionLabel} type="captionBold">Delivered image proportions</ThemedText>
          {extremeImages(previewUri).map((image) => <ImageAttachments images={[image]} key={image.id} />)}
        </> : null}
      </ScrollView>
      <View accessibilityLabel="Attachment data states" accessibilityRole="tablist" style={[styles.toggle, { backgroundColor: theme.backgroundSelected, borderColor: theme.homeBorder }]}>
        <ScrollView contentContainerStyle={styles.toggleOptions} horizontal showsHorizontalScrollIndicator={false} style={styles.toggleScroll}>
        {STATES.map((value) => {
          const active = state === value;
          return <Pressable
            aria-selected={active}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            key={value}
            onPress={() => router.setParams({ data: value })}
            style={[styles.toggleButton, active && { backgroundColor: theme.homeSurface }]}
          >
            <ThemedText numberOfLines={1} style={{ color: active ? theme.text : theme.textSecondary }} type="captionBold">{STATE_LABELS[value]}</ThemedText>
          </Pressable>;
        })}
        </ScrollView>
      </View>
    </ThemedView>
  );
}

function fixtureAttachments(state: PreviewState, uri: string): PendingAttachment[] {
  if (state === 'empty') return [];
  if (state === 'offline') {
    return [
      {
        contentType: 'image/jpeg',
        filename: 'Offline Patient Portal handoff.jpg',
        height: 1200,
        id: 'offline-image',
        progress: 0,
        size: 1_240_000,
        uri,
        width: 1600,
      },
      {
        contentType: 'application/pdf',
        filename: 'Patient Portal release notes final review.pdf',
        id: 'offline-file',
        progress: 0,
        size: 842_100,
        uri,
      },
    ];
  }
  const count = state === 'ten' ? 10 : state === 'worst' ? 6 : state === 'demo' ? 2 : 1;
  const images = Array.from({ length: count }, (_, index) => {
    const wide = state === 'worst' && index === 0;
    const tall = state === 'worst' && index === 1;
    return {
      contentType: 'image/jpeg',
      filename: state === 'worst'
        ? `Q3 Board Deck — Patient Portal handoff image ${index + 1} revised for legal review.jpg`
        : `Photo ${index + 1}.jpg`,
      height: wide ? 200 : tall ? 4000 : 1200,
      id: `${state}-image-${index}`,
      progress: 0.45,
      size: state === 'worst' ? 99 * 1024 * 1024 : 1_240_000,
      uri,
      width: wide ? 4000 : tall ? 200 : 1600,
    };
  });
  return state === 'worst' ? [...images, {
    contentType: 'application/pdf',
    filename: 'Q3 Board Deck — FINAL (revised) v12 [approved by legal].pdf',
    id: 'worst-file',
    progress: 0.45,
    size: 99 * 1024 * 1024,
    uri,
  }] : images;
}

function extremeImages(uri: string): ViewableImage[] {
  return [
    { contentType: 'image/jpeg', filename: 'Q3-wide-image.jpg', height: 200, id: 'wide', originalUrl: null, previewHeight: null, previewUrl: null, previewWidth: null, size: 1200000, url: uri, width: 4000 },
    { contentType: 'image/jpeg', filename: 'Portrait-photo.jpg', height: 4000, id: 'tall', originalUrl: null, previewHeight: null, previewUrl: null, previewWidth: null, size: 1400000, url: uri, width: 200 },
  ];
}

function deliveryReceipt(state: PreviewState) {
  if (state === 'empty') return { readCount: 0, recipientCount: 0 };
  if (state === 'one') return { readCount: 0, recipientCount: 1 };
  if (state === 'ten') return { readCount: 10, recipientCount: 10 };
  if (state === 'worst') return { readCount: 1283, recipientCount: 1284 };
  return { readCount: 2, recipientCount: 6 };
}

const styles = StyleSheet.create({
  content: { gap: Spacing.two, padding: Spacing.four, paddingBottom: 96 },
  empty: { alignItems: 'center', borderRadius: Radius.large, borderWidth: StyleSheet.hairlineWidth, justifyContent: 'center', minHeight: 140 },
  messagePreview: { alignSelf: 'flex-end', borderRadius: Radius.large, gap: Spacing.one, maxWidth: '84%', paddingHorizontal: Spacing.two, paddingVertical: Spacing.two },
  messageBubbleRow: { alignItems: 'flex-end', width: '100%' },
  incomingRow: { alignItems: 'flex-start', flexDirection: 'row', gap: Spacing.one, width: '100%' },
  messageDelivery: { alignSelf: 'flex-end', marginTop: Spacing.half },
  sectionLabel: { marginTop: Spacing.four },
  screen: { flex: 1 },
  title: { ...Typography.titleLarge },
  toggle: { alignSelf: 'center', borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth, bottom: Spacing.four, maxWidth: 520, overflow: 'hidden', position: 'absolute', width: '96%' },
  toggleOptions: { alignItems: 'center', flexDirection: 'row', flexGrow: 1, gap: Spacing.half, justifyContent: 'center', padding: Spacing.one },
  toggleScroll: { maxWidth: '100%' },
  toggleButton: { alignItems: 'center', borderRadius: Radius.pill, justifyContent: 'center', minHeight: 36, paddingHorizontal: Spacing.two },
});

/** Uses the real message row and controls without authenticating or writing data. */
function SelectionLayoutPreview({ worst }: { worst: boolean }) {
  const theme = useTheme();
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [action, setAction] = useState('No selection action requested.');
  const samples = [
    { id: 'own-short', own: true, message: previewTextMessage('You', 'messages:layout-own-short', 'Hi') },
    { id: 'other-short', own: false, message: previewTextMessage('Jo', 'messages:layout-other-short', 'OK') },
    { id: 'own-portrait', own: true, message: previewAttachmentMessage('You', 'messages:layout-own-portrait', '', [{ attachment: { ...previewImageEntry.attachment, previewStatus: undefined, width: 900, height: 1600 }, url: previewUri }]) },
    { id: 'other-landscape', own: false, message: previewAttachmentMessage(worst ? 'Aleksandra Wiśniewska-Kowalczyk' : 'Mateo Chen', 'messages:layout-other-landscape', '', [{ attachment: { ...previewImageEntry.attachment, previewStatus: undefined, width: 1600, height: 900 }, url: previewUri }]) },
    { id: 'long-text', own: false, message: previewTextMessage(worst ? 'Aleksandra Wiśniewska-Kowalczyk' : 'Mateo Chen', 'messages:layout-long-text', worst ? worstComposerDraft : 'Please confirm the handoff before Friday.') },
    { id: 'voice', own: true, message: previewVoiceMessage('You', 'messages:layout-voice') },
    { id: 'file', own: true, message: previewAttachmentMessage('You', 'messages:layout-file', 'Attached file', [previewLongFileEntry]) },
    { id: 'deleted', own: true, message: previewDeletedMessage('You', 'messages:layout-deleted') },
  ];
  const canDelete = selected.length > 0 && selected.every((id) => samples.find((sample) => sample.id === id)?.own);
  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  const leaveSelection = () => { setSelectionMode(false); setSelected([]); };

  return <View testID="chat-layout-preview">
    <ThemedText style={styles.sectionLabel} type="captionBold">Selection and message layout</ThemedText>
    <Pressable accessibilityRole="button" onPress={() => { if (selectionMode) leaveSelection(); else setSelectionMode(true); }} style={{ minHeight: 44, justifyContent: 'center' }}>
      <ThemedText type="smallBold">{selectionMode ? 'Exit selection mode' : 'Enter selection mode'}</ThemedText>
    </Pressable>
    {selectionMode ? <View accessibilityLabel="Message selection toolbar" style={{ alignItems: 'center', flexDirection: 'row', gap: Spacing.two }}>
      <IconButton accessibilityLabel="Cancel fixture selection" appearance={Platform.OS === 'ios' ? 'glass' : 'surface'} icon="close" onPress={leaveSelection} />
      <View style={{ flex: 1 }} />
      <IconButton accessibilityLabel="Forward selected fixture messages" appearance={Platform.OS === 'ios' ? 'glass' : 'surface'} disabled={!selected.length} icon="forward" onPress={() => setAction(`Forward requested for ${selected.length} messages.`)} />
      <IconButton accessibilityLabel={`Delete ${selected.length} selected fixture messages`} appearance={Platform.OS === 'ios' ? 'glass' : 'surface'} count={selected.length} disabled={!canDelete} icon="trash-can-outline" onPress={() => setAction(`Delete requested for ${selected.length} messages.`)} />
    </View> : null}
    <ThemedText accessibilityLabel="Fixture selection action" style={{ color: theme.textSecondary }} type="caption">{action}</ThemedText>
    <View style={{ marginHorizontal: -Spacing.four }}>
      {samples.map((sample) => <View key={sample.id} testID={`chat-layout-${sample.id}`}>
        <ThreadRow
          contextActions={[{ icon: 'reply', label: 'Reply', onPress: () => setAction('Reply requested.') }]}
          isFirstInGroup
          isOwnMessage={sample.own}
          item={previewThreadRowItem(sample.message, sample.id)}
          onLongPress={() => { setSelectionMode(true); setSelected([sample.id]); }}
          onPressMessage={() => toggle(sample.id)}
          onSwipeForward={() => setAction('Forward requested.')}
          onSwipeReply={() => setAction('Reply requested.')}
          onSwipeReport={() => setAction('Report requested.')}
          readReceipts={{ recipientCount: 2, readThroughSequences: [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER] }}
          selected={selected.includes(sample.id)}
          selectionMode={selectionMode}
          variant="conversation"
        />
      </View>)}
    </View>
  </View>;
}
