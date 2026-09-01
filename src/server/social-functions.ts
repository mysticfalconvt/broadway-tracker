import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
import { and, asc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'

import { account } from './db/schema'
import { getDb } from './db/client'
import { requireSession } from './session'

/**
 * Which social providers this deployment has credentials for.
 *
 * `auth.ts` registers Google only when both the client id and secret are
 * present, so the button has to be told the same thing. Offering a sign-in
 * route that is not wired up produces a confusing failure instead of an honest
 * absence, and the credentials themselves never reach the browser — only
 * whether they exist.
 */
export const getSocialProviders = createServerFn({ method: 'GET' }).handler(async () => ({
  google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
}))

/**
 * Every way somebody can get back in.
 *
 * One account can hold several: a password, and a provider or two. What matters
 * about the list is not what it shows but what it protects — the last one
 * cannot be taken away, because doing so locks somebody out of their own
 * history with no way back.
 */
export const waysToSignIn = createServerOnlyFn(async (userId: string) => {
  const rows = await getDb()
    .select({
      id: account.id,
      providerId: account.providerId,
      accountId: account.accountId,
      // Never the token, and never the hash. This says a password exists.
      hasPassword: sql<boolean>`${account.password} is not null`,
      createdAt: account.createdAt,
    })
    .from(account)
    .where(eq(account.userId, userId))
    .orderBy(asc(account.createdAt))

  return rows.map((row) => ({
    id: row.id,
    providerId: row.providerId,
    // A Google account's own address is worth showing, because the whole point
    // is that it may not be the one on the profile.
    label: row.providerId === 'credential' ? 'Email and password' : row.providerId,
    hasPassword: row.hasPassword,
    createdAt: row.createdAt,
  }))
})

/**
 * Removes one way in, unless it is the only one.
 *
 * Better Auth will unlink whatever it is asked to. The refusal belongs here,
 * because the consequence is not "a provider is disconnected" — it is somebody
 * locked out of a decade of their own evenings, with the account still there
 * and no door left in it.
 */
export const disconnectWayIn = createServerOnlyFn(async (userId: string, accountRowId: string) => {
  const ways = await waysToSignIn(userId)
  if (ways.length <= 1) {
    throw new Error('That is the only way you can sign in. Add another before removing this one.')
  }
  const going = ways.find((way) => way.id === accountRowId)
  if (!going) throw new Error('That is not one of your sign-in methods.')

  await getDb()
    .delete(account)
    .where(and(eq(account.id, accountRowId), eq(account.userId, userId)))
  return { removed: going.providerId }
})

export const getWaysToSignIn = createServerFn({ method: 'GET' }).handler(async () =>
  waysToSignIn((await requireSession()).user.id),
)

export const removeWayToSignIn = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => disconnectWayIn((await requireSession()).user.id, data.id))
