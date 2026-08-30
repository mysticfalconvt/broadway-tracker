import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { outingAttendees } from '../src/server/db/schema'
import { acceptedFriendIdsFor } from '../src/server/friend-functions'
import { createOutingForUser, outingForViewer } from '../src/server/outing-functions'
import { db, makeFriendship, makeShow, makeUser, resetDatabase } from './helpers'

beforeEach(resetDatabase)

const log = (showId: string, overrides = {}) => ({
  showId,
  visibility: 'friends' as const,
  datePrecision: 'exact' as const,
  occurredOn: '2026-05-18',
  attendeeIds: [] as string[],
  favorite: false,
  reviewVisibility: 'friends' as const,
  ...overrides,
})

/** Puts a review on an invited attendee, as they would after accepting. */
async function writeReview(
  outingId: string,
  review: string,
  visibility: 'private' | 'friends' = 'friends',
) {
  await db
    .update(outingAttendees)
    .set({ review, reviewVisibility: visibility, rating: 8 })
    .where(eq(outingAttendees.outingId, outingId))
}

describe('acceptedFriendIdsFor', () => {
  it('returns only approved friendships, in either direction', async () => {
    const me = await makeUser()
    const friend = await makeUser()
    const pending = await makeUser()
    const blocked = await makeUser()
    await makeFriendship(friend.id, me.id, 'accepted', friend.id)
    await makeFriendship(me.id, pending.id, 'pending')
    await makeFriendship(me.id, blocked.id, 'blocked')
    const ids = await acceptedFriendIdsFor(me.id)
    expect([...ids]).toEqual([friend.id])
  })

  it('is empty for somebody with no friends', async () => {
    const me = await makeUser()
    expect((await acceptedFriendIdsFor(me.id)).size).toBe(0)
  })
})

describe('what one attendee may read of another', () => {
  it('always shows a reader their own review', async () => {
    const owner = await makeUser()
    const show = await makeShow()
    const { id } = await createOutingForUser(
      owner.id,
      log(show.id, { review: 'Mine to keep.', reviewVisibility: 'private' }),
    )
    const outing = await outingForViewer(owner.id, id)
    expect(outing.attendees[0]?.review).toBe('Mine to keep.')
    expect(outing.attendees[0]?.isOwn).toBe(true)
  })

  it('shows a friends-visible review to an attendee who is an approved friend', async () => {
    const owner = await makeUser()
    const friend = await makeUser()
    await makeFriendship(owner.id, friend.id, 'accepted')
    const show = await makeShow()
    const { id } = await createOutingForUser(
      owner.id,
      log(show.id, { attendeeIds: [friend.id], review: 'A wonderful night.' }),
    )
    const asFriend = await outingForViewer(friend.id, id)
    const theirs = asFriend.attendees.find((a) => a.userId === owner.id)
    expect(theirs?.review).toBe('A wonderful night.')
    expect(theirs?.hasWithheldReview).toBe(false)
  })

  it('withholds a private review even from an approved friend who was there', async () => {
    const owner = await makeUser()
    const friend = await makeUser()
    await makeFriendship(owner.id, friend.id, 'accepted')
    const show = await makeShow()
    const { id } = await createOutingForUser(
      owner.id,
      log(show.id, {
        attendeeIds: [friend.id],
        review: 'Only for me.',
        reviewVisibility: 'private',
      }),
    )
    const asFriend = await outingForViewer(friend.id, id)
    const theirs = asFriend.attendees.find((a) => a.userId === owner.id)
    expect(theirs?.review).toBeNull()
    // The page can say it was kept private rather than implying none exists.
    expect(theirs?.hasWithheldReview).toBe(true)
  })

  it('withholds a friends-visible review from a fellow attendee who is not a friend', async () => {
    // Being at the same performance does not make two people friends.
    const owner = await makeUser()
    const friend = await makeUser()
    const acquaintance = await makeUser()
    await makeFriendship(owner.id, friend.id, 'accepted')
    await makeFriendship(owner.id, acquaintance.id, 'accepted')
    const show = await makeShow()
    const { id } = await createOutingForUser(
      owner.id,
      log(show.id, { attendeeIds: [friend.id, acquaintance.id], review: 'What I thought.' }),
    )
    await writeReview(id, 'Friend’s take.')

    // The acquaintance is a friend of the owner, but not of the other attendee.
    const asAcquaintance = await outingForViewer(acquaintance.id, id)
    const strangerRow = asAcquaintance.attendees.find((a) => a.userId === friend.id)
    expect(strangerRow?.review).toBeNull()
    expect(strangerRow?.hasWithheldReview).toBe(true)
  })

  it('never gives anyone else a private note, friendship or not', async () => {
    const owner = await makeUser()
    const friend = await makeUser()
    await makeFriendship(owner.id, friend.id, 'accepted')
    const show = await makeShow()
    const { id } = await createOutingForUser(
      owner.id,
      log(show.id, { attendeeIds: [friend.id], privateNotes: 'Took the kids.' }),
    )
    const asFriend = await outingForViewer(friend.id, id)
    expect(asFriend.attendees.find((a) => a.userId === owner.id)?.privateNotes).toBeNull()
    expect(JSON.stringify(asFriend)).not.toContain('Took the kids.')
  })

  it('does not report a withheld review when none was written', async () => {
    const owner = await makeUser()
    const friend = await makeUser()
    const show = await makeShow()
    const { id } = await createOutingForUser(owner.id, log(show.id))
    await db.insert(outingAttendees).values({
      outingId: id,
      userId: friend.id,
      invitedByUserId: owner.id,
      attendanceStatus: 'invited',
      reviewVisibility: 'private',
    })
    const outing = await outingForViewer(owner.id, id)
    expect(outing.attendees.find((a) => a.userId === friend.id)?.hasWithheldReview).toBe(false)
  })
})
