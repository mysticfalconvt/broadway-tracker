import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { shows, user } from '../src/server/db/schema'
import { canViewImage } from '../src/server/image-functions'
import { db, makeFriendship, makeShow, makeUser, resetDatabase } from './helpers'

beforeEach(resetDatabase)

const SHOW_KEY = 'shows/0f9c1a2b-3d4e-5f60-8a9b-0c1d2e3f4a5b.png'
const AVATAR_KEY = 'avatars/1a2b3c4d-5e6f-4071-8293-a4b5c6d7e8f9.jpg'

async function giveShowCover(showId: string, key = SHOW_KEY) {
  await db.update(shows).set({ coverImageKey: key }).where(eq(shows.id, showId))
}
async function giveAvatar(userId: string, key = AVATAR_KEY) {
  await db.update(user).set({ image: key }).where(eq(user.id, userId))
}

describe('show cover visibility', () => {
  it('serves cover art for a published show to a signed-out visitor', async () => {
    const show = await makeShow({ catalogStatus: 'published' })
    await giveShowCover(show.id)
    expect(await canViewImage(null, SHOW_KEY)).toBe(true)
  })

  it('withholds cover art for a pending submission', async () => {
    const show = await makeShow({ catalogStatus: 'pending' })
    await giveShowCover(show.id)
    expect(await canViewImage(null, SHOW_KEY)).toBe(false)
    const viewer = await makeUser()
    expect(await canViewImage(viewer.id, SHOW_KEY)).toBe(false)
  })

  it('withholds cover art for a rejected submission', async () => {
    const show = await makeShow({ catalogStatus: 'rejected' })
    await giveShowCover(show.id)
    expect(await canViewImage(null, SHOW_KEY)).toBe(false)
  })

  it('refuses a key no show references', async () => {
    await makeShow({ catalogStatus: 'published' })
    expect(await canViewImage(null, SHOW_KEY)).toBe(false)
  })
})

describe('avatar visibility', () => {
  it('never serves an avatar to a signed-out visitor, so public profiles stay anonymous', async () => {
    const owner = await makeUser({ profileVisibility: 'public' })
    await giveAvatar(owner.id)
    expect(await canViewImage(null, AVATAR_KEY)).toBe(false)
  })

  it('serves an avatar to its owner', async () => {
    const owner = await makeUser()
    await giveAvatar(owner.id)
    expect(await canViewImage(owner.id, AVATAR_KEY)).toBe(true)
  })

  it('serves an avatar to an approved friend', async () => {
    const owner = await makeUser()
    const friend = await makeUser()
    await makeFriendship(owner.id, friend.id, 'accepted')
    await giveAvatar(owner.id)
    expect(await canViewImage(friend.id, AVATAR_KEY)).toBe(true)
  })

  it('withholds an avatar from a pending friend, a blocked user, and a stranger', async () => {
    const owner = await makeUser()
    const pending = await makeUser()
    const blocked = await makeUser()
    const stranger = await makeUser()
    await makeFriendship(owner.id, pending.id, 'pending')
    await makeFriendship(owner.id, blocked.id, 'blocked')
    await giveAvatar(owner.id)
    expect(await canViewImage(pending.id, AVATAR_KEY)).toBe(false)
    expect(await canViewImage(blocked.id, AVATAR_KEY)).toBe(false)
    expect(await canViewImage(stranger.id, AVATAR_KEY)).toBe(false)
  })

  it('refuses a key no account references', async () => {
    const viewer = await makeUser()
    expect(await canViewImage(viewer.id, AVATAR_KEY)).toBe(false)
  })
})

describe('key namespace enforcement', () => {
  it('refuses a key outside the application prefixes even when it exists', async () => {
    const viewer = await makeUser()
    expect(await canViewImage(viewer.id, 'vaultwarden-backups/secrets.png')).toBe(false)
    expect(await canViewImage(viewer.id, 'backups/db.png')).toBe(false)
    expect(await canViewImage(null, '')).toBe(false)
  })

  it('does not let an avatar key be read through the show namespace', async () => {
    const owner = await makeUser()
    const show = await makeShow({ catalogStatus: 'published' })
    await giveAvatar(owner.id)
    await giveShowCover(show.id, AVATAR_KEY)
    // The show row now points at an avatar-prefixed key; the prefix still decides
    // the rule, and the avatar rule refuses a signed-out viewer.
    expect(await canViewImage(null, AVATAR_KEY)).toBe(false)
  })
})
