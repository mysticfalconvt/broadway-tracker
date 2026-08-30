import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { findOrCreateProduction } from '../src/server/catalog-functions'
import { productions } from '../src/server/db/schema'
import { createOutingForUser } from '../src/server/outing-functions'
import { addCasting } from '../src/server/people-functions'
import { TOOLS, mcpToolDescriptions, runTool, toolDescriptions } from '../src/server/tools'
import { db, makeFriendship, makeShow, makeUser, resetDatabase } from './helpers'

beforeEach(resetDatabase)

async function aCatalog() {
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
  await addCasting(
    member.id,
    {
      productionId: production.id,
      personName: 'Tony Danza',
      role: 'Max Bialystock',
      kind: 'performer',
      isPrincipal: true,
      replacementOrder: 8,
    },
    { source: 'import' },
  )
  return { member, show, productionId: production.id }
}

describe('what the model is told it can do', () => {
  it('describes every tool in a shape a model can be handed', () => {
    const described = toolDescriptions({ allowWrites: true })
    expect(described).toHaveLength(TOOLS.length)
    for (const entry of described) {
      expect(entry.function.name).toMatch(/^[a-z_]+$/)
      expect(entry.function.description.length).toBeGreaterThan(40)
      expect(entry.function.parameters).toHaveProperty('type', 'object')
    }
  })

  it('stays small enough for a local model to choose between', () => {
    // Not arbitrary: a 120B model picking between a handful of obvious
    // functions is reliable, and across thirty it is not. Only the reading set
    // is measured, because that is all the local model is ever offered — an
    // agent holding somebody's key is a better model with a longer attention
    // span, and the writing tools are its problem, not the house model's.
    expect(toolDescriptions()).toHaveLength(10)
    expect(TOOLS.length).toBeLessThanOrEqual(20)
  })
})

describe('calling a tool', () => {
  it('finds a show by part of its title', async () => {
    const { member, show } = await aCatalog()
    const result = await runTool(member.id, 'find_show', { title: 'produc' })
    expect(result.ok).toBe(true)
    expect(result.ok && (result.data as { showId: string }[])[0]?.showId).toBe(show.id)
  })

  it('answers the year question through the tool layer', async () => {
    const { member, show } = await aCatalog()
    const result = await runTool(member.id, 'narrow_the_year', {
      showId: show.id,
      year: 2003,
      personName: 'Tony Danza',
    })
    expect(result.ok).toBe(true)
    expect(result.ok && (result.data as { verdict: string }).verdict).toBe('outside')
  })

  it('refuses a tool that does not exist, without throwing', async () => {
    const member = await makeUser()
    const result = await runTool(member.id, 'delete_everything', {})
    expect(result).toEqual({ ok: false, error: 'There is no tool called delete_everything.' })
  })

  it('explains bad arguments rather than collapsing', async () => {
    // A model calling a tool wrongly is ordinary. It should be told what was
    // wrong and allowed to try again.
    const member = await makeUser()
    const result = await runTool(member.id, 'find_show', { titel: 'oops' })
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.error).toContain('Wrong arguments for find_show')
  })

  it('turns a failure inside a tool into a value', async () => {
    const member = await makeUser()
    const result = await runTool(member.id, 'narrow_the_year', {
      showId: '00000000-0000-0000-0000-000000000000',
    })
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.error).toContain('not in the catalog')
  })
})

describe('a tool sees only what its actor may see', () => {
  it('returns one person’s own nights, never another’s', async () => {
    const { member, show } = await aCatalog()
    const stranger = await makeUser()
    await createOutingForUser(member.id, {
      showId: show.id,
      datePrecision: 'exact',
      occurredOn: '2006-12-20',
      attendeeIds: [],
      favorite: false,
    })

    const mine = await runTool(member.id, 'my_nights_at', { showId: show.id })
    const theirs = await runTool(stranger.id, 'my_nights_at', { showId: show.id })
    expect(mine.ok && (mine.data as unknown[]).length).toBe(1)
    expect(theirs.ok && (theirs.data as unknown[]).length).toBe(0)
  })

  it('lists only accepted friends, not pending requests', async () => {
    const member = await makeUser()
    const accepted = await makeUser()
    const pending = await makeUser()
    await makeFriendship(member.id, accepted.id, 'accepted')
    await makeFriendship(member.id, pending.id, 'pending')

    const result = await runTool(member.id, 'my_friends', {})
    expect(result.ok).toBe(true)
    const names = result.ok ? (result.data as { name: string }[]).map((f) => f.name) : []
    expect(names).toEqual([accepted.name])
  })

  it('finds the nights around a year, which is the "same trip" question', async () => {
    const { member, show } = await aCatalog()
    const other = await makeShow({ title: 'Wicked', slug: 'wicked' })
    await createOutingForUser(member.id, {
      showId: show.id,
      datePrecision: 'exact',
      occurredOn: '2006-12-20',
      attendeeIds: [],
      favorite: false,
    })
    await createOutingForUser(member.id, {
      showId: other.id,
      datePrecision: 'exact',
      occurredOn: '2006-12-22',
      attendeeIds: [],
      favorite: false,
    })
    await createOutingForUser(member.id, {
      showId: other.id,
      datePrecision: 'exact',
      occurredOn: '2019-01-01',
      attendeeIds: [],
      favorite: false,
    })

    const result = await runTool(member.id, 'my_nights_around', { year: 2006 })
    expect(result.ok && (result.data as unknown[]).length).toBe(2)
  })
})

describe('what a tool is allowed to change', () => {
  it('declares every tool that writes, by its name', () => {
    // The guarantee the layer exists for, restated once writing tools arrived:
    // a tool that changes something must say so, because `writes` is what
    // `runTool` checks before letting a caller near it. A new writing tool
    // added without the flag fails here rather than quietly reaching /ask.
    const named = TOOLS.filter((tool) =>
      /^(add|save|create|delete|remove|update|set|publish|merge|join|import|log)_/.test(tool.name),
    )
    expect(named.filter((tool) => !tool.writes)).toEqual([])
  })

  it('offers the app’s own model nothing that writes', () => {
    // /ask calls runTool without allowWrites. This is the same fact from the
    // other side: even the descriptions it is handed contain no writing tool,
    // so it cannot ask for one by guessing a name.
    for (const described of toolDescriptions()) {
      const tool = TOOLS.find((one) => one.name === described.function.name)
      expect(tool?.writes).toBeFalsy()
    }
  })
})

describe('the shape an MCP client is handed', () => {
  it('names the schema inputSchema, which is what MCP validates', () => {
    // Getting this wrong does not fail one tool, it fails the whole list: a
    // client rejects every entry and the server connects with no tools at all.
    for (const tool of mcpToolDescriptions({ allowWrites: true })) {
      expect(tool.name).toMatch(/^[a-z_]+$/)
      expect(tool.description.length).toBeGreaterThan(40)
      expect(tool.inputSchema).toBeTypeOf('object')
      expect(tool.inputSchema).toHaveProperty('type', 'object')
      // No stray OpenAI-shaped keys: those are what a client ignores while
      // complaining that the one it wanted is undefined.
      expect(tool).not.toHaveProperty('parameters')
      expect(tool).not.toHaveProperty('function')
    }
  })

  it('holds the same writing gate as everything else', () => {
    const reading = mcpToolDescriptions().map((one) => one.name)
    expect(reading).not.toContain('log_night')
    expect(mcpToolDescriptions({ allowWrites: true }).map((one) => one.name)).toContain('log_night')
  })
})
