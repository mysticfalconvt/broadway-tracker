import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { desc, eq } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { z } from 'zod'

import { auth } from './auth'
import { type Actor, assertAdmin } from './catalog-functions'
import { getDb } from './db/client'
import { reports, user } from './db/schema'

async function requireSession() {
  const session = await auth.api.getSession({ headers: getRequestHeaders() })
  if (!session) throw new Error('Unauthorized')
  return session
}

export const reportInput = z.object({
  kind: z.enum(['bug', 'idea']),
  message: z.string().trim().min(5).max(4000),
  path: z.string().trim().max(300).optional(),
})

/**
 * Records a report and tells the administrators about it.
 *
 * Delivery is deliberately not awaited into the caller's failure path: the
 * report is already saved and visible in the administration queue, so a mail
 * problem must not make the reporter think their message was lost.
 */
export const fileReport = createServerOnlyFn(
  async (reporterId: string, data: z.infer<typeof reportInput>) => {
    const db = getDb()
    const [row] = await db
      .insert(reports)
      .values({
        reportedByUserId: reporterId,
        kind: data.kind,
        message: data.message,
        path: data.path || null,
      })
      .returning({ id: reports.id })
    if (!row) throw new Error('We could not record that. Please try again.')

    await notifyAdministrators(reporterId, data).catch((error) => {
      console.error('[reports] could not notify administrators', error)
    })
    return row
  },
)

async function notifyAdministrators(reporterId: string, data: z.infer<typeof reportInput>) {
  const db = getDb()
  const [reporter] = await db
    .select({ name: user.name, email: user.email })
    .from(user)
    .where(eq(user.id, reporterId))
    .limit(1)
  const admins = await db.select({ email: user.email }).from(user).where(eq(user.role, 'admin'))
  if (admins.length === 0) return

  const { sendEmail } = await import('./email')
  const base = process.env.BETTER_AUTH_URL ?? ''
  const label = data.kind === 'bug' ? 'Bug report' : 'Feature request'
  for (const admin of admins) {
    await sendEmail({
      to: admin.email,
      subject: `${label} from ${reporter?.name ?? 'a member'}`,
      text:
        `${label} from ${reporter?.name ?? 'a member'} (${reporter?.email ?? 'unknown'})\n` +
        (data.path ? `On page: ${data.path}\n` : '') +
        `\n${data.message}\n\n` +
        `Open reports: ${base}/admin/reports`,
    })
  }
}

/**
 * Reports for the administration screen. Resolved ones stay readable rather
 * than disappearing: what has already been dealt with is the useful context for
 * whether a new report is the same thing again.
 */
export const reportsForAdmin = createServerOnlyFn(
  async (actor: Actor, include: 'open' | 'all' = 'open') => {
    assertAdmin(actor)
    const resolver = alias(user, 'resolver')
    const query = getDb()
      .select({
        id: reports.id,
        kind: reports.kind,
        message: reports.message,
        path: reports.path,
        status: reports.status,
        createdAt: reports.createdAt,
        resolvedAt: reports.resolvedAt,
        reporterName: user.name,
        reporterEmail: user.email,
        resolvedByName: resolver.name,
      })
      .from(reports)
      .innerJoin(user, eq(reports.reportedByUserId, user.id))
      .leftJoin(resolver, eq(reports.resolvedByUserId, resolver.id))
      .orderBy(desc(reports.createdAt))
    return include === 'all' ? query : query.where(eq(reports.status, 'open'))
  },
)

/** Kept for the counters, which only ever care about what is still outstanding. */
export const openReportsForAdmin = createServerOnlyFn(async (actor: Actor) =>
  reportsForAdmin(actor, 'open'),
)

export const resolveReport = createServerOnlyFn(async (actor: Actor, id: string) => {
  assertAdmin(actor)
  await getDb()
    .update(reports)
    .set({ status: 'resolved', resolvedByUserId: actor.id, resolvedAt: new Date() })
    .where(eq(reports.id, id))
})

/** Puts a report back on the queue, for when it turns out not to be finished. */
export const reopenReport = createServerOnlyFn(async (actor: Actor, id: string) => {
  assertAdmin(actor)
  await getDb()
    .update(reports)
    .set({ status: 'open', resolvedByUserId: null, resolvedAt: null })
    .where(eq(reports.id, id))
})

export const submitReport = createServerFn({ method: 'POST' })
  .validator(reportInput)
  .handler(async ({ data }) => fileReport((await requireSession()).user.id, data))

export const getReports = createServerFn({ method: 'GET' })
  .validator(z.object({ include: z.enum(['open', 'all']).default('open') }))
  .handler(async ({ data }) =>
    reportsForAdmin((await requireSession()).user as Actor, data.include),
  )

export const markReportResolved = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string().uuid(), resolved: z.boolean().default(true) }))
  .handler(async ({ data }) => {
    const actor = (await requireSession()).user as Actor
    return data.resolved ? resolveReport(actor, data.id) : reopenReport(actor, data.id)
  })
