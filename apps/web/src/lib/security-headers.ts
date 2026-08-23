export type RequestHandlerType = 'router' | 'serverFn'

type SecurityHeaderOptions = {
  development?: boolean
}

const immutableAssetPathPattern = /^(?:\/_build\/|\/assets\/)/

export function isApiOrAuthPath(pathname: string) {
  return pathname === '/api' || pathname.startsWith('/api/') || pathname === '/auth' || pathname.startsWith('/auth/')
}

export function isNavigationRequest(request: Request, pathname: string, handlerType: RequestHandlerType) {
  if (handlerType !== 'router' || immutableAssetPathPattern.test(pathname)) return false
  if (request.method !== 'GET' && request.method !== 'HEAD') return false

  return true
}

export function isNoStoreRequest(request: Request, pathname: string, handlerType: RequestHandlerType) {
  if (immutableAssetPathPattern.test(pathname)) return false
  return handlerType === 'serverFn' || isApiOrAuthPath(pathname) || isNavigationRequest(request, pathname, handlerType)
}

export function getContentSecurityPolicy(development = false) {
  const scriptSources = development ? "'self' 'unsafe-inline' 'unsafe-eval'" : "'self' 'unsafe-inline'"
  const connectSources = development
    ? "'self' https://*.convex.cloud https://*.convex.site wss://*.convex.cloud http://localhost:* ws://localhost:*"
    : "'self' https://*.convex.cloud https://*.convex.site wss://*.convex.cloud"

  return [
    "default-src 'self'",
    `script-src ${scriptSources}`,
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://*.convex.cloud https://*.convex.site",
    `connect-src ${connectSources}`,
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
  ].join('; ')
}

export function applySecurityHeaders(
  response: Response,
  request: Request,
  pathname: string,
  handlerType: RequestHandlerType,
  options: SecurityHeaderOptions = {},
) {
  const headers = new Headers(response.headers)
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  headers.set('X-Frame-Options', 'DENY')
  headers.set('Permissions-Policy', 'camera=(), geolocation=(), microphone=(self), payment=(), usb=()')
  headers.set('Content-Security-Policy', getContentSecurityPolicy(options.development ?? false))

  if (!options.development && new URL(request.url).protocol === 'https:') {
    headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }

  if (isNoStoreRequest(request, pathname, handlerType)) {
    headers.set('Cache-Control', 'no-store')
  }

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  })
}
