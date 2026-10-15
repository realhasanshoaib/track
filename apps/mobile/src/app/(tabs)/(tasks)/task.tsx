import { DevelopmentScreenProfiler } from '@/components/development-performance-monitor';
import TaskScreen from '@/screens/task';

export default function TaskRoute() {
  return <DevelopmentScreenProfiler screen="Task detail"><TaskScreen /></DevelopmentScreenProfiler>;
}
