import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { venues } from '../src/server/db/schema'
import {
  type Coordinates,
  geocodeVenue,
  placedVenues,
  placesVisitedBy,
  queriesFor,
  unplacedVenues,
} from '../src/server/geocoding'
import { findOrCreateVenue } from '../src/server/venue-functions'
import { db, makeUser, resetDatabase } from './helpers'

beforeEach(resetDatabase)

const WALTER_KERR: Coordinates = { latitude: 40.7593, longitude: -73.9871 }

/** A stand-in for Nominatim that records what it was asked. */
function stubLookup(answer: Coordinates | null, { fail = false } = {}) {
  const asked: string[] = []
  const lookup = async (query: string) => {
    asked.push(query)
    if (fail) throw new Error('Nominatim answered 429')
    return answer
  }
  return { lookup, asked }
}

async function aVenue(name = 'Walter Kerr Theatre', city: string | null = 'New York') {
  const member = await makeUser()
  return findOrCreateVenue(member.id, name, city)
}

describe('what we ask the geocoder', () => {
  it('asks with the city, which is what makes a theatre findable', () => {
    expect(queriesFor({ name: 'Walter Kerr Theatre', city: 'New York', country: null })).toEqual([
      'Walter Kerr Theatre, New York',
    ])
  })

  it('falls back to a looser question when a country narrowed it too far', () => {
    expect(
      queriesFor({ name: 'Grange Hall', city: 'Millbrook', country: 'United States' }),
    ).toEqual(['Grange Hall, Millbrook, United States', 'Grange Hall, Millbrook'])
  })

  it('copes with a venue that has only a name', () => {
    expect(queriesFor({ name: 'The Old Vic', city: null, country: null })).toEqual(['The Old Vic'])
  })
})

describe('placing a venue', () => {
  it('records the coordinates it finds', async () => {
    const venue = await aVenue()
    const { lookup, asked } = stubLookup(WALTER_KERR)
    const found = await geocodeVenue(venue.id, lookup)
    expect(found).toEqual(WALTER_KERR)
    expect(asked).toEqual(['Walter Kerr Theatre, New York'])
    const [row] = await db.select().from(venues).where(eq(venues.id, venue.id))
    expect(row?.latitude).toBeCloseTo(40.7593)
    expect(row?.longitude).toBeCloseTo(-73.9871)
    expect(row?.geocodedAt).toBeInstanceOf(Date)
  })

  it('never asks twice about a venue it has already placed', async () => {
    const venue = await aVenue()
    await geocodeVenue(venue.id, stubLookup(WALTER_KERR).lookup)
    // Caching is not an optimisation here; the geocoder's terms require it.
    const second = stubLookup(WALTER_KERR)
    expect(await geocodeVenue(venue.id, second.lookup)).toBeNull()
    expect(second.asked).toEqual([])
  })

  it('gives up on a venue nobody can find, rather than asking forever', async () => {
    const venue = await aVenue('Somebody’s Front Room', 'Nowhere')
    for (let attempt = 0; attempt < 5; attempt++) {
      await geocodeVenue(venue.id, stubLookup(null).lookup)
    }
    const [row] = await db.select().from(venues).where(eq(venues.id, venue.id))
    expect(row?.geocodeAttempts).toBe(3)
    // And having given up, it stops asking.
    const after = stubLookup(WALTER_KERR)
    expect(await geocodeVenue(venue.id, after.lookup)).toBeNull()
    expect(after.asked).toEqual([])
  })

  it('does not count a failed request against the venue', async () => {
    // Being rate-limited says nothing about whether the place exists.
    const venue = await aVenue()
    await geocodeVenue(venue.id, stubLookup(null, { fail: true }).lookup)
    const [row] = await db.select().from(venues).where(eq(venues.id, venue.id))
    expect(row?.geocodeAttempts).toBe(0)
    expect(row?.latitude).toBeNull()
    // So a later attempt still happens.
    const retry = stubLookup(WALTER_KERR)
    expect(await geocodeVenue(venue.id, retry.lookup)).toEqual(WALTER_KERR)
  })

  it('swallows a geocoder outage rather than raising it', async () => {
    const venue = await aVenue()
    await expect(
      geocodeVenue(venue.id, stubLookup(null, { fail: true }).lookup),
    ).resolves.toBeNull()
  })

  it('shrugs at a venue that no longer exists', async () => {
    await expect(
      geocodeVenue('00000000-0000-0000-0000-000000000000', stubLookup(WALTER_KERR).lookup),
    ).resolves.toBeNull()
  })
})

describe('which venues are on the map', () => {
  it('lists only the ones actually placed', async () => {
    const placed = await aVenue()
    const unplaced = await aVenue('Grange Hall', 'Millbrook')
    await geocodeVenue(placed.id, stubLookup(WALTER_KERR).lookup)

    expect((await placedVenues()).map((v) => v.id)).toEqual([placed.id])
    expect((await unplacedVenues()).map((v) => v.id)).toEqual([unplaced.id])
  })

  it('stops listing a venue as worth asking about once it has been given up on', async () => {
    const venue = await aVenue('Somebody’s Front Room', 'Nowhere')
    for (let attempt = 0; attempt < 3; attempt++) {
      await geocodeVenue(venue.id, stubLookup(null).lookup)
    }
    expect(await unplacedVenues()).toHaveLength(0)
    expect(await placedVenues()).toHaveLength(0)
  })
})

describe('whose map is whose', () => {
  async function twoNights() {
    const member = await makeUser({ profileVisibility: 'public' })
    const { makeShow } = await import('./helpers')
    const { createOutingForUser } = await import('../src/server/outing-functions')
    const show = await makeShow({ title: 'Hadestown', slug: 'hadestown' })
    await createOutingForUser(member.id, {
      showId: show.id,
      datePrecision: 'exact',
      occurredOn: '2026-05-18',
      venue: 'Walter Kerr Theatre',
      city: 'New York',
      attendeeIds: [],
      favorite: false,
    })
    await createOutingForUser(member.id, {
      showId: show.id,
      datePrecision: 'exact',
      occurredOn: '2026-06-01',
      venue: 'Booth Theatre',
      city: 'New York',
      attendeeIds: [],
      favorite: false,
      visibility: 'private',
    })
    return { member }
  }

  it('shows somebody everywhere they have been, private nights included', async () => {
    const { member } = await twoNights()
    const mine = await placesVisitedBy(member.id)
    expect(mine.map((p) => p.name).sort()).toEqual(['Booth Theatre', 'Walter Kerr Theatre'])
  })

  it('shows a friend only the nights that were shared', async () => {
    const { member } = await twoNights()
    const theirs = await placesVisitedBy(member.id, { includePrivate: false })
    expect(theirs.map((p) => p.name)).toEqual(['Walter Kerr Theatre'])
  })

  it('counts how often somebody went back', async () => {
    const member = await makeUser({ profileVisibility: 'public' })
    const { makeShow } = await import('./helpers')
    const { createOutingForUser } = await import('../src/server/outing-functions')
    const show = await makeShow({ title: 'Six', slug: 'six' })
    for (const date of ['2026-01-02', '2026-02-02', '2026-03-02']) {
      await createOutingForUser(member.id, {
        showId: show.id,
        datePrecision: 'exact',
        occurredOn: date,
        venue: 'Booth Theatre',
        city: 'New York',
        attendeeIds: [],
        favorite: false,
      })
    }
    const places = await placesVisitedBy(member.id)
    expect(places).toHaveLength(1)
    expect(places[0]?.nights).toBe(3)
  })
})
