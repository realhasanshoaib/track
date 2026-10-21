import type { IconName } from '@/components/platform-icon';

export function isImageAttachment(contentType: string) {
  return contentType.startsWith('image/');
}

export function isVideoAttachment(contentType: string) {
  return contentType.startsWith('video/');
}

export function isAudioAttachment(input: { contentType: string; kind?: string }) {
  return input.kind === 'voice_note' || input.contentType.startsWith('audio/');
}

export function hasPlayableAudioAttachment(attachments: readonly {
  attachment: { contentType: string; kind?: string };
  url?: string | null;
}[]) {
  return attachments.some(({ attachment, url }) => Boolean(url) && isAudioAttachment(attachment));
}

/**
 * The composer writes a short machine caption for an attachment-only message.
 * The extension fallback keeps an older named-file caption from rendering
 * beside its attachment.
 */
const AUTO_ATTACHMENT_BODY =
  /^(Voice note|Sent a voice note\.?|Attached \d+ (?:files|images?)|Attached file|Attached .+\.[a-z0-9]{1,6})$/i;

/**
 * The composer stores a machine caption when a message only has attachments.
 * Older messages can also store the attachment filename as the body. The
 * bubble renders the attachment itself, so neither generated value is needed
 * as message text.
 */
export function isAutoAttachmentBody(body: string, attachmentNames: readonly string[] = []) {
  const normalizedBody = body.trim().toLowerCase();
  return AUTO_ATTACHMENT_BODY.test(body.trim()) || attachmentNames.some((name) => name.trim().toLowerCase() === normalizedBody);
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The short kind label a document tile shows beside its size, e.g. "PDF". */
export function fileTypeLabel(input: { contentType: string; filename: string }) {
  const extension = input.filename.includes('.') ? input.filename.split('.').pop() : undefined;
  if (extension && extension.length <= 5) return extension.toUpperCase();
  const subtype = input.contentType.split('/')[1];
  const token = subtype?.split(/[.+]/).pop();
  return token ? token.toUpperCase() : 'FILE';
}

export function formatDuration(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

const EXTENSION_ICONS: Record<string, IconName> = {
  '7z': 'file-archive',
  csv: 'file-excel',
  doc: 'file-document-outline',
  docx: 'file-document-outline',
  gz: 'file-archive',
  pdf: 'file-pdf',
  rar: 'file-archive',
  tar: 'file-archive',
  xls: 'file-excel',
  xlsx: 'file-excel',
  zip: 'file-archive',
};

export function attachmentIcon(input: { contentType: string; filename: string }): IconName {
  if (isImageAttachment(input.contentType)) return 'image';
  if (isVideoAttachment(input.contentType)) return 'video';
  if (isAudioAttachment(input)) return 'file-music';
  const extension = input.filename.split('.').pop()?.toLowerCase();
  if (extension && EXTENSION_ICONS[extension]) return EXTENSION_ICONS[extension];
  if (input.contentType === 'application/pdf') return 'file-pdf';
  return 'file-document-outline';
}
