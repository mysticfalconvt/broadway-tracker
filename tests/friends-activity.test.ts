import { beforeEach, describe, expect, it } from 'vitest'

import { createOutingForUser, joinOutingAsAttendee } from '../src/server/outing-functions'
import { friendsActivityFor } from '../src/server/profile-functions'
import { makeFriendship, makeShow, makeUser, resetDatabase } from './helpers'

beforeEach(resetDatabase)

async function circle() {
  const me = await makeUser({ profileVisibility: 'public' })
  const friend = await makeUser({ profileVisibility: 'public' })
  await makeFriendship(me.id, friend.id, 'accepted')
  const show = await makeShow({ title: 'Hadestown', slug: 'hadestown' })
  return { me, friend, show }
}

describe('where your friends have been', () => {
  it('lists a friend’s shared night', async () => {
    const { me, friend, show } = await circle()
    await createOutingForUser(friend.id, {
      showId: show.id,
      datePrecision: 'exact',
      occurredOn: '2026-05-18',
      venue: 'Walter Kerr Theatre',
      city: 'New York',
      attendeeIds: [],
      favorite: false,
    })
    const feed = await friendsActivityFor(me.id)
    expect(feed).toHaveLength(1)
    expect(feed[0]?.showTitle).toBe('Hadestown')
    expect(feed[0]?.friendName).toBe(friend.name)
    expect(feed[0]?.venue).toBe('Walter Kerr Theatre')
  })

  it('leaves out a night kept private', async () => {
    const { me, friend, show } = await circle()
    await createOutingForUser(friend.id, {
      showId: show.id,
      datePrecision: 'exact',
      occurredOn: '2026-05-18',
      attendeeIds: [],
      favorite: false,
      visibility: 'private',
    })
    expect(await friendsActivityFor(me.id)).toHaveLength(0)
  })

  it('leaves out a stranger entirely', async () => {
    // The reader must already have a friend, or an empty circle short-circuits
    // before the filter that excludes strangers is ever reached.
    const { me, friend, show } = await circle()
    await createOutingForUser(friend.id, {
      showId: show.id,
      datePrecision: 'exact',
      occurredOn: '2026-05-18',
      attendeeIds: [],
      favorite: false,
    })
    const stranger = await makeUser({ profileVisibility: 'public' })
    const other = await makeShow({ title: 'Six', slug: 'six' })
    await createOutingForUser(stranger.id, {
      showId: other.id,
      datePrecision: 'exact',
      occurredOn: '2026-05-19',
      attendeeIds: [],
      favorite: false,
    })
    const feed = await friendsActivityFor(me.id)
    expect(feed.map((n) => n.showTitle)).toEqual(['Hadestown'])
  })

  it('leaves out somebody whose request is still pending', async () => {
    const me = await makeUser({ profileVisibility: 'public' })
    const pending = await makeUser({ profileVisibility: 'public' })
    await makeFriendship(me.id, pending.id, 'pending')
    const show = await makeShow({ title: 'Six', slug: 'six' })
    await createOutingForUser(pending.id, {
      showId: show.id,
      datePrecision: 'exact',
      occurredOn: '2026-05-18',
      attendeeIds: [],
      favorite: false,
    })
    expect(await friendsActivityFor(me.id)).toHaveLength(0)
  })

  it('leaves out a friend who keeps their profile to themselves', async () => {
    const me = await makeUser({ profileVisibility: 'public' })
    const quiet = await makeUser({ profileVisibility: 'private' })
    await makeFriendship(me.id, quiet.id, 'accepted')
    const show = await makeShow({ title: 'Six', slug: 'six' })
    // Their profile setting also moved this night to private, so both rules
    // agree — but the feed must exclude them on the profile alone.
    await createOutingForUser(quiet.id, {
      showId: show.id,
      datePrecision: 'exact',
      occurredOn: '2026-05-18',
      attendeeIds: [],
      favorite: false,
      visibility: 'public',
    })
    expect(await friendsActivityFor(me.id)).toHaveLength(0)
  })

  it('is empty for somebody with no friends', async () => {
    const alone = await makeUser({ profileVisibility: 'public' })
    expect(await friendsActivityFor(alone.id)).toHaveLength(0)
  })

  it('says when the reader was already at one of them', async () => {
    const { me, friend, show } = await circle()
    const night = await createOutingForUser(friend.id, {
      showId: show.id,
      datePrecision: 'exact',
      occurredOn: '2026-05-18',
      attendeeIds: [],
      favorite: false,
    })
    expect((await friendsActivityFor(me.id))[0]?.alreadyThere).toBe(false)
    await joinOutingAsAttendee(me.id, night.id)
    expect((await friendsActivityFor(me.id))[0]?.alreadyThere).toBe(true)
  })

  it('puts the newest first', async () => {
    const { me, friend } = await circle()
    for (const [title, slug] of [
      ['First', 'first'],
      ['Second', 'second'],
    ]) {
      const show = await makeShow({ title: title as string, slug: slug as string })
      await createOutingForUser(friend.id, {
        showId: show.id,
        datePrecision: 'exact',
        occurredOn: '2026-05-18',
        attendeeIds: [],
        favorite: false,
      })
    }
    expect((await friendsActivityFor(me.id)).map((n) => n.showTitle)).toEqual(['Second', 'First'])
  })
})
