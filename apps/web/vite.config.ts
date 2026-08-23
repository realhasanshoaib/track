import { defineConfig, loadEnv } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

const config = defineConfig(({ mode }) => {
  const env = loadEnv(mode, '../..', '')
  if (
    mode === 'production' &&
    (env.VITE_DEV_AUTH_BYPASS || env.VITE_DEV_AUTH_BYPASS_PASSWORD)
  ) {
    throw new Error('Production web builds must not include development auth bypass values')
  }
  for (const [key, value] of Object.entries(env)) {
    process.env[key] ??= value
  }
  process.env.VITE_CONVEX_URL ??= env.CONVEX_URL
  process.env.VITE_CONVEX_SITE_URL ??= env.CONVEX_SITE_URL

  return {
    envDir: '../..',
    resolve: {
      dedupe: ['react', 'react-dom'],
      tsconfigPaths: true,
    },
    plugins: [
      devtools(),
      nitro({
        compatibilityDate: '2026-07-01',
        preset: 'cloudflare-module',
        cloudflare: { wrangler: { name: 'track-web' } },
        rollupConfig: { external: [/^@sentry\//] },
      }),
      tailwindcss(),
      tanstackStart(),
      viteReact(),
    ],
  }
})

export default config
