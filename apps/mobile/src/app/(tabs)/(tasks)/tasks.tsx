import ProjectTasksScreen from '@/screens/tasks';
import { DevelopmentScreenProfiler } from '@/components/development-performance-monitor';

export default function TasksRoute() {
  return <DevelopmentScreenProfiler screen="Tasks / Board"><ProjectTasksScreen /></DevelopmentScreenProfiler>;
}
