import { useRef, type KeyboardEvent, type PropsWithChildren, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Pressable as GesturePressable } from 'react-native-gesture-handler';

import { AttachmentList } from '@/components/chat/attachment-list';
import { MessageDeliveryMeta } from '@/components/chat/message-delivery-meta';
import { MessageContextMenu } from '@/components/chat/message-context-menu';
import {
  MESSAGE_MAX_WIDTH_RATIO,
  MESSAGE_SELECTION_INDICATOR_SIZE,
  MESSAGE_WIDE_TEXT_MIN_LENGTH,
} from '@/components/chat/message-layout';
import { MessageText } from '@/components/chat/message-text';
import { hasReadyAttachmentPreview } from '@/components/chat/types';
import type { AttachmentWithUrl, DetailedMessage } from '@/components/chat/types';
import { ColoredAvatar } from '@/components/colored-avatar';
import { IOSGlassMaterial } from '@/components/ios-glass-material';
import type { MessageAction } from '@/components/message-actions';
import { PlatformIcon } from '@/components/platform-icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, TouchTarget } from '@/constants/theme';
import { hasPlayableAudioAttachment, isAudioAttachment, isAutoAttachmentBody, isImageAttachment } from '@/lib/attachment-presentation';
import { hapticLight } from '@/lib/haptics';
import { useTheme } from '@/hooks/use-theme';
import { displayText } from '@/lib/display-text';
import { messageDeliveryAccessibilityLabel } from '@/lib/message-receipt';

const AVATAR_SIZE = 32;
/** Text beside media uses a small inset while images meet the bubble edge. */
const MEDIA_PAD = Spacing.two;

type BubbleFrameProps = PropsWithChildren<{
  afterContent?: ReactNode;
  bareMedia?: boolean;
  compact?: boolean;
  hasMedia?: boolean;
  highlighted?: boolean;
  selectionLabel?: string;
  isOwnMessage: boolean;
  wideText?: boolean;
  selected?: boolean;
  selectionMode?: boolean;
  onLongPress?: () => void;
  onPress?: () => void;
}>;

/** Shared visual shell for confirmed and optimistic outgoing messages. */
export function MessageBubbleFrame({
  afterContent,
  bareMedia = false,
  children,
  compact = false,
  hasMedia = false,
  highlighted = false,
  isOwnMessage,
  selectionLabel,
  wideText = false,
  onLongPress,
  onPress,
  selectionMode = false,
  selected = false,
}: BubbleFrameProps) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const longPressHandled = useRef(false);
  const transparentBareMedia = bareMedia && !highlighted;
  // The selection rail is outside the bubble. Keep the bubble's measured width
  // unchanged when selection mode appears so message text never rewraps.
  const maxWidth = Math.min(width * MESSAGE_MAX_WIDTH_RATIO, 560);

  return (
    <Pressable
      testID="message-bubble"
      accessible={selectionMode && Boolean(onPress)}
      accessibilityLabel={selectionMode && onPress ? `${selected ? 'Deselect' : 'Select'} ${selectionLabel ?? 'message'}` : undefined}
      accessibilityRole={selectionMode && onPress ? 'checkbox' : undefined}
      accessibilityState={selectionMode && onPress ? { checked: selected } : undefined}
      aria-checked={selectionMode && onPress ? selected : undefined}
      onLongPress={onLongPress ? () => {
        longPressHandled.current = true;
        onLongPress();
      } : undefined}
      onPress={onPress ? () => {
        if (longPressHandled.current) {
          longPressHandled.current = false;
          return;
        }
        onPress();
      } : undefined}
      onPressIn={() => { longPressHandled.current = false; }}
      style={[
        styles.bubble,
        hasMedia ? styles.bubbleMedia : compact ? styles.bubbleTextCompact : styles.bubbleText,
        {
          alignSelf: isOwnMessage ? 'flex-end' : 'flex-start',
          backgroundColor: transparentBareMedia ? 'transparent' : selected || highlighted ? theme.backgroundSelected : isOwnMessage ? theme.bubbleOwn : theme.bubbleOther,
          borderColor: transparentBareMedia ? 'transparent' : selected || highlighted ? theme.accentStrong : theme.hairline,
          borderWidth: transparentBareMedia ? 0 : StyleSheet.hairlineWidth,
          boxShadow: 'none',
          maxWidth,
          width: wideText ? maxWidth : undefined,
        },
        transparentBareMedia && styles.bubbleBare,
        isOwnMessage ? styles.tailOwn : styles.tailOther,
      ]}
    >
      <View pointerEvents={selectionMode ? 'none' : 'auto'} style={styles.bubbleBody}>{children}</View>
      {afterContent ? <View pointerEvents={selectionMode ? 'none' : 'auto'}>{afterContent}</View> : null}
    </Pressable>
  );
}

type Props = {
  highlighted?: boolean;
  isFirstInGroup: boolean;
  isOwnMessage: boolean;
  message: DetailedMessage;
  readReceipt?: { readCount: number; recipientCount: number };
  selected?: boolean;
  selectionMode?: boolean;
  contextActions?: MessageAction[];
  onOpenForwardSource?: () => void;
  onForwardMedia?: () => void;
  onLongPress?: () => void;
  onPressSelection?: () => void;
  onOpenThread?: () => void;
  onPressReply?: () => void;
  timeLabel: string;
};

export function MessageBubble({
  highlighted = false,
  isFirstInGroup,
  isOwnMessage,
  message,
  readReceipt,
  selected = false,
  selectionMode = false,
  contextActions,
  onOpenForwardSource,
  onForwardMedia,
  onLongPress,
  onPressSelection,
  onOpenThread,
  onPressReply,
  timeLabel,
}: Props) {
  const theme = useTheme();
  const lastVoiceHold = useRef(-Infinity);
  const name = message.author?.displayName ?? 'Member';
  const authorId = message.author?._id ?? name;
  const isDeleted = Boolean(message.message.deletedAt);
  const rawBody = displayText(message.message.body.trim());
  const attachmentNames = message.attachments.map(({ attachment }) => attachment.filename);
  const body = message.attachments.length && isAutoAttachmentBody(rawBody, attachmentNames) ? '' : rawBody;
  const selectionLabel = isDeleted
    ? isOwnMessage ? 'your deleted message' : `deleted message from ${name}`
    : `${isOwnMessage ? 'your message' : `message from ${name}`}: ${body || attachmentNames.join(', ') || 'attachment'}`;
  const selectionIndicator = selectionMode ? <MessageSelectionIndicator selected={selected} /> : null;
  const keyboardSelectionProps = Platform.OS === 'web' && selectionMode ? {
    onKeyDownCapture: (event: KeyboardEvent) => {
      if (event.key !== ' ' && event.key !== 'Enter') return;
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) onPressSelection?.();
    },
  } : {};
  const hasImage = !isDeleted && message.attachments.some(isRenderableImage);
  const hasVoiceNote = !isDeleted && hasPlayableAudioAttachment(message.attachments);
  const bubbleLongPress = Platform.OS === 'android' || !onLongPress ? undefined : () => {
    if (hasVoiceNote) {
      const now = performance.now();
      // The waveform gesture and RN parent can observe the same hold. A new
      // deliberate hold takes at least 500 ms, so coalesce only duplicate delivery.
      if (now - lastVoiceHold.current < 250) return;
      lastVoiceHold.current = now;
    }
    onLongPress();
  };
  const showHeader = isFirstInGroup && !isOwnMessage && !hasVoiceNote;
  const hasMedia = hasImage || hasVoiceNote;
  const imageOnly = hasImage && !body && !message.replyTo && !message.forwardedFrom
    && !message.channelThread && message.attachments.every(isRenderableImage);
  const voiceClosesBubble =
    hasVoiceNote &&
    !body &&
    !message.channelThread &&
    message.attachments.every(({ attachment, url }) => url && isAudioAttachment(attachment));
  const showMediaForward = hasImage && !isDeleted && !selected && Boolean(onForwardMedia);
  const voiceDeliveryMeta = voiceClosesBubble ? (
    <MessageDeliveryMeta isDeleted={isDeleted} isOwnMessage={isOwnMessage} readReceipt={readReceipt} timeLabel={timeLabel} tone="voice" />
  ) : undefined;
  const imageDeliveryMeta = hasImage ? (
    <MessageDeliveryMeta isDeleted={isDeleted} isOwnMessage={isOwnMessage} readReceipt={readReceipt} timeLabel={timeLabel} tone="media" />
  ) : undefined;
  const imageDeliveryAccessibilityLabel = hasImage
    ? messageDeliveryAccessibilityLabel({ isDeleted, isOwnMessage, readReceipt, timeLabel })
    : undefined;
  const threadControl = message.channelThread ? (
    <GesturePressable
      accessibilityHint={onOpenThread ? 'Opens the thread' : undefined}
      accessibilityLabel={`Thread ${message.channelThread.name}, ${message.channelThread.replyCount} ${
        message.channelThread.replyCount === 1 ? 'reply' : 'replies'
      }${message.channelThread.status === 'archived' ? ', archived' : ''}`}
      accessibilityRole={onOpenThread ? 'button' : 'text'}
      accessibilityState={{ disabled: !onOpenThread }}
      android_ripple={{ color: theme.backgroundSelected }}
      disabled={!onOpenThread}
      onLongPress={onLongPress}
      onPress={() => {
        if (!onOpenThread) return;
        hapticLight();
        onOpenThread();
      }}
      style={[
        styles.threadChip,
        hasMedia && styles.inset,
        { backgroundColor: theme.backgroundElevated, borderColor: theme.hairline },
      ]}>
      <PlatformIcon color={theme.textSecondary} name="thread" size={15} />
      <View style={styles.threadBody}>
        <ThemedText numberOfLines={1} type="captionBold">{message.channelThread.name}</ThemedText>
        <ThemedText numberOfLines={1} themeColor="textSecondary" type="caption">
          {`${message.channelThread.replyCount} ${message.channelThread.replyCount === 1 ? 'reply' : 'replies'}${message.channelThread.status === 'archived' ? ' · Archived' : ''}`}
        </ThemedText>
      </View>
      {onOpenThread ? <PlatformIcon color={theme.textTertiary} name="chevron-right" size={16} /> : null}
    </GesturePressable>
  ) : null;
  const timeMeta = !voiceClosesBubble && !hasImage ? (
    <View style={[styles.timeMeta, hasMedia && styles.mediaFooter]}>
      <MessageDeliveryMeta isDeleted={isDeleted} isOwnMessage={isOwnMessage} readReceipt={readReceipt} timeLabel={timeLabel} />
    </View>
  ) : null;
  const afterContent = threadControl || timeMeta ? (
    <View style={styles.bubbleAfterContent}>
      {threadControl}
      {timeMeta}
    </View>
  ) : null;
  return (
    <Pressable
      testID="message-row"
      {...keyboardSelectionProps}
      accessible={selectionMode}
      accessibilityLabel={selectionMode ? `${selected ? 'Deselect' : 'Select'} ${selectionLabel}` : undefined}
      accessibilityRole={selectionMode ? 'checkbox' : undefined}
      accessibilityState={selectionMode ? { checked: selected } : undefined}
      aria-checked={selectionMode ? selected : undefined}
      focusable={selectionMode}
      hitSlop={selectionMode ? { bottom: Spacing.one, top: Spacing.one } : undefined}
      onPress={selectionMode ? onPressSelection : undefined}
      style={[
      styles.row,
      selectionMode && styles.rowSelection,
    ]}>
      {selectionIndicator}
      <View
        accessibilityElementsHidden={selectionMode}
        importantForAccessibility={selectionMode ? 'no-hide-descendants' : 'auto'}
        pointerEvents={selectionMode ? 'none' : 'box-none'}
        style={[styles.rowContent, isOwnMessage ? styles.rowOwn : styles.rowOther]}
      >
      {selectionMode || isOwnMessage ? null : hasVoiceNote ? (
        <View style={styles.avatarSpacer} />
      ) : isFirstInGroup ? (
        <ColoredAvatar label={name} seed={authorId} size={AVATAR_SIZE} />
      ) : (
        <View style={styles.avatarSpacer} />
      )}
      {showMediaForward && !selectionMode && isOwnMessage ? <ForwardMediaButton onPress={onForwardMedia} /> : null}
      <View style={styles.messageColumn}>
      {showHeader && imageOnly ? <ThemedText numberOfLines={2} style={styles.imageAuthor} themeColor="textSecondary" type="smallBold">{name}</ThemedText> : null}
      <MessageContextMenu actions={selectionMode ? [] : contextActions ?? []} inlinePlayback={hasVoiceNote}>
        <MessageBubbleFrame
          afterContent={afterContent}
          bareMedia={voiceClosesBubble || imageOnly}
          compact={isDeleted}
          hasMedia={hasMedia}
          highlighted={highlighted}
          isOwnMessage={isOwnMessage}
          selectionLabel={selectionLabel}
          wideText={!isDeleted && body.length >= MESSAGE_WIDE_TEXT_MIN_LENGTH}
          onLongPress={selectionMode ? undefined : bubbleLongPress}
          selected={selected}
          selectionMode={selectionMode}
        >
          <View style={styles.bubbleBodyContent}>
        {showHeader && !imageOnly ? (
          <View style={[
            styles.header,
            isOwnMessage && styles.headerOwn,
            hasMedia && styles.inset,
            hasMedia && styles.insetTop,
          ]}>
            <ThemedText numberOfLines={isDeleted ? 1 : 2} style={[styles.authorName, { color: theme.textSecondary }]} type={isDeleted ? 'captionBold' : 'smallBold'}>
              {name}
            </ThemedText>
          </View>
        ) : null}

        {isDeleted ? (
          <View style={styles.deletedRow}>
            <PlatformIcon color={theme.textTertiary} name="block" size={16} />
            <ThemedText style={styles.deletedCopy} themeColor="textSecondary" type="label">
              {isOwnMessage ? 'You deleted this message' : 'This message was deleted'}
            </ThemedText>
          </View>
        ) : <>
          {message.replyTo ? (
            <Pressable
              accessibilityHint={onPressReply ? 'Shows the quoted message' : undefined}
              accessibilityLabel={`Replying to ${message.replyTo.authorName}: ${message.replyTo.body}`}
              accessibilityRole={onPressReply ? 'button' : 'text'}
              accessibilityState={{ disabled: !onPressReply }}
              disabled={!onPressReply}
              onLongPress={isDeleted || selectionMode ? undefined : bubbleLongPress}
              onPress={() => {
                if (!onPressReply) return;
                hapticLight();
                onPressReply();
              }}
              style={[
                styles.quote,
                hasMedia && styles.quoteInMedia,
                { backgroundColor: theme.backgroundElevated, borderLeftColor: theme.textTertiary },
              ]}>
              <View style={[styles.replyAuthorPill, { backgroundColor: theme.backgroundSelected }]}>
                <ThemedText numberOfLines={1} themeColor="textSecondary" type="captionBold">
                  {message.replyTo.authorName}
                </ThemedText>
              </View>
              <ThemedText numberOfLines={2} themeColor="textSecondary" type="caption">
                {displayText(message.replyTo.body)}
              </ThemedText>
            </Pressable>
          ) : null}

          {message.forwardedFrom ? (
            <ForwardedMessageBlock
              forwarded={message.forwardedFrom}
              onOpenSource={onOpenForwardSource}
            />
          ) : null}

          {message.attachments.length ? (
            <AttachmentList
              attachments={message.attachments}
              imageDeliveryAccessibilityLabel={imageDeliveryAccessibilityLabel}
              imageDeliveryMeta={imageDeliveryMeta}
              isOwnMessage={isOwnMessage}
              onLongPress={selectionMode ? undefined : bubbleLongPress}
              selectionMode={selectionMode}
              senderAvatarUrl={message.authorAvatarUrl}
              senderName={name}
              voiceDeliveryMeta={voiceDeliveryMeta}
            />
          ) : null}

          {body ? (
            <View style={[hasMedia && styles.inset, hasImage && styles.bodyWithImage, !hasMedia && (isOwnMessage ? styles.textBodyOwn : styles.textBodyOther)]}>
              <MessageText body={body} />
            </View>
          ) : null}
        </>}

          </View>
        </MessageBubbleFrame>
      </MessageContextMenu>
      </View>
      {showMediaForward && !selectionMode && !isOwnMessage ? <ForwardMediaButton onPress={onForwardMedia} /> : null}
      </View>
    </Pressable>
  );
}

function MessageSelectionIndicator({ selected }: { selected: boolean }) {
  const theme = useTheme();
  return (
    <View
      testID="message-selection-indicator"
      accessibilityElementsHidden
      pointerEvents="none"
      style={[
        styles.selectionIndicator,
        {
          // Message lists can mount many selection controls at once. Keep the
          // soft iOS pill treatment, but avoid a native GlassView per row: the
          // stacked materials make entering selection mode hitch on older devices.
          backgroundColor: selected ? theme.accentSoft : Platform.OS === 'ios' ? theme.backgroundElevated : theme.backgroundElement,
          borderColor: selected ? theme.accentStrong : theme.textTertiary,
        },
      ]}
    >
      {selected ? <PlatformIcon color={theme.accentStrong} name="check" size={13} weight="semibold" /> : null}
    </View>
  );
}

function isRenderableImage(entry: AttachmentWithUrl) {
  return isImageAttachment(entry.attachment.contentType) && (
    Boolean(entry.url) || (hasReadyAttachmentPreview(entry) && Boolean(entry.previewUrl))
  );
}

function ForwardMediaButton({ onPress }: { onPress?: () => void }) {
  const theme = useTheme();
  if (!onPress) return null;
  return (
    <Pressable
      accessibilityHint="Opens the Channel picker to forward this message"
      accessibilityLabel="Forward image message"
      accessibilityRole="button"
      hitSlop={4}
      onPress={() => {
        onPress();
      }}
      style={({ pressed }) => [styles.forwardMedia, {
        backgroundColor: pressed ? theme.backgroundSelected : Platform.OS === 'ios' ? 'transparent' : theme.backgroundElevated,
        borderColor: theme.homeBorder,
      }]}
    >
      {Platform.OS === 'ios' ? <IOSGlassMaterial style={styles.selectionMaterial} /> : null}
      <PlatformIcon color={theme.textSecondary} name="forward" size={17} />
    </Pressable>
  );
}

function ForwardedMessageBlock({
  forwarded,
  onOpenSource,
}: {
  forwarded: NonNullable<DetailedMessage['forwardedFrom']>;
  onOpenSource?: () => void;
}) {
  const theme = useTheme();
  const attachmentCount = forwarded.attachmentSnapshots.length;
  const sourceLabel = forwarded.sourceGroupName
    ? `Forwarded from ${forwarded.sourceGroupName}`
    : 'Forwarded message';

  return (
    <Pressable
      accessibilityHint={onOpenSource ? 'Opens the original message' : 'The original message is outside your access'}
      accessibilityLabel={`${sourceLabel}. ${forwarded.originalAuthorName}: ${forwarded.originalBody || 'Attachment message'}`}
      accessibilityRole={onOpenSource ? 'link' : 'text'}
      accessibilityState={{ disabled: !onOpenSource }}
      disabled={!onOpenSource}
      onPress={onOpenSource}
      style={[styles.forwarded, { backgroundColor: theme.backgroundElevated, borderColor: theme.hairline }]}>
      <View style={styles.forwardedLabel}>
        <PlatformIcon color={theme.textSecondary} name="forward" size={14} />
        <ThemedText themeColor="textSecondary" type="captionBold">{sourceLabel}</ThemedText>
      </View>
      <ThemedText type="captionBold">{forwarded.originalAuthorName}</ThemedText>
      <ThemedText numberOfLines={3} themeColor="textSecondary" type="small">
        {displayText(forwarded.originalBody) || 'Attachment message'}
      </ThemedText>
      {attachmentCount ? (
        <ThemedText themeColor="textSecondary" type="caption">
          {attachmentCount} copied {attachmentCount === 1 ? 'attachment' : 'attachments'}
        </ThemedText>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  authorName: {
    flexShrink: 1,
    minWidth: 0,
  },
  avatarSpacer: {
    width: AVATAR_SIZE,
  },
  forwarded: {
    alignSelf: 'stretch',
    borderLeftWidth: 2,
    borderRadius: Radius.small,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 3,
    margin: MEDIA_PAD,
    padding: Spacing.two,
  },
  forwardedLabel: { alignItems: 'center', flexDirection: 'row', gap: Spacing.one },
  forwardMedia: {
    alignItems: 'center',
    alignSelf: 'center',
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  deletedCopy: { flexShrink: 1, fontStyle: 'italic' },
  deletedRow: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two },
  bubble: {
    borderCurve: 'continuous',
    borderRadius: Radius.xlarge,
    flexShrink: 0,
    gap: Spacing.one,
    minWidth: 0,
  },
  bubbleAfterContent: { alignSelf: 'stretch', gap: Spacing.one },
  bubbleBody: { alignSelf: 'stretch', gap: Spacing.one, minWidth: 0 },
  bubbleBodyContent: { gap: Spacing.one, minWidth: 0 },
  bodyWithImage: { marginTop: Spacing.one },
  bubbleMedia: {
    overflow: 'hidden',
  },
  bubbleBare: {
    borderRadius: Radius.large,
    overflow: 'visible',
  },
  bubbleText: {
    gap: Spacing.half,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  bubbleTextCompact: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  companyBadge: {
    alignItems: 'flex-start',
    borderRadius: Radius.small,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    flexShrink: 1,
    gap: 3,
    minWidth: 0,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  companyName: {
    flexShrink: 1,
    minWidth: 0,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.two,
    minWidth: 0,
  },
  headerOwn: {
    justifyContent: 'flex-end',
  },
  inset: {
    paddingHorizontal: MEDIA_PAD,
  },
  insetTop: {
    paddingTop: MEDIA_PAD,
  },
  quote: {
    alignSelf: 'stretch',
    borderLeftWidth: 3,
    borderRadius: Radius.small,
    gap: 1,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  quoteInMedia: {
    marginHorizontal: MEDIA_PAD,
    marginTop: MEDIA_PAD,
  },
  replyAuthorPill: { alignSelf: 'flex-start', borderRadius: Radius.pill, maxWidth: '80%', paddingHorizontal: Spacing.two, paddingVertical: 2 },
  roleChip: {
    borderRadius: Radius.small,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  row: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    width: '100%',
  },
  rowContent: { alignItems: 'flex-start', flex: 1, flexDirection: 'row', minWidth: 0 },
  messageColumn: { flexShrink: 1, maxWidth: '100%', minWidth: 0 },
  imageAuthor: { marginBottom: Spacing.one, marginHorizontal: MEDIA_PAD },
  textBodyOwn: { alignSelf: 'flex-end', maxWidth: '100%', paddingRight: Spacing.half },
  textBodyOther: { alignSelf: 'flex-start', maxWidth: '100%', paddingLeft: Spacing.half },
  selectionIndicator: {
    alignItems: 'center',
    borderRadius: Radius.pill,
    borderCurve: 'continuous',
    borderWidth: 1.5,
    flexShrink: 0,
    height: MESSAGE_SELECTION_INDICATOR_SIZE,
    justifyContent: 'center',
    overflow: 'hidden',
    width: MESSAGE_SELECTION_INDICATOR_SIZE,
  },
  rowOther: {
    gap: 2,
    justifyContent: 'flex-start',
  },
  rowOwn: {
    gap: Spacing.two,
    justifyContent: 'flex-end',
  },
  rowSelection: { alignItems: 'center', minHeight: TouchTarget - Spacing.two },
  selectionMaterial: { borderCurve: 'continuous', borderRadius: Radius.pill },
  tailOther: {
    borderBottomLeftRadius: 0,
  },
  tailOwn: {
    borderBottomRightRadius: 0,
  },
  threadBubble: {
    maxWidth: '84%',
  },
  threadBody: {
    flexShrink: 1,
    gap: 1,
    minWidth: 0,
  },
  threadChip: {
    alignItems: 'center',
    alignSelf: 'stretch',
    borderRadius: Radius.medium,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.half,
    minHeight: TouchTarget,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  timeMeta: {
    alignItems: 'center',
    alignSelf: 'stretch',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 0,
    marginTop: 0,
  },
  mediaFooter: { alignSelf: 'stretch', justifyContent: 'flex-end', marginHorizontal: MEDIA_PAD },
});
