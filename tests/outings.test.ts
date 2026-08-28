import { beforeEach, describe, expect, it } from 'vitest'

import { libraryForOwner } from '../src/server/library-functions'
import {
  createOutingForUser,
  outingForAttendee,
  outingsForUserAndShow,
} from '../src/server/outing-functions'
import { makeFriendship, makeShow, makeUser, resetDatabase } from './helpers'

beforeEach(resetDatabase)

const log = (showId: string, overrides = {}) => ({
  showId,
  visibility: 'private' as const,
  datePrecision: 'exact' as const,
  occurredOn: '2026-05-18',
  attendeeIds: [] as string[],
  favorite: false,
  reviewVisibility: 'private' as const,
  ...overrides,
})

describe('logging a performance', () => {
  it('records the outing and makes the creator an accepted attendee', async () => {
    const owner = await makeUser()
    const show = await makeShow({ title: 'Hadestown' })
    const { id } = await createOutingForUser(owner.id, log(show.id))
    const outing = await outingForAttendee(owner.id, id)
    expect(outing.showTitle).toBe('Hadestown')
    expect(outing.attendees).toHaveLength(1)
    expect(outing.attendees[0]?.attendanceStatus).toBe('accepted')
  })

  it('marks the show as seen in the creator library', async () => {
    const owner = await makeUser()
    const show = await makeShow()
    await createOutingForUser(owner.id, log(show.id))
    const [entry] = await libraryForOwner(owner.id)
    expect(entry?.status).toBe('seen')
  })

  it('promotes an existing want-to-see entry to seen without losing favorite', async () => {
    const owner = await makeUser()
    const show = await makeShow()
    const { saveEntryForOwner } = await import('../src/server/library-functions')
    await saveEntryForOwner(owner.id, {
      showId: show.id, status: 'want_to_see', favorite: true, visibility: 'friends',
    })
    await createOutingForUser(owner.id, log(show.id, { favorite: false }))
    const [entry] = await libraryForOwner(owner.id)
    expect(entry?.status).toBe('seen')
    expect(entry?.favorite).toBe(true)
  })

  it('supports several logs for the same show', async () => {
    const owner = await makeUser()
    const show = await makeShow()
    await createOutingForUser(owner.id, log(show.id, { occurredOn: '2024-01-01' }))
    await createOutingForUser(owner.id, log(show.id, { occurredOn: '2026-05-18' }))
    expect(await outingsForUserAndShow(owner.id, show.id)).toHaveLength(2)
  })

  it('refuses a show that is not published', async () => {
    const owner = await makeUser()
    const pending = await makeShow({ catalogStatus: 'pending' })
    await expect(createOutingForUser(owner.id, log(pending.id))).rejects.toThrow(
      'Choose a published show from the catalog.',
    )
  })
})

describe('fuzzy dates', () => {
  it('stores an exact date and clears the coarser fields', async () => {
    const owner = await makeUser()
    const show = await makeShow()
    const { id } = await createOutingForUser(owner.id, log(show.id))
    const outing = await outingForAttendee(owner.id, id)
    expect(outing.datePrecision).toBe('exact')
    expect(outing.occurredOn).toBe('2026-05-18')
    expect(outing.occurredYear).toBeNull()
    expect(outing.approximateDate).toBeNull()
  })

  it('stores a month and year without inventing a day', async () => {
    const owner = await makeUser()
    const show = await makeShow()
    const { id } = await createOutingForUser(
      owner.id,
      log(show.id, {
        datePrecision: 'month', occurredOn: undefined, occurredMonth: 5, occurredYear: 2026,
      }),
    )
    const outing = await outingForAttendee(owner.id, id)
    expect(outing.occurredOn).toBeNull()
    expect(outing.occurredMonth).toBe(5)
    expect(outing.occurredYear).toBe(2026)
  })

  it('stores a year alone', async () => {
    const owner = await makeUser()
    const show = await makeShow()
    const { id } = await createOutingForUser(
      owner.id,
      log(show.id, { datePrecision: 'year', occurredOn: undefined, occurredYear: 2007 }),
    )
    const outing = await outingForAttendee(owner.id, id)
    expect(outing.occurredYear).toBe(2007)
    expect(outing.occurredOn).toBeNull()
    expect(outing.occurredMonth).toBeNull()
  })

  it('stores an approximate date as written', async () => {
    const owner = await makeUser()
    const show = await makeShow()
    const { id } = await createOutingForUser(
      owner.id,
      log(show.id, {
        datePrecision: 'approximate', occurredOn: undefined, approximateDate: 'Around 2005',
      }),
    )
    const outing = await outingForAttendee(owner.id, id)
    expect(outing.approximateDate).toBe('Around 2005')
    expect(outing.occurredOn).toBeNull()
  })

  it('stores an unknown date with no placeholder values', async () => {
    const owner = await makeUser()
    const show = await makeShow()
    const { id } = await createOutingForUser(
      owner.id,
      log(show.id, { datePrecision: 'unknown', occurredOn: undefined }),
    )
    const outing = await outingForAttendee(owner.id, id)
    expect(outing.occurredOn).toBeNull()
    expect(outing.occurredMonth).toBeNull()
    expect(outing.occurredYear).toBeNull()
    expect(outing.approximateDate).toBeNull()
  })
})

describe('shared outing authorization', () => {
  it('invites an approved friend as an attendee', async () => {
    const owner = await makeUser()
    const friend = await makeUser()
    await makeFriendship(owner.id, friend.id, 'accepted')
    const show = await makeShow()
    const { id } = await createOutingForUser(owner.id, log(show.id, { attendeeIds: [friend.id] }))
    const outing = await outingForAttendee(owner.id, id)
    expect(outing.attendees).toHaveLength(2)
    const invited = outing.attendees.find((a) => a.userId === friend.id)
    expect(invited?.attendanceStatus).toBe('invited')
  })

  it('refuses to invite someone who is not an approved friend', async () => {
    const owner = await makeUser()
    const stranger = await makeUser()
    const show = await makeShow()
    await expect(
      createOutingForUser(owner.id, log(show.id, { attendeeIds: [stranger.id] })),
    ).rejects.toThrow('You can only invite approved friends to a shared outing.')
  })

  it('refuses to invite a pending friend', async () => {
    const owner = await makeUser()
    const pending = await makeUser()
    await makeFriendship(owner.id, pending.id, 'pending')
    const show = await makeShow()
    await expect(
      createOutingForUser(owner.id, log(show.id, { attendeeIds: [pending.id] })),
    ).rejects.toThrow('You can only invite approved friends to a shared outing.')
  })

  it('refuses a non-attendee reading the outing', async () => {
    const owner = await makeUser()
    const outsider = await makeUser()
    const show = await makeShow()
    const { id } = await createOutingForUser(owner.id, log(show.id))
    await expect(outingForAttendee(outsider.id, id)).rejects.toThrow('Unauthorized')
  })

  it('does not list another user outings', async () => {
    const owner = await makeUser()
    const outsider = await makeUser()
    const show = await makeShow()
    await createOutingForUser(owner.id, log(show.id))
    expect(await outingsForUserAndShow(outsider.id, show.id)).toHaveLength(0)
  })
})

describe('attendee-owned content', () => {
  it('hides another attendee private notes and review', async () => {
    const owner = await makeUser()
    const friend = await makeUser()
    await makeFriendship(owner.id, friend.id, 'accepted')
    const show = await makeShow()
    const { id } = await createOutingForUser(
      owner.id,
      log(show.id, {
        attendeeIds: [friend.id],
        privateNotes: 'Took the kids.',
        review: 'A perfect night.',
        rating: 10,
      }),
    )
    const asFriend = await outingForAttendee(friend.id, id)
    const creatorRow = asFriend.attendees.find((a) => a.userId === owner.id)
    expect(creatorRow?.privateNotes).toBeNull()
    expect(creatorRow?.review).toBeNull()
    // The shared rating stays visible; only the words are withheld for now.
    expect(creatorRow?.rating).toBe(10)
  })

  it('shows an attendee their own private notes', async () => {
    const owner = await makeUser()
    const show = await makeShow()
    const { id } = await createOutingForUser(
      owner.id,
      log(show.id, { privateNotes: 'Took the kids.' }),
    )
    const outing = await outingForAttendee(owner.id, id)
    expect(outing.attendees[0]?.privateNotes).toBe('Took the kids.')
  })
})
