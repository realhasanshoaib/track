import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { FileAttachment } from '@/components/chat/file-attachment';
import { ImageAttachments } from '@/components/chat/image-attachment';
import { VideoAttachment } from '@/components/chat/video-attachment';
import { hasReadyAttachmentPreview } from '@/components/chat/types';
import type { AttachmentWithUrl, ViewableImage } from '@/components/chat/types';
import { VoiceNotePlayer } from '@/components/chat/voice-note-player';
import { Radius, Spacing } from '@/constants/theme';
import { isAudioAttachment, isImageAttachment, isVideoAttachment } from '@/lib/attachment-presentation';

import type { Doc } from '../../../../../convex/_generated/dataModel';

type PlayableVoiceNote = { attachment: Doc<'attachments'>; url: string };

/**
 * Splits a message's attachments into the three presentations they deserve:
 * an image grid, voice note players, and file cards. Anything without a signed
 * URL falls back to the file card, which states that it is unavailable.
 */
export function AttachmentList({
  attachments,
  videoCaptionAttached = false,
  imageDeliveryAccessibilityLabel,
  imageDeliveryMeta,
  isOwnMessage,
  onForwardMedia,
  onLongPress,
  selectionMode = false,
  senderAvatarUrl,
  senderName,
  videoDeliveryAccessibilityLabel,
  videoDeliveryMeta,
  voiceDeliveryMeta,
}: {
  attachments: AttachmentWithUrl[];
  videoCaptionAttached?: boolean;
  imageDeliveryAccessibilityLabel?: string;
  imageDeliveryMeta?: ReactNode;
  isOwnMessage: boolean;
  onForwardMedia?: () => void;
  onLongPress?: () => void;
  selectionMode?: boolean;
  senderAvatarUrl?: string | null;
  senderName: string;
  videoDeliveryAccessibilityLabel?: string;
  videoDeliveryMeta?: ReactNode;
  voiceDeliveryMeta?: ReactNode;
}) {
  const images: ViewableImage[] = [];
  const videos: AttachmentWithUrl[] = [];
  const voiceNotes: PlayableVoiceNote[] = [];
  const files: AttachmentWithUrl[] = [];

  for (const entry of attachments) {
    const { attachment, url } = entry;
    if (isImageAttachment(attachment.contentType)) {
      // A private derivative can remain available while the original signed
      // URL is temporarily unavailable. Keep the image surface useful in
      // that state; the viewer/share action will use the original only when
      // one is present.
      const preview = hasReadyAttachmentPreview(entry) ? entry : null;
      const displayUrl = url ?? preview?.previewUrl ?? null;
      if (!displayUrl) {
        files.push(entry);
        continue;
      }
      images.push({
        contentType: attachment.contentType,
        filename: attachment.filename,
        height: preview?.height ?? attachment.height ?? null,
        id: attachment._id,
        originalUrl: url,
        previewHeight: preview?.previewHeight ?? null,
        previewUrl: preview?.previewUrl ?? null,
        previewWidth: preview?.previewWidth ?? null,
        size: attachment.size,
        url: displayUrl,
        width: preview?.width ?? attachment.width ?? null,
      });
      continue;
    }
    if (isVideoAttachment(attachment.contentType)) {
      videos.push(entry);
      continue;
    }
    if (!url) {
      files.push(entry);
      continue;
    }
    if (isAudioAttachment(attachment)) {
      voiceNotes.push({ attachment, url });
      continue;
    }
    files.push(entry);
  }

  return (
    <View style={styles.stack}>
      {images.length ? (
        <ImageAttachments
          deliveryAccessibilityLabel={imageDeliveryAccessibilityLabel}
          deliveryMeta={imageDeliveryMeta}
          images={images}
          onLongPress={onLongPress}
          selectionMode={selectionMode}
        />
      ) : null}
      {videos.map((entry, index) => (
        <VideoAttachment
          attachment={entry.attachment}
          captionAttached={videoCaptionAttached && index === videos.length - 1}
          deliveryAccessibilityLabel={index === videos.length - 1 ? videoDeliveryAccessibilityLabel : undefined}
          deliveryMeta={index === videos.length - 1 ? videoDeliveryMeta : undefined}
          key={entry.attachment._id}
          onLongPress={onLongPress}
          onForward={onForwardMedia}
          selectionMode={selectionMode}
          previewUrl={entry.previewUrl}
          url={entry.url}
        />
      ))}
      {voiceNotes.map(({ attachment, url }, index) => (
        <View
          key={attachment._id}
          style={[
            styles.voiceNoteClip,
            isOwnMessage ? styles.voiceNoteOwn : styles.voiceNoteOther,
            { alignSelf: isOwnMessage ? 'flex-end' : 'flex-start' },
          ]}>
          <VoiceNotePlayer
            attachment={attachment}
            deliveryMeta={index === voiceNotes.length - 1 ? voiceDeliveryMeta : undefined}
            isOwnMessage={isOwnMessage}
            onLongPress={onLongPress}
            selectionMode={selectionMode}
            senderAvatarUrl={senderAvatarUrl}
            senderName={senderName}
            url={url}
          />
        </View>
      ))}
      {files.map(({ attachment, url }) => (
        <FileAttachment
          attachment={attachment}
          key={attachment._id}
          onLongPress={onLongPress}
          url={url}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  voiceNoteClip: {
    borderRadius: Radius.large,
    overflow: 'hidden',
  },
  voiceNoteOther: {
    borderBottomLeftRadius: 0,
  },
  voiceNoteOwn: {
    borderBottomRightRadius: 0,
  },
  stack: {
    gap: Spacing.two,
  },
});
