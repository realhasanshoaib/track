import { afterEach, describe, expect, it } from 'vitest';

import { setActivePushContext, shouldPresentPush } from './push-presentation';

afterEach(() => setActivePushContext(null));

describe('foreground push presentation', () => {
  it('suppresses only the exact active Channel', () => {
    setActivePushContext({ projectId: 'p', groupId: 'g' });
    expect(shouldPresentPush({ projectId: 'p', groupId: 'g' })).toBe(false);
    expect(shouldPresentPush({ projectId: 'p', groupId: 'other' })).toBe(true);

  });
});
