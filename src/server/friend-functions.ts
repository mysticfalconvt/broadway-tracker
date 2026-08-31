import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
import { and, asc, eq, inArray, ne, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { requireSession } from './session'

import { getDb } from './db/client'
import { friendships, user } from './db/schema'

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

/**
 * Every user this person has an approved friendship with, as a set.
 *
 * Batched deliberately: deciding visibility for a list of people one
 * `areFriends` call at a time is a query per row, and the shared-memory page
 * needs the answer for every attendee at once.
 */
export const acceptedFriendIdsFor = createServerOnlyFn(async (userId: string) => {
  const rows = await getDb()
    .select({ userOneId: friendships.userOneId, userTwoId: friendships.userTwoId })
    .from(friendships)
    .where(
      and(
        eq(friendships.status, 'accepted'),
        or(eq(friendships.userOneId, userId), eq(friendships.userTwoId, userId)),
      ),
    )
  return new Set(rows.map((row) => (row.userOneId === userId ? row.userTwoId : row.userOneId)))
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

/**
 * What the person on the other end is sent, as words.
 *
 * Separate from the sending so it can be read and tested without a mail
 * server, and so the wording is somewhere obvious rather than buried in a try
 * block.
 */
export function friendRequestNotice(fromName: string, base: string) {
  return {
    subject: `${fromName} would like to share their theatre history with you`,
    // The last line is a promise, and the code keeps it: nothing follows this.
    text: `${fromName} has asked to be friends on Broadway Tracker, which means you would each see the nights the other has chosen to share.

${base}/friends

If you would rather not, ignoring this is an answer — nothing else will be sent about it.`,
  }
}

/**
 * Tells somebody a request is waiting, once.
 *
 * The one thing in this app that is *blocked on a person*. A night logged or a
 * piece written can be found whenever somebody next looks; a request sits doing
 * nothing until it is answered, and the person who sent it can see that it has
 * not been. That asymmetry is what earns an email where a feed item would not.
 *
 * Sent regardless of `digestCadence`. That setting governs the letter the app
 * composes about itself; this is one person asking another a question, and
 * silently swallowing it because a monthly summary was switched off would lose
 * something nobody meant to switch off.
 *
 * Once, and never again. There is no reminder, because a request ignored has
 * been answered. Delivery failures are logged rather than thrown: the request
 * itself is already recorded and must not be undone by a mail problem.
 */
async function notifyOfFriendRequest(actorId: string, targetId: string) {
  try {
    const rows = await getDb()
      .select({ id: user.id, name: user.name, email: user.email })
      .from(user)
      .where(inArray(user.id, [actorId, targetId]))
    const from = rows.find((row) => row.id === actorId)
    const to = rows.find((row) => row.id === targetId)
    if (!from || !to) return null

    const notice = friendRequestNotice(from.name, process.env.BETTER_AUTH_URL ?? '')
    const { sendEmail } = await import('./email')
    await sendEmail({ to: to.email, ...notice })
    return { to: to.email, ...notice }
  } catch (error) {
    console.error('[friends] could not tell them about the request', error)
    return null
  }
}

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
  /**
   * The check above can be overtaken: two people can ask each other at once, or
   * one person can double-click, and both calls pass it before either inserts.
   * Letting the second lose quietly is better than a constraint error — and it
   * is what keeps the promise of one email, because only the insert that
   * actually happened sends one.
   */
  const [recorded] = await getDb()
    .insert(friendships)
    .values({ userOneId, userTwoId, requestedByUserId: actorId })
    .onConflictDoNothing()
    .returning({ requestedByUserId: friendships.requestedByUserId })
  if (!recorded) return null

  // After the insert, and only if it happened: a request that did not save must
  // not send mail about itself, and one that did must not be undone by mail.
  return notifyOfFriendRequest(actorId, targetId)
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
