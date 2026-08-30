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

describe('the reader’s own photograph follows them across the app', () => {
  async function photographed() {
    const owner = await makeUser({ profileVisibility: 'public' })
    const show = await makeShow({ title: 'Hadestown', slug: 'hadestown' })
    await db.update(shows).set({ coverImageKey: 'shows/catalog.png' }).where(eq(shows.id, show.id))
    await db.insert(showImages).values({
      showId: show.id,
      uploadedByUserId: owner.id,
      objectKey: 'show-photos/mine.png',
      visibility: 'private',
    })
    return { owner, show }
  }

  it('on the home page, in both the shelf and the recent nights', async () => {
    const { owner, show } = await photographed()
    await saveEntryForOwner(owner.id, { showId: show.id, status: 'want_to_see', favorite: false })
    const { createOutingForUser } = await import('../src/server/outing-functions')
    await createOutingForUser(owner.id, {
      showId: show.id,
      datePrecision: 'exact',
      occurredOn: '2026-05-18',
      attendeeIds: [],
      favorite: false,
    })
    const { homeForUser } = await import('../src/server/profile-functions')
    const home = await homeForUser(owner.id)
    expect(home.recent[0]?.coverImageKey).toBe('show-photos/mine.png')
  })

  it('on a list', async () => {
    const { owner, show } = await photographed()
    const { addShowToOwnedList, createListForOwner, listForViewer } = await import(
      '../src/server/list-functions'
    )
    const list = await createListForOwner(owner.id, { title: 'Best of the year' })
    await addShowToOwnedList(owner.id, list.id, show.id)
    const read = await listForViewer(owner.id, list.id)
    expect(read.items[0]?.coverImageKey).toBe('show-photos/mine.png')
  })

  it('on a venue page', async () => {
    const { owner, show } = await photographed()
    const { findOrCreateProduction } = await import('../src/server/catalog-functions')
    await findOrCreateProduction(
      owner.id,
      show.id,
      'Original Broadway',
      'broadway',
      'Walter Kerr Theatre',
      'New York',
    )
    const { venueWithHistory } = await import('../src/server/venue-functions')
    const { venues } = await import('../src/server/db/schema')
    const [venue] = await db.select().from(venues)
    const page = await venueWithHistory(owner.id, venue?.id ?? '')
    expect(page.staged[0]?.coverImageKey).toBe('show-photos/mine.png')
  })

  it('on a friend’s profile — it is the reader’s lens, not the friend’s', async () => {
    const { owner, show } = await photographed()
    const friend = await makeUser({ profileVisibility: 'public' })
    const { makeFriendship } = await import('./helpers')
    await makeFriendship(owner.id, friend.id, 'accepted')
    // The friend saw it; the reader photographed it.
    const { createOutingForUser } = await import('../src/server/outing-functions')
    await createOutingForUser(friend.id, {
      showId: show.id,
      datePrecision: 'exact',
      occurredOn: '2026-05-18',
      attendeeIds: [],
      favorite: false,
    })
    const { friendProfileForViewer } = await import('../src/server/profile-functions')
    const seen = await friendProfileForViewer(owner.id, friend.handle)
    expect(seen.outings[0]?.coverImageKey).toBe('show-photos/mine.png')
    expect(seen.seenShows[0]?.coverImageKey).toBe('show-photos/mine.png')
  })

  it('but never on somebody else’s screen', async () => {
    const { show } = await photographed()
    const stranger = await makeUser()
    await saveEntryForOwner(stranger.id, {
      showId: show.id,
      status: 'want_to_see',
      favorite: false,
    })
    const { homeForUser } = await import('../src/server/profile-functions')
    const home = await homeForUser(stranger.id)
    expect(home.wantToSee[0]?.coverImageKey).toBe('shows/catalog.png')
  })
})
