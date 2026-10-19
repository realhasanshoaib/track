import { describe, expect, it } from 'vitest';

import { MESSAGE_ROW_VERTICAL_PADDING, PENDING_MESSAGE_BOTTOM_PADDING } from '../../lib/message-row-layout';

describe('chat message row spacing', () => {
  it('keeps optimistic rows on the same baseline as confirmed rows', () => {
    expect(MESSAGE_ROW_VERTICAL_PADDING).toBe(0);
  });

  it('does not leave pending-only space below an image bubble', () => {
    expect(PENDING_MESSAGE_BOTTOM_PADDING).toBe(MESSAGE_ROW_VERTICAL_PADDING);
    expect(PENDING_MESSAGE_BOTTOM_PADDING).toBe(0);
  });
});
