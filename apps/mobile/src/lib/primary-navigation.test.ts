import { describe, expect, it } from 'vitest';

import {
  primaryDestinationForRoute,
  primaryNavigationHeight,
  primaryNavigationSafeAreaInset,
  primaryNavigationVisibleForPath,
  primaryRouteOrder,
  primaryTabGeometry,
  primaryTabIndexAtX,
  primaryTabSelectionOffset,
  primaryTabRubberBand,
  primaryTabResetTarget,
} from './primary-navigation';

describe('primaryNavigationVisibleForPath', () => {
  it('keeps the app bar on peer and overview surfaces', () => {
    expect(primaryNavigationVisibleForPath('/projects')).toBe(true);
    expect(primaryNavigationVisibleForPath('/project')).toBe(true);
    expect(primaryNavigationVisibleForPath('/groups')).toBe(true);
    expect(primaryNavigationVisibleForPath('/search')).toBe(true);
  });

  it('gives focused work destinations the bottom edge', () => {
    expect(primaryNavigationVisibleForPath('/conversation')).toBe(false);
    expect(primaryNavigationVisibleForPath('/thread')).toBe(false);
    expect(primaryNavigationVisibleForPath('/task')).toBe(false);
    expect(primaryNavigationVisibleForPath('/task?tab=discussion')).toBe(false);
    expect(primaryNavigationVisibleForPath('/notifications')).toBe(false);
    expect(primaryNavigationVisibleForPath('/inbox')).toBe(true);
    expect(primaryNavigationVisibleForPath('/profile')).toBe(true);
    expect(primaryNavigationVisibleForPath('/company')).toBe(false);
    expect(primaryNavigationVisibleForPath('/conversations')).toBe(true);
  });
});

describe('primaryNavigationHeight', () => {
  it('grows for accessibility text without changing the standard shell', () => {
    expect(primaryNavigationHeight(1, 76)).toBe(76);
    expect(primaryNavigationHeight(1.2, 76)).toBe(76);
    expect(primaryNavigationHeight(1.3, 76)).toBe(108);
    expect(primaryNavigationHeight(2, 76)).toBe(108);
  });
});

describe('primaryNavigationSafeAreaInset', () => {
  it('uses the measured system inset without adding a gap on Android', () => {
    expect(primaryNavigationSafeAreaInset(0)).toBe(0);
    expect(primaryNavigationSafeAreaInset(28)).toBe(28);
  });

  it('keeps the small visual floor where the platform uses a floating bar', () => {
    expect(primaryNavigationSafeAreaInset(0, 8)).toBe(8);
    expect(primaryNavigationSafeAreaInset(28, 8)).toBe(28);
  });
});

describe('primary tab route model', () => {
  it('maps each route group to one stable peer destination', () => {
    const destinations = ['(home)', '(inbox)', '(tasks)', '(profile)']
      .map((route) => primaryDestinationForRoute(route));

    expect(destinations.map(({ key }) => key)).toEqual(['conversations', 'inbox', 'tasks', 'profile']);
    expect(destinations.map(({ label }) => label)).toEqual(['Chats', 'Inbox', 'My Tasks', 'Profile']);
    expect(destinations.map(({ icon }) => icon)).toEqual(['message', 'email-outline', 'task', 'account-circle']);
  });

  it('keeps the app bar in Conversations, My Tasks, Inbox, Profile order', () => {
    const destinations = primaryRouteOrder.map((route) => primaryDestinationForRoute(route));

    expect(destinations.map(({ key }) => key)).toEqual(['conversations', 'tasks', 'inbox', 'profile']);
    expect(destinations.map(({ label }) => label)).toEqual(['Chats', 'My Tasks', 'Inbox', 'Profile']);
  });

  it('keeps a disabled Tasks destination visible while the release is gated', () => {
    expect(primaryDestinationForRoute('(tasks)', true)).toMatchObject({ key: 'tasks', disabled: true });
  });

  it('resets every primary Tasks press to global My Tasks', () => {
    expect(primaryTabResetTarget('tasks')).toEqual({ params: {}, screen: 'tasks' });
    expect(primaryTabResetTarget('profile')).toBeNull();
  });

  it('rejects an unregistered route instead of silently selecting the wrong tab', () => {
    expect(() => primaryDestinationForRoute('(unknown)')).toThrow('Unsupported primary tab route');
    expect(() => primaryDestinationForRoute('(search)')).toThrow('Unsupported primary tab route');
  });

  it('centers every selection pill on the same cell center as its tab content', () => {
    const geometry = primaryTabGeometry(352, 4, 2);
    const pillCenter = geometry.indicatorLeft + geometry.indicatorWidth / 2;

    expect(geometry).toEqual({ cellWidth: 88, indicatorLeft: 198, indicatorWidth: 44 });
    expect(pillCenter).toBe(220);
  });

  it('centers the white active marker in each tab cell, including compact rows', () => {
    expect([0, 1, 2, 3].map((index) => primaryTabSelectionOffset(352, 4, index))).toEqual([24, 112, 200, 288]);
    expect(primaryTabSelectionOffset(176, 4, 2)).toBe(90);
  });

  it('clamps drag release positions to a valid primary destination', () => {
    expect(primaryTabIndexAtX(-20, 352, 4)).toBe(0);
    expect(primaryTabIndexAtX(175, 352, 4)).toBe(1);
    expect(primaryTabIndexAtX(900, 352, 4)).toBe(3);
  });

  it('maps a destination-only row evenly across its four cells', () => {
    expect(primaryTabIndexAtX(20, 352, 4)).toBe(0);
    expect(primaryTabIndexAtX(110, 352, 4)).toBe(1);
    expect(primaryTabIndexAtX(210, 352, 4)).toBe(2);
    expect(primaryTabIndexAtX(330, 352, 4)).toBe(3);
  });

  it('keeps all four destinations evenly reachable with Create outside the navigation row', () => {
    expect([0, 1, 2, 3].map((slot) => primaryTabIndexAtX((slot + 0.5) * 88, 352, 4))).toEqual([0, 1, 2, 3]);
  });

  it('tracks inside the glass bar and resists overshoot equally on every edge', () => {
    expect(primaryTabRubberBand(30, 0, 100, 18)).toBe(30);
    expect(primaryTabRubberBand(-10, 0, 100, 18)).toBeCloseTo(-2.8);
    expect(primaryTabRubberBand(110, 0, 100, 18)).toBeCloseTo(102.8);
    expect(primaryTabRubberBand(-1_000, 0, 100, 18)).toBe(-18);
    expect(primaryTabRubberBand(1_000, 0, 100, 18)).toBe(118);
  });
});
