import { describe, expect, it, vi } from 'vitest'

import { sendPasswordResetEmail } from './passwordResetEmail'

describe('password reset email delivery', () => {
  it('sends the generated reset link through Resend without changing it', async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => new Response(null, { status: 200 }))
    const url = 'https://track.example/api/auth/reset-password?token=a&b=c'

    await sendPasswordResetEmail({
      apiKey: 'test-key',
      email: 'alex@example.com',
      fetcher,
      from: 'Track <no-reply@example.com>',
      url,
    })

    expect(fetcher).toHaveBeenCalledOnce()
    const [target, request] = fetcher.mock.calls[0]
    expect(target).toBe('https://api.resend.com/emails')
    expect(request?.method).toBe('POST')
    expect(request?.headers).toMatchObject({ Authorization: 'Bearer test-key' })
    const body = JSON.parse(String(request?.body)) as { html: string; text: string; to: string[] }
    expect(body.to).toEqual(['alex@example.com'])
    expect(body.text).toContain(url)
    expect(body.html).toContain('token=a&amp;b=c')
  })

  it('fails when Resend does not accept the reset email', async () => {
    await expect(sendPasswordResetEmail({
      apiKey: 'test-key',
      email: 'alex@example.com',
      fetcher: async () => new Response(null, { status: 401 }),
      from: 'Track <no-reply@example.com>',
      url: 'https://track.example/reset?token=secret',
    })).rejects.toThrow('password_reset_email_delivery_failed')
  })
})
