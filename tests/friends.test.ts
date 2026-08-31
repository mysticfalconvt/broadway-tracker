import { beforeEach, describe, expect, it } from 'vitest'

import {
  areFriends,
  findPersonByHandle,
  friendsForUser,
  removeFriendshipBetween,
  requestFriendship,
  respondToFriendship,
} from '../src/server/friend-functions'
import { db, makeFriendship, makeUser, resetDatabase } from './helpers'
import { friendships } from '../src/server/db/schema'

beforeEach(resetDatabase)

describe('areFriends', () => {
  it('is true for an approved friendship in either argument order', async () => {
    const a = await makeUser()
    const b = await makeUser()
    await makeFriendship(a.id, b.id, 'accepted')
    expect(await areFriends(a.id, b.id)).toBe(true)
    expect(await areFriends(b.id, a.id)).toBe(true)
  })

  it('is false for a pending request', async () => {
    const a = await makeUser()
    const b = await makeUser()
    await makeFriendship(a.id, b.id, 'pending')
    expect(await areFriends(a.id, b.id)).toBe(false)
  })

  it('is false for a blocked relationship', async () => {
    const a = await makeUser()
    const b = await makeUser()
    await makeFriendship(a.id, b.id, 'blocked')
    expect(await areFriends(a.id, b.id)).toBe(false)
  })

  it('is false for unrelated users and for a user with themselves', async () => {
    const a = await makeUser()
    const b = await makeUser()
    expect(await areFriends(a.id, b.id)).toBe(false)
    expect(await areFriends(a.id, a.id)).toBe(false)
  })
})

describe('friend requests', () => {
  it('stores one canonical row regardless of who asks first', async () => {
    const a = await makeUser({ id: 'zzz-later' })
    const b = await makeUser({ id: 'aaa-earlier' })
    await requestFriendship(a.id, b.id)
    const rows = await db.select().from(friendships)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.userOneId).toBe('aaa-earlier')
    expect(rows[0]?.userTwoId).toBe('zzz-later')
    expect(rows[0]?.requestedByUserId).toBe(a.id)
  })

  it('refuses a duplicate request from the other direction', async () => {
    const a = await makeUser()
    const b = await makeUser()
    await requestFriendship(a.id, b.id)
    await expect(requestFriendship(b.id, a.id)).rejects.toThrow('A request already exists.')
    expect(await db.select().from(friendships)).toHaveLength(1)
  })

  it('refuses a request to an existing friend', async () => {
    const a = await makeUser()
    const b = await makeUser()
    await makeFriendship(a.id, b.id, 'accepted')
    await expect(requestFriendship(a.id, b.id)).rejects.toThrow('You are already friends.')
  })

  it('refuses self-friendship and unknown people', async () => {
    const a = await makeUser()
    await expect(requestFriendship(a.id, a.id)).rejects.toThrow('You cannot add yourself.')
    await expect(requestFriendship(a.id, 'nobody')).rejects.toThrow('Person not found.')
  })

  it('starts a request as pending, not accepted', async () => {
    const a = await makeUser()
    const b = await makeUser()
    await requestFriendship(a.id, b.id)
    expect(await areFriends(a.id, b.id)).toBe(false)
  })
})

describe('responding to requests', () => {
  it('lets the recipient accept', async () => {
    const sender = await makeUser()
    const recipient = await makeUser()
    await requestFriendship(sender.id, recipient.id)
    await respondToFriendship(recipient.id, sender.id, true)
    expect(await areFriends(sender.id, recipient.id)).toBe(true)
  })

  it('lets the recipient reject, removing the row', async () => {
    const sender = await makeUser()
    const recipient = await makeUser()
    await requestFriendship(sender.id, recipient.id)
    await respondToFriendship(recipient.id, sender.id, false)
    expect(await db.select().from(friendships)).toHaveLength(0)
    expect(await areFriends(sender.id, recipient.id)).toBe(false)
  })

  it('does not let the sender accept their own request', async () => {
    const sender = await makeUser()
    const recipient = await makeUser()
    await requestFriendship(sender.id, recipient.id)
    await respondToFriendship(sender.id, recipient.id, true)
    expect(await areFriends(sender.id, recipient.id)).toBe(false)
  })

  it('does not let the sender delete the request by rejecting it', async () => {
    const sender = await makeUser()
    const recipient = await makeUser()
    await requestFriendship(sender.id, recipient.id)
    await respondToFriendship(sender.id, recipient.id, false)
    expect(await db.select().from(friendships)).toHaveLength(1)
  })

  it('cannot re-accept an already accepted friendship through a third party', async () => {
    const a = await makeUser()
    const b = await makeUser()
    const outsider = await makeUser()
    await makeFriendship(a.id, b.id, 'accepted')
    await respondToFriendship(outsider.id, a.id, true)
    expect(await areFriends(outsider.id, a.id)).toBe(false)
  })

  it('does not accept a blocked relationship', async () => {
    const a = await makeUser()
    const b = await makeUser()
    await makeFriendship(a.id, b.id, 'blocked', a.id)
    await respondToFriendship(b.id, a.id, true)
    expect(await areFriends(a.id, b.id)).toBe(false)
  })
})

describe('removing friendships', () => {
  it('removes an approved friendship from either side', async () => {
    const a = await makeUser()
    const b = await makeUser()
    await makeFriendship(a.id, b.id, 'accepted')
    await removeFriendshipBetween(b.id, a.id)
    expect(await areFriends(a.id, b.id)).toBe(false)
    expect(await db.select().from(friendships)).toHaveLength(0)
  })

  it('cancels a request the actor sent', async () => {
    const a = await makeUser()
    const b = await makeUser()
    await requestFriendship(a.id, b.id)
    await removeFriendshipBetween(a.id, b.id)
    expect(await db.select().from(friendships)).toHaveLength(0)
  })

  it('leaves unrelated friendships untouched', async () => {
    const a = await makeUser()
    const b = await makeUser()
    const c = await makeUser()
    await makeFriendship(a.id, b.id, 'accepted')
    await removeFriendshipBetween(a.id, c.id)
    expect(await areFriends(a.id, b.id)).toBe(true)
  })
})

describe('friend listing and search', () => {
  it('marks incoming requests and resolves the other person', async () => {
    const me = await makeUser()
    const sender = await makeUser({ name: 'Sender' })
    const target = await makeUser({ name: 'Target' })
    await requestFriendship(sender.id, me.id)
    await requestFriendship(me.id, target.id)
    const rows = await friendsForUser(me.id)
    const incoming = rows.find((row) => row.person.id === sender.id)
    const outgoing = rows.find((row) => row.person.id === target.id)
    expect(incoming?.isIncoming).toBe(true)
    expect(outgoing?.isIncoming).toBe(false)
  })

  it('does not return friendships belonging to other people', async () => {
    const me = await makeUser()
    const a = await makeUser()
    const b = await makeUser()
    await makeFriendship(a.id, b.id, 'accepted')
    expect(await friendsForUser(me.id)).toHaveLength(0)
  })

  it('finds a person by handle but never the searcher', async () => {
    const me = await makeUser({ handle: 'searcher' })
    const other = await makeUser({ handle: 'findme' })
    expect(await findPersonByHandle(me.id, 'findme')).toHaveLength(1)
    expect(await findPersonByHandle(me.id, 'FINDME')).toHaveLength(1)
    expect(await findPersonByHandle(me.id, 'searcher')).toHaveLength(0)
    expect(await findPersonByHandle(me.id, 'nobody')).toHaveLength(0)
    expect(other.handle).toBe('findme')
  })
})

describe('telling somebody a request is waiting', () => {
  it('writes to the person being asked, not the one asking', async () => {
    const asker = await makeUser({ name: 'Sarah Chen', email: 'sarah@example.test' })
    const asked = await makeUser({ name: 'Rob', email: 'rob@example.test' })

    const sent = await requestFriendship(asker.id, asked.id)
    expect(sent?.to).toBe('rob@example.test')
    expect(sent?.subject).toContain('Sarah Chen')
  })

  it('goes out whatever the digest is set to', async () => {
    // The explicit decision: that setting governs the letter the app composes
    // about itself. This is one person asking another a question, and losing it
    // because a monthly summary was switched off would lose something nobody
    // meant to switch off.
    const asker = await makeUser({ name: 'Sarah Chen' })
    const asked = await makeUser({ digestCadence: 'off' })

    expect(await requestFriendship(asker.id, asked.id)).not.toBeNull()
  })

  it('says plainly that nothing else will follow', async () => {
    // A promise the code has to keep: there is no reminder anywhere.
    const asker = await makeUser({ name: 'Sarah Chen' })
    const asked = await makeUser()
    const sent = await requestFriendship(asker.id, asked.id)
    expect(sent?.text).toMatch(/nothing else will be sent/i)
  })

  it('says nothing twice, because a second request is refused', async () => {
    const asker = await makeUser({ name: 'Sarah Chen' })
    const asked = await makeUser()
    await requestFriendship(asker.id, asked.id)
    await expect(requestFriendship(asker.id, asked.id)).rejects.toThrow(/already exists/i)
  })

  it('says nothing when the two are already friends', async () => {
    const asker = await makeUser()
    const asked = await makeUser()
    await makeFriendship(asker.id, asked.id)
    await expect(requestFriendship(asker.id, asked.id)).rejects.toThrow(/already friends/i)
  })

  it('sends no mail for a request that was never recorded', async () => {
    const asker = await makeUser()
    await expect(requestFriendship(asker.id, asker.id)).rejects.toThrow(/cannot add yourself/i)
  })

  it('does not write again when the request is answered', async () => {
    // One email, on arrival, and that is the whole of it.
    const asker = await makeUser({ name: 'Sarah Chen' })
    const asked = await makeUser()
    await requestFriendship(asker.id, asked.id)
    const answered = await respondToFriendship(asked.id, asker.id, true)
    expect(answered).toBeUndefined()
  })
})

describe('two requests arriving at once', () => {
  it('records one and writes one letter', async () => {
    // A double click, or both people asking at the same moment.
    //
    // Honest note: this does not reliably reach the race it is named after.
    // The two calls interleave in whatever order the driver gives them, and in
    // practice the second usually sees the first's row and is turned away by
    // the existence check rather than by the conflict clause. Removing
    // `onConflictDoNothing` does not fail it. It holds the outcome — one row,
    // one letter — not the mechanism underneath.
    const asker = await makeUser({ name: 'Sarah Chen' })
    const asked = await makeUser()

    const both = await Promise.allSettled([
      requestFriendship(asker.id, asked.id),
      requestFriendship(asker.id, asked.id),
    ])
    const sent = both.filter((one) => one.status === 'fulfilled' && one.value !== null)
    expect(sent).toHaveLength(1)
    expect(await db.select().from(friendships)).toHaveLength(1)
  })
})
