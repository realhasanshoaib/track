import { DevelopmentScreenProfiler } from '@/components/development-performance-monitor';
import ThreadScreen from '@/screens/thread';

export default function ThreadRoute() {
  return <DevelopmentScreenProfiler screen="Thread"><ThreadScreen /></DevelopmentScreenProfiler>;
}
