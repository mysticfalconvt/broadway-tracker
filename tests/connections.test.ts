import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { findOrCreateProduction } from '../src/server/catalog-functions'
import { connectionsFor } from '../src/server/connections'
import { productions } from '../src/server/db/schema'
import { createOutingForUser } from '../src/server/outing-functions'
import { addCasting, recordSeenPerformer } from '../src/server/people-functions'
import { findOrCreateVenue, mergeVenues } from '../src/server/venue-functions'
import { db, makeAdmin, makeShow, makeUser, resetDatabase } from './helpers'

beforeEach(resetDatabase)

async function aShowWith(userId: string, title: string, cast: [string, string][]) {
  const show = await makeShow({ title })
  const production = await findOrCreateProduction(userId, show.id, 'Broadway', 'broadway')
  for (const [name, role] of cast) {
    await addCasting(userId, {
      productionId: production.id,
      personName: name,
      role,
      kind: 'performer',
      isPrincipal: true,
    })
  }
  return { show, production }
}

const night = (
  userId: string,
  showId: string,
  productionId: string,
  occurredOn: string,
  extra: Record<string, unknown> = {},
) =>
  createOutingForUser(userId, {
    showId,
    productionId,
    datePrecision: 'exact',
    occurredOn,
    attendeeIds: [],
    favorite: false,
    ...extra,
  })

describe('people who turned up twice', () => {
  it('notices the same performer across two different shows', async () => {
    // The thing the app has always known and never said.
    const member = await makeUser()
    const a = await aShowWith(member.id, 'The Producers', [['Nathan Lane', 'Max']])
    const b = await aShowWith(member.id, 'Guys and Dolls', [['Nathan Lane', 'Nathan Detroit']])
    await night(member.id, a.show.id, a.production.id, '2001-05-01')
    await night(member.id, b.show.id, b.production.id, '2009-05-01')

    const found = await connectionsFor(member.id)
    expect(found.performers).toHaveLength(1)
    expect(found.performers[0]?.name).toBe('Nathan Lane')
    expect(found.performers[0]?.shows.map((one) => one.title).sort()).toEqual([
      'Guys and Dolls',
      'The Producers',
    ])
  })

  it('does not count the same show twice as a connection', async () => {
    // Seeing somebody in the same show on two nights is one memory, not two
    // shows. Counting it would manufacture a connection out of nothing.
    const member = await makeUser()
    const a = await aShowWith(member.id, 'The Producers', [['Nathan Lane', 'Max']])
    await night(member.id, a.show.id, a.production.id, '2001-05-01')
    await night(member.id, a.show.id, a.production.id, '2001-09-01')

    expect((await connectionsFor(member.id)).performers).toHaveLength(0)
  })

  it('never reaches into somebody else’s nights', async () => {
    const member = await makeUser()
    const stranger = await makeUser()
    const a = await aShowWith(stranger.id, 'The Producers', [['Nathan Lane', 'Max']])
    const b = await aShowWith(stranger.id, 'Guys and Dolls', [['Nathan Lane', 'Nathan Detroit']])
    await night(stranger.id, a.show.id, a.production.id, '2001-05-01')
    await night(stranger.id, b.show.id, b.production.id, '2009-05-01')

    expect((await connectionsFor(member.id)).performers).toHaveLength(0)
  })

  it('counts who they actually saw, not who was billed', async () => {
    // The billed performer is in *both* shows on purpose. Without the override
    // she looks like a connection across two evenings — which is the wrong
    // memory, invented out of an inference the person already corrected.
    const member = await makeUser()
    const a = await aShowWith(member.id, 'Operation Mincemeat', [['Julia Knitel', 'Ewen Montagu']])
    const b = await aShowWith(member.id, 'Wicked', [
      ['Julia Knitel', 'Elphaba'],
      ['Gerianne Pérez', 'Glinda'],
    ])
    const first = await night(member.id, a.show.id, a.production.id, '2026-08-11')
    await night(member.id, b.show.id, b.production.id, '2026-09-01')
    // A cover went on for Ewen Montagu, so Knitel was not seen that night.
    await recordSeenPerformer(member.id, first.id, 'Gerianne Pérez', 'Ewen Montagu')

    const found = await connectionsFor(member.id)
    const names = found.performers.map((one) => one.name)
    // Seen in Mincemeat as the cover and billed in Wicked: a real connection.
    expect(names).toContain('Gerianne Pérez')
    // Billed in both, but only actually seen in one.
    expect(names).not.toContain('Julia Knitel')
  })
})

describe('the dates still decide', () => {
  it('will not invent a connection out of somebody who had already left', async () => {
    // The failure this prevents is the worst kind the app can produce: a
    // memory of seeing somebody, assembled by the app, that never happened.
    const member = await makeUser()
    const a = await makeShow({ title: 'The Producers' })
    const aProduction = await findOrCreateProduction(member.id, a.id, 'Broadway', 'broadway')
    await addCasting(member.id, {
      productionId: aProduction.id,
      personName: 'Nathan Lane',
      role: 'Max',
      kind: 'performer',
      isPrincipal: true,
      // Gone eighteen months before the night below.
      startedOn: '2001-04-19',
      endedOn: '2002-03-15',
    })
    const b = await aShowWith(member.id, 'Guys and Dolls', [['Nathan Lane', 'Nathan Detroit']])

    await night(member.id, a.id, aProduction.id, '2003-09-01')
    await night(member.id, b.show.id, b.production.id, '2009-05-01')

    // Seen in one of them. One show is not a connection.
    expect((await connectionsFor(member.id)).performers).toHaveLength(0)
  })

  it('counts somebody whose run does cover the night', async () => {
    const member = await makeUser()
    const a = await makeShow({ title: 'The Producers' })
    const aProduction = await findOrCreateProduction(member.id, a.id, 'Broadway', 'broadway')
    await addCasting(member.id, {
      productionId: aProduction.id,
      personName: 'Nathan Lane',
      role: 'Max',
      kind: 'performer',
      isPrincipal: true,
      startedOn: '2001-04-19',
      endedOn: '2004-01-01',
    })
    const b = await aShowWith(member.id, 'Guys and Dolls', [['Nathan Lane', 'Nathan Detroit']])

    await night(member.id, a.id, aProduction.id, '2003-09-01')
    await night(member.id, b.show.id, b.production.id, '2009-05-01')

    expect((await connectionsFor(member.id)).performers).toHaveLength(1)
  })
})

describe('theatres gone back to', () => {
  it('counts returns to one building', async () => {
    const member = await makeUser()
    const a = await aShowWith(member.id, 'One', [])
    const b = await aShowWith(member.id, 'Two', [])
    const venue = await findOrCreateVenue(member.id, 'August Wilson Theatre', 'New York')
    for (const production of [a, b]) {
      await db
        .update(productions)
        .set({ venueId: venue.id })
        .where(eq(productions.id, production.production.id))
    }
    await night(member.id, a.show.id, a.production.id, '2020-02-27', {
      venue: 'August Wilson Theatre',
    })
    await night(member.id, b.show.id, b.production.id, '2026-07-01', {
      venue: 'August Wilson Theatre',
    })

    const found = await connectionsFor(member.id)
    expect(found.venues).toHaveLength(1)
    expect(found.venues[0]?.nights).toBe(2)
  })

  it('joins two nights under a theatre that was renamed between them', async () => {
    // The point of keeping former names: a night in 2007 and a night in 2026
    // were the same room, and nothing else in the app would say so.
    const member = await makeUser()
    const a = await aShowWith(member.id, 'Grease', [])
    const b = await aShowWith(member.id, 'Six', [])
    const old = await findOrCreateVenue(member.id, 'Brooks Atkinson Theatre', 'New York')
    const now = await findOrCreateVenue(member.id, 'Lena Horne Theatre', 'New York')
    // The town matters: a venue is matched on name *and* city, so logging
    // without one resolves to a different record than the fixtures above and
    // the merge would move something nothing points at.
    await night(member.id, a.show.id, a.production.id, '2007-08-16', {
      venue: 'Brooks Atkinson Theatre',
      city: 'New York',
    })
    await night(member.id, b.show.id, b.production.id, '2026-07-01', {
      venue: 'Lena Horne Theatre',
      city: 'New York',
    })
    expect((await connectionsFor(member.id)).venues).toHaveLength(0)

    await mergeVenues(await makeAdmin(), old.id, now.id)

    const found = await connectionsFor(member.id)
    expect(found.venues).toHaveLength(1)
    expect(found.venues[0]?.nights).toBe(2)
    expect(found.venues[0]?.formerNames).toContain('Brooks Atkinson Theatre')
    // A room is remembered by what happened in it, oldest first.
    expect(found.venues[0]?.shows.map((one) => one.title)).toEqual(['Grease', 'Six'])
    expect(found.venues[0]?.shows.map((one) => one.year)).toEqual([2007, 2026])
  })

  it('says nothing about a theatre visited once', async () => {
    const member = await makeUser()
    const a = await aShowWith(member.id, 'One', [])
    await night(member.id, a.show.id, a.production.id, '2020-02-27', { venue: 'The Palace' })
    expect((await connectionsFor(member.id)).venues).toHaveLength(0)
  })
})

describe('shows seen again, and parts recast', () => {
  it('lists the years a show was seen in', async () => {
    const member = await makeUser()
    const a = await aShowWith(member.id, 'Avenue Q', [])
    await night(member.id, a.show.id, a.production.id, '2006-12-27')
    await night(member.id, a.show.id, a.production.id, '2010-11-26')

    const found = await connectionsFor(member.id)
    expect(found.shows).toHaveLength(1)
    expect(found.shows[0]?.times.map((one) => one.year)).toEqual([2006, 2010])
  })

  it('says nothing about a part only one person played', async () => {
    const member = await makeUser()
    const show = await makeShow({ title: 'Wicked' })
    const production = await findOrCreateProduction(member.id, show.id, 'Broadway', 'broadway')
    await addCasting(member.id, {
      productionId: production.id,
      personName: 'Idina Menzel',
      role: 'Elphaba',
      kind: 'performer',
      isPrincipal: true,
    })
    await night(member.id, show.id, production.id, '2004-06-01')
    await night(member.id, show.id, production.id, '2004-09-01')

    // Seen twice, same person both times. Nothing came round again.
    const found = await connectionsFor(member.id)
    expect(found.shows[0]?.recast).toHaveLength(0)
  })

  it('notices two people in one part', async () => {
    const member = await makeUser()
    const show = await makeShow({ title: 'Wicked' })
    const production = await findOrCreateProduction(member.id, show.id, 'Broadway', 'broadway')
    await addCasting(member.id, {
      productionId: production.id,
      personName: 'Idina Menzel',
      role: 'Elphaba',
      kind: 'performer',
      isPrincipal: true,
      startedOn: '2003-10-30',
      endedOn: '2005-01-09',
    })
    await addCasting(member.id, {
      productionId: production.id,
      personName: 'Shoshana Bean',
      role: 'Elphaba',
      kind: 'performer',
      isPrincipal: true,
      startedOn: '2005-01-11',
      endedOn: '2006-01-08',
    })
    await night(member.id, show.id, production.id, '2004-06-01')
    await night(member.id, show.id, production.id, '2005-06-01')

    // A detail of the show, not a finding of its own: alone it was mostly a
    // whole company arriving dressed up as a discovery.
    const found = await connectionsFor(member.id)
    expect(found.shows).toHaveLength(1)
    expect(found.shows[0]?.recast).toHaveLength(1)
    expect(found.shows[0]?.recast[0]?.role).toBe('Elphaba')
    expect(found.shows[0]?.recast[0]?.people.sort()).toEqual(['Idina Menzel', 'Shoshana Bean'])
  })
})

describe('somebody with nothing yet', () => {
  it('comes back empty rather than failing', async () => {
    const member = await makeUser()
    const found = await connectionsFor(member.id)
    expect(found).toEqual({ performers: [], venues: [], shows: [] })
  })
})
