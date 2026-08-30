import { createServerOnlyFn } from '@tanstack/react-start'
import { and, desc, eq, gt, inArray, isNotNull, isNull, lt, ne, or, sql } from 'drizzle-orm'

import { getDb } from './db/client'
import { outings, posts, shows, user, venues } from './db/schema'
import { acceptedFriendIdsFor } from './friend-functions'
import { anniversariesAhead } from './resurfacing'

/**
 * An occasional letter to somebody who has stopped visiting.
 *
 * Two rules decide almost everything here, and both are about restraint:
 *
 *   - **Send nothing when there is nothing to say.** A thin letter is worse
 *     than none. An empty feed gets ignored; an empty email gets you
 *     unsubscribed, and rightly.
 *   - **Only to somebody who has actually been away.** Anybody who visited
 *     this week already saw all of this. That is the difference between a nudge
 *     and a newsletter.
 *
 * The contents are the front page in another envelope: the same queries,
 * already honouring the same sharing rules.
 */

export const WINDOWS = { weekly: 7, monthly: 30 } as const
export type Cadence = keyof typeof WINDOWS

function daysAgo(days: number, from = new Date()) {
  const at = new Date(from)
  at.setDate(at.getDate() - days)
  return at
}

/** What one person's letter would contain, if it were sent now. */
export const digestFor = createServerOnlyFn(
  async (userId: string, cadence: Cadence, now = new Date()) => {
    const db = getDb()
    const [person] = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        token: user.digestToken,
        lastDigestAt: user.lastDigestAt,
      })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1)
    if (!person) return null

    const window = WINDOWS[cadence]
    // Everything since the last letter, or since one window ago for a first one.
    const since = person.lastDigestAt ?? daysAgo(window, now)
    const friendIds = [...(await acceptedFriendIdsFor(userId))]

    const readablePost = or(
      eq(posts.visibility, 'public'),
      friendIds.length
        ? and(eq(posts.visibility, 'friends'), inArray(posts.authorUserId, friendIds))
        : undefined,
    )

    const [anniversaries, writing, nights] = await Promise.all([
      anniversariesAhead(userId, now, window),
      db
        .select({
          title: posts.title,
          slug: posts.slug,
          byline: posts.byline,
          kind: posts.kind,
        })
        .from(posts)
        .where(
          and(
            eq(posts.status, 'published'),
            isNotNull(posts.publishedAt),
            gt(posts.publishedAt, since),
            ne(posts.authorUserId, userId),
            readablePost,
          ),
        )
        .orderBy(desc(posts.publishedAt))
        .limit(5),
      friendIds.length
        ? db
            .select({
              id: outings.id,
              showTitle: shows.title,
              friendName: user.name,
              venue: sql<string | null>`coalesce(${venues.name}, ${outings.venue})`,
            })
            .from(outings)
            .innerJoin(shows, eq(outings.showId, shows.id))
            .innerJoin(user, eq(outings.createdByUserId, user.id))
            .leftJoin(venues, eq(outings.venueId, venues.id))
            .where(
              and(
                inArray(outings.createdByUserId, friendIds),
                inArray(outings.visibility, ['friends', 'public']),
                inArray(user.profileVisibility, ['friends', 'public']),
                gt(outings.createdAt, since),
              ),
            )
            .orderBy(desc(outings.createdAt))
            .limit(5)
        : Promise.resolve([]),
    ])

    return {
      person,
      anniversaries,
      writing,
      nights,
      isEmpty: anniversaries.length === 0 && writing.length === 0 && nights.length === 0,
    }
  },
)

/**
 * Who is due a letter.
 *
 * Away for longer than their own window, not written to within it, and still
 * asking for them. Whether there is anything to say is decided per person
 * afterwards, because that needs their own friends and their own history.
 */
export const membersDueADigest = createServerOnlyFn(async (now = new Date()) => {
  const due = (cadence: Cadence) => {
    const edge = daysAgo(WINDOWS[cadence], now)
    return and(
      eq(user.digestCadence, cadence),
      eq(user.emailVerified, true),
      // Somebody who has been in this week has already seen all of it.
      or(isNull(user.lastActiveAt), lt(user.lastActiveAt, edge)),
      or(isNull(user.lastDigestAt), lt(user.lastDigestAt, edge)),
    )
  }
  return getDb()
    .select({ id: user.id, cadence: user.digestCadence })
    .from(user)
    .where(or(due('weekly'), due('monthly')))
})

function render(digest: NonNullable<Awaited<ReturnType<typeof digestFor>>>, baseUrl: string) {
  const lines: string[] = [`Hello ${digest.person.name.split(' ')[0] ?? digest.person.name},`, '']

  if (digest.anniversaries.length) {
    lines.push('Coming up:')
    for (const night of digest.anniversaries) {
      lines.push(
        `  ${night.yearsAgo} ${night.yearsAgo === 1 ? 'year' : 'years'} since ${night.showTitle}` +
          `${night.venue ? ` at ${night.venue}` : ''}, on ${night.occurredOn?.slice(5)}`,
      )
    }
    lines.push('')
  }

  if (digest.writing.length) {
    lines.push('Written since you were last here:')
    for (const piece of digest.writing) {
      lines.push(`  ${piece.title}${piece.byline ? ` — ${piece.byline}` : ''}`)
      lines.push(`  ${baseUrl}/writing/${piece.slug}`)
    }
    lines.push('')
  }

  if (digest.nights.length) {
    lines.push('Where your friends have been:')
    for (const night of digest.nights) {
      lines.push(
        `  ${night.friendName} saw ${night.showTitle}${night.venue ? ` at ${night.venue}` : ''}`,
      )
    }
    lines.push('')
  }

  lines.push(baseUrl)
  lines.push('')
  lines.push(`Stop these: ${baseUrl}/api/digest/stop?token=${digest.person.token}`)
  return lines.join('\n')
}

/**
 * Sends what is due, and records that it went.
 *
 * `dryRun` assembles everything and sends nothing, so a schedule can be pointed
 * at production and inspected before it is trusted with anybody's inbox.
 */
export const sendDueDigests = createServerOnlyFn(
  async ({ now = new Date(), dryRun = false } = {}) => {
    const baseUrl = process.env.BETTER_AUTH_URL ?? ''
    const due = await membersDueADigest(now)
    const sent: string[] = []
    const skippedEmpty: string[] = []

    for (const member of due) {
      const digest = await digestFor(member.id, member.cadence as Cadence, now)
      if (!digest) continue
      // Nothing to say, so nothing is said — and the clock is not reset, so
      // they are considered again as soon as there is something.
      if (digest.isEmpty) {
        skippedEmpty.push(digest.person.email)
        continue
      }
      if (!dryRun) {
        const { sendEmail } = await import('./email')
        await sendEmail({
          to: digest.person.email,
          subject: 'From your theatre journal',
          text: render(digest, baseUrl),
        })
        await getDb().update(user).set({ lastDigestAt: now }).where(eq(user.id, member.id))
      }
      sent.push(digest.person.email)
    }
    return { considered: due.length, sent, skippedEmpty, dryRun }
  },
)

/** Stops the letters, from inside a letter, with no password involved. */
export const stopDigestsFor = createServerOnlyFn(async (token: string) => {
  const [stopped] = await getDb()
    .update(user)
    .set({ digestCadence: 'off', updatedAt: new Date() })
    .where(eq(user.digestToken, token))
    .returning({ email: user.email })
  return Boolean(stopped)
})

/**
 * Notes that somebody is here, at most once an hour.
 *
 * Called from the navigation's own round trip, which happens on every page. A
 * write on every page view would be a lot of writes to learn something that
 * only needs to be roughly true.
 */
export const touchActivity = createServerOnlyFn(async (userId: string, now = new Date()) => {
  await getDb()
    .update(user)
    .set({ lastActiveAt: now })
    .where(
      and(
        eq(user.id, userId),
        or(isNull(user.lastActiveAt), lt(user.lastActiveAt, new Date(now.getTime() - 3_600_000))),
      ),
    )
})
