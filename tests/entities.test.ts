import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { findOrCreateProduction } from '../src/server/catalog-functions'
import { castings, people, seenPerformers, shows } from '../src/server/db/schema'
import { decodeEntities } from '../src/lib/entities'
import { createOutingForUser } from '../src/server/outing-functions'
import {
  addCasting,
  recordSeenPerformer,
  removeCasting,
  updateCasting,
} from '../src/server/people-functions'
import { db, makeAdmin, makeShow, makeUser, resetDatabase } from './helpers'

beforeEach(resetDatabase)

describe('decoding what a web page called it', () => {
  it('turns entities back into characters', () => {
    expect(decodeEntities('Johnny Bevan &amp; Others')).toBe('Johnny Bevan & Others')
    expect(decodeEntities('O&#39;Hara')).toBe("O'Hara")
    expect(decodeEntities('O&rsquo;Hara')).toBe('O’Hara')
    expect(decodeEntities('&quot;Nessa&quot;')).toBe('"Nessa"')
    expect(decodeEntities('&#x26; Juliet')).toBe('& Juliet')
  })

  it('unpicks a double escape, which is how it usually arrives', () => {
    expect(decodeEntities('Bevan &amp;amp; Others')).toBe('Bevan & Others')
  })

  it('leaves alone what is not an entity', () => {
    // An ampersand somebody actually typed, and a role that merely looks like one.
    expect(decodeEntities('& Juliet')).toBe('& Juliet')
    expect(decodeEntities('Rock & Roll')).toBe('Rock & Roll')
    expect(decodeEntities('Tom & Jerry &notreal; x')).toBe('Tom & Jerry &notreal; x')
  })

  it('refuses to invent a control character', () => {
    expect(decodeEntities('a&#0;b')).toBe('a&#0;b')
  })
})

describe('what reaches the catalog', () => {
  async function aProduction() {
    const member = await makeUser()
    const show = await makeShow()
    const production = await findOrCreateProduction(member.id, show.id, 'Broadway', 'broadway')
    return { member, production }
  }

  it('stores the role a person would read, not the one a page printed', async () => {
    const { member, production } = await aProduction()
    await addCasting(member.id, {
      productionId: production.id,
      personName: 'Johnny Bevan',
      role: 'Johnny Bevan &amp; Others',
      kind: 'performer',
      isPrincipal: true,
    })

    const [row] = await db.select().from(castings)
    expect(row?.role).toBe('Johnny Bevan & Others')
  })

  it('does the same for a name', async () => {
    const { member, production } = await aProduction()
    await addCasting(member.id, {
      productionId: production.id,
      personName: 'Ren&eacute;e Fleming',
      role: 'Herself',
      kind: 'performer',
      isPrincipal: true,
    })
    const [row] = await db.select().from(people)
    // &eacute; is not in the table, so it survives rather than being mangled —
    // but the ones that do arrive are handled.
    expect(row?.name).toContain('Fleming')

    await addCasting(member.id, {
      productionId: production.id,
      personName: 'Bevan &amp; Sons',
      role: 'Ensemble',
      kind: 'performer',
      isPrincipal: false,
    })
    const names = (await db.select().from(people)).map((one) => one.name)
    expect(names).toContain('Bevan & Sons')
  })
})

describe('correcting a casting', () => {
  async function aCasting() {
    const member = await makeUser()
    const admin = await makeAdmin()
    const show = await makeShow()
    const production = await findOrCreateProduction(member.id, show.id, 'Broadway', 'broadway')
    await addCasting(member.id, {
      productionId: production.id,
      personName: 'Julia Knitel',
      role: 'Ewen Montagu',
      kind: 'performer',
      isPrincipal: true,
    })
    const [row] = await db.select().from(castings)
    return { member, admin, casting: row! }
  }

  it('can be fixed rather than only added to', async () => {
    const { admin, casting } = await aCasting()
    await updateCasting(admin, casting.id, {
      role: 'Ewen Montagu &amp; Others',
      kind: 'performer',
      isPrincipal: true,
    })

    const [after] = await db.select().from(castings).where(eq(castings.id, casting.id))
    // Corrections go through the same decoding as new rows.
    expect(after?.role).toBe('Ewen Montagu & Others')
  })

  it('can be removed when it is simply wrong', async () => {
    const { admin, casting } = await aCasting()
    await removeCasting(admin, casting.id)
    expect(await db.select().from(castings)).toHaveLength(0)
  })

  it('is not something a member who did not enter it can do', async () => {
    const { casting } = await aCasting()
    const bystander = await makeUser()
    await expect(
      updateCasting(bystander, casting.id, {
        role: 'Anything',
        kind: 'performer',
        isPrincipal: true,
      }),
    ).rejects.toThrow(/somebody else/i)
    await expect(removeCasting(bystander, casting.id)).rejects.toThrow(/somebody else/i)
    expect(await db.select().from(castings)).toHaveLength(1)
  })

  it('will not blank a role', async () => {
    const { admin, casting } = await aCasting()
    await expect(
      updateCasting(admin, casting.id, { role: '   ', kind: 'performer', isPrincipal: true }),
    ).rejects.toThrow(/needs a role/i)
  })
})

describe('fixing what you entered yourself', () => {
  async function entered() {
    const mine = await makeUser()
    const theirs = await makeUser()
    const show = await makeShow()
    const production = await findOrCreateProduction(mine.id, show.id, 'Broadway', 'broadway')
    await addCasting(mine.id, {
      productionId: production.id,
      personName: 'Julia Knitel',
      role: 'Ewen Montagu',
      kind: 'performer',
      isPrincipal: true,
    })
    const [row] = await db.select().from(castings)
    return { mine, theirs, casting: row! }
  }

  it('lets the person who entered it correct it', async () => {
    // An append-only API hands somebody a way to make a mess and no way to
    // clear it up. Bulk entry is exactly where wrong rows come from.
    const { mine, casting } = await entered()
    await updateCasting(mine, casting.id, {
      role: 'Ewen Montagu (cover)',
      kind: 'performer',
      isPrincipal: true,
    })
    const [after] = await db.select().from(castings).where(eq(castings.id, casting.id))
    expect(after?.role).toBe('Ewen Montagu (cover)')

    await removeCasting(mine, casting.id)
    expect(await db.select().from(castings)).toHaveLength(0)
  })

  it('does not let a different member touch it', async () => {
    const { theirs, casting } = await entered()
    await expect(
      updateCasting(theirs, casting.id, { role: 'X', kind: 'performer', isPrincipal: true }),
    ).rejects.toThrow(/somebody else/i)
    await expect(removeCasting(theirs, casting.id)).rejects.toThrow(/somebody else/i)
    expect(await db.select().from(castings)).toHaveLength(1)
  })

  it('still lets an administrator correct anybody’s', async () => {
    const { casting } = await entered()
    const admin = await makeAdmin()
    await updateCasting(admin, casting.id, {
      role: 'Ewen Montagu',
      kind: 'performer',
      isPrincipal: true,
    })
    expect(await db.select().from(castings)).toHaveLength(1)
  })

  it('never reaches what somebody recorded about their own night', async () => {
    // A casting is a claim about a stage. What a member says they saw is theirs.
    const { mine, casting } = await entered()
    const [show] = await db.select().from(shows)
    const night = await createOutingForUser(mine.id, {
      showId: show!.id,
      datePrecision: 'exact',
      occurredOn: '2026-08-11',
      attendeeIds: [],
      favorite: false,
    })
    await recordSeenPerformer(mine.id, night.id, 'Gerianne Pérez', 'Ewen Montagu')

    await removeCasting(mine, casting.id)
    expect(await db.select().from(seenPerformers)).toHaveLength(1)
  })
})

describe('a cover recorded from a web page', () => {
  it('decodes the role, so it matches the casting it supersedes', async () => {
    // Reported from real use: the casting path decoded and this one did not,
    // so "Johnny Bevan &amp; Others" never matched "Johnny Bevan & Others" and
    // the billed performer went on being offered as a guess.
    const { outingForViewer } = await import('../src/server/outing-functions')
    const member = await makeUser()
    const show = await makeShow()
    const production = await findOrCreateProduction(member.id, show.id, 'Broadway', 'broadway')
    await addCasting(member.id, {
      productionId: production.id,
      personName: 'Amanda Jill Robinson',
      role: 'Johnny Bevan &amp; Others',
      kind: 'performer',
      isPrincipal: true,
    })
    const night = await createOutingForUser(member.id, {
      showId: show.id,
      productionId: production.id,
      datePrecision: 'exact',
      occurredOn: '2026-08-11',
      attendeeIds: [],
      favorite: false,
    })

    await recordSeenPerformer(member.id, night.id, 'Allison Guinn', 'Johnny Bevan &amp; Others')

    const [recorded] = await db.select().from(seenPerformers)
    expect(recorded?.role).toBe('Johnny Bevan & Others')

    const detail = await outingForViewer(member.id, night.id)
    expect(detail.seenCast.map((one) => one.name)).toEqual(['Allison Guinn'])
    // The billed performer is gone from the guess, which was the whole point.
    expect(detail.likelyCast).toHaveLength(0)
  })
})

describe('searching with a string that came off a web page', () => {
  it('finds a title whichever way the ampersand is written', async () => {
    const { searchCatalogFor } = await import('../src/server/catalog-functions')
    const member = await makeUser()
    await makeShow({ title: '& Juliet', slug: 'and-juliet' })

    expect(await searchCatalogFor(member.id, '& Juliet')).toHaveLength(1)
    // What a caller holding an escaped copy of the title actually sends.
    expect(await searchCatalogFor(member.id, '&amp; Juliet')).toHaveLength(1)
    expect(await searchCatalogFor(member.id, 'Juliet')).toHaveLength(1)
  })
})
