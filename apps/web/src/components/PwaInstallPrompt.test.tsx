import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import '#/i18n'

import PwaInstallPrompt from './PwaInstallPrompt'

function setUserAgent(userAgent: string) {
  Object.defineProperty(window.navigator, 'userAgent', {
    configurable: true,
    value: userAgent,
  })
}

beforeEach(() => {
  const storage = new Map<string, string>()
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      clear: () => storage.clear(),
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  })
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  })
  Object.defineProperty(window.navigator, 'standalone', {
    configurable: true,
    value: false,
  })
})

describe('PwaInstallPrompt', () => {
  it('shows the iOS install affordance when Safari cannot trigger a native prompt', () => {
    setUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    )

    render(<PwaInstallPrompt />)

    expect(screen.getByLabelText('Install Track')).toBeTruthy()
    expect(screen.getByText('Share, then Add to Home Screen.')).toBeTruthy()
  })

  it('uses the browser install prompt when Android Chrome reports installability', async () => {
    setUserAgent(
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
    )
    const installPrompt = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
      prompt: ReturnType<typeof vi.fn>
      userChoice: Promise<{ outcome: 'accepted' }>
    }
    installPrompt.prompt = vi.fn(() => Promise.resolve())
    installPrompt.userChoice = Promise.resolve({ outcome: 'accepted' })

    render(<PwaInstallPrompt />)
    window.dispatchEvent(installPrompt)

    fireEvent.click(await screen.findByRole('button', { name: 'Install' }))

    await waitFor(() => expect(installPrompt.prompt).toHaveBeenCalledOnce())
    expect(window.localStorage.getItem('track:pwa-install-dismissed')).toBe('true')
  })
})
