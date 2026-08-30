import { beforeEach, describe, expect, it } from 'vitest'

import { areFriends } from '../src/server/friend-functions'
import {
  createOutingForUser,
  joinOutingAsAttendee,
  leaveOuting,
  outingForViewer,
} from '../src/server/outing-functions'
import { friendProfileForViewer } from '../src/server/profile-functions'
import { db, makeFriendship, makeShow, makeUser, resetDatabase } from './helpers'
import { libraryEntries, outingAttendees } from '../src/server/db/schema'
import { eq } from 'drizzle-orm'

beforeEach(resetDatabase)

async function aSharedNight(visibility: 'private' | 'friends' | 'public' = 'friends') {
  const owner = await makeUser({ profileVisibility: 'public' })
  const friend = await makeUser({ profileVisibility: 'public' })
  await makeFriendship(owner.id, friend.id, 'accepted')
  const show = await makeShow({ title: 'Hadestown', slug: 'hadestown' })
  const outing = await createOutingForUser(owner.id, {
    showId: show.id,
    datePrecision: 'exact',
    occurredOn: '2026-05-18',
    venue: 'Walter Kerr Theatre',
    city: 'New York',
    attendeeIds: [],
    favorite: false,
    visibility,
  })
  return { owner, friend, show, outing }
}

describe('I was there too', () => {
  it('adds the reader to the night rather than making a second one', async () => {
    const { friend, outing } = await aSharedNight()
    await joinOutingAsAttendee(friend.id, outing.id)
    const rows = await db
      .select()
      .from(outingAttendees)
      .where(eq(outingAttendees.outingId, outing.id))
    expect(rows).toHaveLength(2)
    // One night, not two records of the same evening.
    expect(await outingForViewer(friend.id, outing.id)).toBeTruthy()
  })

  it('marks the show seen in their own library', async () => {
    const { friend, show, outing } = await aSharedNight()
    await joinOutingAsAttendee(friend.id, outing.id)
    const [entry] = await db
      .select()
      .from(libraryEntries)
      .where(eq(libraryEntries.userId, friend.id))
    expect(entry?.showId).toBe(show.id)
    expect(entry?.status).toBe('seen')
    // At their own sharing level, so it is not hidden from their friends.
    expect(entry?.visibility).toBe('public')
  })

  it('refuses a stranger, whatever the night says', async () => {
    const { outing } = await aSharedNight('public')
    const stranger = await makeUser()
    await expect(joinOutingAsAttendee(stranger.id, outing.id)).rejects.toThrow('not available')
  })

  it('refuses a private night even to a friend', async () => {
    const { owner, friend, outing } = await aSharedNight('private')
    expect(await areFriends(friend.id, owner.id)).toBe(true)
    await expect(joinOutingAsAttendee(friend.id, outing.id)).rejects.toThrow('not available')
  })

  it('refuses the owner, and refuses joining twice', async () => {
    const { owner, friend, outing } = await aSharedNight()
    await expect(joinOutingAsAttendee(owner.id, outing.id)).rejects.toThrow('already your night')
    await joinOutingAsAttendee(friend.id, outing.id)
    await expect(joinOutingAsAttendee(friend.id, outing.id)).rejects.toThrow(
      'already on this night',
    )
  })

  it('can be taken back, leaving the owner’s night intact', async () => {
    const { owner, friend, outing } = await aSharedNight()
    await joinOutingAsAttendee(friend.id, outing.id)
    await leaveOuting(friend.id, outing.id)
    const rows = await db
      .select()
      .from(outingAttendees)
      .where(eq(outingAttendees.outingId, outing.id))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.userId).toBe(owner.id)
  })

  it('will not let somebody leave their own night by accident', async () => {
    const { owner, outing } = await aSharedNight()
    await expect(leaveOuting(owner.id, outing.id)).rejects.toThrow('delete it instead')
  })
})

describe('a friend’s profile shows the nights themselves', () => {
  it('lists what they saw, when, and where', async () => {
    const { owner, friend } = await aSharedNight()
    const profile = await friendProfileForViewer(friend.id, owner.handle)
    expect(profile.outings).toHaveLength(1)
    expect(profile.outings[0]?.showTitle).toBe('Hadestown')
    expect(profile.outings[0]?.venue).toBe('Walter Kerr Theatre')
    expect(profile.outings[0]?.occurredOn).toBe('2026-05-18')
    expect(profile.outings[0]?.alreadyThere).toBe(false)
  })

  it('says when the reader is already on the night', async () => {
    const { owner, friend, outing } = await aSharedNight()
    await joinOutingAsAttendee(friend.id, outing.id)
    const profile = await friendProfileForViewer(friend.id, owner.handle)
    expect(profile.outings[0]?.alreadyThere).toBe(true)
  })

  it('leaves a private night off the profile entirely', async () => {
    const { owner, friend } = await aSharedNight('private')
    const profile = await friendProfileForViewer(friend.id, owner.handle)
    expect(profile.outings).toHaveLength(0)
    expect(profile.stats.outings).toBe(1)
  })
})

describe('logging a night no longer hides it', () => {
  it('marks the show seen at the same visibility as the night', async () => {
    const owner = await makeUser({ profileVisibility: 'public' })
    const show = await makeShow({ title: 'Six', slug: 'six' })
    await createOutingForUser(owner.id, {
      showId: show.id,
      datePrecision: 'exact',
      occurredOn: '2026-05-18',
      attendeeIds: [],
      favorite: false,
    })
    const [entry] = await db
      .select()
      .from(libraryEntries)
      .where(eq(libraryEntries.userId, owner.id))
    // Was hardcoded 'private', so every logged show was invisible to friends.
    expect(entry?.visibility).toBe('public')
  })

  it('honours an explicit choice over the profile default', async () => {
    const owner = await makeUser({ profileVisibility: 'public' })
    const show = await makeShow({ title: 'Six', slug: 'six' })
    await createOutingForUser(owner.id, {
      showId: show.id,
      datePrecision: 'exact',
      occurredOn: '2026-05-18',
      attendeeIds: [],
      favorite: false,
      visibility: 'private',
    })
    const [entry] = await db
      .select()
      .from(libraryEntries)
      .where(eq(libraryEntries.userId, owner.id))
    expect(entry?.visibility).toBe('private')
  })
})

describe('a friend looking in on a night they were not at', () => {
  it('sees the night, marked as a visitor', async () => {
    const { friend, outing } = await aSharedNight()
    const seen = await outingForViewer(friend.id, outing.id)
    expect(seen.viewerRole).toBe('visitor')
    expect(seen.showTitle).toBe('Hadestown')
    expect(seen.venue).toBe('Walter Kerr Theatre')
    expect(seen.canEditFacts).toBe(false)
  })

  it('becomes an attendee once they say they were there', async () => {
    const { friend, outing } = await aSharedNight()
    await joinOutingAsAttendee(friend.id, outing.id)
    expect((await outingForViewer(friend.id, outing.id)).viewerRole).toBe('attendee')
  })

  it('is refused a private night', async () => {
    const { friend, outing } = await aSharedNight('private')
    await expect(outingForViewer(friend.id, outing.id)).rejects.toThrow('Unauthorized')
  })

  it('is refused to somebody who is not a friend', async () => {
    const { outing } = await aSharedNight('public')
    const stranger = await makeUser()
    await expect(outingForViewer(stranger.id, outing.id)).rejects.toThrow('Unauthorized')
  })

  it('is not offered a guess about who was on stage', async () => {
    // "Who you probably saw" is addressed to somebody who was in the room.
    const owner = await makeUser({ profileVisibility: 'public' })
    const friend = await makeUser({ profileVisibility: 'public' })
    await makeFriendship(owner.id, friend.id, 'accepted')
    const show = await makeShow({ title: 'Schmigadoon!', slug: 'schmigadoon' })
    const { findOrCreateProduction } = await import('../src/server/catalog-functions')
    const production = await findOrCreateProduction(
      owner.id,
      show.id,
      'Original Broadway',
      'broadway',
      'Nederlander Theatre',
      'New York',
    )
    const { addCasting } = await import('../src/server/people-functions')
    await addCasting(owner.id, {
      productionId: production.id,
      personName: 'Alex Brightman',
      role: 'Josh Skinner',
      kind: 'performer',
      isPrincipal: true,
      startedOn: '2026-04-20',
    })
    const outing = await createOutingForUser(owner.id, {
      showId: show.id,
      productionId: production.id,
      datePrecision: 'exact',
      occurredOn: '2026-05-18',
      attendeeIds: [],
      favorite: false,
    })
    expect((await outingForViewer(owner.id, outing.id)).likelyCast).toHaveLength(1)
    expect((await outingForViewer(friend.id, outing.id)).likelyCast).toHaveLength(0)
  })

  it('still withholds what the people on it kept back', async () => {
    const owner = await makeUser({ profileVisibility: 'public' })
    const friend = await makeUser({ profileVisibility: 'public' })
    await makeFriendship(owner.id, friend.id, 'accepted')
    const show = await makeShow({ title: 'Hadestown', slug: 'hadestown' })
    const outing = await createOutingForUser(owner.id, {
      showId: show.id,
      datePrecision: 'exact',
      occurredOn: '2026-05-18',
      attendeeIds: [],
      favorite: false,
      privateNotes: 'Took the kids.',
      review: 'A perfect night.',
      reviewVisibility: 'private',
    })
    const asVisitor = await outingForViewer(friend.id, outing.id)
    const theirs = asVisitor.attendees.find((a) => a.userId === owner.id)
    expect(theirs?.privateNotes).toBeNull()
    expect(theirs?.review).toBeNull()
    expect(theirs?.hasWithheldReview).toBe(true)
  })
})
