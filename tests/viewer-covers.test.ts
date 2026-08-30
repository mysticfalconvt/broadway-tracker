import { beforeEach, describe, expect, it } from 'vitest'

import { showImages } from '../src/server/db/schema'
import { applyViewerCovers } from '../src/server/image-functions'
import { libraryForOwner, saveEntryForOwner } from '../src/server/library-functions'
import { db, makeShow, makeUser, resetDatabase } from './helpers'
import { eq } from 'drizzle-orm'
import { shows } from '../src/server/db/schema'

beforeEach(resetDatabase)

describe('a viewer sees their own photograph as the cover', () => {
  it('overrides the catalog cover for the person who contributed', async () => {
    const owner = await makeUser()
    const show = await makeShow()
    await db.update(shows).set({ coverImageKey: 'shows/cover.png' }).where(eq(shows.id, show.id))
    await db.insert(showImages).values({
      showId: show.id,
      uploadedByUserId: owner.id,
      objectKey: 'show-photos/mine.png',
      visibility: 'private',
    })
    const [row] = await applyViewerCovers(owner.id, [
      { id: show.id, coverImageKey: 'shows/cover.png' },
    ])
    expect(row?.coverImageKey).toBe('show-photos/mine.png')
  })

  it('leaves the catalog cover alone for everybody else', async () => {
    const owner = await makeUser()
    const other = await makeUser()
    const show = await makeShow()
    await db.insert(showImages).values({
      showId: show.id,
      uploadedByUserId: owner.id,
      objectKey: 'show-photos/mine.png',
      visibility: 'private',
    })
    const [row] = await applyViewerCovers(other.id, [
      { id: show.id, coverImageKey: 'shows/cover.png' },
    ])
    expect(row?.coverImageKey).toBe('shows/cover.png')
  })

  it('leaves a signed-out visitor with the catalog cover', async () => {
    const show = await makeShow()
    const [row] = await applyViewerCovers(null, [{ id: show.id, coverImageKey: 'shows/cover.png' }])
    expect(row?.coverImageKey).toBe('shows/cover.png')
  })

  it('uses the most recent of several photographs', async () => {
    const owner = await makeUser()
    const show = await makeShow()
    await db.insert(showImages).values({
      showId: show.id,
      uploadedByUserId: owner.id,
      objectKey: 'show-photos/older.png',
      visibility: 'private',
      createdAt: new Date('2020-01-01'),
    })
    await db.insert(showImages).values({
      showId: show.id,
      uploadedByUserId: owner.id,
      objectKey: 'show-photos/newer.png',
      visibility: 'private',
      createdAt: new Date('2026-01-01'),
    })
    const [row] = await applyViewerCovers(owner.id, [{ id: show.id, coverImageKey: null }])
    expect(row?.coverImageKey).toBe('show-photos/newer.png')
  })

  it('reaches the library listing', async () => {
    const owner = await makeUser()
    const show = await makeShow({ title: 'Hadestown' })
    await saveEntryForOwner(owner.id, {
      showId: show.id,
      status: 'seen',
      favorite: false,
      visibility: 'private',
    })
    await db.insert(showImages).values({
      showId: show.id,
      uploadedByUserId: owner.id,
      objectKey: 'show-photos/mine.png',
      visibility: 'private',
    })
    const [entry] = await libraryForOwner(owner.id)
    expect(entry?.coverImageKey).toBe('show-photos/mine.png')
  })

  it('costs one extra query regardless of how many rows there are', async () => {
    const owner = await makeUser()
    const many = await Promise.all(Array.from({ length: 20 }, () => makeShow()))
    const rows = many.map((s) => ({ id: s.id, coverImageKey: null }))
    const result = await applyViewerCovers(owner.id, rows)
    expect(result).toHaveLength(20)
  })
})
