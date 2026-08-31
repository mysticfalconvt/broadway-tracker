import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { searchCatalogFor } from '../src/server/catalog-functions'
import { castings, productions, shows } from '../src/server/db/schema'
import { acceptResearch } from '../src/server/research-functions'
import { runTool } from '../src/server/tools'
import { db, makeShow, makeUser, resetDatabase } from './helpers'

beforeEach(resetDatabase)

/**
 * What the model came back with on a real run, trimmed. Kept verbatim rather
 * than tidied: the point of these tests is that whatever a model hands over is
 * checked before any of it is written, and a tidied fixture would only prove
 * that clean input works.
 */
const RESEARCH = JSON.stringify({
  shows: [
    {
      title: 'The Producers',
      type: 'musical',
      synopsis: 'A failed producer schemes to profit from a flop.',
      productions: [
        {
          name: 'Original Broadway',
          productionType: 'broadway',
          venue: 'St. James Theatre',
          city: 'New York',
          openedOn: '2001-04-19',
          closedOn: '2007-04-22',
          source: 'https://en.wikipedia.org/wiki/The_Producers_(musical)',
          cast: [
            { name: 'Nathan Lane', role: 'Max Bialystock', kind: 'performer', isPrincipal: true },
            { name: 'Henry Goodman', role: 'Max Bialystock', kind: 'performer', isPrincipal: true },
            { name: 'Tony Danza', role: 'Max Bialystock', kind: 'performer', isPrincipal: true },
            { name: 'Susan Stroman', role: 'Director', kind: 'creative' },
          ],
        },
      ],
    },
  ],
})

describe('taking in a researched show', () => {
  it('lands as a submission, never as catalog', async () => {
    const member = await makeUser()
    const added = await acceptResearch(member.id, RESEARCH)

    const [row] = await db.select().from(shows).where(eq(shows.id, added.showId))
    expect(row?.catalogStatus).toBe('pending')
    expect(row?.submittedByUserId).toBe(member.id)
  })

  it('marks everything it writes as found by a machine', async () => {
    const member = await makeUser()
    const added = await acceptResearch(member.id, RESEARCH)

    const [production] = await db
      .select()
      .from(productions)
      .where(eq(productions.showId, added.showId))
    expect(production?.source).toBe('research')
    expect(production?.sourceNote).toContain('wikipedia.org')

    const written = await db
      .select()
      .from(castings)
      .where(eq(castings.productionId, production!.id))
    expect(written).toHaveLength(4)
    expect(written.every((one) => one.source === 'research')).toBe(true)
  })

  it('keeps the order a source listed replacements in', async () => {
    // The list position is the only date-like signal most sources give, and it
    // is what lets the app answer "late in the run, not 2003".
    const member = await makeUser()
    const added = await acceptResearch(member.id, RESEARCH)
    const [production] = await db
      .select()
      .from(productions)
      .where(eq(productions.showId, added.showId))
    const written = await db
      .select()
      .from(castings)
      .where(eq(castings.productionId, production!.id))

    const danza = written.find((one) => one.role === 'Max Bialystock' && one.replacementOrder === 3)
    expect(danza).toBeDefined()

    // A director is not third in a run of anything.
    const director = written.find((one) => one.role === 'Director')
    expect(director?.replacementOrder).toBeNull()
  })

  it('refuses to make a second copy of something already in the catalog', async () => {
    const member = await makeUser()
    await makeShow({ title: 'The Producers', slug: 'the-producers' })
    await expect(acceptResearch(member.id, RESEARCH)).rejects.toThrow(/already in the catalog/i)
    expect(await db.select().from(shows)).toHaveLength(1)
  })

  it('refuses research that came back in the wrong shape, and says where', async () => {
    const member = await makeUser()
    await expect(acceptResearch(member.id, '{"shows":[]}')).rejects.toThrow(/shows/)
    await expect(acceptResearch(member.id, '{"nonsense":true}')).rejects.toThrow(/shows/)
    await expect(acceptResearch(member.id, 'not json at all')).rejects.toThrow(/not JSON/i)
    // Nothing is written by a payload that never validated.
    expect(await db.select().from(shows)).toHaveLength(0)
  })
})

describe('finding a show you submitted yourself', () => {
  it('lets the submitter find it while it waits', async () => {
    const member = await makeUser()
    const added = await acceptResearch(member.id, RESEARCH)

    const found = await searchCatalogFor(member.id, 'Producers')
    expect(found.map((one) => one.id)).toContain(added.showId)
  })

  it('hides it from everybody else until it is reviewed', async () => {
    const member = await makeUser()
    const stranger = await makeUser()
    await acceptResearch(member.id, RESEARCH)

    expect(await searchCatalogFor(stranger.id, 'Producers')).toHaveLength(0)
    expect(await searchCatalogFor(null, 'Producers')).toHaveLength(0)
  })

  it('says so, rather than passing a submission off as catalog', async () => {
    const member = await makeUser()
    await acceptResearch(member.id, RESEARCH)

    const found = await runTool(member.id, 'find_show', { title: 'Producers' })
    expect(found.ok).toBe(true)
    const rows = (found.ok ? found.data : []) as { awaitingReview: boolean }[]
    expect(rows[0]?.awaitingReview).toBe(true)
  })
})

describe('a second attempt at the same show', () => {
  it('completes a stub rather than refusing it', async () => {
    // The failure this fixes: a rejected payload leaves a bare show behind,
    // every retry is turned away as a duplicate, and the run dates that
    // narrow_the_year needs can never be filled in.
    const member = await makeUser()
    const stub = JSON.stringify({ shows: [{ title: 'The Producers', type: 'musical' }] })
    const first = await acceptResearch(member.id, stub)
    expect(first.productions).toBe(0)
    expect(first.completedExisting).toBe(false)

    const second = await acceptResearch(member.id, RESEARCH)
    expect(second.completedExisting).toBe(true)
    expect(second.showId).toBe(first.showId)
    expect(second.productions).toBe(1)

    // One show, not two.
    expect(await db.select().from(shows)).toHaveLength(1)
    const [production] = await db.select().from(productions)
    expect(production?.openedOn).toBe('2001-04-19')
  })

  it('will not let research overwrite a run already on record', async () => {
    const member = await makeUser()
    await acceptResearch(member.id, RESEARCH)
    const [before] = await db.select().from(productions)
    await db
      .update(productions)
      .set({ openedOn: '1999-01-01' })
      .where(eq(productions.id, before!.id))

    await acceptResearch(member.id, RESEARCH)
    const [after] = await db.select().from(productions)
    expect(after?.openedOn).toBe('1999-01-01')
  })

  it('refuses to touch a show that is already published', async () => {
    const member = await makeUser()
    await makeShow({ title: 'The Producers', slug: 'the-producers' })
    await expect(acceptResearch(member.id, RESEARCH)).rejects.toThrow(/already in the catalog/i)
  })

  it('says which field was wrong instead of just refusing', async () => {
    const member = await makeUser()
    const wrong = JSON.stringify({ shows: [{ title: 'X', type: 'musical', productions: 'nope' }] })
    await expect(acceptResearch(member.id, wrong)).rejects.toThrow(/shows\.0\.productions/)
  })
})

describe('the field that names where a fact came from', () => {
  it('is accepted under either name the tools use', async () => {
    // add_production and add_casting call it sourceNote; this path called it
    // source. Strict checking turned that inconsistency from a silently
    // ignored key into a rejection that broke every create.
    const member = await makeUser()
    const withNote = JSON.stringify({
      shows: [
        {
          title: 'Hairspray',
          type: 'musical',
          productions: [
            {
              name: 'Original Broadway',
              productionType: 'broadway',
              sourceNote: 'https://en.wikipedia.org/wiki/Hairspray',
            },
          ],
        },
      ],
    })
    const added = await acceptResearch(member.id, withNote)
    expect(added.productions).toBe(1)

    const [row] = await db.select().from(productions).where(eq(productions.showId, added.showId))
    expect(row?.sourceNote).toContain('wikipedia.org')
  })

  it('still takes the older name', async () => {
    const member = await makeUser()
    const older = JSON.stringify({
      shows: [
        {
          title: 'Mary Poppins',
          type: 'musical',
          productions: [
            {
              name: 'Original Broadway',
              productionType: 'broadway',
              source: 'https://en.wikipedia.org/wiki/Mary_Poppins',
            },
          ],
        },
      ],
    })
    const added = await acceptResearch(member.id, older)
    const [row] = await db.select().from(productions).where(eq(productions.showId, added.showId))
    expect(row?.sourceNote).toContain('wikipedia.org')
  })
})
