import { Pressable, StyleSheet, View } from 'react-native';

import { AttachmentList } from '@/components/chat/attachment-list';
import { MessageActionShortcut } from '@/components/chat/message-action-shortcut';
import { MessageText } from '@/components/chat/message-text';
import type { DetailedMessage } from '@/components/chat/types';
import { ColoredAvatar } from '@/components/colored-avatar';
import { PlatformIcon } from '@/components/platform-icon';
import { ThemedText } from '@/components/themed-text';
import { Colors, Radius, Spacing, TouchTarget } from '@/constants/theme';
import { isAutoAttachmentBody, isImageAttachment } from '@/lib/attachment-presentation';
import { hapticLight } from '@/lib/haptics';
import { useTheme } from '@/hooks/use-theme';
import { displayText } from '@/lib/display-text';

const AVATAR_SIZE = 32;
/** Media sits nearly edge-to-edge; text sections add the rest of the inset. */
const MEDIA_PAD = 3;

type Props = {
  highlighted?: boolean;
  isFirstInGroup: boolean;
  isOwnMessage: boolean;
  message: DetailedMessage;
  onOpenForwardSource?: () => void;
  onLongPress: () => void;
  onOpenThread?: () => void;
  onPressReply?: () => void;
  timeLabel: string;
  variant?: 'conversation' | 'thread';
};

export function MessageBubble({
  highlighted = false,
  isFirstInGroup,
  isOwnMessage,
  message,
  onOpenForwardSource,
  onLongPress,
  onOpenThread,
  onPressReply,
  timeLabel,
  variant = 'conversation',
}: Props) {
  const theme = useTheme();
  const name = message.author?.displayName ?? 'Member';
  const authorId = message.author?._id ?? name;
  const rawBody = displayText(message.message.body.trim());
  const body = message.attachments.length && isAutoAttachmentBody(rawBody) ? '' : rawBody;
  const showHeader = isFirstInGroup && !isOwnMessage;
  const isThreadReply = variant === 'thread';
  const hasMedia = message.attachments.some(
    ({ attachment, url }) => url && isImageAttachment(attachment.contentType),
  );
  // Media-closed bubbles overlay the timestamp on the image, WhatsApp-style.
  const mediaClosesBubble =
    hasMedia &&
    !body &&
    !message.channelThread &&
    message.attachments.every(
      ({ attachment, url }) => url && isImageAttachment(attachment.contentType),
    );
  return (
    <View pointerEvents="box-none" style={[styles.row, isFirstInGroup && styles.rowFirst, isOwnMessage ? styles.rowOwn : styles.rowOther]}>
      {isOwnMessage ? null : isFirstInGroup ? (
        <ColoredAvatar label={name} seed={authorId} size={AVATAR_SIZE} />
      ) : (
        <View style={styles.avatarSpacer} />
      )}
      <Pressable
        accessible={false}
        onLongPress={onLongPress}
        style={[
          styles.bubble,
          isThreadReply && styles.threadBubble,
          hasMedia ? styles.bubbleMedia : styles.bubbleText,
          {
            backgroundColor: isOwnMessage ? theme.bubbleOwn : theme.homeSurface,
            borderColor: highlighted ? theme.accentStrong : isOwnMessage ? 'transparent' : theme.homeBorder,
            borderWidth: highlighted ? 2 : StyleSheet.hairlineWidth,
          },
          isFirstInGroup && (isOwnMessage ? styles.tailOwn : styles.tailOther),
        ]}>
        {showHeader || isThreadReply ? (
          <View style={[
            styles.header,
            isOwnMessage && styles.headerOwn,
            hasMedia && styles.inset,
            hasMedia && styles.insetTop,
          ]}>
            {showHeader ? (
              <ThemedText numberOfLines={2} style={styles.authorName} type="smallBold">
                {name}
              </ThemedText>
            ) : null}
            {isThreadReply ? (
              <View style={styles.timeMeta}>
                <ThemedText style={styles.threadTime} themeColor="textTertiary" type="caption">{timeLabel}</ThemedText>
                <MessageActionShortcut authorName={name} onPress={onLongPress} timeLabel={timeLabel} />
              </View>
            ) : null}
          </View>
        ) : null}

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
          <AttachmentList attachments={message.attachments} onLongPress={onLongPress} />
        ) : null}

        {body ? (
          <View style={hasMedia ? styles.inset : null}>
            <View>
              <MessageText body={body} />
              {isThreadReply ? null : (
              <View style={styles.timeMeta}>
                <ThemedText style={styles.timeFooter} themeColor="textTertiary" type="caption">{timeLabel}</ThemedText>
                <MessageActionShortcut authorName={name} onPress={onLongPress} timeLabel={timeLabel} />
              </View>
              )}
            </View>
          </View>
        ) : null}

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

        {body || isThreadReply ? null : mediaClosesBubble ? (
          <View style={[styles.timeOverlay, { backgroundColor: theme.overlay }]}>
            <ThemedText style={styles.timeOverlayText} type="caption">{timeLabel}</ThemedText>
            <MessageActionShortcut authorName={name} onPress={onLongPress} overlay timeLabel={timeLabel} />
          </View>
        ) : (
          <View style={[styles.timeMeta, hasMedia && styles.inset]}>
            <ThemedText style={styles.timeFooter} themeColor="textTertiary" type="caption">{timeLabel}</ThemedText>
            <MessageActionShortcut authorName={name} onPress={onLongPress} timeLabel={timeLabel} />
          </View>
        )}
      </Pressable>
    </View>
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
  bubble: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.large,
    flexShrink: 1,
    gap: Spacing.one,
    maxWidth: '84%',
  },
  bubbleMedia: {
    padding: MEDIA_PAD,
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
    gap: Spacing.one,
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
    borderTopLeftRadius: Radius.small,
  },
  tailOwn: {
    borderTopRightRadius: Radius.small,
  },
  threadBubble: {
    maxWidth: '84%',
  },
  threadTime: {
    marginLeft: 'auto',
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
    marginTop: Spacing.one,
    minHeight: TouchTarget,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  timeFooter: {
    alignSelf: 'center',
  },
  timeMeta: {
    alignItems: 'center',
    alignSelf: 'flex-end',
    flexDirection: 'row',
    gap: 1,
  },
  timeOverlay: {
    alignItems: 'center',
    borderRadius: Radius.pill,
    bottom: MEDIA_PAD + 6,
    flexDirection: 'row',
    gap: 1,
    paddingHorizontal: 7,
    paddingVertical: 2,
    position: 'absolute',
    right: MEDIA_PAD + 6,
  },
  timeOverlayText: {
    color: Colors.dark.text,
  },
});
