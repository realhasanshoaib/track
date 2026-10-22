import { expect, it, vi } from 'vitest'

const userId = 'user'
const companyId = 'company'
vi.mock('./lib/actorContext', () => ({ requireAuthenticatedActor: async () => ({ userId }) }))
vi.mock('./lib/companyPolicy', async (importOriginal) => ({
  ...await importOriginal<typeof import('./lib/companyPolicy')>(),
  requireCompanyModelEnabled: () => undefined,
  requireActiveCompanyMembership: async () => undefined,
}))

it('bounds the initial membership read to the actor and acting Company', async () => {
  const { listForActingCompany } = await import('./sharedProjects')
  const equalities: Array<[string, unknown]> = []
  const range: { eq: (field: string, value: unknown) => unknown } = { eq: (field: string, value: unknown) => { equalities.push([field, value]); return range } }
  const withIndex = vi.fn((_index: string, select: (q: typeof range) => unknown) => {
    select(range)
    return { collect: async () => [] }
  })
  const query = vi.fn(() => ({ withIndex }))
  // Invoke the registered handler with an instrumented database boundary.
  const handler = listForActingCompany as unknown as {
    _handler: (ctx: { db: { query: typeof query } }, args: { actingCompanyId: string }) => Promise<unknown>
  }
  const result = await handler._handler({ db: { query } }, { actingCompanyId: companyId })
  expect(result).toEqual([])
  expect(query).toHaveBeenCalledWith('projectMembers')
  expect(withIndex.mock.calls[0]?.[0]).toBe('by_user_company')
  expect(equalities).toEqual([['userId', userId], ['companyId', companyId]])
})
