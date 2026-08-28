import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'

import { auth } from './auth'
import { getDb } from './db/client'
import { areFriends } from './friend-functions'
import { libraryEntries, listItems, lists, outings, shows, user } from './db/schema'

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

// Holds the authorization rules and takes the viewer explicitly so it can be
// exercised without a request. `createServerOnlyFn` keeps the database client
// out of the browser bundle.
export const friendProfileForViewer = createServerOnlyFn(
  async (viewerId: string, handle: string) => {
    const db = getDb()
    const [profile] = await db
      .select({ id: user.id, name: user.name, handle: user.handle })
      .from(user)
      .where(and(eq(user.handle, handle.toLowerCase()), eq(user.profileVisibility, 'friends')))
      .limit(1)
    if (!profile) throw new Error('This profile is unavailable.')
    if (!(await areFriends(viewerId, profile.id)))
      throw new Error('This profile is only available to friends.')
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
  },
)

export const getFriendProfile = createServerFn({ method: 'GET' })
  .validator(z.object({ handle: z.string().trim().min(1).max(30) }))
  .handler(async ({ data }) => {
    const session = await auth.api.getSession({ headers: getRequestHeaders() })
    if (!session) throw new Error('Unauthorized')
    return friendProfileForViewer(session.user.id, data.handle)
  })
