import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { outingAttendees, outings, venues } from '../src/server/db/schema'
import {
  createOutingForUser,
  outingForAttendee,
  updateMyReaction,
  updateOutingFacts,
} from '../src/server/outing-functions'
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

describe('editing the shared facts', () => {
  it('corrects the date and venue', async () => {
    const owner = await makeUser()
    const show = await makeShow()
    const { id } = await createOutingForUser(owner.id, log(show.id))
    await updateOutingFacts(owner.id, {
      outingId: id,
      venue: 'Walter Kerr Theatre',
      city: 'New York',
      datePrecision: 'exact',
      occurredOn: '2026-05-19',
      sharedNotes: 'We were late.',
    })
    const outing = await outingForAttendee(owner.id, id)
    expect(outing.occurredOn).toBe('2026-05-19')
    expect(outing.venue).toBe('Walter Kerr Theatre')
    expect(outing.sharedNotes).toBe('We were late.')
  })

  it('links the venue rather than only storing text', async () => {
    const owner = await makeUser()
    const show = await makeShow()
    const { id } = await createOutingForUser(owner.id, log(show.id))
    await updateOutingFacts(owner.id, {
      outingId: id,
      venue: 'the walter kerr',
      city: 'NYC',
      datePrecision: 'exact',
      occurredOn: '2026-05-18',
    })
    const [row] = await db
      .select({ venueId: outings.venueId })
      .from(outings)
      .where(eq(outings.id, id))
    expect(row?.venueId).not.toBeNull()
    expect(await db.select().from(venues)).toHaveLength(1)
  })

  it('changes the date precision, clearing the fields that no longer apply', async () => {
    const owner = await makeUser()
    const show = await makeShow()
    const { id } = await createOutingForUser(owner.id, log(show.id))
    await updateOutingFacts(owner.id, {
      outingId: id,
      datePrecision: 'year',
      occurredYear: 2007,
    })
    const outing = await outingForAttendee(owner.id, id)
    expect(outing.occurredYear).toBe(2007)
    expect(outing.occurredOn).toBeNull()
  })

  it('refuses an attendee who did not log it', async () => {
    // Shared facts are shared: correcting them for everybody is the logger's call.
    const owner = await makeUser()
    const friend = await makeUser()
    await makeFriendship(owner.id, friend.id, 'accepted')
    const show = await makeShow()
    const { id } = await createOutingForUser(owner.id, log(show.id, { attendeeIds: [friend.id] }))
    await expect(
      updateOutingFacts(friend.id, { outingId: id, datePrecision: 'unknown' }),
    ).rejects.toThrow('Only the person who logged this night')
  })

  it('refuses somebody who was not there at all', async () => {
    const owner = await makeUser()
    const stranger = await makeUser()
    const show = await makeShow()
    const { id } = await createOutingForUser(owner.id, log(show.id))
    await expect(
      updateOutingFacts(stranger.id, { outingId: id, datePrecision: 'unknown' }),
    ).rejects.toThrow('Only the person who logged this night')
  })
})

describe('editing your own reaction', () => {
  it('saves a rating, review, and private note', async () => {
    const owner = await makeUser()
    const show = await makeShow()
    const { id } = await createOutingForUser(owner.id, log(show.id))
    await updateMyReaction(owner.id, {
      outingId: id,
      rating: 9,
      favorite: true,
      review: 'Better than I expected.',
      reviewVisibility: 'public',
      privateNotes: 'Sat in the balcony.',
    })
    const outing = await outingForAttendee(owner.id, id)
    const mine = outing.attendees.find((a) => a.isOwn)
    expect(mine?.rating).toBe(9)
    expect(mine?.review).toBe('Better than I expected.')
    expect(mine?.privateNotes).toBe('Sat in the balcony.')
  })

  it('lets an invited attendee write their own, without touching the logger’s', async () => {
    const owner = await makeUser()
    const friend = await makeUser()
    await makeFriendship(owner.id, friend.id, 'accepted')
    const show = await makeShow()
    const { id } = await createOutingForUser(
      owner.id,
      log(show.id, { attendeeIds: [friend.id], review: 'The logger’s view.' }),
    )
    await updateMyReaction(friend.id, {
      outingId: id,
      rating: 6,
      favorite: false,
      review: 'I liked it less.',
      reviewVisibility: 'friends',
    })
    const asOwner = await outingForAttendee(owner.id, id)
    expect(asOwner.attendees.find((a) => a.isOwn)?.review).toBe('The logger’s view.')
    expect(asOwner.attendees.find((a) => a.userId === friend.id)?.review).toBe('I liked it less.')
  })

  it('accepts the invitation as a side effect of writing something', async () => {
    const owner = await makeUser()
    const friend = await makeUser()
    await makeFriendship(owner.id, friend.id, 'accepted')
    const show = await makeShow()
    const { id } = await createOutingForUser(owner.id, log(show.id, { attendeeIds: [friend.id] }))
    await updateMyReaction(friend.id, {
      outingId: id,
      favorite: false,
      reviewVisibility: 'friends',
    })
    const [row] = await db
      .select({ status: outingAttendees.attendanceStatus })
      .from(outingAttendees)
      .where(eq(outingAttendees.userId, friend.id))
    expect(row?.status).toBe('accepted')
  })

  it('refuses somebody who was not at the performance', async () => {
    const owner = await makeUser()
    const stranger = await makeUser()
    const show = await makeShow()
    const { id } = await createOutingForUser(owner.id, log(show.id))
    await expect(
      updateMyReaction(stranger.id, { outingId: id, favorite: false, reviewVisibility: 'friends' }),
    ).rejects.toThrow('not at this performance')
  })

  it('clears a rating and review when they are removed', async () => {
    const owner = await makeUser()
    const show = await makeShow()
    const { id } = await createOutingForUser(
      owner.id,
      log(show.id, { rating: 10, review: 'Loved it.' }),
    )
    await updateMyReaction(owner.id, { outingId: id, favorite: false, reviewVisibility: 'friends' })
    const mine = (await outingForAttendee(owner.id, id)).attendees.find((a) => a.isOwn)
    expect(mine?.rating).toBeNull()
    expect(mine?.review).toBeNull()
  })
})

describe('a public review reaches an attendee who is not a friend', () => {
  it('shows it where a friends-only one would be withheld', async () => {
    const owner = await makeUser()
    const friend = await makeUser()
    const acquaintance = await makeUser()
    await makeFriendship(owner.id, friend.id, 'accepted')
    await makeFriendship(owner.id, acquaintance.id, 'accepted')
    const show = await makeShow()
    const { id } = await createOutingForUser(
      owner.id,
      log(show.id, { attendeeIds: [friend.id, acquaintance.id] }),
    )
    await updateMyReaction(friend.id, {
      outingId: id,
      favorite: false,
      review: 'Anyone here may read this.',
      reviewVisibility: 'public',
    })
    const asAcquaintance = await outingForAttendee(acquaintance.id, id)
    const theirs = asAcquaintance.attendees.find((a) => a.userId === friend.id)
    expect(theirs?.review).toBe('Anyone here may read this.')
    expect(theirs?.hasWithheldReview).toBe(false)
  })
})
