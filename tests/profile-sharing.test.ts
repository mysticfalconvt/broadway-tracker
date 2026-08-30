import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { libraryEntries, lists, outingAttendees, outings, user } from '../src/server/db/schema'
import { createOutingForUser } from '../src/server/outing-functions'
import { applyProfileVisibility, contentFollowingProfile } from '../src/server/visibility'
import { db, makeLibraryEntry, makeList, makeShow, makeUser, resetDatabase } from './helpers'

beforeEach(resetDatabase)

async function somebodyWhoShares() {
  const member = await makeUser({ profileVisibility: 'public' })
  const show = await makeShow({ title: 'Hadestown', slug: 'hadestown' })
  await createOutingForUser(member.id, {
    showId: show.id,
    datePrecision: 'exact',
    occurredOn: '2026-05-18',
    attendeeIds: [],
    favorite: false,
    review: 'Wonderful.',
  })
  await makeList(member.id, { title: 'Best of the year', visibility: 'public' })
  return { member, show }
}

describe('the profile setting governs what follows it', () => {
  it('counts what would move before anything does', async () => {
    const { member } = await somebodyWhoShares()
    const impact = await contentFollowingProfile(member.id)
    expect(impact.shows).toBe(1)
    expect(impact.lists).toBe(1)
    expect(impact.outings).toBe(1)
    expect(impact.reviews).toBe(1)
    expect(impact.total).toBe(4)
  })

  it('takes everything with it when somebody closes up', async () => {
    const { member } = await somebodyWhoShares()
    const result = await applyProfileVisibility(member.id, 'private')
    expect(result.moved.total).toBe(4)

    const [profile] = await db.select().from(user).where(eq(user.id, member.id))
    expect(profile?.profileVisibility).toBe('private')
    expect((await db.select().from(libraryEntries))[0]?.visibility).toBe('private')
    expect((await db.select().from(lists))[0]?.visibility).toBe('private')
    expect((await db.select().from(outings))[0]?.visibility).toBe('private')
    expect((await db.select().from(outingAttendees))[0]?.reviewVisibility).toBe('private')
  })

  it('leaves alone anything the person decided about themselves', async () => {
    const member = await makeUser({ profileVisibility: 'public' })
    const show = await makeShow({ title: 'Six', slug: 'six' })
    // Deliberately kept back while everything else is open.
    await makeLibraryEntry(member.id, show.id, { status: 'seen', visibility: 'private' })
    const other = await makeShow({ title: 'Wicked', slug: 'wicked' })
    await makeLibraryEntry(member.id, other.id, { status: 'seen', visibility: 'public' })

    await applyProfileVisibility(member.id, 'friends')

    const rows = await db.select().from(libraryEntries).where(eq(libraryEntries.userId, member.id))
    const kept = rows.find((r) => r.showId === show.id)
    const followed = rows.find((r) => r.showId === other.id)
    expect(kept?.visibility).toBe('private')
    expect(followed?.visibility).toBe('friends')
  })

  it('opens everything back up again', async () => {
    const { member } = await somebodyWhoShares()
    await applyProfileVisibility(member.id, 'private')
    const back = await applyProfileVisibility(member.id, 'public')
    expect(back.moved.total).toBe(4)
    expect((await db.select().from(outings))[0]?.visibility).toBe('public')
  })

  it('does nothing when the setting has not changed', async () => {
    const { member } = await somebodyWhoShares()
    const result = await applyProfileVisibility(member.id, 'public')
    expect(result.moved.total).toBe(0)
    expect((await db.select().from(outings))[0]?.visibility).toBe('public')
  })

  it('never touches another person’s things', async () => {
    const { member } = await somebodyWhoShares()
    const other = await makeUser({ profileVisibility: 'public' })
    const show = await makeShow({ title: 'Rent', slug: 'rent' })
    await makeLibraryEntry(other.id, show.id, { status: 'seen', visibility: 'public' })

    await applyProfileVisibility(member.id, 'private')

    const theirs = await db.select().from(libraryEntries).where(eq(libraryEntries.userId, other.id))
    expect(theirs[0]?.visibility).toBe('public')
  })
})

describe('new things follow the profile rather than a fixed level', () => {
  it('gives a new list the profile setting when none is chosen', async () => {
    const member = await makeUser({ profileVisibility: 'public' })
    const { createListForOwner } = await import('../src/server/list-functions')
    const created = await createListForOwner(member.id, { title: 'Best of the year' })
    const [row] = await db.select().from(lists).where(eq(lists.id, created.id))
    // Was pinned to 'friends' by the form, whatever the profile said.
    expect(row?.visibility).toBe('public')
  })

  it('still honours a level chosen for one list', async () => {
    const member = await makeUser({ profileVisibility: 'public' })
    const { createListForOwner } = await import('../src/server/list-functions')
    const created = await createListForOwner(member.id, {
      title: 'Just mine',
      visibility: 'private',
    })
    const [row] = await db.select().from(lists).where(eq(lists.id, created.id))
    expect(row?.visibility).toBe('private')
  })

  it('gives a review the profile setting when none is chosen', async () => {
    const member = await makeUser({ profileVisibility: 'public' })
    const show = await makeShow({ title: 'Six', slug: 'six' })
    const outing = await createOutingForUser(member.id, {
      showId: show.id,
      datePrecision: 'exact',
      occurredOn: '2026-05-18',
      attendeeIds: [],
      favorite: false,
    })
    const { updateMyReaction } = await import('../src/server/outing-functions')
    await updateMyReaction(member.id, {
      outingId: outing.id,
      favorite: false,
      review: 'Wonderful.',
    })
    const [row] = await db
      .select()
      .from(outingAttendees)
      .where(eq(outingAttendees.userId, member.id))
    expect(row?.reviewVisibility).toBe('public')
  })

  it('a level pinned to one review is left where it was put', async () => {
    const member = await makeUser({ profileVisibility: 'public' })
    const show = await makeShow({ title: 'Six', slug: 'six' })
    const outing = await createOutingForUser(member.id, {
      showId: show.id,
      datePrecision: 'exact',
      occurredOn: '2026-05-18',
      attendeeIds: [],
      favorite: false,
    })
    const { updateMyReaction } = await import('../src/server/outing-functions')
    await updateMyReaction(member.id, {
      outingId: outing.id,
      favorite: false,
      review: 'Wonderful.',
      reviewVisibility: 'private',
    })
    await applyProfileVisibility(member.id, 'friends')
    const [row] = await db
      .select()
      .from(outingAttendees)
      .where(eq(outingAttendees.userId, member.id))
    expect(row?.reviewVisibility).toBe('private')
  })
})
