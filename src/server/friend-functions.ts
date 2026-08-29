import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { and, asc, eq, ne, or, sql } from 'drizzle-orm'
import { z } from 'zod'

import { auth } from './auth'
import { getDb } from './db/client'
import { friendships, user } from './db/schema'

async function requireSession() {
  const session = await auth.api.getSession({ headers: getRequestHeaders() })
  if (!session) throw new Error('Unauthorized')
  return session
}

function pair(userId: string, otherUserId: string) {
  return userId < otherUserId ? [userId, otherUserId] : [otherUserId, userId]
}

// The exported helpers below hold the authorization rules and take the acting
// user explicitly, so they can be exercised without a request. Each server
// function is a thin adapter that resolves the session.
//
// They are wrapped in `createServerOnlyFn` so the database client never follows
// them into the browser bundle -- server function handlers are stripped from
// client output, but a plain shared export would not be.

/** True only when an approved friendship connects the two users. */
export const areFriends = createServerOnlyFn(async (userId: string, otherUserId: string) => {
  if (userId === otherUserId) return false
  const [userOneId, userTwoId] = pair(userId, otherUserId)
  const [friendship] = await getDb()
    .select({ userOneId: friendships.userOneId })
    .from(friendships)
    .where(
      and(
        eq(friendships.userOneId, userOneId),
        eq(friendships.userTwoId, userTwoId),
        eq(friendships.status, 'accepted'),
      ),
    )
    .limit(1)
  return Boolean(friendship)
})

/**
 * How many friend requests are waiting on this person to answer.
 *
 * Only incoming ones count: a request you sent is not something you can act on,
 * so putting it on a badge would be asking for attention you cannot resolve.
 */
export const pendingRequestCountFor = createServerOnlyFn(async (userId: string) => {
  const [row] = await getDb()
    .select({ count: sql<number>`count(*)::int` })
    .from(friendships)
    .where(
      and(
        eq(friendships.status, 'pending'),
        ne(friendships.requestedByUserId, userId),
        or(eq(friendships.userOneId, userId), eq(friendships.userTwoId, userId)),
      ),
    )
  return row?.count ?? 0
})

export const findPersonByHandle = createServerOnlyFn(async (viewerId: string, handle: string) =>
  getDb()
    .select({ id: user.id, name: user.name, handle: user.handle })
    .from(user)
    .where(and(ne(user.id, viewerId), eq(user.handle, handle.toLowerCase())))
    .limit(1),
)

export const friendsForUser = createServerOnlyFn(async (userId: string) => {
  const rows = await getDb()
    .select()
    .from(friendships)
    .where(or(eq(friendships.userOneId, userId), eq(friendships.userTwoId, userId)))
    .orderBy(asc(friendships.createdAt))
  const otherIds = rows.map((row) => (row.userOneId === userId ? row.userTwoId : row.userOneId))
  const people = otherIds.length
    ? await getDb()
        .select({
          id: user.id,
          name: user.name,
          handle: user.handle,
          profileVisibility: user.profileVisibility,
        })
        .from(user)
        .where(or(...otherIds.map((id) => eq(user.id, id))))
    : []
  return rows.map((row) => ({
    ...row,
    // The friendship row always references a real user, so this resolves.
    person: people.find(
      (person) => person.id === (row.userOneId === userId ? row.userTwoId : row.userOneId),
    )!,
    isIncoming: row.requestedByUserId !== userId,
  }))
})

export const requestFriendship = createServerOnlyFn(async (actorId: string, targetId: string) => {
  if (targetId === actorId) throw new Error('You cannot add yourself.')
  const [userOneId, userTwoId] = pair(actorId, targetId)
  const [target] = await getDb()
    .select({ id: user.id })
    .from(user)
    .where(eq(user.id, targetId))
    .limit(1)
  if (!target) throw new Error('Person not found.')
  const [existing] = await getDb()
    .select()
    .from(friendships)
    .where(and(eq(friendships.userOneId, userOneId), eq(friendships.userTwoId, userTwoId)))
    .limit(1)
  if (existing)
    throw new Error(
      existing.status === 'accepted' ? 'You are already friends.' : 'A request already exists.',
    )
  await getDb().insert(friendships).values({ userOneId, userTwoId, requestedByUserId: actorId })
})

export const respondToFriendship = createServerOnlyFn(
  async (actorId: string, otherUserId: string, accept: boolean) => {
    const [userOneId, userTwoId] = pair(actorId, otherUserId)
    // Only the recipient of a still-pending request may answer it.
    const condition = and(
      eq(friendships.userOneId, userOneId),
      eq(friendships.userTwoId, userTwoId),
      eq(friendships.status, 'pending'),
      ne(friendships.requestedByUserId, actorId),
    )
    if (accept)
      await getDb()
        .update(friendships)
        .set({ status: 'accepted', updatedAt: new Date() })
        .where(condition)
    else await getDb().delete(friendships).where(condition)
  },
)

export const removeFriendshipBetween = createServerOnlyFn(
  async (actorId: string, otherUserId: string) => {
    const [userOneId, userTwoId] = pair(actorId, otherUserId)
    await getDb()
      .delete(friendships)
      .where(and(eq(friendships.userOneId, userOneId), eq(friendships.userTwoId, userTwoId)))
  },
)

export const searchPeople = createServerFn({ method: 'GET' })
  .validator(z.object({ handle: z.string().trim().min(1).max(30) }))
  .handler(async ({ data }) => findPersonByHandle((await requireSession()).user.id, data.handle))

export const getMyFriends = createServerFn({ method: 'GET' }).handler(async () =>
  friendsForUser((await requireSession()).user.id),
)

export const sendFriendRequest = createServerFn({ method: 'POST' })
  .validator(z.object({ userId: z.string().min(1) }))
  .handler(async ({ data }) => requestFriendship((await requireSession()).user.id, data.userId))

export const respondToFriendRequest = createServerFn({ method: 'POST' })
  .validator(z.object({ userId: z.string().min(1), accept: z.boolean() }))
  .handler(async ({ data }) =>
    respondToFriendship((await requireSession()).user.id, data.userId, data.accept),
  )

export const removeFriendship = createServerFn({ method: 'POST' })
  .validator(z.object({ userId: z.string().min(1) }))
  .handler(async ({ data }) =>
    removeFriendshipBetween((await requireSession()).user.id, data.userId),
  )
