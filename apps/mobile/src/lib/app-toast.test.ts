import { describe, expect, it } from 'vitest';

import { enqueueToast, toastDuration, type AppToastItem } from './app-toast';

function toast(id: number, title = `Toast ${id}`): AppToastItem {
  return { id, title, tone: 'info' };
}

describe('app toast queue', () => {
  it('deduplicates matching feedback while it is visible or queued', () => {
    const queue = [toast(1, 'Saved')];
    expect(enqueueToast(queue, toast(2, 'Saved'))).toBe(queue);
  });

  it('keeps the active toast and newest feedback when the queue is full', () => {
    expect(enqueueToast([toast(1), toast(2), toast(3)], toast(4)).map((item) => item.id))
      .toEqual([1, 3, 4]);
  });

  it('bounds custom timing and gives long messages more reading time', () => {
    expect(toastDuration({ durationMs: 500, title: 'Short' })).toBe(2_000);
    expect(toastDuration({ durationMs: 20_000, title: 'Long' })).toBe(8_000);
    expect(toastDuration({ message: 'A'.repeat(73), title: 'Detailed' })).toBe(4_800);
    expect(toastDuration({ onPress: () => undefined, title: 'Open notification' })).toBe(8_000);
  });
});
