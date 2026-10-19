import { describe, expect, it, vi } from 'vitest';
import {
  chatImageAspectRatio,
  prepareChatImageDimensions,
  prepareChatImageForUpload,
  rememberChatImageDimensions,
} from './chat-image-layout';

describe('document-picked image dimensions', () => {
  const file = { contentType: 'image/png', filename: 'portrait.png', id: 'selected-photo', uri: 'file://portrait.png' };
  it('reserves the real portrait bounds before adding it to the composer', async () => {
    const prepared = await prepareChatImageDimensions(file, async () => ({ width: 600, height: 900 }));
    expect(chatImageAspectRatio(prepared)).toBe(2 / 3);
    expect(prepared.uri).toBe(file.uri);
  });
  it('preserves the selected file when its dimensions cannot be decoded', async () => {
    expect(await prepareChatImageDimensions(file, async () => { throw new Error('unsupported image'); })).toBe(file);
  });
  it('does not decode documents or images with known bounds', async () => {
    const readSize = vi.fn();
    const document = { ...file, contentType: 'application/pdf' };
    expect(await prepareChatImageDimensions(document, readSize)).toBe(document);
    const image = { ...file, width: 600, height: 900 };
    expect(await prepareChatImageDimensions(image, readSize)).toBe(image);
    expect(readSize).not.toHaveBeenCalled();
  });
  it('bounds a stalled decoder without losing the attachment', async () => {
    vi.useFakeTimers();
    try {
      const preparing = prepareChatImageDimensions(file, () => new Promise(() => {}));
      await vi.advanceTimersByTimeAsync(1500);
      expect(await preparing).toBe(file);
    } finally { vi.useRealTimers(); }
  });
});

describe('chat image upload preparation', () => {
  it('caps a camera image before adding it to the composer and sending it', async () => {
    const file = {
      contentType: 'image/jpeg',
      filename: 'IMG_4032.JPG',
      height: 4032,
      id: 'large-camera-photo',
      size: 5_200_000,
      uri: 'file:///IMG_4032.JPG',
      width: 3024,
    };
    const transform = vi.fn(async (_uri: string, dimensions: { width: number; height: number }) => ({
      contentType: 'image/jpeg',
      filename: 'IMG_4032.jpg',
      height: dimensions.height,
      size: 640_000,
      uri: 'file:///cache/IMG_4032.jpg',
      width: dimensions.width,
    }));

    const prepared = await prepareChatImageForUpload(file, transform);

    expect(transform).toHaveBeenCalledWith(file.uri, { width: 1200, height: 1600 });
    expect(prepared).toMatchObject({
      contentType: 'image/jpeg',
      filename: 'IMG_4032.jpg',
      height: 1600,
      size: 640_000,
      uri: 'file:///cache/IMG_4032.jpg',
      width: 1200,
    });
  });

  it('does not re-encode images that already fit the upload bound', async () => {
    const file = { contentType: 'image/jpeg', filename: 'small.jpg', height: 900, id: 'small', uri: 'file:///small.jpg', width: 1200 };
    const transform = vi.fn();

    expect(await prepareChatImageForUpload(file, transform)).toBe(file);
    expect(transform).not.toHaveBeenCalled();
  });

  it('keeps the original image sendable if native processing fails', async () => {
    const file = { contentType: 'image/jpeg', filename: 'large.jpg', height: 4032, id: 'fallback', uri: 'file:///large.jpg', width: 3024 };

    await expect(prepareChatImageForUpload(file, async () => { throw new Error('native processor unavailable'); }))
      .resolves.toBe(file);
  });
});

describe('chatImageAspectRatio', () => {
  it('keeps sent image bounds when the server cannot produce dimension metadata', () => {
    rememberChatImageDimensions('sent-photo', { width: 3024, height: 4032 });
    expect(chatImageAspectRatio({ id: 'sent-photo' })).toBe(0.75);
    expect(chatImageAspectRatio({ id: 'sent-photo', width: 800, height: 600 })).toBe(0.75);
  });

  it('keeps optimistic image geometry when confirmed server metadata differs', () => {
    rememberChatImageDimensions('confirmed-photo', { width: 900, height: 1200 });

    expect(chatImageAspectRatio({ id: 'confirmed-photo', width: 1200, height: 900 })).toBe(0.75);
  });

  it('bounds remembered geometry so a long session cannot grow the cache forever', () => {
    rememberChatImageDimensions('old-photo', { width: 300, height: 400 });
    for (let index = 0; index < 200; index++) rememberChatImageDimensions(`photo-${index}`, { width: 300, height: 400 });
    expect(chatImageAspectRatio({ id: 'old-photo' })).toBe(4 / 3);
    expect(chatImageAspectRatio({ id: 'photo-199' })).toBe(0.75);
  });
  it('reserves the same bounds for a selected image and its confirmed attachment', () => {
    const selected = { width: 3024, height: 4032 };
    expect(chatImageAspectRatio(selected)).toBe(0.75);
    expect(chatImageAspectRatio({ ...selected })).toBe(chatImageAspectRatio(selected));
  });

  it('bounds panoramas and tall images so they cannot expand the message list', () => {
    expect(chatImageAspectRatio({ width: 4000, height: 200 })).toBe(1.9);
    expect(chatImageAspectRatio({ width: 200, height: 4000 })).toBe(0.56);
  });

  it.each([{}, { width: 0, height: 400 }, { width: -1, height: 400 },
    { width: 400, height: 0 }, { width: NaN, height: 400 }, { width: 400, height: Infinity }])(
    'reserves a stable fallback for absent or invalid dimensions: %j', (image) => {
      expect(chatImageAspectRatio(image)).toBe(4 / 3);
    },
  );
});
