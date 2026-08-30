import { beforeEach, describe, expect, it } from 'vitest'

import { saveEntryForOwner } from '../src/server/library-functions'
import { createListForOwner, listForViewer } from '../src/server/list-functions'
import { publicProfileById } from '../src/server/profile-functions'
import { createOutingForUser } from '../src/server/outing-functions'
import { findOrCreateVenue, venueWithHistory } from '../src/server/venue-functions'
import { makeFriendship, makeShow, makeUser, resetDatabase } from './helpers'

beforeEach(resetDatabase)

/**
 * What a signed-out stranger receives must never let them work out who made it,
 * nor group one person's public things together. A name is the obvious leak; a
 * stable account id is the subtle one, because it addresses the public profile.
 */
function assertAnonymous(payload: unknown, owner: { id: string; name: string; handle: string; email: string }) {
  const serialized = JSON.stringify(payload)
  expect(serialized).not.toContain(owner.name)
  expect(serialized).not.toContain(owner.handle)
  expect(serialized).not.toContain(owner.email)
  expect(serialized).not.toContain(owner.id)
}

describe('a public list, seen by a stranger', () => {
  it('carries nothing that identifies or correlates its owner', async () => {
    const owner = await makeUser({ name: 'Wilhelmina Quinterling', handle: 'quinterling' })
    const { id } = await createListForOwner(owner.id, { title: 'A shelf', visibility: 'public' })
    assertAnonymous(await listForViewer(null, id), owner)
  })

  it('does not let two public lists be tied to the same person', async () => {
    const owner = await makeUser()
    const a = await createListForOwner(owner.id, { title: 'One', visibility: 'public' })
    const b = await createListForOwner(owner.id, { title: 'Two', visibility: 'public' })
    const [first, second] = await Promise.all([listForViewer(null, a.id), listForViewer(null, b.id)])
    expect(first.userId).toBeNull()
    expect(second.userId).toBeNull()
  })

  it('still tells the owner and their friends who it belongs to', async () => {
    const owner = await makeUser({ name: 'Wilhelmina Quinterling' })
    const friend = await makeUser()
    await makeFriendship(owner.id, friend.id, 'accepted')
    const { id } = await createListForOwner(owner.id, { title: 'A shelf', visibility: 'friends' })
    expect((await listForViewer(owner.id, id)).userId).toBe(owner.id)
    expect((await listForViewer(friend.id, id)).owner?.name).toBe('Wilhelmina Quinterling')
  })
})

describe('a public profile', () => {
  it('carries nothing that identifies its owner', async () => {
    const owner = await makeUser({
      name: 'Wilhelmina Quinterling',
      handle: 'quinterling',
      profileVisibility: 'public',
    })
    const show = await makeShow()
    await saveEntryForOwner(owner.id, {
      showId: show.id, status: 'seen', favorite: true, visibility: 'public', review: 'A view.',
    })
    assertAnonymous(await publicProfileById(owner.id), owner)
  })
})

describe('a venue page', () => {
  it('does not reveal who first recorded the venue', async () => {
    const owner = await makeUser({ name: 'Wilhelmina Quinterling', handle: 'quinterling' })
    const venue = await findOrCreateVenue(owner.id, 'Lena Horne Theatre', 'New York')
    assertAnonymous(await venueWithHistory(null, venue.id), owner)
  })

  it('shows a signed-out visitor no one else’s performances', async () => {
    const owner = await makeUser()
    const show = await makeShow()
    const venue = await findOrCreateVenue(owner.id, 'Lena Horne Theatre', 'New York')
    await createOutingForUser(owner.id, {
      showId: show.id, venue: 'Lena Horne Theatre', city: 'New York',
      datePrecision: 'year', occurredYear: 2026, attendeeIds: [], favorite: false,
    })
    const asStranger = await venueWithHistory(null, venue.id)
    expect(asStranger.yourNights).toHaveLength(0)
    // ...while the person who was there still sees their own.
    expect((await venueWithHistory(owner.id, venue.id)).yourNights).toHaveLength(1)
  })
})
