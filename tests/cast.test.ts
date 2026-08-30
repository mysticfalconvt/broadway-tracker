import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { findOrCreateProduction } from '../src/server/catalog-functions'
import { castings, people, seenPerformers } from '../src/server/db/schema'
import {
  addCasting,
  castForProduction,
  findOrCreatePerson,
  likelyCastOn,
  mergePeople,
  peopleForAdmin,
  personSuspicions,
  personWithHistory,
  recordSeenPerformer,
  updatePerson,
  searchPeople,
} from '../src/server/people-functions'
import { createOutingForUser, outingForViewer } from '../src/server/outing-functions'
import { db, makeAdmin, makeFriendship, makeShow, makeUser, resetDatabase } from './helpers'

beforeEach(resetDatabase)

const actor = (u: { id: string; role: string }) => ({ id: u.id, role: u.role }) as never

async function schmigadoon() {
  const member = await makeUser()
  const show = await makeShow({ title: 'Schmigadoon!', slug: 'schmigadoon' })
  const production = await findOrCreateProduction(
    member.id,
    show.id,
    'Original Broadway',
    'broadway',
    'Nederlander Theatre',
    'New York',
  )
  return { member, show, production }
}

describe('recording a person', () => {
  it('reuses somebody already recorded, however they were typed', async () => {
    const member = await makeUser()
    const first = await findOrCreatePerson(member.id, 'Alex Brightman')
    const again = await findOrCreatePerson(member.id, '  alex   brightman ')
    expect(again.id).toBe(first.id)
    expect(again.name).toBe('Alex Brightman')
    expect(await db.select().from(people)).toHaveLength(1)
  })

  it('keeps two people with similar names apart', async () => {
    const member = await makeUser()
    await findOrCreatePerson(member.id, 'Alex Brightman')
    await findOrCreatePerson(member.id, 'Alexander Brightman')
    expect(await db.select().from(people)).toHaveLength(2)
  })

  it('refuses a name that is only punctuation', async () => {
    const member = await makeUser()
    await expect(findOrCreatePerson(member.id, '  !!! ')).rejects.toThrow('needs a name')
  })

  it('offers existing people as suggestions', async () => {
    const member = await makeUser()
    await findOrCreatePerson(member.id, 'Ana Gasteyer')
    await findOrCreatePerson(member.id, 'Ann Harada')
    expect((await searchPeople('ana')).map((p) => p.name)).toEqual(['Ana Gasteyer'])
    expect(await searchPeople('%')).toHaveLength(0)
    expect((await searchPeople('')).length).toBe(2)
  })
})

describe('casting somebody in a production', () => {
  it('records the person and the role together', async () => {
    const { member, production } = await schmigadoon()
    const result = await addCasting(member.id, {
      productionId: production.id,
      personName: 'Alex Brightman',
      role: 'Josh Skinner',
      kind: 'performer',
      isPrincipal: true,
    })
    expect(result.created).toBe(true)
    const cast = await castForProduction(production.id)
    expect(cast).toHaveLength(1)
    expect(cast[0]).toMatchObject({
      name: 'Alex Brightman',
      role: 'Josh Skinner',
      isPrincipal: true,
    })
  })

  it('does not duplicate when two members record the same casting', async () => {
    const { member, production } = await schmigadoon()
    const other = await makeUser()
    await addCasting(member.id, {
      productionId: production.id,
      personName: 'Ana Gasteyer',
      role: 'Mildred Layton',
      kind: 'performer',
      isPrincipal: true,
    })
    const second = await addCasting(other.id, {
      productionId: production.id,
      personName: 'ana gasteyer',
      role: 'mildred layton',
      kind: 'performer',
      isPrincipal: false,
    })
    expect(second.created).toBe(false)
    expect(await db.select().from(castings)).toHaveLength(1)
  })

  it('lets one person hold two roles in a production', async () => {
    const { member, production } = await schmigadoon()
    await addCasting(member.id, {
      productionId: production.id,
      personName: 'Cinco Paul',
      role: 'Book',
      kind: 'creative',
      isPrincipal: false,
    })
    await addCasting(member.id, {
      productionId: production.id,
      personName: 'Cinco Paul',
      role: 'Music and Lyrics',
      kind: 'creative',
      isPrincipal: false,
    })
    expect(await db.select().from(castings)).toHaveLength(2)
    expect(await db.select().from(people)).toHaveLength(1)
  })

  it('puts principals before the rest', async () => {
    const { member, production } = await schmigadoon()
    await addCasting(member.id, {
      productionId: production.id,
      personName: 'Zed Ensemble',
      role: 'Ensemble',
      kind: 'performer',
      isPrincipal: false,
    })
    await addCasting(member.id, {
      productionId: production.id,
      personName: 'Alex Brightman',
      role: 'Josh Skinner',
      kind: 'performer',
      isPrincipal: true,
    })
    expect((await castForProduction(production.id)).map((c) => c.name)).toEqual([
      'Alex Brightman',
      'Zed Ensemble',
    ])
  })

  it('refuses a production that does not exist', async () => {
    const member = await makeUser()
    await expect(
      addCasting(member.id, {
        productionId: '00000000-0000-4000-8000-000000000000',
        personName: 'Somebody',
        role: 'A part',
        kind: 'performer',
        isPrincipal: false,
      }),
    ).rejects.toThrow('not in the catalog')
  })
})

describe('who was probably on stage', () => {
  it('includes somebody whose run covers the night', async () => {
    const { member, production } = await schmigadoon()
    await addCasting(member.id, {
      productionId: production.id,
      personName: 'Alex Brightman',
      role: 'Josh Skinner',
      kind: 'performer',
      isPrincipal: true,
      startedOn: '2026-04-04',
      endedOn: '2026-12-31',
    })
    expect((await likelyCastOn(production.id, '2026-05-18')).map((c) => c.name)).toEqual([
      'Alex Brightman',
    ])
  })

  it('excludes somebody who had left, and somebody who had not joined', async () => {
    const { member, production } = await schmigadoon()
    await addCasting(member.id, {
      productionId: production.id,
      personName: 'Departed Actor',
      role: 'Josh Skinner',
      kind: 'performer',
      isPrincipal: true,
      startedOn: '2026-04-04',
      endedOn: '2026-04-30',
    })
    await addCasting(member.id, {
      productionId: production.id,
      personName: 'Later Actor',
      role: 'Josh Skinner',
      kind: 'performer',
      isPrincipal: true,
      startedOn: '2026-07-01',
    })
    expect(await likelyCastOn(production.id, '2026-05-18')).toHaveLength(0)
  })

  it('includes an open-ended run, which means still in the role', async () => {
    const { member, production } = await schmigadoon()
    await addCasting(member.id, {
      productionId: production.id,
      personName: 'Still There',
      role: 'Josh Skinner',
      kind: 'performer',
      isPrincipal: true,
      startedOn: '2026-04-04',
    })
    expect(await likelyCastOn(production.id, '2026-11-01')).toHaveLength(1)
  })

  it('includes a casting with no dates at all, since nothing rules it out', async () => {
    const { member, production } = await schmigadoon()
    await addCasting(member.id, {
      productionId: production.id,
      personName: 'Undated',
      role: 'Josh Skinner',
      kind: 'performer',
      isPrincipal: true,
    })
    expect(await likelyCastOn(production.id, '2026-05-18')).toHaveLength(1)
  })

  it('answers nothing when the night has no exact date to reason from', async () => {
    // A fuzzy memory cannot be matched against a casting window, and guessing
    // from a year would be presenting a coin flip as a fact.
    const { member, production } = await schmigadoon()
    await addCasting(member.id, {
      productionId: production.id,
      personName: 'Alex Brightman',
      role: 'Josh Skinner',
      kind: 'performer',
      isPrincipal: true,
    })
    expect(await likelyCastOn(production.id, null)).toHaveLength(0)
  })
})

describe('a person page', () => {
  it('lists their roles and the nights the reader saw them', async () => {
    const { member, show, production } = await schmigadoon()
    const casting = await addCasting(member.id, {
      productionId: production.id,
      personName: 'Alex Brightman',
      role: 'Josh Skinner',
      kind: 'performer',
      isPrincipal: true,
    })
    await createOutingForUser(member.id, {
      showId: show.id,
      productionId: production.id,
      datePrecision: 'exact',
      occurredOn: '2026-05-18',
      attendeeIds: [],
      favorite: false,
    })
    const page = await personWithHistory(member.id, casting.personId)
    expect(page.person.name).toBe('Alex Brightman')
    expect(page.roles[0]).toMatchObject({ role: 'Josh Skinner', showTitle: 'Schmigadoon!' })
    expect(page.yourNights).toHaveLength(1)
  })

  it('shows a stranger the roles but none of anybody’s nights', async () => {
    const { member, show, production } = await schmigadoon()
    const casting = await addCasting(member.id, {
      productionId: production.id,
      personName: 'Alex Brightman',
      role: 'Josh Skinner',
      kind: 'performer',
      isPrincipal: true,
    })
    await createOutingForUser(member.id, {
      showId: show.id,
      productionId: production.id,
      datePrecision: 'exact',
      occurredOn: '2026-05-18',
      attendeeIds: [],
      favorite: false,
    })
    const page = await personWithHistory(null, casting.personId)
    expect(page.roles).toHaveLength(1)
    expect(page.yourNights).toHaveLength(0)
  })
})

describe('merging duplicate people', () => {
  it('moves the castings and removes the duplicate', async () => {
    const { member, production } = await schmigadoon()
    const admin = await makeAdmin()
    const wrong = await addCasting(member.id, {
      productionId: production.id,
      personName: 'Alex Brightmann',
      role: 'Josh Skinner',
      kind: 'performer',
      isPrincipal: true,
    })
    const right = await findOrCreatePerson(member.id, 'Alex Brightman')
    await mergePeople(actor(admin), wrong.personId, right.id)
    expect(await db.select().from(people)).toHaveLength(1)
    const [row] = await db.select().from(castings)
    expect(row?.personId).toBe(right.id)
  })

  it('refuses a member, and refuses merging somebody into themselves', async () => {
    const member = await makeUser()
    const admin = await makeAdmin()
    const person = await findOrCreatePerson(member.id, 'Alex Brightman')
    await expect(mergePeople(actor(member), person.id, person.id)).rejects.toThrow('Forbidden')
    await expect(mergePeople(actor(admin), person.id, person.id)).rejects.toThrow(
      'different person',
    )
  })
})

/** A recorded night with one performer cast, for the merge tests. */
async function nightAtFor(dateString = '2026-05-18') {
  const { member, show, production } = await schmigadoon()
  await addCasting(member.id, {
    productionId: production.id,
    personName: 'Alex Brightman',
    role: 'Josh Skinner',
    kind: 'performer',
    isPrincipal: true,
    startedOn: '2026-04-20',
  })
  const outing = await createOutingForUser(member.id, {
    showId: show.id,
    productionId: production.id,
    datePrecision: 'exact',
    occurredOn: dateString,
    attendeeIds: [],
    favorite: false,
  })
  return { member, production, outingId: outing.id }
}

describe('the merge screen', () => {
  it('counts what rests on each person, so a merge is not made blind', async () => {
    const { member, production, outingId } = await nightAtFor()
    const admin = await makeAdmin()
    await recordSeenPerformer(member.id, outingId, 'Alex Brightman')
    const rows = await peopleForAdmin(actor(admin))
    const alex = rows.find((row) => row.name === 'Alex Brightman')
    expect(alex?.castingCount).toBe(1)
    expect(alex?.seenCount).toBe(1)
    expect(production).toBeTruthy()
  })

  it('surfaces near-identical names without folding them together', async () => {
    const member = await makeUser()
    const admin = await makeAdmin()
    await findOrCreatePerson(member.id, 'Ana Gasteyer')
    await findOrCreatePerson(member.id, 'Ana Gasteyier')
    await findOrCreatePerson(member.id, 'Brad Oscar')
    const pairs = await personSuspicions(actor(admin))
    expect(pairs).toHaveLength(1)
    expect([pairs[0]?.a.name, pairs[0]?.b.name].sort()).toEqual(['Ana Gasteyer', 'Ana Gasteyier'])
    // Surfacing is not merging.
    expect(await db.select().from(people)).toHaveLength(3)
  })

  it('refuses a member the list and the suspicions', async () => {
    const member = await makeUser()
    await expect(peopleForAdmin(actor(member))).rejects.toThrow('Forbidden')
    await expect(personSuspicions(actor(member))).rejects.toThrow('Forbidden')
  })

  it('fixes a misspelling, and refuses a rename onto somebody who exists', async () => {
    const member = await makeUser()
    const admin = await makeAdmin()
    const wrong = await findOrCreatePerson(member.id, 'Ana Gasteyier')
    const renamed = await updatePerson(actor(admin), wrong.id, '  Ana   Gasteyer ', 'Cloris')
    expect(renamed.name).toBe('Ana Gasteyer')
    expect(renamed.note).toBe('Cloris')
    // The key moves with the name, so the next import collides instead of duplicating.
    expect((await findOrCreatePerson(member.id, 'ana gasteyer')).id).toBe(wrong.id)

    const other = await findOrCreatePerson(member.id, 'Brad Oscar')
    await expect(updatePerson(actor(admin), other.id, 'Ana Gasteyer', null)).rejects.toThrow(
      'merge them instead',
    )
  })

  it('refuses a member a rename', async () => {
    const member = await makeUser()
    const person = await findOrCreatePerson(member.id, 'Brad Oscar')
    await expect(updatePerson(actor(member), person.id, 'Someone Else', null)).rejects.toThrow(
      'Forbidden',
    )
  })
})

describe('merging keeps what members entered', () => {
  it('moves a member’s record of who they saw onto the surviving person', async () => {
    const { member, outingId } = await nightAtFor()
    const admin = await makeAdmin()
    const { personId: duplicateId } = await recordSeenPerformer(
      member.id,
      outingId,
      'Alexander Brightman',
    )
    const [keeper] = await db.select().from(people).where(eq(people.name, 'Alex Brightman'))

    await mergePeople(actor(admin), duplicateId, keeper?.id ?? '')

    // The whole point: the answer survives the merge rather than cascading away.
    const rows = await db.select().from(seenPerformers)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.personId).toBe(keeper?.id)
    const after = await outingForViewer(member.id, outingId)
    expect(after.seenCast.map((c) => c.name)).toEqual(['Alex Brightman'])
  })

  it('does not leave a member answering twice for one night', async () => {
    const { member, outingId } = await nightAtFor()
    const admin = await makeAdmin()
    const { personId: keptId } = await recordSeenPerformer(member.id, outingId, 'Alex Brightman')
    const { personId: duplicateId } = await recordSeenPerformer(
      member.id,
      outingId,
      'Alexander Brightman',
    )
    await mergePeople(actor(admin), duplicateId, keptId)
    expect(await db.select().from(seenPerformers)).toHaveLength(1)
    expect((await outingForViewer(member.id, outingId)).seenCast).toHaveLength(1)
  })

  it('folds a duplicate casting instead of listing the same role twice', async () => {
    const { member, production } = await schmigadoon()
    const admin = await makeAdmin()
    await addCasting(member.id, {
      productionId: production.id,
      personName: 'Alex Brightman',
      role: 'Josh Skinner',
      kind: 'performer',
      isPrincipal: true,
    })
    const duplicate = await addCasting(member.id, {
      productionId: production.id,
      personName: 'Alexander Brightman',
      role: 'Josh Skinner',
      kind: 'performer',
      isPrincipal: true,
      startedOn: '2026-04-20',
      endedOn: '2026-09-01',
    })
    const [keeper] = await db.select().from(people).where(eq(people.name, 'Alex Brightman'))

    await mergePeople(actor(admin), duplicate.personId, keeper?.id ?? '')

    const cast = await castForProduction(production.id)
    expect(cast).toHaveLength(1)
    // The duplicate carried the run's dates; losing them would break the guess.
    const [row] = await db.select().from(castings)
    expect(row?.startedOn).toBe('2026-04-20')
    expect(row?.endedOn).toBe('2026-09-01')
    expect(await likelyCastOn(production.id, '2026-05-18')).toHaveLength(1)
  })

  it('keeps a casting the survivor did not already have', async () => {
    const { member, production } = await schmigadoon()
    const admin = await makeAdmin()
    await addCasting(member.id, {
      productionId: production.id,
      personName: 'Alex Brightman',
      role: 'Josh Skinner',
      kind: 'performer',
      isPrincipal: true,
    })
    const other = await addCasting(member.id, {
      productionId: production.id,
      personName: 'Alexander Brightman',
      role: 'Doc Lopez',
      kind: 'performer',
      isPrincipal: false,
    })
    const [keeper] = await db.select().from(people).where(eq(people.name, 'Alex Brightman'))
    await mergePeople(actor(admin), other.personId, keeper?.id ?? '')
    const cast = await castForProduction(production.id)
    expect(cast.map((c) => c.role).sort()).toEqual(['Doc Lopez', 'Josh Skinner'])
  })
})

describe('the creative team is not "who you saw"', () => {
  it('leaves a director out of the likely cast', async () => {
    const { member, production } = await schmigadoon()
    await addCasting(member.id, {
      productionId: production.id,
      personName: 'Alex Brightman',
      role: 'Josh Skinner',
      kind: 'performer',
      isPrincipal: true,
      startedOn: '2026-04-20',
    })
    await addCasting(member.id, {
      productionId: production.id,
      personName: 'Christopher Gattelli',
      role: 'Director and choreographer',
      kind: 'creative',
      isPrincipal: false,
      startedOn: '2026-04-20',
    })
    const likely = await likelyCastOn(production.id, '2026-05-18')
    expect(likely.map((c) => c.name)).toEqual(['Alex Brightman'])
  })

  it('still lists them among the production’s company', async () => {
    const { member, production } = await schmigadoon()
    await addCasting(member.id, {
      productionId: production.id,
      personName: 'Cinco Paul',
      role: 'Book, music, and lyrics',
      kind: 'creative',
      isPrincipal: false,
    })
    expect((await castForProduction(production.id)).map((c) => c.name)).toEqual(['Cinco Paul'])
  })
})

describe('correcting who you actually saw', () => {
  async function nightAt(dateString = '2026-05-18') {
    const { member, show, production } = await schmigadoon()
    await addCasting(member.id, {
      productionId: production.id,
      personName: 'Alex Brightman',
      role: 'Josh Skinner',
      kind: 'performer',
      isPrincipal: true,
      startedOn: '2026-04-20',
    })
    const outing = await createOutingForUser(member.id, {
      showId: show.id,
      productionId: production.id,
      datePrecision: 'exact',
      occurredOn: dateString,
      attendeeIds: [],
      favorite: false,
    })
    return { member, production, outingId: outing.id }
  }

  it('offers a guess until somebody records an answer', async () => {
    const { member, outingId } = await nightAt()
    const before = await outingForViewer(member.id, outingId)
    expect(before.likelyCast.map((c) => c.name)).toEqual(['Alex Brightman'])
    expect(before.seenCast).toHaveLength(0)
  })

  it('replaces the guess once the cast is confirmed', async () => {
    const { member, production, outingId } = await nightAt()
    const { confirmLikelyCast } = await import('../src/server/people-functions')
    const count = await confirmLikelyCast(member.id, outingId, production.id, '2026-05-18')
    expect(count).toBe(1)
    const after = await outingForViewer(member.id, outingId)
    expect(after.seenCast.map((c) => c.name)).toEqual(['Alex Brightman'])
    // The inference stops being offered: they have answered.
    expect(after.likelyCast).toHaveLength(0)
  })

  it('records an understudy who is in no casting at all', async () => {
    const { member, outingId } = await nightAt()
    const { recordSeenPerformer } = await import('../src/server/people-functions')
    await recordSeenPerformer(member.id, outingId, 'An Understudy', 'Josh Skinner')
    const after = await outingForViewer(member.id, outingId)
    expect(after.seenCast.map((c) => c.name)).toEqual(['An Understudy'])
    expect(after.seenCast[0]?.role).toBe('Josh Skinner')
    expect(after.likelyCast).toHaveLength(0)
  })

  it('lets somebody remove a name they recorded by mistake', async () => {
    const { member, outingId } = await nightAt()
    const { recordSeenPerformer, removeSeenPerformer } = await import(
      '../src/server/people-functions'
    )
    const { personId } = await recordSeenPerformer(member.id, outingId, 'Wrong Person')
    await removeSeenPerformer(member.id, outingId, personId)
    expect((await outingForViewer(member.id, outingId)).seenCast).toHaveLength(0)
  })

  it('does not record the same person twice', async () => {
    const { member, outingId } = await nightAt()
    const { recordSeenPerformer } = await import('../src/server/people-functions')
    await recordSeenPerformer(member.id, outingId, 'Alex Brightman')
    await recordSeenPerformer(member.id, outingId, 'alex brightman')
    expect((await outingForViewer(member.id, outingId)).seenCast).toHaveLength(1)
  })

  it('refuses somebody who was not at the performance', async () => {
    const { outingId } = await nightAt()
    const stranger = await makeUser()
    const { recordSeenPerformer } = await import('../src/server/people-functions')
    await expect(recordSeenPerformer(stranger.id, outingId, 'Alex Brightman')).rejects.toThrow(
      'not at this performance',
    )
  })

  it('is per attendee: one person’s correction is not imposed on another', async () => {
    const { member, show, production } = await schmigadoon()
    const friend = await makeUser()
    await makeFriendship(member.id, friend.id, 'accepted')
    await addCasting(member.id, {
      productionId: production.id,
      personName: 'Alex Brightman',
      role: 'Josh Skinner',
      kind: 'performer',
      isPrincipal: true,
      startedOn: '2026-04-20',
    })
    const outing = await createOutingForUser(member.id, {
      showId: show.id,
      productionId: production.id,
      datePrecision: 'exact',
      occurredOn: '2026-05-18',
      attendeeIds: [friend.id],
      favorite: false,
    })
    const { recordSeenPerformer } = await import('../src/server/people-functions')
    await recordSeenPerformer(member.id, outing.id, 'An Understudy', 'Josh Skinner')

    const asLogger = await outingForViewer(member.id, outing.id)
    const asFriend = await outingForViewer(friend.id, outing.id)
    expect(asLogger.seenCast.map((c) => c.name)).toEqual(['An Understudy'])
    // The friend has not answered, so they still get the guess.
    expect(asFriend.seenCast).toHaveLength(0)
    expect(asFriend.likelyCast.map((c) => c.name)).toEqual(['Alex Brightman'])
  })
})

describe('where a cast fact came from', () => {
  it('records a hand-entered casting as somebody saying so', async () => {
    const { member, production } = await schmigadoon()
    await addCasting(member.id, {
      productionId: production.id,
      personName: 'Alex Brightman',
      role: 'Josh Skinner',
      kind: 'performer',
      isPrincipal: true,
    })
    const [row] = await db.select().from(castings)
    expect(row?.source).toBe('member')
  })

  it('records an imported casting as imported, not as somebody saying so', async () => {
    // Nobody in the room vouched for these dates, and the app must not imply
    // otherwise — they are what "who you probably saw" is worked out from.
    const { member, production } = await schmigadoon()
    await addCasting(
      member.id,
      {
        productionId: production.id,
        personName: 'Alex Brightman',
        role: 'Josh Skinner',
        kind: 'performer',
        isPrincipal: true,
        startedOn: '2026-04-20',
      },
      { source: 'import' },
    )
    const [row] = await db.select().from(castings)
    expect(row?.source).toBe('import')
  })

  it('keeps a citation for something a machine found', async () => {
    const { member, production } = await schmigadoon()
    await addCasting(
      member.id,
      {
        productionId: production.id,
        personName: 'Alex Brightman',
        role: 'Josh Skinner',
        kind: 'performer',
        isPrincipal: true,
      },
      { source: 'research', sourceNote: 'https://example.org/the-cast' },
    )
    const [row] = await db.select().from(castings)
    expect(row?.source).toBe('research')
    expect(row?.sourceNote).toBe('https://example.org/the-cast')
  })

  it('carries the source through to the reader', async () => {
    const { member, production } = await schmigadoon()
    await addCasting(
      member.id,
      {
        productionId: production.id,
        personName: 'Alex Brightman',
        role: 'Josh Skinner',
        kind: 'performer',
        isPrincipal: true,
      },
      { source: 'research' },
    )
    const cast = await castForProduction(production.id)
    expect(cast[0]?.source).toBe('research')
  })
})
