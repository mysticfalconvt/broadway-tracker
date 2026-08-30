import { createServerOnlyFn } from '@tanstack/react-start'
import { and, eq, sql } from 'drizzle-orm'

import { getDb } from './db/client'
import { libraryEntries, lists, outingAttendees, outings, user } from './db/schema'

export type Visibility = 'private' | 'friends' | 'public'

/**
 * The sharing level new content takes when the person did not choose one.
 *
 * It follows their profile setting rather than a fixed constant, so "I share
 * openly" or "I keep to myself" is stated once and everything they make follows
 * it. Anything explicitly chosen on a form always wins over this.
 */
export const defaultVisibilityFor = createServerOnlyFn(
  async (userId: string): Promise<Visibility> => {
    const [row] = await getDb()
      .select({ profileVisibility: user.profileVisibility })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1)
    return (row?.profileVisibility as Visibility) ?? 'friends'
  },
)

async function countAt(userId: string, level: Visibility) {
  const db = getDb()
  const one = async (rows: Promise<{ count: number }[]>) => (await rows)[0]?.count ?? 0
  const [shelf, shelves, nights, reviews] = await Promise.all([
    one(
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(libraryEntries)
        .where(and(eq(libraryEntries.userId, userId), eq(libraryEntries.visibility, level))),
    ),
    one(
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(lists)
        .where(and(eq(lists.userId, userId), eq(lists.visibility, level))),
    ),
    one(
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(outings)
        .where(and(eq(outings.createdByUserId, userId), eq(outings.visibility, level))),
    ),
    one(
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(outingAttendees)
        .where(
          and(eq(outingAttendees.userId, userId), eq(outingAttendees.reviewVisibility, level)),
        ),
    ),
  ])
  return {
    shows: shelf,
    lists: shelves,
    outings: nights,
    reviews,
    total: shelf + shelves + nights + reviews,
  }
}

/**
 * How much would move if this person changed their profile sharing.
 *
 * Anything still sitting at their current profile setting is taken to be
 * something they never decided about individually — it took that value because
 * the profile said so. Anything at a different level was a deliberate choice
 * and is left alone.
 */
export const contentFollowingProfile = createServerOnlyFn(async (userId: string) =>
  countAt(userId, await defaultVisibilityFor(userId)),
)

/**
 * Changes the profile setting and brings everything that was following it.
 *
 * The alternative — a profile setting that governs only future content — means
 * somebody who opens up their profile stays invisible, which is not what they
 * asked for and gives them no way to find out.
 *
 * Photographs are deliberately left out: a photograph becoming public re-enters
 * the moderation queue, and a bulk change would put a stack of images in front
 * of an administrator that nobody actually asked to publish.
 */
export const applyProfileVisibility = createServerOnlyFn(
  async (userId: string, next: Visibility) => {
    const previous = await defaultVisibilityFor(userId)
    if (previous === next)
      return { previous, next, moved: { shows: 0, lists: 0, outings: 0, reviews: 0, total: 0 } }

    const moved = await countAt(userId, previous)
    const db = getDb()
    await db.transaction(async (tx) => {
      await tx
        .update(libraryEntries)
        .set({ visibility: next, updatedAt: new Date() })
        .where(and(eq(libraryEntries.userId, userId), eq(libraryEntries.visibility, previous)))
      await tx
        .update(lists)
        .set({ visibility: next, updatedAt: new Date() })
        .where(and(eq(lists.userId, userId), eq(lists.visibility, previous)))
      await tx
        .update(outings)
        .set({ visibility: next, updatedAt: new Date() })
        .where(and(eq(outings.createdByUserId, userId), eq(outings.visibility, previous)))
      await tx
        .update(outingAttendees)
        .set({ reviewVisibility: next })
        .where(
          and(eq(outingAttendees.userId, userId), eq(outingAttendees.reviewVisibility, previous)),
        )
      await tx
        .update(user)
        .set({ profileVisibility: next, updatedAt: new Date() })
        .where(eq(user.id, userId))
    })
    return { previous, next, moved }
  },
)
