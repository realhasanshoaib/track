import { Pressable, StyleSheet, View } from 'react-native'
import { AttachmentList } from '@/components/chat/attachment-list'
import { MessageText } from '@/components/chat/message-text'
import type { DetailedMessage } from '@/components/chat/types'
import { ColoredAvatar } from '@/components/colored-avatar'
import { ThemedText } from '@/components/themed-text'
import { Colors, Radius, Spacing, TouchTarget } from '@/constants/theme'
import { isAutoAttachmentBody, isImageAttachment } from '@/lib/attachment-presentation'
import { hapticLight } from '@/lib/haptics'
import { useTheme } from '@/hooks/use-theme'
const AVATAR_SIZE = 32
/** Media sits nearly edge-to-edge; text sections add the rest of the inset. */
const MEDIA_PAD = 3
type Props = {
  isFirstInGroup: boolean
  isOwnMessage: boolean
  message: DetailedMessage
  onLongPress: () => void
  onPressReply?: () => void
  timeLabel: string
}
export function MessageBubble({
  isFirstInGroup,
  isOwnMessage,
  message,
  onLongPress,
  onPressReply,
  timeLabel,
}: Props) {
  const theme = useTheme()
  const name = message.author?.displayName ?? 'Member'
  const authorId = message.author?._id ?? name
  const rawBody = message.message.body.trim()
  const body = message.attachments.length && isAutoAttachmentBody(rawBody) ? '' : rawBody
  const showHeader = isFirstInGroup && !isOwnMessage
  const hasMedia = message.attachments.some(
    ({ attachment, url }) => url && isImageAttachment(attachment.contentType),
  )
  // Media-closed bubbles overlay the timestamp on the image, WhatsApp-style.
  const mediaClosesBubble = message.attachments.every(
    ({ attachment, url }) => url && isImageAttachment(attachment.contentType),
  )
  return (
    <View style={[styles.row, isOwnMessage ? styles.rowOwn : styles.rowOther]}>
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
          hasMedia ? styles.bubbleMedia : styles.bubbleText,
          { backgroundColor: isOwnMessage ? theme.bubbleOwn : theme.bubbleOther },
          isFirstInGroup && (isOwnMessage ? styles.tailOwn : styles.tailOther),
        ]}
      >
        {showHeader ? (
          <View style={[styles.header, hasMedia && styles.inset, hasMedia && styles.insetTop]}>
            <ThemedText numberOfLines={1} style={styles.authorName} type="smallBold">
              {name}
            </ThemedText>
            {message.authorRole ? (
              <View style={[styles.roleChip, { backgroundColor: theme.backgroundSelected }]}>
                <ThemedText numberOfLines={1} themeColor="textSecondary" type="captionBold">
                  {message.authorRole}
                </ThemedText>
              </View>
            ) : null}
            {null}
          </View>
        ) : null}

        {message.replyTo ? (
          <Pressable
            accessibilityHint={onPressReply ? 'Shows the quoted message' : undefined}
            accessibilityLabel={`Replying to ${message.replyTo.authorName}: ${message.replyTo.body}`}
            accessibilityRole={onPressReply ? 'button' : 'text'}
            disabled={!onPressReply}
            onLongPress={onLongPress}
            onPress={() => {
              if (!onPressReply) return
              hapticLight()
              onPressReply()
            }}
            style={[
              styles.quote,
              hasMedia && styles.quoteInMedia,
              { backgroundColor: theme.backgroundElevated, borderLeftColor: theme.textTertiary },
            ]}
          >
            <ThemedText numberOfLines={1} themeColor="textSecondary" type="captionBold">
              {message.replyTo.authorName}
            </ThemedText>
            <ThemedText numberOfLines={2} themeColor="textSecondary" type="caption">
              {message.replyTo.body}
            </ThemedText>
          </Pressable>
        ) : null}

        {message.attachments.length ? (
          <AttachmentList attachments={message.attachments} onLongPress={onLongPress} />
        ) : null}

        {body ? (
          <View style={hasMedia ? styles.inset : null}>
            <View style={styles.bodyWrap}>
              <MessageText
                body={body}
                suffix={
                  <ThemedText style={styles.timeSpacer} type="caption">
                    {`   ${timeLabel}`}
                  </ThemedText>
                }
              />
              <ThemedText
                accessibilityLabel={`Sent at ${timeLabel}`}
                style={styles.timeInline}
                themeColor="textSecondary"
                type="caption"
              >
                {timeLabel}
              </ThemedText>
            </View>
          </View>
        ) : null}

        {null}

        {body ? null : mediaClosesBubble ? (
          <View style={[styles.timeOverlay, { backgroundColor: theme.overlay }]}>
            <ThemedText
              accessibilityLabel={`Sent at ${timeLabel}`}
              style={styles.timeOverlayText}
              type="caption"
            >
              {timeLabel}
            </ThemedText>
          </View>
        ) : (
          <ThemedText
            accessibilityLabel={`Sent at ${timeLabel}`}
            style={[styles.timeFooter, hasMedia && styles.inset]}
            themeColor="textSecondary"
            type="caption"
          >
            {timeLabel}
          </ThemedText>
        )}
      </Pressable>
    </View>
  )
}
const styles = StyleSheet.create({
  authorName: {
    flexShrink: 1,
    minWidth: 0,
  },
  avatarSpacer: {
    width: AVATAR_SIZE,
  },
  bodyWrap: {
    position: 'relative',
  },
  bubble: {
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
    paddingVertical: 6,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.one,
    minWidth: 0,
  },
  inset: {
    paddingHorizontal: 5,
  },
  insetTop: {
    paddingTop: MEDIA_PAD,
  },
  quote: {
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
  threadBody: {
    flexShrink: 1,
    gap: 1,
    minWidth: 0,
  },
  threadChip: {
    alignItems: 'center',
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
    alignSelf: 'flex-end',
  },
  timeInline: {
    bottom: 1,
    position: 'absolute',
    right: 0,
  },
  timeOverlay: {
    borderRadius: Radius.pill,
    bottom: MEDIA_PAD + 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    position: 'absolute',
    right: MEDIA_PAD + 6,
  },
  timeOverlayText: {
    color: Colors.dark.text,
  },
  timeSpacer: {
    color: 'transparent',
  },
})
