import { ConvexError } from 'convex/values';
import { describe, expect, it, vi } from 'vitest';

import { sendWithRateLimitRetry } from './send-rate-limit';

describe('send rate limit recovery', () => {
  it('preserves send order when the first message needs to wait for a token', async () => {
    const calls: string[] = [];
    let firstAttempt = true;
    const first = sendWithRateLimitRetry(async () => {
      calls.push('first');
      if (firstAttempt) {
        firstAttempt = false;
        throw new ConvexError({ kind: 'RateLimited', name: 'sendMessage', retryAfter: 1 });
      }
      return 'first-id';
    });
    const second = sendWithRateLimitRetry(async () => {
      calls.push('second');
      return 'second-id';
    });

    expect(await Promise.all([first, second])).toEqual(['first-id', 'second-id']);
    expect(calls).toEqual(['first', 'first', 'second']);
  });

  it('does not retry a different failure or a long server cooldown', async () => {
    const offline = vi.fn().mockRejectedValue(new Error('offline'));
    await expect(sendWithRateLimitRetry(offline)).rejects.toThrow('offline');
    expect(offline).toHaveBeenCalledTimes(1);

    const longLimit = vi.fn().mockRejectedValue(new ConvexError({ kind: 'RateLimited', name: 'sendMessage', retryAfter: 61_000 }));
    await expect(sendWithRateLimitRetry(longLimit)).rejects.toMatchObject({ data: { kind: 'RateLimited' } });
    expect(longLimit).toHaveBeenCalledTimes(1);
  });
});
