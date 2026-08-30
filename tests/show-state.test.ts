import { beforeEach, describe, expect, it } from 'vitest'

import { showStateForViewer } from '../src/server/library-functions'
import { createOutingForUser, outingForViewer } from '../src/server/outing-functions'
import { makeLibraryEntry, makeShow, makeUser, resetDatabase } from './helpers'

beforeEach(resetDatabase)

describe('where the reader already stands with a show', () => {
  it('says nothing for somebody signed out', async () => {
    const show = await makeShow({ title: 'Hadestown', slug: 'hadestown' })
    expect(await showStateForViewer(null, show.id)).toEqual({ entry: null, outings: [] })
  })

  it('is empty for somebody who has never touched it', async () => {
    const member = await makeUser()
    const show = await makeShow({ title: 'Hadestown', slug: 'hadestown' })
    const state = await showStateForViewer(member.id, show.id)
    expect(state.entry).toBeNull()
    expect(state.outings).toHaveLength(0)
  })

  it('reports a show marked as wanted', async () => {
    const member = await makeUser()
    const show = await makeShow({ title: 'Hadestown', slug: 'hadestown' })
    await makeLibraryEntry(member.id, show.id, { status: 'want_to_see' })
    const state = await showStateForViewer(member.id, show.id)
    expect(state.entry?.status).toBe('want_to_see')
    expect(state.outings).toHaveLength(0)
  })

  it('reports it seen once a night is logged, without being asked twice', async () => {
    const member = await makeUser()
    const show = await makeShow({ title: 'Hadestown', slug: 'hadestown' })
    await createOutingForUser(member.id, {
      showId: show.id,
      datePrecision: 'exact',
      occurredOn: '2026-05-18',
      attendeeIds: [],
      favorite: false,
    })
    const state = await showStateForViewer(member.id, show.id)
    expect(state.entry?.status).toBe('seen')
    expect(state.outings).toHaveLength(1)
  })

  it('counts every night of a show somebody has seen more than once', async () => {
    const member = await makeUser()
    const show = await makeShow({ title: 'Hadestown', slug: 'hadestown' })
    for (const date of ['2024-03-02', '2026-05-18']) {
      await createOutingForUser(member.id, {
        showId: show.id,
        datePrecision: 'exact',
        occurredOn: date,
        attendeeIds: [],
        favorite: false,
      })
    }
    expect((await showStateForViewer(member.id, show.id)).outings).toHaveLength(2)
  })

  it('keeps one person’s history out of another’s', async () => {
    const member = await makeUser()
    const other = await makeUser()
    const show = await makeShow({ title: 'Hadestown', slug: 'hadestown' })
    await createOutingForUser(member.id, {
      showId: show.id,
      datePrecision: 'exact',
      occurredOn: '2026-05-18',
      attendeeIds: [],
      favorite: false,
    })
    const state = await showStateForViewer(other.id, show.id)
    expect(state.entry).toBeNull()
    expect(state.outings).toHaveLength(0)
  })
})

describe('the other times you saw it', () => {
  async function twoNights() {
    const member = await makeUser()
    const show = await makeShow({ title: 'Hadestown', slug: 'hadestown' })
    const first = await createOutingForUser(member.id, {
      showId: show.id,
      datePrecision: 'exact',
      occurredOn: '2024-03-02',
      venue: 'Walter Kerr Theatre',
      city: 'New York',
      attendeeIds: [],
      favorite: false,
    })
    const second = await createOutingForUser(member.id, {
      showId: show.id,
      datePrecision: 'exact',
      occurredOn: '2026-05-18',
      attendeeIds: [],
      favorite: false,
    })
    return { member, show, first, second }
  }

  it('lists the reader’s other viewings, and never the one they are reading', async () => {
    const { member, first, second } = await twoNights()
    const viewing = await outingForViewer(member.id, second.id)
    expect(viewing.otherNights.map((n) => n.id)).toEqual([first.id])
  })

  it('is empty when a show was seen only once', async () => {
    const member = await makeUser()
    const show = await makeShow({ title: 'Six', slug: 'six' })
    const only = await createOutingForUser(member.id, {
      showId: show.id,
      datePrecision: 'exact',
      occurredOn: '2026-05-18',
      attendeeIds: [],
      favorite: false,
    })
    expect((await outingForViewer(member.id, only.id)).otherNights).toHaveLength(0)
  })

  it('shows a visiting friend their own other nights, not the owner’s', async () => {
    const { member, show, first, second } = await twoNights()
    const friend = await makeUser()
    const { makeFriendship } = await import('./helpers')
    await makeFriendship(member.id, friend.id, 'accepted')
    // The friend saw the same show on their own, once.
    const theirs = await createOutingForUser(friend.id, {
      showId: show.id,
      datePrecision: 'exact',
      occurredOn: '2023-11-04',
      attendeeIds: [],
      favorite: false,
    })
    // Looking in on the owner's night, "the other times you saw it" means the
    // reader's own history — never a list of somebody else's evenings.
    const asVisitor = await outingForViewer(friend.id, second.id)
    expect(asVisitor.otherNights.map((n) => n.id)).toEqual([theirs.id])
    expect(asVisitor.otherNights.map((n) => n.id)).not.toContain(first.id)
  })

  it('leaves out another show entirely', async () => {
    const { member, second } = await twoNights()
    const other = await makeShow({ title: 'Six', slug: 'six' })
    await createOutingForUser(member.id, {
      showId: other.id,
      datePrecision: 'exact',
      occurredOn: '2025-01-01',
      attendeeIds: [],
      favorite: false,
    })
    const viewing = await outingForViewer(member.id, second.id)
    expect(viewing.otherNights).toHaveLength(1)
  })
})
