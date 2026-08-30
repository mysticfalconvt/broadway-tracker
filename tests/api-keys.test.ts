import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { actorForToken, apiKeysFor, createApiKey, revokeApiKey } from '../src/server/api-keys'
import { apiKeys, outings } from '../src/server/db/schema'
import { TOOLS, runTool, toolDescriptions } from '../src/server/tools'
import { db, makeShow, makeUser, resetDatabase } from './helpers'

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
