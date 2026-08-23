export const webAuthFlowStorageKey = 'track-web-auth-flow'

export type SanitizedAuthFlowCallback = Readonly<{
  sanitizedUrl: string | null
  token: string | null
}>

export function beginWebAuthFlow(callbackPath: string) {
  if (!globalThis.crypto?.getRandomValues || !globalThis.sessionStorage) {
    throw new Error('Secure browser storage is required for social sign-in')
  }

  const bytes = new Uint8Array(32)
  globalThis.crypto.getRandomValues(bytes)
  const flowNonce = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  globalThis.sessionStorage.setItem(webAuthFlowStorageKey, flowNonce)
  return addAuthFlowToCallback(callbackPath, flowNonce)
}

export function clearWebAuthFlow() {
  globalThis.sessionStorage?.removeItem(webAuthFlowStorageKey)
}

export function addAuthFlowToCallback(callbackPath: string, flowNonce: string) {
  const url = new URL(callbackPath, 'https://track.local')
  if (url.origin !== 'https://track.local' || !callbackPath.startsWith('/') || callbackPath.startsWith('//')) {
    throw new Error('Social sign-in callback must be a local path')
  }
  url.searchParams.set('flow', flowNonce)
  return `${url.pathname}${url.search}${url.hash}`
}

export function sanitizeAuthFlowCallback(
  value: string,
  expectedFlowNonce: string | null,
): SanitizedAuthFlowCallback {
  const url = new URL(value)
  const tokens = url.searchParams.getAll('ott')
  const flowNonces = url.searchParams.getAll('flow')
  const hasReusableCookie = url.searchParams.has('cookie')
  if (tokens.length === 0 && flowNonces.length === 0 && !hasReusableCookie) {
    return { sanitizedUrl: null, token: null }
  }

  url.searchParams.delete('ott')
  url.searchParams.delete('flow')
  url.searchParams.delete('cookie')
  const token =
    !hasReusableCookie &&
    tokens.length === 1 &&
    Boolean(tokens[0]) &&
    tokens[0].length <= 256 &&
    flowNonces.length === 1 &&
    Boolean(expectedFlowNonce) &&
    flowNonces[0] === expectedFlowNonce
      ? tokens[0]
      : null
  return { sanitizedUrl: url.toString(), token }
}
