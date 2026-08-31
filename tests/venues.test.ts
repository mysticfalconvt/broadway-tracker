import { beforeEach, describe, expect, it } from 'vitest'

import { outings, venues } from '../src/server/db/schema'
import { createOutingForUser } from '../src/server/outing-functions'
import {
  findOrCreateVenue,
  mergeVenues,
  searchVenues,
  updateVenue,
  venuesForAdmin,
} from '../src/server/venue-functions'
import { db, makeAdmin, makeShow, makeUser, resetDatabase } from './helpers'
import { eq } from 'drizzle-orm'

beforeEach(resetDatabase)

const actor = (u: { id: string; role: string }) => ({ id: u.id, role: u.role }) as never

describe('finding or creating a venue', () => {
  it('collapses the four spellings of the same New York theatre into one row', async () => {
    const user = await makeUser()
    const spellings: [string, string][] = [
      ['Walter Kerr Theatre', 'NYC'],
      ['walter kerr theater', 'New York'],
      ['The Walter Kerr', 'New York City'],
      ['Walter  Kerr   Theatre', 'new york, ny'],
    ]
    const ids = new Set<string>()
    for (const [name, city] of spellings) {
      ids.add((await findOrCreateVenue(user.id, name, city)).id)
    }
    expect(ids.size).toBe(1)
    expect(await db.select().from(venues)).toHaveLength(1)
  })

  it('keeps the wording the first person used', async () => {
    const user = await makeUser()
    await findOrCreateVenue(user.id, 'Walter Kerr Theatre', 'New York')
    const again = await findOrCreateVenue(user.id, 'the walter kerr', 'NYC')
    expect(again.name).toBe('Walter Kerr Theatre')
    expect(again.city).toBe('New York')
  })

  it('keeps same-named theatres in different cities apart', async () => {
    const user = await makeUser()
    const boston = await findOrCreateVenue(user.id, 'Orpheum Theatre', 'Boston')
    const memphis = await findOrCreateVenue(user.id, 'Orpheum Theatre', 'Memphis')
    expect(boston.id).not.toBe(memphis.id)
    expect(await db.select().from(venues)).toHaveLength(2)
  })

  it('trims stray whitespace before storing', async () => {
    const user = await makeUser()
    const venue = await findOrCreateVenue(user.id, '  Music   Box Theatre ', ' New York ')
    expect(venue.name).toBe('Music Box Theatre')
    expect(venue.city).toBe('New York')
  })

  it('refuses an empty name', async () => {
    const user = await makeUser()
    await expect(findOrCreateVenue(user.id, '   ', 'New York')).rejects.toThrow('needs a name')
  })
})

describe('venue suggestions', () => {
  it('matches on name or city, case-insensitively', async () => {
    const user = await makeUser()
    await findOrCreateVenue(user.id, 'Walter Kerr Theatre', 'New York')
    await findOrCreateVenue(user.id, 'Kit Kat Club', 'New York')
    await findOrCreateVenue(user.id, 'Colonial Theatre', 'Boston')
    expect((await searchVenues('kerr')).map((v) => v.name)).toEqual(['Walter Kerr Theatre'])
    expect((await searchVenues('boston')).map((v) => v.name)).toEqual(['Colonial Theatre'])
    expect(await searchVenues('new york')).toHaveLength(2)
  })

  it('treats wildcard characters literally', async () => {
    const user = await makeUser()
    await findOrCreateVenue(user.id, 'Walter Kerr Theatre', 'New York')
    expect(await searchVenues('%')).toHaveLength(0)
  })

  it('offers everything when nothing has been typed', async () => {
    const user = await makeUser()
    await findOrCreateVenue(user.id, 'Walter Kerr Theatre', 'New York')
    expect((await searchVenues('')).length).toBe(1)
  })
})

describe('administration', () => {
  it('refuses the venue list and merges to a member', async () => {
    const member = await makeUser()
    await expect(venuesForAdmin(actor(member))).rejects.toThrow('Forbidden')
    await expect(
      mergeVenues(
        actor(member),
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000002',
      ),
    ).rejects.toThrow('Forbidden')
  })

  it('reports how often each venue is actually used', async () => {
    const admin = await makeAdmin()
    const show = await makeShow()
    const venue = await findOrCreateVenue(admin.id, 'Walter Kerr Theatre', 'New York')
    const { id } = await createOutingForUser(admin.id, {
      showId: show.id,
      visibility: 'private',
      datePrecision: 'year',
      occurredYear: 2026,
      attendeeIds: [],
      favorite: false,
      reviewVisibility: 'private',
    })
    await db.update(outings).set({ venueId: venue.id }).where(eq(outings.id, id))
    const [row] = await venuesForAdmin(actor(admin))
    expect(row?.outingCount).toBe(1)
  })

  it('merges one venue into another, moving what referenced it', async () => {
    const admin = await makeAdmin()
    const show = await makeShow()
    // Two rows that normalisation could not catch, e.g. a genuine misspelling.
    const wrong = await findOrCreateVenue(admin.id, 'Walter Ker Theatre', 'New York')
    const right = await findOrCreateVenue(admin.id, 'Walter Kerr Theatre', 'New York')
    const { id } = await createOutingForUser(admin.id, {
      showId: show.id,
      visibility: 'private',
      datePrecision: 'year',
      occurredYear: 2026,
      attendeeIds: [],
      favorite: false,
      reviewVisibility: 'private',
    })
    await db.update(outings).set({ venueId: wrong.id }).where(eq(outings.id, id))

    await mergeVenues(actor(admin), wrong.id, right.id)

    expect(await db.select().from(venues)).toHaveLength(1)
    const [outing] = await db
      .select({ venueId: outings.venueId })
      .from(outings)
      .where(eq(outings.id, id))
    expect(outing?.venueId).toBe(right.id)
  })

  it('refuses to merge a venue into itself', async () => {
    const admin = await makeAdmin()
    const venue = await findOrCreateVenue(admin.id, 'Walter Kerr Theatre', 'New York')
    await expect(mergeVenues(actor(admin), venue.id, venue.id)).rejects.toThrow(
      'Choose a different venue',
    )
  })

  it('refuses a rename that would collide with an existing venue', async () => {
    const admin = await makeAdmin()
    const a = await findOrCreateVenue(admin.id, 'Walter Kerr Theatre', 'New York')
    const b = await findOrCreateVenue(admin.id, 'Music Box Theatre', 'New York')
    await expect(updateVenue(actor(admin), b.id, 'the walter kerr', 'NYC', null)).rejects.toThrow(
      'Merge them instead',
    )
    expect(a.id).not.toBe(b.id)
  })

  it('keeps the match key consistent after a rename', async () => {
    const admin = await makeAdmin()
    const venue = await findOrCreateVenue(admin.id, 'Walter Ker Theatre', 'New York')
    await updateVenue(actor(admin), venue.id, 'Walter Kerr Theatre', 'New York', 'USA')
    // The corrected name must now match how other people would type it.
    const again = await findOrCreateVenue(admin.id, 'the walter kerr', 'NYC')
    expect(again.id).toBe(venue.id)
    expect(again.country).toBe('USA')
  })
})

describe('productions saved by an administrator', () => {
  it('link to the shared venue record, like imported ones do', async () => {
    const { saveProductionForAdmin } = await import('../src/server/catalog-functions')
    const { productions } = await import('../src/server/db/schema')
    const admin = await makeAdmin()
    const show = await makeShow()
    await saveProductionForAdmin(actor(admin), {
      showId: show.id,
      name: 'Broadway',
      productionType: 'broadway',
      venue: 'Nederlander Theatre',
      city: 'New York',
    })
    const [row] = await db.select().from(productions)
    expect(row?.venueId).not.toBeNull()
    expect(await db.select().from(venues)).toHaveLength(1)
  })

  it('reuse an existing venue rather than making a second one', async () => {
    const { saveProductionForAdmin } = await import('../src/server/catalog-functions')
    const admin = await makeAdmin()
    const show = await makeShow()
    const existing = await findOrCreateVenue(admin.id, 'Nederlander Theatre', 'New York')
    await saveProductionForAdmin(actor(admin), {
      showId: show.id,
      name: 'Broadway',
      productionType: 'broadway',
      venue: 'the nederlander',
      city: 'NYC',
    })
    const { productions } = await import('../src/server/db/schema')
    const [row] = await db.select().from(productions)
    expect(row?.venueId).toBe(existing.id)
    expect(await db.select().from(venues)).toHaveLength(1)
  })

  it('refuses a member', async () => {
    const { saveProductionForAdmin } = await import('../src/server/catalog-functions')
    const member = await makeUser()
    const show = await makeShow()
    await expect(
      saveProductionForAdmin(actor(member), {
        showId: show.id,
        name: 'Broadway',
        productionType: 'broadway',
      }),
    ).rejects.toThrow('Forbidden')
  })
})

describe('a theatre that was renamed', () => {
  it('lands on the same building whichever name is used', async () => {
    // The Brooks Atkinson became the Lena Horne in 2022. A night in 2007 and a
    // night in 2026 happened in the same room, and used to make two records
    // with nothing connecting them.
    const member = await makeUser()
    const old = await findOrCreateVenue(member.id, 'Brooks Atkinson Theatre', 'New York')
    const now = await findOrCreateVenue(member.id, 'Lena Horne Theatre', 'New York')
    expect(now.id).not.toBe(old.id)

    const admin = await makeAdmin()
    await mergeVenues(admin, old.id, now.id)

    const [building] = await db.select().from(venues)
    expect(building?.name).toBe('Lena Horne Theatre')
    expect(building?.formerNames).toContain('Brooks Atkinson Theatre')

    // The old name now finds the building rather than making a third record.
    const again = await findOrCreateVenue(member.id, 'Brooks Atkinson Theatre', 'New York')
    expect(again.id).toBe(now.id)
    expect(await db.select().from(venues)).toHaveLength(1)
  })

  it('does not list the current name among the former ones', async () => {
    // A theatre renamed twice, then merged in the direction that brings its own
    // present name back with it. Without the filter a building ends up listed
    // as formerly itself, and every later lookup has two ways to match it.
    const member = await makeUser()
    const old = await findOrCreateVenue(member.id, 'Brooks Atkinson Theatre', 'New York')
    const now = await findOrCreateVenue(member.id, 'Lena Horne Theatre', 'New York')
    await db
      .update(venues)
      .set({ formerNames: ['Lena Horne Theatre'] })
      .where(eq(venues.id, old.id))

    const admin = await makeAdmin()
    await mergeVenues(admin, old.id, now.id)

    const [building] = await db.select().from(venues)
    expect(building?.name).toBe('Lena Horne Theatre')
    expect(building?.formerNames).not.toContain('Lena Horne Theatre')
    expect(building?.formerNames).toContain('Brooks Atkinson Theatre')
  })

  it('carries the nights and productions across, as merging always did', async () => {
    const member = await makeUser()
    const old = await findOrCreateVenue(member.id, 'Brooks Atkinson Theatre', 'New York')
    const now = await findOrCreateVenue(member.id, 'Lena Horne Theatre', 'New York')
    const show = await makeShow()
    await db.insert(outings).values({
      showId: show.id,
      createdByUserId: member.id,
      venueId: old.id,
      datePrecision: 'year',
      occurredYear: 2007,
    })

    const admin = await makeAdmin()
    await mergeVenues(admin, old.id, now.id)
    const [night] = await db.select().from(outings)
    expect(night?.venueId).toBe(now.id)
  })
})
