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
      attachments: [makeFile('ok', 'ok.txt'), makeFile('retry', 'retry.txt')],
      body: 'The caption stays on the original message',
      idempotencyKey: 'send-key',
      replyToMessageId: 'reply-1' as Id<'messages'>,
      reportProgress: vi.fn(),
      target,
    });

    expect(first).toEqual({ failedIds: ['retry'], messageId: 'message-1' });
    expect(target.sendMessage).toHaveBeenCalledTimes(1);

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
    expect(target.attachFile).toHaveBeenCalledTimes(2);
  });
});
