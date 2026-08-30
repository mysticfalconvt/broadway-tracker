import { createServerOnlyFn } from '@tanstack/react-start'
import { and, desc, eq, inArray, ne, or, sql } from 'drizzle-orm'

import { getDb } from './db/client'
import { libraryEntries, outingAttendees, outings, shows, user, venues } from './db/schema'
import { acceptedFriendIdsFor } from './friend-functions'
import { applyViewerCovers } from './image-functions'

/**
 * What the front page can say on a week when nobody went anywhere.
 *
 * At fifteen members seeing six shows a year the app produces under two nights
 * a week, so a page built only from what is new would be empty most days.
 * Everything here is drawn from what has already been recorded.
 */

/**
 * Whose sharing reaches this reader.
 *
 * Public means public: anything somebody marked public is shown to any member,
 * whether or not the two of them are friends. Friends-only reaches approved
 * friends. That is looser than restricting everything to a reader's own circle,
 * and it is the point — a small archive is worth more when what people chose to
 * share openly can actually be found. Each query below spells the rule out
 * against its own table.
 */

/**
 * The reader's own nights on this date in earlier years.
 *
 * Only exact dates: a night recorded as "some time in 2004" has no anniversary,
 * and inventing one would be putting words in somebody's memory.
 */
export const anniversariesFor = createServerOnlyFn(async (viewerId: string, today = new Date()) => {
  const month = today.getMonth() + 1
  const day = today.getDate()
  const rows = await getDb()
    .select({
      id: outings.id,
      showId: outings.showId,
      showTitle: shows.title,
      showSlug: shows.slug,
      showType: shows.type,
      coverImageKey: shows.coverImageKey,
      occurredOn: outings.occurredOn,
      venue: sql<string | null>`coalesce(${venues.name}, ${outings.venue})`,
      city: sql<string | null>`coalesce(${venues.city}, ${outings.city})`,
      yearsAgo: sql<number>`(
          extract(year from current_date)::int - extract(year from ${outings.occurredOn})::int
        )`,
    })
    .from(outingAttendees)
    .innerJoin(outings, eq(outingAttendees.outingId, outings.id))
    .innerJoin(shows, eq(outings.showId, shows.id))
    .leftJoin(venues, eq(outings.venueId, venues.id))
    .where(
      and(
        eq(outingAttendees.userId, viewerId),
        eq(outings.datePrecision, 'exact'),
        sql`extract(month from ${outings.occurredOn}) = ${month}`,
        sql`extract(day from ${outings.occurredOn}) = ${day}`,
      ),
    )
    .orderBy(desc(outings.occurredOn))
  // Tonight is not an anniversary of itself.
  return applyViewerCovers(
    viewerId,
    rows.filter((row) => row.yearsAgo > 0),
    (row) => row.showId,
  )
})

/**
 * Shows the reader has seen that somebody else has too.
 *
 * The app knows this and has never said it, and it is the strongest prompt to
 * talk to somebody that exists here. Governed by the other person's own
 * sharing: public reaches anybody, friends-only reaches their friends.
 */
export const sharedHistoryFor = createServerOnlyFn(async (viewerId: string, limit = 6) => {
  const friendIds = [...(await acceptedFriendIdsFor(viewerId))]
  const mine = getDb()
    .select({ showId: libraryEntries.showId })
    .from(libraryEntries)
    .where(and(eq(libraryEntries.userId, viewerId), eq(libraryEntries.status, 'seen')))

  const theirs = or(
    eq(libraryEntries.visibility, 'public'),
    friendIds.length
      ? and(eq(libraryEntries.visibility, 'friends'), inArray(libraryEntries.userId, friendIds))
      : undefined,
  )

  const rows = await getDb()
    .select({
      showId: shows.id,
      showTitle: shows.title,
      showSlug: shows.slug,
      showType: shows.type,
      coverImageKey: shows.coverImageKey,
      personId: user.id,
      personName: user.name,
      personHandle: user.handle,
    })
    .from(libraryEntries)
    .innerJoin(shows, eq(libraryEntries.showId, shows.id))
    .innerJoin(user, eq(libraryEntries.userId, user.id))
    .where(
      and(
        ne(libraryEntries.userId, viewerId),
        eq(libraryEntries.status, 'seen'),
        inArray(libraryEntries.showId, mine),
        theirs,
      ),
    )
    .orderBy(desc(libraryEntries.updatedAt))
    .limit(limit)
  return applyViewerCovers(viewerId, rows, (row) => row.showId)
})

/**
 * Reviews somebody wrote, which until now lived on one outing page and nowhere
 * else. Written and then buried is the cheapest content in the app to recover.
 */
export const recentReviewsFor = createServerOnlyFn(async (viewerId: string, limit = 6) => {
  const friendIds = [...(await acceptedFriendIdsFor(viewerId))]
  const readable = or(
    eq(outingAttendees.reviewVisibility, 'public'),
    friendIds.length
      ? and(
          eq(outingAttendees.reviewVisibility, 'friends'),
          inArray(outingAttendees.userId, friendIds),
        )
      : undefined,
  )

  const rows = await getDb()
    .select({
      outingId: outings.id,
      showId: outings.showId,
      showTitle: shows.title,
      showSlug: shows.slug,
      showType: shows.type,
      coverImageKey: shows.coverImageKey,
      review: outingAttendees.review,
      rating: outingAttendees.rating,
      personName: user.name,
      personHandle: user.handle,
      occurredOn: outings.occurredOn,
      datePrecision: outings.datePrecision,
      occurredMonth: outings.occurredMonth,
      occurredYear: outings.occurredYear,
      approximateDate: outings.approximateDate,
    })
    .from(outingAttendees)
    .innerJoin(outings, eq(outingAttendees.outingId, outings.id))
    .innerJoin(shows, eq(outings.showId, shows.id))
    .innerJoin(user, eq(outingAttendees.userId, user.id))
    .where(
      and(
        ne(outingAttendees.userId, viewerId),
        sql`${outingAttendees.review} is not null`,
        sql`length(trim(${outingAttendees.review})) > 0`,
        // The night itself must be shareable, whatever the review says.
        ne(outings.visibility, 'private'),
        readable,
      ),
    )
    .orderBy(desc(outings.createdAt))
    .limit(limit)
  return applyViewerCovers(viewerId, rows, (row) => row.showId)
})
