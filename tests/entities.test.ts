import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { findOrCreateProduction } from '../src/server/catalog-functions'
import { castings, people } from '../src/server/db/schema'
import { decodeEntities } from '../src/lib/entities'
import { addCasting, removeCasting, updateCasting } from '../src/server/people-functions'
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

  it('is not something an ordinary member can do', async () => {
    const { member, casting } = await aCasting()
    await expect(
      updateCasting(member, casting.id, { role: 'Anything', kind: 'performer', isPrincipal: true }),
    ).rejects.toThrow()
    await expect(removeCasting(member, casting.id)).rejects.toThrow()
    expect(await db.select().from(castings)).toHaveLength(1)
  })

  it('will not blank a role', async () => {
    const { admin, casting } = await aCasting()
    await expect(
      updateCasting(admin, casting.id, { role: '   ', kind: 'performer', isPrincipal: true }),
    ).rejects.toThrow(/needs a role/i)
  })
})
