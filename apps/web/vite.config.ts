import { defineConfig, loadEnv } from 'vite'
import { fileURLToPath } from 'node:url'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

const config = defineConfig(({ mode }) => {
  const webRoot = fileURLToPath(new URL('.', import.meta.url)).replaceAll('\\', '/').replace(/\/$/, '')
  const workspaceRoot = fileURLToPath(new URL('../..', import.meta.url)).replaceAll('\\', '/').replace(/\/$/, '')
  const env = loadEnv(mode, '../..', '')
  for (const [key, value] of Object.entries(env)) {
    process.env[key] ??= value
  }
  process.env.VITE_CONVEX_URL ??= env.CONVEX_URL
  process.env.VITE_CONVEX_SITE_URL ??= env.CONVEX_SITE_URL

  return {
    cacheDir: '../../node_modules/.vite',
    envDir: '../..',
    server: {
      host: 'localhost',
      port: 3000,
      watch: {
        ignored: ['**/.output/**'],
      },
      fs: {
        allow: [
          workspaceRoot,
          webRoot,
        ],
      },
    },
    resolve: {
      dedupe: ['react', 'react-dom'],
      tsconfigPaths: true,
    },
    ssr: {
      // Keep SSR dependencies on Vite's deduplicated React instance. With the
      // hoisted workspace linker, externalized Convex can resolve a nested
      // physical React copy that does not share the renderer's hook dispatcher.
      noExternal: ['convex', '@convex-dev/better-auth'],
    },
    plugins: [
      {
        name: 'track-dev-workspace-url-bridge',
        apply: 'serve',
        configureServer(server) {
          server.middlewares.use((request, _response, next) => {
            const requestUrl = request.url
            if (!requestUrl) {
              next()
              return
            }

            const [pathname, query] = requestUrl.split('?')
            const targetRoot = pathname.startsWith('/src/')
              ? webRoot
              : pathname.startsWith('/node_modules/.vite/')
                ? workspaceRoot
                : undefined

            if (!targetRoot) {
              next()
              return
            }

            request.url = `/@fs/${targetRoot}${pathname}${query ? `?${query}` : ''}`
            next()
          })
        },
      },
      devtools(),
      tailwindcss(),
      tanstackStart(),
      viteReact(),
      nitro({
        compatibilityDate: '2026-07-01',
        preset: 'cloudflare-module',
        cloudflare: { wrangler: { name: 'track-web' } },
        rollupConfig: { external: [/^@sentry\//] },
      }),
    ],
  }
})

export default config
