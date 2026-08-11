import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

const reactPath = fileURLToPath(new URL('../../node_modules/react', import.meta.url))
const reactDomPath = fileURLToPath(new URL('./node_modules/react-dom', import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      react: reactPath,
      'react-dom': reactDomPath,
    },
    dedupe: ['react', 'react-dom'],
  },
  test: {
    deps: {
      optimizer: {
        client: {
          enabled: true,
          include: [
            'react',
            'react/jsx-runtime',
            'react-dom',
            'react-dom/client',
            '@testing-library/react',
            '@tanstack/react-router',
            '@tanstack/react-store',
            'react-i18next',
            'use-sync-external-store',
            'use-sync-external-store/shim',
            'use-sync-external-store/shim/with-selector',
          ],
        },
      },
    },
    environment: 'jsdom',
    passWithNoTests: true,
    server: {
      deps: {
        inline: true,
      },
    },
  },
})
