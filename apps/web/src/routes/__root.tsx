import { HeadContent, Scripts, createRootRoute, useRouterState } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import AppProviders from '../components/AppProviders'
import PwaInstallPrompt from '../components/PwaInstallPrompt'
import { captureNavigation, installUnhandledCapture } from '../lib/browser-diagnostics'

import appCss from '../styles.css?url'

const SITE_URL = 'https://track.q9labs.ai'
const SITE_TITLE = 'Track - Conversation for Your Team'
const SITE_DESCRIPTION =
  'Track keeps project conversations and attachments in one workspace.'

const THEME_COLOR_LIGHT = '#faf9f7'
const THEME_COLOR_DARK = '#151412'
const THEME_INIT_SCRIPT = `(function(){try{var stored=window.localStorage.getItem('theme');var mode=(stored==='light'||stored==='dark'||stored==='auto')?stored:'auto';var prefersDark=window.matchMedia('(prefers-color-scheme: dark)').matches;var resolved=mode==='auto'?(prefersDark?'dark':'light'):mode;var root=document.documentElement;root.classList.remove('light','dark');root.classList.add(resolved);if(mode==='auto'){root.removeAttribute('data-theme')}else{root.setAttribute('data-theme',mode)}root.style.colorScheme=resolved;var themeColor=resolved==='dark'?'${THEME_COLOR_DARK}':'${THEME_COLOR_LIGHT}';var applyThemeColor=function(){var meta=document.querySelector('meta[name="theme-color"]');if(meta){meta.setAttribute('content',themeColor)}};if(document.querySelector('meta[name="theme-color"]')){applyThemeColor()}else{document.addEventListener('DOMContentLoaded',applyThemeColor,{once:true})}}catch(e){}})();`
const enableDevtools = import.meta.env.DEV && import.meta.env.VITE_DEVTOOLS === '1'
const enableReactGrab = import.meta.env.DEV && import.meta.env.VITE_REACT_GRAB !== '0'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: SITE_TITLE,
      },
      {
        name: 'description',
        content: SITE_DESCRIPTION,
      },
      {
        name: 'robots',
        content: 'index, follow',
      },
      {
        name: 'application-name',
        content: 'Track',
      },
      {
        name: 'apple-mobile-web-app-title',
        content: 'Track',
      },
      {
        name: 'apple-mobile-web-app-capable',
        content: 'yes',
      },
      {
        name: 'apple-mobile-web-app-status-bar-style',
        content: 'black-translucent',
      },
      {
        name: 'mobile-web-app-capable',
        content: 'yes',
      },
      {
        name: 'theme-color',
        content: THEME_COLOR_LIGHT,
      },
      {
        property: 'og:type',
        content: 'website',
      },
      {
        property: 'og:url',
        content: SITE_URL,
      },
      {
        property: 'og:title',
        content: SITE_TITLE,
      },
      {
        property: 'og:description',
        content: SITE_DESCRIPTION,
      },
      {
        property: 'og:site_name',
        content: 'Track',
      },
      {
        property: 'og:image',
        content: `${SITE_URL}/logo512.png`,
      },
      {
        property: 'og:image:width',
        content: '512',
      },
      {
        property: 'og:image:height',
        content: '512',
      },
      {
        property: 'og:image:alt',
        content: 'Track team chat logo',
      },
      {
        name: 'twitter:card',
        content: 'summary',
      },
      {
        name: 'twitter:title',
        content: SITE_TITLE,
      },
      {
        name: 'twitter:description',
        content: SITE_DESCRIPTION,
      },
      {
        name: 'twitter:image',
        content: `${SITE_URL}/logo512.png`,
      },
      {
        name: 'twitter:image:alt',
        content: 'Track team chat logo',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
      {
        rel: 'canonical',
        href: SITE_URL,
      },
      {
        rel: 'icon',
        href: '/favicon.ico',
        sizes: 'any',
      },
      {
        rel: 'icon',
        href: '/favicon.svg',
        type: 'image/svg+xml',
      },
      {
        rel: 'apple-touch-icon',
        href: '/apple-touch-icon.png',
      },
      {
        rel: 'manifest',
        href: '/manifest.json',
      },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  const routeId = useRouterState({ select: (state) => state.matches.at(-1)?.routeId })

  useEffect(() => installUnhandledCapture(), [])

  useEffect(() => {
    if (routeId && routeId !== '__root__') {
      const template =
        routeId
          .replace(
            /\$([a-zA-Z0-9_]+)/g,
            (_match, parameter: string) => `:${parameter.toLowerCase()}`,
          )
          .replace(/\/$/, '') || '/'
      captureNavigation(template)
    }
  }, [routeId])
  useEffect(() => {
    if (enableReactGrab) {
      void import('react-grab')
    }
  }, [])

  useEffect(() => {
    if (import.meta.env.DEV || !('serviceWorker' in navigator)) return
    let refreshing = false
    const hadController = Boolean(navigator.serviceWorker.controller)
    const handleControllerChange = () => {
      if (!hadController) return
      if (refreshing) return
      refreshing = true
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange)
    void navigator.serviceWorker
      .register('/service-worker.js')
      .then((registration) => registration.update())
    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange)
    }
  }, [])

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <HeadContent />
      </head>
      <body className="font-sans antialiased [overflow-wrap:anywhere] selection:bg-[rgba(240,177,0,0.28)]">
        <AppProviders>
          {children}
          <PwaInstallPrompt />
          {enableDevtools ? <TrackDevtools /> : null}
        </AppProviders>
        <Scripts />
      </body>
    </html>
  )
}

function TrackDevtools() {
  const [Devtools, setDevtools] = useState<React.ComponentType | null>(null)

  useEffect(() => {
    let mounted = true
    void Promise.all([
      import('@tanstack/react-devtools'),
      import('@tanstack/react-router-devtools'),
    ]).then(([reactDevtools, routerDevtools]) => {
      if (!mounted) return
      setDevtools(
        () =>
          // oxlint-disable-next-line react/no-unstable-nested-components, unicorn/consistent-function-scoping -- intentional lazy devtools component after dynamic import; existing behavior.
          function TrackDevtoolsPanel() {
            return (
              <reactDevtools.TanStackDevtools
                config={{
                  position: 'bottom-right',
                }}
                plugins={[
                  {
                    name: 'Tanstack Router',
                    render: <routerDevtools.TanStackRouterDevtoolsPanel />,
                  },
                ]}
              />
            )
          },
      )
    })
    return () => {
      mounted = false
    }
  }, [])

  return Devtools ? <Devtools /> : null
}
