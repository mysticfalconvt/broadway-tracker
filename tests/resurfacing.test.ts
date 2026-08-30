import { beforeEach, describe, expect, it } from 'vitest'

import { createOutingForUser, updateMyReaction } from '../src/server/outing-functions'
import { anniversariesFor, recentReviewsFor, sharedHistoryFor } from '../src/server/resurfacing'
import { outingAttendees, outings } from '../src/server/db/schema'
import { db, makeFriendship, makeLibraryEntry, makeShow, makeUser, resetDatabase } from './helpers'

beforeEach(resetDatabase)

const openly = () => makeUser({ profileVisibility: 'public' })

describe('on this day', () => {
  async function nightOn(date: string) {
    const member = await openly()
    const show = await makeShow({ title: 'Hadestown', slug: 'hadestown' })
    await createOutingForUser(member.id, {
      showId: show.id,
      datePrecision: 'exact',
      occurredOn: date,
      venue: 'Walter Kerr Theatre',
      city: 'New York',
      attendeeIds: [],
      favorite: false,
    })
    return member
  }

  it('finds a night from the same date in an earlier year', async () => {
    const member = await nightOn('2019-05-18')
    const found = await anniversariesFor(member.id, new Date('2026-05-18T12:00:00Z'))
    expect(found).toHaveLength(1)
    expect(found[0]?.showTitle).toBe('Hadestown')
    expect(found[0]?.yearsAgo).toBe(7)
    expect(found[0]?.venue).toBe('Walter Kerr Theatre')
  })

  it('says nothing on any other day', async () => {
    const member = await nightOn('2019-05-18')
    expect(await anniversariesFor(member.id, new Date('2026-05-19T12:00:00Z'))).toHaveLength(0)
  })

  it('does not treat tonight as its own anniversary', async () => {
    const member = await nightOn('2026-05-18')
    expect(await anniversariesFor(member.id, new Date('2026-05-18T12:00:00Z'))).toHaveLength(0)
  })

  it('leaves out a night whose date was never certain', async () => {
    // "Some time in 2004" has no anniversary, and inventing one would put words
    // in somebody's memory.
    const member = await openly()
    const show = await makeShow({ title: 'Rent', slug: 'rent' })
    await createOutingForUser(member.id, {
      showId: show.id,
      datePrecision: 'year',
      occurredYear: 2004,
      attendeeIds: [],
      favorite: false,
    })
    expect(await anniversariesFor(member.id, new Date('2026-05-18T12:00:00Z'))).toHaveLength(0)
  })

  it('needs an exact date even if a stored date says otherwise', async () => {
    // Both writers null `occurredOn` for a fuzzy date, so this row cannot be
    // made through the app. Written directly, it pins the rule to the reader
    // rather than to today's writers: an anniversary requires a date somebody
    // actually gave.
    const member = await openly()
    const show = await makeShow({ title: 'Cabaret', slug: 'cabaret' })
    const [outing] = await db
      .insert(outings)
      .values({
        showId: show.id,
        createdByUserId: member.id,
        datePrecision: 'approximate',
        occurredOn: '2019-05-18',
        approximateDate: 'around the spring of 2019',
        visibility: 'public',
      })
      .returning({ id: outings.id })
    await db.insert(outingAttendees).values({
      outingId: outing?.id ?? '',
      userId: member.id,
      attendanceStatus: 'accepted',
    })
    expect(await anniversariesFor(member.id, new Date('2026-05-18T12:00:00Z'))).toHaveLength(0)
  })

  it('is only ever the reader’s own', async () => {
    const member = await nightOn('2019-05-18')
    const other = await openly()
    await makeFriendship(member.id, other.id, 'accepted')
    expect(await anniversariesFor(other.id, new Date('2026-05-18T12:00:00Z'))).toHaveLength(0)
  })
})

describe('who else has seen it', () => {
  async function bothSaw(theirVisibility: 'private' | 'friends' | 'public', friends = true) {
    const me = await openly()
    const them = await openly()
    if (friends) await makeFriendship(me.id, them.id, 'accepted')
    const show = await makeShow({ title: 'Six', slug: 'six' })
    await makeLibraryEntry(me.id, show.id, { status: 'seen', visibility: 'public' })
    await makeLibraryEntry(them.id, show.id, { status: 'seen', visibility: theirVisibility })
    return { me, them }
  }

  it('names a friend who shared it with friends', async () => {
    const { me, them } = await bothSaw('friends')
    const shared = await sharedHistoryFor(me.id)
    expect(shared).toHaveLength(1)
    expect(shared[0]?.personName).toBe(them.name)
    expect(shared[0]?.showTitle).toBe('Six')
  })

  it('names a stranger who shared it publicly', async () => {
    // Public means public. A small archive is worth more when what people put
    // out openly can actually be found.
    const { me, them } = await bothSaw('public', false)
    expect((await sharedHistoryFor(me.id)).map((r) => r.personName)).toEqual([them.name])
  })

  it('says nothing about a stranger who shared only with friends', async () => {
    const { me } = await bothSaw('friends', false)
    expect(await sharedHistoryFor(me.id)).toHaveLength(0)
  })

  it('says nothing about anybody who kept it private', async () => {
    const { me } = await bothSaw('private')
    expect(await sharedHistoryFor(me.id)).toHaveLength(0)
  })

  it('leaves out a show the reader has not seen', async () => {
    const me = await openly()
    const them = await openly()
    await makeFriendship(me.id, them.id, 'accepted')
    const show = await makeShow({ title: 'Wicked', slug: 'wicked' })
    await makeLibraryEntry(them.id, show.id, { status: 'seen', visibility: 'public' })
    expect(await sharedHistoryFor(me.id)).toHaveLength(0)
  })

  it('never counts the reader as somebody else', async () => {
    const me = await openly()
    const show = await makeShow({ title: 'Six', slug: 'six' })
    await makeLibraryEntry(me.id, show.id, { status: 'seen', visibility: 'public' })
    expect(await sharedHistoryFor(me.id)).toHaveLength(0)
  })
})

describe('reviews somebody wrote', () => {
  async function aReview(
    reviewVisibility: 'private' | 'friends' | 'public',
    { friends = true, nightVisibility = 'public' as 'private' | 'friends' | 'public' } = {},
  ) {
    const me = await openly()
    const them = await openly()
    if (friends) await makeFriendship(me.id, them.id, 'accepted')
    const show = await makeShow({ title: 'Hadestown', slug: 'hadestown' })
    const outing = await createOutingForUser(them.id, {
      showId: show.id,
      datePrecision: 'exact',
      occurredOn: '2026-05-18',
      attendeeIds: [],
      favorite: false,
      visibility: nightVisibility,
    })
    await updateMyReaction(them.id, {
      outingId: outing.id,
      favorite: false,
      review: 'The turntable alone was worth it.',
      rating: 9,
      reviewVisibility,
    })
    return { me, them }
  }

  it('surfaces a friend’s review, which lived on one page and nowhere else', async () => {
    const { me, them } = await aReview('friends')
    const found = await recentReviewsFor(me.id)
    expect(found).toHaveLength(1)
    expect(found[0]?.review).toBe('The turntable alone was worth it.')
    expect(found[0]?.personName).toBe(them.name)
    expect(found[0]?.rating).toBe(9)
  })

  it('surfaces a stranger’s public review', async () => {
    const { me } = await aReview('public', { friends: false })
    expect(await recentReviewsFor(me.id)).toHaveLength(1)
  })

  it('withholds a stranger’s friends-only review', async () => {
    const { me } = await aReview('friends', { friends: false })
    expect(await recentReviewsFor(me.id)).toHaveLength(0)
  })

  it('withholds a private review however open the night was', async () => {
    const { me } = await aReview('private')
    expect(await recentReviewsFor(me.id)).toHaveLength(0)
  })

  it('withholds a public review written about a private night', async () => {
    // The night is the thing being described; if it was kept back, so is this.
    const { me } = await aReview('public', { nightVisibility: 'private' })
    expect(await recentReviewsFor(me.id)).toHaveLength(0)
  })

  it('does not read the reader their own review back', async () => {
    const me = await openly()
    const show = await makeShow({ title: 'Six', slug: 'six' })
    const outing = await createOutingForUser(me.id, {
      showId: show.id,
      datePrecision: 'exact',
      occurredOn: '2026-05-18',
      attendeeIds: [],
      favorite: false,
    })
    await updateMyReaction(me.id, {
      outingId: outing.id,
      favorite: false,
      review: 'Mine.',
      reviewVisibility: 'public',
    })
    expect(await recentReviewsFor(me.id)).toHaveLength(0)
  })

  it('ignores an empty review', async () => {
    const me = await openly()
    const them = await openly()
    await makeFriendship(me.id, them.id, 'accepted')
    const show = await makeShow({ title: 'Six', slug: 'six' })
    const outing = await createOutingForUser(them.id, {
      showId: show.id,
      datePrecision: 'exact',
      occurredOn: '2026-05-18',
      attendeeIds: [],
      favorite: false,
    })
    await updateMyReaction(them.id, {
      outingId: outing.id,
      favorite: false,
      review: '   ',
      reviewVisibility: 'public',
    })
    expect(await recentReviewsFor(me.id)).toHaveLength(0)
  })
})
