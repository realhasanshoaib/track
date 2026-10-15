import { Redirect, Stack } from 'expo-router';
import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import type { Doc, Id } from '../../../../../convex/_generated/dataModel';
import { ActionButton } from '@/components/action-button';
import { ProjectAttention } from '@/components/project-overview-dashboard';
import { ProjectDirectoryCard, type DirectoryProject } from '@/components/projects-directory';
import { TaskBoard, type BoardColumnView } from '@/components/task-board';
import { TaskCommentComposer } from '@/components/task-detail-content';
import type { MobileTaskView } from '@/components/task-detail-types';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { idempotencyKey } from '@/lib/idempotency';
import { createDraftSubmissionState, createSubmissionGate } from '@/lib/submission-state';

const projectId = 'projects:interaction-preview' as Id<'projects'>;
const boardId = 'taskBoards:interaction-preview' as Id<'taskBoards'>;
const now = 1_760_000_000_000;
const states = ['To do', 'In progress', 'Completed'].map((name, index) => ({
  _id: `taskWorkflowStates:interaction-${index}` as Id<'taskWorkflowStates'>,
  _creationTime: now, boardId, projectId, name,
  category: index === 0 ? 'unstarted' : index === 1 ? 'started' : 'completed',
  visualToken: index === 0 ? 'blue' : index === 1 ? 'amber' : 'green',
  rank: String(index), isDefault: index === 0, createdAt: now, updatedAt: now,
})) as Array<Doc<'taskWorkflowStates'>>;

function task(worst: boolean): MobileTaskView {
  return {
    task: {
      _id: 'tasks:interaction-preview', _creationTime: now, projectId, boardId,
      workflowStateId: states[0]._id, publicKey: 'DEMO-1', title: worst
        ? 'Review the clinical operations delivery handoff and confirm every cross-team dependency, release owner, accessibility finding, and next milestone before approval'.repeat(2).slice(0, 180)
        : 'Confirm the release handoff',
      rank: 'a', revision: 1, priority: 'high', createdAt: now, updatedAt: now,
    },
    state: states[0], assignee: null, creator: null, labels: [], references: [], terminal: false,
  } as unknown as MobileTaskView;
}

function project(worst: boolean): DirectoryProject {
  return {
    project: { _id: projectId, name: worst ? 'International Patient Safety and Clinical Operations Research Collaboration' : 'Patient Portal', markIconKey: undefined, markColorKey: undefined },
    membership: { _id: 'projectMembers:interaction-preview', _creationTime: now, projectId, status: 'active', role: 'manager' } as unknown as Doc<'projectMembers'>,
    groupCount: 25, memberCount: 3, memberCountTruncated: false, members: [], unreadCount: 0,
  };
}

/** Local fixtures use the production components and never send a backend mutation. */
export default function WorkspaceInteractionPreview() {
  const [worst, setWorst] = useState(false);
  const [shortBoard, setShortBoard] = useState(false);
  const [fail, setFail] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);
  const [value, setValue] = useState('First update');
  const [busy, setBusy] = useState(false);
  const [manualResponses, setManualResponses] = useState(false);
  const [awaitingSend, setAwaitingSend] = useState(false);
  const releaseSend = useRef<(() => void) | null>(null);
  const [result, setResult] = useState('No update sent');
  const [savedTask, setSavedTask] = useState<MobileTaskView | null>(null);
  const gate = useRef(createSubmissionGate());
  const draft = useRef(createDraftSubmissionState());
  const currentValue = useRef(value);
  currentValue.current = value;
  const currentTask = savedTask ?? task(worst);
  const columns: BoardColumnView[] = states.map((state) => ({
    state, tasks: state._id === currentTask.task.workflowStateId ? [currentTask] : [],
  }));

  async function send() {
    const token = gate.current.begin();
    if (!token) return;
    const submitted = draft.current.capture(currentValue.current, idempotencyKey);
    setBusy(true);
    await new Promise<void>((resolve) => {
      if (manualResponses) {
        releaseSend.current = resolve;
        setAwaitingSend(true);
      } else setTimeout(resolve, 2000);
    });
    setAwaitingSend(false);
    releaseSend.current = null;
    if (fail) setResult('Simulated failure: retry keeps the same submission key');
    else {
      setResult(`Sent: ${submitted.signature}`);
      if (draft.current.settleSuccess(submitted, currentValue.current)) {
        setValue('');
        setComposerOpen(false);
      }
    }
    if (gate.current.finish(token)) setBusy(false);
  }

  if (!__DEV__) return <Redirect href="/" />;
  return <ThemedView style={styles.screen}>
    <Stack.Screen options={{ headerShown: false }} />
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <ThemedText accessibilityRole="header" type="title">Workspace interaction fixtures</ThemedText>
      <View style={styles.controls}>
        <ActionButton label={worst ? 'Use demo data' : 'Use worst-case data'} onPress={() => { setWorst(!worst); setSavedTask(null); }} variant="secondary" />
        <ActionButton label={fail ? 'Use slow success' : 'Use slow failure'} onPress={() => setFail(!fail)} variant="secondary" />
        <ActionButton label={loading ? 'Resolve loading' : 'Show loading'} onPress={() => setLoading(!loading)} variant="secondary" />
        <ActionButton label={shortBoard ? 'Use full board height' : 'Use short board height'} onPress={() => setShortBoard(!shortBoard)} variant="secondary" />
        <ActionButton disabled={busy} label={manualResponses ? 'Use timed responses' : 'Use manual responses'} onPress={() => setManualResponses(!manualResponses)} variant="secondary" />
        {awaitingSend ? <ActionButton label="Resolve pending send" onPress={() => releaseSend.current?.()} variant="secondary" /> : null}
      </View>
      <ProjectAttention items={[]} loading={loading} onLoadMore={() => setLoading(true)} onOpen={() => {}} />
      <ProjectDirectoryCard channels={[]} expanded={expanded} item={project(worst)} loadingChannels={loading} onLoadMoreChannels={() => setLoading(true)} onOpenChannel={() => {}} onOpenProject={() => {}} onToggle={() => setExpanded(!expanded)} />
      <ThemedText accessibilityRole="header" type="subtitle">Task board: moves take two seconds</ThemedText>
      <View accessibilityLabel="Board viewport fixture" style={[styles.board, shortBoard && styles.shortBoard]}>
        <TaskBoard assigneeName={() => undefined} columns={columns} onOpen={() => {}} readOnly={false} states={states} onMove={async (input) => {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          if (fail) throw new Error('task_conflict');
          const destination = states.find((state) => state._id === input.workflowStateId);
          if (destination) setSavedTask({ ...currentTask, state: destination, task: { ...currentTask.task, workflowStateId: destination._id, revision: currentTask.task.revision + 1 } });
        }} />
      </View>
      <ActionButton label="Open update editor" onPress={() => setComposerOpen(true)} />
      <ThemedText accessibilityLabel="Submission result" type="small">{result}</ThemedText>
    </ScrollView>
    {composerOpen ? <TaskCommentComposer busy={busy} mentionIds={[]} onCancel={() => { draft.current.dismiss(); setComposerOpen(false); }} onChangeText={(text) => { currentValue.current = text; setValue(text); }} onMentionToggle={() => {}} onSend={() => void send()} value={value} /> : null}
  </ThemedView>;
}

const styles = StyleSheet.create({
  board: { height: 560 },
  content: { gap: Spacing.four, padding: Spacing.four, paddingBottom: 100 },
  controls: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  screen: { flex: 1 },
  shortBoard: { height: 300 },
});
