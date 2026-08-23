import { createCsrfMiddleware, createMiddleware, createStart } from '@tanstack/react-start'

import { applySecurityHeaders } from '#/lib/security-headers'

const securityHeadersMiddleware = createMiddleware().server(async ({ next, request, pathname, handlerType }) => {
  const result = await next()
  const development = process.env.NODE_ENV === 'development'

  return {
    ...result,
    response: applySecurityHeaders(result.response, request, pathname, handlerType, { development }),
  }
})

const csrfMiddleware = createCsrfMiddleware({
  filter: ({ handlerType }) => handlerType === 'serverFn',
})

export const startInstance = createStart(() => ({
  requestMiddleware: [securityHeadersMiddleware, csrfMiddleware],
}))
