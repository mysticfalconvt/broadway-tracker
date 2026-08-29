import { beforeEach, describe, expect, it } from 'vitest'

import { productions, shows, venues } from '../src/server/db/schema'
import {
  importCatalog,
  importSchema,
  normalizeImportPayload,
  previewImport,
} from '../src/server/import-functions'
import { db, makeAdmin, makeUser, resetDatabase } from './helpers'

beforeEach(resetDatabase)

const actor = (u: { id: string; role: string }) => ({ id: u.id, role: u.role }) as never

const hadestown = {
  shows: [
    {
      title: 'Hadestown',
      type: 'musical' as const,
      synopsis: 'A folk opera retelling of Orpheus and Eurydice.',
      productions: [
        {
          name: 'Original Broadway',
          productionType: 'broadway' as const,
          venue: 'Walter Kerr Theatre',
          city: 'New York',
          openedOn: '2019-04-17',
        },
      ],
    },
  ],
}

describe('import is administrator-only', () => {
  it('refuses a member', async () => {
    const member = await makeUser()
    await expect(importCatalog(actor(member), hadestown)).rejects.toThrow('Forbidden')
    await expect(previewImport(actor(member), '{}')).rejects.toThrow('Forbidden')
  })
})

describe('importing', () => {
  it('creates a show, its production, and its venue', async () => {
    const admin = await makeAdmin()
    const result = await importCatalog(actor(admin), hadestown)
    expect(result.shows[0]?.status).toBe('created')
    expect(result.productions).toBe(1)

    const [show] = await db.select().from(shows)
    expect(show?.title).toBe('Hadestown')
    expect(show?.slug).toBe('hadestown')
    // Curated by an administrator, so it skips the review queue.
    expect(show?.catalogStatus).toBe('published')
    expect(show?.reviewedByUserId).toBe(admin.id)

    const [production] = await db.select().from(productions)
    expect(production?.venueId).not.toBeNull()
    expect(await db.select().from(venues)).toHaveLength(1)
  })

  it('is safe to run twice: nothing is duplicated or overwritten', async () => {
    const admin = await makeAdmin()
    await importCatalog(actor(admin), hadestown)
    const second = await importCatalog(actor(admin), hadestown)
    expect(second.shows[0]?.status).toBe('skipped')
    expect(await db.select().from(shows)).toHaveLength(1)
    expect(await db.select().from(productions)).toHaveLength(1)
  })

  it('generates a slug from the title when none is given', async () => {
    const admin = await makeAdmin()
    await importCatalog(actor(admin), {
      shows: [{ title: 'Les Misérables: The Musical!', type: 'musical' }],
    })
    const [show] = await db.select().from(shows)
    expect(show?.slug).toBe('les-miserables-the-musical')
  })

  it('folds venue spellings across separate shows into one venue', async () => {
    const admin = await makeAdmin()
    await importCatalog(actor(admin), {
      shows: [
        {
          title: 'One',
          type: 'play',
          productions: [
            { name: 'A', productionType: 'broadway', venue: 'Walter Kerr Theatre', city: 'NYC' },
          ],
        },
        {
          title: 'Two',
          type: 'play',
          productions: [
            {
              name: 'B',
              productionType: 'broadway',
              venue: 'the walter kerr',
              city: 'New York City',
            },
          ],
        },
      ],
    })
    expect(await db.select().from(venues)).toHaveLength(1)
    expect(await db.select().from(productions)).toHaveLength(2)
  })

  it('accepts venues with no production attached', async () => {
    const admin = await makeAdmin()
    const result = await importCatalog(actor(admin), {
      venues: [{ name: 'Kit Kat Club', city: 'New York' }],
    })
    expect(result.venues).toBe(1)
    expect(await db.select().from(venues)).toHaveLength(1)
  })
})

describe('previewing before writing', () => {
  it('reports what would be created without writing anything', async () => {
    const admin = await makeAdmin()
    const preview = await previewImport(actor(admin), JSON.stringify(hadestown))
    expect(preview.shows[0]).toEqual({ title: 'Hadestown', slug: 'hadestown', exists: false })
    expect(preview.productions).toBe(1)
    expect(await db.select().from(shows)).toHaveLength(0)
  })

  it('flags a show already in the catalog', async () => {
    const admin = await makeAdmin()
    await importCatalog(actor(admin), hadestown)
    const preview = await previewImport(actor(admin), JSON.stringify(hadestown))
    expect(preview.shows[0]?.exists).toBe(true)
  })

  it('explains malformed JSON rather than throwing a parser error at the user', async () => {
    const admin = await makeAdmin()
    await expect(previewImport(actor(admin), '{ nope }')).rejects.toThrow('not valid JSON')
  })

  it('names the field that is wrong', async () => {
    const admin = await makeAdmin()
    const bad = JSON.stringify({ shows: [{ title: 'X', type: 'opera' }] })
    await expect(previewImport(actor(admin), bad)).rejects.toThrow(/shows\.0\.type/)
  })

  it('rejects an invalid date rather than storing nonsense', async () => {
    const admin = await makeAdmin()
    const bad = JSON.stringify({
      shows: [
        {
          title: 'X',
          type: 'play',
          productions: [{ name: 'A', productionType: 'broadway', openedOn: 'last April' }],
        },
      ],
    })
    await expect(previewImport(actor(admin), bad)).rejects.toThrow(/openedOn/)
  })
})

describe('accepting the shapes people actually paste', () => {
  const one = { title: 'Company', type: 'musical' as const }
  const two = { title: 'Follies', type: 'musical' as const }

  it('takes a bare array of shows', async () => {
    const admin = await makeAdmin()
    const preview = await previewImport(actor(admin), JSON.stringify([one, two]))
    expect(preview.shows.map((s) => s.title)).toEqual(['Company', 'Follies'])
  })

  it('takes a single show on its own', async () => {
    const admin = await makeAdmin()
    const preview = await previewImport(actor(admin), JSON.stringify(one))
    expect(preview.shows.map((s) => s.title)).toEqual(['Company'])
  })

  it('takes a single show wrongly wrapped in the shows key', async () => {
    const admin = await makeAdmin()
    const preview = await previewImport(actor(admin), JSON.stringify({ shows: one }))
    expect(preview.shows.map((s) => s.title)).toEqual(['Company'])
  })

  it('still takes the documented shape', async () => {
    const admin = await makeAdmin()
    const preview = await previewImport(actor(admin), JSON.stringify({ shows: [one] }))
    expect(preview.shows.map((s) => s.title)).toEqual(['Company'])
  })

  it('imports a bare array for real, not just in preview', async () => {
    const admin = await makeAdmin()
    const result = await importCatalog(
      actor(admin),
      importSchema.parse(normalizeImportPayload([one, two])),
    )
    expect(result.shows.map((s) => s.status)).toEqual(['created', 'created'])
    expect(await db.select().from(shows)).toHaveLength(2)
  })

  it('still rejects something that is not a catalog at all', async () => {
    const admin = await makeAdmin()
    // Every key is optional, so an unrecognised document would otherwise
    // validate as an empty import and silently do nothing.
    await expect(previewImport(actor(admin), JSON.stringify({ hello: 'world' }))).rejects.toThrow(
      'Nothing to import',
    )
    await expect(previewImport(actor(admin), '{}')).rejects.toThrow('Nothing to import')
    await expect(previewImport(actor(admin), '[]')).rejects.toThrow('Nothing to import')
    await expect(previewImport(actor(admin), '"just a string"')).rejects.toThrow()
  })

  it('takes a bare array of venues, for seeding a list of theatres', async () => {
    const admin = await makeAdmin()
    const theatres = [
      { name: 'Walter Kerr Theatre', city: 'New York' },
      { name: 'Booth Theatre', city: 'New York' },
      { name: 'Music Box Theatre', city: 'New York' },
    ]
    const preview = await previewImport(actor(admin), JSON.stringify(theatres))
    expect(preview.venues).toBe(3)
    expect(preview.shows).toHaveLength(0)

    const result = await importCatalog(
      actor(admin),
      importSchema.parse(normalizeImportPayload(theatres)),
    )
    expect(result.venues).toBe(3)
    expect(await db.select().from(venues)).toHaveLength(3)
  })

  it('takes a single venue on its own', async () => {
    const admin = await makeAdmin()
    const preview = await previewImport(actor(admin), JSON.stringify({ name: 'Kit Kat Club' }))
    expect(preview.venues).toBe(1)
  })

  it('does not mistake a show array for venues', async () => {
    const admin = await makeAdmin()
    const preview = await previewImport(actor(admin), JSON.stringify([one, two]))
    expect(preview.shows).toHaveLength(2)
    expect(preview.venues).toBe(0)
  })

  it('folds duplicate theatres while seeding', async () => {
    const admin = await makeAdmin()
    const result = await importCatalog(
      actor(admin),
      importSchema.parse(
        normalizeImportPayload([
          { name: 'Walter Kerr Theatre', city: 'New York' },
          { name: 'the walter kerr', city: 'NYC' },
        ]),
      ),
    )
    expect(result.venues).toBe(2)
    // Reported twice because two were offered; stored once because they match.
    expect(await db.select().from(venues)).toHaveLength(1)
  })
})

describe('warning about venues that nearly match', () => {
  beforeEach(async () => {
    const seeder = await makeAdmin()
    await importCatalog(actor(seeder), {
      venues: [
        { name: 'Al Hirschfeld Theatre', city: 'New York' },
        { name: 'Booth Theatre', city: 'New York' },
      ],
    })
  })

  it('says nothing when a venue matches exactly', async () => {
    const admin = await makeAdmin()
    const preview = await previewImport(
      actor(admin),
      JSON.stringify([{ name: 'the al hirschfeld theater', city: 'NYC' }]),
    )
    expect(preview.venueWarnings).toHaveLength(0)
  })

  it('flags a typo that would create a second venue', async () => {
    const admin = await makeAdmin()
    const preview = await previewImport(
      actor(admin),
      JSON.stringify([{ name: 'Al Hirschfield Theatre', city: 'New York' }]),
    )
    expect(preview.venueWarnings).toHaveLength(1)
    expect(preview.venueWarnings[0]).toMatchObject({
      given: 'Al Hirschfield Theatre',
      resembles: 'Al Hirschfeld Theatre',
      reason: 'near-miss',
    })
  })

  it('flags a missing city, the commonest way a duplicate slips in', async () => {
    const admin = await makeAdmin()
    const preview = await previewImport(actor(admin), JSON.stringify([{ name: 'Booth Theatre' }]))
    expect(preview.venueWarnings[0]).toMatchObject({
      given: 'Booth Theatre',
      resembles: 'Booth Theatre',
      resemblesCity: 'New York',
      reason: 'no-city',
    })
  })

  it('checks venues named inside a production, not only standalone ones', async () => {
    const admin = await makeAdmin()
    const preview = await previewImport(
      actor(admin),
      JSON.stringify({
        shows: [
          {
            title: 'Something New',
            type: 'musical',
            productions: [
              {
                name: 'Broadway',
                productionType: 'broadway',
                venue: 'Booth Theater',
                city: 'Boston',
              },
            ],
          },
        ],
      }),
    )
    // Same name, different city: ambiguous rather than wrong, so it is raised
    // for a person to judge rather than merged or ignored.
    expect(preview.venueWarnings[0]).toMatchObject({
      given: 'Booth Theater',
      city: 'Boston',
      resembles: 'Booth Theatre',
      resemblesCity: 'New York',
      reason: 'other-city',
    })
  })

  it('stays quiet about a genuinely new theatre', async () => {
    const admin = await makeAdmin()
    const preview = await previewImport(
      actor(admin),
      JSON.stringify([{ name: 'Kit Kat Club', city: 'New York' }]),
    )
    expect(preview.venueWarnings).toHaveLength(0)
  })
})
