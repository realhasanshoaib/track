export const PERFORMANCE_SCREENS = ['Task detail', 'Tasks / Board', 'Chat', 'Thread'] as const;
export type PerformanceScreen = typeof PERFORMANCE_SCREENS[number];

export function createScreenPerformanceCapture() {
  let recording = false;
  let maxJsDelayMs = 0;
  let slowJsSamples = 0;
  const renders = new Map<PerformanceScreen, { commits: number; maxRenderMs: number; slowRenders: number }>();
  return {
    start() { recording = true; maxJsDelayMs = 0; slowJsSamples = 0; renders.clear(); },
    stop() { recording = false; },
    isRecording() { return recording; },
    render(screen: PerformanceScreen | null, duration: number) {
      if (!recording || !screen || !Number.isFinite(duration) || duration < 0) return;
      const current = renders.get(screen) ?? { commits: 0, maxRenderMs: 0, slowRenders: 0 };
      current.commits += 1;
      current.maxRenderMs = Math.max(current.maxRenderMs, duration);
      if (duration > 16.7) current.slowRenders += 1;
      renders.set(screen, current);
    },
    delay(duration: number) {
      if (!recording || !Number.isFinite(duration) || duration < 0) return;
      maxJsDelayMs = Math.max(maxJsDelayMs, duration);
      if (duration > 100) slowJsSamples += 1;
    },
    snapshot() {
      return { recording, maxJsDelayMs, slowJsSamples,
        screens: PERFORMANCE_SCREENS.map((screen) => ({ screen,
          ...(renders.get(screen) ?? { commits: 0, maxRenderMs: 0, slowRenders: 0 }) })),
      };
    },
  };
}

// In-memory diagnostics only. Never persist paths, message text, or account data.
export const screenPerformanceCapture = createScreenPerformanceCapture();
const listeners = new Set<() => void>();
export function subscribePerformanceCapture(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function startPerformanceCapture() {
  screenPerformanceCapture.start();
  for (const listener of listeners) listener();
}
export function stopPerformanceCapture() {
  screenPerformanceCapture.stop();
  for (const listener of listeners) listener();
}
