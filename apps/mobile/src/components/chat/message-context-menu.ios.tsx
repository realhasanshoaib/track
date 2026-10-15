import type { ReactNode } from 'react';
import { MenuView } from '@expo/ui/community/menu';
import type { MenuAction } from '@expo/ui/community/menu';
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
  // Inline playback stays in the RN touch hierarchy. Its row opens the same
  // actions through the existing long-press sheet instead of a SwiftUI host.
  if (!actions.length || inlinePlayback) return <>{children}</>;

  const actionIds = actions.map((_, index) => `message-action-${index}`);
  const menuActions: MenuAction[] = actions.map((action, index) => ({
    id: actionIds[index],
    title: action.label,
    image: action.icon ? ACTION_SYMBOLS[action.icon] : undefined,
    attributes: action.destructive ? { destructive: true } : undefined,
  }));

  // Keep the host content-sized so inline media actions stay beside the bubble.
  return (
    <MenuView
      actions={menuActions}
      onPressAction={({ nativeEvent }) => {
        const index = actionIds.indexOf(nativeEvent.event);
        if (index >= 0) actions[index]?.onPress();
      }}
      shouldOpenOnLongPress>
      {children}
    </MenuView>
  );
}
