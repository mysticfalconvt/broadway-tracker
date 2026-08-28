import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { and, asc, eq, ne, or } from 'drizzle-orm'
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

export const searchPeople = createServerFn({ method: 'GET' })
  .validator(z.object({ handle: z.string().trim().min(1).max(30) }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    return getDb()
      .select({ id: user.id, name: user.name, handle: user.handle })
      .from(user)
      .where(and(ne(user.id, session.user.id), eq(user.handle, data.handle.toLowerCase())))
      .limit(1)
  })

export const getMyFriends = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await requireSession()
  const rows = await getDb()
    .select()
    .from(friendships)
    .where(
      or(eq(friendships.userOneId, session.user.id), eq(friendships.userTwoId, session.user.id)),
    )
    .orderBy(asc(friendships.createdAt))
  const otherIds = rows.map((row) =>
    row.userOneId === session.user.id ? row.userTwoId : row.userOneId,
  )
  const people = otherIds.length
    ? await getDb()
        .select({ id: user.id, name: user.name, handle: user.handle })
        .from(user)
        .where(or(...otherIds.map((id) => eq(user.id, id))))
    : []
  return rows.map((row) => ({
    ...row,
    person: people.find(
      (person) => person.id === (row.userOneId === session.user.id ? row.userTwoId : row.userOneId),
    )!,
    isIncoming: row.requestedByUserId !== session.user.id,
  }))
})

export const sendFriendRequest = createServerFn({ method: 'POST' })
  .validator(z.object({ userId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    if (data.userId === session.user.id) throw new Error('You cannot add yourself.')
    const [userOneId, userTwoId] = pair(session.user.id, data.userId)
    const [target] = await getDb()
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, data.userId))
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
    await getDb()
      .insert(friendships)
      .values({ userOneId, userTwoId, requestedByUserId: session.user.id })
  })

export const respondToFriendRequest = createServerFn({ method: 'POST' })
  .validator(z.object({ userId: z.string().min(1), accept: z.boolean() }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    const [userOneId, userTwoId] = pair(session.user.id, data.userId)
    const condition = and(
      eq(friendships.userOneId, userOneId),
      eq(friendships.userTwoId, userTwoId),
      eq(friendships.status, 'pending'),
      ne(friendships.requestedByUserId, session.user.id),
    )
    if (data.accept)
      await getDb()
        .update(friendships)
        .set({ status: 'accepted', updatedAt: new Date() })
        .where(condition)
    else await getDb().delete(friendships).where(condition)
  })

export const removeFriendship = createServerFn({ method: 'POST' })
  .validator(z.object({ userId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    const [userOneId, userTwoId] = pair(session.user.id, data.userId)
    await getDb()
      .delete(friendships)
      .where(and(eq(friendships.userOneId, userOneId), eq(friendships.userTwoId, userTwoId)))
  })
