import 'dotenv/config'
import { and, eq, isNotNull, isNull } from 'drizzle-orm'

import { getDb } from './client'
import { outings, productions } from './schema'
import { findOrCreateVenue } from '../venue-functions'

/**
 * Folds the free-text venue names already recorded on outings and productions
 * onto shared venue records. Safe to run more than once: rows that already point
 * at a venue are skipped, and resolution is idempotent.
 */
async function main() {
  const db = getDb()
  let linked = 0

  const outingRows = await db
    .select({ id: outings.id, venue: outings.venue, city: outings.city, country: outings.country })
    .from(outings)
    .where(and(isNull(outings.venueId), isNotNull(outings.venue)))
  for (const row of outingRows) {
    if (!row.venue) continue
    const venue = await findOrCreateVenue(null, row.venue, row.city, row.country)
    await db.update(outings).set({ venueId: venue.id }).where(eq(outings.id, row.id))
    linked += 1
  }

  const productionRows = await db
    .select({
      id: productions.id,
      venue: productions.venue,
      city: productions.city,
      country: productions.country,
    })
    .from(productions)
    .where(and(isNull(productions.venueId), isNotNull(productions.venue)))
  for (const row of productionRows) {
    if (!row.venue) continue
    const venue = await findOrCreateVenue(null, row.venue, row.city, row.country)
    await db.update(productions).set({ venueId: venue.id }).where(eq(productions.id, row.id))
    linked += 1
  }

  console.info(`[venues] linked ${linked} record(s) to shared venues.`)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[venues] backfill failed', error)
    process.exit(1)
  })
