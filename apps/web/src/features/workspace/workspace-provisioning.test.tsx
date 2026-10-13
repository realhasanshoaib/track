import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import {
  Navigate, RouterProvider, createMemoryHistory, createRootRoute, createRoute,
  createRouter, useLocation, useNavigate,
} from '@tanstack/react-router'
import { useSyncExternalStore } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getFunctionName, type FunctionReference } from 'convex/server'

import { Route } from '../../routes/workspace'

type TestProfile = {
  displayName: string
  profileDesignation: string
  timezone: string
  authUserId?: string
  googleSubject?: string
}

const backend = vi.hoisted(() => {
  const profile: { user: TestProfile | null | undefined } = { user: undefined }
  return {
    ...profile,
    companyModel: true,
    authenticated: true,
    listeners: new Set<() => void>(),
    ensure: vi.fn(),
    syncDev: vi.fn(),
    signOut: vi.fn(),
    disableDevAuthBypass: vi.fn(),
    currentUserQuery: vi.fn(),
    companyQuery: vi.fn(),
  }
})

vi.mock('convex/react', () => ({
  useConvexAuth: () => ({ isLoading: false, isAuthenticated: backend.authenticated }),
  useMutation: (mutation: FunctionReference<'mutation'>) => getFunctionName(mutation) === 'auth:ensureCurrentUser' ? backend.ensure : backend.syncDev,
  useQuery: (query: FunctionReference<'query'>) => {
    backend.currentUserQuery()
    expect(getFunctionName(query)).toBe('auth:getCurrentUser')
    return useSyncExternalStore(
      (listener) => { backend.listeners.add(listener); return () => backend.listeners.delete(listener) },
      () => backend.user,
    )
  },
}))
vi.mock('#/lib/auth-client', () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: 'new-account' } }, isPending: false }),
    signOut: backend.signOut,
  },
}))
vi.mock('#/lib/dev-auth-bypass', () => ({
  useDevAuthBypass: () => ({ allowed: false, hydrated: true, enabled: false }),
  disableDevAuthBypass: backend.disableDevAuthBypass,
}))
vi.mock('#/lib/oauth-callback', () => ({ useOAuthCallbackPending: () => false }))
vi.mock('#/lib/release-config', () => ({
  useReleaseConfigState: () => ({ status: 'ready', config: { companyModel: backend.companyModel } }),
}))

function publishUser(user: typeof backend.user) {
  backend.user = user
  backend.listeners.forEach((listener) => listener())
}

const completeProfile = {
  displayName: 'New User', profileDesignation: 'Engineer', timezone: 'UTC', authUserId: 'new-account',
}

function CompanyView() {
  if (!backend.companyModel) return <p>Legacy view</p>
  backend.companyQuery()
  if (!backend.user || (backend.user.authUserId !== 'new-account' && backend.user.googleSubject !== 'new-account')) {
    throw new Error('actor_not_provisioned')
  }
  return <p>Company view</p>
}

// The existing onboarding page saves the profile and follows the next search parameter.
function ProfileSaveSeam() {
  const href = useLocation({ select: (location) => location.href })
  const navigate = useNavigate()
  const next = new URL(href, 'http://localhost').searchParams.get('next') ?? '/workspace'
  return <button onClick={() => { publishUser(completeProfile); void navigate({ to: next }) }}>Save profile</button>
}

function openWorkspace(path: string) {
  const root = createRootRoute()
  const workspace = createRoute({ getParentRoute: () => root, path: 'workspace', component: Route.options.component })
  const home = createRoute({ getParentRoute: () => workspace, path: '/', component: () => <Navigate to="/workspace/company" replace /> })
  const company = createRoute({ getParentRoute: () => workspace, path: 'company', component: CompanyView })
  const project = createRoute({ getParentRoute: () => workspace, path: 'company-projects/$projectId', component: CompanyView })
  const onboarding = createRoute({ getParentRoute: () => root, path: 'onboarding/profile', component: ProfileSaveSeam })
  const signIn = createRoute({ getParentRoute: () => root, path: 'sign-in', component: () => <p>Sign in</p> })
  const router = createRouter({
    routeTree: root.addChildren([workspace.addChildren([home, company, project]), onboarding, signIn]),
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  render(<RouterProvider router={router} />)
  return router
}

afterEach(cleanup)
beforeEach(() => {
  backend.companyModel = true
  backend.authenticated = true
  backend.user = null
  backend.ensure.mockReset().mockResolvedValue('track-user')
  backend.signOut.mockReset().mockResolvedValue({ error: null })
  backend.disableDevAuthBypass.mockReset()
  backend.companyQuery.mockReset()
  backend.currentUserQuery.mockReset()
})

describe('workspace profile boundary', () => {
  it.each(['/workspace', '/workspace/company', '/workspace/company-projects/invited-project?view=board#task']) (
    'provisions a new account before opening %s, then returns there after profile save', async (path) => {
      const router = openWorkspace(path)
      await waitFor(() => expect(backend.ensure).toHaveBeenCalledTimes(1))
      expect(backend.ensure).toHaveBeenCalledWith({})
      expect(backend.companyQuery).not.toHaveBeenCalled()
      expect(screen.queryByText('Company view')).toBeNull()

      act(() => publishUser({ ...completeProfile, profileDesignation: '', timezone: '' }))
      await screen.findByRole('button', { name: 'Save profile' })
      expect(router.state.location.pathname).toBe('/onboarding/profile')
      expect(new URL(router.state.location.href, 'http://localhost').searchParams.get('next')).toBe(path)
      expect(backend.companyQuery).not.toHaveBeenCalled()

      fireEvent.click(screen.getByRole('button', { name: 'Save profile' }))
      await screen.findByText('Company view')
      expect(router.state.location.href).toBe(path === '/workspace' ? '/workspace/company' : path)
      expect(backend.ensure).toHaveBeenCalledTimes(1)
    },
  )

  it('opens a complete account at the same landing without provisioning or onboarding', async () => {
    backend.user = completeProfile
    const router = openWorkspace('/workspace')
    await screen.findByText('Company view')
    expect(router.state.location.href).toBe('/workspace/company')
    expect(backend.ensure).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Save profile' })).toBeNull()
  })

  it.each(['UTC', ''])('links an email-matched legacy row before opening children or onboarding (timezone: %s)', async (timezone) => {
    const legacyProfile = { displayName: 'Legacy User', profileDesignation: 'Engineer', timezone, googleSubject: 'old-google-subject' }
    backend.user = legacyProfile
    openWorkspace('/workspace/company')
    await waitFor(() => expect(backend.ensure).toHaveBeenCalledTimes(1))
    expect(backend.companyQuery).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Save profile' })).toBeNull()

    act(() => publishUser({ ...legacyProfile, authUserId: 'new-account' }))
    if (timezone) {
      await screen.findByText('Company view')
    } else {
      await screen.findByRole('button', { name: 'Save profile' })
      expect(backend.companyQuery).not.toHaveBeenCalled()
    }
    expect(backend.ensure).toHaveBeenCalledTimes(1)
  })

  it('allows an already-linked googleSubject without an authUserId mutation', async () => {
    backend.user = { displayName: 'Legacy User', profileDesignation: 'Engineer', timezone: 'UTC', googleSubject: 'new-account' }
    openWorkspace('/workspace/company')
    await screen.findByText('Company view')
    expect(backend.ensure).not.toHaveBeenCalled()
  })

  it('keeps legacy children outside the new provisioning boundary', async () => {
    backend.companyModel = false
    openWorkspace('/workspace/company')
    await screen.findByText('Legacy view')
    expect(backend.currentUserQuery).not.toHaveBeenCalled()
    expect(backend.ensure).not.toHaveBeenCalled()
  })

  it('does not provision until the current-user query resolves', async () => {
    backend.user = undefined
    openWorkspace('/workspace/company')
    await screen.findByRole('status', { name: 'Loading your workspace' })
    expect(backend.ensure).not.toHaveBeenCalled()
    expect(backend.companyQuery).not.toHaveBeenCalled()
    act(() => publishUser(null))
    await waitFor(() => expect(backend.ensure).toHaveBeenCalledTimes(1))
  })

  it('holds child queries after provisioning fails and allows retry', async () => {
    backend.ensure.mockRejectedValueOnce(new Error('offline'))
    openWorkspace('/workspace/company')
    await screen.findByRole('alert')
    expect(backend.companyQuery).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(backend.ensure).toHaveBeenCalledTimes(2))
    act(() => publishUser(completeProfile))
    await screen.findByText('Company view')
  })

  it('finishes sign-out before opening sign-in from provisioning recovery', async () => {
    let finishSignOut: (() => void) | undefined
    backend.signOut.mockImplementation(() => new Promise<{ error: null }>((resolve) => {
      finishSignOut = () => resolve({ error: null })
    }))
    backend.ensure.mockRejectedValueOnce(new Error('stale session'))
    const router = openWorkspace('/workspace/company')
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('link', { name: 'Sign in again' }))
    expect(backend.signOut).toHaveBeenCalledTimes(1)
    expect(router.state.location.pathname).toBe('/workspace/company')
    await act(async () => { finishSignOut?.() })
    await screen.findByText('Sign in')
    expect(backend.disableDevAuthBypass).toHaveBeenCalledTimes(1)
    expect(router.state.location.pathname).toBe('/sign-in')
  })

  it('keeps recovery open if sign-out returns an error', async () => {
    backend.signOut.mockResolvedValue({ error: { message: 'offline' } })
    backend.ensure.mockRejectedValueOnce(new Error('stale session'))
    const router = openWorkspace('/workspace/company')
    await screen.findByRole('alert')
    await act(async () => { fireEvent.click(screen.getByRole('link', { name: 'Sign in again' })) })
    expect(backend.signOut).toHaveBeenCalledTimes(1)
    expect(router.state.location.pathname).toBe('/workspace/company')
    expect(backend.disableDevAuthBypass).not.toHaveBeenCalled()
  })
})
