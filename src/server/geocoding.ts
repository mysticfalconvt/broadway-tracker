import { createServerOnlyFn } from '@tanstack/react-start'
import { and, eq, isNotNull, isNull, lt, sql } from 'drizzle-orm'

import { getDb } from './db/client'
import { venues } from './db/schema'

/**
 * Turning a theatre's name and city into a point on the earth.
 *
 * Nominatim, the OpenStreetMap geocoder, on the terms it publishes:
 *
 *   - **Results must be cached.** A coordinate is written onto the venue and
 *     never asked for again. A building does not move.
 *   - **At most one request a second**, and no bulk geocoding. Nothing here
 *     runs in a loop over the table: a venue is looked up when somebody
 *     actually uses it, which is a human pace by construction.
 *   - **A User-Agent that names the application.** Stock library agents are
 *     explicitly refused, which is one reason this happens on the server and
 *     never in a browser.
 *   - **Attribution**, shown wherever the result is displayed.
 *
 * @see https://operations.osmfoundation.org/policies/nominatim/
 */
const NOMINATIM = 'https://nominatim.openstreetmap.org/search'

/** Named as the policy requires, with somewhere to complain to. */
function userAgent() {
  const contact = process.env.BETTER_AUTH_URL ?? 'https://broadway.rboskind.com'
  return `BroadwayTracker/1.0 (+${contact})`
}

/** Nobody is found more than this often before we stop asking about them. */
const MAX_ATTEMPTS = 3

/**
 * The one-request-a-second promise, kept.
 *
 * A module-level gate rather than a queue: two members saving an outing in the
 * same second is the busiest this will ever be, and the second simply waits.
 */
let lastRequestAt = 0
async function waitForTurn() {
  const since = Date.now() - lastRequestAt
  if (since < 1_100) await new Promise((resolve) => setTimeout(resolve, 1_100 - since))
  lastRequestAt = Date.now()
}

export type Coordinates = { latitude: number; longitude: number }

/** The network call, separated so the rest can be tested without one. */
export type Lookup = (query: string) => Promise<Coordinates | null>

export const askNominatim: Lookup = async (query) => {
  await waitForTurn()
  const url = `${NOMINATIM}?${new URLSearchParams({ q: query, format: 'jsonv2', limit: '1' })}`
  const response = await fetch(url, {
    headers: { 'User-Agent': userAgent(), Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error(`Nominatim answered ${response.status}`)
  const results = (await response.json()) as { lat?: string; lon?: string }[]
  const first = results[0]
  if (!first?.lat || !first?.lon) return null
  const latitude = Number(first.lat)
  const longitude = Number(first.lon)
  if (!isFinite(latitude) || !isFinite(longitude)) return null
  return { latitude, longitude }
}

/** What we ask about, most specific first: a theatre is easier to find with its city. */
export function queriesFor(venue: { name: string; city: string | null; country: string | null }) {
  const parts = [venue.name, venue.city, venue.country].filter(Boolean)
  const queries = [parts.join(', ')]
  // A second, looser try: some halls are known to OSM only by their town.
  if (venue.city && parts.length > 2) queries.push([venue.name, venue.city].join(', '))
  return queries
}

/**
 * Fills in one venue's coordinates, if they are wanted and not already known.
 *
 * Deliberately swallows its own failures. This is called after a member has
 * saved something, and a geocoder being slow, rate-limited, or down must never
 * turn their saved evening into an error. A venue simply stays unplaced, and
 * the next person to use it tries again — up to a point, so a hall that is
 * genuinely not on the map is asked about three times and then left alone.
 */
export const geocodeVenue = createServerOnlyFn(
  async (venueId: string, lookup: Lookup = askNominatim) => {
    const db = getDb()
    const [venue] = await db
      .select({
        id: venues.id,
        name: venues.name,
        city: venues.city,
        country: venues.country,
        latitude: venues.latitude,
        attempts: venues.geocodeAttempts,
      })
      .from(venues)
      .where(eq(venues.id, venueId))
      .limit(1)
    if (!venue) return null
    if (venue.latitude !== null) return null
    if (venue.attempts >= MAX_ATTEMPTS) return null

    let found: Coordinates | null = null
    try {
      for (const query of queriesFor(venue)) {
        found = await lookup(query)
        if (found) break
      }
    } catch (error) {
      console.error('[geocoding] lookup failed', { venue: venue.name, error })
      // A failed request is not evidence the place cannot be found, so it does
      // not count against the venue's attempts.
      return null
    }

    if (!found) {
      await db
        .update(venues)
        .set({ geocodeAttempts: venue.attempts + 1, updatedAt: new Date() })
        .where(eq(venues.id, venue.id))
      return null
    }

    await db
      .update(venues)
      .set({
        latitude: found.latitude,
        longitude: found.longitude,
        geocodedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(venues.id, venue.id))
    return found
  },
)

/**
 * Asks about a venue without making the caller wait or care.
 *
 * Everything that records a venue calls this and moves on. Saving an evening
 * must not depend on a third party's uptime.
 */
export const geocodeVenueInBackground = createServerOnlyFn((venueId: string) => {
  void geocodeVenue(venueId).catch((error) => {
    console.error('[geocoding] background lookup failed', error)
  })
})

/**
 * Everywhere one person has actually been, with how often.
 *
 * Their own attendance only. A map of where somebody has been, with dates, says
 * far more about them than the same facts listed as text — it shows a home
 * city, a routine, a pattern — so this is never assembled for anybody but the
 * reader themselves.
 */
export const placesVisitedBy = createServerOnlyFn(async (viewerId: string) => {
  const { outingAttendees, outings } = await import('./db/schema')
  return getDb()
    .select({
      id: venues.id,
      name: venues.name,
      city: venues.city,
      country: venues.country,
      latitude: venues.latitude,
      longitude: venues.longitude,
      nights: sql<number>`count(distinct ${outings.id})::int`,
    })
    .from(outingAttendees)
    .innerJoin(outings, eq(outingAttendees.outingId, outings.id))
    .innerJoin(venues, eq(outings.venueId, venues.id))
    .where(eq(outingAttendees.userId, viewerId))
    .groupBy(venues.id)
    .orderBy(sql`count(distinct ${outings.id}) desc`)
})

/** Venues still worth asking about, for the places page and any manual sweep. */
export const unplacedVenues = createServerOnlyFn(async () =>
  getDb()
    .select({ id: venues.id, name: venues.name, city: venues.city })
    .from(venues)
    .where(and(isNull(venues.latitude), lt(venues.geocodeAttempts, MAX_ATTEMPTS)))
    .orderBy(sql`${venues.name}`),
)

/** Everything that has been placed, for drawing a map. */
export const placedVenues = createServerOnlyFn(async () =>
  getDb()
    .select({
      id: venues.id,
      name: venues.name,
      city: venues.city,
      country: venues.country,
      latitude: venues.latitude,
      longitude: venues.longitude,
    })
    .from(venues)
    .where(and(isNotNull(venues.latitude), isNotNull(venues.longitude))),
)
