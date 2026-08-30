import { createServerOnlyFn } from '@tanstack/react-start'
import { and, desc, eq, isNotNull, isNull, or, sql } from 'drizzle-orm'

import { getDb } from './db/client'
import { castings, libraryEntries, outings, seenPerformers, shows } from './db/schema'

/**
 * One loose end in somebody's own record, or nothing.
 *
 * Not a task list, and deliberately not a count. Fifteen people with a few
 * hundred nights between them will always have gaps, so a screen totalling them
 * up would be permanently accusing and never finished — which is the engagement
 * pattern the brief rules out, wearing a helpful face.
 *
 * The rule that keeps this honest: **only ask when the answer makes something
 * work.** Every kind below is a question the app cannot answer for itself and
 * whose answer unlocks a specific thing — a night that gets a date, a cast the
 * app already guessed and needs confirming, a theatre that then appears on a
 * map. A gap that unlocks nothing is not a loose end, it is just an empty
 * field, and nobody needs telling about their empty fields.
 */

export type LooseEnd =
  | { kind: 'when'; outingId: string; title: string }
  | { kind: 'who'; outingId: string; title: string }
  | { kind: 'where'; outingId: string; title: string }
  | { kind: 'rating'; slug: string; title: string }

/**
 * A night with no real date, where the catalog knows when the show ran.
 *
 * The qualifier is the whole point. Without a recorded run there is nothing to
 * narrow against, and asking would be asking somebody to remember harder.
 */
const noDate = async (viewerId: string): Promise<LooseEnd | null> => {
  const [row] = await getDb()
    .select({ outingId: outings.id, title: shows.title })
    .from(outings)
    .innerJoin(shows, eq(outings.showId, shows.id))
    .where(
      and(
        eq(outings.createdByUserId, viewerId),
        or(eq(outings.datePrecision, 'unknown'), eq(outings.datePrecision, 'approximate')),
        // Written out by hand: interpolating a column reference renders it
        // unqualified, which correlates the subquery against itself.
        sql`exists (
          select 1 from productions p
          where p."show_id" = ${outings}."show_id" and p."opened_on" is not null
        )`,
      ),
    )
    .orderBy(desc(outings.createdAt))
    .limit(1)
  return row ? { kind: 'when', outingId: row.outingId, title: row.title } : null
}

/**
 * A night where the app has worked out who was probably on stage and has never
 * been told whether it was right.
 *
 * This is the strongest of them: the guess already exists, it is one tap to
 * confirm, and until somebody does the app is repeating an inference to them as
 * though it were a memory.
 */
const noCast = async (viewerId: string): Promise<LooseEnd | null> => {
  const [row] = await getDb()
    .select({ outingId: outings.id, title: shows.title })
    .from(outings)
    .innerJoin(shows, eq(outings.showId, shows.id))
    .where(
      and(
        eq(outings.createdByUserId, viewerId),
        eq(outings.datePrecision, 'exact'),
        isNotNull(outings.occurredOn),
        isNotNull(outings.productionId),
        sql`not exists (
          select 1 from ${seenPerformers}
          where ${seenPerformers}."outing_id" = ${outings}."id"
            and ${seenPerformers}."user_id" = ${viewerId}
        )`,
        sql`exists (
          select 1 from ${castings}
          where ${castings}."production_id" = ${outings}."production_id"
            and ${castings}."kind" = 'performer'
            and (${castings}."started_on" is null or ${castings}."started_on" <= ${outings}."occurred_on")
            and (${castings}."ended_on" is null or ${castings}."ended_on" >= ${outings}."occurred_on")
        )`,
      ),
    )
    .orderBy(desc(outings.occurredOn))
    .limit(1)
  return row ? { kind: 'who', outingId: row.outingId, title: row.title } : null
}

/** A night with no theatre, which is why it is missing from their map. */
const noVenue = async (viewerId: string): Promise<LooseEnd | null> => {
  const [row] = await getDb()
    .select({ outingId: outings.id, title: shows.title })
    .from(outings)
    .innerJoin(shows, eq(outings.showId, shows.id))
    .where(
      and(
        eq(outings.createdByUserId, viewerId),
        isNull(outings.venueId),
        or(isNull(outings.venue), eq(outings.venue, '')),
      ),
    )
    .orderBy(desc(outings.createdAt))
    .limit(1)
  return row ? { kind: 'where', outingId: row.outingId, title: row.title } : null
}

/** Seen, and never rated. The one gap here that is purely their opinion. */
const noRating = async (viewerId: string): Promise<LooseEnd | null> => {
  const [row] = await getDb()
    .select({ slug: shows.slug, title: shows.title })
    .from(libraryEntries)
    .innerJoin(shows, eq(libraryEntries.showId, shows.id))
    .where(
      and(
        eq(libraryEntries.userId, viewerId),
        eq(libraryEntries.status, 'seen'),
        isNull(libraryEntries.rating),
      ),
    )
    .orderBy(desc(libraryEntries.updatedAt))
    .limit(1)
  return row ? { kind: 'rating', slug: row.slug, title: row.title } : null
}

/**
 * One of them, chosen by the day.
 *
 * By the date rather than at random so it holds still: a card that reshuffles
 * on every refresh invites refreshing, and one that changes while somebody is
 * reading it is just broken. Tomorrow it moves on by itself, which is the only
 * dismissal it needs — nothing here is urgent enough to require an answer.
 */
export const looseEndFor = createServerOnlyFn(
  async (viewerId: string, today = new Date()): Promise<LooseEnd | null> => {
    const found = (
      await Promise.all([noCast(viewerId), noDate(viewerId), noVenue(viewerId), noRating(viewerId)])
    ).filter((one): one is LooseEnd => one !== null)

    if (!found.length) return null
    const day = Math.floor(today.getTime() / 86_400_000)
    return found[day % found.length] ?? null
  },
)
