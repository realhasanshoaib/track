import { convexTest } from 'convex-test'
import { describe, expect, it, vi } from 'vitest'

import { internal } from './_generated/api'
import schema from './schema'

type Exec = (boxId: string, options: { command: string }) => Promise<{ stdout: string }>
const exec = vi.hoisted(() => vi.fn<Exec>())
vi.mock('./lib/box', () => ({ createLiveMemoryBoxAdapter: () => ({ exec }) }))
declare global {
  interface ImportMeta {
    glob: (patterns: Array<string>) => Record<string, () => Promise<unknown>>
  }
}
const modules = import.meta.glob(['./**/*.{ts,js}', '!./**/*.test.{ts,js}'])

describe('memory run-view cleanup', () => {
  it('reads only processable status index ranges', async () => {
    const { listMemoryBoxesForCleanup } = await import('./memory')
    const statuses: Array<unknown> = []
    const range: { eq: (field: string, value: unknown) => unknown } = { eq: (field: string, value: unknown) => {
      expect(field).toBe('status')
      statuses.push(value)
      return range
    } }
    const withIndex = vi.fn((index: string, select: (q: typeof range) => unknown) => {
      expect(index).toBe('by_status_updated_at')
      select(range)
      return { collect: async () => [] }
    })
    const query = vi.fn(() => ({ withIndex }))
    if (!hasHandler(listMemoryBoxesForCleanup)) throw new Error('query_handler_missing')
    expect(await listMemoryBoxesForCleanup['_handler']({ db: { query } }, {})).toEqual([])
    expect(statuses).toEqual(['creating', 'ready', 'paused'])
    expect(query).toHaveBeenCalledTimes(3)
  })

  it('returns only eligible boxes in creation order, independent of updatedAt', async () => {
    const t = convexTest(schema, modules)
    await seedBoxes(t)
    const boxes = await t.query(internal.memory.listMemoryBoxesForCleanup, {})
    expect(boxes.map((box) => box.boxId)).toEqual(['ready', 'paused', 'creating'])
  })

  it('keeps the seven-day command, counts removed views, and audits errors without stopping', async () => {
    const t = convexTest(schema, modules)
    const { projectId } = await seedBoxes(t)
    exec.mockReset()
    exec.mockImplementation(async (boxId: string) => {
      if (boxId === 'paused') throw new Error('fixture exec failed')
      return { stdout: boxId === 'ready' ? 'scratch/runs/old-a\nscratch/runs/old-b\n' : '' }
    })
    expect(await t.action(internal.memoryActions.cleanupRunViews, {})).toEqual({ cleaned: 2 })
    expect(exec.mock.calls.map(([boxId]) => boxId)).toEqual(['ready', 'paused', 'creating'])
    for (const [, options] of exec.mock.calls) {
      expect(options.command).toBe('find scratch/runs -mindepth 1 -maxdepth 1 -type d -mtime +7 -print -exec rm -rf {} + 2>/dev/null || true')
    }
    const events = await t.run(async (ctx) => await ctx.db.query('auditEvents').collect())
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ projectId, action: 'memory_tool.bash.denied', after: {
      boxId: 'paused', purpose: 'run_view_cleanup', reason: 'fixture exec failed',
    } })
  })
})

async function seedBoxes(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', {
      googleSubject: 'cleanup', normalizedEmail: 'cleanup@track.test', email: 'cleanup@track.test',
      displayName: 'Cleanup', twoFactorEnabled: false, createdAt: 1, updatedAt: 1,
    })
    const projectId = await ctx.db.insert('projects', { name: 'Cleanup', createdBy: userId, createdAt: 1, updatedAt: 1 })
    for (const [index, status] of (['ready', 'deleted', 'paused', 'error', 'creating'] as const).entries()) {
      await ctx.db.insert('projectMemoryBoxes', {
        projectId, boxId: status, status, runtime: 'node', schemaVersion: 1, createdBy: userId,
        createdAt: index, updatedAt: 100 - index,
      })
    }
    return { projectId }
  })
}

function hasHandler(value: unknown): value is {
  _handler: (ctx: unknown, args: unknown) => Promise<unknown>
} {
  return (typeof value === 'object' || typeof value === 'function') && value !== null &&
    '_handler' in value && typeof value['_handler'] === 'function'
}
