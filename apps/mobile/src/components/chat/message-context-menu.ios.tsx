import type { ReactNode } from 'react';
import { Button, Host, Menu, RNHostView } from '@expo/ui/swift-ui';
import type { SFSymbol } from 'sf-symbols-typescript';

import type { MessageAction } from '@/components/message-actions';

type Props = { actions: MessageAction[]; children: ReactNode; inlinePlayback?: boolean };

const ACTION_SYMBOLS: Partial<Record<NonNullable<MessageAction['icon']>, SFSymbol>> = {
  'content-copy': 'doc.on.doc',
  'check-box-outline': 'checkmark.circle',
  refresh: 'arrow.clockwise',
  thread: 'bubble.left.and.bubble.right',
  reply: 'arrowshape.turn.up.left',
  plus: 'plus',
  forward: 'arrowshape.turn.up.right',
  edit: 'pencil',
  'trash-can-outline': 'trash',
  flag: 'flag',
};

export function MessageContextMenu({ actions, children, inlinePlayback = false }: Props) {
  // Keep voice and video controls in React Native's touch hierarchy. Their
  // long press uses the screen's action sheet instead of a SwiftUI host.
  if (!actions.length || inlinePlayback) return <>{children}</>;

  return (
    <Host ignoreSafeArea="all" matchContents>
      <Menu
        // SwiftUI Menu with a primary action opens its options on hold without
        // creating the raised, shadowed message preview of ContextMenu.
        label={<RNHostView matchContents><>{children}</></RNHostView>}
        onPrimaryAction={() => undefined}>
        {actions.map((action, index) => (
          <Button
            key={`message-action-${index}`}
            label={action.label}
            onPress={action.onPress}
            role={action.destructive ? 'destructive' : undefined}
            systemImage={action.icon ? ACTION_SYMBOLS[action.icon] : undefined}
          />
        ))}
      </Menu>
    </Host>
  );
}
