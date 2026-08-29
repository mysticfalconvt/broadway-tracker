import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'

import { auth } from './auth'
import { getDb } from './db/client'
import { areFriends } from './friend-functions'
import {
  libraryEntries,
  listItems,
  lists,
  outingAttendees,
  outings,
  shows,
  user,
} from './db/schema'

/** Everything the signed-in home dashboard shows, in one round trip. */
export const homeForUser = createServerOnlyFn(async (userId: string) => {
  const db = getDb()
  const [seen, favoriteCount, performanceCount, wantToSee, recent] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(libraryEntries)
      .where(and(eq(libraryEntries.userId, userId), eq(libraryEntries.status, 'seen'))),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(libraryEntries)
      .where(and(eq(libraryEntries.userId, userId), eq(libraryEntries.favorite, true))),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(outingAttendees)
      .where(eq(outingAttendees.userId, userId)),
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
      .where(and(eq(libraryEntries.userId, userId), eq(libraryEntries.status, 'want_to_see')))
      .orderBy(desc(libraryEntries.updatedAt))
      .limit(3),
    db
      .select({
        id: outings.id,
        showTitle: shows.title,
        showType: shows.type,
        coverImageKey: shows.coverImageKey,
        venue: outings.venue,
        city: outings.city,
        datePrecision: outings.datePrecision,
        occurredOn: outings.occurredOn,
        occurredMonth: outings.occurredMonth,
        occurredYear: outings.occurredYear,
        approximateDate: outings.approximateDate,
        rating: outingAttendees.rating,
        review: outingAttendees.review,
      })
      .from(outingAttendees)
      .innerJoin(outings, eq(outingAttendees.outingId, outings.id))
      .innerJoin(shows, eq(outings.showId, shows.id))
      .where(eq(outingAttendees.userId, userId))
      .orderBy(desc(outings.createdAt))
      .limit(2),
  ])
  return {
    stats: {
      performances: performanceCount[0]?.count ?? 0,
      shows: seen[0]?.count ?? 0,
      favorites: favoriteCount[0]?.count ?? 0,
    },
    wantToSee,
    recent,
  }
})

export const getHome = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await auth.api.getSession({ headers: getRequestHeaders() })
  if (!session) return null
  return { name: session.user.name, ...(await homeForUser(session.user.id)) }
})

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
      .select({
        id: user.id,
        name: user.name,
        handle: user.handle,
        visibility: user.profileVisibility,
      })
      .from(user)
      .where(eq(user.handle, handle.toLowerCase()))
      .limit(1)
    if (!profile) throw new Error('This profile is unavailable.')
    // Being approved is not the same as being shown: someone may keep their
    // profile to themselves. A public profile is readable here too -- making it
    // more open must not make it invisible to your own friends.
    if (!(await areFriends(viewerId, profile.id)))
      throw new Error('This profile is only available to friends.')
    if (profile.visibility === 'private')
      throw new Error('This friend keeps their profile to themselves.')
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
        .select({
          id: shows.id,
          title: shows.title,
          slug: shows.slug,
          type: shows.type,
          coverImageKey: shows.coverImageKey,
        })
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

/**
 * A public profile is deliberately anonymous: it carries no name and no handle,
 * only the theatre itself. It is addressed by the opaque account id rather than
 * the handle, because handles are derived from an email address.
 */
export const publicProfileById = createServerOnlyFn(async (userId: string) => {
  const db = getDb()
  const [profile] = await db
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.id, userId), eq(user.profileVisibility, 'public')))
    .limit(1)
  if (!profile) throw new Error('This profile is unavailable.')

  const [seen, favorites, publicLists] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(libraryEntries)
      .where(and(eq(libraryEntries.userId, profile.id), eq(libraryEntries.status, 'seen'))),
    db
      .select({
        id: shows.id,
        title: shows.title,
        slug: shows.slug,
        type: shows.type,
        coverImageKey: shows.coverImageKey,
        rating: libraryEntries.rating,
        review: libraryEntries.review,
      })
      .from(libraryEntries)
      .innerJoin(shows, eq(libraryEntries.showId, shows.id))
      .where(
        and(
          eq(libraryEntries.userId, profile.id),
          eq(libraryEntries.favorite, true),
          eq(libraryEntries.visibility, 'public'),
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
      .where(and(eq(lists.userId, profile.id), eq(lists.visibility, 'public')))
      .groupBy(lists.id)
      .orderBy(asc(lists.title)),
  ])
  return {
    stats: { seen: seen[0]?.count ?? 0 },
    favorites,
    lists: publicLists,
  }
})

export const getPublicProfile = createServerFn({ method: 'GET' })
  .validator(z.object({ id: z.string().min(1).max(80) }))
  .handler(async ({ data }) => publicProfileById(data.id))

export const getFriendProfile = createServerFn({ method: 'GET' })
  .validator(z.object({ handle: z.string().trim().min(1).max(30) }))
  .handler(async ({ data }) => {
    const session = await auth.api.getSession({ headers: getRequestHeaders() })
    if (!session) throw new Error('Unauthorized')
    return friendProfileForViewer(session.user.id, data.handle)
  })
