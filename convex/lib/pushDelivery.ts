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
  previewMode: 'full' | 'context' | 'hidden'
}) {
  if (input.previewMode === 'hidden') {
    return { title: 'Track', body: input.eventKind === 'mention' ? 'You were mentioned' : 'New conversation activity' }
  }
  const sender = safePushLabel(input.senderName, 'A teammate')
  const location = safePushLabel(input.groupName, 'a Channel')
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
  return { title: 'Track', body: `New message from ${sender} in ${location}` }
}

export function retryDelayMs(attemptNumber: number) {
  return Math.min(30_000, 1_000 * 2 ** Math.max(0, attemptNumber - 1))
}
