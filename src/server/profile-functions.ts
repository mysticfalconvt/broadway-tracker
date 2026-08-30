import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'

import { auth } from './auth'
import { getDb } from './db/client'
import { acceptedFriendIdsFor } from './friend-functions'
import { applyViewerCovers } from './image-functions'
import { areFriends } from './friend-functions'
import {
  libraryEntries,
  listItems,
  lists,
  outingAttendees,
  outings,
  shows,
  user,
  venues,
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
        showId: outings.showId,
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
    // A show somebody has photographed themselves is that photograph to them,
    // wherever it turns up.
    wantToSee: await applyViewerCovers(userId, wantToSee),
    recent: await applyViewerCovers(userId, recent, (row) => row.showId),
  }
})

/**
 * The front page, composed rather than fed.
 *
 * At this size a page built only from what is new would be empty most days, so
 * it draws on what has already been recorded as well. Sections with nothing in
 * them are not rendered, so a quiet week is a shorter page rather than a page
 * announcing that nothing happened.
 */
export const frontPageFor = createServerOnlyFn(async (userId: string) => {
  const { anniversariesFor, recentReviewsFor, sharedHistoryFor } = await import('./resurfacing')
  const { postsForReader } = await import('./post-functions')
  const [home, anniversaries, alsoSeen, reviews, fromFriends, writing] = await Promise.all([
    homeForUser(userId),
    anniversariesFor(userId),
    sharedHistoryFor(userId),
    recentReviewsFor(userId),
    friendsActivityFor(userId, 4),
    postsForReader(userId, 3),
  ])
  return { ...home, anniversaries, alsoSeen, reviews, fromFriends, writing }
})

export const getFrontPage = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await auth.api.getSession({ headers: getRequestHeaders() })
  // Null rather than an error: a signed-out visitor gets the visitor page.
  if (!session) return null
  return { name: session.user.name, ...(await frontPageFor(session.user.id)) }
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
    const [seen, outingsCount, favorites, seenShows, sharedOutings, sharedLists] =
      await Promise.all([
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
              // Public is more open than friends, not less. Matching 'friends'
              // exactly hid everything from the very people it was shared with,
              // because new entries default to the profile's own setting and
              // that defaults to public.
              inArray(libraryEntries.visibility, ['friends', 'public']),
            ),
          )
          .orderBy(desc(libraryEntries.updatedAt))
          .limit(6),
        // The stat said "24 shows seen" above a page listing none of them, unless
        // the friend happened to have starred something.
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
              eq(libraryEntries.status, 'seen'),
              inArray(libraryEntries.visibility, ['friends', 'public']),
            ),
          )
          .orderBy(desc(libraryEntries.updatedAt))
          .limit(24),
        // The nights themselves, not just how many. A count with nothing under it
        // is the least useful thing a profile can say.
        db
          .select({
            id: outings.id,
            showId: outings.showId,
            showTitle: shows.title,
            showSlug: shows.slug,
            showType: shows.type,
            coverImageKey: shows.coverImageKey,
            datePrecision: outings.datePrecision,
            occurredOn: outings.occurredOn,
            occurredMonth: outings.occurredMonth,
            occurredYear: outings.occurredYear,
            approximateDate: outings.approximateDate,
            venue: sql<string | null>`coalesce(${venues.name}, ${outings.venue})`,
            city: sql<string | null>`coalesce(${venues.city}, ${outings.city})`,
            sharedNotes: outings.sharedNotes,
            // Whether the reader is already on this night, so the page can offer
            // to add them or say they are already there.
            alreadyThere: sql<boolean>`exists (
            select 1 from ${outingAttendees}
            where ${outingAttendees}."outing_id" = ${outings}."id"
              and ${outingAttendees}."user_id" = ${viewerId}
          )`,
          })
          .from(outings)
          .innerJoin(shows, eq(outings.showId, shows.id))
          .leftJoin(venues, eq(outings.venueId, venues.id))
          .where(
            and(
              eq(outings.createdByUserId, profile.id),
              inArray(outings.visibility, ['friends', 'public']),
            ),
          )
          .orderBy(desc(outings.occurredOn), desc(outings.createdAt))
          .limit(24),
        db
          .select({
            id: lists.id,
            title: lists.title,
            description: lists.description,
            itemCount: sql<number>`count(${listItems.showId})::int`,
          })
          .from(lists)
          .leftJoin(listItems, eq(listItems.listId, lists.id))
          .where(
            and(eq(lists.userId, profile.id), inArray(lists.visibility, ['friends', 'public'])),
          )
          .groupBy(lists.id)
          .orderBy(asc(lists.title)),
      ])
    const { placesVisitedBy } = await import('./geocoding')
    return {
      user: profile,
      stats: { seen: seen[0]?.count ?? 0, outings: outingsCount[0]?.count ?? 0 },
      // Only the nights they shared. A map is more revealing than the same
      // list, so it is drawn from what they chose to show, not from everything.
      places: await placesVisitedBy(profile.id, { includePrivate: false }),
      // The reader's own photographs, even on somebody else's page: a cover is
      // a personal lens on the catalog, not a fact about the friend.
      favorites: await applyViewerCovers(viewerId, favorites),
      seenShows: await applyViewerCovers(viewerId, seenShows),
      outings: await applyViewerCovers(viewerId, sharedOutings, (row) => row.showId),
      lists: sharedLists,
    }
  },
)

/**
 * What the people you share with have been to lately, newest first.
 *
 * Deliberately quiet: nights out, and nothing else. Not every rating changed
 * and every list reordered — a feed that reports everything is one nobody
 * reads, and this is a theatre journal, not a timeline.
 *
 * Each night is subject to the same rules as its owner's profile: the
 * friendship must be approved, the night must be shared beyond private, and a
 * friend who keeps their profile to themselves appears in nobody's feed.
 */
export const friendsActivityFor = createServerOnlyFn(async (viewerId: string, limit = 30) => {
  const friendIds = [...(await acceptedFriendIdsFor(viewerId))]
  if (friendIds.length === 0) return []

  const rows = await getDb()
    .select({
      id: outings.id,
      showId: outings.showId,
      showTitle: shows.title,
      showSlug: shows.slug,
      showType: shows.type,
      coverImageKey: shows.coverImageKey,
      datePrecision: outings.datePrecision,
      occurredOn: outings.occurredOn,
      occurredMonth: outings.occurredMonth,
      occurredYear: outings.occurredYear,
      approximateDate: outings.approximateDate,
      venue: sql<string | null>`coalesce(${venues.name}, ${outings.venue})`,
      city: sql<string | null>`coalesce(${venues.city}, ${outings.city})`,
      sharedNotes: outings.sharedNotes,
      createdAt: outings.createdAt,
      friendName: user.name,
      friendHandle: user.handle,
      alreadyThere: sql<boolean>`exists (
        select 1 from ${outingAttendees}
        where ${outingAttendees}."outing_id" = ${outings}."id"
          and ${outingAttendees}."user_id" = ${viewerId}
      )`,
    })
    .from(outings)
    .innerJoin(shows, eq(outings.showId, shows.id))
    .innerJoin(user, eq(outings.createdByUserId, user.id))
    .leftJoin(venues, eq(outings.venueId, venues.id))
    .where(
      and(
        inArray(outings.createdByUserId, friendIds),
        inArray(outings.visibility, ['friends', 'public']),
        // Somebody who keeps their profile to themselves is not in a feed.
        inArray(user.profileVisibility, ['friends', 'public']),
      ),
    )
    .orderBy(desc(outings.createdAt))
    .limit(limit)

  return applyViewerCovers(viewerId, rows, (row) => row.showId)
})

/** The reader's own map. Never anybody else's — see `placesVisitedBy`. */
export const getMyPlaces = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await auth.api.getSession({ headers: getRequestHeaders() })
  if (!session) throw new Error('Unauthorized')
  const { placesVisitedBy } = await import('./geocoding')
  return placesVisitedBy(session.user.id)
})

export const getFriendsActivity = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await auth.api.getSession({ headers: getRequestHeaders() })
  if (!session) throw new Error('Unauthorized')
  return friendsActivityFor(session.user.id)
})

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
