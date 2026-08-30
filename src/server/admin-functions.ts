import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { and, asc, eq, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import { normalizeVenueName } from '../lib/place'
import { findSuspectPairs } from '../lib/similarity'
import { auth } from './auth'
import { pendingRequestCountFor } from './friend-functions'
import { type Actor, assertAdmin } from './catalog-functions'
import { getDb } from './db/client'
import { reports, showImages, shows, user, venues } from './db/schema'

async function requireSession() {
  const session = await auth.api.getSession({ headers: getRequestHeaders() })
  if (!session) throw new Error('Unauthorized')
  return session
}

function looseTitleKey(title: string) {
  return title
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Everything waiting on an administrator, in one query set. */
export const adminOverview = createServerOnlyFn(async (actor: Actor) => {
  assertAdmin(actor)
  const db = getDb()
  const [pendingShows, pendingPhotos, publishedShows, venueCount, openReports] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(shows)
      .where(eq(shows.catalogStatus, 'pending')),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(showImages)
      .where(and(eq(showImages.visibility, 'public'), eq(showImages.reviewStatus, 'pending'))),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(shows)
      .where(eq(shows.catalogStatus, 'published')),
    db.select({ count: sql<number>`count(*)::int` }).from(venues),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(reports)
      .where(eq(reports.status, 'open')),
  ])
  const suspects = await duplicateSuspicions(actor)
  return {
    pendingShows: pendingShows[0]?.count ?? 0,
    pendingPhotos: pendingPhotos[0]?.count ?? 0,
    openReports: openReports[0]?.count ?? 0,
    publishedShows: publishedShows[0]?.count ?? 0,
    venues: venueCount[0]?.count ?? 0,
    suspectShows: suspects.shows.length,
    suspectVenues: suspects.venues.length,
  }
})

/**
 * Records that look like the same thing entered twice. Exact duplicates cannot
 * occur -- slugs and venue match keys are unique -- so this catches the human
 * variation normalisation cannot: typos, a dropped word, a different subtitle.
 */
export const duplicateSuspicions = createServerOnlyFn(async (actor: Actor) => {
  assertAdmin(actor)
  const db = getDb()
  const [showRows, venueRows] = await Promise.all([
    db
      .select({ id: shows.id, title: shows.title, slug: shows.slug, status: shows.catalogStatus })
      .from(shows)
      .orderBy(asc(shows.title)),
    db
      .select({ id: venues.id, name: venues.name, city: venues.city })
      .from(venues)
      .orderBy(asc(venues.name)),
  ])
  return {
    shows: findSuspectPairs(showRows, (row) => looseTitleKey(row.title)),
    venues: findSuspectPairs(venueRows, (row) =>
      `${normalizeVenueName(row.name)} ${row.city ?? ''}`.trim(),
    ),
  }
})

/** Published shows with who submitted and who reviewed them. */
export const publishedShowsWithProvenance = createServerOnlyFn(async (actor: Actor) => {
  assertAdmin(actor)
  const submitter = alias(user, 'submitter')
  const reviewer = alias(user, 'reviewer')
  return getDb()
    .select({
      id: shows.id,
      title: shows.title,
      slug: shows.slug,
      type: shows.type,
      synopsis: shows.synopsis,
      createdAt: shows.createdAt,
      reviewedAt: shows.reviewedAt,
      submittedByName: submitter.name,
      reviewedByName: reviewer.name,
    })
    .from(shows)
    .leftJoin(submitter, eq(shows.submittedByUserId, submitter.id))
    .leftJoin(reviewer, eq(shows.reviewedByUserId, reviewer.id))
    .where(eq(shows.catalogStatus, 'published'))
    .orderBy(asc(shows.title))
})

export const getPublishedShowsWithProvenance = createServerFn({ method: 'GET' }).handler(async () =>
  publishedShowsWithProvenance((await requireSession()).user as Actor),
)

/** A published show an administrator can edit without going through review. */
export const publishedShowForAdmin = createServerOnlyFn(async (actor: Actor, id: string) => {
  assertAdmin(actor)
  const [row] = await getDb()
    .select({
      id: shows.id,
      title: shows.title,
      slug: shows.slug,
      type: shows.type,
      synopsis: shows.synopsis,
      catalogStatus: shows.catalogStatus,
      submittedByUserId: shows.submittedByUserId,
      reviewedByUserId: shows.reviewedByUserId,
      reviewedAt: shows.reviewedAt,
      createdAt: shows.createdAt,
    })
    .from(shows)
    .where(eq(shows.id, id))
    .limit(1)
  if (!row) throw new Error('That show does not exist.')
  return row
})

export const getAdminOverview = createServerFn({ method: 'GET' }).handler(async () =>
  adminOverview((await requireSession()).user as Actor),
)

export const getDuplicateSuspicions = createServerFn({ method: 'GET' }).handler(async () =>
  duplicateSuspicions((await requireSession()).user as Actor),
)

/** What the navigation badges show. */
export type NavBadges = {
  isAdmin: boolean
  /** Everything waiting on an administrator: submissions, photographs, reports. */
  waiting: number
  /** Friend requests waiting on this person, administrator or not. */
  friendRequests: number
}

/**
 * Everything the navigation badges need, in one round trip.
 *
 * The return type is stated rather than inferred. It was not, and the
 * administrator branch quietly returned an object without `friendRequests` —
 * so every administrator lost their friend-request badge, and nothing caught
 * it, because a server function's return type widens through serialisation.
 */
export const navBadgesFor = createServerOnlyFn(
  async (actor: { id: string; role?: string | null } | null): Promise<NavBadges> => {
    if (!actor) return { isAdmin: false, waiting: 0, friendRequests: 0 }

    // A friend request is waiting on the person, not on their role.
    const friendRequests = await pendingRequestCountFor(actor.id)
    if (actor.role !== 'admin') return { isAdmin: false, waiting: 0, friendRequests }

    const db = getDb()
    const [pendingShows, pendingPhotos, openReports] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(shows)
        .where(eq(shows.catalogStatus, 'pending')),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(showImages)
        .where(and(eq(showImages.visibility, 'public'), eq(showImages.reviewStatus, 'pending'))),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(reports)
        .where(eq(reports.status, 'open')),
    ])
    return {
      isAdmin: true,
      waiting:
        (pendingShows[0]?.count ?? 0) +
        (pendingPhotos[0]?.count ?? 0) +
        (openReports[0]?.count ?? 0),
      friendRequests,
    }
  },
)

/**
 * Resolved on the server because the client session type does not carry the
 * role, and because a badge that appears only after hydration reads as a glitch.
 */
export const getNavBadges = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await auth.api.getSession({ headers: getRequestHeaders() })
  return navBadgesFor(session?.user ?? null)
})
