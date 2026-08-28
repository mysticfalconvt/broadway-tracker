import { beforeEach, describe, expect, it } from 'vitest'

import { libraryForOwner, saveEntryForOwner } from '../src/server/library-functions'
import { makeShow, makeUser, resetDatabase } from './helpers'

beforeEach(resetDatabase)

const entry = (showId: string, overrides = {}) => ({
  showId,
  status: 'want_to_see' as const,
  favorite: false,
  visibility: 'private' as const,
  ...overrides,
})

describe('library status', () => {
  it('adds a published show as want to see', async () => {
    const owner = await makeUser()
    const show = await makeShow({ title: 'Hadestown' })
    await saveEntryForOwner(owner.id, entry(show.id))
    const [row] = await libraryForOwner(owner.id)
    expect(row?.title).toBe('Hadestown')
    expect(row?.status).toBe('want_to_see')
  })

  it('moves an entry from want to see to seen without duplicating it', async () => {
    const owner = await makeUser()
    const show = await makeShow()
    await saveEntryForOwner(owner.id, entry(show.id))
    await saveEntryForOwner(owner.id, entry(show.id, { status: 'seen' }))
    const rows = await libraryForOwner(owner.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.status).toBe('seen')
  })

  it('keeps favorite independent of seen status', async () => {
    const owner = await makeUser()
    const show = await makeShow()
    await saveEntryForOwner(owner.id, entry(show.id, { status: 'want_to_see', favorite: true }))
    const [wanted] = await libraryForOwner(owner.id)
    expect(wanted?.favorite).toBe(true)
    expect(wanted?.status).toBe('want_to_see')

    await saveEntryForOwner(owner.id, entry(show.id, { status: 'seen', favorite: true }))
    const [seen] = await libraryForOwner(owner.id)
    expect(seen?.favorite).toBe(true)
    expect(seen?.status).toBe('seen')
  })

  it('refuses a show that is not published', async () => {
    const owner = await makeUser()
    const pending = await makeShow({ catalogStatus: 'pending' })
    await expect(saveEntryForOwner(owner.id, entry(pending.id))).rejects.toThrow(
      'Choose a published show from the catalog.',
    )
    expect(await libraryForOwner(owner.id)).toHaveLength(0)
  })
})

describe('ratings and reviews', () => {
  it('stores a rating in half-star units', async () => {
    const owner = await makeUser()
    const show = await makeShow()
    await saveEntryForOwner(owner.id, entry(show.id, { status: 'seen', rating: 9 }))
    const [row] = await libraryForOwner(owner.id)
    expect(row?.rating).toBe(9)
  })

  it('leaves an unrated entry null rather than zero', async () => {
    const owner = await makeUser()
    const show = await makeShow()
    await saveEntryForOwner(owner.id, entry(show.id, { status: 'seen' }))
    const [row] = await libraryForOwner(owner.id)
    expect(row?.rating).toBeNull()
  })

  it('clears a rating and review when they are omitted on a later save', async () => {
    const owner = await makeUser()
    const show = await makeShow()
    await saveEntryForOwner(
      owner.id,
      entry(show.id, { status: 'seen', rating: 10, review: 'Perfect night.' }),
    )
    await saveEntryForOwner(owner.id, entry(show.id, { status: 'seen' }))
    const [row] = await libraryForOwner(owner.id)
    expect(row?.rating).toBeNull()
    expect(row?.review).toBeNull()
  })

  it('stores a personal review', async () => {
    const owner = await makeUser()
    const show = await makeShow()
    await saveEntryForOwner(owner.id, entry(show.id, { status: 'seen', review: 'Loved it.' }))
    const [row] = await libraryForOwner(owner.id)
    expect(row?.review).toBe('Loved it.')
  })
})

describe('library privacy and ownership', () => {
  it('defaults an entry to private', async () => {
    const owner = await makeUser()
    const show = await makeShow()
    await saveEntryForOwner(owner.id, entry(show.id))
    const [row] = await libraryForOwner(owner.id)
    expect(row?.visibility).toBe('private')
  })

  it('stores a friends-visible entry when chosen', async () => {
    const owner = await makeUser()
    const show = await makeShow()
    await saveEntryForOwner(owner.id, entry(show.id, { visibility: 'friends' }))
    const [row] = await libraryForOwner(owner.id)
    expect(row?.visibility).toBe('friends')
  })

  it('never returns another user library entries', async () => {
    const owner = await makeUser()
    const other = await makeUser()
    const show = await makeShow()
    await saveEntryForOwner(other.id, entry(show.id, { visibility: 'friends' }))
    expect(await libraryForOwner(owner.id)).toHaveLength(0)
  })

  it('keeps two users entries for the same show separate', async () => {
    const a = await makeUser()
    const b = await makeUser()
    const show = await makeShow()
    await saveEntryForOwner(a.id, entry(show.id, { status: 'seen', rating: 10 }))
    await saveEntryForOwner(b.id, entry(show.id, { status: 'want_to_see' }))
    const [rowA] = await libraryForOwner(a.id)
    const [rowB] = await libraryForOwner(b.id)
    expect(rowA?.rating).toBe(10)
    expect(rowB?.rating).toBeNull()
    expect(rowB?.status).toBe('want_to_see')
  })
})
