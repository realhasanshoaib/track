import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ScopedConversationComposerProps } from '#/features/workspace/components/ScopedConversationComposer'

const convexMocks = vi.hoisted(() => ({
  attachFile: vi.fn<(_input: unknown) => Promise<void>>(),
  claimUploadIntent: vi.fn<(_input: unknown) => Promise<void>>(),
  generateUploadUrl: vi.fn<(_input: unknown) => Promise<string>>(),
  sendMessage: vi.fn<(_input: unknown) => Promise<string>>(),
}))

vi.mock('convex/react', async () => {
  const { getFunctionName } = await import('convex/server')

  return {
    useMutation: (reference: Parameters<typeof getFunctionName>[0]) => {
      switch (getFunctionName(reference)) {
        case 'messages:attachFile':
          return convexMocks.attachFile
        case 'messages:claimUploadIntent':
          return convexMocks.claimUploadIntent
        case 'messages:generateUploadUrl':
          return convexMocks.generateUploadUrl
        case 'messages:send':
          return convexMocks.sendMessage
        default:
          throw new Error(`Unexpected mutation: ${getFunctionName(reference)}`)
      }
    },
    useQuery: () => [],
  }
})


import { ScopedConversationComposer } from '#/features/workspace/components/ScopedConversationComposer'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function createDeferred<T>() {
  let settle: (value: T | PromiseLike<T>) => void = () => {
    throw new Error('Deferred promise was resolved before initialization.')
  }
  const promise = new Promise<T>((resolve) => {
    settle = resolve
  })
  return { promise, resolve: settle }
}

function createProps(
  overrides: Partial<ScopedConversationComposerProps> = {},
): ScopedConversationComposerProps {
  return {
    actorId: 'user-1',
    group: {
      _creationTime: 1,
      _id: 'group-1',
      createdAt: 1,
      createdBy: 'user-1',
      kind: 'general',
      name: 'General',
      projectId: 'project-1',
      updatedAt: 1,
    },
    onReplyChange: vi.fn(),
    projectId: 'project-1',
    replyTo: null,
    visibleGroups: [],
    ...overrides,
  } as ScopedConversationComposerProps
}

describe('ScopedConversationComposer lifecycle', () => {
  it('clears a successful send and returns to idle under Strict Mode', async () => {
    const messageSend = createDeferred<string>()
    const onBusyChange = vi.fn()
    const onReplyChange = vi.fn()
    const onSent = vi.fn()
    convexMocks.sendMessage.mockReturnValue(messageSend.promise)

    render(
      <StrictMode>
        <ScopedConversationComposer
          {...createProps({ onBusyChange, onReplyChange, onSent })}
        />
      </StrictMode>,
    )

    const textbox = screen.getByRole('textbox', { name: 'Message General' })
    const sendButton = screen.getByRole('button', { name: /Send/ })
    fireEvent.change(textbox, { target: { value: 'Hello everyone' } })
    expect(sendButton).toHaveProperty('disabled', false)

    fireEvent.click(sendButton)
    expect(convexMocks.sendMessage).toHaveBeenCalledTimes(1)
    expect(textbox).toHaveProperty('value', 'Hello everyone')
    expect(textbox).toHaveProperty('disabled', true)
    expect(sendButton).toHaveProperty('disabled', true)
    expect(onBusyChange).toHaveBeenCalledWith('send-message')

    await act(async () => {
      messageSend.resolve('message-1')
      await messageSend.promise
    })
    await waitFor(() => expect(textbox).toHaveProperty('value', ''))
    expect(textbox).toHaveProperty('disabled', false)
    expect(sendButton).toHaveProperty('disabled', true)
    expect(onReplyChange).toHaveBeenLastCalledWith(null)
    expect(onSent).toHaveBeenCalledTimes(1)
    expect(onBusyChange).toHaveBeenLastCalledWith(null)
  })
})
