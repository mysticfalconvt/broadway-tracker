import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
import {
  deleteCookie,
  getCookie,
  getRequest,
  getRequestHeaders,
  setCookie,
} from '@tanstack/react-start/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { auth } from './auth'
import { getDb } from './db/client'
import { user } from './db/schema'

/**
 * The one place a request's identity is decided.
 *
 * Every server function used to call `auth.api.getSession` for itself, in
 * thirty-odd places. That was fine while the answer was always whoever holds
 * the cookie, and stops being fine the moment anything can change the answer:
 * a rule applied at thirty call sites is a rule applied at twenty-nine of them.
 */

const VIEWING_AS = 'viewing-as'

/** Refused mid-request, so nothing partial is written. */
export class ReadOnlyWhileViewing extends Error {
  constructor() {
    super('You are looking at somebody else’s account. Stop before changing anything.')
  }
}

/**
 * Who this request is for, and who is really making it.
 *
 * An administrator can look at the app as another member — the only reliable
 * way to answer "why can she not see my reviews", which is a question about
 * somebody else's screen. Three things keep that from being a back door:
 *
 *   - **The cookie alone means nothing.** It is honoured only when the real
 *     session belongs to an administrator, so a forged one does nothing at all.
 *   - **Never another administrator.** There is nothing to learn and nothing to
 *     gain, and it muddies the question of who did what.
 *   - **Reading only.** Anything other than a GET is refused while viewing.
 *     Enforced here rather than at each of the app's forty-seven mutations,
 *     because that is a rule you would apply to forty-six of them.
 */
export const currentSession = createServerOnlyFn(async () => {
  const real = await auth.api.getSession({ headers: getRequestHeaders() })
  if (!real) return null

  const targetId = getCookie(VIEWING_AS)
  if (!targetId || real.user.role !== 'admin') return real

  const [target] = await getDb().select().from(user).where(eq(user.id, targetId)).limit(1)
  if (!target || target.role === 'admin') return real

  if (getRequest().method !== 'GET') throw new ReadOnlyWhileViewing()

  return {
    ...real,
    user: { ...real.user, ...target },
    viewingAs: { realUserId: real.user.id, realName: real.user.name },
  }
})

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

/** Whether this request is an administrator looking through somebody's eyes. */
export const viewingAs = createServerOnlyFn(async () => {
  const session = await currentSession()
  return session && 'viewingAs' in session
    ? { name: session.user.name, handle: session.user.handle }
    : null
})

export const getViewingAs = createServerFn({ method: 'GET' }).handler(async () => viewingAs())

export const startViewingAs = createServerFn({ method: 'POST' })
  .validator(z.object({ userId: z.string() }))
  .handler(async ({ data }) => {
    // Read from the real session deliberately: an administrator already viewing
    // somebody must not be able to hop sideways without stopping first.
    const real = await auth.api.getSession({ headers: getRequestHeaders() })
    if (!real || real.user.role !== 'admin') throw new Error('Forbidden')

    const [target] = await getDb().select().from(user).where(eq(user.id, data.userId)).limit(1)
    if (!target) throw new Error('That account is not here.')
    if (target.role === 'admin') throw new Error('Administrators cannot be viewed as.')

    console.info('[viewing-as] started', {
      admin: real.user.email,
      target: target.email,
      at: new Date().toISOString(),
    })
    setCookie(VIEWING_AS, target.id, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      // Deliberately short. Nobody should be looking through somebody else's
      // eyes for an afternoon, and forgetting is the ordinary failure here.
      maxAge: 30 * 60,
    })
    return { name: target.name }
  })

export const stopViewingAs = createServerFn({ method: 'POST' }).handler(async () => {
  // Not routed through `currentSession`, which would refuse this very request
  // for being a POST while viewing.
  deleteCookie(VIEWING_AS, { path: '/' })
  return { stopped: true }
})
