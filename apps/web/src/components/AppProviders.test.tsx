import { cleanup, render, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getFunctionName } from 'convex/server'

const state = vi.hoisted(() => ({
  authenticated: true,
  user: null as { _id: string } | null | undefined,
  ensure: vi.fn<() => Promise<string | null>>(),
  error: vi.fn(),
  queries: vi.fn(),
}))
vi.mock('convex/react', () => ({
  useConvexAuth: () => ({ isAuthenticated: state.authenticated }),
  useMutation: () => state.ensure,
  useQuery: (query: Parameters<typeof getFunctionName>[0], args: unknown) => {
    const name = getFunctionName(query)
    state.queries(name, args)
    if (name === 'auth:getCurrentUser') return state.user
    if (args === 'skip') return undefined
    return name === 'mobile:listAttention' ? { page: [] } : []
  },
}))
vi.mock('@convex-dev/better-auth/react', () => ({
  ConvexBetterAuthProvider: ({ children }: { children: ReactNode }) => children,
}))
vi.mock('#/components/ui/app-toast', () => ({
  AppToastProvider: ({ children }: { children: ReactNode }) => children,
  appToast: { error: state.error },
}))
vi.mock('#/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => children,
}))
vi.mock('#/lib/auth-client', () => ({ authClient: {} }))
vi.mock('../lib/convex-client', () => ({ convexClient: {} }))
import AppProviders from './AppProviders'

beforeEach(() => {
  state.authenticated = true
  state.user = null
  state.ensure.mockReset().mockResolvedValue('bound-user')
  state.error.mockReset()
  state.queries.mockReset()
})
afterEach(cleanup)

describe('shared account bootstrap', () => {
  it('prepares an unbound account on a direct route while protected subscriptions remain skipped', async () => {
    const view = render(<AppProviders><div>Direct task route</div></AppProviders>)
    await waitFor(() => expect(state.ensure).toHaveBeenCalledOnce())
    expect(state.queries).toHaveBeenCalledWith('mobile:listAttention', 'skip')
    expect(state.queries).toHaveBeenCalledWith('invitations:listPendingForCurrentUser', 'skip')
    state.user = { _id: 'bound-user' }
    view.rerender(<AppProviders><div>Direct task route</div></AppProviders>)
    expect(state.queries).toHaveBeenCalledWith('mobile:listAttention', {
      userId: 'bound-user', paginationOpts: { cursor: null, numItems: 20 },
    })
    expect(state.ensure).toHaveBeenCalledOnce()
  })
  it.each([false, true])('does not bootstrap while auth or account data is pending: authenticated=%s', (authenticated) => {
    state.authenticated = authenticated
    state.user = undefined
    render(<AppProviders><div>Account loading</div></AppProviders>)
    expect(state.ensure).not.toHaveBeenCalled()
  })
  it('reports bootstrap failure without starting protected queries', async () => {
    state.ensure.mockRejectedValue(new Error('temporary_network_failure'))
    render(<AppProviders><div>Direct task route</div></AppProviders>)
    await waitFor(() => expect(state.error).toHaveBeenCalledWith('Account setup failed', expect.any(String)))
    expect(state.queries).toHaveBeenCalledWith('mobile:listAttention', 'skip')
  })
})
