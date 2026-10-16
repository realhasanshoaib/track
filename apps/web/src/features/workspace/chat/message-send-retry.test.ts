import { describe, expect, it, vi } from 'vitest'

import {
  createMessageSendAttempt,
  runMessageSendAttempt,
} from '#/features/workspace/chat/message-send-retry'

describe('runMessageSendAttempt', () => {
  it('finishes all uploads before sending and reuses successful uploads after a failure', async () => {
    const attempt = createMessageSendAttempt<string, string>('same-send', 'idempotency-key')
    const upload = vi
      .fn<(_pending: { id: string }) => Promise<string>>()
      .mockResolvedValueOnce('uploaded-first')
      .mockRejectedValueOnce(new Error('upload_failed'))
      .mockResolvedValueOnce('uploaded-second')
    const send = vi.fn(async () => 'message-id')
    const attach = vi.fn(async () => undefined)
    const input = {
      attach,
      attempt,
      pendingAttachments: [{ id: 'first' }, { id: 'second' }],
      send,
      upload,
    }

    await expect(runMessageSendAttempt(input)).rejects.toThrow('upload_failed')
    expect(send).not.toHaveBeenCalled()
    expect(attach).not.toHaveBeenCalled()

    await expect(runMessageSendAttempt(input)).resolves.toMatchObject({
      messageId: 'message-id',
    })
    expect(upload).toHaveBeenCalledTimes(3)
    expect(send).toHaveBeenCalledTimes(1)
    expect(attach).toHaveBeenCalledTimes(2)
  })

  it('retries only the failed attachment step without duplicating successful work', async () => {
    const attempt = createMessageSendAttempt<string, string>('same-send', 'idempotency-key')
    const upload = vi.fn(async ({ id }: { id: string }) => `uploaded-${id}`)
    const send = vi.fn(async () => 'message-id')
    const attach = vi
      .fn<(messageId: string, uploaded: string) => Promise<void>>()
      .mockResolvedValueOnce()
      .mockRejectedValueOnce(new Error('attach_failed'))
      .mockResolvedValueOnce()
    const input = {
      attach,
      attempt,
      pendingAttachments: [{ id: 'first' }, { id: 'second' }],
      send,
      upload,
    }

    await expect(runMessageSendAttempt(input)).rejects.toThrow('attach_failed')
    await expect(runMessageSendAttempt(input)).resolves.toMatchObject({
      messageId: 'message-id',
    })

    expect(upload).toHaveBeenCalledTimes(2)
    expect(send).toHaveBeenCalledTimes(1)
    expect(attach).toHaveBeenNthCalledWith(1, 'message-id', 'uploaded-first')
    expect(attach).toHaveBeenNthCalledWith(2, 'message-id', 'uploaded-second')
    expect(attach).toHaveBeenNthCalledWith(3, 'message-id', 'uploaded-second')
  })

})
