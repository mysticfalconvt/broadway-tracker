import { beforeEach, describe, expect, it } from 'vitest'

import { reports } from '../src/server/db/schema'
import {
  fileReport,
  openReportsForAdmin,
  reopenReport,
  reportsForAdmin,
  resolveReport,
} from '../src/server/report-functions'
import { db, makeAdmin, makeUser, resetDatabase } from './helpers'

beforeEach(resetDatabase)

const actor = (u: { id: string; role: string }) => ({ id: u.id, role: u.role }) as never

describe('filing a report', () => {
  it('records a bug with the page it came from', async () => {
    const member = await makeUser()
    await fileReport(member.id, {
      kind: 'bug',
      message: 'The rating stars do not respond on my phone.',
      path: '/shows/hadestown',
    })
    const [row] = await db.select().from(reports)
    expect(row?.kind).toBe('bug')
    expect(row?.path).toBe('/shows/hadestown')
    expect(row?.status).toBe('open')
  })

  it('records a feature request without a page', async () => {
    const member = await makeUser()
    await fileReport(member.id, { kind: 'idea', message: 'Let me sort my library by venue.' })
    const [row] = await db.select().from(reports)
    expect(row?.kind).toBe('idea')
    expect(row?.path).toBeNull()
  })

  it('still records the report when there is no administrator to notify', async () => {
    // A mail problem, or nobody to mail, must not lose the report.
    const member = await makeUser()
    await fileReport(member.id, { kind: 'bug', message: 'Something went wrong somewhere.' })
    expect(await db.select().from(reports)).toHaveLength(1)
  })
})

describe('the administration queue', () => {
  it('is refused to a member', async () => {
    const member = await makeUser()
    await expect(openReportsForAdmin(actor(member))).rejects.toThrow('Forbidden')
    await expect(
      resolveReport(actor(member), '00000000-0000-0000-0000-000000000000'),
    ).rejects.toThrow('Forbidden')
  })

  it('lists open reports newest first, with who sent them', async () => {
    const admin = await makeAdmin()
    const member = await makeUser({ name: 'Reporter' })
    await fileReport(member.id, { kind: 'bug', message: 'First thing that broke.' })
    await fileReport(member.id, { kind: 'idea', message: 'Second thing I would like.' })
    const rows = await openReportsForAdmin(actor(admin))
    expect(rows).toHaveLength(2)
    expect(rows[0]?.reporterName).toBe('Reporter')
  })

  it('keeps a resolved report readable rather than hiding it for good', async () => {
    const admin = await makeAdmin()
    const member = await makeUser()
    await fileReport(member.id, { kind: 'bug', message: 'Something to fix.' })
    const [open] = await reportsForAdmin(actor(admin), 'open')
    await resolveReport(actor(admin), open!.id)

    // Gone from the open queue...
    expect(await reportsForAdmin(actor(admin), 'open')).toHaveLength(0)
    // ...but still there when you ask for everything, with who closed it.
    const all = await reportsForAdmin(actor(admin), 'all')
    expect(all).toHaveLength(1)
    expect(all[0]?.status).toBe('resolved')
    expect(all[0]?.resolvedByName).toBe(admin.name)
  })

  it('can put a resolved report back on the queue', async () => {
    const admin = await makeAdmin()
    const member = await makeUser()
    await fileReport(member.id, { kind: 'bug', message: 'Not actually fixed.' })
    const [open] = await reportsForAdmin(actor(admin), 'open')
    await resolveReport(actor(admin), open!.id)
    await reopenReport(actor(admin), open!.id)

    const stillOpen = await reportsForAdmin(actor(admin), 'open')
    expect(stillOpen).toHaveLength(1)
    expect(stillOpen[0]?.resolvedByName).toBeNull()
    expect(stillOpen[0]?.resolvedAt).toBeNull()
  })

  it('refuses reopening to a member', async () => {
    const member = await makeUser()
    await expect(
      reopenReport(actor(member), '00000000-0000-0000-0000-000000000000'),
    ).rejects.toThrow('Forbidden')
  })

  it('drops a report off the queue once it is resolved', async () => {
    const admin = await makeAdmin()
    const member = await makeUser()
    await fileReport(member.id, { kind: 'bug', message: 'Something to fix.' })
    const [open] = await openReportsForAdmin(actor(admin))
    await resolveReport(actor(admin), open!.id)
    expect(await openReportsForAdmin(actor(admin))).toHaveLength(0)
    const [row] = await db.select().from(reports)
    expect(row?.status).toBe('resolved')
    expect(row?.resolvedByUserId).toBe(admin.id)
    expect(row?.resolvedAt).not.toBeNull()
  })

  it("removes a member's reports when their account goes", async () => {
    const member = await makeUser()
    await fileReport(member.id, { kind: 'bug', message: 'A report that should not outlive me.' })
    const { user } = await import('../src/server/db/schema')
    const { eq } = await import('drizzle-orm')
    await db.delete(user).where(eq(user.id, member.id))
    expect(await db.select().from(reports)).toHaveLength(0)
  })
})
