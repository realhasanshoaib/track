import { OptionsSheet, SheetNote, SheetRow, SheetSection } from '@/components/options-sheet';
import type { MobileTaskView } from '@/components/task-list-content';

type Props = {
  attentionTasks: MobileTaskView[];
  attentionTasksLoading: boolean;
  boardName: string;
  onClose: () => void;
  onOpenTask: (task: MobileTaskView) => void;
  visible: boolean;
};

export function BoardAttentionSheet({
  attentionTasks,
  attentionTasksLoading,
  boardName,
  onClose,
  onOpenTask,
  visible,
}: Props) {
  return (
    <OptionsSheet onClose={onClose} title={`${boardName} attention`} visible={visible}>
      <SheetSection title="Urgent and high priority">
        {attentionTasksLoading
          ? <SheetNote>Loading high-priority tasks…</SheetNote>
          : attentionTasks.length
            ? attentionTasks.map((item) => <SheetRow
                detail={item.task.priority === 'urgent' ? 'Urgent priority' : 'High priority'}
                icon="flag"
                key={item.task._id}
                label={item.task.title}
                onPress={() => onOpenTask(item)}
              />)
            : <SheetNote>No urgent or high-priority tasks on this Board.</SheetNote>}
      </SheetSection>
    </OptionsSheet>
  );
}
