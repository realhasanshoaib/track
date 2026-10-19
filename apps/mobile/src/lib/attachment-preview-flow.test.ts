import { describe, expect, it, vi } from 'vitest';

import { publishFilesBeforePreparation } from './attachment-preview-flow';

describe('attachment preview preparation', () => {
  it('publishes local images before starting native preparation', async () => {
    const file = { id: 'photo-1', uri: 'file:///camera-original.jpg' };
    const prepared = { ...file, uri: 'file:///cache/optimized.jpg' };
    let runScheduled: (() => void) | undefined;
    let finishPreparation: ((file: typeof prepared) => void) | undefined;
    const publish = vi.fn();
    const prepare = vi.fn(() => new Promise<typeof prepared>((resolve) => { finishPreparation = resolve; }));
    const onPrepared = vi.fn();

    const preparation = publishFilesBeforePreparation([file], publish, prepare, onPrepared, (task) => { runScheduled = task; });

    expect(publish).toHaveBeenCalledWith([file]);
    expect(prepare).not.toHaveBeenCalled();

    runScheduled?.();
    await Promise.resolve();
    expect(prepare).toHaveBeenCalledWith(file);
    expect(onPrepared).not.toHaveBeenCalled();

    finishPreparation?.(prepared);
    await preparation.done;
    expect(onPrepared).toHaveBeenCalledWith(prepared);
  });

  it('prepares selected images one at a time to avoid concurrent decode spikes', async () => {
    const files = [{ id: 'photo-1' }, { id: 'photo-2' }];
    let runScheduled: (() => void) | undefined;
    let finishFirst: (() => void) | undefined;
    const prepare = vi.fn((file: typeof files[number]) => file.id === 'photo-1'
      ? new Promise<typeof file>((resolve) => { finishFirst = () => resolve(file); })
      : Promise.resolve(file));

    const preparation = publishFilesBeforePreparation(files, vi.fn(), prepare, vi.fn(), (task) => { runScheduled = task; });
    runScheduled?.();
    await Promise.resolve();

    expect(prepare).toHaveBeenCalledTimes(1);
    finishFirst?.();
    await preparation.done;
    expect(prepare).toHaveBeenCalledTimes(2);
  });

  it('stops preparing the remaining files when the composer is dismissed', async () => {
    const files = [{ id: 'photo-1' }, { id: 'photo-2' }];
    let runScheduled: (() => void) | undefined;
    const prepare = vi.fn(async (file: typeof files[number]) => file);
    const preparation = publishFilesBeforePreparation(files, vi.fn(), prepare, vi.fn(), (task) => { runScheduled = task; });

    preparation.cancel();
    runScheduled?.();
    await preparation.done;

    expect(prepare).not.toHaveBeenCalled();
  });
});
