import { beforeEach, describe, expect, it } from 'vitest'

import { findOrCreateProduction } from '../src/server/catalog-functions'
import { castings, outings, productions, seenPerformers } from '../src/server/db/schema'
import { eq } from 'drizzle-orm'
import { looseEndFor } from '../src/server/loose-ends'
import { addCasting } from '../src/server/people-functions'
import { db, makeLibraryEntry, makeShow, makeUser, resetDatabase } from './helpers'

beforeEach(resetDatabase)

/** A fixed day, so the rotation is not a source of flakiness. */
const MONDAY = new Date('2026-03-02T12:00:00Z')

async function aNight(
  userId: string,
  showId: string,
  values: Partial<typeof outings.$inferInsert> = {},
) {
  const [row] = await db
    .insert(outings)
    .values({
      showId,
      createdByUserId: userId,
      datePrecision: 'exact',
      occurredOn: '2005-06-01',
      venue: 'The Palace',
      ...values,
    })
    .returning()
  return row!
}

describe('a night the app could put a date on', () => {
  it('offers it only when the show has a recorded run to narrow against', async () => {
    const member = await makeUser()
    const show = await makeShow()
    await aNight(member.id, show.id, { datePrecision: 'unknown', occurredOn: null })

    // Nothing to check the memory against yet: asking would be asking them to
    // remember harder, which is not something the app can help with.
    expect(await looseEndFor(member.id, MONDAY)).toBeNull()

    // A staging on record but with no dates on it is still nothing to narrow
    // against. This is the case that matters: without it the test would pass
    // on the absence of a production rather than on the absence of a run.
    const production = await findOrCreateProduction(member.id, show.id, 'Broadway', 'broadway')
    expect(await looseEndFor(member.id, MONDAY)).toBeNull()

    await db
      .update(productions)
      .set({ openedOn: '2001-04-19', closedOn: '2007-04-22' })
      .where(eq(productions.id, production.id))

    const found = await looseEndFor(member.id, MONDAY)
    expect(found?.kind).toBe('when')
  })
})

describe('a night whose cast the app has already guessed', () => {
  async function guessable() {
    const member = await makeUser()
    const show = await makeShow()
    const production = await findOrCreateProduction(member.id, show.id, 'Broadway', 'broadway')
    const night = await aNight(member.id, show.id, {
      productionId: production.id,
      occurredOn: '2005-06-01',
    })
    return { member, show, production, night }
  }

  it('offers it when somebody was on stage that night', async () => {
    const { member, production } = await guessable()
    await addCasting(member.id, {
      productionId: production.id,
      personName: 'Nathan Lane',
      role: 'Max',
      kind: 'performer',
      isPrincipal: true,
      startedOn: '2005-01-01',
      endedOn: '2005-12-31',
    })

    expect((await looseEndFor(member.id, MONDAY))?.kind).toBe('who')
  })

  it('says nothing when the cast on record was gone by then', async () => {
    // The dates are the point. A production with a cast list that does not
    // cover the night is a production the app cannot guess about, and a guess
    // it cannot make is not a confirmation worth asking for.
    const { member, production } = await guessable()
    await addCasting(member.id, {
      productionId: production.id,
      personName: 'Nathan Lane',
      role: 'Max',
      kind: 'performer',
      isPrincipal: true,
      startedOn: '2001-01-01',
      endedOn: '2002-12-31',
    })

    expect(await looseEndFor(member.id, MONDAY)).toBeNull()
  })

  it('ignores creatives, who were not in front of anybody', async () => {
    const { member, production } = await guessable()
    await addCasting(member.id, {
      productionId: production.id,
      personName: 'Susan Stroman',
      role: 'Director',
      kind: 'creative',
      isPrincipal: true,
    })

    expect(await looseEndFor(member.id, MONDAY)).toBeNull()
  })

  it('stops asking once they have said who they saw', async () => {
    const { member, production, night } = await guessable()
    const [person] = await db
      .select()
      .from(castings)
      .where(eq(castings.productionId, production.id))
    void person
    await addCasting(member.id, {
      productionId: production.id,
      personName: 'Nathan Lane',
      role: 'Max',
      kind: 'performer',
      isPrincipal: true,
    })
    expect((await looseEndFor(member.id, MONDAY))?.kind).toBe('who')

    const [casting] = await db
      .select()
      .from(castings)
      .where(eq(castings.productionId, production.id))
    await db
      .insert(seenPerformers)
      .values({ outingId: night.id, userId: member.id, personId: casting!.personId })

    expect(await looseEndFor(member.id, MONDAY)).toBeNull()
  })

  it('does not count somebody else having answered for their own night', async () => {
    const { member, production, night } = await guessable()
    const friend = await makeUser()
    await addCasting(member.id, {
      productionId: production.id,
      personName: 'Nathan Lane',
      role: 'Max',
      kind: 'performer',
      isPrincipal: true,
    })
    const [casting] = await db
      .select()
      .from(castings)
      .where(eq(castings.productionId, production.id))
    await db
      .insert(seenPerformers)
      .values({ outingId: night.id, userId: friend.id, personId: casting!.personId })

    // Their friend's memory is not their memory.
    expect((await looseEndFor(member.id, MONDAY))?.kind).toBe('who')
  })
})

describe('the other two', () => {
  it('notices a night with no theatre', async () => {
    const member = await makeUser()
    const show = await makeShow()
    await aNight(member.id, show.id, { venue: null, venueId: null })

    expect((await looseEndFor(member.id, MONDAY))?.kind).toBe('where')
  })

  it('notices a show marked seen and never rated', async () => {
    const member = await makeUser()
    const show = await makeShow()
    await makeLibraryEntry(member.id, show.id, { status: 'seen', rating: null })

    const found = await looseEndFor(member.id, MONDAY)
    expect(found).toEqual({ kind: 'rating', slug: show.slug, title: show.title })
  })

  it('leaves a rated one alone', async () => {
    const member = await makeUser()
    const show = await makeShow()
    await makeLibraryEntry(member.id, show.id, { status: 'seen', rating: 8 })

    expect(await looseEndFor(member.id, MONDAY)).toBeNull()
  })
})

describe('whose loose ends they are', () => {
  it('never reaches into somebody else’s record', async () => {
    const member = await makeUser()
    const stranger = await makeUser()
    const show = await makeShow()
    await aNight(stranger.id, show.id, { venue: null, venueId: null })
    await makeLibraryEntry(stranger.id, show.id, { status: 'seen', rating: null })

    expect(await looseEndFor(member.id, MONDAY)).toBeNull()
  })
})

describe('how it is chosen', () => {
  it('holds still through a day and moves on by itself', async () => {
    const member = await makeUser()
    const a = await makeShow()
    const b = await makeShow()
    await aNight(member.id, a.id, { venue: null, venueId: null })
    await makeLibraryEntry(member.id, b.id, { status: 'seen', rating: null })

    const morning = await looseEndFor(member.id, new Date('2026-03-02T08:00:00Z'))
    const evening = await looseEndFor(member.id, new Date('2026-03-02T21:00:00Z'))
    // A card that reshuffles on refresh invites refreshing.
    expect(evening).toEqual(morning)

    const tomorrow = await looseEndFor(member.id, new Date('2026-03-03T08:00:00Z'))
    expect(tomorrow).not.toEqual(morning)
  })

  it('says nothing at all when there is nothing worth asking', async () => {
    const member = await makeUser()
    expect(await looseEndFor(member.id, MONDAY)).toBeNull()
  })
})
