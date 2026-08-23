import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

function loadFetchHandler() {
  const listeners = {}
  const worker = {
    addEventListener: (type, handler) => {
      listeners[type] = handler
    },
    location: { origin: 'https://track.example.test' },
  }
  runInNewContext(
    readFileSync(resolve(process.cwd(), process.cwd().endsWith('/apps/web')
      ? 'public/service-worker.js'
      : 'apps/web/public/service-worker.js'), 'utf8'),
    { Set, URL, fetch: () => new Promise(() => undefined), self: worker },
  )
  return listeners.fetch
}

describe('service worker cache policy', () => {
  it('handles only fixed public shell assets', () => {
    const fetchHandler = loadFetchHandler()
    const cacheable = [
      'https://track.example.test/favicon.svg',
      'https://track.example.test/manifest.json',
    ]
    const blocked = [
      { mode: 'navigate', url: 'https://track.example.test/workspace' },
      { mode: 'cors', url: 'https://track.example.test/api/auth/session' },
      { mode: 'cors', url: 'https://track.example.test/api/projects' },
      { mode: 'no-cors', url: 'https://track.example.test/logo192.png?version=personalized' },
      { mode: 'no-cors', url: 'https://cdn.example.test/logo192.png' },
    ]

    for (const url of cacheable) {
      const event = { request: { method: 'GET', mode: 'no-cors', url }, respondWith: () => undefined }
      let responded = false
      event.respondWith = () => {
        responded = true
      }
      fetchHandler(event)
      expect(responded).toBe(true)
    }

    for (const { mode, url } of blocked) {
      const event = { request: { method: 'GET', mode, url }, respondWith: () => undefined }
      let responded = false
      event.respondWith = () => {
        responded = true
      }
      fetchHandler(event)
      expect(responded).toBe(false)
    }
  })
})
