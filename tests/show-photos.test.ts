import { beforeEach, describe, expect, it } from 'vitest'

import { showImages } from '../src/server/db/schema'
import { canViewImage } from '../src/server/image-functions'
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
  await db.insert(showImages).values({ showId, uploadedByUserId: uploaderId, objectKey, visibility, reviewStatus })
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
