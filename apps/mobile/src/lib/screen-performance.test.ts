import { describe, expect, it } from 'vitest';
import { createScreenPerformanceCapture } from './screen-performance';

describe('development route performance capture', () => {
  it('keeps route identities out of the diagnostic result', () => {
    expect(createScreenPerformanceCapture().snapshot().screens.map(({ screen }) => screen))
      .toEqual(['Task detail', 'Tasks / Board', 'Chat', 'Thread']);
  });
  it('captures stalls and expensive render work only during a recording', () => {
    const capture = createScreenPerformanceCapture();
    capture.render('Chat', 200);
    capture.delay(500);
    expect(capture.snapshot().maxJsDelayMs).toBe(0);
    capture.start();
    capture.render('Chat', 8);
    capture.render('Chat', 130);
    capture.delay(4);
    capture.delay(240);
    capture.stop();
    capture.render('Chat', 900);
    capture.delay(900);
    expect(capture.snapshot()).toMatchObject({ recording: false, maxJsDelayMs: 240, slowJsSamples: 1 });
    expect(capture.snapshot().screens.find(({ screen }) => screen === 'Chat'))
      .toEqual({ screen: 'Chat', commits: 2, maxRenderMs: 130, slowRenders: 1 });
  });
  it('clears old readings on restart and rejects invalid or unrelated measurements', () => {
    const capture = createScreenPerformanceCapture();
    capture.start();
    capture.render('Task detail', 200);
    capture.delay(500);
    capture.start();
    capture.render(null, 900);
    for (const invalid of [NaN, Infinity, -1]) {
      capture.render('Task detail', invalid);
      capture.delay(invalid);
    }
    expect(capture.snapshot().maxJsDelayMs).toBe(0);
    expect(capture.snapshot().screens.every(({ commits }) => commits === 0)).toBe(true);
  });
  it('returns detached values so the results cannot corrupt later recordings', () => {
    const capture = createScreenPerformanceCapture();
    capture.start();
    capture.render('Tasks / Board', 25);
    capture.snapshot().screens[1].commits = 100;
    expect(capture.snapshot().screens[1].commits).toBe(1);
    for (let index = 0; index < 10_000; index++) capture.render('Tasks / Board', 2);
    expect(capture.snapshot().screens).toHaveLength(4);
    expect(capture.snapshot().screens[1].commits).toBe(10_001);
  });
});
