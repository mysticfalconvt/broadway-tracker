import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { outings } from '../src/server/db/schema'
import { libraryForOwner } from '../src/server/library-functions'
import {
  createOutingForUser,
  outingForViewer,
  outingsForUserAndShow,
} from '../src/server/outing-functions'
import { db, makeFriendship, makeShow, makeUser, resetDatabase } from './helpers'

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
    const outing = await outingForViewer(owner.id, id)
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
      showId: show.id,
      status: 'want_to_see',
      favorite: true,
      visibility: 'friends',
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

  it('refuses somebody else’s unreviewed submission', async () => {
    const owner = await makeUser()
    const submitter = await makeUser()
    const pending = await makeShow({
      catalogStatus: 'pending',
      submittedByUserId: submitter.id,
    })
    await expect(createOutingForUser(owner.id, log(pending.id))).rejects.toThrow(
      'Choose a show from the catalog.',
    )
  })

  it('lets the submitter log against their own unreviewed submission', async () => {
    // Waiting for an administrator before you can record last night is how a
    // night ends up never recorded.
    const submitter = await makeUser()
    const pending = await makeShow({
      catalogStatus: 'pending',
      submittedByUserId: submitter.id,
    })
    const outing = await createOutingForUser(submitter.id, log(pending.id))
    expect(outing.id).toBeTruthy()
  })
})

describe('fuzzy dates', () => {
  it('stores an exact date and clears the coarser fields', async () => {
    const owner = await makeUser()
    const show = await makeShow()
    const { id } = await createOutingForUser(owner.id, log(show.id))
    const outing = await outingForViewer(owner.id, id)
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
        datePrecision: 'month',
        occurredOn: undefined,
        occurredMonth: 5,
        occurredYear: 2026,
      }),
    )
    const outing = await outingForViewer(owner.id, id)
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
    const outing = await outingForViewer(owner.id, id)
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
        datePrecision: 'approximate',
        occurredOn: undefined,
        approximateDate: 'Around 2005',
      }),
    )
    const outing = await outingForViewer(owner.id, id)
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
    const outing = await outingForViewer(owner.id, id)
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
    const outing = await outingForViewer(owner.id, id)
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
    await expect(outingForViewer(outsider.id, id)).rejects.toThrow('Unauthorized')
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
    const asFriend = await outingForViewer(friend.id, id)
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
    const outing = await outingForViewer(owner.id, id)
    expect(outing.attendees[0]?.privateNotes).toBe('Took the kids.')
  })
})

describe('two performances on one day', () => {
  it('keeps them as separate nights that can be told apart', async () => {
    // Harry Potter and the Cursed Child in two parts, or any matinee and
    // evening. Two rows on one date used to be indistinguishable.
    const member = await makeUser()
    const show = await makeShow()
    const matinee = await createOutingForUser(member.id, {
      showId: show.id,
      datePrecision: 'exact',
      occurredOn: '2018-07-14',
      curtain: '14:00',
      attendeeIds: [],
      favorite: false,
    })
    const evening = await createOutingForUser(member.id, {
      showId: show.id,
      datePrecision: 'exact',
      occurredOn: '2018-07-14',
      curtain: '19:30',
      attendeeIds: [],
      favorite: false,
    })
    expect(matinee.id).not.toBe(evening.id)

    const { nightsForUser } = await import('../src/server/outing-functions')
    const page = await nightsForUser(member.id, 50, 0)
    expect(page.total).toBe(2)
    // In the order they happened, not the order they were typed.
    expect(page.nights.map((one) => one.curtain)).toEqual(['14:00:00', '19:30:00'])
  })

  it('refuses a time that is not one, at the edge where input arrives', async () => {
    // Through the tool, because that is where validation lives. The core takes
    // data that has already been checked — a `createServerFn` validator on the
    // web path, the tool's own schema on the MCP one — so asserting a readable
    // message against the core would only prove Postgres rejects nonsense.
    const { runTool } = await import('../src/server/tools')
    const member = await makeUser()
    const show = await makeShow()
    const refused = await runTool(
      member.id,
      'log_night',
      {
        showId: show.id,
        datePrecision: 'exact',
        occurredOn: '2018-07-14',
        curtain: 'matinee',
      },
      { allowWrites: true },
    )
    expect(refused.ok).toBe(false)
    // Turned away by the schema, not by Postgres choking on it further in.
    // The database rejects it either way, but its message mentions the column
    // too, so anything looser than this passes without the guard.
    expect(refused.ok === false && refused.error).toMatch(/^Wrong arguments for log_night/)
    expect(await db.select().from(outings)).toHaveLength(0)
  })

  it('drops a time from a date too vague to hang one on', async () => {
    // "Some time in the nineties, at two o'clock" says nothing, and reads as
    // though it says something.
    const member = await makeUser()
    const show = await makeShow()
    const night = await createOutingForUser(member.id, {
      showId: show.id,
      datePrecision: 'year',
      occurredYear: 1995,
      curtain: '14:00',
      attendeeIds: [],
      favorite: false,
    })
    const [row] = await db.select().from(outings).where(eq(outings.id, night.id))
    expect(row?.curtain).toBeNull()
  })
})
