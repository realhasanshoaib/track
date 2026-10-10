import type { ReactNode } from 'react';
import { MenuView } from '@expo/ui/community/menu';
import type { MenuAction } from '@expo/ui/community/menu';
import type { SFSymbol } from 'sf-symbols-typescript';

import type { MessageAction } from '@/components/message-actions';

type Props = { actions: MessageAction[]; children: ReactNode };

const ACTION_SYMBOLS: Partial<Record<NonNullable<MessageAction['icon']>, SFSymbol>> = {
  'content-copy': 'doc.on.doc',
  refresh: 'arrow.clockwise',
  thread: 'bubble.left.and.bubble.right',
  reply: 'arrowshape.turn.up.left',
  plus: 'plus',
  forward: 'arrowshape.turn.up.right',
  edit: 'pencil',
  'trash-can-outline': 'trash',
  flag: 'flag',
};

export function MessageContextMenu({ actions, children }: Props) {
  if (!actions.length) return <>{children}</>;

  const actionIds = actions.map((_, index) => `message-action-${index}`);
  const menuActions: MenuAction[] = actions.map((action, index) => ({
    id: actionIds[index],
    title: action.label,
    image: action.icon ? ACTION_SYMBOLS[action.icon] : undefined,
    attributes: action.destructive ? { destructive: true } : undefined,
  }));

  // The bubble uses a percentage maxWidth, so give Yoga a measured row width.
  return (
    <MenuView
      actions={menuActions}
      onPressAction={({ nativeEvent }) => {
        const index = actionIds.indexOf(nativeEvent.event);
        if (index >= 0) actions[index]?.onPress();
      }}
      shouldOpenOnLongPress
      style={{ flex: 1 }}>
      {children}
    </MenuView>
  );
}
