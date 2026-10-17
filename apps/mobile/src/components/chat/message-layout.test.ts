import { describe, expect, it } from 'vitest';

import { MESSAGE_ROW_VERTICAL_PADDING } from '../../lib/message-row-layout';

describe('chat message row spacing', () => {
  it('keeps optimistic rows on the same baseline as confirmed rows', () => {
    expect(MESSAGE_ROW_VERTICAL_PADDING).toBe(0);
  });
});
