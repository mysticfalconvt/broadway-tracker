import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { lists, outingAttendees, outings, showImages } from '../src/server/db/schema'
import { createListForOwner } from '../src/server/list-functions'
import { libraryForOwner, saveEntryForOwner } from '../src/server/library-functions'
import { createOutingForUser } from '../src/server/outing-functions'
import { db, makeShow, makeUser, resetDatabase } from './helpers'

beforeEach(resetDatabase)

const forEachProfile = (['public', 'friends', 'private'] as const).map((v) => [v] as const)

describe('new content follows the profile setting', () => {
  it.each(forEachProfile)('a library entry inherits %s', async (profileVisibility) => {
    const owner = await makeUser({ profileVisibility })
    const show = await makeShow()
    await saveEntryForOwner(owner.id, { showId: show.id, status: 'seen', favorite: false })
    const [entry] = await libraryForOwner(owner.id)
    expect(entry?.visibility).toBe(profileVisibility)
  })

  it.each(forEachProfile)('a list inherits %s', async (profileVisibility) => {
    const owner = await makeUser({ profileVisibility })
    const { id } = await createListForOwner(owner.id, { title: 'A shelf' })
    const [row] = await db.select().from(lists).where(eq(lists.id, id))
    expect(row?.visibility).toBe(profileVisibility)
  })

  it.each(forEachProfile)('an outing and its review inherit %s', async (profileVisibility) => {
    const owner = await makeUser({ profileVisibility })
    const show = await makeShow()
    const { id } = await createOutingForUser(owner.id, {
      showId: show.id,
      datePrecision: 'year',
      occurredYear: 2026,
      attendeeIds: [],
      favorite: false,
    })
    const [outing] = await db.select().from(outings).where(eq(outings.id, id))
    const [attendance] = await db
      .select()
      .from(outingAttendees)
      .where(eq(outingAttendees.outingId, id))
    expect(outing?.visibility).toBe(profileVisibility)
    expect(attendance?.reviewVisibility).toBe(profileVisibility)
  })

  it('a contributed photo inherits it too', async () => {
    const owner = await makeUser({ profileVisibility: 'public' })
    const show = await makeShow()
    await db.insert(showImages).values({
      showId: show.id,
      uploadedByUserId: owner.id,
      objectKey: 'show-photos/00000000-0000-4000-8000-000000000001.jpg',
      visibility: 'public',
    })
    const [row] = await db.select().from(showImages)
    // Offered publicly still waits for review before it reaches strangers.
    expect(row?.visibility).toBe('public')
    expect(row?.reviewStatus).toBe('pending')
  })
})

describe('an explicit choice always wins', () => {
  it('keeps a private entry private even when the profile is public', async () => {
    const owner = await makeUser({ profileVisibility: 'public' })
    const show = await makeShow()
    await saveEntryForOwner(owner.id, {
      showId: show.id,
      status: 'seen',
      favorite: false,
      visibility: 'private',
    })
    const [entry] = await libraryForOwner(owner.id)
    expect(entry?.visibility).toBe('private')
  })

  it('keeps a public list public even when the profile is private', async () => {
    const owner = await makeUser({ profileVisibility: 'private' })
    const { id } = await createListForOwner(owner.id, { title: 'Open shelf', visibility: 'public' })
    const [row] = await db.select().from(lists).where(eq(lists.id, id))
    expect(row?.visibility).toBe('public')
  })
})

describe('changing the profile does not rewrite what already exists', () => {
  it('leaves earlier content at the level it was saved with', async () => {
    const { user } = await import('../src/server/db/schema')
    const owner = await makeUser({ profileVisibility: 'private' })
    const show = await makeShow()
    await saveEntryForOwner(owner.id, { showId: show.id, status: 'seen', favorite: false })

    await db.update(user).set({ profileVisibility: 'public' }).where(eq(user.id, owner.id))
    const [entry] = await libraryForOwner(owner.id)
    // Somebody opening up their profile must not retroactively publish what
    // they wrote while it was closed.
    expect(entry?.visibility).toBe('private')
  })
})

describe('changing who can see something you made', () => {
  it('changes a list, including its visibility', async () => {
    const { updateOwnedList, listForViewer } = await import('../src/server/list-functions')
    const owner = await makeUser({ profileVisibility: 'private' })
    const { id } = await createListForOwner(owner.id, { title: 'Quiet shelf' })
    await updateOwnedList(owner.id, id, { title: 'Open shelf', visibility: 'public' })
    const list = await listForViewer(null, id)
    expect(list.title).toBe('Open shelf')
    expect(list.visibility).toBe('public')
  })

  it('refuses to let somebody change a list that is not theirs', async () => {
    const { updateOwnedList } = await import('../src/server/list-functions')
    const owner = await makeUser()
    const other = await makeUser()
    const { id } = await createListForOwner(owner.id, { title: 'Mine' })
    await expect(
      updateOwnedList(other.id, id, { title: 'Hijacked', visibility: 'public' }),
    ).rejects.toThrow('List not found')
  })

  it('sends a photograph back for review when it is opened up', async () => {
    const { setShowPhotoVisibility } = await import('../src/server/image-functions')
    const owner = await makeUser()
    const show = await makeShow()
    const [photo] = await db
      .insert(showImages)
      .values({
        showId: show.id,
        uploadedByUserId: owner.id,
        objectKey: 'show-photos/00000000-0000-4000-8000-00000000000a.jpg',
        visibility: 'friends',
        reviewStatus: 'approved',
      })
      .returning()

    await setShowPhotoVisibility(owner.id, photo!.id, 'public')
    const [after] = await db.select().from(showImages).where(eq(showImages.id, photo!.id))
    // What was approved was the photograph at its old setting.
    expect(after?.visibility).toBe('public')
    expect(after?.reviewStatus).toBe('pending')
  })

  it('does not re-review a photograph being made more private', async () => {
    const { setShowPhotoVisibility } = await import('../src/server/image-functions')
    const owner = await makeUser()
    const show = await makeShow()
    const [photo] = await db
      .insert(showImages)
      .values({
        showId: show.id,
        uploadedByUserId: owner.id,
        objectKey: 'show-photos/00000000-0000-4000-8000-00000000000b.jpg',
        visibility: 'public',
        reviewStatus: 'approved',
      })
      .returning()
    await setShowPhotoVisibility(owner.id, photo!.id, 'friends')
    const [after] = await db.select().from(showImages).where(eq(showImages.id, photo!.id))
    expect(after?.reviewStatus).toBe('approved')
  })

  it('refuses to let somebody change another person’s photograph', async () => {
    const { setShowPhotoVisibility } = await import('../src/server/image-functions')
    const owner = await makeUser()
    const other = await makeUser()
    const show = await makeShow()
    const [photo] = await db
      .insert(showImages)
      .values({
        showId: show.id,
        uploadedByUserId: owner.id,
        objectKey: 'show-photos/00000000-0000-4000-8000-00000000000c.jpg',
        visibility: 'friends',
      })
      .returning()
    await expect(setShowPhotoVisibility(other.id, photo!.id, 'public')).rejects.toThrow('Forbidden')
  })

  it('changes a night’s visibility from its details', async () => {
    const { updateOutingFacts } = await import('../src/server/outing-functions')
    const owner = await makeUser({ profileVisibility: 'private' })
    const show = await makeShow()
    const { id } = await createOutingForUser(owner.id, {
      showId: show.id,
      datePrecision: 'year',
      occurredYear: 2026,
      attendeeIds: [],
      favorite: false,
    })
    await updateOutingFacts(owner.id, {
      outingId: id,
      datePrecision: 'year',
      occurredYear: 2026,
      visibility: 'friends',
    })
    const [row] = await db.select().from(outings).where(eq(outings.id, id))
    expect(row?.visibility).toBe('friends')
  })
})
