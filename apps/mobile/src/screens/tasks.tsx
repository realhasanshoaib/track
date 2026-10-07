import type { TaskPriority } from '@track/shared/tasks';
import { useMutation, usePaginatedQuery, useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import type { EntityMarkColorKey, EntityMarkIconKey } from '@track/shared';
import { useNetworkState } from 'expo-network';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { api } from '../../../../convex/_generated/api';
import type { Doc, Id } from '../../../../convex/_generated/dataModel';
import { BoardAttentionSheet } from '@/components/board-attention-sheet';
import { DateField } from '@/components/date-field';
import { EmptyState } from '@/components/empty-state';
import { EntityMark } from '@/components/entity-mark';
import { EntityMarkPicker } from '@/components/entity-mark-picker';
import { IconButton } from '@/components/icon-button';
import { PlatformIcon } from '@/components/platform-icon';
import { SkeletonList } from '@/components/skeleton-row';
import { ScreenEntrance } from '@/components/screen-entrance';
import { OptionsSheet, SheetFieldButton, SheetInput, SheetNote, SheetRow, SheetSection } from '@/components/options-sheet';
import type { TaskMoveInput } from '@/components/task-board';
import {
  SuggestionInbox,
  TaskCollection,
  type MobileBoardView,
  type MobileSuggestionView,
  type MobileTaskView,
} from '@/components/task-list-content';
import { TaskAction, TaskStateBanner } from '@/components/task-ui';
import { MyTaskWorkspace } from '@/components/my-task-workspace';
import {
  SprintFlowHeader,
  TaskCreateContext,
  TasksToolbar,
  type TaskViewMode,
} from '@/components/tasks-dashboard';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useBottomTabContentInset } from '@/hooks/use-bottom-tab-inset';
import { useCompany } from '@/contexts/company-context';
import { usePrimaryNavigationVisibility } from '@/contexts/primary-navigation-visibility-context';
import { useTrackUser } from '@/contexts/track-user-context';
import { useTheme } from '@/hooks/use-theme';
import { hapticMedium } from '@/lib/haptics';
import { useReleaseConfig } from '@/lib/release-config';
import { useAppToast } from '@/components/app-toast';
import { enqueueOfflineTask } from '@/lib/offline-task-queue';
import { groupMobileTasksByState, taskDetailHref, taskListHref, type MobileTaskIdentity } from '@/lib/task-navigation';
import { taskPriorityLabel } from '@/lib/task-presentation';
import type { MyTask } from '@/lib/my-task-types';
import { resolveWorkflowStateId, taskMatchesWorkflowStateFilter, visibleBoardStateIds } from '@/lib/task-workflow';
import { taskErrorMessage } from '@/lib/user-facing-error';

type AssigneeView = {
  member: Doc<'projectMembers'>;
  user: { _id: Id<'users'>; displayName: string };
  company: Doc<'companies'> | null;
};

type TaskTab = 'board' | 'inbox';
type CreatePicker = 'assignee' | 'board' | 'priority' | 'status' | null;
type BoardSort = 'manual' | 'due' | 'priority';
type BoardFilter = 'all' | 'open' | 'completed' | 'high';
type GlobalBoardView = FunctionReturnType<typeof api.taskBoards.listMine>[number];
type TaskStatusTarget = {
  identity: {
    actingCompanyId?: Id<'companies'>;
    projectMemberId?: Id<'projectMembers'>;
  };
  states: Doc<'taskWorkflowStates'>[];
  task: {
    _id: Id<'tasks'>;
    boardId: Id<'taskBoards'>;
    revision: number;
    title: string;
    workflowStateId: Id<'taskWorkflowStates'>;
  };
};
const priorities: TaskPriority[] = ['none', 'urgent', 'high', 'medium', 'low'];

function readableError(failure: unknown) {
  return taskErrorMessage(failure, 'The task action failed. Check your connection and try again.');
}

export default function TasksScreen() {
  const theme = useTheme();
  const bottomContentInset = useBottomTabContentInset();
  const router = useRouter();
  const { showToast } = useAppToast();
  const release = useReleaseConfig();
  const network = useNetworkState();
  const { actingCompany, actingCompanyId, companies, setActingCompanyId } = useCompany();
  const { setCreateAction, setCreateContext } = usePrimaryNavigationVisibility();
  const { trackUserId } = useTrackUser();
  const { width: screenWidth, fontScale } = useWindowDimensions();
  const stackCreateFields = screenWidth < 390 || fontScale > 1.2;
  const { projectId, companyId, membershipId, archive, tab: tabParam, suggestionId, boardId: routeBoardId, groupId: routeGroupId, taskId: focusedTaskId, create: createParam, dueDate: createDueDate, view: viewParam } = useLocalSearchParams<{
    projectId?: string;
    companyId?: string;
    membershipId?: string;
    archive?: string;
    tab?: string;
    suggestionId?: string;
    boardId?: string;
    groupId?: string;
    taskId?: string;
    create?: string;
    dueDate?: string;
    view?: string;
  }>();
  const project = projectId as Id<'projects'>;
  const identity: MobileTaskIdentity | null = companyId && membershipId ? {
    archived: archive === '1',
    companyId: companyId as Id<'companies'>,
    membershipId: membershipId as Id<'projectMembers'>,
  } : null;
  const queryIdentity = identity ? {
    actingCompanyId: identity.companyId,
    projectMemberId: identity.membershipId,
  } : {};
  const readOnly = archive === '1';
  const offline = network.isConnected === false || network.isInternetReachable === false;
  const currentUser = useQuery(api.auth.getCurrentUser);
  const projectNavigation = useQuery(api.mobile.resolveNavigation, trackUserId && projectId ? {
    userId: trackUserId,
    projectId: project,
    actingCompanyId: identity?.companyId,
    projectMemberId: identity?.membershipId,
  } : 'skip');
  const boards = useQuery(api.taskBoards.list, release.tasks && projectId ? {
    projectId: project,
    ...queryIdentity,
  } : 'skip') as MobileBoardView[] | undefined;
  const assignees = useQuery(api.tasks.listEligibleAssignees, release.tasks && projectId && !readOnly ? {
    projectId: project,
    ...queryIdentity,
  } : 'skip') as AssigneeView[] | undefined;
  const [tab, setTab] = useState<TaskTab>(tabParam === 'inbox' ? 'inbox' : 'board');
  const [boardId, setBoardId] = useState<string>(routeBoardId ?? '');
  const selectedBoard = boards?.find((item) => item.board._id === boardId)
    ?? boards?.find((item) => routeGroupId && item.board.groupId === routeGroupId)
    ?? boards?.find((item) => item.board.isDefault)
    ?? boards?.[0];
  const tasks = useQuery(api.tasks.list, release.tasks && projectId && tab !== 'inbox' ? {
    projectId: project,
    boardId: selectedBoard?.board._id,
    ...queryIdentity,
  } : 'skip') as MobileTaskView[] | undefined;
  const attentionTasks = useMemo(() => {
    const completedStateIds = new Set((selectedBoard?.states ?? [])
      .filter((state) => state.category === 'completed')
      .map((state) => String(state._id)));
    return (tasks ?? [])
      .filter((item) => item.task.priority === 'urgent' || item.task.priority === 'high')
      .filter((item) => !completedStateIds.has(String(item.task.workflowStateId)))
      .sort((left, right) =>
        (left.task.priority === 'urgent' ? 0 : 1) - (right.task.priority === 'urgent' ? 0 : 1)
        || right.task.updatedAt - left.task.updatedAt,
      )
      .slice(0, 4);
  }, [selectedBoard?.states, tasks]);
  const activeCompanies = useMemo(() => (companies ?? []).filter(({ company }) => company?.status === 'active'), [companies]);
  const companyOptions = useMemo(() => activeCompanies.flatMap(({ company }) => company ? [{
    id: company._id,
    logoUrl: company.logoUrl,
    name: company.displayName,
  }] : []), [activeCompanies]);
  useEffect(() => {
    if (!actingCompanyId && activeCompanies[0]?.company?._id) setActingCompanyId(activeCompanies[0].company._id);
  }, [actingCompanyId, activeCompanies, setActingCompanyId]);
  const projectDirectoryPages = usePaginatedQuery(api.mobile.listTaskProjects, release.tasks && !projectId && trackUserId && actingCompanyId ? {
    userId: trackUserId,
    actingCompanyId,
  } : 'skip', { initialNumItems: 12 });
  const projectDirectory = useMemo(() => (projectDirectoryPages.results as Array<FunctionReturnType<typeof api.mobile.listTaskProjects>['page'][number]>)
    .filter((item): item is NonNullable<typeof item> => Boolean(item && item.membership.status === 'active')),
  [projectDirectoryPages.results]);
  const globalBoards = useQuery(api.taskBoards.listMine, release.tasks && !projectId ? {
    actingCompanyId: actingCompanyId ?? undefined,
  } : 'skip') as GlobalBoardView[] | undefined;
  const assignedTaskPages = usePaginatedQuery(
    api.mobile.listMyTasks,
    release.tasks && !projectId && trackUserId
      ? { userId: trackUserId, actingCompanyId: actingCompanyId ?? undefined }
      : 'skip',
    { initialNumItems: 12 },
  );
  const assignedTaskRows = useMemo(() => assignedTaskPages.results.filter((item): item is MyTask =>
    Boolean(item && (!actingCompanyId || String(item.companyId ?? '') === String(actingCompanyId))),
  ), [actingCompanyId, assignedTaskPages.results]);
  const companyBoards = useMemo(() =>
    globalBoards?.filter((item) => String(item.companyId ?? '') === String(actingCompanyId ?? '')) ?? [],
  [actingCompanyId, globalBoards]);
  const suggestions = useQuery(api.taskSuggestions.list, release.tasks && projectId && !readOnly ? {
    projectId: project,
    ...queryIdentity,
  } : 'skip') as MobileSuggestionView[] | undefined;
  const createTask = useMutation(api.tasks.create);
  const moveTask = useMutation(api.tasks.moveTask);
  const acceptSuggestion = useMutation(api.taskSuggestions.accept);
  const dismissSuggestion = useMutation(api.taskSuggestions.dismiss);
  const hideSuggestion = useMutation(api.taskSuggestions.hide);
  const linkSuggestion = useMutation(api.taskSuggestions.linkToExisting);
  const updateBoardMark = useMutation(api.taskBoards.update);
  const [createOpen, setCreateOpen] = useState(false);
  const [createProjectDropdownOpen, setCreateProjectDropdownOpen] = useState(false);
  const [selectedCreateProjectId, setSelectedCreateProjectId] = useState<Id<'projects'> | null>(null);
  const [boardOpen, setBoardOpen] = useState(false);
  const [boardMarkTarget, setBoardMarkTarget] = useState<MobileBoardView | null>(null);
  const [boardMarkIconKey, setBoardMarkIconKey] = useState<EntityMarkIconKey | ''>('');
  const [boardMarkColorKey, setBoardMarkColorKey] = useState<EntityMarkColorKey | ''>('');
  const [boardMarkSaving, setBoardMarkSaving] = useState(false);
  const [boardAttentionOpen, setBoardAttentionOpen] = useState(false);
  const [statusTarget, setStatusTarget] = useState<TaskStatusTarget | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [createBoardId, setCreateBoardId] = useState('');
  const [createWorkflowStateId, setCreateWorkflowStateId] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('none');
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [assigneeId, setAssigneeId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [assignedTaskConfirmation, setAssignedTaskConfirmation] = useState<{ task: MyTask; stateId: string } | null>(null);
  const [boardSearch, setBoardSearch] = useState('');
  const [activeBoardStateId, setActiveBoardStateId] = useState('');
  const [boardSort, setBoardSort] = useState<BoardSort>('manual');
  const [boardFilter, setBoardFilter] = useState<BoardFilter>('all');
  const [statusFilterId, setStatusFilterId] = useState('');
  const [hideEmptyColumns, setHideEmptyColumns] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [createPicker, setCreatePicker] = useState<CreatePicker>(null);
  const [viewMode, setViewMode] = useState<TaskViewMode>(viewParam === 'list' ? 'list' : 'board');

  useEffect(() => {
    setSelectedCreateProjectId(null);
  }, [actingCompanyId]);

  useEffect(() => {
    if (!boardMarkTarget) return;
    setBoardMarkIconKey((boardMarkTarget.board.markIconKey as EntityMarkIconKey | undefined) ?? '');
    setBoardMarkColorKey((boardMarkTarget.board.markColorKey as EntityMarkColorKey | undefined) ?? '');
  }, [boardMarkTarget]);

  async function saveBoardMark() {
    if (!boardMarkTarget) return;
    setBoardMarkSaving(true);
    try {
      await updateBoardMark({
        actingCompanyId: identity?.companyId,
        boardId: boardMarkTarget.board._id,
        description: boardMarkTarget.board.description ?? null,
        markColorKey: boardMarkColorKey || null,
        markIconKey: boardMarkIconKey || null,
        name: boardMarkTarget.board.name,
        projectMemberId: identity?.membershipId,
      });
      setBoardMarkTarget(null);
    } catch (failure) {
      setError(readableError(failure));
    } finally {
      setBoardMarkSaving(false);
    }
  }

  useLayoutEffect(() => {
    if (createParam !== '1') {
      setCreateProjectDropdownOpen(false);
      return;
    }
    setCreateOpen(true);
    setCreateProjectDropdownOpen(false);
  }, [createParam, projectId]);

  useFocusEffect(useCallback(() => {
    setCreateAction(() => {
      if (readOnly) return;
      if (projectId) {
        setDueDate(createDueDate ?? null);
        setCreateOpen(true);
      } else {
        setCreateProjectDropdownOpen(false);
        setCreateOpen(true);
      }
    });
    if (!projectId) {
      setCreateContext(null);
      return () => {
        setCreateAction(null);
        setCreateContext(null);
      };
    }
    setCreateContext({ archive: archive === '1', companyId, groupId: routeGroupId, membershipId, projectId, scope: routeGroupId ? 'channel' : 'project' });
    return () => {
      setCreateAction(null);
      setCreateContext(null);
    };
  }, [archive, companyId, createDueDate, membershipId, projectId, readOnly, routeGroupId, setCreateAction, setCreateContext]));

  // Keep route-driven navigation authoritative when the bottom bar changes
  // project or opens/closes the task suggestion inbox without remounting this
  // screen.
  useEffect(() => {
    setTab(tabParam === 'inbox' ? 'inbox' : 'board');
    setBoardId(routeBoardId ?? '');
    setViewMode(viewParam === 'list' ? 'list' : 'board');
    setError('');
  }, [projectId, routeBoardId, tabParam, viewParam]);

  useLayoutEffect(() => {
    if (createParam !== '1' || !projectId || readOnly) return;
    setCreateOpen(true);
    setDueDate(createDueDate ?? null);
  }, [createDueDate, createParam, projectId, readOnly]);

  useEffect(() => {
    if (createParam !== '1' || projectId || projectDirectoryPages.status !== 'Exhausted' || projectDirectory.length !== 1) return;
    const onlyProject = projectDirectory[0];
    if (onlyProject) selectCreateProject(onlyProject);
  }, [createParam, projectDirectory, projectDirectoryPages.status, projectId]);

  const selectedCreateProject = projectId
    ? undefined
    : projectDirectory.find((item) => item.project._id === selectedCreateProjectId);
  const createScopeProjectId = projectId ? project : selectedCreateProject?.project._id;
  const createScopeIdentity: MobileTaskIdentity | null = projectId
    ? identity
    : selectedCreateProject?.membership.companyId
      ? {
        companyId: selectedCreateProject.membership.companyId,
        membershipId: selectedCreateProject.membership._id,
      }
      : null;
  const createScopeQueryIdentity = createScopeIdentity ? {
    actingCompanyId: createScopeIdentity.companyId,
    projectMemberId: createScopeIdentity.membershipId,
  } : {};
  const availableCreateBoards = projectId
    ? boards
    : globalBoards?.filter((item) => item.project._id === createScopeProjectId)
      .map(({ board, states, canManageMark }) => ({ board, states, canManageMark }));
  const selectedCreateBoard = availableCreateBoards?.find((item) => item.board._id === createBoardId)
    ?? (projectId ? selectedBoard : undefined)
    ?? availableCreateBoards?.find((item) => !item.board.groupId && item.board.isDefault)
    ?? availableCreateBoards?.find((item) => item.board.isDefault)
    ?? availableCreateBoards?.[0];
  const createBoardsLoading = Boolean(createScopeProjectId && (projectId ? boards === undefined : globalBoards === undefined));
  const createAssignees = useQuery(api.tasks.listEligibleAssignees, release.tasks && createScopeProjectId && !readOnly ? {
    projectId: createScopeProjectId,
    groupId: selectedCreateBoard?.board.groupId,
    ...createScopeQueryIdentity,
  } : 'skip') as AssigneeView[] | undefined;
  const currentMemberId = createScopeIdentity?.membershipId
    ?? createAssignees?.find((item) => item.user._id === currentUser?._id)?.member._id;
  const currentMember = createAssignees?.find((item) => item.member._id === currentMemberId);
  const canAssignOthers = currentMember
    ? ['owner', 'admin', 'staff', 'manager'].includes(currentMember.member.role)
    : false;
  const assignableCreateAssignees = canAssignOthers
    ? createAssignees
    : createAssignees?.filter((item) => item.member._id === currentMemberId);
  const selectedCreateAssigneeId = assignableCreateAssignees?.some((item) =>
    item.member._id === assigneeId,
  ) ? assigneeId : '';

  function closeCreateSheet() {
    setCreatePicker(null);
    setCreateProjectDropdownOpen(false);
    setCreateOpen(false);
    setSelectedCreateProjectId(null);
    if (createParam) router.setParams({ create: undefined, dueDate: undefined });
  }

  function selectCreateProject(item: NonNullable<typeof projectDirectory[number]>) {
    setSelectedCreateProjectId(item.project._id);
    setCreateProjectDropdownOpen(false);
    setCreateBoardId('');
    setCreateWorkflowStateId('');
    setAssigneeId('');
    setError('');
  }

  useEffect(() => {
    if (!createOpen || !selectedCreateBoard) return;
    setCreateWorkflowStateId((current) =>
      resolveWorkflowStateId(selectedCreateBoard.states, current),
    );
  }, [createOpen, selectedCreateBoard]);

  useEffect(() => {
    if (!statusFilterId || selectedBoard?.states.some((state) => state._id === statusFilterId)) return;
    setStatusFilterId('');
  }, [selectedBoard, statusFilterId]);

  const columns = useMemo(() => {
    if (!selectedBoard) return [];
    const search = boardSearch.trim().toLowerCase();
    const priorityRank: Record<TaskPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };
    const seenTaskIds = new Set<string>();
    const visibleTasks = (tasks ?? [])
      .filter((item) => {
        if (seenTaskIds.has(item.task._id)) return false;
        seenTaskIds.add(item.task._id);
        return true;
      })
      .filter((item) => !search || `${item.task.title} ${'description' in item.task ? item.task.description ?? '' : ''}`.toLowerCase().includes(search))
      .filter((item) => boardFilter === 'all'
        || (boardFilter === 'completed' && item.state?.category === 'completed')
        || (boardFilter === 'open' && item.state?.category !== 'completed' && item.state?.category !== 'canceled')
        || (boardFilter === 'high' && (item.task.priority === 'urgent' || item.task.priority === 'high')))
      .filter((item) => taskMatchesWorkflowStateFilter(item.task.workflowStateId, statusFilterId))
      .sort((a, b) => {
        if (boardSort === 'priority') return priorityRank[a.task.priority] - priorityRank[b.task.priority];
        if (boardSort === 'due') return (a.task.dueDate ?? '9999-12-31').localeCompare(b.task.dueDate ?? '9999-12-31');
        return a.task.rank.localeCompare(b.task.rank);
      });
    const grouped = groupMobileTasksByState(
      selectedBoard.states.map((state) => state._id),
      visibleTasks,
    );
    const allColumns = selectedBoard.states.map((state, index) => ({
      state,
      tasks: grouped[index].tasks,
    }));
    const visibleStateIds = new Set(visibleBoardStateIds(
      allColumns.map((column) => ({ _id: column.state._id, taskCount: column.tasks.length })),
      statusFilterId,
      hideEmptyColumns,
    ));
    return allColumns.filter((column) => visibleStateIds.has(column.state._id));
  }, [boardFilter, boardSearch, boardSort, hideEmptyColumns, selectedBoard, statusFilterId, tasks]);
  const statusStates = statusTarget?.states ?? [];
  const visibleTaskCount = columns.reduce((count, column) => count + column.tasks.length, 0);
  useEffect(() => {
    setActiveBoardStateId((current) =>
      columns.some((column) => column.state._id === current)
        ? current
        : columns[0]?.state._id ?? '',
    );
  }, [columns]);
  const visibleProjectTasks = useMemo(() => {
    const list = columns.flatMap((column) => column.tasks);
    if (boardSort === 'due') {
      return list.sort((left, right) =>
        (left.task.dueDate ?? '9999-12-31').localeCompare(right.task.dueDate ?? '9999-12-31'));
    }
    if (boardSort === 'priority') {
      const rank: Record<TaskPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };
      return list.sort((left, right) => rank[left.task.priority] - rank[right.task.priority]);
    }
    return list;
  }, [boardSort, columns]);

  async function move(input: TaskMoveInput) {
    await moveTask({ ...input, ...queryIdentity });
    hapticMedium();
  }

  function moveToState(state: Doc<'taskWorkflowStates'>) {
    const target = statusTarget;
    setStatusTarget(null);
    if (!target || state._id === target.task.workflowStateId) return;
    void moveTask({
      expectedRevision: target.task.revision,
      taskId: target.task._id,
      workflowStateId: state._id,
      ...target.identity,
    }).then(() => hapticMedium()).catch((failure) => setError(readableError(failure)));
  }

  function openProjectTaskStatus(item: MobileTaskView) {
    const board = boards?.find((candidate) => candidate.board._id === item.task.boardId);
    if (!board) {
      setError('Task statuses are unavailable right now.');
      return;
    }
    setStatusTarget({ identity: queryIdentity, states: board.states, task: item.task });
  }

  function moveAssignedTaskToState(item: MyTask, workflowStateId: string, confirmOpenSubtasks = false) {
    const taskIdentity = item.companyId
      ? { actingCompanyId: item.companyId, projectMemberId: item.projectMemberId }
      : {};
    void moveTask({
      expectedRevision: item.task.revision,
      taskId: item.task._id,
      workflowStateId: workflowStateId as Id<'taskWorkflowStates'>,
      ...(confirmOpenSubtasks ? { confirmOpenSubtasks: true } : {}),
      ...taskIdentity,
    }).then(() => hapticMedium()).catch((failure) => {
      if (!confirmOpenSubtasks && failure instanceof Error && failure.message.includes('task_open_subtasks_confirmation_required')) {
        setAssignedTaskConfirmation({ task: item, stateId: workflowStateId });
        return;
      }
      setError(readableError(failure));
    });
  }

  function assigneeName(item: MobileTaskView) {
    if (!item.task.assigneeProjectMemberId) return undefined;
    return assignees?.find((candidate) => candidate.member._id === item.task.assigneeProjectMemberId)?.user.displayName
      ?? (item.assignee ? 'Assigned member' : undefined);
  }

  async function create() {
    if (!title.trim() || !createScopeProjectId || createBoardsLoading) return;
    setBusy(true);
    setError('');
    try {
      const taskInput = {
        projectId: createScopeProjectId,
        boardId: selectedCreateBoard?.board._id,
        groupId: selectedCreateBoard?.board.groupId,
        workflowStateId: createWorkflowStateId
          ? createWorkflowStateId as Id<'taskWorkflowStates'>
          : undefined,
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        dueDate: dueDate ?? undefined,
        assigneeProjectMemberId: selectedCreateAssigneeId
          ? selectedCreateAssigneeId as Id<'projectMembers'>
          : undefined,
        idempotencyKey: `${Date.now()}-${Math.random()}`,
        ...createScopeQueryIdentity,
      };
      if (offline && trackUserId) {
        await enqueueOfflineTask(trackUserId, taskInput);
        hapticMedium();
        closeCreateSheet();
        setTitle('');
        setDescription('');
        setCreateBoardId('');
        setCreateWorkflowStateId('');
        setPriority('none');
        setDueDate(null);
        setAssigneeId('');
        showToast({ title: 'Task saved offline', message: 'It will sync when your connection returns.', tone: 'info' });
        return;
      }
      const result = await createTask(taskInput);
      hapticMedium();
      closeCreateSheet();
      setTitle('');
      setDescription('');
      setCreateBoardId('');
      setCreateWorkflowStateId('');
      setPriority('none');
      setDueDate(null);
      setAssigneeId('');
      router.push(taskDetailHref(createScopeProjectId, result.publicKey, createScopeIdentity));
    } catch (failure) {
      setError(readableError(failure));
    } finally {
      setBusy(false);
    }
  }

  async function runSuggestion(action: () => Promise<unknown>) {
    setError('');
    try {
      await action();
      hapticMedium();
    } catch (failure) {
      setError(readableError(failure));
    }
  }

  function suggestionDestination(row: MobileSuggestionView) {
    const compatible = boards?.filter((item) => item.board.groupId === row.suggestion.groupId) ?? [];
    return compatible.find((item) => item.board.isDefault) ?? compatible[0];
  }

  function accept(row: MobileSuggestionView) {
    const destination = suggestionDestination(row);
    if (!destination) {
      setError('No compatible board is available for this suggestion.');
      return;
    }
    void runSuggestion(() => acceptSuggestion({
      suggestionId: row.suggestion._id,
      boardId: destination.board._id,
      title: row.suggestion.proposedTitle,
      description: row.suggestion.proposedDescription,
      priority: row.suggestion.proposedPriority,
      dueDate: row.suggestion.proposedDueDate,
      assigneeProjectMemberId: row.suggestion.proposedAssigneeProjectMemberId,
      duplicateOverride: Boolean(row.possibleDuplicateTask),
      idempotencyKey: `${Date.now()}-${row.suggestion._id}`,
      ...queryIdentity,
    }));
  }

  const createTaskSheet = (
    <OptionsSheet
      onClose={closeCreateSheet}
      title={createPicker ? `Choose ${createPicker}` : 'Create task'}
      visible={createOpen}>
      {createPicker ? (
        <>
          <SheetSection><SheetRow icon="chevron-left" label="Back to task" onPress={() => setCreatePicker(null)} /></SheetSection>
          {createPicker === 'board' ? <SheetSection title="Board">
            {availableCreateBoards?.map((item) => <SheetRow leading={<EntityMark colorKey={item.board.markColorKey} iconKey={item.board.markIconKey} id={String(item.board._id)} kind="board" name={item.board.name} size={36} />} key={item.board._id} label={item.board.name} selected={item.board._id === selectedCreateBoard?.board._id} onPress={() => {
              setCreateBoardId(item.board._id);
              setCreateWorkflowStateId(resolveWorkflowStateId(item.states));
              setCreatePicker(null);
            }} />)}
          </SheetSection> : null}
          {createPicker === 'status' ? <SheetSection title="Status">
            {selectedCreateBoard?.states.map((state) => <SheetRow icon={state.category === 'completed' ? 'check-circle' : 'circle-outline'} key={state._id} label={state.name} selected={createWorkflowStateId === state._id} onPress={() => { setCreateWorkflowStateId(state._id); setCreatePicker(null); }} />)}
            {availableCreateBoards && (!selectedCreateBoard || selectedCreateBoard.states.length === 0) ? <SheetNote>No active statuses are available for this board.</SheetNote> : null}
          </SheetSection> : null}
          {createPicker === 'priority' ? <SheetSection title="Priority">
            {priorities.map((value) => <SheetRow icon="flag" key={value} label={taskPriorityLabel(value)} selected={priority === value} onPress={() => { setPriority(value); setCreatePicker(null); }} />)}
          </SheetSection> : null}
          {createPicker === 'assignee' ? <SheetSection title="Assignee">
            <SheetRow icon="person" label="Unassigned" selected={!selectedCreateAssigneeId} onPress={() => { setAssigneeId(''); setCreatePicker(null); }} />
            {assignableCreateAssignees?.map((item) => <SheetRow icon="person" key={item.member._id} label={[item.user.displayName, item.company?.displayName].filter(Boolean).join(' ')} selected={selectedCreateAssigneeId === item.member._id} onPress={() => { setAssigneeId(item.member._id); setCreatePicker(null); }} />)}
          </SheetSection> : null}
        </>
      ) : (
        <>
          {projectId ? <TaskCreateContext
            boardName={selectedCreateBoard?.board.name}
            projectName={projectNavigation?.available && projectNavigation.project
              ? projectNavigation.project.name
              : 'Project'}
          /> : <>
            <SheetFieldButton
              expanded={createProjectDropdownOpen}
              icon="project"
              label="Project"
              onPress={() => setCreateProjectDropdownOpen((open) => !open)}
              placeholder="Choose a Project"
              value={selectedCreateProject?.project.name}
            />
            {createProjectDropdownOpen ? <SheetSection title={actingCompany?.company?.displayName ?? 'Accessible Projects'}>
              {projectDirectory.map((item) => (
                <SheetRow
                  detail={item.membership.role ?? undefined}
                  key={item.project._id}
                  label={item.project.name}
                  leading={<EntityMark colorKey={item.project.markColorKey} iconKey={item.project.markIconKey} id={String(item.project._id)} kind="project" name={item.project.name} size={36} />}
                  onPress={() => selectCreateProject(item)}
                />
              ))}
              {projectDirectoryPages.status === 'LoadingFirstPage' ? <SkeletonList count={3} label="Loading Projects" /> : null}
              {projectDirectoryPages.status === 'LoadingMore' ? <SheetNote>Loading more Projects…</SheetNote> : null}
              {projectDirectoryPages.status === 'CanLoadMore' ? <SheetRow icon="chevron-down" label="Load more Projects" onPress={() => projectDirectoryPages.loadMore(30)} /> : null}
              {projectDirectoryPages.status === 'Exhausted' && projectDirectory.length === 0 ? <EmptyState icon="project" title="No accessible Projects" body="Join a Project before creating a task." /> : null}
            </SheetSection> : null}
          </>}
          {!createScopeProjectId ? <SheetNote>Choose a Project to set task access and choose a Board.</SheetNote> : null}
          {createScopeProjectId ? <SheetInput label="Task title" maxLength={180} onChangeText={setTitle} value={title} /> : null}
          {createScopeProjectId ? <View style={[styles.fieldGrid, stackCreateFields && styles.fieldGridLarge]}>
            <View style={[styles.fieldCell, stackCreateFields && styles.fieldCellStacked]}><DateField onChange={setDueDate} value={dueDate} /></View>
            <View style={[styles.fieldCell, stackCreateFields && styles.fieldCellStacked]}>
              <SheetFieldButton icon="person" label="Assignee" onClear={selectedCreateAssigneeId ? () => setAssigneeId('') : undefined} onPress={() => setCreatePicker('assignee')} placeholder="Unassigned" value={assignableCreateAssignees?.find((item) => item.member._id === selectedCreateAssigneeId)?.user.displayName} />
            </View>
            <View style={[styles.fieldCell, stackCreateFields && styles.fieldCellStacked]}>
              <SheetFieldButton icon="circle-outline" label="Status" onPress={() => setCreatePicker('status')} value={selectedCreateBoard?.states.find((state) => state._id === createWorkflowStateId)?.name} />
            </View>
            <View style={[styles.fieldCell, stackCreateFields && styles.fieldCellStacked]}>
              <SheetFieldButton icon="flag" label="Priority" onPress={() => setCreatePicker('priority')} value={taskPriorityLabel(priority)} />
            </View>
          </View> : null}
          {createScopeProjectId ? <SheetInput label="Description (optional)" maxLength={4000} multiline onChangeText={setDescription} value={description} /> : null}
          {createScopeProjectId && availableCreateBoards && availableCreateBoards.length > 1 ? <SheetFieldButton icon="view-board" label="Board" onPress={() => setCreatePicker('board')} value={selectedCreateBoard?.board.name} /> : null}
          {error ? <ThemedText themeColor="danger" type="small">{error}</ThemedText> : null}
          {createScopeProjectId ? <TaskAction disabled={createBoardsLoading || busy || !title.trim()} label={busy ? 'Creating...' : 'Create task'} onPress={() => void create()} primary /> : null}
        </>
      )}
    </OptionsSheet>
  );

  if (!release.tasks) {
    return (
      <ThemedView style={styles.screen}>
        <Stack.Screen options={{ title: 'Tasks unavailable' }} />
        <EmptyState icon="task" title="Tasks are unavailable here yet" body="You can still use Project conversations while task tools are unavailable." />
      </ThemedView>
    );
  }

  if (!projectId) {
    const hasMoreProjects = projectDirectoryPages.status === 'CanLoadMore'
      || projectDirectoryPages.status === 'LoadingMore'
      || assignedTaskPages.status === 'CanLoadMore'
      || assignedTaskPages.status === 'LoadingMore';
    const isLoadingMoreProjects = projectDirectoryPages.status === 'LoadingMore'
      || assignedTaskPages.status === 'LoadingMore';
    return (
      <MyTaskWorkspace
        assignedTasks={assignedTaskRows}
        confirmationStateId={assignedTaskConfirmation?.stateId ?? null}
        confirmationTask={assignedTaskConfirmation?.task ?? null}
        boards={companyBoards}
        boardsLoading={globalBoards === undefined}
        companyName={actingCompany?.company?.displayName ?? 'All Companies'}
        companyId={actingCompanyId}
        companyLogoUrl={actingCompany?.company?.logoUrl ?? null}
        companyOptions={companyOptions}
        createTaskSheet={createTaskSheet}
        error={error}
        hasMoreProjects={hasMoreProjects}
        isLoading={assignedTaskPages.status === 'LoadingFirstPage'}
        isLoadingMoreProjects={isLoadingMoreProjects}
        isOffline={offline}
        onDismissError={() => setError('')}
        onLoadMoreProjects={() => {
          if (projectDirectoryPages.status === 'CanLoadMore') projectDirectoryPages.loadMore(12);
          if (assignedTaskPages.status === 'CanLoadMore') assignedTaskPages.loadMore(12);
        }}
        onOpenBoard={(item) => {
          const targetIdentity = item.companyId ? { companyId: item.companyId, membershipId: item.projectMemberId } : null;
          router.push(taskListHref(item.project._id, targetIdentity, undefined, undefined, { boardId: item.board._id }) as never);
        }}
        onOpenTask={(item) => {
          const taskIdentity = item.companyId ? { companyId: item.companyId, membershipId: item.projectMemberId } : null;
          router.push(taskDetailHref(item.project._id, item.task.publicKey, taskIdentity));
        }}
        onSetTaskStatus={moveAssignedTaskToState}
        onCancelTaskStatusConfirmation={() => setAssignedTaskConfirmation(null)}
        onConfirmTaskStatus={() => {
          if (!assignedTaskConfirmation) return;
          const pending = assignedTaskConfirmation;
          setAssignedTaskConfirmation(null);
          moveAssignedTaskToState(pending.task, pending.stateId, true);
        }}
        onSelectCompany={setActingCompanyId}
      />
    );
  }

  const heading = (
    <>
      {offline ? <TaskStateBanner icon="cloud-off" message="Offline. Showing saved tasks." tone="offline" /> : null}
      {readOnly ? <TaskStateBanner icon="shield-lock-outline" message="Read-only archive" /> : null}
      {tab !== 'inbox' ? (
        <>
          <TasksToolbar
            boardColorKey={selectedBoard?.board.markColorKey}
            boardIconKey={selectedBoard?.board.markIconKey}
            boardId={selectedBoard ? String(selectedBoard.board._id) : undefined}
            boardName={selectedBoard?.board.name ?? 'Board'}
            filterActive={boardFilter !== 'all' || Boolean(statusFilterId) || boardSort !== 'manual'}
            mode={viewMode}
            onAttentionPress={() => setBoardAttentionOpen(true)}
            onBoardPress={() => setBoardOpen(true)}
            onFilterPress={() => setFilterOpen(true)}
            onModeChange={setViewMode}
            onSearchPress={() => setSearchOpen(true)}
            projectName={projectNavigation?.available && projectNavigation.project
              ? projectNavigation.project.name
              : 'Project tasks'}
            scopeLabel={selectedBoard?.board.groupId ? 'Channel' : 'Project'}
            searchActive={Boolean(boardSearch)}
            taskCount={visibleTaskCount}
          />
          <SprintFlowHeader
            activeStateId={activeBoardStateId || undefined}
            columnCount={columns.length}
            onStatePress={setActiveBoardStateId}
            states={columns.map((column) => column.state)}
            taskCount={visibleTaskCount}
          />
        </>
      ) : (
        <View style={styles.inboxHeading}>
          <ThemedText type="subtitle">Conversation suggestions</ThemedText>
          <ThemedText themeColor="textSecondary" type="small">
            Review grounded work detected from the conversations you can access.
          </ThemedText>
        </View>
      )}
      {error ? (
        <TaskStateBanner
          action={{ label: 'Dismiss', onPress: () => setError('') }}
          icon="refresh"
          message={error}
          tone="danger"
        />
      ) : null}
    </>
  );

  const collection = (
    <TaskCollection
      activeBoardStateId={activeBoardStateId}
      assigneeName={assigneeName}
      columns={columns}
      focusedTaskId={focusedTaskId}
      onActiveBoardStateChange={setActiveBoardStateId}
      onCreate={() => setCreateOpen(true)}
      onMove={move}
      onOpen={(item) => router.push(taskDetailHref(project, item.task.publicKey, identity))}
      onStatusPress={openProjectTaskStatus}
      onViewAll={() => undefined}
      readOnly={readOnly}
      selectedBoard={selectedBoard}
      tab={viewMode === 'board' ? 'board' : 'all'}
      tasks={boards === undefined ? undefined : viewMode === 'board' ? tasks : visibleProjectTasks}
    />
  );

  return (
    <ThemedView style={styles.screen}>
      <Stack.Screen options={{
        title: 'Tasks',
        headerBackVisible: false,
        headerLargeTitle: false,
        headerTransparent: false,
        headerRight: tab === 'inbox' ? () => <IconButton accessibilityLabel="Return to task board" icon="arrow-left" onPress={() => setTab('board')} /> : undefined,
      }} />

      {tab === 'board' && viewMode === 'board' ? (
        <ScreenEntrance style={styles.screenContent}><View style={[styles.boardScreen, { paddingBottom: bottomContentInset + TouchTarget + Spacing.four }]}>
          {heading}
          {collection}
        </View></ScreenEntrance>
      ) : tab === 'inbox' ? (
        <ScreenEntrance style={styles.screenContent}><ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: bottomContentInset + TouchTarget + Spacing.four }]}
          contentInsetAdjustmentBehavior="automatic"
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled">
          {heading}
          <SuggestionInbox
                focusedSuggestionId={suggestionId}
                onAccept={accept}
                onDismiss={(row) => void runSuggestion(() => dismissSuggestion({
                  suggestionId: row.suggestion._id,
                  reason: 'not_actionable',
                  idempotencyKey: `${Date.now()}-dismiss`,
                  ...queryIdentity,
                }))}
                onHide={(row) => void runSuggestion(() => hideSuggestion({
                  suggestionId: row.suggestion._id,
                  ...queryIdentity,
                }))}
                onLink={(row) => row.possibleDuplicateTask && void runSuggestion(() => linkSuggestion({
                  suggestionId: row.suggestion._id,
                  taskId: row.possibleDuplicateTask!._id,
                  idempotencyKey: `${Date.now()}-link`,
                  ...queryIdentity,
                }))}
                readOnly={readOnly}
                suggestions={suggestions}
              />
        </ScrollView></ScreenEntrance>
      ) : (
        <ScreenEntrance style={styles.screenContent}>
          <TaskCollection
            activeBoardStateId={activeBoardStateId}
            assigneeName={assigneeName}
            bottomPadding={bottomContentInset + TouchTarget + Spacing.four}
            columns={columns}
            focusedTaskId={focusedTaskId}
            listHeader={heading}
            onActiveBoardStateChange={setActiveBoardStateId}
            onCreate={() => setCreateOpen(true)}
            onMove={move}
            onOpen={(item) => router.push(taskDetailHref(project, item.task.publicKey, identity))}
            onStatusPress={openProjectTaskStatus}
            onViewAll={() => undefined}
            readOnly={readOnly}
            selectedBoard={selectedBoard}
            tab={viewMode === 'board' ? 'board' : 'all'}
            tasks={boards === undefined ? undefined : viewMode === 'board' ? tasks : visibleProjectTasks}
          />
        </ScreenEntrance>
      )}

      <OptionsSheet onClose={() => setStatusTarget(null)} title="Move to" visible={Boolean(statusTarget)}>
        <SheetSection title={statusTarget?.task.title}>
          {statusStates.map((state) => (
            <SheetRow
              icon={state.category === 'completed' ? 'check-circle' : 'circle-outline'}
              key={state._id}
              label={state.name}
              onPress={() => moveToState(state)}
              selected={state._id === statusTarget?.task.workflowStateId}
            />
          ))}
          {statusStates.length === 0 ? (
            <SheetNote>
              No active statuses are available for this task.
            </SheetNote>
          ) : null}
        </SheetSection>
      </OptionsSheet>

      <OptionsSheet
        onClose={() => boardMarkTarget ? setBoardMarkTarget(null) : setBoardOpen(false)}
        title={boardMarkTarget ? `Edit ${boardMarkTarget.board.name} mark` : 'Choose board'}
        visible={boardOpen}
      >
        {boardMarkTarget ? <>
          <SheetRow icon="chevron-left" label="Back to Boards" onPress={() => setBoardMarkTarget(null)} />
          <View style={[styles.boardMarkPreview, { backgroundColor: theme.homeSurface, borderColor: theme.homeBorder }]}>
            <EntityMark
              colorKey={boardMarkColorKey || null}
              iconKey={boardMarkIconKey || null}
              id={String(boardMarkTarget.board._id)}
              kind="board"
              name={boardMarkTarget.board.name}
              size={48}
            />
            <View style={styles.boardMarkPreviewCopy}>
              <ThemedText numberOfLines={1} type="smallBold">{boardMarkTarget.board.name}</ThemedText>
              <ThemedText themeColor="textSecondary" type="caption">Board mark preview</ThemedText>
            </View>
          </View>
          <EntityMarkPicker colorKey={boardMarkColorKey} iconKey={boardMarkIconKey} onColorChange={setBoardMarkColorKey} onIconChange={setBoardMarkIconKey} />
          <TaskAction disabled={boardMarkSaving} label={boardMarkSaving ? 'Saving...' : 'Save Board mark'} onPress={() => void saveBoardMark()} primary />
        </> : <SheetSection title="Boards in this Project">
          {boards?.map((item) => (
            <SheetRow
              detail={item.board.groupId ? 'Channel Board' : undefined}
              key={item.board._id}
              label={item.board.name}
              leading={<EntityMark colorKey={item.board.markColorKey} iconKey={item.board.markIconKey} id={String(item.board._id)} kind="board" name={item.board.name} size={36} />}
              selected={item.board._id === selectedBoard?.board._id}
              onPress={() => {
                setBoardId(item.board._id);
                setBoardOpen(false);
              }}
              trailing={item.canManageMark ? <Pressable
                accessibilityHint={`Changes the icon and color for ${item.board.name}`}
                accessibilityLabel={`Edit ${item.board.name} mark`}
                accessibilityRole="button"
                hitSlop={8}
                onPress={(event) => { event.stopPropagation(); setBoardMarkTarget(item); }}
                style={({ pressed }) => [styles.boardMarkEditButton, { backgroundColor: pressed ? theme.backgroundSelected : 'transparent' }]}
              ><PlatformIcon color={theme.textSecondary} name="edit" size={18} /></Pressable> : undefined}
            />
          ))}
          {boards?.length === 0 ? <SheetNote>No Boards are available in this Project.</SheetNote> : null}
        </SheetSection>}
      </OptionsSheet>

      {createTaskSheet}

      <OptionsSheet onClose={() => setSearchOpen(false)} title="Search tasks" visible={searchOpen}>
        <SheetInput label="Search" maxLength={200} onChangeText={setBoardSearch} placeholder="Search by title or description" value={boardSearch} />
        <TaskAction label="Done" onPress={() => setSearchOpen(false)} primary />
      </OptionsSheet>
      <OptionsSheet onClose={() => setFilterOpen(false)} title="Filter and sort" visible={filterOpen}>
        <SheetSection title="Show">
          <SheetRow icon="check-box-outline" label="All tasks" selected={boardFilter === 'all'} onPress={() => setBoardFilter('all')} />
          <SheetRow icon="circle-outline" label="Open tasks" selected={boardFilter === 'open'} onPress={() => setBoardFilter('open')} />
          <SheetRow icon="check-circle" label="Completed" selected={boardFilter === 'completed'} onPress={() => setBoardFilter('completed')} />
          <SheetRow icon="flag" label="High priority" selected={boardFilter === 'high'} onPress={() => setBoardFilter('high')} />
          <SheetRow accessibilityHint="Shows or hides columns with no tasks" accessibilityRole="checkbox" icon="view-column" label="Hide empty statuses" selected={hideEmptyColumns} onPress={() => setHideEmptyColumns((current) => !current)} />
        </SheetSection>
        <SheetSection title="Status">
          <SheetRow icon="view-column" label="All statuses" selected={!statusFilterId} onPress={() => setStatusFilterId('')} />
          {selectedBoard?.states.map((state) => (
            <SheetRow
              icon={state.category === 'completed' ? 'check-circle' : 'circle-outline'}
              key={state._id}
              label={state.name}
              onPress={() => setStatusFilterId(state._id)}
              selected={statusFilterId === state._id}
            />
          ))}
        </SheetSection>
        <SheetSection title="Order">
          <SheetRow icon="drag-handle" label="Board order" selected={boardSort === 'manual'} onPress={() => setBoardSort('manual')} />
          <SheetRow icon="calendar" label="Due date" selected={boardSort === 'due'} onPress={() => setBoardSort('due')} />
          <SheetRow icon="flag" label="Priority" selected={boardSort === 'priority'} onPress={() => setBoardSort('priority')} />
        </SheetSection>
        <TaskAction label="Done" onPress={() => setFilterOpen(false)} primary />
      </OptionsSheet>
      <BoardAttentionSheet
        attentionTasks={attentionTasks}
        attentionTasksLoading={tasks === undefined}
        boardName={selectedBoard?.board.name ?? 'Board'}
        onClose={() => setBoardAttentionOpen(false)}
        onOpenTask={(item) => {
          setBoardAttentionOpen(false);
          router.push(taskDetailHref(project, item.task.publicKey, identity));
        }}
        visible={boardAttentionOpen && tab !== 'inbox'}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  boardScreen: { flex: 1, gap: Spacing.three, padding: Spacing.four, paddingTop: Platform.OS === 'ios' ? Spacing.six : Spacing.four },
  content: { gap: Spacing.three, padding: Spacing.four },
  fieldCell: { flex: 1, minWidth: 150 },
  fieldCellStacked: { flex: 0, width: '100%' },
  fieldGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  fieldGridLarge: { flexDirection: 'column' },
  flex: { flex: 1, minWidth: 0 },
  boardMarkEditButton: { alignItems: 'center', borderRadius: Radius.pill, height: 40, justifyContent: 'center', width: 40 },
  boardMarkPreview: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.large, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: Spacing.three, padding: Spacing.three },
  boardMarkPreviewCopy: { flex: 1, gap: Spacing.half, minWidth: 0 },
  inboxHeading: { gap: Spacing.one },
  coverageCopy: { flex: 1, gap: 2, minWidth: 0 },
  coverageHint: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.medium, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: Spacing.two, minHeight: TouchTarget, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  taskCountPill: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: Spacing.one, minHeight: 30, paddingHorizontal: Spacing.two },
  projectBoardPrompt: { gap: Spacing.two, marginTop: Spacing.two },
  screen: { flex: 1 },
  screenContent: { flex: 1 },
  taskSectionHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: TouchTarget, paddingTop: Spacing.two },
  taskSectionMeta: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two },
});
