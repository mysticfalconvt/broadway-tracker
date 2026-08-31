import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { currentSession, requireSession } from './session'

import { normalizeVenueName } from '../lib/place'
import { findSuspectPairs } from '../lib/similarity'
import { pendingRequestCountFor } from './friend-functions'
import { type Actor, assertAdmin } from './catalog-functions'
import { getDb } from './db/client'
import {
  castings,
  friendships,
  libraryEntries,
  lists,
  outingAttendees,
  people,
  posts,
  productions,
  reports,
  showImages,
  shows,
  user,
  venues,
} from './db/schema'

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

/**
 * What has been added to the catalog lately, and by whom.
 *
 * A member's key can add cast to any show, which is more than the website
 * offers them and is deliberate — fifteen people filling a catalog that is
 * otherwise empty is the whole point of the layer. What makes that safe is not
 * a gate but a light on: every row says who entered it and whether a person
 * vouched for it or a machine read it off a page, so a bad run of entries is
 * visible as a run rather than having to be stumbled on one row at a time.
 */
export const recentContributions = createServerOnlyFn(async (actor: Actor, limit = 100) => {
  assertAdmin(actor)
  return getDb()
    .select({
      id: castings.id,
      role: castings.role,
      source: castings.source,
      sourceNote: castings.sourceNote,
      createdAt: castings.createdAt,
      personName: people.name,
      productionName: productions.name,
      showTitle: shows.title,
      showSlug: shows.slug,
      showStatus: shows.catalogStatus,
      byName: user.name,
      byHandle: user.handle,
    })
    .from(castings)
    .innerJoin(people, eq(castings.personId, people.id))
    .innerJoin(productions, eq(castings.productionId, productions.id))
    .innerJoin(shows, eq(productions.showId, shows.id))
    .leftJoin(user, eq(castings.createdByUserId, user.id))
    .orderBy(desc(castings.createdAt))
    .limit(limit)
})

export const getRecentContributions = createServerFn({ method: 'GET' }).handler(async () =>
  recentContributions((await requireSession()).user as Actor),
)

export const getAdminOverview = createServerFn({ method: 'GET' }).handler(async () =>
  adminOverview((await requireSession()).user as Actor),
)

export const getDuplicateSuspicions = createServerFn({ method: 'GET' }).handler(async () =>
  duplicateSuspicions((await requireSession()).user as Actor),
)

/**
 * Everybody, with enough about each to answer "who is actually using this".
 *
 * An administrator can already read the database, so nothing here is a new
 * disclosure — but it is still somebody's shelf and somebody's address, so it
 * is counts and settings rather than the contents of anybody's journal.
 */
export const membersForAdmin = createServerOnlyFn(async (actor: Actor) => {
  assertAdmin(actor)
  return getDb()
    .select({
      id: user.id,
      name: user.name,
      handle: user.handle,
      email: user.email,
      role: user.role,
      emailVerified: user.emailVerified,
      profileVisibility: user.profileVisibility,
      digestCadence: user.digestCadence,
      createdAt: user.createdAt,
      lastActiveAt: user.lastActiveAt,
      lastDigestAt: user.lastDigestAt,
      // The table names are interpolated and the columns written out: a bare
      // column reference renders unqualified and correlates against itself.
      nights: sql<number>`(select count(*)::int from ${outingAttendees} where ${outingAttendees}."user_id" = ${user}."id")`,
      shows: sql<number>`(select count(*)::int from ${libraryEntries} where ${libraryEntries}."user_id" = ${user}."id" and ${libraryEntries}."status" = 'seen')`,
      lists: sql<number>`(select count(*)::int from ${lists} where ${lists}."user_id" = ${user}."id")`,
      pieces: sql<number>`(select count(*)::int from ${posts} where ${posts}."author_user_id" = ${user}."id")`,
      photographs: sql<number>`(select count(*)::int from ${showImages} where ${showImages}."uploaded_by_user_id" = ${user}."id")`,
      friends: sql<number>`(select count(*)::int from ${friendships} where ${friendships}."status" = 'accepted' and (${friendships}."user_one_id" = ${user}."id" or ${friendships}."user_two_id" = ${user}."id"))`,
    })
    .from(user)
    .orderBy(desc(user.createdAt))
})

export const getMembersForAdmin = createServerFn({ method: 'GET' }).handler(async () =>
  membersForAdmin((await requireSession()).user as Actor),
)

/** What the navigation badges show. */
export type NavBadges = {
  isAdmin: boolean
  /** Everything waiting on an administrator: submissions, photographs, reports. */
  waiting: number
  /** Friend requests waiting on this person, administrator or not. */
  friendRequests: number
  /**
   * Whether this person has ever logged a night.
   *
   * Building a back catalogue is something you do once, at the beginning. Until
   * then it is the most useful thing on offer and belongs in the navigation;
   * afterwards it is clutter, and lives on the profile like everything else you
   * might occasionally want.
   */
  hasHistory: boolean
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
    // Honestly false: a signed-out visitor has no history. The navigation's
    // signed-out branch never reads this, so it cannot become a prompt at
    // somebody who has no account to build one in.
    if (!actor) return { isAdmin: false, waiting: 0, friendRequests: 0, hasHistory: false }

    // A friend request is waiting on the person, not on their role.
    const friendRequests = await pendingRequestCountFor(actor.id)
    const [logged] = await getDb()
      .select({ id: outingAttendees.outingId })
      .from(outingAttendees)
      .where(eq(outingAttendees.userId, actor.id))
      .limit(1)
    const hasHistory = Boolean(logged)
    if (actor.role !== 'admin') return { isAdmin: false, waiting: 0, friendRequests, hasHistory }

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
      hasHistory,
    }
  },
)

/**
 * Resolved on the server because the client session type does not carry the
 * role, and because a badge that appears only after hydration reads as a glitch.
 */
export const getNavBadges = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await currentSession()
  if (session) {
    // Every page makes this call, so it is where being here is noticed. Cheap
    // because it only writes when the record is more than an hour stale.
    const { touchActivity } = await import('./digest-functions')
    await touchActivity(session.user.id)
  }
  return navBadgesFor(session?.user ?? null)
})
