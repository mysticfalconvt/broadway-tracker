import { createFileRoute } from '@tanstack/react-router'

import { auth } from '../../../server/auth'

async function handleAuthRequest(request: Request) {
  const isDevelopment = process.env.NODE_ENV !== 'production'
  if (isDevelopment) {
    console.info('[auth] request', {
      method: request.method,
      path: new URL(request.url).pathname,
      baseUrlConfigured: Boolean(process.env.BETTER_AUTH_URL),
      secretConfigured: Boolean(process.env.BETTER_AUTH_SECRET),
      smtpConfigured: Boolean(process.env.SMTP_HOST),
    })
  }
  try {
    const response = await auth.handler(request)
    if (isDevelopment) console.info('[auth] response', { status: response.status })
    return response
  } catch (error) {
    console.error('[auth] request failed', error)
    throw error
  }
}

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: async ({ request }) => handleAuthRequest(request),
      POST: async ({ request }) => handleAuthRequest(request),
    },
  },
})
