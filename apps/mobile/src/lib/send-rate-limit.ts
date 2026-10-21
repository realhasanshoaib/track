/** Serialize message creation so a burst shares the server's per-user refill. */
const MaxQueuedSends = 25;
const MaxRetryTimeMs = 60_000;
const MaxRetries = 30;
const RetryMarginMs = 50;

let sendTail: Promise<unknown> = Promise.resolve();
let queuedSends = 0;

function retryAfterMs(error: unknown): number | null {
  if (typeof error !== 'object' || error === null || !('data' in error)) return null;
  const data = error.data;
  if (typeof data !== 'object' || data === null || !('kind' in data) || !('name' in data) || !('retryAfter' in data)) return null;
  if (data.kind !== 'RateLimited' || data.name !== 'sendMessage') return null;
  return typeof data.retryAfter === 'number' && Number.isFinite(data.retryAfter) && data.retryAfter > 0
    ? data.retryAfter
    : null;
}

export function sendWithRateLimitRetry<T>(send: () => Promise<T>): Promise<T> {
  if (queuedSends >= MaxQueuedSends) return Promise.reject(new Error('send_queue_full'));
  queuedSends += 1;

  const run = async () => {
    const deadline = Date.now() + MaxRetryTimeMs;
    let retries = 0;
    for (;;) {
      try {
        return await send();
      } catch (error) {
        const retryAfter = retryAfterMs(error);
        const waitMs = retryAfter === null ? 0 : Math.ceil(retryAfter) + RetryMarginMs;
        if (!waitMs || retries >= MaxRetries || Date.now() + waitMs > deadline) throw error;
        retries += 1;
        await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
      }
    }
  };

  const result = sendTail.then(run, run);
  sendTail = result.then(() => undefined, () => undefined);
  return result.finally(() => { queuedSends -= 1; });
}
