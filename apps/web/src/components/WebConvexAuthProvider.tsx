import { ConvexProviderWithAuth } from 'convex/react'
import { useCallback, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react'

import { authClient } from '#/lib/auth-client'
import {
  sanitizeAuthFlowCallback,
  webAuthFlowStorageKey,
} from '#/lib/auth-flow'
import { convexClient } from '#/lib/convex-client'

type CachedAccessToken = Readonly<{ sessionId: string | undefined; token: string }>

export function WebConvexAuthProvider({ children }: PropsWithChildren) {
  useEffect(() => {
    if (!globalThis.location?.href || !globalThis.history) return

    const expectedFlowNonce = globalThis.sessionStorage?.getItem(webAuthFlowStorageKey) ?? null
    const callback = sanitizeAuthFlowCallback(globalThis.location.href, expectedFlowNonce)
    if (!callback.sanitizedUrl) return

    globalThis.history.replaceState({}, '', callback.sanitizedUrl)
    globalThis.sessionStorage.removeItem(webAuthFlowStorageKey)
    if (!callback.token) return
    void consumeOneTimeToken(callback.token).catch(() => {
      console.error('Could not complete the one-time web sign-in exchange')
    })
  }, [])

  return (
    <ConvexProviderWithAuth client={convexClient} useAuth={useWebAuth}>
      {children}
    </ConvexProviderWithAuth>
  )
}

function useWebAuth() {
  const [cachedAccessToken, setCachedAccessToken] = useState<CachedAccessToken | null>(null)
  const pendingToken = useRef<Promise<string | null> | null>(null)
  const { data: session, isPending } = authClient.useSession()
  const sessionId = session?.session.id
  const latestSessionId = useRef(sessionId)
  const cachedToken = cachedAccessToken && cachedAccessToken.sessionId === sessionId
    ? cachedAccessToken.token
    : null

  useEffect(() => {
    const sessionChanged = latestSessionId.current !== sessionId
    latestSessionId.current = sessionId
    if (sessionChanged || (!sessionId && !isPending)) {
      pendingToken.current = null
      setCachedAccessToken(null)
    }
  }, [isPending, sessionId])

  const fetchAccessToken = useCallback(async ({ forceRefreshToken = false } = {}) => {
    if (cachedToken && !forceRefreshToken) return cachedToken
    if (!forceRefreshToken && pendingToken.current) return pendingToken.current

    const requestSessionId = sessionId
    const request = authClient.convex
      .token({ fetchOptions: { throw: false } })
      .then(({ data }) => data?.token ?? null)
      .catch(() => null)
      .then((token) => {
        if (latestSessionId.current !== requestSessionId) return null
        setCachedAccessToken(token ? { sessionId: requestSessionId, token } : null)
        return token
      })
    pendingToken.current = request
    try {
      return await request
    } finally {
      if (pendingToken.current === request) pendingToken.current = null
    }
  }, [cachedToken, sessionId])

  return useMemo(() => ({
    isLoading: isPending && !cachedToken,
    isAuthenticated: Boolean(session?.session) || Boolean(cachedToken),
    fetchAccessToken,
  }), [cachedToken, fetchAccessToken, isPending, session?.session])
}

async function consumeOneTimeToken(token: string) {
  const exchange = await authClient.crossDomain.oneTimeToken.verify({ token })
  if (exchange.error) {
    throw new Error(exchange.error.message ?? exchange.error.code ?? 'One-time sign-in exchange failed')
  }

  authClient.updateSession()
}
