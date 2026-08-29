import { beforeEach, describe, expect, it } from 'vitest'

import {
  pendingRequestCountFor,
  removeFriendshipBetween,
  requestFriendship,
  respondToFriendship,
} from '../src/server/friend-functions'
import { makeFriendship, makeUser, resetDatabase } from './helpers'

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
