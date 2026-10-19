import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Id } from '../../../../convex/_generated/dataModel';
import {
  sendComposerMessage,
  type AttachmentUploadTarget,
  type UploadableFile,
} from './attachment-upload';

afterEach(() => vi.unstubAllGlobals());

function makeFile(id: string, filename: string): UploadableFile {
  return { contentType: 'text/plain', filename, id, uri: `file:///${filename}`, size: 4 };
}

function makeTarget(overrides: Partial<AttachmentUploadTarget> = {}): AttachmentUploadTarget {
  return {
    attachFile: vi.fn().mockResolvedValue(undefined),
    claimUploadIntent: vi.fn().mockResolvedValue({ storageId: 'storage-1' as Id<'_storage'> }),
    generateUploadUrl: vi.fn().mockResolvedValue({
      expiresAt: Date.now() + 60_000,
      intentId: 'intent-1' as Id<'messageUploadIntents'>,
      status: 'uploaded',
      storageId: 'storage-1' as Id<'_storage'>,
      uploadUrl: null,
    }),
    sendMessage: vi.fn().mockResolvedValue('message-1' as Id<'messages'>),
    ...overrides,
  };
}

describe('sendComposerMessage recovery', () => {
  it('rejects a failed text send so the Composer can keep and retry the draft', async () => {
    const target = makeTarget({ sendMessage: vi.fn().mockRejectedValue(new Error('offline')) });

    await expect(sendComposerMessage({
      attachments: [],
      body: 'Keep this question',
      idempotencyKey: 'send-key',
      replyToMessageId: 'reply-1' as Id<'messages'>,
      reportProgress: vi.fn(),
      target,
    })).rejects.toThrow('offline');

    expect(target.sendMessage).toHaveBeenCalledWith({
      body: 'Keep this question',
      idempotencyKey: 'send-key',
      replyToMessageId: 'reply-1',
    });
  });

  it('retries only failed attachments against the accepted message', async () => {
    let shouldFail = true;
    const originalFilename = 'Q3 Board Deck — FINAL (revised) v12 [approved by legal].pdf';
    const fetchFile = vi.fn().mockImplementation(() => Promise.resolve(new Response('file', { status: 200 })));
    vi.stubGlobal('fetch', fetchFile);
    const target = makeTarget({
      generateUploadUrl: vi.fn(async ({ filename }) => {
        if (filename === 'retry.txt' && shouldFail) throw new Error('upload failed');
        return {
          expiresAt: Date.now() + 60_000,
          intentId: `intent-${filename}` as Id<'messageUploadIntents'>,
          status: 'uploaded' as const,
          storageId: `storage-${filename}` as Id<'_storage'>,
          uploadUrl: null,
        };
      }),
    });
    const first = await sendComposerMessage({
      attachments: [makeFile('ok', originalFilename), makeFile('retry', 'retry.txt')],
      body: 'The caption stays on the original message',
      idempotencyKey: 'send-key',
      replyToMessageId: 'reply-1' as Id<'messages'>,
      reportProgress: vi.fn(),
      target,
    });

    expect(first).toEqual({ failedIds: ['retry'], messageId: 'message-1' });
    expect(target.sendMessage).toHaveBeenCalledTimes(1);
    expect(target.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      attachments: [expect.objectContaining({ filename: originalFilename, uploadIntentId: `intent-${originalFilename}` })],
    }));

    shouldFail = false;
    const retried = await sendComposerMessage({
      attachments: [makeFile('retry', 'retry.txt')],
      body: '',
      idempotencyKey: 'send-key',
      messageId: first.messageId,
      reportProgress: vi.fn(),
      target,
    });

    expect(retried).toEqual({ failedIds: [], messageId: 'message-1' });
    expect(target.sendMessage).toHaveBeenCalledTimes(1);
    expect(target.attachFile).toHaveBeenCalledTimes(1);
  });

  it('uses the injected native uploader without copying attachment bytes into a JS blob', async () => {
    const uploadFile = vi.fn().mockResolvedValue('uploaded-storage-id');
    const generateUploadUrl = vi.fn().mockResolvedValue({
      expiresAt: Date.now() + 60_000,
      intentId: 'intent-native' as Id<'messageUploadIntents'>,
      status: 'issued' as const,
      storageId: null,
      uploadUrl: 'https://uploads.example.test/native',
    });
    const target = makeTarget({
      generateUploadUrl,
      getFileSize: vi.fn().mockReturnValue(4),
      uploadFile,
    });
    const fetchFile = vi.fn(() => { throw new Error('JS blob path should not run'); });
    vi.stubGlobal('fetch', fetchFile);

    const result = await sendComposerMessage({
      attachments: [makeFile('native', 'photo.png')],
      body: '',
      idempotencyKey: 'send-native',
      reportProgress: vi.fn(),
      target,
    });

    expect(result).toEqual({ failedIds: [], messageId: 'message-1' });
    expect(generateUploadUrl).toHaveBeenCalledWith(expect.objectContaining({ size: 4 }));
    expect(uploadFile).toHaveBeenCalledWith(expect.objectContaining({
      contentType: 'text/plain',
      file: expect.objectContaining({ uri: 'file:///photo.png' }),
      url: 'https://uploads.example.test/native',
    }));
    expect(fetchFile).not.toHaveBeenCalled();
  });

  it('passes the uploaded storage id into the send mutation for atomic claiming', async () => {
    const uploadFile = vi.fn().mockResolvedValue('uploaded-storage-id');
    const generateUploadUrl = vi.fn().mockResolvedValue({
      expiresAt: Date.now() + 60_000,
      intentId: 'intent-atomic' as Id<'messageUploadIntents'>,
      status: 'issued' as const,
      storageId: null,
      uploadUrl: 'https://uploads.example.test/atomic',
    });
    const sendMessage = vi.fn().mockResolvedValue('message-atomic' as Id<'messages'>);
    const target = makeTarget({
      generateUploadUrl,
      getFileSize: vi.fn().mockReturnValue(4),
      sendMessage,
      uploadFile,
    });

    await sendComposerMessage({
      attachments: [makeFile('atomic', 'photo.jpg')],
      body: '',
      idempotencyKey: 'send-atomic',
      reportProgress: vi.fn(),
      target,
    });

    expect(target.claimUploadIntent).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      attachments: [expect.objectContaining({
        storageId: 'uploaded-storage-id',
        uploadIntentId: 'intent-atomic',
      })],
    }));
  });

  it('keeps uploaded bytes reusable if the message mutation fails', async () => {
    const claimUploadIntent = vi.fn().mockResolvedValue({ storageId: 'uploaded-storage-id' as Id<'_storage'> });
    const target = makeTarget({
      claimUploadIntent,
      generateUploadUrl: vi.fn().mockResolvedValue({
        expiresAt: Date.now() + 60_000,
        intentId: 'intent-recovery' as Id<'messageUploadIntents'>,
        status: 'issued' as const,
        storageId: null,
        uploadUrl: 'https://uploads.example.test/recovery',
      }),
      getFileSize: vi.fn().mockReturnValue(4),
      sendMessage: vi.fn().mockRejectedValue(new Error('mutation unavailable')),
      uploadFile: vi.fn().mockResolvedValue('uploaded-storage-id'),
    });

    await expect(sendComposerMessage({
      attachments: [makeFile('recovery', 'photo.jpg')],
      body: '',
      idempotencyKey: 'send-recovery',
      reportProgress: vi.fn(),
      target,
    })).rejects.toThrow('mutation unavailable');

    expect(claimUploadIntent).toHaveBeenCalledWith({
      intentId: 'intent-recovery',
      storageId: 'uploaded-storage-id',
    });
  });
});
