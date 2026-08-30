import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { user } from '../src/server/db/schema'
import {
  digestFor,
  membersDueADigest,
  sendDueDigests,
  stopDigestsFor,
  touchActivity,
} from '../src/server/digest-functions'
import { createOutingForUser } from '../src/server/outing-functions'
import { createPostForAuthor, publishPost } from '../src/server/post-functions'
import { db, makeFriendship, makeShow, makeUser, resetDatabase } from './helpers'

beforeEach(resetDatabase)

const NOW = new Date('2026-06-01T09:00:00Z')
const daysBefore = (days: number) => new Date(NOW.getTime() - days * 86_400_000)

async function drifted(overrides = {}) {
  const member = await makeUser({ profileVisibility: 'public' })
  await db
    .update(user)
    .set({ emailVerified: true, lastActiveAt: daysBefore(60), ...overrides })
    .where(eq(user.id, member.id))
  return member
}

describe('who is written to', () => {
  it('somebody who has been away longer than their own window', async () => {
    const member = await drifted()
    expect((await membersDueADigest(NOW)).map((m) => m.id)).toEqual([member.id])
  })

  it('nobody who was here this week', async () => {
    // They have already seen all of it. This is the difference between a nudge
    // and a newsletter.
    await drifted({ lastActiveAt: daysBefore(2) })
    expect(await membersDueADigest(NOW)).toHaveLength(0)
  })

  it('nobody who asked not to be', async () => {
    await drifted({ digestCadence: 'off' })
    expect(await membersDueADigest(NOW)).toHaveLength(0)
  })

  it('nobody who has never confirmed their address', async () => {
    await drifted({ emailVerified: false })
    expect(await membersDueADigest(NOW)).toHaveLength(0)
  })

  it('nobody written to within their own window', async () => {
    await drifted({ lastDigestAt: daysBefore(5) })
    expect(await membersDueADigest(NOW)).toHaveLength(0)
  })

  it('somebody weekly who has been away eight days, but not a monthly one', async () => {
    const weekly = await drifted({ digestCadence: 'weekly', lastActiveAt: daysBefore(8) })
    await drifted({ digestCadence: 'monthly', lastActiveAt: daysBefore(8) })
    expect((await membersDueADigest(NOW)).map((m) => m.id)).toEqual([weekly.id])
  })

  it('somebody who has never visited at all', async () => {
    const member = await drifted({ lastActiveAt: null })
    expect((await membersDueADigest(NOW)).map((m) => m.id)).toEqual([member.id])
  })
})

describe('what the letter says', () => {
  it('is empty when there is nothing to say', async () => {
    const member = await drifted()
    const digest = await digestFor(member.id, 'monthly', NOW)
    expect(digest?.isEmpty).toBe(true)
  })

  it('carries an anniversary falling in the window ahead', async () => {
    const member = await drifted()
    const show = await makeShow({ title: 'Hadestown', slug: 'hadestown' })
    await createOutingForUser(member.id, {
      showId: show.id,
      datePrecision: 'exact',
      occurredOn: '2019-06-14',
      venue: 'Walter Kerr Theatre',
      city: 'New York',
      attendeeIds: [],
      favorite: false,
    })
    const digest = await digestFor(member.id, 'monthly', NOW)
    expect(digest?.anniversaries).toHaveLength(1)
    expect(digest?.anniversaries[0]?.yearsAgo).toBe(7)
    expect(digest?.isEmpty).toBe(false)
  })

  it('leaves out an anniversary beyond the window', async () => {
    const member = await drifted()
    const show = await makeShow({ title: 'Six', slug: 'six' })
    await createOutingForUser(member.id, {
      showId: show.id,
      datePrecision: 'exact',
      occurredOn: '2019-09-14',
      attendeeIds: [],
      favorite: false,
    })
    expect((await digestFor(member.id, 'monthly', NOW))?.anniversaries).toHaveLength(0)
  })

  it('carries a piece published since the last letter, and not the reader’s own', async () => {
    const member = await drifted({ lastDigestAt: daysBefore(40) })
    const author = await makeUser({ profileVisibility: 'public' })
    const theirs = await createPostForAuthor(author.id, {
      title: 'The turntable',
      body: 'It turns.',
      visibility: 'public',
    })
    await publishPost({ id: author.id, role: 'member' } as never, theirs.id)
    const mine = await createPostForAuthor(member.id, {
      title: 'My own',
      body: 'Mine.',
      visibility: 'public',
    })
    await publishPost({ id: member.id, role: 'member' } as never, mine.id)

    const digest = await digestFor(member.id, 'monthly', NOW)
    expect(digest?.writing.map((p) => p.title)).toEqual(['The turntable'])
  })

  it('does not carry a piece it has no right to', async () => {
    const member = await drifted({ lastDigestAt: daysBefore(40) })
    const stranger = await makeUser({ profileVisibility: 'public' })
    const piece = await createPostForAuthor(stranger.id, {
      title: 'For friends',
      body: 'Private-ish.',
      visibility: 'friends',
    })
    await publishPost({ id: stranger.id, role: 'member' } as never, piece.id)
    expect((await digestFor(member.id, 'monthly', NOW))?.writing).toHaveLength(0)
  })

  it('carries a friend’s night, and not a stranger’s', async () => {
    const member = await drifted({ lastDigestAt: daysBefore(40) })
    const friend = await makeUser({ profileVisibility: 'public' })
    const stranger = await makeUser({ profileVisibility: 'public' })
    await makeFriendship(member.id, friend.id, 'accepted')
    const show = await makeShow({ title: 'Hadestown', slug: 'hadestown' })
    for (const person of [friend, stranger]) {
      await createOutingForUser(person.id, {
        showId: show.id,
        datePrecision: 'exact',
        occurredOn: '2026-05-18',
        attendeeIds: [],
        favorite: false,
      })
    }
    const digest = await digestFor(member.id, 'monthly', NOW)
    expect(digest?.nights.map((n) => n.friendName)).toEqual([friend.name])
  })
})

describe('sending', () => {
  it('sends nothing, and resets no clock, when there is nothing to say', async () => {
    const member = await drifted()
    const result = await sendDueDigests({ now: NOW })
    expect(result.sent).toHaveLength(0)
    expect(result.skippedEmpty).toHaveLength(1)
    // The clock is untouched, so they are considered again the moment there is
    // something — rather than waiting out another window in silence.
    const [after] = await db.select().from(user).where(eq(user.id, member.id))
    expect(after?.lastDigestAt).toBeNull()
  })

  it('sends when there is, and records that it went', async () => {
    const member = await drifted()
    const show = await makeShow({ title: 'Hadestown', slug: 'hadestown' })
    await createOutingForUser(member.id, {
      showId: show.id,
      datePrecision: 'exact',
      occurredOn: '2019-06-14',
      attendeeIds: [],
      favorite: false,
    })
    const result = await sendDueDigests({ now: NOW })
    expect(result.sent).toEqual([member.email])
    const [after] = await db.select().from(user).where(eq(user.id, member.id))
    expect(after?.lastDigestAt).toEqual(NOW)
  })

  it('assembles without sending or recording, on a dry run', async () => {
    const member = await drifted()
    const show = await makeShow({ title: 'Hadestown', slug: 'hadestown' })
    await createOutingForUser(member.id, {
      showId: show.id,
      datePrecision: 'exact',
      occurredOn: '2019-06-14',
      attendeeIds: [],
      favorite: false,
    })
    const result = await sendDueDigests({ now: NOW, dryRun: true })
    expect(result.sent).toEqual([member.email])
    const [after] = await db.select().from(user).where(eq(user.id, member.id))
    expect(after?.lastDigestAt).toBeNull()
  })
})

describe('stopping them', () => {
  it('takes a token and no password', async () => {
    const member = await drifted()
    const [row] = await db.select().from(user).where(eq(user.id, member.id))
    expect(await stopDigestsFor(row?.digestToken ?? '')).toBe(true)
    const [after] = await db.select().from(user).where(eq(user.id, member.id))
    expect(after?.digestCadence).toBe('off')
  })

  it('does nothing for a token that means nothing', async () => {
    const member = await drifted()
    expect(await stopDigestsFor('00000000-0000-0000-0000-000000000000')).toBe(false)
    const [after] = await db.select().from(user).where(eq(user.id, member.id))
    expect(after?.digestCadence).toBe('monthly')
  })

  it('gives everybody a token of their own', async () => {
    const one = await makeUser()
    const two = await makeUser()
    const rows = await db.select().from(user)
    const tokens = rows.map((r) => r.digestToken)
    expect(new Set(tokens).size).toBe(rows.length)
    expect(one.id).not.toBe(two.id)
  })
})

describe('noticing somebody is here', () => {
  it('records a first visit', async () => {
    const member = await makeUser()
    await touchActivity(member.id, NOW)
    const [after] = await db.select().from(user).where(eq(user.id, member.id))
    expect(after?.lastActiveAt).toEqual(NOW)
  })

  it('does not write again within the hour', async () => {
    // Every page makes this call; a write on each would be a lot of writes to
    // learn something that only needs to be roughly true.
    const member = await makeUser()
    await touchActivity(member.id, NOW)
    const later = new Date(NOW.getTime() + 10 * 60_000)
    await touchActivity(member.id, later)
    const [after] = await db.select().from(user).where(eq(user.id, member.id))
    expect(after?.lastActiveAt).toEqual(NOW)
  })

  it('writes again once the record is stale', async () => {
    const member = await makeUser()
    await touchActivity(member.id, NOW)
    const later = new Date(NOW.getTime() + 2 * 3_600_000)
    await touchActivity(member.id, later)
    const [after] = await db.select().from(user).where(eq(user.id, member.id))
    expect(after?.lastActiveAt).toEqual(later)
  })
})
