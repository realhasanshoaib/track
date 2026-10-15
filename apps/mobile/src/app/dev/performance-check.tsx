import { Redirect, Stack, useRouter } from 'expo-router';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ActionButton } from '@/components/action-button';
import { DevelopmentScreenProfiler } from '@/components/development-performance-monitor';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { screenPerformanceCapture, startPerformanceCapture, stopPerformanceCapture, subscribePerformanceCapture } from '@/lib/screen-performance';

export default function PerformanceCheck() {
  const router = useRouter();
  const theme = useTheme();
  const recording = useSyncExternalStore(subscribePerformanceCapture, screenPerformanceCapture.isRecording, () => false);
  const [result, setResult] = useState(screenPerformanceCapture.snapshot);
  useEffect(() => { setResult(screenPerformanceCapture.snapshot()); }, [recording]);

  if (!__DEV__) return <Redirect href="/" />;
  return <DevelopmentScreenProfiler screen={null}><ThemedView style={styles.screen}>
    <Stack.Screen options={{ title: 'Screen lag check' }} />
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <ThemedText accessibilityRole="header" type="titleLarge">Route lag check v1</ThemedText>
      <ThemedText type="small">Start recording, then open Task detail, Tasks / Board, and Chat. Repeat the slow opening and go back twice. Return here and stop to read the results.</ThemedText>
      <ThemedText accessibilityLiveRegion="polite" type="smallBold">{recording ? 'Recording; stops automatically after two minutes.' : 'Recording stopped.'}</ThemedText>
      <ActionButton label={recording ? 'Stop and show results' : 'Start and go back'} onPress={() => {
        if (recording) stopPerformanceCapture();
        else { startPerformanceCapture(); if (router.canGoBack()) router.back(); }
      }} />
      <ThemedText selectable type="small">{`Longest JS delay: ${Math.round(result.maxJsDelayMs)} ms; samples over 100 ms: ${result.slowJsSamples}`}</ThemedText>
      {result.screens.map(({ screen, commits, maxRenderMs, slowRenders }) => <View key={screen} style={[styles.result, { borderTopColor: theme.hairline }]}>
        <ThemedText type="smallBold">{screen}</ThemedText>
        <ThemedText selectable type="small">{`React commits: ${commits}; longest render: ${maxRenderMs.toFixed(1)} ms; renders over 16.7 ms: ${slowRenders}`}</ThemedText>
      </View>)}
      <ThemedText themeColor="textSecondary" type="small">These readings measure JavaScript scheduling and React work inside each focused screen. They do not measure native animation FPS, network time, or time from your tap to first paint. Background app time and inactive-screen renders are excluded. Nothing is uploaded or saved.</ThemedText>
      <ThemedText themeColor="textSecondary" type="small">Keep the same Expo build, device, and Reduce Motion setting when comparing results. Recording adds development overhead; release performance needs a release build.</ThemedText>
    </ScrollView>
  </ThemedView></DevelopmentScreenProfiler>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { gap: Spacing.four, padding: Spacing.four, paddingBottom: Spacing.six },
  result: { borderTopWidth: StyleSheet.hairlineWidth, gap: Spacing.two, paddingTop: Spacing.three },
});
