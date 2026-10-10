import type { PropsWithChildren } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AttachmentList } from '@/components/chat/attachment-list';
import { MessageDeliveryMeta } from '@/components/chat/message-delivery-meta';
import { MessageContextMenu } from '@/components/chat/message-context-menu';
import { MessageText } from '@/components/chat/message-text';
import { hasReadyAttachmentPreview } from '@/components/chat/types';
import type { AttachmentWithUrl, DetailedMessage } from '@/components/chat/types';
import { ColoredAvatar } from '@/components/colored-avatar';
import type { MessageAction } from '@/components/message-actions';
import { PlatformIcon } from '@/components/platform-icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, TouchTarget } from '@/constants/theme';
import { isAudioAttachment, isAutoAttachmentBody, isImageAttachment } from '@/lib/attachment-presentation';
import { hapticLight } from '@/lib/haptics';
import { useTheme } from '@/hooks/use-theme';
import { displayText } from '@/lib/display-text';

const AVATAR_SIZE = 32;
/** Text beside media uses a small inset while images meet the bubble edge. */
const MEDIA_PAD = 3;

type BubbleFrameProps = PropsWithChildren<{
  bareMedia?: boolean;
  hasMedia?: boolean;
  highlighted?: boolean;
  isOwnMessage: boolean;
  selected?: boolean;
  onLongPress?: () => void;
}>;

/** Shared visual shell for confirmed and optimistic outgoing messages. */
export function MessageBubbleFrame({
  bareMedia = false,
  children,
  hasMedia = false,
  highlighted = false,
  isOwnMessage,
  onLongPress,
  selected = false,
}: BubbleFrameProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessible={false}
      onLongPress={onLongPress}
      style={[
        styles.bubble,
        hasMedia ? styles.bubbleMedia : styles.bubbleText,
        {
          alignSelf: isOwnMessage ? 'flex-end' : 'flex-start',
          backgroundColor: bareMedia ? 'transparent' : selected ? theme.backgroundSelected : isOwnMessage ? theme.bubbleOwn : theme.bubbleOther,
          borderColor: bareMedia ? 'transparent' : selected || highlighted ? theme.accentStrong : theme.messageBubbleBorder,
          borderWidth: bareMedia ? 0 : selected || highlighted ? 2 : 1,
          boxShadow: bareMedia ? 'none' : '0 1px 2px rgba(0,0,0,0.06)',
          maxWidth: '84%',
        },
        bareMedia && styles.bubbleBare,
        isOwnMessage ? styles.tailOwn : styles.tailOther,
      ]}>
      {children}
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
  contextActions?: MessageAction[];
  onOpenForwardSource?: () => void;
  onForwardMedia?: () => void;
  onLongPress?: () => void;
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
  contextActions,
  onOpenForwardSource,
  onForwardMedia,
  onLongPress,
  onOpenThread,
  onPressReply,
  timeLabel,
}: Props) {
  const theme = useTheme();
  const name = message.author?.displayName ?? 'Member';
  const authorId = message.author?._id ?? name;
  const isDeleted = Boolean(message.message.deletedAt);
  const rawBody = displayText(message.message.body.trim());
  const body = message.attachments.length && isAutoAttachmentBody(rawBody) ? '' : rawBody;
  const hasImage = message.attachments.some(isRenderableImage);
  const hasVoiceNote = message.attachments.some(
    ({ attachment, url }) => url && isAudioAttachment(attachment),
  );
  const showHeader = isFirstInGroup && !isOwnMessage && !hasVoiceNote;
  const hasMedia = hasImage || hasVoiceNote;
  const mediaClosesBubble =
    hasImage &&
    !body &&
    !message.channelThread &&
    message.attachments.every(isRenderableImage);
  const voiceClosesBubble =
    hasVoiceNote &&
    !body &&
    !message.channelThread &&
    message.attachments.every(({ attachment, url }) => url && isAudioAttachment(attachment));
  const showMediaForward = hasImage && !isDeleted && !selected && Boolean(onForwardMedia);
  const imageDeliveryMeta = mediaClosesBubble ? (
    <MessageDeliveryMeta isDeleted={isDeleted} isOwnMessage={isOwnMessage} readReceipt={readReceipt} timeLabel={timeLabel} tone="media" />
  ) : undefined;
  const voiceDeliveryMeta = voiceClosesBubble ? (
    <MessageDeliveryMeta isDeleted={isDeleted} isOwnMessage={isOwnMessage} readReceipt={readReceipt} timeLabel={timeLabel} tone="voice" />
  ) : undefined;
  return (
    <View pointerEvents="box-none" style={[styles.row, isFirstInGroup && styles.rowFirst, isOwnMessage ? styles.rowOwn : styles.rowOther]}>
      {isOwnMessage || hasVoiceNote ? null : isFirstInGroup ? (
        <ColoredAvatar label={name} seed={authorId} size={AVATAR_SIZE} />
      ) : (
        <View style={styles.avatarSpacer} />
      )}
      {showMediaForward && isOwnMessage ? <ForwardMediaButton onPress={onForwardMedia} /> : null}
      <MessageContextMenu actions={isDeleted ? [] : contextActions ?? []}>
        <MessageBubbleFrame
          bareMedia={voiceClosesBubble}
          hasMedia={hasMedia}
          highlighted={highlighted}
          isOwnMessage={isOwnMessage}
          onLongPress={isDeleted ? undefined : onLongPress}
          selected={selected}>
        {showHeader ? (
          <View style={[
            styles.header,
            isOwnMessage && styles.headerOwn,
            hasMedia && styles.inset,
            hasMedia && styles.insetTop,
          ]}>
            <ThemedText numberOfLines={2} style={styles.authorName} type="smallBold">
              {name}
            </ThemedText>
          </View>
        ) : null}

        {isDeleted ? (
          <View style={styles.deletedRow}>
            <PlatformIcon color={theme.textTertiary} name="block" size={16} />
            <ThemedText style={styles.deletedCopy} themeColor="textSecondary" type="small">
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
            onLongPress={onLongPress}
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
            imageDeliveryMeta={imageDeliveryMeta}
            isOwnMessage={isOwnMessage}
            onLongPress={onLongPress}
            senderAvatarUrl={message.authorAvatarUrl}
            senderName={name}
            voiceDeliveryMeta={voiceDeliveryMeta}
          />
        ) : null}

        {body ? (
          <View style={hasMedia ? styles.inset : undefined}>
            <MessageText body={body} />
          </View>
        ) : null}
        </>}

        {message.channelThread ? (
          <Pressable
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
              <ThemedText numberOfLines={1} type="captionBold">
                {message.channelThread.name}
              </ThemedText>
              <ThemedText numberOfLines={1} themeColor="textSecondary" type="caption">
                {`${message.channelThread.replyCount} ${
                  message.channelThread.replyCount === 1 ? 'reply' : 'replies'
                }${message.channelThread.status === 'archived' ? ' · Archived' : ''}`}
              </ThemedText>
            </View>
            {onOpenThread ? (
              <PlatformIcon color={theme.textTertiary} name="chevron-right" size={16} />
            ) : null}
          </Pressable>
        ) : null}

        {!mediaClosesBubble && !voiceClosesBubble ? <View style={[styles.timeMeta, hasMedia && styles.mediaFooter]}>
          <MessageDeliveryMeta isDeleted={isDeleted} isOwnMessage={isOwnMessage} readReceipt={readReceipt} timeLabel={timeLabel} />
        </View> : null}
        </MessageBubbleFrame>
      </MessageContextMenu>
      {showMediaForward && !isOwnMessage ? <ForwardMediaButton onPress={onForwardMedia} /> : null}
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
        backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElevated,
        borderColor: theme.homeBorder,
      }]}
    >
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
  deletedRow: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two, minHeight: 24, paddingVertical: Spacing.one },
  bubble: {
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.xlarge,
    flexShrink: 1,
    gap: Spacing.one,
    maxWidth: '84%',
  },
  bubbleMedia: {
    overflow: 'hidden',
  },
  bubbleBare: {
    borderRadius: 0,
    overflow: 'visible',
  },
  bubbleText: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
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
    paddingHorizontal: 5,
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
  },
  rowFirst: { marginTop: Spacing.three },
  rowOther: {
    justifyContent: 'flex-start',
  },
  rowOwn: {
    justifyContent: 'flex-end',
  },
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
    alignSelf: 'flex-end',
    flexDirection: 'row',
    gap: 0,
    marginTop: Spacing.half,
  },
  mediaFooter: { alignSelf: 'stretch', marginHorizontal: MEDIA_PAD },
});
