const loopbackHosts = new Set(['127.0.0.1', '::1', '[::1]', 'localhost'])
const appleOAuthOrigin = 'https://appleid.apple.com'

export function requireAuthSiteUrl(value: string) {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('SITE_URL or BETTER_AUTH_URL must be a valid origin')
  }

  const loopback = loopbackHosts.has(url.hostname)
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/' ||
    (url.protocol !== 'https:' && !(loopback && url.protocol === 'http:'))
  ) {
    throw new Error('SITE_URL or BETTER_AUTH_URL must be an HTTPS origin or an HTTP loopback origin')
  }

  return url.origin
}

export function authTrustedOrigins(siteUrl: string) {
  const origin = requireAuthSiteUrl(siteUrl)
  const url = new URL(origin)
  if (!loopbackHosts.has(url.hostname)) return [origin, appleOAuthOrigin]

  const host = url.hostname === '::1' ? '[::1]' : url.hostname
  return [...new Set([
    origin,
    `http://${host}:3000`,
    `http://${host}:8081`,
    `http://${host}:8082`,
    `http://${host}:8083`,
    appleOAuthOrigin,
  ])]
}
