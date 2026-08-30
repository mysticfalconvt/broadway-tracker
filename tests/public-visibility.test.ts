import { beforeEach, describe, expect, it } from 'vitest'

import { saveEntryForOwner } from '../src/server/library-functions'
import { listForViewer } from '../src/server/list-functions'
import { publicProfileById } from '../src/server/profile-functions'
import { makeFriendship, makeList, makeShow, makeUser, resetDatabase } from './helpers'

beforeEach(resetDatabase)

const publicProfile = () => makeUser({ profileVisibility: 'public' })

describe('public lists', () => {
  it('lets a signed-out visitor read a public list', async () => {
    const owner = await makeUser()
    const list = await makeList(owner.id, { visibility: 'public' })
    const result = await listForViewer(null, list.id)
    expect(result.title).toBe(list.title)
    expect(result.canEdit).toBe(false)
  })

  it('never attributes a public list to its owner', async () => {
    const owner = await makeUser({ name: 'Real Name', handle: 'real-handle' })
    const list = await makeList(owner.id, { visibility: 'public' })
    const asVisitor = await listForViewer(null, list.id)
    expect(asVisitor.owner).toBeNull()
    expect(JSON.stringify(asVisitor)).not.toContain('Real Name')
    expect(JSON.stringify(asVisitor)).not.toContain('real-handle')
  })

  it('still names the owner for the owner and for an approved friend', async () => {
    const owner = await makeUser({ name: 'Real Name' })
    const friend = await makeUser()
    await makeFriendship(owner.id, friend.id, 'accepted')
    const list = await makeList(owner.id, { visibility: 'friends' })
    expect((await listForViewer(owner.id, list.id)).owner?.name).toBe('Real Name')
    expect((await listForViewer(friend.id, list.id)).owner?.name).toBe('Real Name')
  })

  it('hides friends and private lists from a signed-out visitor', async () => {
    const owner = await makeUser()
    const friendsList = await makeList(owner.id, { visibility: 'friends' })
    const privateList = await makeList(owner.id, { visibility: 'private' })
    await expect(listForViewer(null, friendsList.id)).rejects.toThrow('List not found')
    await expect(listForViewer(null, privateList.id)).rejects.toThrow('List not found')
  })

  it('lets a signed-in stranger read a public list without befriending anyone', async () => {
    const owner = await makeUser()
    const stranger = await makeUser()
    const list = await makeList(owner.id, { visibility: 'public' })
    expect((await listForViewer(stranger.id, list.id)).canEdit).toBe(false)
  })

  it('keeps the owner able to edit their own public list', async () => {
    const owner = await makeUser()
    const list = await makeList(owner.id, { visibility: 'public' })
    expect((await listForViewer(owner.id, list.id)).canEdit).toBe(true)
  })
})

describe('public profiles', () => {
  it('is anonymous: no name, no handle, no account id beyond the key', async () => {
    const owner = await publicProfile()
    const result = await publicProfileById(owner.id)
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain(owner.name)
    expect(serialized).not.toContain(owner.handle)
    expect(serialized).not.toContain(owner.email)
    expect(result).not.toHaveProperty('user')
  })

  it('refuses a private or friends-only profile', async () => {
    const priv = await makeUser({ profileVisibility: 'private' })
    const friendsOnly = await makeUser({ profileVisibility: 'friends' })
    await expect(publicProfileById(priv.id)).rejects.toThrow('This profile is unavailable.')
    await expect(publicProfileById(friendsOnly.id)).rejects.toThrow('This profile is unavailable.')
  })

  it('shows only public favorites, not friends or private ones', async () => {
    const owner = await publicProfile()
    const open = await makeShow({ title: 'Public favorite' })
    const forFriends = await makeShow({ title: 'Friends favorite' })
    const secret = await makeShow({ title: 'Private favorite' })
    for (const [show, visibility] of [
      [open, 'public'],
      [forFriends, 'friends'],
      [secret, 'private'],
    ] as const) {
      await saveEntryForOwner(owner.id, {
        showId: show.id,
        status: 'seen',
        favorite: true,
        visibility,
      })
    }
    const result = await publicProfileById(owner.id)
    expect(result.favorites.map((f) => f.title)).toEqual(['Public favorite'])
  })

  it('shows only public lists', async () => {
    const owner = await publicProfile()
    await makeList(owner.id, { title: 'Open shelf', visibility: 'public' })
    await makeList(owner.id, { title: 'Friends shelf', visibility: 'friends' })
    await makeList(owner.id, { title: 'Private shelf', visibility: 'private' })
    const result = await publicProfileById(owner.id)
    expect(result.lists.map((l) => l.title)).toEqual(['Open shelf'])
  })

  it('carries a public review along with its favorite', async () => {
    const owner = await publicProfile()
    const show = await makeShow({ title: 'Hadestown' })
    await saveEntryForOwner(owner.id, {
      showId: show.id,
      status: 'seen',
      favorite: true,
      visibility: 'public',
      rating: 10,
      review: 'One of those perfect nights.',
    })
    const [favorite] = (await publicProfileById(owner.id)).favorites
    expect(favorite?.review).toBe('One of those perfect nights.')
    expect(favorite?.rating).toBe(10)
  })

  it('counts seen shows without revealing which ones are private', async () => {
    const owner = await publicProfile()
    const secret = await makeShow({ title: 'Private one' })
    await saveEntryForOwner(owner.id, {
      showId: secret.id,
      status: 'seen',
      favorite: false,
      visibility: 'private',
    })
    const result = await publicProfileById(owner.id)
    expect(result.stats.seen).toBe(1)
    expect(JSON.stringify(result)).not.toContain('Private one')
  })
})
