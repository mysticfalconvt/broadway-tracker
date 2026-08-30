import { createServerOnlyFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'

import { auth } from './auth'

/**
 * The one place a request's identity is decided.
 *
 * Every server function used to call `auth.api.getSession` for itself, in
 * thirty-odd places. That was fine while the answer was always "whoever holds
 * the cookie", and stops being fine the moment anything can change the answer:
 * a rule applied at thirty call sites is a rule applied at twenty-nine of them.
 */
export const currentSession = createServerOnlyFn(async () =>
  auth.api.getSession({ headers: getRequestHeaders() }),
)

/** The same, for anything that has no meaning without somebody signed in. */
export const requireSession = createServerOnlyFn(async () => {
  const session = await currentSession()
  if (!session) throw new Error('Unauthorized')
  return session
})

/** Just the id, for the many readers that only need to know whose view this is. */
export const currentViewerId = createServerOnlyFn(async () => {
  const session = await currentSession()
  return session?.user.id ?? null
})
