const VIDEO_MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  '3gp': 'video/3gpp',
  m4v: 'video/x-m4v',
  mkv: 'video/x-matroska',
  mov: 'video/quicktime',
  mp4: 'video/mp4',
  webm: 'video/webm',
};

/** Recover a video MIME type when Android's document provider only reports a generic file type. */
export function documentAttachmentContentType(filename: string, mimeType?: string | null) {
  if (mimeType && mimeType !== 'application/octet-stream') return mimeType;
  const extension = filename.split('.').pop()?.toLowerCase();
  return (extension && VIDEO_MIME_BY_EXTENSION[extension]) || mimeType || 'application/octet-stream';
}
