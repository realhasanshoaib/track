import { afterEach, describe, expect, it, vi } from 'vitest';

const { openURL, isAvailableAsync, downloadFileAsync, shareAsync, platform } = vi.hoisted(() => ({
  downloadFileAsync: vi.fn(),
  isAvailableAsync: vi.fn(),
  openURL: vi.fn(),
  platform: { OS: 'web' },
  shareAsync: vi.fn(),
}));

vi.mock('react-native', () => ({
  Linking: { openURL },
  Platform: platform,
}));

vi.mock('expo-file-system', () => ({
  Directory: class { exists = false; create = vi.fn(); },
  File: class { static downloadFileAsync = downloadFileAsync; exists = false; uri = 'file:///cached-attachment'; },
  Paths: { cache: 'file:///cache' },
}));

vi.mock('expo-sharing', () => ({
  isAvailableAsync,
  shareAsync,
}));

import { attachmentActionError, shareAttachment } from './attachment-actions';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  openURL.mockReset();
  isAvailableAsync.mockReset();
  downloadFileAsync.mockReset();
  shareAsync.mockReset();
  platform.OS = 'web';
});

describe('shareAttachment on web', () => {
  it('downloads with the original filename and leaves the conversation open', async () => {
    const link = {
      click: vi.fn(),
      download: '',
      href: '',
      remove: vi.fn(),
      style: { display: '' },
    };
    const appendChild = vi.fn();
    const fetchAttachment = vi.fn().mockResolvedValue({
      blob: async () => new Blob(['attachment bytes'], { type: 'application/pdf' }),
      ok: true,
    });
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:attachment');
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL');

    vi.stubGlobal('document', {
      body: { appendChild },
      createElement: vi.fn(() => link),
    });
    vi.stubGlobal('fetch', fetchAttachment);
    vi.stubGlobal('window', {
      setTimeout: vi.fn((callback: () => void) => {
        callback();
        return 1;
      }),
    });

    await shareAttachment({
      cacheKey: 'attachment-1',
      contentType: 'application/pdf',
      filename: 'Q3 Board Deck — final.pdf',
      url: 'https://files.example.test/attachment-1',
    });

    expect(fetchAttachment).toHaveBeenCalledWith(
      'https://files.example.test/attachment-1',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(createObjectUrl).toHaveBeenCalledOnce();
    expect(appendChild).toHaveBeenCalledWith(link);
    expect(link.download).toBe('Q3 Board Deck — final.pdf');
    expect(link.href).toBe('blob:attachment');
    expect(link.click).toHaveBeenCalledOnce();
    expect(link.remove).toHaveBeenCalledOnce();
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:attachment');
    expect(openURL).not.toHaveBeenCalled();
    expect(isAvailableAsync).not.toHaveBeenCalled();
  });

  it('reports failed downloads without navigating away', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    await expect(shareAttachment({
      cacheKey: 'attachment-2',
      contentType: 'image/jpeg',
      filename: 'photo.jpg',
      url: 'https://files.example.test/missing',
    })).rejects.toThrow('attachment_download_failed');

    expect(openURL).not.toHaveBeenCalled();
  });

  it('stops a stalled download so the sent-file card can leave its loading state', async () => {
    vi.useFakeTimers();
    const request = { signal: null as AbortSignal | null };
    vi.stubGlobal('fetch', vi.fn((_url: string, options?: RequestInit) => {
      request.signal = options?.signal ?? null;
      return new Promise<Response>((_resolve, reject) => {
        request.signal?.addEventListener('abort', () => reject(request.signal?.reason), { once: true });
      });
    }));

    const result = shareAttachment({
      cacheKey: 'attachment-3',
      contentType: 'application/pdf',
      filename: 'stalled.pdf',
      url: 'https://files.example.test/stalled',
    }).then(
      () => ({ status: 'resolved' as const }),
      (error: unknown) => ({ status: 'rejected' as const, message: error instanceof Error ? error.message : String(error) }),
    );

    await vi.advanceTimersByTimeAsync(120_000);

    const outcome = await Promise.race([result, Promise.resolve({ status: 'still-pending' as const })]);
    expect(request.signal?.aborted).toBe(true);
    expect(outcome).toEqual({ status: 'rejected', message: 'attachment_download_timeout' });
  });

  it('also aborts a stalled native download before opening the share sheet', async () => {
    vi.useFakeTimers();
    platform.OS = 'android';
    isAvailableAsync.mockResolvedValue(true);
    const request = { signal: null as AbortSignal | null };
    downloadFileAsync.mockImplementation((_url: string, _destination: unknown, options?: { signal?: AbortSignal }) => {
      request.signal = options?.signal ?? null;
      return new Promise((_resolve, reject) => {
        request.signal?.addEventListener('abort', () => reject(request.signal?.reason), { once: true });
      });
    });

    const result = shareAttachment({
      cacheKey: 'attachment-4',
      contentType: 'application/pdf',
      filename: 'stalled-native.pdf',
      url: 'https://files.example.test/stalled-native',
    }).then(
      () => ({ status: 'resolved' as const }),
      (error: unknown) => ({ status: 'rejected' as const, message: error instanceof Error ? error.message : String(error) }),
    );

    await vi.advanceTimersByTimeAsync(120_000);

    const outcome = await Promise.race([result, Promise.resolve({ status: 'still-pending' as const })]);
    expect(request.signal?.aborted).toBe(true);
    expect(outcome).toEqual({ status: 'rejected', message: 'attachment_download_timeout' });
    expect(shareAsync).not.toHaveBeenCalled();
  });

  it('turns a download timeout into a clear retry message', () => {
    expect(attachmentActionError(new Error('attachment_download_timeout')))
      .toBe('The download took too long. Check your connection and try again.');
  });
});
