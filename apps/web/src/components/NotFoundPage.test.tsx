import { RouterProvider, createMemoryHistory, createRootRoute, createRouter } from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'

import { i18nReady, LocaleProvider } from '#/i18n'

import { NotFoundPage } from './NotFoundPage'

beforeAll(async () => {
  await i18nReady
})

describe('NotFoundPage', () => {
  it('explains the missing page and offers a safe route home', async () => {
    const rootRoute = createRootRoute({ component: NotFoundPage })
    const router = createRouter({ routeTree: rootRoute, history: createMemoryHistory({ initialEntries: ['/missing'] }) })
    await router.load()

    render(
      <LocaleProvider>
        <RouterProvider router={router} />
      </LocaleProvider>,
    )

    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Return to Track' }).getAttribute('href')).toBe('/')
  })
})
