import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { actorForToken, apiKeysFor, createApiKey, revokeApiKey } from '../src/server/api-keys'
import { apiKeys, castings, outings, shows } from '../src/server/db/schema'
import { TOOLS, runTool, toolDescriptions } from '../src/server/tools'
import { recentContributions } from '../src/server/admin-functions'
import { db, makeAdmin, makeShow, makeUser, resetDatabase } from './helpers'

beforeEach(resetDatabase)

describe('a key standing in for a person', () => {
  it('never keeps the token it hands out', async () => {
    const member = await makeUser()
    const { token } = await createApiKey(member.id, 'laptop')

    const [stored] = await db.select().from(apiKeys)
    expect(stored?.tokenHash).not.toBe(token)
    expect(stored?.tokenHash).not.toContain(token.slice(4))
    // What is kept is enough to recognise a key in a list and no more.
    expect(token.startsWith(stored!.prefix)).toBe(true)
    expect(stored!.prefix.length).toBeLessThan(token.length)
  })

  it('resolves to its owner and nobody else', async () => {
    const member = await makeUser()
    const stranger = await makeUser()
    const { token } = await createApiKey(member.id, 'laptop')

    const acting = await actorForToken(token)
    expect(acting?.id).toBe(member.id)
    expect(acting?.id).not.toBe(stranger.id)
  })

  it('refuses a token that is off by one character', async () => {
    const member = await makeUser()
    const { token } = await createApiKey(member.id, 'laptop')
    const bent = `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`

    expect(await actorForToken(bent)).toBeNull()
  })

  it('refuses nothing, noise, and a key from elsewhere', async () => {
    expect(await actorForToken(null)).toBeNull()
    expect(await actorForToken('')).toBeNull()
    expect(await actorForToken('   ')).toBeNull()
    expect(await actorForToken('sk-live-not-ours')).toBeNull()
  })

  it('stops working the moment it is revoked', async () => {
    const member = await makeUser()
    const { token, key } = await createApiKey(member.id, 'laptop')
    expect(await actorForToken(token)).not.toBeNull()

    await revokeApiKey(member.id, key.id)
    expect(await actorForToken(token)).toBeNull()
  })

  it('will not let somebody revoke a key that is not theirs', async () => {
    const member = await makeUser()
    const stranger = await makeUser()
    const { token, key } = await createApiKey(member.id, 'laptop')

    await expect(revokeApiKey(stranger.id, key.id)).rejects.toThrow(/not yours/i)
    // And the key still works, which is the part that would actually hurt.
    expect(await actorForToken(token)).not.toBeNull()
  })

  it('shows you only your own keys', async () => {
    const member = await makeUser()
    const stranger = await makeUser()
    await createApiKey(member.id, 'mine')
    await createApiKey(stranger.id, 'theirs')

    const mine = await apiKeysFor(member.id)
    expect(mine.map((one) => one.name)).toEqual(['mine'])
  })

  it('records when a key was last used, so an unused one can be retired', async () => {
    const member = await makeUser()
    const { token, key } = await createApiKey(member.id, 'laptop')
    expect(key.lastUsedAt).toBeNull()

    await actorForToken(token)
    const [after] = await db.select().from(apiKeys).where(eq(apiKeys.id, key.id))
    expect(after?.lastUsedAt).toBeInstanceOf(Date)
  })
})

describe('what a tool may change', () => {
  it('keeps writing out of reach unless a caller asks for it', async () => {
    // /ask runs the app's own model and never passes allowWrites, so this is
    // what stands between a confused sentence and somebody's history.
    const member = await makeUser()
    const show = await makeShow()

    const refused = await runTool(member.id, 'log_night', {
      showId: show.id,
      datePrecision: 'year',
      occurredYear: 2007,
    })
    expect(refused.ok).toBe(false)
    expect(refused.ok === false && refused.error).toMatch(/may only read/i)
    expect(await db.select().from(outings)).toHaveLength(0)
  })

  it('describes only the reading tools by default', () => {
    const reading = toolDescriptions().map((one) => one.function.name)
    const everything = toolDescriptions({ allowWrites: true }).map((one) => one.function.name)

    expect(reading).not.toContain('log_night')
    expect(reading).not.toContain('add_researched_show')
    expect(everything).toContain('log_night')
    expect(reading.length).toBeLessThan(everything.length)
    // Every writing tool is marked, so nothing leaks in by being forgotten.
    const marked = TOOLS.filter((one) => one.writes).map((one) => one.name)
    expect(everything.filter((name) => !reading.includes(name)).sort()).toEqual(marked.sort())
  })

  it('acts as the person whose key it is', async () => {
    const member = await makeUser()
    const stranger = await makeUser()
    const show = await makeShow()

    const written = await runTool(
      member.id,
      'log_night',
      { showId: show.id, datePrecision: 'year', occurredYear: 2007 },
      { allowWrites: true },
    )
    expect(written.ok).toBe(true)

    const [logged] = await db.select().from(outings)
    expect(logged?.createdByUserId).toBe(member.id)
    expect(logged?.createdByUserId).not.toBe(stranger.id)
  })
})

describe('what reaches the browser', () => {
  it('never sends the stored hash back with a new key', async () => {
    // This value crosses to the page. Storing only a hash buys nothing if the
    // hash is then published next to the thing it protects.
    const member = await makeUser()
    const made = await createApiKey(member.id, 'laptop')

    const [stored] = await db.select().from(apiKeys)
    const sent = JSON.stringify(made)
    expect(sent).not.toContain(stored!.tokenHash)
    expect(Object.keys(made.key)).not.toContain('tokenHash')
  })

  it('does not list hashes either', async () => {
    const member = await makeUser()
    await createApiKey(member.id, 'laptop')
    const [stored] = await db.select().from(apiKeys)

    expect(JSON.stringify(await apiKeysFor(member.id))).not.toContain(stored!.tokenHash)
  })
})

describe('what a non-admin key reaches', () => {
  it('can enrich a published show, which is the point of the layer', async () => {
    // Deliberately wider than the website gives a member. Fifteen people
    // filling an otherwise empty catalog is what this exists for, and what
    // makes it safe is that every row says who put it there.
    const member = await makeUser()
    const show = await makeShow({ catalogStatus: 'published' })
    const made = await runTool(
      member.id,
      'add_production',
      { showId: show.id, name: 'Broadway', productionType: 'broadway', openedOn: '2001-04-19' },
      { allowWrites: true },
    )
    expect(made.ok).toBe(true)

    const added = await runTool(
      member.id,
      'add_casting',
      {
        productionId: (made.ok ? (made.data as { id: string }) : { id: '' }).id,
        personName: 'Nathan Lane',
        role: 'Max',
      },
      { allowWrites: true },
    )
    expect(added.ok).toBe(true)
  })

  it('signs every row with who put it there', async () => {
    // The light that stands in for a gate. Without this, a bad run of entries
    // has to be stumbled on one row at a time.
    const member = await makeUser()
    const show = await makeShow({ catalogStatus: 'published' })
    const made = await runTool(
      member.id,
      'add_production',
      { showId: show.id, name: 'Broadway', productionType: 'broadway' },
      { allowWrites: true },
    )
    await runTool(
      member.id,
      'add_casting',
      {
        productionId: (made.ok ? (made.data as { id: string }) : { id: '' }).id,
        personName: 'Nathan Lane',
        role: 'Max',
      },
      { allowWrites: true },
    )

    const [row] = await db.select().from(castings)
    expect(row?.createdByUserId).toBe(member.id)
    expect(row?.source).toBe('research')

    const admin = await makeAdmin()
    const seen = await recentContributions(admin)
    expect(seen[0]?.byName).toBe(member.name)
    expect(seen[0]?.role).toBe('Max')
  })

  it('cannot publish a show, however it arrives', async () => {
    const member = await makeUser()
    const research = JSON.stringify({
      shows: [{ title: 'Something New', type: 'musical' }],
    })
    const added = await runTool(
      member.id,
      'add_researched_show',
      { research },
      { allowWrites: true },
    )
    expect(added.ok).toBe(true)

    const [made] = await db.select().from(shows).where(eq(shows.title, 'Something New'))
    expect(made?.catalogStatus).toBe('pending')
  })

  it('cannot undo somebody else’s contribution', async () => {
    const mine = await makeUser()
    const theirs = await makeUser()
    const show = await makeShow({ catalogStatus: 'published' })
    const made = await runTool(
      mine.id,
      'add_production',
      { showId: show.id, name: 'Broadway', productionType: 'broadway' },
      { allowWrites: true },
    )
    await runTool(
      mine.id,
      'add_casting',
      {
        productionId: (made.ok ? (made.data as { id: string }) : { id: '' }).id,
        personName: 'Nathan Lane',
        role: 'Max',
      },
      { allowWrites: true },
    )
    const [row] = await db.select().from(castings)

    const refused = await runTool(
      theirs.id,
      'remove_casting',
      { castingId: row!.id },
      { allowWrites: true },
    )
    expect(refused.ok).toBe(false)
    expect(await db.select().from(castings)).toHaveLength(1)
  })

  it('keeps the contributions view to administrators', async () => {
    const member = await makeUser()
    await expect(recentContributions(member)).rejects.toThrow()
  })
})
