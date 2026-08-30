import { beforeEach, describe, expect, it } from 'vitest'

import {
  findOrCreateLocalProduction,
  findOrCreateLocalShow,
  findOrCreateProduction,
  localProductionsAt,
  localShowBySlug,
  localShowsForAdmin,
  pendingShowsForAdmin,
  promoteLocalShow,
  publishedProductionsForShow,
  publishedShowBySlug,
  searchCatalog,
} from '../src/server/catalog-functions'
import { createOutingForUser } from '../src/server/outing-functions'
import { makeAdmin, makeShow, makeUser, resetDatabase } from './helpers'

const actor = (u: { id: string; role: string }) => ({ id: u.id, role: u.role }) as never

beforeEach(resetDatabase)

async function dearEvanHansen() {
  const show = await makeShow({ title: 'Dear Evan Hansen', slug: 'dear-evan-hansen' })
  return show
}

describe('two people from the same town', () => {
  it('land on one record however differently they name it', async () => {
    const show = await dearEvanHansen()
    const first = await makeUser()
    const second = await makeUser()

    const a = await findOrCreateLocalProduction(
      first.id,
      show.id,
      'Lincoln High School',
      'Springfield',
      2019,
    )
    const b = await findOrCreateLocalProduction(
      second.id,
      show.id,
      'lincoln high school',
      'springfield',
      2019,
    )

    expect(a.created).toBe(true)
    expect(b.created).toBe(false)
    expect(b.id).toBe(a.id)
  })

  it('stay apart for different years of the same school', async () => {
    const show = await dearEvanHansen()
    const member = await makeUser()
    const first = await findOrCreateLocalProduction(member.id, show.id, 'Lincoln High', null, 2019)
    const later = await findOrCreateLocalProduction(member.id, show.id, 'Lincoln High', null, 2022)
    expect(later.id).not.toBe(first.id)
  })

  it('stay apart for different schools in the same year', async () => {
    const show = await dearEvanHansen()
    const member = await makeUser()
    const ours = await findOrCreateLocalProduction(member.id, show.id, 'Lincoln High', null, 2019)
    const theirs = await findOrCreateLocalProduction(
      member.id,
      show.id,
      'Roosevelt High',
      null,
      2019,
    )
    expect(theirs.id).not.toBe(ours.id)
  })

  it('names the staging after the school and the year', async () => {
    const show = await dearEvanHansen()
    const member = await makeUser()
    await findOrCreateLocalProduction(
      member.id,
      show.id,
      'Lincoln High School',
      'Springfield',
      2019,
    )
    const [staging] = await localProductionsAt(show.id, 'Lincoln High School', 'Springfield')
    expect(staging?.name).toBe('Lincoln High School, 2019')
  })

  it('adopts the school\u2019s canonical name rather than the second person\u2019s typing', async () => {
    const show = await dearEvanHansen()
    const first = await makeUser()
    const second = await makeUser()
    await findOrCreateLocalProduction(first.id, show.id, 'Lincoln High School', 'Springfield', 2019)
    // The second person types it carelessly and still lands on the same record,
    // under the name the school is already known by.
    const again = await findOrCreateLocalProduction(
      second.id,
      show.id,
      'lincoln   high  school',
      'springfield',
      2019,
    )
    expect(again.created).toBe(false)
    const [staging] = await localProductionsAt(show.id, 'LINCOLN HIGH SCHOOL', 'Springfield')
    expect(staging?.name).toBe('Lincoln High School, 2019')
  })

  it('offers the second person what the first recorded', async () => {
    const show = await dearEvanHansen()
    const first = await makeUser()
    await findOrCreateLocalProduction(first.id, show.id, 'Lincoln High School', 'Springfield', 2019)
    const offered = await localProductionsAt(show.id, 'lincoln high', 'Springfield')
    expect(offered).toHaveLength(0)
    const found = await localProductionsAt(show.id, 'Lincoln High School', 'Springfield')
    expect(found.map((row) => row.name)).toEqual(['Lincoln High School, 2019'])
  })
})

describe('the shared catalog stays curated', () => {
  it('keeps school stagings out of the list every member sees', async () => {
    const show = await dearEvanHansen()
    const member = await makeUser()
    await findOrCreateProduction(
      member.id,
      show.id,
      'Original Broadway',
      'broadway',
      'Music Box',
      'New York',
    )
    await findOrCreateLocalProduction(
      member.id,
      show.id,
      'Lincoln High School',
      'Springfield',
      2019,
    )

    const everybodySees = await publishedProductionsForShow(show.id)
    expect(everybodySees.map((row) => row.name)).toEqual(['Original Broadway'])
  })

  it('only surfaces a local staging at its own venue', async () => {
    const show = await dearEvanHansen()
    const member = await makeUser()
    await findOrCreateLocalProduction(
      member.id,
      show.id,
      'Lincoln High School',
      'Springfield',
      2019,
    )
    expect(await localProductionsAt(show.id, 'Roosevelt High School', 'Springfield')).toHaveLength(
      0,
    )
    // The same school name in another town is another school.
    expect(await localProductionsAt(show.id, 'Lincoln High School', 'Portland')).toHaveLength(0)
  })
})

describe('recording a local staging', () => {
  it('refuses a year nobody could have seen', async () => {
    const show = await dearEvanHansen()
    const member = await makeUser()
    await expect(
      findOrCreateLocalProduction(member.id, show.id, 'Lincoln High', null, 12019),
    ).rejects.toThrow('needs the year')
  })

  it('refuses a show that is not in the catalog', async () => {
    const member = await makeUser()
    const unpublished = await makeShow({
      title: 'Not Reviewed Yet',
      slug: 'not-reviewed-yet',
      catalogStatus: 'pending',
    })
    await expect(
      findOrCreateLocalProduction(member.id, unpublished.id, 'Lincoln High', null, 2019),
    ).rejects.toThrow('published show')
  })

  it('carries a night at the staging like any other', async () => {
    const show = await dearEvanHansen()
    const member = await makeUser()
    const staging = await findOrCreateLocalProduction(
      member.id,
      show.id,
      'Lincoln High School',
      'Springfield',
      2019,
    )
    const outing = await createOutingForUser(member.id, {
      showId: show.id,
      productionId: staging.id,
      datePrecision: 'exact',
      occurredOn: '2019-05-18',
      attendeeIds: [],
      favorite: false,
    })
    expect(outing.id).toBeTruthy()
  })
})

describe('a work that exists nowhere but this town', () => {
  it('is recorded without a submission, and never reaches the review queue', async () => {
    const member = await makeUser()
    const { show, created } = await findOrCreateLocalShow(
      member.id,
      'The Millbrook Revue',
      'musical',
      'Grange Hall',
      'Millbrook',
      2019,
    )
    expect(created).toBe(true)

    const admin = await makeAdmin()
    const waiting = await pendingShowsForAdmin(actor(admin))
    expect(waiting.map((row) => row.id)).not.toContain(show.id)
  })

  it('stays out of the shared catalog’s search', async () => {
    const member = await makeUser()
    await makeShow({ title: 'The Millbrook Revue Onstage', slug: 'millbrook-revue-onstage' })
    await findOrCreateLocalShow(
      member.id,
      'The Millbrook Revue',
      'musical',
      'Grange Hall',
      'Millbrook',
      2019,
    )
    const found = await searchCatalog('Millbrook')
    expect(found.map((row) => row.title)).toEqual(['The Millbrook Revue Onstage'])
  })

  it('is not readable from the public show page', async () => {
    const member = await makeUser()
    const { show } = await findOrCreateLocalShow(
      member.id,
      'The Millbrook Revue',
      'musical',
      'Grange Hall',
      'Millbrook',
      2019,
    )
    // The public route reads this one, and a local record names a school and
    // says somebody was there.
    expect(await publishedShowBySlug(show.slug)).toBeNull()
    expect((await localShowBySlug(show.slug))?.id).toBe(show.id)
  })

  it('brings two families in the same town to one record', async () => {
    const first = await makeUser()
    const second = await makeUser()
    const a = await findOrCreateLocalShow(
      first.id,
      'The Millbrook Revue',
      'musical',
      'Grange Hall',
      'Millbrook',
      2019,
    )
    // A different article, different casing, the same hall and year.
    const b = await findOrCreateLocalShow(
      second.id,
      'millbrook revue',
      'musical',
      'grange hall',
      'millbrook',
      2019,
    )
    expect(b.created).toBe(false)
    expect(b.show.id).toBe(a.show.id)
    expect(b.productionId).toBe(a.productionId)
  })

  it('keeps one town’s revue apart from another town’s', async () => {
    const member = await makeUser()
    const ours = await findOrCreateLocalShow(
      member.id,
      'The Spring Revue',
      'musical',
      'Grange Hall',
      'Millbrook',
      2019,
    )
    const theirs = await findOrCreateLocalShow(
      member.id,
      'The Spring Revue',
      'musical',
      'Odd Fellows Hall',
      'Portland',
      2019,
    )
    expect(theirs.show.id).not.toBe(ours.show.id)
    // Two records, two URLs.
    expect(theirs.show.slug).not.toBe(ours.show.slug)
  })

  it('gives a later year its own staging under the one show', async () => {
    const member = await makeUser()
    const first = await findOrCreateLocalShow(
      member.id,
      'The Millbrook Revue',
      'musical',
      'Grange Hall',
      'Millbrook',
      2019,
    )
    const later = await findOrCreateLocalShow(
      member.id,
      'The Millbrook Revue',
      'musical',
      'Grange Hall',
      'Millbrook',
      2022,
    )
    expect(later.show.id).toBe(first.show.id)
    expect(later.productionId).not.toBe(first.productionId)
  })

  it('can have a night logged against it like any other show', async () => {
    const member = await makeUser()
    const { show, productionId } = await findOrCreateLocalShow(
      member.id,
      'The Millbrook Revue',
      'musical',
      'Grange Hall',
      'Millbrook',
      2019,
    )
    const outing = await createOutingForUser(member.id, {
      showId: show.id,
      productionId,
      datePrecision: 'year',
      occurredYear: 2019,
      attendeeIds: [],
      favorite: false,
    })
    expect(outing.id).toBeTruthy()
  })

  it('refuses a title or a year it cannot key on', async () => {
    const member = await makeUser()
    await expect(
      findOrCreateLocalShow(member.id, '   ', 'musical', 'Grange Hall', null, 2019),
    ).rejects.toThrow('needs a title')
    await expect(
      findOrCreateLocalShow(member.id, 'The Revue', 'musical', 'Grange Hall', null, 12019),
    ).rejects.toThrow('needs the year')
  })
})

describe('promotion into the shared catalog', () => {
  it('lifts a local show and lets it be found', async () => {
    const member = await makeUser()
    const admin = await makeAdmin()
    const { show } = await findOrCreateLocalShow(
      member.id,
      'The Millbrook Revue',
      'musical',
      'Grange Hall',
      'Millbrook',
      2019,
    )
    expect(await searchCatalog('Millbrook')).toHaveLength(0)

    await promoteLocalShow(actor(admin), show.id)

    expect((await searchCatalog('Millbrook')).map((row) => row.title)).toEqual([
      'The Millbrook Revue',
    ])
    expect((await publishedShowBySlug(show.slug))?.id).toBe(show.id)
  })

  it('frees the local key, so the title deduplicates normally from then on', async () => {
    const member = await makeUser()
    const admin = await makeAdmin()
    const { show } = await findOrCreateLocalShow(
      member.id,
      'The Millbrook Revue',
      'musical',
      'Grange Hall',
      'Millbrook',
      2019,
    )
    await promoteLocalShow(actor(admin), show.id)
    // The hall no longer holds the name, so a genuinely different local work of
    // that title elsewhere is recordable.
    const again = await findOrCreateLocalShow(
      member.id,
      'The Millbrook Revue',
      'musical',
      'Grange Hall',
      'Millbrook',
      2019,
    )
    expect(again.show.id).not.toBe(show.id)
  })

  it('refuses a member, and refuses anything that is not a local show', async () => {
    const member = await makeUser()
    const admin = await makeAdmin()
    const { show } = await findOrCreateLocalShow(
      member.id,
      'The Millbrook Revue',
      'musical',
      'Grange Hall',
      'Millbrook',
      2019,
    )
    await expect(promoteLocalShow(actor(member), show.id)).rejects.toThrow('Forbidden')
    const published = await makeShow({ title: 'Already Published', slug: 'already-published' })
    await expect(promoteLocalShow(actor(admin), published.id)).rejects.toThrow('not a local show')
  })

  it('lists local shows for an administrator, with what rests on each', async () => {
    const member = await makeUser()
    const admin = await makeAdmin()
    const { show, productionId } = await findOrCreateLocalShow(
      member.id,
      'The Millbrook Revue',
      'musical',
      'Grange Hall',
      'Millbrook',
      2019,
    )
    await createOutingForUser(member.id, {
      showId: show.id,
      productionId,
      datePrecision: 'year',
      occurredYear: 2019,
      attendeeIds: [],
      favorite: false,
    })
    const rows = await localShowsForAdmin(actor(admin))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.venue).toBe('Grange Hall')
    expect(rows[0]?.stagings).toBe(1)
    expect(rows[0]?.nights).toBe(1)
    await expect(localShowsForAdmin(actor(member))).rejects.toThrow('Forbidden')
  })
})
