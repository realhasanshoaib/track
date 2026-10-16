import { expect, test, type Page } from '@playwright/test'

for (const width of [320, 390, 834]) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`chat message layout and selection stay usable at ${width}px in ${colorScheme}`, async ({ page }) => {
      // Eight message types, selection, keyboard input, and media round trips.
      test.setTimeout(60_000)
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.setViewportSize({ width, height: 844 })
      await page.emulateMedia({ colorScheme })
      await openFixture(page, 'attachment-preview?data=worst')
      await expect(page.getByLabel('Loading Track', { exact: true })).toHaveCount(0)
      const fixture = page.getByTestId('chat-layout-preview')
      for (const id of ['own-portrait', 'other-landscape']) {
        await page.getByTestId(`chat-layout-${id}`).scrollIntoViewIfNeeded()
        await expect.poll(() => page.getByTestId(`chat-layout-${id}`).locator('img').evaluateAll((images) =>
          images.some((image) => (image as HTMLImageElement).naturalWidth > 0),
        )).toBe(true)
      }
      await expect(fixture.getByRole('checkbox')).toHaveCount(0)

      for (const id of ['own-short', 'other-short']) {
        const sample = page.getByTestId(`chat-layout-${id}`)
        const bubble = await sample.getByTestId('message-bubble').boundingBox()
        const receipt = await sample.getByTestId('message-delivery').boundingBox()
        const text = await sample.getByText(id === 'own-short' ? 'Hi' : 'OK', { exact: true }).boundingBox()
        expect(bubble && receipt && text).toBeTruthy()
        expect(receipt!.x + receipt!.width).toBeLessThanOrEqual(bubble!.x + bubble!.width)
        expect(bubble!.x + bubble!.width - receipt!.x - receipt!.width).toBeLessThanOrEqual(12)
        if (id === 'own-short') expect(text!.x + text!.width).toBeGreaterThan(bubble!.x + bubble!.width / 2)
        else expect(text!.x).toBeLessThan(bubble!.x + bubble!.width / 2)
      }

      async function assertImageFits(id: string) {
        const sample = page.getByTestId(`chat-layout-${id}`)
        const { bubble, image } = await sample.evaluate((root) => {
          const bubble = root.querySelector('[data-testid="message-bubble"]')!
          const image = bubble.querySelectorAll('img')
          return { bubble: bubble.getBoundingClientRect().toJSON(), image: image[image.length - 1].getBoundingClientRect().toJSON() }
        })
        expect(bubble && image).toBeTruthy()
        expect(Math.abs(bubble!.y - image!.y)).toBeLessThanOrEqual(1)
        expect(Math.abs(bubble!.y + bubble!.height - image!.y - image!.height)).toBeLessThanOrEqual(1)
        expect(image!.x).toBeGreaterThanOrEqual(0)
        expect(image!.x + image!.width).toBeLessThanOrEqual(width + 1)
      }
      for (const id of ['own-portrait', 'other-landscape']) await assertImageFits(id)

      await fixture.getByRole('button', { name: 'Enter selection mode', exact: true }).click()
      const deletePill = fixture.getByRole('button', { name: /^Delete \d+ selected fixture messages$/ })
      await expect(deletePill).toBeDisabled()
      await expect(deletePill.getByText('0', { exact: true })).toBeVisible()
      const ownRow = page.getByTestId('chat-layout-own-short').getByRole('checkbox')
      const ownBounds = await ownRow.boundingBox()
      expect(ownBounds).not.toBeNull()
      expect(ownBounds!.height).toBeGreaterThanOrEqual(44)
      // The far right gutter is outside the bubble and checkbox visual.
      await ownRow.click({ position: { x: ownBounds!.width - 2, y: ownBounds!.height / 2 } })
      await expect(ownRow).toBeChecked()
      await expect(deletePill.getByText('1', { exact: true })).toBeVisible()
      await expect(deletePill).toBeEnabled()
      if (width === 390 && colorScheme === 'light') {
        const path = test.info().outputPath('selection-layout.png')
        await fixture.getByRole('button', { name: 'Exit selection mode', exact: true }).scrollIntoViewIfNeeded()
        await page.screenshot({ path })
        await test.info().attach('selection-layout', { path, contentType: 'image/png' })
      }
      await ownRow.focus()
      await page.keyboard.press('Space')
      await expect(ownRow).not.toBeChecked()
      await expect(deletePill.getByText('0', { exact: true })).toBeVisible()
      await ownRow.focus()
      await page.keyboard.press('Enter')
      await expect(ownRow).toBeChecked()
      await page.keyboard.press('Enter')
      await expect(ownRow).not.toBeChecked()
      await ownRow.click()
      const incomingRow = page.getByTestId('chat-layout-other-short').getByRole('checkbox')
      await incomingRow.click()
      await expect(deletePill.getByText('2', { exact: true })).toBeVisible()
      await expect(deletePill).toBeDisabled()
      await incomingRow.click()
      await expect(deletePill.getByText('1', { exact: true })).toBeVisible()
      await expect(deletePill).toBeEnabled()
      await ownRow.click()

      for (const id of ['own-short', 'other-short', 'own-portrait', 'other-landscape', 'long-text', 'voice', 'file', 'deleted']) {
        const sample = page.getByTestId(`chat-layout-${id}`)
        const row = sample.getByRole('checkbox')
        const indicator = await sample.getByTestId('message-selection-indicator').boundingBox()
        const bubble = await sample.getByTestId('message-bubble').boundingBox()
        expect(indicator && bubble).toBeTruthy()
        expect(indicator!.x + indicator!.width).toBeLessThanOrEqual(bubble!.x)
        // Clicking the middle of media/file/text content must toggle the row once.
        const rowBounds = await row.boundingBox()
        await row.click({ position: { x: bubble!.x + bubble!.width / 2 - rowBounds!.x, y: bubble!.y + bubble!.height / 2 - rowBounds!.y } })
        await expect(row).toBeChecked()
        await row.click({ position: { x: 2, y: 2 } })
        await expect(row).not.toBeChecked()
      }
      for (const id of ['own-portrait', 'other-landscape']) await assertImageFits(id)
      await expect(page.getByRole('button', { name: 'Close image', exact: true })).toHaveCount(0)
      await fixture.getByRole('button', { name: 'Cancel fixture selection', exact: true }).click()
      await expect(fixture.getByRole('checkbox')).toHaveCount(0)
      await page.getByTestId('chat-layout-own-portrait').getByRole('button', { name: /^Image / }).click()
      await expect(page.getByRole('button', { name: 'Close image', exact: true })).toBeVisible()
      await page.getByRole('button', { name: 'Close image', exact: true }).click()
      const voiceSample = page.getByTestId('chat-layout-voice')
      await expect(voiceSample.getByRole('button', { name: 'Play voice note', exact: true })).toBeEnabled()
      await voiceSample.getByRole('button', { name: 'Play voice note', exact: true }).click()
      await expect(voiceSample.getByRole('button', { name: 'Pause voice note', exact: true })).toBeVisible()
      await voiceSample.getByRole('button', { name: 'Pause voice note', exact: true }).click()
      if (width === 390 && colorScheme === 'light') {
        const path = test.info().outputPath('normal-layout.png')
        await fixture.getByRole('button', { name: 'Enter selection mode', exact: true }).scrollIntoViewIfNeeded()
        await page.screenshot({ path })
        await test.info().attach('normal-layout', { path, contentType: 'image/png' })
      }
      await assertNoPageOverflow(page)
      expect(errors).toEqual([])
    })
  }
}

async function openFixture(page: Page, path: string) {
  await page.goto(`/dev/${path}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('button').first()).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  // Component fixtures are signed out and never exercise shared development
  // accounts. Real authentication is covered by the isolated backend journeys.
  await page.route('**/api/auth/get-session', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: 'null',
  }))
})

async function assertNoPageOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
}

test('route lag capture detects a JS stall and preserves the mounted screen when toggled', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 })
  await openFixture(page, 'performance-check')
  const heading = await page.getByRole('heading', { name: 'Route lag check v1' }).elementHandle()
  expect(heading).not.toBeNull()
  await page.getByRole('button', { name: 'Start and go back' }).click()
  await expect(page.getByText('Recording; stops automatically after two minutes.', { exact: true })).toBeVisible()
  expect(await heading!.evaluate((element) => element.isConnected)).toBe(true)
  // Allow a heartbeat, then block the actual browser JS thread. This verifies
  // the sensor and lifecycle, not native FPS or the reported iPhone defect.
  await page.evaluate(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100))
    const end = performance.now() + 220
    while (performance.now() < end) { /* controlled diagnostic stall */ }
    await new Promise((resolve) => setTimeout(resolve, 100))
  })
  await page.getByRole('button', { name: 'Stop and show results' }).click()
  expect(await heading!.evaluate((element) => element.isConnected)).toBe(true)
  const report = await page.getByText(/^Longest JS delay:/).innerText()
  expect(Number(report.match(/delay: (\d+)/)?.[1])).toBeGreaterThan(100)
  await assertNoPageOverflow(page)
})

test('Profile opens the voice playback check through its visible entry', async ({ page }) => {
  await page.goto('/profile', { waitUntil: 'domcontentloaded' })
  const entry = page.getByRole('button', { name: 'Voice playback check', exact: true })
  await expect(entry).toBeVisible()
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Unsaved profile draft')
  await entry.click()
  await expect(page).toHaveURL(/\/dev\/attachment-preview/)
  await expect(page.getByText('Native audio check v2', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Diagnostic Play' })).toBeVisible()
})

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`voice waveform progress advances between status updates and stops on pause (${reducedMotion})`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion })
    await openFixture(page, 'attachment-preview?data=worst')
    const play = page.getByRole('button', { name: 'Play voice note', exact: true }).first()
    await expect(play).toBeEnabled()
    await play.click()
    await expect(page.getByRole('button', { name: 'Pause voice note' })).toBeVisible()
    const motion = await page.getByRole('slider', { name: 'Voice note position' }).first().evaluate(async (track) => {
      const knob = track.lastElementChild!
      return await new Promise<{ longestStill: number; distance: number }>((resolve) => {
        const start = performance.now()
        const firstX = knob.getBoundingClientRect().x
        let previousX = firstX
        let lastMove = start
        let longestStill = 0
        let moved = false
        function sample(now: number) {
          const x = knob.getBoundingClientRect().x
          if (Math.abs(x - previousX) > 0.05) { moved = true; lastMove = now }
          else if (moved) longestStill = Math.max(longestStill, now - lastMove)
          previousX = x
          if (now - start >= 1_600) resolve({ longestStill, distance: x - firstX })
          else requestAnimationFrame(sample)
        }
        requestAnimationFrame(sample)
      })
    })
    await test.info().attach('waveform-motion.json', { body: JSON.stringify(motion), contentType: 'application/json' })
    expect(motion.distance).toBeGreaterThan(10)
    expect(motion.longestStill).toBeLessThan(240)
    await page.getByRole('button', { name: 'Pause voice note' }).click()
    const positions = await page.getByRole('slider', { name: 'Voice note position' }).first().evaluate(async (track) => {
      await new Promise((resolve) => setTimeout(resolve, 150))
      const x = track.lastElementChild!.getBoundingClientRect().x
      await new Promise((resolve) => setTimeout(resolve, 300))
      return { before: x, after: track.lastElementChild!.getBoundingClientRect().x }
    })
    expect(Math.abs(positions.after - positions.before)).toBeLessThan(0.2)
  })
}

for (const width of [320, 390, 834]) {
  for (const state of ['demo', 'worst', 'empty', 'one', 'many']) {
    test(`Company ${state} data stays usable at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 })
      await openFixture(page, `company-preview?data=${state}`)
      await expect(page.getByRole('radio', { name: 'Personal Projects', exact: true })).toBeVisible()
      await assertNoPageOverflow(page)
      const rows = page.getByRole('radio')
      const labels = await rows.evaluateAll((elements) => elements.map((element) => element.getAttribute('aria-label')))
      await rows.last().click()
      expect(await rows.evaluateAll((elements) => elements.map((element) => element.getAttribute('aria-label')))).toEqual(labels)
      if (state === 'many') expect(await rows.count()).toBe(41)
    })
  }
  test(`My Tasks worst-case titles fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await openFixture(page, 'my-tasks-preview?data=worst')
    await expect(page.getByRole('textbox', { name: 'Search tasks and Boards' })).toBeVisible()
    await assertNoPageOverflow(page)
    await page.getByRole('textbox', { name: 'Search tasks and Boards' }).fill('No task matches this query')
    await expect(page.getByText('No matching Boards', { exact: true })).toBeVisible()
  })
}

test('slow send preserves the next draft and keeps its send control fixed', async ({ page }) => {
  await openFixture(page, 'workspace-interaction-preview')
  await page.getByRole('button', { name: 'Use manual responses' }).click()
  await page.getByRole('button', { name: 'Open update editor' }).click()
  const input = page.getByRole('textbox', { name: 'Write an update' })
  const send = page.getByRole('button', { name: 'Send update', exact: true })
  const before = await send.boundingBox()
  await send.click()
  const during = await page.getByRole('button', { name: 'Sending update' }).boundingBox()
  expect(during?.width).toBe(before?.width)
  expect(during?.height).toBe(before?.height)
  await input.fill('A new draft typed during the previous send')
  await page.getByRole('button', { name: 'Resolve pending send' }).click()
  await expect(page.getByLabel('Submission result')).toHaveText('Sent: First update')
  await expect(input).toHaveValue('A new draft typed during the previous send')
  await expect(input).toBeVisible()
  await expect(send).toBeEnabled()
})

test('closing and reopening a pending editor keeps the reopened draft visible', async ({ page }) => {
  await openFixture(page, 'workspace-interaction-preview')
  await page.getByRole('button', { name: 'Use manual responses' }).click()
  await page.getByRole('button', { name: 'Open update editor' }).click()
  await page.getByRole('button', { name: 'Send update', exact: true }).click()
  await page.getByRole('button', { name: 'Close update editor' }).click()
  await page.getByRole('button', { name: 'Open update editor' }).click()
  await expect(page.getByRole('textbox', { name: 'Write an update' })).toHaveValue('First update')
  await page.getByRole('button', { name: 'Resolve pending send' }).click()
  await expect(page.getByLabel('Submission result')).toHaveText('Sent: First update')
  await expect(page.getByRole('textbox', { name: 'Write an update' })).toHaveValue('First update')
})

test('failed send retains the draft and re-enables retry', async ({ page }) => {
  await openFixture(page, 'workspace-interaction-preview')
  await page.getByRole('button', { name: 'Use manual responses' }).click()
  await page.getByRole('button', { name: 'Use slow failure' }).click()
  await page.getByRole('button', { name: 'Open update editor' }).click()
  await page.getByRole('button', { name: 'Send update', exact: true }).click()
  await page.getByRole('button', { name: 'Resolve pending send' }).click()
  await expect(page.getByLabel('Submission result')).toContainText('Simulated failure')
  await expect(page.getByRole('textbox', { name: 'Write an update' })).toHaveValue('First update')
  await expect(page.getByRole('button', { name: 'Send update', exact: true })).toBeEnabled()
})

async function longPressTask(page: Page, status: string) {
  const card = page.getByRole('button', { name: `Confirm the release handoff, ${status}`, exact: true })
  await card.scrollIntoViewIfNeeded()
  const box = await card.boundingBox()
  if (!box) throw new Error('Task card has no visible bounds')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(650)
  await page.mouse.up()
}

test('board move updates status and counts immediately, then supports undo', async ({ page }) => {
  await openFixture(page, 'workspace-interaction-preview')
  await longPressTask(page, 'To do')
  await page.getByRole('radio', { name: 'In progress', exact: true }).click()
  await expect(page.getByLabel('0 tasks in To do', { exact: true })).toHaveCount(1)
  await expect(page.getByLabel('1 task in In progress', { exact: true })).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Confirm the release handoff, In progress', exact: true })).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Confirm the release handoff, To do', exact: true })).toHaveCount(1)
})

test('failed board move rolls back once and explains the conflict', async ({ page }) => {
  await openFixture(page, 'workspace-interaction-preview')
  await page.getByRole('button', { name: 'Use slow failure' }).click()
  await longPressTask(page, 'To do')
  await page.getByRole('radio', { name: 'Completed', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Confirm the release handoff, Completed', exact: true })).toHaveCount(1)
  await expect(page.getByRole('alert')).toContainText('returned to its saved place')
  await expect(page.getByRole('button', { name: 'Confirm the release handoff, To do', exact: true })).toHaveCount(1)
  await expect(page.getByLabel('0 tasks in Completed', { exact: true })).toHaveCount(1)
})

test('short board, loading states, dark appearance, and reduced motion fit at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' })
  await openFixture(page, 'workspace-interaction-preview')
  await page.getByRole('button', { name: 'Use worst-case data' }).click()
  await page.getByRole('button', { name: 'Use short board height' }).click()
  await expect(page.getByRole('progressbar', { name: 'Loading Project updates' })).toHaveCount(1)
  await page.getByRole('button', { name: 'Resolve loading' }).click()
  await expect(page.getByText('No Project updates in the loaded page.', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Load more updates', exact: true })).toBeVisible()
  const board = page.getByLabel('Board viewport fixture')
  expect((await board.boundingBox())?.height).toBe(300)
  await assertNoPageOverflow(page)
})

type AudioWindow = Window & { regressionAudio: HTMLMediaElement[] }
test('voice controls deliver holds to message actions without starting playback or seeking', async ({ page }) => {
  await page.addInitScript(() => {
    const scope = window as Window & { observedVoiceSeeks: number[] }
    scope.observedVoiceSeeks = []
    const time = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime')!
    Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', {
      ...time,
      set(value: number) {
        if (value > 0) scope.observedVoiceSeeks.push(value)
        time.set!.call(this, value)
      },
    })
  })
  await openFixture(page, 'attachment-preview?data=worst')
  const play = page.getByRole('button', { name: 'Play voice note', exact: true }).first()
  await expect(play).toBeEnabled()
  async function hold(locator: ReturnType<Page['getByRole']>) {
    await locator.scrollIntoViewIfNeeded()
    const box = await locator.boundingBox()
    if (!box) throw new Error('Voice control has no visible bounds')
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.waitForTimeout(650)
    await page.mouse.up()
  }
  await hold(play)
  await expect(page.getByLabel('Voice action count')).toHaveText('Voice actions opened: 1')
  await expect(play).toBeVisible()
  const track = page.getByRole('slider', { name: 'Voice note position' }).first()
  await hold(track)
  await expect(page.getByLabel('Voice action count')).toHaveText('Voice actions opened: 2')
  expect(await page.evaluate(() => (window as Window & { observedVoiceSeeks: number[] }).observedVoiceSeeks)).toEqual([])
  await play.click()
  await expect(page.getByRole('button', { name: 'Pause voice note', exact: true })).toBeVisible()
  await track.click()
  await expect.poll(() => page.evaluate(() => (window as Window & { observedVoiceSeeks: number[] }).observedVoiceSeeks.length)).toBe(1)
})
test('real web audio pauses its clock and switches notes without concurrent playback', async ({ page }) => {
  await page.addInitScript(() => {
    const scope = window as AudioWindow
    scope.regressionAudio = []
    const play = HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.play = function () {
      if (!scope.regressionAudio.includes(this)) scope.regressionAudio.push(this)
      return play.call(this)
    }
  })
  await openFixture(page, 'attachment-preview?data=worst')
  const playButtons = page.getByRole('button', { name: 'Play voice note', exact: true })
  await expect(playButtons.first()).toBeEnabled()
  await playButtons.first().click()
  await expect.poll(() => page.evaluate(() => (window as AudioWindow).regressionAudio[0]?.paused)).toBe(false)
  await page.getByRole('button', { name: 'Pause voice note', exact: true }).click()
  await expect.poll(() => page.evaluate(() => (window as AudioWindow).regressionAudio[0].paused)).toBe(true)
  const time = await page.evaluate(() => (window as AudioWindow).regressionAudio[0].currentTime)
  await page.waitForTimeout(600)
  expect(await page.evaluate(() => (window as AudioWindow).regressionAudio[0].paused)).toBe(true)
  expect(await page.evaluate(() => (window as AudioWindow).regressionAudio[0].currentTime)).toBe(time)
  await playButtons.first().click()
  await expect(page.getByRole('button', { name: 'Pause voice note', exact: true })).toHaveCount(1)
  await playButtons.first().click()
  await expect.poll(() => page.evaluate(() => {
    const notes = (window as AudioWindow).regressionAudio
    return notes.length === 2 && notes[0].paused && !notes[1].paused
  })).toBe(true)
  await page.getByRole('button', { name: 'Pause voice note', exact: true }).click()
})
