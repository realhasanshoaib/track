import { DevelopmentScreenProfiler } from '@/components/development-performance-monitor';
import ConversationScreen from '@/screens/conversation';

export default function ConversationRoute() {
  return <DevelopmentScreenProfiler screen="Chat"><ConversationScreen /></DevelopmentScreenProfiler>;
}
