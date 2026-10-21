import * as React from 'react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@expo/ui/swift-ui', () => ({
  Button: 'NativeMenuButton',
  Host: 'NativeMenuHost',
  Menu: 'NativeMenu',
  RNHostView: 'NativeReactHost',
}));
import { MessageContextMenu } from './message-context-menu.ios';

// The app's Metro transform supplies the JSX runtime. Keep this node-only
// composition check independent of React Native's native-module runtime.
beforeAll(() => { vi.stubGlobal('React', React); });
afterAll(() => { vi.unstubAllGlobals(); });

describe('iOS inline playback touch boundary', () => {
  it('keeps the actual playback control out of the SwiftUI menu host', () => {
    const play = vi.fn();
    const control = React.createElement('button', { onClick: play }, 'Play');
    const result = MessageContextMenu({
      actions: [{ label: 'Reply', onPress: vi.fn() }],
      children: control, inlinePlayback: true,
    });
    expect(result.type).toBe(React.Fragment);
    expect(result.props.children).toBe(control);
    control.props.onClick();
    expect(play).toHaveBeenCalledOnce();
  });

  it('preserves native menus and their action dispatch for other messages', () => {
    const reply = vi.fn();
    const result = MessageContextMenu({
      actions: [{ label: 'Reply', onPress: reply }],
      children: React.createElement('span', null, 'Message'),
    });
    expect(result.type).toBe('NativeMenuHost');
    const menu = result.props.children;
    expect(menu.type).toBe('NativeMenu');
    expect(menu.props.label.type).toBe('NativeReactHost');
    menu.props.onPrimaryAction();
    expect(reply).not.toHaveBeenCalled();
    const [button] = menu.props.children;
    expect(button.type).toBe('NativeMenuButton');
    button.props.onPress();
    expect(reply).toHaveBeenCalledOnce();
  });
});
