import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'

import { getDb } from './db/client'
import { apiKeys, user } from './db/schema'
import { requireSession } from './session'

/**
 * Keys that let a member's own agent act as them.
 *
 * Everything a key can do, it does by calling the same functions the website
 * calls, as the same person. This file only answers one question — which member
 * is this? — and the rest of the app is unchanged by the answer arriving in a
 * header rather than a cookie.
 */

const PREFIX = 'bt_'

/** How the token is stored and compared. Never reversed, never logged. */
function fingerprint(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export const createApiKey = createServerOnlyFn(async (userId: string, name: string) => {
  const label = name.trim().replace(/\s+/g, ' ')
  if (!label) throw new Error('Give the key a name so you can tell it apart later.')

  const living = await getDb()
    .select({ id: apiKeys.id })
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)))
  // Not a security boundary — one key is as powerful as ten. It is a tidiness
  // one: a list nobody can read is a list nobody revokes from.
  if (living.length >= 10) {
    throw new Error('That is ten keys already. Revoke one you are not using.')
  }

  const token = `${PREFIX}${randomBytes(20).toString('hex')}`
  const [row] = await getDb()
    .insert(apiKeys)
    .values({
      userId,
      name: label,
      tokenHash: fingerprint(token),
      prefix: token.slice(0, PREFIX.length + 6),
    })
    .returning()

  // The only time the token exists outside the caller's hands.
  return { token, key: row! }
})

export const apiKeysFor = createServerOnlyFn(async (userId: string) =>
  getDb()
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      prefix: apiKeys.prefix,
      lastUsedAt: apiKeys.lastUsedAt,
      revokedAt: apiKeys.revokedAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.userId, userId))
    .orderBy(desc(apiKeys.createdAt)),
)

export const revokeApiKey = createServerOnlyFn(async (userId: string, keyId: string) => {
  const [revoked] = await getDb()
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    // Scoped to the owner, so a key id learned from somewhere else is not
    // enough to turn off somebody's agent.
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, userId)))
    .returning({ id: apiKeys.id })
  if (!revoked) throw new Error('That key is not yours to revoke.')
  return revoked
})

/**
 * The member a token stands for, or nobody.
 *
 * This is the API's whole authentication story, and it is deliberately the
 * same shape as `currentSession`: it returns a person, and every guard
 * downstream is the one that already existed.
 */
export const actorForToken = createServerOnlyFn(async (offered: string | null | undefined) => {
  if (!offered) return null
  const token = offered.trim()
  if (!token.startsWith(PREFIX)) return null

  const [found] = await getDb()
    .select({ id: apiKeys.id, userId: apiKeys.userId, tokenHash: apiKeys.tokenHash })
    .from(apiKeys)
    .where(and(eq(apiKeys.tokenHash, fingerprint(token)), isNull(apiKeys.revokedAt)))
    .limit(1)
  if (!found) return null

  // The lookup was by hash so this can only agree, but comparing in constant
  // time costs nothing and means no future change here reintroduces a timing
  // signal by accident.
  const a = Buffer.from(found.tokenHash)
  const b = Buffer.from(fingerprint(token))
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  const [member] = await getDb().select().from(user).where(eq(user.id, found.userId)).limit(1)
  if (!member) return null

  await getDb().update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, found.id))
  return member
})

export const listMyApiKeys = createServerFn({ method: 'GET' }).handler(async () =>
  apiKeysFor((await requireSession()).user.id),
)

export const issueApiKey = createServerFn({ method: 'POST' })
  .validator(z.object({ name: z.string().trim().min(1).max(80) }))
  .handler(async ({ data }) => createApiKey((await requireSession()).user.id, data.name))

export const dropApiKey = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => revokeApiKey((await requireSession()).user.id, data.id))
