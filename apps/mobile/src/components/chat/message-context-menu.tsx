import type { PropsWithChildren } from 'react';

import type { MessageAction } from '@/components/message-actions';

type Props = PropsWithChildren<{ actions: MessageAction[]; inlinePlayback?: boolean }>;

/** Non-iOS platforms keep their existing message selection interaction. */
export function MessageContextMenu({ children }: Props) {
  return <>{children}</>;
}
