import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { coverChoices, showImages } from '../src/server/db/schema'
import { canViewImage, showPhotosForViewer } from '../src/server/image-functions'
import { db, makeFriendship, makeShow, makeUser, resetDatabase } from './helpers'

beforeEach(resetDatabase)

let counter = 0
async function photo(
  showId: string,
  uploaderId: string,
  visibility: 'private' | 'friends' | 'public',
  reviewStatus: 'pending' | 'approved' | 'rejected' = 'pending',
) {
  const objectKey = `show-photos/00000000-0000-4000-8000-${`${(counter += 1)}`.padStart(12, '0')}.jpg`
  await db
    .insert(showImages)
    .values({ showId, uploadedByUserId: uploaderId, objectKey, visibility, reviewStatus })
  return objectKey
}

describe('contributed show photos', () => {
  it('keeps a private photo to its uploader, even from friends', async () => {
    const show = await makeShow()
    const owner = await makeUser()
    const friend = await makeUser()
    await makeFriendship(owner.id, friend.id, 'accepted')
    const key = await photo(show.id, owner.id, 'private')
    expect(await canViewImage(owner.id, key)).toBe(true)
    expect(await canViewImage(friend.id, key)).toBe(false)
    expect(await canViewImage(null, key)).toBe(false)
  })

  it('shows a friends photo to approved friends only', async () => {
    const show = await makeShow()
    const owner = await makeUser()
    const friend = await makeUser()
    const pending = await makeUser()
    const stranger = await makeUser()
    await makeFriendship(owner.id, friend.id, 'accepted')
    await makeFriendship(owner.id, pending.id, 'pending')
    const key = await photo(show.id, owner.id, 'friends')
    expect(await canViewImage(friend.id, key)).toBe(true)
    expect(await canViewImage(pending.id, key)).toBe(false)
    expect(await canViewImage(stranger.id, key)).toBe(false)
    expect(await canViewImage(null, key)).toBe(false)
  })

  it('does not make a photo public until it has been reviewed', async () => {
    const show = await makeShow()
    const owner = await makeUser()
    const friend = await makeUser()
    const stranger = await makeUser()
    await makeFriendship(owner.id, friend.id, 'accepted')
    const key = await photo(show.id, owner.id, 'public', 'pending')
    // Offered publicly, so friends see it straight away...
    expect(await canViewImage(friend.id, key)).toBe(true)
    // ...but nobody else does until an administrator has looked at it.
    expect(await canViewImage(stranger.id, key)).toBe(false)
    expect(await canViewImage(null, key)).toBe(false)
  })

  it('shows an approved public photo to everyone, including signed-out visitors', async () => {
    const show = await makeShow()
    const owner = await makeUser()
    const stranger = await makeUser()
    const key = await photo(show.id, owner.id, 'public', 'approved')
    expect(await canViewImage(null, key)).toBe(true)
    expect(await canViewImage(stranger.id, key)).toBe(true)
  })

  it('returns a rejected photo to its uploader alone', async () => {
    const show = await makeShow()
    const owner = await makeUser()
    const friend = await makeUser()
    await makeFriendship(owner.id, friend.id, 'accepted')
    const key = await photo(show.id, owner.id, 'public', 'rejected')
    expect(await canViewImage(owner.id, key)).toBe(true)
    expect(await canViewImage(friend.id, key)).toBe(false)
    expect(await canViewImage(null, key)).toBe(false)
  })

  it('refuses a key no photo row references', async () => {
    const viewer = await makeUser()
    expect(
      await canViewImage(viewer.id, 'show-photos/00000000-0000-4000-8000-999999999999.jpg'),
    ).toBe(false)
  })
})

describe('whose photograph is whose', () => {
  it('marks your own, a friend’s, and a stranger’s apart', async () => {
    // What the gallery sorts by. Not a permission — canViewImage still decides
    // what may be seen at all; this is only how the visible ones are grouped.
    const me = await makeUser()
    const friend = await makeUser({ name: 'Sarah Chen' })
    const stranger = await makeUser({ name: 'Somebody Else' })
    await makeFriendship(me.id, friend.id, 'accepted')
    const show = await makeShow()

    await photo(show.id, me.id, 'private')
    await photo(show.id, friend.id, 'friends')
    await photo(show.id, stranger.id, 'public', 'approved')

    const seen = await showPhotosForViewer(me.id, show.id)
    const mine = seen.find((one) => one.isOwn)
    const theirs = seen.find((one) => one.uploaderName === 'Sarah Chen')
    const other = seen.find((one) => one.uploaderName === 'Somebody Else')

    expect(mine?.fromFriend).toBe(false)
    expect(theirs?.fromFriend).toBe(true)
    // Visible because it is public and approved, but not a friend's.
    expect(other?.fromFriend).toBe(false)
  })

  it('calls nobody a friend when nobody is signed in', async () => {
    const owner = await makeUser()
    const show = await makeShow()
    await photo(show.id, owner.id, 'public', 'approved')

    const seen = await showPhotosForViewer(null, show.id)
    expect(seen).toHaveLength(1)
    expect(seen[0]?.fromFriend).toBe(false)
    expect(seen[0]?.isOwn).toBe(false)
  })
})

describe('what the gallery hands to a page', () => {
  it('leaves out a photograph the reader may not see', async () => {
    // The listing has to apply the same rule `canViewImage` does. Nothing
    // asserted that before: the permission was tested directly and the gallery
    // was tested for how it labels things, so replacing the check inside the
    // listing with `true` broke nothing.
    const owner = await makeUser()
    const stranger = await makeUser()
    const show = await makeShow()
    await photo(show.id, owner.id, 'private')

    expect(await showPhotosForViewer(owner.id, show.id)).toHaveLength(1)
    expect(await showPhotosForViewer(stranger.id, show.id)).toHaveLength(0)
    expect(await showPhotosForViewer(null, show.id)).toHaveLength(0)
  })

  it('leaves out a public photograph still waiting on review, for strangers', async () => {
    const owner = await makeUser()
    const friend = await makeUser()
    const stranger = await makeUser()
    await makeFriendship(owner.id, friend.id, 'accepted')
    const show = await makeShow()
    await photo(show.id, owner.id, 'public', 'pending')

    // Offered publicly reaches approved friends at once, and everyone only
    // after a person has looked.
    expect(await showPhotosForViewer(friend.id, show.id)).toHaveLength(1)
    expect(await showPhotosForViewer(stranger.id, show.id)).toHaveLength(0)
  })

  it('never puts one photograph in two groups', async () => {
    // The filters partition the gallery, so "yours" and "a friend's" must not
    // overlap or the counts beside them stop adding up.
    //
    // Honest note: the `!isOwn` guard that holds this cannot be made to fail
    // today, because `acceptedFriendIdsFor` never includes the reader. This
    // records the intent rather than proving the guard.
    const me = await makeUser()
    const friend = await makeUser()
    await makeFriendship(me.id, friend.id, 'accepted')
    const show = await makeShow()
    await photo(show.id, me.id, 'friends')
    await photo(show.id, friend.id, 'friends')

    const seen = await showPhotosForViewer(me.id, show.id)
    expect(seen.filter((one) => one.isOwn && one.fromFriend)).toHaveLength(0)
    expect(seen.filter((one) => one.isOwn)).toHaveLength(1)
    expect(seen.filter((one) => one.fromFriend)).toHaveLength(1)
  })
})

describe('choosing which photograph stands for a show', () => {
  it('lets a chosen one beat the newest', async () => {
    // Before this the newest simply won, so adding a picture of the interval
    // bar quietly replaced the one somebody had settled on.
    const { applyViewerCovers, chooseCoverPhoto } = await import('../src/server/image-functions')
    const me = await makeUser()
    const show = await makeShow()
    const first = await photo(show.id, me.id, 'private')
    await photo(show.id, me.id, 'private')

    const [before] = await applyViewerCovers(me.id, [{ id: show.id, coverImageKey: null }])
    expect(before?.coverImageKey).not.toBe(first)

    const [row] = await db.select().from(showImages).where(eq(showImages.objectKey, first))
    await chooseCoverPhoto(me.id, row!.id)

    const [after] = await applyViewerCovers(me.id, [{ id: show.id, coverImageKey: null }])
    expect(after?.coverImageKey).toBe(first)
  })

  it('keeps at most one per person per show', async () => {
    const { chooseCoverPhoto } = await import('../src/server/image-functions')
    const me = await makeUser()
    const show = await makeShow()
    const a = await photo(show.id, me.id, 'private')
    const b = await photo(show.id, me.id, 'private')
    const rows = await db.select().from(showImages).where(eq(showImages.showId, show.id))
    const rowA = rows.find((one) => one.objectKey === a)!
    const rowB = rows.find((one) => one.objectKey === b)!

    await chooseCoverPhoto(me.id, rowA.id)
    await chooseCoverPhoto(me.id, rowB.id)

    const chosen = await db.select().from(coverChoices).where(eq(coverChoices.userId, me.id))
    expect(chosen).toHaveLength(1)
    expect(chosen[0]?.imageId).toBe(rowB.id)
  })

  it('choosing the same one again goes back to the newest', async () => {
    const { chooseCoverPhoto } = await import('../src/server/image-functions')
    const me = await makeUser()
    const show = await makeShow()
    const only = await photo(show.id, me.id, 'private')
    const [row] = await db.select().from(showImages).where(eq(showImages.objectKey, only))

    expect((await chooseCoverPhoto(me.id, row!.id)).isCover).toBe(true)
    expect((await chooseCoverPhoto(me.id, row!.id)).isCover).toBe(false)
    expect(await db.select().from(coverChoices).where(eq(coverChoices.userId, me.id))).toHaveLength(
      0,
    )
  })

  it('will not let somebody choose a photograph they cannot see', async () => {
    // The bound is what may be looked at, not who took it. A private one is
    // nobody else's to put on their own shelf.
    const { chooseCoverPhoto } = await import('../src/server/image-functions')
    const owner = await makeUser()
    const stranger = await makeUser()
    const show = await makeShow()
    const key = await photo(show.id, owner.id, 'private')
    const [row] = await db.select().from(showImages).where(eq(showImages.objectKey, key))

    await expect(chooseCoverPhoto(stranger.id, row!.id)).rejects.toThrow(/not one you can see/i)
  })

  it("lets somebody choose a friend's photograph", async () => {
    // The picture worth looking at is often somebody else's. Asking everybody
    // to upload their own copy of it would only make the bucket worse.
    const { applyViewerCovers, chooseCoverPhoto } = await import('../src/server/image-functions')
    const me = await makeUser()
    const friend = await makeUser()
    await makeFriendship(me.id, friend.id, 'accepted')
    const show = await makeShow({ coverImageKey: 'shows/official.jpg' })
    const theirs = await photo(show.id, friend.id, 'friends')
    const [row] = await db.select().from(showImages).where(eq(showImages.objectKey, theirs))

    await chooseCoverPhoto(me.id, row!.id)
    const [mine] = await applyViewerCovers(me.id, [
      { id: show.id, coverImageKey: 'shows/official.jpg' },
    ])
    expect(mine?.coverImageKey).toBe(theirs)

    // And it stays their own affair: the friend still sees the catalog's.
    const [unchanged] = await applyViewerCovers(friend.id, [
      { id: show.id, coverImageKey: 'shows/official.jpg' },
    ])
    expect(unchanged?.coverImageKey).toBe(theirs)
  })

  it('does not change what anybody else sees', async () => {
    const { applyViewerCovers, chooseCoverPhoto } = await import('../src/server/image-functions')
    const me = await makeUser()
    const other = await makeUser()
    const show = await makeShow({ coverImageKey: 'shows/official.jpg' })
    const key = await photo(show.id, me.id, 'private')
    const [row] = await db.select().from(showImages).where(eq(showImages.objectKey, key))
    await chooseCoverPhoto(me.id, row!.id)

    const [theirs] = await applyViewerCovers(other.id, [
      { id: show.id, coverImageKey: 'shows/official.jpg' },
    ])
    expect(theirs?.coverImageKey).toBe('shows/official.jpg')
  })
})

describe('a cover when nobody has chosen one', () => {
  it("falls back to a friend's photograph before the catalog's", async () => {
    // What the reader would have looked at anyway, without asking them to
    // upload their own copy of it first.
    const { applyViewerCovers } = await import('../src/server/image-functions')
    const me = await makeUser()
    const friend = await makeUser()
    await makeFriendship(me.id, friend.id, 'accepted')
    const show = await makeShow({ coverImageKey: 'shows/official.jpg' })
    const theirs = await photo(show.id, friend.id, 'friends')

    const [row] = await applyViewerCovers(me.id, [
      { id: show.id, coverImageKey: 'shows/official.jpg' },
    ])
    expect(row?.coverImageKey).toBe(theirs)
  })

  it('prefers your own over a friend’s', async () => {
    const { applyViewerCovers } = await import('../src/server/image-functions')
    const me = await makeUser()
    const friend = await makeUser()
    await makeFriendship(me.id, friend.id, 'accepted')
    const show = await makeShow({ coverImageKey: 'shows/official.jpg' })
    await photo(show.id, friend.id, 'friends')
    const mine = await photo(show.id, me.id, 'private')

    const [row] = await applyViewerCovers(me.id, [
      { id: show.id, coverImageKey: 'shows/official.jpg' },
    ])
    expect(row?.coverImageKey).toBe(mine)
  })

  it('ignores a photograph the reader may not see', async () => {
    const { applyViewerCovers } = await import('../src/server/image-functions')
    const me = await makeUser()
    const friend = await makeUser()
    const stranger = await makeUser()
    await makeFriendship(me.id, friend.id, 'accepted')
    const show = await makeShow({ coverImageKey: 'shows/official.jpg' })
    await photo(show.id, friend.id, 'private')
    await photo(show.id, stranger.id, 'friends')

    const [row] = await applyViewerCovers(me.id, [
      { id: show.id, coverImageKey: 'shows/official.jpg' },
    ])
    expect(row?.coverImageKey).toBe('shows/official.jpg')
  })

  it('drops a friend’s cover when the friendship ends', async () => {
    // Checked on the way out as well as on the way in, because a choice made
    // while somebody was a friend outlives the friendship otherwise.
    const { applyViewerCovers, chooseCoverPhoto } = await import('../src/server/image-functions')
    const me = await makeUser()
    const friend = await makeUser()
    await makeFriendship(me.id, friend.id, 'accepted')
    const show = await makeShow({ coverImageKey: 'shows/official.jpg' })
    const theirs = await photo(show.id, friend.id, 'friends')
    const [row] = await db.select().from(showImages).where(eq(showImages.objectKey, theirs))
    await chooseCoverPhoto(me.id, row!.id)

    const { friendships } = await import('../src/server/db/schema')
    await db.delete(friendships)

    const [after] = await applyViewerCovers(me.id, [
      { id: show.id, coverImageKey: 'shows/official.jpg' },
    ])
    expect(after?.coverImageKey).toBe('shows/official.jpg')
  })
})

describe('two people, two covers', () => {
  it('shows each of them their own choice', async () => {
    // A choice is a row about a reader, so two readers looking at one show can
    // and should see different pictures.
    const { applyViewerCovers, chooseCoverPhoto } = await import('../src/server/image-functions')
    const one = await makeUser()
    const two = await makeUser()
    await makeFriendship(one.id, two.id, 'accepted')
    const show = await makeShow({ coverImageKey: 'shows/official.jpg' })
    const a = await photo(show.id, one.id, 'friends')
    const b = await photo(show.id, two.id, 'friends')
    const rows = await db.select().from(showImages).where(eq(showImages.showId, show.id))
    const rowA = rows.find((r) => r.objectKey === a)!
    const rowB = rows.find((r) => r.objectKey === b)!

    // Each picks the other's.
    await chooseCoverPhoto(one.id, rowB.id)
    await chooseCoverPhoto(two.id, rowA.id)

    const [forOne] = await applyViewerCovers(one.id, [{ id: show.id, coverImageKey: null }])
    const [forTwo] = await applyViewerCovers(two.id, [{ id: show.id, coverImageKey: null }])
    expect(forOne?.coverImageKey).toBe(b)
    expect(forTwo?.coverImageKey).toBe(a)
  })

  it('never lets a rejected photograph become a cover', async () => {
    // An administrator turned it down. It stays visible to whoever uploaded it
    // and stands for nothing.
    const { applyViewerCovers } = await import('../src/server/image-functions')
    const me = await makeUser()
    const friend = await makeUser()
    await makeFriendship(me.id, friend.id, 'accepted')
    const show = await makeShow({ coverImageKey: 'shows/official.jpg' })
    await photo(show.id, friend.id, 'friends', 'rejected')

    const [row] = await applyViewerCovers(me.id, [
      { id: show.id, coverImageKey: 'shows/official.jpg' },
    ])
    expect(row?.coverImageKey).toBe('shows/official.jpg')
  })
})
