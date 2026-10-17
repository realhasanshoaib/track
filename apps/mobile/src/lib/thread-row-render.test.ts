import { describe, expect, it } from 'vitest';

import { areThreadRowRenderStatesEqual, type ThreadRowRenderState } from './thread-row-render';

describe('thread row render state', () => {
  it('reuses a row when a screen refresh only recreates event closures', () => {
    const item = { key: 'message-1' };
    const interactionVersion = {};
    const previous: ThreadRowRenderState = {
      actionSignature: 'Reply|reply|false',
      highlighted: false,
      interactionAvailability: '111010',
      interactionVersion,
      isFirstInGroup: true,
      isOwnMessage: true,
      item,
      readReceipts: null,
      selected: false,
      selectionMode: false,
      variant: 'conversation',
    };
    const next: ThreadRowRenderState = { ...previous };

    expect(areThreadRowRenderStatesEqual(previous, next)).toBe(true);
  });

  it('refreshes a row when its message data changes', () => {
    const previous: ThreadRowRenderState = {
      actionSignature: '',
      highlighted: false,
      interactionAvailability: '100000',
      interactionVersion: 'same-screen-interactions',
      isFirstInGroup: false,
      isOwnMessage: true,
      item: { key: 'message-1', body: 'before' },
      readReceipts: null,
      selected: false,
      selectionMode: false,
      variant: 'conversation',
    };

    expect(areThreadRowRenderStatesEqual(previous, {
      ...previous,
      item: { key: 'message-1', body: 'after' },
    })).toBe(false);
  });

  it('keeps unchanged message content when the timeline rebuilds its row wrapper', () => {
    const messageContent = { body: 'unchanged' };
    const previous: ThreadRowRenderState = {
      actionSignature: '',
      highlighted: false,
      interactionAvailability: '100000',
      interactionVersion: 'same-screen-interactions',
      isFirstInGroup: false,
      isOwnMessage: true,
      item: messageContent,
      readReceipts: null,
      selected: false,
      selectionMode: false,
      variant: 'conversation',
    };

    expect(areThreadRowRenderStatesEqual(previous, {
      ...previous,
      item: messageContent,
    })).toBe(true);
  });

  it('refreshes rows when a visible or interaction state changes', () => {
    const previous: ThreadRowRenderState = {
      actionSignature: '',
      highlighted: false,
      interactionAvailability: '100000',
      interactionVersion: 'screen-interactions-1',
      isFirstInGroup: false,
      isOwnMessage: true,
      item: { key: 'message-1' },
      readReceipts: null,
      selected: false,
      selectionMode: false,
      variant: 'conversation',
    };

    expect(areThreadRowRenderStatesEqual(previous, { ...previous, selected: true })).toBe(false);
    expect(areThreadRowRenderStatesEqual(previous, { ...previous, interactionVersion: 'screen-interactions-2' })).toBe(false);
    expect(areThreadRowRenderStatesEqual(previous, { ...previous, interactionAvailability: '100001' })).toBe(false);
  });
});
