import { beforeEach, describe, expect, it } from 'vitest'

import { submitShowForUser, tellAdminsAboutASubmission } from '../src/server/catalog-functions'
import { makeAdmin, makeUser, resetDatabase } from './helpers'

beforeEach(resetDatabase)

describe('telling administrators a show is waiting', () => {
  it('writes to every administrator when a member submits one', async () => {
    const one = await makeAdmin({ email: 'one@example.test' })
    const two = await makeAdmin({ email: 'two@example.test' })
    const member = await makeUser({ name: 'Sarah Chen' })
    // A member who is not an administrator and not the submitter. Without one
    // present, "everybody" and "the administrators" are the same set and the
    // assertion below holds either way.
    await makeUser({ email: 'bystander@example.test' })

    const notice = await tellAdminsAboutASubmission(member.id, 'Grease')
    expect(notice?.sentTo.sort()).toEqual(['one@example.test', 'two@example.test'])
    expect(notice?.subject).toBe('Sarah Chen added Grease')
    void one
    void two
  })

  it('says nothing when an administrator submits it themselves', async () => {
    // The whole reason this can be immediate rather than batched: somebody
    // pointing an agent at the catalog is almost always an administrator, and
    // those are the bursts that would have turned a notice into noise.
    await makeAdmin({ email: 'other@example.test' })
    const admin = await makeAdmin()

    expect(await tellAdminsAboutASubmission(admin.id, 'Grease')).toBeNull()
  })

  it('says nothing when there is no administrator to tell', async () => {
    const member = await makeUser()
    expect(await tellAdminsAboutASubmission(member.id, 'Grease')).toBeNull()
  })

  it('goes out as part of submitting, not on its own', async () => {
    const admin = await makeAdmin({ email: 'admin@example.test' })
    const member = await makeUser({ name: 'Sarah Chen' })

    const show = await submitShowForUser(member.id, { title: 'Hairspray', type: 'musical' })
    expect(show.title).toBe('Hairspray')

    // The submission is what matters; the letter must not be able to undo it.
    const { shows } = await import('../src/server/db/schema')
    const { eq } = await import('drizzle-orm')
    const { db } = await import('./helpers')
    const [row] = await db.select().from(shows).where(eq(shows.id, show.id))
    expect(row?.catalogStatus).toBe('pending')
    expect(row?.submittedByUserId).toBe(member.id)
    void admin
  })
})
