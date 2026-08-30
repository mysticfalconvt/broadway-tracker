import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { findOrCreateProduction } from '../src/server/catalog-functions'
import { productions } from '../src/server/db/schema'
import { narrowDate } from '../src/server/narrowing'
import { addCasting } from '../src/server/people-functions'
import { db, makeShow, makeUser, resetDatabase } from './helpers'

beforeEach(resetDatabase)

async function showThatRan(
  openedOn: string | null,
  closedOn: string | null,
  title = 'Dear Evan Hansen',
) {
  const member = await makeUser()
  const show = await makeShow({ title, slug: title.toLowerCase().replace(/\W+/g, '-') })
  const production = await findOrCreateProduction(
    member.id,
    show.id,
    'Original Broadway',
    'broadway',
    'Music Box Theatre',
    'New York',
  )
  await db.update(productions).set({ openedOn, closedOn }).where(eq(productions.id, production.id))
  return { member, show, productionId: production.id }
}

describe('checking a remembered year against the record', () => {
  it('says so when the year is before it opened', async () => {
    const { show } = await showThatRan('2016-12-04', '2022-09-18')
    const answer = await narrowDate(show.id, 2003)
    expect(answer.verdict).toBe('outside')
    expect(answer.message).toContain('did not open until 2016')
    expect(answer.suggestion).toBeNull()
  })

  it('says so when the year is after it closed', async () => {
    const { show } = await showThatRan('2016-12-04', '2022-09-18')
    const answer = await narrowDate(show.id, 2025)
    expect(answer.verdict).toBe('outside')
    expect(answer.message).toContain('too late')
  })

  it('accepts a year inside the run, and names the theatre', async () => {
    const { show } = await showThatRan('2016-12-04', '2022-09-18')
    const answer = await narrowDate(show.id, 2019)
    expect(answer.verdict).toBe('plausible')
    expect(answer.message).toContain('Music Box')
    expect(answer.suggestion?.year).toBe(2019)
  })

  it('settles it outright when the run was inside one year', async () => {
    // A short run is the answer: there is nowhere else it could have been.
    const { show } = await showThatRan('2004-03-01', '2004-06-30', 'A Summer Only')
    const answer = await narrowDate(show.id, null)
    expect(answer.verdict).toBe('determined')
    expect(answer.suggestion?.year).toBe(2004)
    expect(answer.message).toContain('only ran in 2004')
  })

  it('treats a still-running show as open-ended', async () => {
    const { show } = await showThatRan('2021-10-03', null, 'Six')
    expect((await narrowDate(show.id, 2024)).verdict).toBe('plausible')
    expect((await narrowDate(show.id, 2019)).verdict).toBe('outside')
  })

  it('admits when it has nothing to check against', async () => {
    const { show } = await showThatRan(null, null, 'Undated')
    const answer = await narrowDate(show.id, 2003)
    expect(answer.verdict).toBe('unknown')
    expect(answer.message).toContain('Nobody has recorded')
  })
})

describe('a remembered face narrows it further', () => {
  async function withCasting(startedOn: string, endedOn: string | null) {
    const { member, show, productionId } = await showThatRan(
      '2001-04-19',
      '2007-04-22',
      'The Producers',
    )
    await addCasting(
      member.id,
      {
        productionId,
        personName: 'Tony Danza',
        role: 'Max Bialystock',
        kind: 'performer',
        isPrincipal: true,
        startedOn,
        endedOn: endedOn ?? undefined,
      },
      { source: 'import' },
    )
    return { show }
  }

  it('contradicts a year the person was not there', async () => {
    // The whole point: the run covers 2003, but he was not in it then.
    const { show } = await withCasting('2006-12-19', '2007-04-22')
    const loose = await narrowDate(show.id, 2003)
    expect(loose.verdict).toBe('plausible')

    const tight = await narrowDate(show.id, 2003, 'Tony Danza')
    expect(tight.verdict).toBe('outside')
    expect(tight.message).toContain('cannot be right')
  })

  it('settles the year when somebody was only in it for one', async () => {
    const { show } = await withCasting('2006-12-19', '2006-12-31')
    const answer = await narrowDate(show.id, null, 'Tony Danza')
    expect(answer.verdict).toBe('determined')
    expect(answer.suggestion?.year).toBe(2006)
  })

  it('ignores a name nobody has recorded', async () => {
    const { show } = await withCasting('2006-12-19', '2007-04-22')
    const answer = await narrowDate(show.id, 2003, 'Somebody Else')
    expect(answer.verdict).toBe('plausible')
  })

  it('is unbothered by a wildcard in the name', async () => {
    const { show } = await withCasting('2006-12-19', '2007-04-22')
    expect((await narrowDate(show.id, 2003, '%')).verdict).toBe('plausible')
  })
})

describe('I remember who was in it, so what year was I there', () => {
  /** The Producers as the sources actually describe it: order, but no dates. */
  async function producersWithReplacements() {
    const member = await makeUser()
    const show = await makeShow({ title: 'The Producers', slug: 'the-producers' })
    const production = await findOrCreateProduction(
      member.id,
      show.id,
      'Original Broadway',
      'broadway',
      'St. James Theatre',
      'New York',
    )
    await db
      .update(productions)
      .set({ openedOn: '2001-04-19', closedOn: '2007-04-22' })
      .where(eq(productions.id, production.id))
    const maxes = [
      'Nathan Lane',
      'Henry Goodman',
      'Brad Oscar',
      'Lewis J. Stadlen',
      'Fred Applegate',
      'John Treacy Egan',
      'Richard Kind',
      'Tony Danza',
    ]
    for (const [index, name] of maxes.entries()) {
      await addCasting(
        member.id,
        {
          productionId: production.id,
          personName: name,
          role: 'Max Bialystock',
          kind: 'performer',
          isPrincipal: true,
          replacementOrder: index + 1,
        },
        { source: 'import' },
      )
    }
    return { show }
  }

  it('moves a memory that is several years out', async () => {
    // The actual question: I think 2003, and I remember Tony Danza.
    const { show } = await producersWithReplacements()
    const answer = await narrowDate(show.id, 2003, 'Tony Danza')
    expect(answer.verdict).toBe('outside')
    expect(answer.message).toContain('8th of 8')
    expect(answer.message).toContain('not 2003')
    expect(answer.suggestion?.year).toBeGreaterThan(2005)
  })

  it('puts somebody early in the run early', async () => {
    const { show } = await producersWithReplacements()
    const answer = await narrowDate(show.id, null, 'Nathan Lane')
    expect(answer.suggestion?.year).toBeLessThan(2003)
  })

  it('says plainly that the year was worked out, not looked up', async () => {
    const { show } = await producersWithReplacements()
    const answer = await narrowDate(show.id, 2003, 'Tony Danza')
    expect(answer.message).toContain('worked out from the order, not looked up')
  })

  it('accepts a guess that already agrees with the estimate', async () => {
    const { show } = await producersWithReplacements()
    const answer = await narrowDate(show.id, 2006, 'Tony Danza')
    expect(answer.verdict).toBe('plausible')
  })

  it('prefers a recorded date over the estimate when there is one', async () => {
    const { show } = await producersWithReplacements()
    const member = await makeUser()
    const [production] = await db.select().from(productions)
    await addCasting(
      member.id,
      {
        productionId: production?.id ?? '',
        personName: 'Roger Bart',
        role: 'Leo Bloom',
        kind: 'performer',
        isPrincipal: true,
        startedOn: '2003-01-14',
        endedOn: '2003-12-31',
      },
      { source: 'member' },
    )
    const answer = await narrowDate(show.id, 2005, 'Roger Bart')
    expect(answer.verdict).toBe('outside')
    expect(answer.message).toContain('2003')
    expect(answer.message).not.toContain('worked out from the order')
  })

  it('says so when nothing at all is recorded about when they were in it', async () => {
    const member = await makeUser()
    const show = await makeShow({ title: 'Undated Show', slug: 'undated-show' })
    const production = await findOrCreateProduction(
      member.id,
      show.id,
      'Broadway',
      'broadway',
      'A Theatre',
      'New York',
    )
    await db
      .update(productions)
      .set({ openedOn: '2010-01-01', closedOn: '2012-01-01' })
      .where(eq(productions.id, production.id))
    await addCasting(
      member.id,
      {
        productionId: production.id,
        personName: 'Somebody',
        role: 'A Part',
        kind: 'performer',
        isPrincipal: true,
      },
      { source: 'import' },
    )
    const answer = await narrowDate(show.id, 2011, 'Somebody')
    expect(answer.message).toContain('Nobody has recorded when they took the role')
  })
})
