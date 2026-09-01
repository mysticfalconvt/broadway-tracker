import { beforeEach, describe, expect, it } from 'vitest'

import { saveEntryForOwner } from '../src/server/library-functions'
import { friendProfileForViewer } from '../src/server/profile-functions'
import {
  makeFriendship,
  makeLibraryEntry,
  makeList,
  makeShow,
  makeUser,
  resetDatabase,
} from './helpers'

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
    const starred = result.seenShows.filter((show) => show.favorite)
    expect(starred.map((show) => show.title)).toEqual(['Shared favorite'])
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
    expect(result.seenShows.filter((show) => show.favorite)).toHaveLength(0)
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

describe('what a friend actually sees', () => {
  async function sharedWith(visibility: 'private' | 'friends' | 'public') {
    const owner = await friendsProfile()
    const friend = await makeUser()
    await makeFriendship(owner.id, friend.id, 'accepted')
    const show = await makeShow({ title: 'Hadestown', slug: 'hadestown' })
    await makeLibraryEntry(owner.id, show.id, {
      status: 'seen',
      favorite: true,
      visibility,
    })
    return { owner, friend, show }
  }

  it('shows a friend what was shared with friends', async () => {
    const { owner, friend } = await sharedWith('friends')
    const profile = await friendProfileForViewer(friend.id, owner.handle)
    // One entry, once. This used to be asserted in two lists at the same time,
    // which is exactly how the same show came to be drawn twice on the page.
    expect(profile.seenShows.map((s) => s.title)).toEqual(['Hadestown'])
  })

  it('shows a friend what was shared publicly', async () => {
    // Public is more open than friends. Hiding it from the owner's own friends
    // is the exact opposite of what they asked for — and it is the default.
    const { owner, friend } = await sharedWith('public')
    const profile = await friendProfileForViewer(friend.id, owner.handle)
    // One entry, once. This used to be asserted in two lists at the same time,
    // which is exactly how the same show came to be drawn twice on the page.
    expect(profile.seenShows.map((s) => s.title)).toEqual(['Hadestown'])
  })

  it('keeps a private entry private, friendship or not', async () => {
    const { owner, friend } = await sharedWith('private')
    const profile = await friendProfileForViewer(friend.id, owner.handle)
    expect(profile.seenShows).toHaveLength(0)
  })

  it('lists shows a friend has seen even when none are favorites', async () => {
    const owner = await friendsProfile()
    const friend = await makeUser()
    await makeFriendship(owner.id, friend.id, 'accepted')
    for (const [title, slug] of [
      ['Hadestown', 'hadestown'],
      ['Six', 'six'],
    ]) {
      const show = await makeShow({ title: title as string, slug: slug as string })
      await makeLibraryEntry(owner.id, show.id, {
        status: 'seen',
        favorite: false,
        visibility: 'public',
      })
    }
    const profile = await friendProfileForViewer(friend.id, owner.handle)
    expect(profile.seenShows.filter((s) => s.favorite)).toHaveLength(0)
    expect(profile.seenShows.map((s) => s.title).sort()).toEqual(['Hadestown', 'Six'])
    expect(profile.stats.seen).toBe(2)
  })

  it('leaves out what the friend only wants to see', async () => {
    const owner = await friendsProfile()
    const friend = await makeUser()
    await makeFriendship(owner.id, friend.id, 'accepted')
    const show = await makeShow({ title: 'Wicked', slug: 'wicked' })
    await makeLibraryEntry(owner.id, show.id, { status: 'want_to_see', visibility: 'public' })
    const profile = await friendProfileForViewer(friend.id, owner.handle)
    expect(profile.seenShows).toHaveLength(0)
  })

  it('shows a friend both a friends-only and a public list', async () => {
    const owner = await friendsProfile()
    const friend = await makeUser()
    await makeFriendship(owner.id, friend.id, 'accepted')
    await makeList(owner.id, { title: 'For the group', visibility: 'friends' })
    await makeList(owner.id, { title: 'Out in the open', visibility: 'public' })
    await makeList(owner.id, { title: 'Just mine', visibility: 'private' })
    const profile = await friendProfileForViewer(friend.id, owner.handle)
    expect(profile.lists.map((l) => l.title).sort()).toEqual(['For the group', 'Out in the open'])
  })
})

describe('what the two of you have in common', () => {
  it('marks the shows the reader has also seen', async () => {
    // The reason for visiting somebody's page: the overlap is what there is to
    // talk about, and what you might have been at together.
    const owner = await friendsProfile()
    const friend = await makeUser()
    await makeFriendship(owner.id, friend.id, 'accepted')
    const both = await makeShow({ title: 'Hadestown', slug: 'hadestown-both' })
    const onlyTheirs = await makeShow({ title: 'Six', slug: 'six-theirs' })
    for (const show of [both, onlyTheirs]) {
      await makeLibraryEntry(owner.id, show.id, {
        status: 'seen',
        favorite: false,
        visibility: 'public',
      })
    }
    await makeLibraryEntry(friend.id, both.id, { status: 'seen', visibility: 'private' })

    const profile = await friendProfileForViewer(friend.id, owner.handle)
    const marked = profile.seenShows.filter((show) => show.bothSaw).map((show) => show.title)
    expect(marked).toEqual(['Hadestown'])
  })

  it('does not count a show the reader only wants to see', async () => {
    const owner = await friendsProfile()
    const friend = await makeUser()
    await makeFriendship(owner.id, friend.id, 'accepted')
    const show = await makeShow()
    await makeLibraryEntry(owner.id, show.id, {
      status: 'seen',
      favorite: false,
      visibility: 'public',
    })
    await makeLibraryEntry(friend.id, show.id, { status: 'want_to_see', visibility: 'private' })

    const profile = await friendProfileForViewer(friend.id, owner.handle)
    expect(profile.seenShows.filter((one) => one.bothSaw)).toHaveLength(0)
  })

  it('marks their nights whose show the reader has also seen', async () => {
    // The likeliest thing anybody came to this page to fix: a night they were
    // at and never said so.
    const owner = await friendsProfile()
    const friend = await makeUser()
    await makeFriendship(owner.id, friend.id, 'accepted')
    const show = await makeShow()
    await makeLibraryEntry(friend.id, show.id, { status: 'seen', visibility: 'private' })
    const { createOutingForUser } = await import('../src/server/outing-functions')
    await createOutingForUser(owner.id, {
      showId: show.id,
      datePrecision: 'exact',
      occurredOn: '2026-06-14',
      visibility: 'friends',
      attendeeIds: [],
      favorite: false,
    })

    const profile = await friendProfileForViewer(friend.id, owner.handle)
    expect(profile.outings).toHaveLength(1)
    expect(profile.outings[0]?.youSawItToo).toBe(true)
    expect(profile.outings[0]?.alreadyThere).toBe(false)
  })
})
