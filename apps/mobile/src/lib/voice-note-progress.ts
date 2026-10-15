/** Advance the cursor between native timestamps without increasing idle polling. */
export function projectVoiceNoteProgress(currentTime: number, totalSeconds: number, rate: number, intervalMs: number) {
  const total = Number.isFinite(totalSeconds) ? Math.max(totalSeconds, 0) : 0;
  const current = Number.isFinite(currentTime) ? Math.min(Math.max(currentTime, 0), total) : 0;
  const from = total > 0 ? current / total : 0;
  if (!total || !Number.isFinite(currentTime) || !Number.isFinite(rate) || rate <= 0 || !Number.isFinite(intervalMs) || intervalMs <= 0) {
    return { from, to: from, duration: 0 };
  }
  const duration = Math.min(intervalMs, (total - current) / rate * 1000);
  return { from, to: Math.min(1, (current + duration / 1000 * rate) / total), duration };
}
