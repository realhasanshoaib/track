import { useIsFocused } from 'expo-router';
import { Profiler, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { screenPerformanceCapture, stopPerformanceCapture, subscribePerformanceCapture, type PerformanceScreen } from '@/lib/screen-performance';

function RecordingMonitor({ children }: { children: ReactNode }) {
  const recording = useSyncExternalStore(subscribePerformanceCapture, screenPerformanceCapture.isRecording, () => false);

  useEffect(() => {
    if (!recording) return;
    let previous = performance.now();
    const subscription = AppState.addEventListener('change', () => { previous = performance.now(); });
    const heartbeat = setInterval(() => {
      const now = performance.now();
      if (AppState.currentState === 'active') screenPerformanceCapture.delay(Math.max(0, now - previous - 50));
      previous = now;
    }, 50);
    const limit = setTimeout(stopPerformanceCapture, 120_000);
    return () => { clearInterval(heartbeat); clearTimeout(limit); subscription.remove(); };
  }, [recording]);

  return children;
}

export function DevelopmentPerformanceMonitor({ children }: { children: ReactNode }) {
  return __DEV__ ? <RecordingMonitor>{children}</RecordingMonitor> : children;
}

function ScreenProfiler({ children, screen }: { children: ReactNode; screen: PerformanceScreen | null }) {
  const focused = useIsFocused();
  const recording = useSyncExternalStore(subscribePerformanceCapture, screenPerformanceCapture.isRecording, () => false);
  // Keep the same boundary when recording toggles, preserving inputs and state.
  return <Profiler id={screen ?? 'diagnostic'} onRender={(_id, _phase, actualDuration) => {
    if (recording && focused && AppState.currentState === 'active') screenPerformanceCapture.render(screen, actualDuration);
  }}>{children}</Profiler>;
}

export function DevelopmentScreenProfiler(props: { children: ReactNode; screen: PerformanceScreen | null }) {
  return __DEV__ ? <ScreenProfiler {...props} /> : props.children;
}
