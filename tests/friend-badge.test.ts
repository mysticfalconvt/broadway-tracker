import { beforeEach, describe, expect, it } from 'vitest'

import {
  pendingRequestCountFor,
  removeFriendshipBetween,
  requestFriendship,
  respondToFriendship,
} from '../src/server/friend-functions'
import { navBadgesFor } from '../src/server/admin-functions'
import { makeAdmin, makeFriendship, makeShow, makeUser, resetDatabase } from './helpers'

beforeEach(resetDatabase)

describe('pending friend request count', () => {
  it('is zero with nothing waiting', async () => {
    const me = await makeUser()
    expect(await pendingRequestCountFor(me.id)).toBe(0)
  })

  it('counts a request somebody sent me', async () => {
    const me = await makeUser()
    const sender = await makeUser()
    await requestFriendship(sender.id, me.id)
    expect(await pendingRequestCountFor(me.id)).toBe(1)
  })

  it('does not count a request I sent', async () => {
    // Nothing for me to act on, so it must not ask for my attention.
    const me = await makeUser()
    const target = await makeUser()
    await requestFriendship(me.id, target.id)
    expect(await pendingRequestCountFor(me.id)).toBe(0)
    expect(await pendingRequestCountFor(target.id)).toBe(1)
  })

  it('counts several incoming requests', async () => {
    const me = await makeUser()
    for (let i = 0; i < 3; i++) {
      const sender = await makeUser()
      await requestFriendship(sender.id, me.id)
    }
    expect(await pendingRequestCountFor(me.id)).toBe(3)
  })

  it('stops counting once I accept', async () => {
    const me = await makeUser()
    const sender = await makeUser()
    await requestFriendship(sender.id, me.id)
    await respondToFriendship(me.id, sender.id, true)
    expect(await pendingRequestCountFor(me.id)).toBe(0)
  })

  it('stops counting once I reject', async () => {
    const me = await makeUser()
    const sender = await makeUser()
    await requestFriendship(sender.id, me.id)
    await respondToFriendship(me.id, sender.id, false)
    expect(await pendingRequestCountFor(me.id)).toBe(0)
  })

  it('stops counting if the sender cancels', async () => {
    const me = await makeUser()
    const sender = await makeUser()
    await requestFriendship(sender.id, me.id)
    await removeFriendshipBetween(sender.id, me.id)
    expect(await pendingRequestCountFor(me.id)).toBe(0)
  })

  it('ignores accepted and blocked relationships', async () => {
    const me = await makeUser()
    const friend = await makeUser()
    const blocked = await makeUser()
    await makeFriendship(friend.id, me.id, 'accepted', friend.id)
    await makeFriendship(blocked.id, me.id, 'blocked', blocked.id)
    expect(await pendingRequestCountFor(me.id)).toBe(0)
  })

  it("does not count other people's requests", async () => {
    const me = await makeUser()
    const a = await makeUser()
    const b = await makeUser()
    await requestFriendship(a.id, b.id)
    expect(await pendingRequestCountFor(me.id)).toBe(0)
  })
})

describe('the badge the navigation actually receives', () => {
  it('gives a member their waiting requests', async () => {
    const me = await makeUser()
    const sender = await makeUser()
    await requestFriendship(sender.id, me.id)
    const badges = await navBadgesFor(me)
    expect(badges.friendRequests).toBe(1)
    expect(badges.isAdmin).toBe(false)
  })

  it('gives an administrator theirs too', async () => {
    // An administrator is still somebody's friend. The badge was assembled in
    // two branches and the administrator one forgot this entirely.
    const admin = await makeAdmin()
    const sender = await makeUser()
    await requestFriendship(sender.id, admin.id)
    const badges = await navBadgesFor(admin)
    expect(badges.isAdmin).toBe(true)
    expect(badges.friendRequests).toBe(1)
  })

  it('counts an administrator’s queue and their requests separately', async () => {
    const admin = await makeAdmin()
    const sender = await makeUser()
    await requestFriendship(sender.id, admin.id)
    await makeShow({ title: 'Waiting Review', slug: 'waiting-review', catalogStatus: 'pending' })
    const badges = await navBadgesFor(admin)
    expect(badges.waiting).toBe(1)
    expect(badges.friendRequests).toBe(1)
  })

  it('gives a signed-out visitor nothing', async () => {
    const badges = await navBadgesFor(null)
    expect(badges).toEqual({ isAdmin: false, waiting: 0, friendRequests: 0, hasHistory: false })
  })
})

describe('whether the navigation still offers to build a history', () => {
  it('offers it to somebody who has logged nothing', async () => {
    const newcomer = await makeUser()
    expect((await navBadgesFor(newcomer)).hasHistory).toBe(false)
  })

  it('stops offering it once a night is on record', async () => {
    const member = await makeUser()
    const show = await makeShow({ title: 'Hadestown', slug: 'hadestown' })
    const { createOutingForUser } = await import('../src/server/outing-functions')
    await createOutingForUser(member.id, {
      showId: show.id,
      datePrecision: 'exact',
      occurredOn: '2026-05-18',
      attendeeIds: [],
      favorite: false,
    })
    expect((await navBadgesFor(member)).hasHistory).toBe(true)
  })

  it('counts a night somebody else logged you into', async () => {
    // Being added to a friend's outing is having a history, even if you have
    // never used the form yourself.
    const member = await makeUser()
    const friend = await makeUser()
    const { makeFriendship } = await import('./helpers')
    await makeFriendship(member.id, friend.id, 'accepted')
    const show = await makeShow({ title: 'Six', slug: 'six' })
    const { createOutingForUser } = await import('../src/server/outing-functions')
    await createOutingForUser(friend.id, {
      showId: show.id,
      datePrecision: 'exact',
      occurredOn: '2026-05-18',
      attendeeIds: [member.id],
      favorite: false,
    })
    expect((await navBadgesFor(member)).hasHistory).toBe(true)
  })

  it('is not read for a signed-out visitor, whose navigation has no such link', async () => {
    expect((await navBadgesFor(null)).hasHistory).toBe(false)
  })
})
