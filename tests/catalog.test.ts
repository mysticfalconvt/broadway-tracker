import { beforeEach, describe, expect, it } from 'vitest'

import {
  type Actor,
  mergeShowAsAdmin,
  pendingShowsForAdmin,
  publishedShowBySlug,
  reviewShowAsAdmin,
  searchCatalog,
  submitShowForUser,
} from '../src/server/catalog-functions'
import { saveEntryForOwner } from '../src/server/library-functions'
import { createOutingForUser } from '../src/server/outing-functions'
import { db, makeAdmin, makeList, makeShow, makeUser, resetDatabase } from './helpers'
import { shows } from '../src/server/db/schema'
import { addShowToOwnedList, listForViewer } from '../src/server/list-functions'
import { eq } from 'drizzle-orm'

beforeEach(resetDatabase)

const actor = (u: { id: string; role: string }) => ({ id: u.id, role: u.role }) as Actor

describe('catalog visibility', () => {
  it('search returns only published shows', async () => {
    await makeShow({ title: 'Published show', catalogStatus: 'published' })
    await makeShow({ title: 'Pending show', catalogStatus: 'pending' })
    await makeShow({ title: 'Rejected show', catalogStatus: 'rejected' })
    const result = await searchCatalog('show')
    expect(result.map((show) => show.title)).toEqual(['Published show'])
  })

  it('treats wildcard characters in a query literally', async () => {
    await makeShow({ title: 'Cabaret' })
    expect(await searchCatalog('%')).toHaveLength(0)
    expect(await searchCatalog('_')).toHaveLength(0)
  })

  it('matches titles case-insensitively', async () => {
    await makeShow({ title: 'Hadestown' })
    expect(await searchCatalog('hades')).toHaveLength(1)
  })

  it('does not expose a pending show by slug', async () => {
    const pending = await makeShow({ catalogStatus: 'pending', slug: 'secret-show' })
    expect(await publishedShowBySlug('secret-show')).toBeNull()
    expect(pending.catalogStatus).toBe('pending')
  })
})

describe('show submission', () => {
  it('keeps a submitted show pending and out of search', async () => {
    const member = await makeUser()
    const created = await submitShowForUser(member.id, { title: 'New Musical', type: 'musical' })
    const [row] = await db.select().from(shows).where(eq(shows.id, created.id))
    expect(row?.catalogStatus).toBe('pending')
    expect(row?.submittedByUserId).toBe(member.id)
    expect(await searchCatalog('New Musical')).toHaveLength(0)
  })

  it('generates a url-safe slug', async () => {
    const member = await makeUser()
    const created = await submitShowForUser(member.id, {
      title: 'Les Misérables: The Musical!',
      type: 'musical',
    })
    expect(created.slug).toBe('les-miserables-the-musical')
  })

  it('suffixes a colliding slug instead of failing', async () => {
    const member = await makeUser()
    const first = await submitShowForUser(member.id, { title: 'Wicked', type: 'musical' })
    const second = await submitShowForUser(member.id, { title: 'Wicked', type: 'musical' })
    const third = await submitShowForUser(member.id, { title: 'Wicked', type: 'musical' })
    expect([first.slug, second.slug, third.slug]).toEqual(['wicked', 'wicked-2', 'wicked-3'])
  })

  it('falls back to a usable slug for a title with no url-safe characters', async () => {
    const member = await makeUser()
    const created = await submitShowForUser(member.id, { title: '!!!', type: 'other' })
    expect(created.slug).toBe('show')
  })
})

describe('moderation permissions', () => {
  it('refuses the pending queue to a member', async () => {
    const member = await makeUser()
    await expect(pendingShowsForAdmin(actor(member))).rejects.toThrow('Forbidden')
  })

  it('gives the pending queue to an admin', async () => {
    const admin = await makeAdmin()
    const member = await makeUser()
    await submitShowForUser(member.id, { title: 'Pending One', type: 'play' })
    expect(await pendingShowsForAdmin(actor(admin))).toHaveLength(1)
  })

  it('refuses review to a member and leaves the show pending', async () => {
    const member = await makeUser()
    const created = await submitShowForUser(member.id, { title: 'Sneaky', type: 'play' })
    await expect(
      reviewShowAsAdmin(actor(member), {
        id: created.id,
        title: 'Sneaky',
        type: 'play',
        action: 'publish',
        slug: 'sneaky',
      }),
    ).rejects.toThrow('Forbidden')
    const [row] = await db.select().from(shows).where(eq(shows.id, created.id))
    expect(row?.catalogStatus).toBe('pending')
  })

  it('refuses a merge to a member', async () => {
    const member = await makeUser()
    const source = await makeShow()
    const target = await makeShow({ slug: 'target-show' })
    await expect(mergeShowAsAdmin(actor(member), source.id, 'target-show')).rejects.toThrow(
      'Forbidden',
    )
    expect(await db.select().from(shows)).toHaveLength(2)
    expect(target.slug).toBe('target-show')
  })
})

describe('admin review', () => {
  it('publishes a pending show and makes it searchable', async () => {
    const admin = await makeAdmin()
    const member = await makeUser()
    const created = await submitShowForUser(member.id, { title: 'Suffs', type: 'musical' })
    await reviewShowAsAdmin(actor(admin), {
      id: created.id,
      title: 'Suffs',
      type: 'musical',
      action: 'publish',
      slug: 'suffs',
    })
    expect(await searchCatalog('Suffs')).toHaveLength(1)
    const [row] = await db.select().from(shows).where(eq(shows.id, created.id))
    expect(row?.reviewedByUserId).toBe(admin.id)
    expect(row?.reviewedAt).not.toBeNull()
  })

  it('rejects a pending show and keeps it out of search', async () => {
    const admin = await makeAdmin()
    const member = await makeUser()
    const created = await submitShowForUser(member.id, { title: 'Nope', type: 'play' })
    await reviewShowAsAdmin(actor(admin), {
      id: created.id,
      title: 'Nope',
      type: 'play',
      action: 'reject',
      slug: 'nope',
    })
    expect(await searchCatalog('Nope')).toHaveLength(0)
  })

  it('refuses a slug already used by another show', async () => {
    const admin = await makeAdmin()
    const member = await makeUser()
    await makeShow({ slug: 'taken' })
    const created = await submitShowForUser(member.id, { title: 'Other', type: 'play' })
    await expect(
      reviewShowAsAdmin(actor(admin), {
        id: created.id,
        title: 'Other',
        type: 'play',
        action: 'publish',
        slug: 'taken',
      }),
    ).rejects.toThrow('That URL slug is already in use.')
  })

  it('refuses to review a show that is no longer pending', async () => {
    const admin = await makeAdmin()
    const published = await makeShow({ catalogStatus: 'published' })
    await expect(
      reviewShowAsAdmin(actor(admin), {
        id: published.id,
        title: 'X',
        type: 'play',
        action: 'publish',
        slug: 'brand-new-slug',
      }),
    ).rejects.toThrow('This submission is no longer awaiting review.')
  })
})

describe('merging duplicates', () => {
  it('moves library entries and list items onto the target and deletes the source', async () => {
    const admin = await makeAdmin()
    const member = await makeUser()
    const source = await makeShow({ title: 'Dupe', slug: 'dupe' })
    const target = await makeShow({ title: 'Canonical', slug: 'canonical' })
    await saveEntryForOwner(member.id, {
      showId: source.id,
      status: 'seen',
      favorite: false,
      visibility: 'private',
    })
    const list = await makeList(member.id)
    await addShowToOwnedList(member.id, list.id, source.id)

    await mergeShowAsAdmin(actor(admin), source.id, 'canonical')

    expect(await db.select().from(shows).where(eq(shows.id, source.id))).toHaveLength(0)
    const { libraryForOwner } = await import('../src/server/library-functions')
    const [entry] = await libraryForOwner(member.id)
    expect(entry?.title).toBe('Canonical')
    const listed = await listForViewer(member.id, list.id)
    expect(listed.items.map((item) => item.title)).toEqual(['Canonical'])
    expect(target.slug).toBe('canonical')
  })

  it('refuses a merge that would duplicate a library entry', async () => {
    const admin = await makeAdmin()
    const member = await makeUser()
    const source = await makeShow({ slug: 'dupe' })
    const target = await makeShow({ slug: 'canonical' })
    for (const showId of [source.id, target.id]) {
      await saveEntryForOwner(member.id, {
        showId,
        status: 'seen',
        favorite: false,
        visibility: 'private',
      })
    }
    await expect(mergeShowAsAdmin(actor(admin), source.id, 'canonical')).rejects.toThrow(
      'library entry',
    )
    expect(await db.select().from(shows).where(eq(shows.id, source.id))).toHaveLength(1)
  })

  it('refuses a merge that would duplicate a show inside one list', async () => {
    const admin = await makeAdmin()
    const member = await makeUser()
    const source = await makeShow({ slug: 'dupe' })
    const target = await makeShow({ slug: 'canonical' })
    const list = await makeList(member.id)
    await addShowToOwnedList(member.id, list.id, source.id)
    await addShowToOwnedList(member.id, list.id, target.id)
    await expect(mergeShowAsAdmin(actor(admin), source.id, 'canonical')).rejects.toThrow('list')
    expect(await db.select().from(shows).where(eq(shows.id, source.id))).toHaveLength(1)
  })

  it('refuses to merge a show into itself or into an unpublished target', async () => {
    const admin = await makeAdmin()
    const show = await makeShow({ slug: 'same' })
    const pending = await makeShow({ slug: 'pending-target', catalogStatus: 'pending' })
    await expect(mergeShowAsAdmin(actor(admin), show.id, 'same')).rejects.toThrow(
      'Choose a different show as the merge target.',
    )
    await expect(mergeShowAsAdmin(actor(admin), show.id, 'pending-target')).rejects.toThrow(
      'Choose an existing published show to merge into.',
    )
    expect(pending.catalogStatus).toBe('pending')
  })
})

describe('a submission somebody has already logged a night against', () => {
  it('cannot be rejected, because the night would be orphaned', async () => {
    const admin = await makeAdmin()
    const submitter = await makeUser()
    const pending = await makeShow({
      title: 'Just Submitted',
      slug: 'just-submitted',
      catalogStatus: 'pending',
      submittedByUserId: submitter.id,
    })
    await createOutingForUser(submitter.id, {
      showId: pending.id,
      datePrecision: 'exact',
      occurredOn: '2026-05-18',
      attendeeIds: [],
      favorite: false,
    })
    await expect(
      reviewShowAsAdmin(actor(admin), {
        id: pending.id,
        action: 'reject',
        title: 'Just Submitted',
        type: 'musical',
        slug: 'just-submitted',
      }),
    ).rejects.toThrow('Merge it into the right show')
  })

  it('can still be published', async () => {
    const admin = await makeAdmin()
    const submitter = await makeUser()
    const pending = await makeShow({
      title: 'Just Submitted',
      slug: 'just-submitted',
      catalogStatus: 'pending',
      submittedByUserId: submitter.id,
    })
    await createOutingForUser(submitter.id, {
      showId: pending.id,
      datePrecision: 'exact',
      occurredOn: '2026-05-18',
      attendeeIds: [],
      favorite: false,
    })
    await reviewShowAsAdmin(actor(admin), {
      id: pending.id,
      action: 'publish',
      title: 'Just Submitted',
      type: 'musical',
      slug: 'just-submitted',
    })
    expect((await publishedShowBySlug('just-submitted'))?.id).toBe(pending.id)
  })

  it('is still rejectable when nobody has logged anything', async () => {
    const admin = await makeAdmin()
    const pending = await makeShow({
      title: 'Nobody Saw This',
      slug: 'nobody-saw-this',
      catalogStatus: 'pending',
    })
    await reviewShowAsAdmin(actor(admin), {
      id: pending.id,
      action: 'reject',
      title: 'Nobody Saw This',
      type: 'musical',
      slug: 'nobody-saw-this',
    })
    expect(await publishedShowBySlug('nobody-saw-this')).toBeNull()
  })
})
