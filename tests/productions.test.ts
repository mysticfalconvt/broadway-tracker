import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  findOrCreateProduction,
  normalizeProductionName,
  recentProductionsForAdmin,
} from '../src/server/catalog-functions'
import { productions, venues } from '../src/server/db/schema'
import { db, makeAdmin, makeShow, makeUser, resetDatabase } from './helpers'

const actor = (u: { id: string; role: string }) => ({ id: u.id, role: u.role }) as never

beforeEach(resetDatabase)

describe('normalizeProductionName', () => {
  it('ignores case, punctuation, and filler words', () => {
    expect(normalizeProductionName('National Tour')).toBe(normalizeProductionName('national tour'))
    expect(normalizeProductionName('The First National Tour')).toBe(
      normalizeProductionName('First National Tour'),
    )
    expect(normalizeProductionName('Original Broadway Production')).toBe(
      normalizeProductionName('Original Broadway'),
    )
  })

  it('keeps genuinely different stagings apart', () => {
    expect(normalizeProductionName('Original Broadway')).not.toBe(
      normalizeProductionName('2022 Broadway Revival'),
    )
    expect(normalizeProductionName('First National Tour')).not.toBe(
      normalizeProductionName('Second National Tour'),
    )
  })
})

describe('a member adding a production', () => {
  it('creates it without needing an administrator', async () => {
    const member = await makeUser()
    const show = await makeShow({ title: '& Juliet' })
    const result = await findOrCreateProduction(member.id, show.id, 'National Tour', 'tour')
    expect(result.created).toBe(true)
    const [row] = await db.select().from(productions)
    expect(row?.name).toBe('National Tour')
    expect(row?.productionType).toBe('tour')
  })

  it('treats the same tour seen in two cities as one production', async () => {
    // The whole point: a tour plays many venues, but it is one staging.
    const montreal = await makeUser()
    const toronto = await makeUser()
    const show = await makeShow({ title: '& Juliet' })
    const first = await findOrCreateProduction(montreal.id, show.id, 'National Tour', 'tour')
    const second = await findOrCreateProduction(toronto.id, show.id, 'national tour', 'tour')
    expect(second.created).toBe(false)
    expect(second.id).toBe(first.id)
    expect(await db.select().from(productions)).toHaveLength(1)
  })

  it('keeps Broadway and the tour of one show as separate productions', async () => {
    const member = await makeUser()
    const show = await makeShow({ title: '& Juliet' })
    await findOrCreateProduction(member.id, show.id, 'Original Broadway', 'broadway')
    await findOrCreateProduction(member.id, show.id, 'National Tour', 'tour')
    expect(await db.select().from(productions)).toHaveLength(2)
  })

  it('keeps the same production name on different shows apart', async () => {
    const member = await makeUser()
    const a = await makeShow({ title: 'Show A', slug: 'show-a' })
    const b = await makeShow({ title: 'Show B', slug: 'show-b' })
    await findOrCreateProduction(member.id, a.id, 'National Tour', 'tour')
    await findOrCreateProduction(member.id, b.id, 'National Tour', 'tour')
    expect(await db.select().from(productions)).toHaveLength(2)
  })

  it('records a local company run alongside the Broadway staging', async () => {
    const member = await makeUser()
    const show = await makeShow({ title: 'Dear Evan Hansen' })
    await findOrCreateProduction(
      member.id,
      show.id,
      'Original Broadway',
      'broadway',
      'Music Box Theatre',
      'New York',
    )
    const local = await findOrCreateProduction(
      member.id,
      show.id,
      'Riverside Players 2026',
      'local',
      'Riverside High School',
      'Ithaca',
    )
    expect(local.created).toBe(true)
    const rows = await db.select().from(productions).where(eq(productions.showId, show.id))
    expect(rows.map((r) => r.productionType).sort()).toEqual(['broadway', 'local'])
    // A production with a fixed home links its venue like anything else.
    expect(await db.select().from(venues)).toHaveLength(2)
  })

  it("refuses somebody else's submission", async () => {
    const member = await makeUser()
    const stranger = await makeUser()
    const pending = await makeShow({
      catalogStatus: 'pending',
      submittedByUserId: stranger.id,
    })
    await expect(
      findOrCreateProduction(member.id, pending.id, 'National Tour', 'tour'),
    ).rejects.toThrow('from the catalog')
  })

  it('lets somebody describe their own submission while it waits', async () => {
    // They can already log a night against it. Making them wait on review
    // before the show can even have a venue is how a night goes unrecorded.
    const member = await makeUser()
    const mine = await makeShow({ catalogStatus: 'pending', submittedByUserId: member.id })
    const made = await findOrCreateProduction(member.id, mine.id, 'National Tour', 'tour')
    expect(made.created).toBe(true)
  })

  it('refuses an empty name', async () => {
    const member = await makeUser()
    const show = await makeShow()
    await expect(findOrCreateProduction(member.id, show.id, '   ', 'tour')).rejects.toThrow(
      'needs a name',
    )
  })
})

describe('finding a production after an import', () => {
  async function imported() {
    const admin = await makeAdmin()
    const member = await makeUser()
    const hadestown = await makeShow({ title: 'Hadestown', slug: 'hadestown' })
    const six = await makeShow({ title: 'Six', slug: 'six' })
    await findOrCreateProduction(
      member.id,
      hadestown.id,
      'Original Broadway',
      'broadway',
      'Walter Kerr Theatre',
      'New York',
    )
    await findOrCreateProduction(
      member.id,
      six.id,
      'First National Tour',
      'tour',
      'Place Des Arts',
      'Montreal',
    )
    return { admin, member, hadestown, six }
  }

  it('lists every production across every show, newest first', async () => {
    const { admin } = await imported()
    const rows = await recentProductionsForAdmin(actor(admin))
    expect(rows).toHaveLength(2)
    expect(rows[0]?.showTitle).toBe('Six')
    expect(rows[0]?.venue).toBe('Place Des Arts')
  })

  it('finds one by its show, its staging, or its theatre', async () => {
    const { admin } = await imported()
    expect((await recentProductionsForAdmin(actor(admin), 'Hadestown')).map((r) => r.name)).toEqual(
      ['Original Broadway'],
    )
    expect(
      (await recentProductionsForAdmin(actor(admin), 'National Tour')).map((r) => r.showTitle),
    ).toEqual(['Six'])
    expect(
      (await recentProductionsForAdmin(actor(admin), 'Walter Kerr')).map((r) => r.showTitle),
    ).toEqual(['Hadestown'])
  })

  it('returns nothing rather than everything for a term that matches nothing', async () => {
    const { admin } = await imported()
    expect(await recentProductionsForAdmin(actor(admin), 'Nonexistent Playhouse')).toHaveLength(0)
  })

  it('treats a wildcard as text, not as a pattern', async () => {
    const { admin } = await imported()
    expect(await recentProductionsForAdmin(actor(admin), '%')).toHaveLength(0)
  })

  it('refuses a member', async () => {
    const { member } = await imported()
    await expect(recentProductionsForAdmin(actor(member))).rejects.toThrow('Forbidden')
  })
})
