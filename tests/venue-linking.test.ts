import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { outings, venues } from '../src/server/db/schema'
import { createOutingForUser } from '../src/server/outing-functions'
import { db, makeShow, makeUser, resetDatabase } from './helpers'

beforeEach(resetDatabase)

const log = (showId: string, overrides = {}) => ({
  showId,
  visibility: 'private' as const,
  datePrecision: 'year' as const,
  occurredYear: 2026,
  attendeeIds: [] as string[],
  favorite: false,
  reviewVisibility: 'private' as const,
  ...overrides,
})

describe('logging resolves the venue', () => {
  it('links the outing to a shared venue record', async () => {
    const user = await makeUser()
    const show = await makeShow()
    const { id } = await createOutingForUser(
      user.id,
      log(show.id, { venue: 'Walter Kerr Theatre', city: 'New York' }),
    )
    const [outing] = await db
      .select({ venueId: outings.venueId })
      .from(outings)
      .where(eq(outings.id, id))
    expect(outing?.venueId).not.toBeNull()
    expect(await db.select().from(venues)).toHaveLength(1)
  })

  it('two people spelling the same theatre differently share one venue', async () => {
    const a = await makeUser()
    const b = await makeUser()
    const show = await makeShow()
    const first = await createOutingForUser(
      a.id,
      log(show.id, { venue: 'Walter Kerr Theatre', city: 'New York' }),
    )
    const second = await createOutingForUser(
      b.id,
      log(show.id, { venue: 'the walter kerr', city: 'NYC' }),
    )
    const rows = await db.select({ id: outings.id, venueId: outings.venueId }).from(outings)
    const ids = new Set(rows.map((r) => r.venueId))
    expect(ids.size).toBe(1)
    expect(await db.select().from(venues)).toHaveLength(1)
    expect(first.id).not.toBe(second.id)
  })

  it('records no venue when none was given', async () => {
    const user = await makeUser()
    const show = await makeShow()
    const { id } = await createOutingForUser(user.id, log(show.id))
    const [outing] = await db
      .select({ venueId: outings.venueId })
      .from(outings)
      .where(eq(outings.id, id))
    expect(outing?.venueId).toBeNull()
    expect(await db.select().from(venues)).toHaveLength(0)
  })

  it('keeps the same theatre in different cities separate', async () => {
    const user = await makeUser()
    const show = await makeShow()
    await createOutingForUser(user.id, log(show.id, { venue: 'Orpheum Theatre', city: 'Boston' }))
    await createOutingForUser(user.id, log(show.id, { venue: 'Orpheum Theatre', city: 'Memphis' }))
    expect(await db.select().from(venues)).toHaveLength(2)
  })
})
