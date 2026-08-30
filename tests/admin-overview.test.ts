import { beforeEach, describe, expect, it } from 'vitest'

import {
  adminOverview,
  duplicateSuspicions,
  membersForAdmin,
  publishedShowForAdmin,
} from '../src/server/admin-functions'
import { showImages } from '../src/server/db/schema'
import { submitShowForUser } from '../src/server/catalog-functions'
import { findOrCreateVenue } from '../src/server/venue-functions'
import { db, makeAdmin, makeShow, makeUser, resetDatabase } from './helpers'

beforeEach(resetDatabase)

const actor = (u: { id: string; role: string }) => ({ id: u.id, role: u.role }) as never

describe('administration is gated', () => {
  it('refuses the overview and the duplicate view to a member', async () => {
    const member = await makeUser()
    await expect(adminOverview(actor(member))).rejects.toThrow('Forbidden')
    await expect(duplicateSuspicions(actor(member))).rejects.toThrow('Forbidden')
    await expect(
      publishedShowForAdmin(actor(member), '00000000-0000-0000-0000-000000000000'),
    ).rejects.toThrow('Forbidden')
  })
})

describe('overview counts', () => {
  it('counts nothing waiting on a clean catalog', async () => {
    const admin = await makeAdmin()
    const overview = await adminOverview(actor(admin))
    expect(overview.pendingShows).toBe(0)
    expect(overview.pendingPhotos).toBe(0)
  })

  it('counts a submitted show as waiting', async () => {
    const admin = await makeAdmin()
    const member = await makeUser()
    await submitShowForUser(member.id, { title: 'A New Musical', type: 'musical' })
    const overview = await adminOverview(actor(admin))
    expect(overview.pendingShows).toBe(1)
    expect(overview.publishedShows).toBe(0)
  })

  it('counts a photo offered publicly and awaiting review', async () => {
    const admin = await makeAdmin()
    const member = await makeUser()
    const show = await makeShow()
    await db.insert(showImages).values([
      {
        showId: show.id,
        uploadedByUserId: member.id,
        objectKey: 'show-photos/a.png',
        visibility: 'public',
        reviewStatus: 'pending',
      },
      // Neither of these is waiting on anyone.
      {
        showId: show.id,
        uploadedByUserId: member.id,
        objectKey: 'show-photos/b.png',
        visibility: 'friends',
        reviewStatus: 'pending',
      },
      {
        showId: show.id,
        uploadedByUserId: member.id,
        objectKey: 'show-photos/c.png',
        visibility: 'public',
        reviewStatus: 'approved',
      },
    ])
    expect((await adminOverview(actor(admin))).pendingPhotos).toBe(1)
  })

  it('counts venues', async () => {
    const admin = await makeAdmin()
    await findOrCreateVenue(admin.id, 'Walter Kerr Theatre', 'New York')
    await findOrCreateVenue(admin.id, 'Music Box Theatre', 'New York')
    expect((await adminOverview(actor(admin))).venues).toBe(2)
  })
})

describe('duplicate suspicion', () => {
  it('flags two shows whose titles differ by a typo', async () => {
    const admin = await makeAdmin()
    await makeShow({ title: 'The Outsiders', slug: 'the-outsiders' })
    await makeShow({ title: 'The Outsider', slug: 'the-outsider' })
    await makeShow({ title: 'Hadestown', slug: 'hadestown' })
    const { shows: suspects } = await duplicateSuspicions(actor(admin))
    expect(suspects).toHaveLength(1)
    expect([suspects[0]?.a.title, suspects[0]?.b.title].sort()).toEqual([
      'The Outsider',
      'The Outsiders',
    ])
  })

  it('flags two venues that normalisation could not merge', async () => {
    const admin = await makeAdmin()
    await findOrCreateVenue(admin.id, 'Walter Kerr Theatre', 'New York')
    await findOrCreateVenue(admin.id, 'Walter Ker Theatre', 'New York')
    await findOrCreateVenue(admin.id, 'Kit Kat Club', 'New York')
    const { venues: suspects } = await duplicateSuspicions(actor(admin))
    expect(suspects).toHaveLength(1)
  })

  it('does not flag venues that normalisation already merged', async () => {
    const admin = await makeAdmin()
    await findOrCreateVenue(admin.id, 'Walter Kerr Theatre', 'NYC')
    await findOrCreateVenue(admin.id, 'the walter kerr', 'New York City')
    const { venues: suspects } = await duplicateSuspicions(actor(admin))
    expect(suspects).toHaveLength(0)
  })

  it('leaves a genuinely distinct catalog alone', async () => {
    const admin = await makeAdmin()
    await makeShow({ title: 'Hadestown', slug: 'hadestown' })
    await makeShow({ title: 'Hamilton', slug: 'hamilton' })
    await makeShow({ title: 'Cabaret', slug: 'cabaret' })
    const { shows: suspects } = await duplicateSuspicions(actor(admin))
    expect(suspects).toHaveLength(0)
  })
})

describe('provenance', () => {
  it('reports who submitted a show and who reviewed it', async () => {
    const admin = await makeAdmin()
    const member = await makeUser()
    const created = await submitShowForUser(member.id, { title: 'Provenance', type: 'play' })
    const row = await publishedShowForAdmin(actor(admin), created.id)
    expect(row.submittedByUserId).toBe(member.id)
    expect(row.catalogStatus).toBe('pending')
    expect(row.reviewedByUserId).toBeNull()
  })
})

describe('who is using this', () => {
  it('counts what each member has actually done', async () => {
    const admin = await makeAdmin()
    const member = await makeUser({ profileVisibility: 'public' })
    const show = await makeShow({ title: 'Hadestown', slug: 'hadestown' })
    const { createOutingForUser } = await import('../src/server/outing-functions')
    await createOutingForUser(member.id, {
      showId: show.id,
      datePrecision: 'exact',
      occurredOn: '2026-05-18',
      attendeeIds: [],
      favorite: false,
    })
    const rows = await membersForAdmin(actor(admin))
    const theirs = rows.find((row) => row.id === member.id)
    expect(theirs?.nights).toBe(1)
    // Logging a night marks the show seen, so that counts too.
    expect(theirs?.shows).toBe(1)
    expect(theirs?.pieces).toBe(0)
  })

  it('counts each member separately rather than the whole table', async () => {
    const admin = await makeAdmin()
    const busy = await makeUser()
    const quiet = await makeUser()
    const show = await makeShow({ title: 'Six', slug: 'six' })
    const { createOutingForUser } = await import('../src/server/outing-functions')
    await createOutingForUser(busy.id, {
      showId: show.id,
      datePrecision: 'exact',
      occurredOn: '2026-05-18',
      attendeeIds: [],
      favorite: false,
    })
    const rows = await membersForAdmin(actor(admin))
    expect(rows.find((r) => r.id === busy.id)?.nights).toBe(1)
    expect(rows.find((r) => r.id === quiet.id)?.nights).toBe(0)
  })

  it('lists everybody, administrators included', async () => {
    const admin = await makeAdmin()
    await makeUser()
    await makeUser()
    expect(await membersForAdmin(actor(admin))).toHaveLength(3)
  })

  it('refuses a member', async () => {
    const member = await makeUser()
    await expect(membersForAdmin(actor(member))).rejects.toThrow('Forbidden')
  })
})
