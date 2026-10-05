const MAX_LABEL_LENGTH = 80
const MAX_BODY_LENGTH = 180

export function safePushLabel(value: string | null | undefined, fallback: string) {
  const normalized = value?.replaceAll(/[\r\n\t]+/g, ' ').replaceAll(/\s+/g, ' ').trim()
  return (normalized || fallback).slice(0, MAX_LABEL_LENGTH)
}

export function safePushBody(value: string | null | undefined, fallback: string) {
  const normalized = value?.replaceAll(/[\r\n\t]+/g, ' ').replaceAll(/\s+/g, ' ').trim()
  return (normalized || fallback).slice(0, MAX_BODY_LENGTH)
}

export function messagePushCopy(input: {
  eventKind: string
  senderName: string
  groupName: string
  messagePreview: string
  threadName?: string
  previewMode: 'full' | 'context' | 'hidden'
}) {
  if (input.previewMode === 'hidden') {
    return { title: 'Track', body: input.eventKind === 'mention' ? 'You were mentioned' : 'New conversation activity' }
  }
  const sender = safePushLabel(input.senderName, 'A teammate')
  const location = safePushLabel(input.threadName || input.groupName, 'a Channel')
  if (input.previewMode === 'full') {
    const event = input.eventKind === 'mention'
      ? `${sender} mentioned you`
      : input.eventKind === 'direct_reply'
        ? `${sender} replied to you`
        : sender
    return {
      title: safePushLabel(`${event} · ${location}`, 'Track'),
      body: safePushBody(input.messagePreview, 'Sent an attachment.'),
    }
  }
  if (input.eventKind === 'mention') return { title: 'Track', body: `${sender} mentioned you in ${location}` }
  if (input.eventKind === 'direct_reply') return { title: 'Track', body: `${sender} replied to you in ${location}` }
  if (input.eventKind === 'thread_reply') return { title: 'Track', body: `New reply from ${sender} in ${location}` }
  return { title: 'Track', body: `New message from ${sender} in ${location}` }
}

export function taskPushCopy(input: {
  eventKind: string
  projectName: string
  publicKey: string
  taskTitle: string
  previewMode: 'full' | 'context' | 'hidden'
}) {
  const event = input.eventKind.replaceAll('_', ' ')
  if (input.previewMode === 'hidden') return {
    title: 'Track',
    body: input.eventKind === 'urgent_update' ? 'An urgent task needs attention' : `New task ${event}`,
  }
  const project = safePushLabel(input.projectName, 'a Project')
  const publicKey = safePushLabel(input.publicKey, 'task')
  const verb = input.eventKind === 'assignment'
    ? 'You were assigned'
    : input.eventKind === 'assignment_lost'
      ? 'Assignment changed for'
      : input.eventKind === 'mention'
        ? 'You were mentioned on'
        : input.eventKind === 'urgent_update'
          ? 'Urgent update for'
          : input.eventKind === 'due_soon'
            ? 'Due soon'
            : input.eventKind === 'overdue'
              ? 'Overdue'
              : 'Task updated'
  if (input.previewMode === 'full') {
    return {
      title: safePushLabel(`${publicKey} · ${project}`, 'Track task'),
      body: safePushBody(`${verb}: ${input.taskTitle}`, `${verb} ${publicKey}`),
    }
  }
  return { title: 'Track', body: `${verb} ${publicKey} in ${project}` }
}

export function retryDelayMs(attemptNumber: number) {
  return Math.min(30_000, 1_000 * 2 ** Math.max(0, attemptNumber - 1))
}
