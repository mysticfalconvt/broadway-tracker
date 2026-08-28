import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { and, asc, desc, eq, or, sql } from 'drizzle-orm'
import { z } from 'zod'

import { auth } from './auth'
import { getDb } from './db/client'
import { friendships, libraryEntries, listItems, lists, outings, shows, user } from './db/schema'

export const getMyProfile = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await auth.api.getSession({ headers: getRequestHeaders() })
  if (!session) throw new Error('Unauthorized')
  const db = getDb()
  const [seen, favorites, outingsCount, seenThisYear] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(libraryEntries)
      .where(and(eq(libraryEntries.userId, session.user.id), eq(libraryEntries.status, 'seen'))),
    db
      .select({
        id: shows.id,
        title: shows.title,
        slug: shows.slug,
        type: shows.type,
        coverImageKey: shows.coverImageKey,
      })
      .from(libraryEntries)
      .innerJoin(shows, eq(libraryEntries.showId, shows.id))
      .where(and(eq(libraryEntries.userId, session.user.id), eq(libraryEntries.favorite, true)))
      .orderBy(desc(libraryEntries.updatedAt))
      .limit(6),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(outings)
      .where(eq(outings.createdByUserId, session.user.id)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(outings)
      .where(
        and(
          eq(outings.createdByUserId, session.user.id),
          sql`extract(year from ${outings.occurredOn}) = extract(year from current_date)`,
        ),
      ),
  ])
  return {
    user: session.user,
    stats: {
      seen: seen[0]?.count ?? 0,
      outings: outingsCount[0]?.count ?? 0,
      seenThisYear: seenThisYear[0]?.count ?? 0,
    },
    favorites,
  }
})

export const getFriendProfile = createServerFn({ method: 'GET' })
  .validator(z.object({ handle: z.string().trim().min(1).max(30) }))
  .handler(async ({ data }) => {
    const session = await auth.api.getSession({ headers: getRequestHeaders() })
    if (!session) throw new Error('Unauthorized')
    const db = getDb()
    const [profile] = await db
      .select({ id: user.id, name: user.name, handle: user.handle })
      .from(user)
      .where(and(eq(user.handle, data.handle.toLowerCase()), eq(user.profileVisibility, 'friends')))
      .limit(1)
    if (!profile) throw new Error('This profile is unavailable.')
    const [friendship] = await db
      .select({ userOneId: friendships.userOneId })
      .from(friendships)
      .where(
        and(
          eq(friendships.status, 'accepted'),
          or(
            and(eq(friendships.userOneId, session.user.id), eq(friendships.userTwoId, profile.id)),
            and(eq(friendships.userTwoId, session.user.id), eq(friendships.userOneId, profile.id)),
          ),
        ),
      )
      .limit(1)
    if (!friendship) throw new Error('This profile is only available to friends.')
    const [seen, outingsCount, favorites, sharedLists] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(libraryEntries)
        .where(and(eq(libraryEntries.userId, profile.id), eq(libraryEntries.status, 'seen'))),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(outings)
        .where(eq(outings.createdByUserId, profile.id)),
      db
        .select({ id: shows.id, title: shows.title, slug: shows.slug, type: shows.type })
        .from(libraryEntries)
        .innerJoin(shows, eq(libraryEntries.showId, shows.id))
        .where(
          and(
            eq(libraryEntries.userId, profile.id),
            eq(libraryEntries.favorite, true),
            eq(libraryEntries.visibility, 'friends'),
          ),
        )
        .orderBy(desc(libraryEntries.updatedAt))
        .limit(6),
      db
        .select({
          id: lists.id,
          title: lists.title,
          description: lists.description,
          itemCount: sql<number>`count(${listItems.showId})::int`,
        })
        .from(lists)
        .leftJoin(listItems, eq(listItems.listId, lists.id))
        .where(and(eq(lists.userId, profile.id), eq(lists.visibility, 'friends')))
        .groupBy(lists.id)
        .orderBy(asc(lists.title)),
    ])
    return {
      user: profile,
      stats: { seen: seen[0]?.count ?? 0, outings: outingsCount[0]?.count ?? 0 },
      favorites,
      lists: sharedLists,
    }
  })
