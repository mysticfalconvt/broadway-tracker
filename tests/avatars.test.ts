import { beforeEach, describe, expect, it } from 'vitest'

import { companyForOutings } from '../src/server/profile-functions'
import { createOutingForUser } from '../src/server/outing-functions'
import { db, makeFriendship, makeShow, makeUser, resetDatabase } from './helpers'

beforeEach(resetDatabase)

async function aNightWith(hostId: string, guestIds: string[]) {
  const show = await makeShow()
  return createOutingForUser(hostId, {
    showId: show.id,
    datePrecision: 'exact',
    occurredOn: '2026-06-14',
    attendeeIds: guestIds,
    favorite: false,
  })
}

describe('who was at a night, and whose face may be shown', () => {
  it('gives the reader their own photograph', async () => {
    const me = await makeUser({ image: 'avatars/mine.jpg' })
    const night = await aNightWith(me.id, [])

    const company = await companyForOutings(me.id, [night.id])
    const people = company.get(night.id) ?? []
    expect(people).toHaveLength(1)
    expect(people[0]?.isViewer).toBe(true)
    expect(people[0]?.imageKey).toBe('avatars/mine.jpg')
  })

  it("shows a friend's photograph", async () => {
    const me = await makeUser()
    const friend = await makeUser({ name: 'Sarah Chen', image: 'avatars/sarah.jpg' })
    await makeFriendship(me.id, friend.id)
    const night = await aNightWith(me.id, [friend.id])

    const people = (await companyForOutings(me.id, [night.id])).get(night.id) ?? []
    const sarah = people.find((one) => one.name === 'Sarah Chen')
    expect(sarah?.imageKey).toBe('avatars/sarah.jpg')
  })

  it('withholds the face of somebody no longer a friend', async () => {
    // Only friends can be invited, so this is how two people end up sharing a
    // night without sharing faces: the friendship ended afterwards. A face is
    // never public, and handing the browser a key it cannot fetch would put a
    // broken image inside the circle — worse than the initials it replaced.
    const me = await makeUser()
    const former = await makeUser({ name: 'Once A Friend', image: 'avatars/former.jpg' })
    await makeFriendship(me.id, former.id)
    const night = await aNightWith(me.id, [former.id])

    const stillShown = (await companyForOutings(me.id, [night.id])).get(night.id) ?? []
    expect(stillShown.find((one) => one.name === 'Once A Friend')?.imageKey).toBe(
      'avatars/former.jpg',
    )

    const { friendships } = await import('../src/server/db/schema')
    await db.delete(friendships)

    const people = (await companyForOutings(me.id, [night.id])).get(night.id) ?? []
    const them = people.find((one) => one.name === 'Once A Friend')
    // Still named — they were there — but without a face.
    expect(them).toBeDefined()
    expect(them?.imageKey).toBeNull()
  })

  it('puts the reader first', async () => {
    const me = await makeUser({ name: 'Zoe Last' })
    const friend = await makeUser({ name: 'Aaron First' })
    await makeFriendship(me.id, friend.id)
    const night = await aNightWith(me.id, [friend.id])

    const people = (await companyForOutings(me.id, [night.id])).get(night.id) ?? []
    expect(people[0]?.isViewer).toBe(true)
    expect(people[0]?.name).toBe('Zoe Last')
  })

  it('leaves out somebody who was invited and declined', async () => {
    const me = await makeUser()
    const friend = await makeUser({ name: 'Said No' })
    await makeFriendship(me.id, friend.id)
    const night = await aNightWith(me.id, [friend.id])
    const { outingAttendees } = await import('../src/server/db/schema')
    const { and, eq } = await import('drizzle-orm')
    await db
      .update(outingAttendees)
      .set({ attendanceStatus: 'declined' })
      .where(and(eq(outingAttendees.outingId, night.id), eq(outingAttendees.userId, friend.id)))

    const people = (await companyForOutings(me.id, [night.id])).get(night.id) ?? []
    expect(people.map((one) => one.name)).not.toContain('Said No')
  })

  it('asks for nothing when there are no nights', async () => {
    const me = await makeUser()
    expect((await companyForOutings(me.id, [])).size).toBe(0)
  })
})
