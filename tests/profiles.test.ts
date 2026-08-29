import { beforeEach, describe, expect, it } from 'vitest'

import { saveEntryForOwner } from '../src/server/library-functions'
import { friendProfileForViewer } from '../src/server/profile-functions'
import { makeFriendship, makeList, makeShow, makeUser, resetDatabase } from './helpers'

beforeEach(resetDatabase)

const friendsProfile = () => makeUser({ profileVisibility: 'friends' })

describe('friend profile access', () => {
  it('lets an approved friend read a friends-visible profile', async () => {
    const owner = await friendsProfile()
    const friend = await makeUser()
    await makeFriendship(owner.id, friend.id, 'accepted')
    const result = await friendProfileForViewer(friend.id, owner.handle)
    expect(result.user.handle).toBe(owner.handle)
  })

  it('refuses a stranger', async () => {
    const owner = await friendsProfile()
    const stranger = await makeUser()
    await expect(friendProfileForViewer(stranger.id, owner.handle)).rejects.toThrow(
      'This profile is only available to friends.',
    )
  })

  it('refuses a pending friend', async () => {
    const owner = await friendsProfile()
    const pending = await makeUser()
    await makeFriendship(owner.id, pending.id, 'pending')
    await expect(friendProfileForViewer(pending.id, owner.handle)).rejects.toThrow(
      'This profile is only available to friends.',
    )
  })

  it('refuses a blocked relationship', async () => {
    const owner = await friendsProfile()
    const blocked = await makeUser()
    await makeFriendship(owner.id, blocked.id, 'blocked')
    await expect(friendProfileForViewer(blocked.id, owner.handle)).rejects.toThrow(
      'This profile is only available to friends.',
    )
  })

  it('refuses a private profile even to an approved friend', async () => {
    const owner = await makeUser({ profileVisibility: 'private' })
    const friend = await makeUser()
    await makeFriendship(owner.id, friend.id, 'accepted')
    // Still refused; the wording now says why rather than implying it is missing.
    await expect(friendProfileForViewer(friend.id, owner.handle)).rejects.toThrow(
      'keeps their profile to themselves',
    )
  })

  it('reports an unknown handle without confirming anything', async () => {
    const viewer = await makeUser()
    await expect(friendProfileForViewer(viewer.id, 'nobody')).rejects.toThrow(
      'This profile is unavailable.',
    )
  })

  it('matches a handle case-insensitively', async () => {
    const owner = await friendsProfile()
    const friend = await makeUser()
    await makeFriendship(owner.id, friend.id, 'accepted')
    const result = await friendProfileForViewer(friend.id, owner.handle.toUpperCase())
    expect(result.user.handle).toBe(owner.handle)
  })
})

describe('friend profile content filtering', () => {
  it('shows only friends-visible favorites', async () => {
    const owner = await friendsProfile()
    const friend = await makeUser()
    await makeFriendship(owner.id, friend.id, 'accepted')
    const shared = await makeShow({ title: 'Shared favorite' })
    const secret = await makeShow({ title: 'Private favorite' })
    await saveEntryForOwner(owner.id, {
      showId: shared.id,
      status: 'seen',
      favorite: true,
      visibility: 'friends',
    })
    await saveEntryForOwner(owner.id, {
      showId: secret.id,
      status: 'seen',
      favorite: true,
      visibility: 'private',
    })
    const result = await friendProfileForViewer(friend.id, owner.handle)
    expect(result.favorites.map((show) => show.title)).toEqual(['Shared favorite'])
  })

  it('omits non-favorite entries from favorites', async () => {
    const owner = await friendsProfile()
    const friend = await makeUser()
    await makeFriendship(owner.id, friend.id, 'accepted')
    const show = await makeShow()
    await saveEntryForOwner(owner.id, {
      showId: show.id,
      status: 'seen',
      favorite: false,
      visibility: 'friends',
    })
    const result = await friendProfileForViewer(friend.id, owner.handle)
    expect(result.favorites).toHaveLength(0)
  })

  it('shows only friends-visible lists', async () => {
    const owner = await friendsProfile()
    const friend = await makeUser()
    await makeFriendship(owner.id, friend.id, 'accepted')
    await makeList(owner.id, { title: 'Shared shelf', visibility: 'friends' })
    await makeList(owner.id, { title: 'Private shelf', visibility: 'private' })
    const result = await friendProfileForViewer(friend.id, owner.handle)
    expect(result.lists.map((list) => list.title)).toEqual(['Shared shelf'])
  })

  it('counts seen shows regardless of entry visibility', async () => {
    const owner = await friendsProfile()
    const friend = await makeUser()
    await makeFriendship(owner.id, friend.id, 'accepted')
    const a = await makeShow()
    const b = await makeShow()
    await saveEntryForOwner(owner.id, {
      showId: a.id,
      status: 'seen',
      favorite: false,
      visibility: 'friends',
    })
    await saveEntryForOwner(owner.id, {
      showId: b.id,
      status: 'want_to_see',
      favorite: false,
      visibility: 'friends',
    })
    const result = await friendProfileForViewer(friend.id, owner.handle)
    expect(result.stats.seen).toBe(1)
  })
})

describe('a friend profile is reachable from the friends list', () => {
  it('opens for an approved friend whose profile is friends-visible', async () => {
    const owner = await makeUser({ profileVisibility: 'friends' })
    const friend = await makeUser()
    await makeFriendship(owner.id, friend.id, 'accepted')
    const result = await friendProfileForViewer(friend.id, owner.handle)
    expect(result.user.handle).toBe(owner.handle)
  })

  it('opens for an approved friend whose profile is public', async () => {
    // Making a profile more open must not make it invisible to your own friends.
    const owner = await makeUser({ profileVisibility: 'public' })
    const friend = await makeUser()
    await makeFriendship(owner.id, friend.id, 'accepted')
    const result = await friendProfileForViewer(friend.id, owner.handle)
    expect(result.user.handle).toBe(owner.handle)
  })

  it('tells an approved friend plainly when a profile is kept private', async () => {
    const owner = await makeUser({ profileVisibility: 'private' })
    const friend = await makeUser()
    await makeFriendship(owner.id, friend.id, 'accepted')
    await expect(friendProfileForViewer(friend.id, owner.handle)).rejects.toThrow(
      'keeps their profile to themselves',
    )
  })

  it('still refuses somebody who is not a friend, whatever the setting', async () => {
    for (const visibility of ['private', 'friends', 'public'] as const) {
      const owner = await makeUser({ profileVisibility: visibility })
      const stranger = await makeUser()
      await expect(friendProfileForViewer(stranger.id, owner.handle)).rejects.toThrow(
        'only available to friends',
      )
    }
  })
})
