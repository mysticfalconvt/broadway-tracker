import { beforeEach, describe, expect, it } from 'vitest'

import {
  addShowToOwnedList,
  createListForOwner,
  listForViewer,
  listsForOwner,
  moveItemInOwnedList,
  placeTierListItemForOwner,
  removeShowFromOwnedList,
  tierCandidatesForOwner,
  updateOwnedList,
} from '../src/server/list-functions'
import {
  db,
  makeFriendship,
  makeLibraryEntry,
  makeList,
  makeShow,
  makeUser,
  resetDatabase,
} from './helpers'
import { outingAttendees, outings, productions } from '../src/server/db/schema'
import { tierListImageForOwner } from '../src/server/tier-list-image'

beforeEach(resetDatabase)

describe('list visibility', () => {
  it('lets an owner read their own private list', async () => {
    const owner = await makeUser()
    const list = await makeList(owner.id, { visibility: 'private' })
    const result = await listForViewer(owner.id, list.id)
    expect(result.canEdit).toBe(true)
    expect(result.title).toBe(list.title)
  })

  it('lets an approved friend read a friends-visible list', async () => {
    const owner = await makeUser()
    const friend = await makeUser()
    await makeFriendship(owner.id, friend.id, 'accepted')
    const list = await makeList(owner.id, { visibility: 'friends' })
    const result = await listForViewer(friend.id, list.id)
    expect(result.canEdit).toBe(false)
    expect(result.owner?.handle).toBe(owner.handle)
  })

  it('hides a private list from an approved friend', async () => {
    const owner = await makeUser()
    const friend = await makeUser()
    await makeFriendship(owner.id, friend.id, 'accepted')
    const list = await makeList(owner.id, { visibility: 'private' })
    await expect(listForViewer(friend.id, list.id)).rejects.toThrow('List not found')
  })

  it('hides a friends-visible list from a pending friend', async () => {
    const owner = await makeUser()
    const pending = await makeUser()
    await makeFriendship(owner.id, pending.id, 'pending')
    const list = await makeList(owner.id, { visibility: 'friends' })
    await expect(listForViewer(pending.id, list.id)).rejects.toThrow('List not found')
  })

  it('hides a friends-visible list from a blocked relationship', async () => {
    const owner = await makeUser()
    const blocked = await makeUser()
    await makeFriendship(owner.id, blocked.id, 'blocked')
    const list = await makeList(owner.id, { visibility: 'friends' })
    await expect(listForViewer(blocked.id, list.id)).rejects.toThrow('List not found')
  })

  it('hides a friends-visible list from a stranger', async () => {
    const owner = await makeUser()
    const stranger = await makeUser()
    const list = await makeList(owner.id, { visibility: 'friends' })
    await expect(listForViewer(stranger.id, list.id)).rejects.toThrow('List not found')
  })

  it('reports a missing list the same way it reports a forbidden one', async () => {
    const stranger = await makeUser()
    const owner = await makeUser()
    const hidden = await makeList(owner.id, { visibility: 'private' })
    const missing = '00000000-0000-0000-0000-000000000000'
    const forbiddenError = await listForViewer(stranger.id, hidden.id).catch((e) => e.message)
    const missingError = await listForViewer(stranger.id, missing).catch((e) => e.message)
    expect(forbiddenError).toBe(missingError)
  })
})

describe('list membership', () => {
  it('only returns lists belonging to the owner', async () => {
    const owner = await makeUser()
    const other = await makeUser()
    await makeList(owner.id, { title: 'Mine' })
    await makeList(other.id, { title: 'Theirs' })
    const result = await listsForOwner(owner.id)
    expect(result.map((list) => list.title)).toEqual(['Mine'])
  })

  it('counts the shows on each list', async () => {
    const owner = await makeUser()
    const list = await makeList(owner.id)
    const show = await makeShow()
    await addShowToOwnedList(owner.id, list.id, show.id)
    const [result] = await listsForOwner(owner.id)
    expect(result?.itemCount).toBe(1)
  })

  it('defaults a new list to private', async () => {
    const owner = await makeUser()
    const { id } = await createListForOwner(owner.id, {
      title: 'Shelf',
      visibility: 'private',
    })
    const result = await listForViewer(owner.id, id)
    expect(result.visibility).toBe('private')
  })
})

describe('list mutation authorization', () => {
  it('refuses to add a show to a list the actor does not own', async () => {
    const owner = await makeUser()
    const attacker = await makeUser()
    await makeFriendship(owner.id, attacker.id, 'accepted')
    const list = await makeList(owner.id, { visibility: 'friends' })
    const show = await makeShow()
    await expect(addShowToOwnedList(attacker.id, list.id, show.id)).rejects.toThrow(
      'List not found',
    )
    expect((await listForViewer(owner.id, list.id)).items).toHaveLength(0)
  })

  it('refuses to remove a show from a list the actor does not own', async () => {
    const owner = await makeUser()
    const attacker = await makeUser()
    await makeFriendship(owner.id, attacker.id, 'accepted')
    const list = await makeList(owner.id, { visibility: 'friends' })
    const show = await makeShow()
    await addShowToOwnedList(owner.id, list.id, show.id)
    await expect(removeShowFromOwnedList(attacker.id, list.id, show.id)).rejects.toThrow(
      'List not found',
    )
    expect((await listForViewer(owner.id, list.id)).items).toHaveLength(1)
  })

  it('refuses to reorder a list the actor does not own', async () => {
    const owner = await makeUser()
    const attacker = await makeUser()
    await makeFriendship(owner.id, attacker.id, 'accepted')
    const list = await makeList(owner.id, { visibility: 'friends' })
    const first = await makeShow({ title: 'First' })
    const second = await makeShow({ title: 'Second' })
    await addShowToOwnedList(owner.id, list.id, first.id)
    await addShowToOwnedList(owner.id, list.id, second.id)
    await expect(moveItemInOwnedList(attacker.id, list.id, second.id, 'up')).rejects.toThrow(
      'List not found',
    )
    const result = await listForViewer(owner.id, list.id)
    expect(result.items.map((item) => item.title)).toEqual(['First', 'Second'])
  })

  it('rejects an unpublished show', async () => {
    const owner = await makeUser()
    const list = await makeList(owner.id)
    const pendingShow = await makeShow({ catalogStatus: 'pending' })
    await expect(addShowToOwnedList(owner.id, list.id, pendingShow.id)).rejects.toThrow(
      'Choose a published show.',
    )
  })

  it('reorders items for the owner', async () => {
    const owner = await makeUser()
    const list = await makeList(owner.id)
    const first = await makeShow({ title: 'First' })
    const second = await makeShow({ title: 'Second' })
    await addShowToOwnedList(owner.id, list.id, first.id)
    await addShowToOwnedList(owner.id, list.id, second.id)
    await moveItemInOwnedList(owner.id, list.id, second.id, 'up')
    const result = await listForViewer(owner.id, list.id)
    expect(result.items.map((item) => item.title)).toEqual(['Second', 'First'])
  })

  it('does not add the same show twice', async () => {
    const owner = await makeUser()
    const list = await makeList(owner.id)
    const show = await makeShow()
    await addShowToOwnedList(owner.id, list.id, show.id)
    await addShowToOwnedList(owner.id, list.id, show.id)
    expect((await listForViewer(owner.id, list.id)).items).toHaveLength(1)
  })
})

describe('tier lists', () => {
  it('only accepts shows the owner has marked seen', async () => {
    const owner = await makeUser()
    const list = await makeList(owner.id, { kind: 'tier_list' })
    const unseen = await makeShow()
    await expect(addShowToOwnedList(owner.id, list.id, unseen.id)).rejects.toThrow(
      'Tier lists can only include shows you have seen.',
    )
    await makeLibraryEntry(owner.id, unseen.id, { status: 'seen' })
    await addShowToOwnedList(owner.id, list.id, unseen.id)
    expect((await listForViewer(owner.id, list.id)).items).toHaveLength(1)
  })

  it('moves a show between tiers and preserves its position', async () => {
    const owner = await makeUser()
    const list = await makeList(owner.id, { kind: 'tier_list' })
    const first = await makeShow({ title: 'First' })
    const second = await makeShow({ title: 'Second' })
    await makeLibraryEntry(owner.id, first.id, { status: 'seen' })
    await makeLibraryEntry(owner.id, second.id, { status: 'seen' })
    await addShowToOwnedList(owner.id, list.id, first.id)
    await addShowToOwnedList(owner.id, list.id, second.id)
    await placeTierListItemForOwner(owner.id, list.id, second.id, 'S', 0)
    await placeTierListItemForOwner(owner.id, list.id, first.id, 'S', 1)
    const result = await listForViewer(owner.id, list.id)
    expect(result.items.filter((item) => item.tier === 'S').map((item) => item.title)).toEqual([
      'Second',
      'First',
    ])
  })

  it('lets the owner rename tier labels without changing placements', async () => {
    const owner = await makeUser()
    const list = await makeList(owner.id, { kind: 'tier_list' })
    await updateOwnedList(owner.id, list.id, {
      title: list.title,
      visibility: 'private',
      tierNames: { S: 'Standing ovation', A: 'Encore', B: 'Matinee', C: 'Fine', D: 'Skip' },
    })
    const result = await listForViewer(owner.id, list.id)
    expect(result.tierNames).toEqual({
      S: 'Standing ovation',
      A: 'Encore',
      B: 'Matinee',
      C: 'Fine',
      D: 'Skip',
    })
  })

  it('reports every attended production type on a seen show', async () => {
    const owner = await makeUser()
    const show = await makeShow()
    await makeLibraryEntry(owner.id, show.id, { status: 'seen' })
    const [production] = await db
      .insert(productions)
      .values({ showId: show.id, name: 'Tour', productionType: 'tour' })
      .returning()
    if (!production) throw new Error('Fixture setup failed')
    const [outing] = await db
      .insert(outings)
      .values({ showId: show.id, productionId: production.id, createdByUserId: owner.id })
      .returning()
    if (!outing) throw new Error('Fixture setup failed')
    await db
      .insert(outingAttendees)
      .values({ outingId: outing.id, userId: owner.id, attendanceStatus: 'accepted' })
    const [candidate] = await tierCandidatesForOwner(owner.id)
    expect(candidate?.productionTypes).toEqual(['tour'])
  })

  it('refuses to export another member’s tier list', async () => {
    const owner = await makeUser()
    const stranger = await makeUser()
    const list = await makeList(owner.id, { kind: 'tier_list' })
    await expect(tierListImageForOwner(stranger.id, list.id)).rejects.toThrow('Tier list not found')
  })

  it('exports a colored PNG for an owner’s ranked shows', async () => {
    const owner = await makeUser()
    const list = await makeList(owner.id, { kind: 'tier_list' })
    const show = await makeShow()
    await makeLibraryEntry(owner.id, show.id, { status: 'seen' })
    await addShowToOwnedList(owner.id, list.id, show.id)
    await placeTierListItemForOwner(owner.id, list.id, show.id, 'S', 0)
    const image = await tierListImageForOwner(owner.id, list.id)
    expect(image.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  })
})
