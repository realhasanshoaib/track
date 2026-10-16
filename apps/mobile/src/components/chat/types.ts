import type { Doc, Id } from '../../../../../convex/_generated/dataModel';

export type AttachmentReference = {
  attachment: Doc<'attachments'>;
  url: string | null;
};

type ReadyAttachmentWithUrl = AttachmentReference & {
  attachment: Doc<'attachments'> & { previewStatus: 'ready' };
  height: number;
  previewHeight: number;
  previewUrl: string | null;
  previewWidth: number;
  width: number;
};

type PendingAttachmentWithUrl = AttachmentReference & {
  attachment: Doc<'attachments'> & { previewStatus: 'pending' };
};

type FailedAttachmentWithUrl = AttachmentReference & {
  attachment: Doc<'attachments'> & { previewStatus: 'failed' };
};

type LegacyAttachmentWithUrl = AttachmentReference & {
  attachment: Doc<'attachments'> & { previewStatus?: undefined };
};

/** An attachment paired with scoped original/preview URLs from the conversation query. */
export type AttachmentWithUrl =
  | ReadyAttachmentWithUrl
  | PendingAttachmentWithUrl
  | FailedAttachmentWithUrl
  | LegacyAttachmentWithUrl;

export function hasReadyAttachmentPreview(
  entry: AttachmentWithUrl,
): entry is ReadyAttachmentWithUrl {
  return (
    entry.attachment.previewStatus === 'ready' &&
    'height' in entry &&
    typeof entry.height === 'number' &&
    'previewHeight' in entry &&
    typeof entry.previewHeight === 'number' &&
    'previewWidth' in entry &&
    typeof entry.previewWidth === 'number' &&
    'width' in entry &&
    typeof entry.width === 'number'
  );
}

export type DetailedMessage = {
  message: Doc<'messages'>;
  author: Doc<'users'> | null;
  authorRole?: Doc<'projectMembers'>['role'] | null;
  authorCompany?: { companyId: Id<'companies'>; displayName: string } | null;
  attachments: AttachmentWithUrl[];
  replyTo?: { messageId: Id<'messages'>; authorName: string; body: string; createdAt: number } | null;

};

/** An image that the full-screen viewer can present. */
export type ViewableImage = {
  contentType: string;
  filename: string;
  height: number | null;
  id: string;
  /** Signed original URL, when the original is still available to the viewer. */
  originalUrl: string | null;
  previewHeight: number | null;
  previewUrl: string | null;
  previewWidth: number | null;
  size: number;
  url: string;
  width: number | null;
};
