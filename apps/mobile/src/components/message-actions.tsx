import { useRef } from 'react';

import { OptionsSheet, SheetRow, SheetSection } from '@/components/options-sheet';
import type { IconName } from '@/components/platform-icon';

export type MessageAction = { label: string; icon?: IconName; destructive?: boolean; onPress: () => void };

type Props = { visible: boolean; onClose: () => void; actions: MessageAction[] };

export function MessageActions({ visible, onClose, actions }: Props) {
  const pendingAction = useRef<(() => void) | null>(null);
  const sheetVisible = visible && pendingAction.current === null;

  return (
    <OptionsSheet
      onClose={onClose}
      onClosed={() => {
        const action = pendingAction.current;
        pendingAction.current = null;
        if (action) {
          onClose();
          action();
        }
      }}
      title="Message actions"
      visible={sheetVisible}>
      <SheetSection>
        {actions.map((action) => (
          <SheetRow
            destructive={action.destructive}
            icon={action.icon}
            key={action.label}
            label={action.label}
            onPress={() => {
              pendingAction.current = action.onPress;
              onClose();
            }}
          />
        ))}
      </SheetSection>
    </OptionsSheet>
  );
}
