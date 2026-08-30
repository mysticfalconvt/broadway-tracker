import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
import { and, asc, desc, eq, ilike, inArray, ne, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { currentSession, requireSession } from './session'

import { tidyPlace, venueKey } from '../lib/place'
import { type Actor, assertAdmin } from './catalog-functions'
import { getDb } from './db/client'
import { applyViewerCovers } from './image-functions'
import { outingAttendees, outings, productions, shows, venues } from './db/schema'

/**
 * Returns the venue matching this name-and-city, creating it only if nothing
 * matches. The uniqueness of `matchKey` is what stops "NYC" and "New York City"
 * becoming two rows, and the insert races safely: a concurrent creator wins and
 * we read their row back.
 */
/**
 * Asks where a venue is, without the caller waiting on the answer.
 *
 * Suppressed under test: a suite must not depend on a third party being up, and
 * a geocoder's terms are not something to spend on a test run.
 */
function placeVenueSoon(venueId: string) {
  if (process.env.VITEST === 'true' || process.env.NODE_ENV === 'test') return
  void import('./geocoding').then(({ geocodeVenueInBackground }) => {
    geocodeVenueInBackground(venueId)
  })
}

export const findOrCreateVenue = createServerOnlyFn(
  async (
    createdByUserId: string | null,
    name: string,
    city?: string | null,
    country?: string | null,
  ) => {
    const cleanName = tidyPlace(name)
    if (!cleanName) throw new Error('A venue needs a name.')
    const cleanCity = city ? tidyPlace(city) : null
    const key = venueKey(cleanName, cleanCity)
    const db = getDb()

    const [existing] = await db.select().from(venues).where(eq(venues.matchKey, key)).limit(1)
    if (existing) {
      // Somebody has used this theatre again. If it was never placed — because
      // it predates coordinates, or an earlier lookup failed — this is the
      // moment to try, at the pace of a person rather than a loop.
      if (existing.latitude === null) placeVenueSoon(existing.id)
      return existing
    }

    const [created] = await db
      .insert(venues)
      .values({
        name: cleanName,
        city: cleanCity,
        country: country ? tidyPlace(country) : null,
        matchKey: key,
        createdByUserId,
      })
      .onConflictDoNothing({ target: venues.matchKey })
      .returning()
    if (created) {
      placeVenueSoon(created.id)
      return created
    }

    const [raced] = await db.select().from(venues).where(eq(venues.matchKey, key)).limit(1)
    if (!raced) throw new Error('Unable to record that venue.')
    return raced
  },
)

/** Suggestions for the venue field, so an existing venue is offered before a new one is made. */
export const searchVenues = createServerOnlyFn(async (query: string, limit = 8) => {
  const db = getDb()
  const trimmed = tidyPlace(query)
  if (!trimmed) {
    // With nothing typed, offer the venues already used most often.
    return db
      .select({ id: venues.id, name: venues.name, city: venues.city })
      .from(venues)
      .orderBy(asc(venues.name))
      .limit(limit)
  }
  const escaped = trimmed.replace(/[%_\\]/g, '\\$&')
  return db
    .select({ id: venues.id, name: venues.name, city: venues.city })
    .from(venues)
    .where(or(ilike(venues.name, `%${escaped}%`), ilike(venues.city, `%${escaped}%`)))
    .orderBy(asc(venues.name))
    .limit(limit)
})

/** Venues an administrator can review, with how often each is actually used. */
export const venuesForAdmin = createServerOnlyFn(async (actor: Actor) => {
  assertAdmin(actor)
  return getDb()
    .select({
      id: venues.id,
      name: venues.name,
      city: venues.city,
      country: venues.country,
      matchKey: venues.matchKey,
      // The table names are interpolated and the columns written out, because
      // interpolating the column references renders them unqualified -- which
      // silently correlates the subquery against itself and counts zero.
      outingCount: sql<number>`(select count(*)::int from ${outings} where ${outings}."venue_id" = ${venues}."id")`,
      productionCount: sql<number>`(select count(*)::int from ${productions} where ${productions}."venue_id" = ${venues}."id")`,
    })
    .from(venues)
    .orderBy(asc(venues.name))
})

/** Folds one venue into another, moving everything that referenced it. */
export const mergeVenues = createServerOnlyFn(
  async (actor: Actor, sourceId: string, targetId: string) => {
    assertAdmin(actor)
    if (sourceId === targetId) throw new Error('Choose a different venue to merge into.')
    const db = getDb()
    await db.transaction(async (tx) => {
      const [source] = await tx.select().from(venues).where(eq(venues.id, sourceId)).limit(1)
      const [target] = await tx.select().from(venues).where(eq(venues.id, targetId)).limit(1)
      if (!source || !target) throw new Error('Both venues must exist to merge them.')
      await tx.update(outings).set({ venueId: target.id }).where(eq(outings.venueId, source.id))
      await tx
        .update(productions)
        .set({ venueId: target.id })
        .where(eq(productions.venueId, source.id))
      await tx.delete(venues).where(eq(venues.id, source.id))
    })
  },
)

/** Renames a venue, keeping its match key consistent with the new wording. */
export const updateVenue = createServerOnlyFn(
  async (actor: Actor, id: string, name: string, city: string | null, country: string | null) => {
    assertAdmin(actor)
    const cleanName = tidyPlace(name)
    if (!cleanName) throw new Error('A venue needs a name.')
    const cleanCity = city ? tidyPlace(city) : null
    const key = venueKey(cleanName, cleanCity)
    const db = getDb()
    const [clash] = await db
      .select({ id: venues.id })
      .from(venues)
      .where(and(eq(venues.matchKey, key), ne(venues.id, id)))
      .limit(1)
    if (clash)
      throw new Error('Another venue already matches that name and city. Merge them instead.')
    await db
      .update(venues)
      .set({
        name: cleanName,
        city: cleanCity,
        country: country ? tidyPlace(country) : null,
        matchKey: key,
        updatedAt: new Date(),
      })
      .where(eq(venues.id, id))
  },
)

export const suggestVenues = createServerFn({ method: 'GET' })
  .validator(z.object({ query: z.string().trim().max(120) }))
  .handler(async ({ data }) => {
    await requireSession()
    return searchVenues(data.query)
  })

export const getVenuesForAdmin = createServerFn({ method: 'GET' }).handler(async () =>
  venuesForAdmin((await requireSession()).user as Actor),
)

export const mergeVenueInto = createServerFn({ method: 'POST' })
  .validator(z.object({ sourceId: z.string().uuid(), targetId: z.string().uuid() }))
  .handler(async ({ data }) =>
    mergeVenues((await requireSession()).user as Actor, data.sourceId, data.targetId),
  )

export const saveVenue = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      id: z.string().uuid(),
      name: z.string().trim().min(1).max(200),
      city: z.string().trim().max(120).optional(),
      country: z.string().trim().max(120).optional(),
    }),
  )
  .handler(async ({ data }) =>
    updateVenue(
      (await requireSession()).user as Actor,
      data.id,
      data.name,
      data.city || null,
      data.country || null,
    ),
  )

/**
 * A venue and everything the catalog knows happened there.
 *
 * Productions are catalog facts, so anyone may see them. The performances are
 * only the reader's own: another person's night out is theirs to share, and
 * this page must not become a way to see who was where.
 */
export const venueWithHistory = createServerOnlyFn(
  async (viewerId: string | null, venueId: string) => {
    const db = getDb()
    const [venue] = await db.select().from(venues).where(eq(venues.id, venueId)).limit(1)
    if (!venue) throw new Error('That venue is not in the catalog.')
    // Somebody is looking at it, which is as good a moment as any to find out
    // where it is, if nobody has yet.
    if (venue.latitude === null) placeVenueSoon(venue.id)

    const staged = await db
      .select({
        productionId: productions.id,
        productionName: productions.name,
        productionType: productions.productionType,
        openedOn: productions.openedOn,
        closedOn: productions.closedOn,
        showId: shows.id,
        showTitle: shows.title,
        showSlug: shows.slug,
        showType: shows.type,
        coverImageKey: shows.coverImageKey,
      })
      .from(productions)
      .innerJoin(shows, eq(productions.showId, shows.id))
      .where(
        and(eq(productions.venueId, venueId), inArray(shows.catalogStatus, ['published', 'local'])),
      )
      .orderBy(asc(productions.openedOn), asc(shows.title))

    const yourNights = viewerId
      ? await db
          .select({
            id: outings.id,
            datePrecision: outings.datePrecision,
            occurredOn: outings.occurredOn,
            occurredMonth: outings.occurredMonth,
            occurredYear: outings.occurredYear,
            approximateDate: outings.approximateDate,
            showTitle: shows.title,
            showSlug: shows.slug,
          })
          .from(outingAttendees)
          .innerJoin(outings, eq(outingAttendees.outingId, outings.id))
          .innerJoin(shows, eq(outings.showId, shows.id))
          .where(and(eq(outingAttendees.userId, viewerId), eq(outings.venueId, venueId)))
          .orderBy(desc(outings.occurredOn))
      : []

    // The venue row carries whoever first recorded it; a building is public
    // information, the person who typed it in is not.
    return {
      venue: {
        id: venue.id,
        name: venue.name,
        city: venue.city,
        country: venue.country,
        latitude: venue.latitude,
        longitude: venue.longitude,
      },
      staged: await applyViewerCovers(viewerId, staged, (row) => row.showId),
      yourNights,
    }
  },
)

export const getVenue = createServerFn({ method: 'GET' })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await currentSession()
    return venueWithHistory(session?.user.id ?? null, data.id)
  })
