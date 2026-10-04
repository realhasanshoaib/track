import { execFile } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { promisify } from 'node:util'
import { expect, test } from '@playwright/test'

const execFileAsync = promisify(execFile)
const repoRoot = resolve(import.meta.dirname, '../..')
const budgets = JSON.parse(readFileSync(resolve(repoRoot, 'e2e/performance/budgets.json'), 'utf8'))
const fixtureCommand = resolve(repoRoot, 'scripts/e2e/fixture-command.mjs')

async function resetFixture() {
  await execFileAsync(process.execPath, [fixtureCommand, 'performanceReset'], {
    env: process.env,
    maxBuffer: 8 * 1024 * 1024,
    timeout: 120_000,
  })
}

async function signIn(page) {
  await page.goto('/sign-in', { waitUntil: 'domcontentloaded' })
  if (process.env.TRACK_E2E_PRODUCTION === '1') {
    // Production deliberately has no demo bypass; use the normal email auth flow.
    const password = process.env.VITE_DEV_AUTH_BYPASS_PASSWORD ?? 'track-e2e-local-password'
    await page.getByPlaceholder('you@example.com').fill('developer@track.local')
    await page.getByPlaceholder('At least 10 characters').fill(password)
    await page.getByRole('button', { name: 'Continue with Email', exact: true }).click()
    const confirmation = page.getByPlaceholder('Repeat password')
    await expect.poll(async () =>
      /\/workspace/.test(page.url()) || await confirmation.isVisible(),
    { timeout: 60_000 }).toBe(true)
    if (await confirmation.isVisible()) {
      await confirmation.fill(password)
      await page.getByRole('button', { name: 'Create account', exact: true }).click()
    }
  } else {
    const demoButton = page.getByRole('button', { name: 'Use Hasan Demo' })
    await expect(demoButton).toBeVisible({ timeout: 60_000 })
    await expect.poll(
      () => page.evaluate(() => window.localStorage.getItem('better-auth_session_data')),
      { timeout: 60_000 },
    ).toBe('null')
    await demoButton.click()
  }
  await expect.poll(() => page.url(), { timeout: 60_000 }).toMatch(/\/workspace/)
  await expect(page.getByText(/E2E .* Primary/, { exact: false }).first()).toBeVisible({ timeout: 60_000 })
}

async function measure(action) {
  const started = performance.now()
  await action()
  return performance.now() - started
}

function percentile(values, fraction) {
  const sorted = values.toSorted((left, right) => left - right)
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)
  return Math.round(sorted[index] * 100) / 100
}

test('real app operation timings and resource bytes stay inside budgets', async ({ page }, testInfo) => {
  // Setup and nine measured operations share this test; each operation still
  // has its own unchanged performance budget below.
  test.setTimeout(120_000)
  const browserErrors = []
  const expectedSetupErrors = []
  let signingIn = true
  page.on('pageerror', (error) => browserErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    const signInUrl = `${new URL(page.url()).origin}/api/auth/sign-in/email`
    if (signingIn && message.location().url === signInUrl && message.text().includes('401 (Unauthorized)')) {
      // A new isolated account is created by the demo sign-in's sign-up fallback.
      expectedSetupErrors.push({ url: signInUrl, message: message.text() })
      return
    }
    browserErrors.push(message.text())
  })
  await resetFixture()
  await signIn(page)
  signingIn = false

  const conversationUrl = page.url()
  const routeNavigationMs = []
  for (let index = 0; index < 3; index += 1) {
    routeNavigationMs.push(await measure(async () => {
      await page.reload({ waitUntil: 'domcontentloaded' })
      await expect(page.getByText('E2E source message: assign an owner before launch.', { exact: true })).toBeVisible({ timeout: 30_000 })
    }))
  }

  const tasksLink = page.getByRole('link', { name: /Tasks.*Boards, my tasks, inbox/ }).first()
  const tasksHref = await tasksLink.getAttribute('href')
  expect(tasksHref).toBeTruthy()
  const taskRouteMs = []
  for (let index = 0; index < 3; index += 1) {
    taskRouteMs.push(await measure(async () => {
      await page.goto(tasksHref, { waitUntil: 'domcontentloaded' })
      await expect(page.locator('button.task-card-open').filter({ hasText: 'E2E source-linked task' })).toBeVisible({ timeout: 30_000 })
    }))
    await page.goto(conversationUrl, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('E2E source message: assign an owner before launch.', { exact: true })).toBeVisible({ timeout: 30_000 })
  }

  const sendAcknowledgementMs = []
  const composer = page.getByPlaceholder('Message browser-journeys or ask @track...')
  for (let index = 0; index < 3; index += 1) {
    const body = `performance browser message ${Date.now()}-${index}`
    sendAcknowledgementMs.push(await measure(async () => {
      await composer.fill(body)
      await page.getByRole('button', { name: /Send/ }).click()
      await expect(page.getByText(body, { exact: true })).toBeVisible({ timeout: 30_000 })
    }))
  }

  const scroller = page.locator('.track-thread-scroll')
  await expect(scroller).toBeVisible()
  const scroll = await scroller.evaluate(async (root) => {
    const range = root.scrollHeight - root.clientHeight
    if (range <= 0) throw new Error('Performance fixture must overflow the conversation scroller')
    const startTop = root.scrollTop
    let previousTop = startTop
    let changedSteps = 0
    const started = performance.now()
    for (let index = 0; index < 12; index += 1) {
      // Restarting CSS smooth scrolling each frame can prevent any movement.
      root.scrollTo({ top: range * (index % 2 === 0 ? 0.2 : 0.8), behavior: 'instant' })
      await new Promise((resolveFrame) => requestAnimationFrame(resolveFrame))
      if (Math.abs(root.scrollTop - previousTop) > 1) changedSteps += 1
      previousTop = root.scrollTop
    }
    return {
      durationMs: performance.now() - started,
      scrollHeight: root.scrollHeight,
      clientHeight: root.clientHeight,
      startTop,
      endTop: root.scrollTop,
      changedSteps,
    }
  })

  const resources = await page.evaluate(() => performance.getEntriesByType('resource').map((entry) => {
    const resource = entry
    return {
      durationMs: Math.round(resource.duration * 100) / 100,
      encodedBodyBytes: resource.encodedBodySize,
      initiatorType: resource.initiatorType,
      name: resource.name,
      transferBytes: resource.transferSize,
    }
  }))
  const origin = new URL(page.url()).origin
  const appResources = resources.filter((resource) => new URL(resource.name).origin === origin)
  const resourceBytes = appResources.reduce(
    (total, resource) => total + Math.max(resource.transferBytes, resource.encodedBodyBytes),
    0,
  )
  const report = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    fixture: {
      routeNavigationMs: percentile(routeNavigationMs, 0.95),
      taskRouteMs: percentile(taskRouteMs, 0.95),
      sendAcknowledgementMs: percentile(sendAcknowledgementMs, 0.95),
      scrollInteractionMs: Math.round(scroll.durationMs * 100) / 100,
    },
    scroll,
    browserErrors,
    expectedSetupErrors,
    resources: {
      bytes: resourceBytes,
      count: appResources.length,
      entries: appResources,
    },
    samples: { routeNavigationMs, taskRouteMs, sendAcknowledgementMs },
  }
  const outputPath = process.env.PERF_OUTPUT_PATH
    ? process.env.PERF_OUTPUT_PATH.replace(/\.json$/, `.${testInfo.project.name}.retry-${testInfo.retry}.json`)
    : testInfo.outputPath('fixture-performance.json')
  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n')

  expect(report.browserErrors).toEqual([])
  expect(report.scroll.scrollHeight).toBeGreaterThan(report.scroll.clientHeight)
  expect(report.scroll.changedSteps).toBe(12)
  expect(report.fixture.routeNavigationMs).toBeLessThanOrEqual(budgets.fixture.routeNavigationMs)
  expect(report.fixture.taskRouteMs).toBeLessThanOrEqual(budgets.fixture.taskRouteMs)
  expect(report.fixture.sendAcknowledgementMs).toBeLessThanOrEqual(budgets.fixture.sendAcknowledgementMs)
  expect(report.fixture.scrollInteractionMs).toBeLessThanOrEqual(budgets.fixture.scrollInteractionMs)
  expect(report.resources.bytes).toBeLessThanOrEqual(budgets.fixture.resourceBytes)
})
