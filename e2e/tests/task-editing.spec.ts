import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const execFileAsync = promisify(execFile)
const fixtureCommand = fileURLToPath(
  new URL('../../scripts/e2e/fixture-command.mjs', import.meta.url),
)

async function resetFixture() {
  await execFileAsync(process.execPath, [fixtureCommand, 'reset'], {
    env: process.env,
    maxBuffer: 8 * 1024 * 1024,
    timeout: 120_000,
  })
}

async function signIn(page: Page) {
  await page.goto('/sign-in', { waitUntil: 'domcontentloaded' })
  const demoButton = page.getByRole('button', { name: 'Use Hasan Demo' })
  await expect(demoButton).toBeVisible({ timeout: 60_000 })
  await expect.poll(
    () => page.evaluate(() => window.localStorage.getItem('better-auth_session_data')),
    { timeout: 60_000 },
  ).toBe('null')
  await demoButton.click()
  await expect.poll(() => page.url(), { timeout: 60_000 }).toMatch(/\/workspace/)
  await expect(page.getByText(/E2E .* Primary/, { exact: false }).first()).toBeVisible({ timeout: 60_000 })
}

async function openTaskBoard(page: Page) {
  await signIn(page)
  const tasksLink = page.getByRole('link', { name: /Tasks.*Boards, my tasks, inbox/ }).first()
  await expect(tasksLink).toBeVisible()
  await tasksLink.click()
  await expect.poll(() => page.url(), { timeout: 30_000 }).toMatch(/\/tasks\?/)
  await expect.poll(() => new URL(page.url()).searchParams.get('view')).toBe('list')
  await page.getByRole('navigation', { name: 'Task workspace view' }).getByRole('link', { name: 'Board', exact: true }).click()
  await expect(
    page.locator('button.task-card-open').filter({ hasText: 'E2E source-linked task' }),
  ).toBeVisible({ timeout: 30_000 })
}

test.beforeEach(async () => {
  await resetFixture()
})

test('task detail preserves a dirty draft while a remote refresh arrives', async ({ page }) => {
  await openTaskBoard(page)

  await page.locator('button.task-card-open').filter({ hasText: 'E2E source-linked task' }).click()
  const title = page.getByRole('textbox', { name: 'Task title', exact: true })
  await expect(title).toBeVisible()
  await expect(title).toHaveValue('E2E source-linked task')

  const localDraft = 'E2E local title draft'
  await title.fill(localDraft)

  const remotePage = await page.context().newPage()
  try {
    await remotePage.goto(page.url(), { waitUntil: 'domcontentloaded' })
    const remoteTitle = remotePage.getByRole('textbox', { name: 'Task title', exact: true })
    await expect(remoteTitle).toBeVisible({ timeout: 30_000 })
    const remoteValue = 'E2E remote title refresh'
    await remoteTitle.fill(remoteValue)
    await remotePage.getByRole('button', { name: 'Save changes' }).click()
    await expect(remoteTitle).toHaveValue(remoteValue, { timeout: 30_000 })

    await expect(page.getByRole('alert')).toContainText('This task changed while you were editing.', { timeout: 30_000 })
    await expect(title).toHaveValue(localDraft)
    await page.getByRole('button', { name: 'Review latest' }).click()
    await expect(title).toHaveValue(remoteValue)
  } finally {
    await remotePage.close()
  }
})

test('task board moves the seeded task to the next workflow state', async ({ page }) => {
  await openTaskBoard(page)

  const taskCard = page.locator('article.task-card').filter({ hasText: 'E2E source-linked task' })
  await taskCard.hover()
  await taskCard.getByRole('button', { name: 'Move E2E source-linked task right' }).click()
  const inProgress = page.locator('section.task-column').filter({
    has: page.getByRole('heading', { name: 'In progress' }),
  })
  await expect(inProgress.getByText('E2E source-linked task', { exact: true })).toBeVisible({ timeout: 30_000 })
})

test('task calendar schedules an undated task by drag and drop', async ({ page }) => {
  // Keep the calendar fixture deterministic when the real month changes.
  await page.clock.setFixedTime(new Date('2026-09-15T12:00:00Z'))
  await openTaskBoard(page)

  await page.getByRole('navigation', { name: 'Task workspace view' })
    .getByRole('link', { name: 'Calendar', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'September 2026' })).toBeVisible()

  const task = page.getByRole('button', { name: /E2E source-linked task/ })
  const targetDate = page.getByRole('group', { name: 'Sunday, September 20, 2026' })
  await expect(task).toHaveAttribute('draggable', 'true')
  await task.dragTo(targetDate)

  await expect(targetDate.getByText('E2E source-linked task', { exact: true })).toBeVisible({ timeout: 30_000 })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('group', { name: 'Sunday, September 20, 2026' })
    .getByText('E2E source-linked task', { exact: true })).toBeVisible({ timeout: 30_000 })
})
