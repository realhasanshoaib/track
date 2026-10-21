import { describe, expect, it } from 'vitest';

import { documentAttachmentContentType } from './video-file-type';

describe('documentAttachmentContentType', () => {
  it('recognizes common video extensions when a picker reports a generic MIME type', () => {
    expect(documentAttachmentContentType('clip.MP4', 'application/octet-stream')).toBe('video/mp4');
    expect(documentAttachmentContentType('camera.mov')).toBe('video/quicktime');
    expect(documentAttachmentContentType('recording.webm', null)).toBe('video/webm');
  });

  it('preserves a specific picker MIME type and leaves unknown files generic', () => {
    expect(documentAttachmentContentType('clip.mov', 'video/mp4')).toBe('video/mp4');
    expect(documentAttachmentContentType('notes.txt', 'text/plain')).toBe('text/plain');
    expect(documentAttachmentContentType('archive.bin', 'application/octet-stream')).toBe('application/octet-stream');
  });
});
