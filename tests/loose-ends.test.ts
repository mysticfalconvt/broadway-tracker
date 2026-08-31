import { beforeEach, describe, expect, it } from 'vitest'

import { findOrCreateProduction } from '../src/server/catalog-functions'
import { castings, outings, productions, seenPerformers } from '../src/server/db/schema'
import { eq } from 'drizzle-orm'
import { looseEndFor } from '../src/server/loose-ends'
import { createOutingForUser } from '../src/server/outing-functions'
import { addCasting, recordSeenPerformer } from '../src/server/people-functions'
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

describe('an understudy going on', () => {
  it('supersedes the guess for that role and leaves the rest standing', async () => {
    // The case the whole feature exists for. Recording one cover used to drop
    // the entire inferred company, so a twelve-person cast showed one name.
    const { outingForViewer } = await import('../src/server/outing-functions')
    const member = await makeUser()
    const show = await makeShow()
    const production = await findOrCreateProduction(member.id, show.id, 'Broadway', 'broadway')
    for (const [name, role] of [
      ['Julia Knitel', 'Ewen Montagu'],
      ['Jak Malone', 'Hester Leggett'],
      ['David Cumming', 'Charles Cholmondeley'],
    ]) {
      await addCasting(member.id, {
        productionId: production.id,
        personName: name!,
        role: role!,
        kind: 'performer',
        isPrincipal: true,
      })
    }
    const night = await createOutingForUser(member.id, {
      showId: show.id,
      productionId: production.id,
      datePrecision: 'exact',
      occurredOn: '2026-08-11',
      attendeeIds: [],
      favorite: false,
    })

    const before = await outingForViewer(member.id, night.id)
    expect(before.likelyCast).toHaveLength(3)
    expect(before.seenCast).toHaveLength(0)

    await recordSeenPerformer(member.id, night.id, 'Gerianne Pérez', 'Ewen Montagu')

    const after = await outingForViewer(member.id, night.id)
    expect(after.seenCast.map((one) => one.name)).toEqual(['Gerianne Pérez'])
    // The other two are still inferred; only the role they spoke to is gone.
    expect(after.likelyCast.map((one) => one.role).sort()).toEqual([
      'Charles Cholmondeley',
      'Hester Leggett',
    ])
    expect(after.likelyCast.map((one) => one.name)).not.toContain('Julia Knitel')
  })
})

describe('a whole journal, countable', () => {
  it('includes nights no year lookup can ever see', async () => {
    // The reason this exists: a night recorded as "some time in the nineties"
    // has no year to match, so the only enumeration path was blind to it.
    const { nightsForUser } = await import('../src/server/outing-functions')
    const member = await makeUser()
    const a = await makeShow()
    const b = await makeShow()
    await createOutingForUser(member.id, {
      showId: a.id,
      datePrecision: 'exact',
      occurredOn: '2020-02-27',
      attendeeIds: [],
      favorite: false,
    })
    await createOutingForUser(member.id, {
      showId: b.id,
      datePrecision: 'approximate',
      approximateDate: 'some time in the nineties',
      attendeeIds: [],
      favorite: false,
    })

    const page = await nightsForUser(member.id, 50, 0)
    expect(page.total).toBe(2)
    expect(page.nights).toHaveLength(2)
    expect(page.nextAfter).toBeNull()
  })

  it('pages without dropping or repeating one', async () => {
    const { nightsForUser } = await import('../src/server/outing-functions')
    const member = await makeUser()
    for (let n = 0; n < 5; n++) {
      const show = await makeShow()
      await createOutingForUser(member.id, {
        showId: show.id,
        datePrecision: 'year',
        occurredYear: 2000 + n,
        attendeeIds: [],
        favorite: false,
      })
    }
    const first = await nightsForUser(member.id, 2, 0)
    expect(first.nights).toHaveLength(2)
    expect(first.nextAfter).toBe(2)

    const second = await nightsForUser(member.id, 2, first.nextAfter!)
    const third = await nightsForUser(member.id, 2, second.nextAfter!)
    expect(third.nextAfter).toBeNull()

    const seen = [...first.nights, ...second.nights, ...third.nights].map((n) => n.outingId)
    expect(new Set(seen).size).toBe(5)
  })

  it('shows only your own nights', async () => {
    const { nightsForUser } = await import('../src/server/outing-functions')
    const member = await makeUser()
    const stranger = await makeUser()
    const show = await makeShow()
    await createOutingForUser(stranger.id, {
      showId: show.id,
      datePrecision: 'year',
      occurredYear: 2020,
      attendeeIds: [],
      favorite: false,
    })
    expect((await nightsForUser(member.id, 50, 0)).total).toBe(0)
  })
})

describe('a night remembered to the month', () => {
  async function aRun() {
    const member = await makeUser()
    const show = await makeShow()
    const production = await findOrCreateProduction(member.id, show.id, 'Broadway', 'broadway')
    // A company intact across the whole of August 2007.
    await addCasting(member.id, {
      productionId: production.id,
      personName: 'Laura Osnes',
      role: 'Sandy',
      kind: 'performer',
      isPrincipal: true,
      startedOn: '2007-07-24',
      endedOn: '2008-06-01',
    })
    // And somebody who left partway through it.
    await addCasting(member.id, {
      productionId: production.id,
      personName: 'Left Early',
      role: 'Rizzo',
      kind: 'performer',
      isPrincipal: true,
      startedOn: '2007-07-24',
      endedOn: '2007-08-10',
    })
    return { member, show, production }
  }

  it('still says who was on, when one company held the whole month', async () => {
    // Choosing the honest precision used to cost the cast entirely: the app
    // told people never to record a guessed date as exact, and then punished
    // the ones who listened.
    const { outingForViewer } = await import('../src/server/outing-functions')
    const { member, show, production } = await aRun()
    const night = await createOutingForUser(member.id, {
      showId: show.id,
      productionId: production.id,
      datePrecision: 'month',
      occurredYear: 2007,
      occurredMonth: 8,
      attendeeIds: [],
      favorite: false,
    })

    const detail = await outingForViewer(member.id, night.id)
    expect(detail.likelyCast.map((one) => one.name)).toEqual(['Laura Osnes'])
  })

  it('leaves out anybody who was not there for all of it', async () => {
    // The bar is "certainly on", not "might have been". Somebody who left on
    // the 10th is a coin flip for a night in August, and a coin flip presented
    // as a memory is the thing this app exists to avoid.
    const { outingForViewer } = await import('../src/server/outing-functions')
    const { member, show, production } = await aRun()
    const night = await createOutingForUser(member.id, {
      showId: show.id,
      productionId: production.id,
      datePrecision: 'month',
      occurredYear: 2007,
      occurredMonth: 8,
      attendeeIds: [],
      favorite: false,
    })
    const detail = await outingForViewer(member.id, night.id)
    expect(detail.likelyCast.map((one) => one.name)).not.toContain('Left Early')
  })

  it('says nothing for a date too vague to mean anything', async () => {
    const { outingForViewer } = await import('../src/server/outing-functions')
    const { member, show, production } = await aRun()
    const night = await createOutingForUser(member.id, {
      showId: show.id,
      productionId: production.id,
      datePrecision: 'approximate',
      approximateDate: 'some time in the noughties',
      attendeeIds: [],
      favorite: false,
    })
    const detail = await outingForViewer(member.id, night.id)
    expect(detail.likelyCast).toHaveLength(0)
  })
})
