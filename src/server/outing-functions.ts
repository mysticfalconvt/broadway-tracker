import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'

import { dateWindow } from '../lib/fuzzy-date'
import { normalizeRole } from '../lib/person'
import { and, asc, desc, eq, inArray, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { requireSession } from './session'

import { getDb } from './db/client'
import { acceptedFriendIdsFor, areFriends } from './friend-functions'
import { defaultVisibilityFor } from './visibility'
import { findOrCreateVenue } from './venue-functions'
import {
  friendships,
  libraryEntries,
  outingAttendees,
  outings,
  productions,
  shows,
  user,
  venues,
} from './db/schema'

const datePrecision = z.enum(['exact', 'month', 'year', 'approximate', 'unknown'])
export const outingInput = z
  .object({
    showId: z.string().uuid(),
    productionId: z.string().uuid().optional(),
    venue: z.string().trim().max(200).optional(),
    city: z.string().trim().max(120).optional(),
    country: z.string().trim().max(120).optional(),
    sharedNotes: z.string().trim().max(5000).optional(),
    visibility: z.enum(['private', 'friends', 'public']).optional(),
    datePrecision,
    occurredOn: z.string().date().optional(),
    occurredMonth: z.number().int().min(1).max(12).optional(),
    occurredYear: z.number().int().min(1800).max(2200).optional(),
    approximateDate: z.string().trim().min(1).max(100).optional(),
    /**
     * Curtain-up, as a clock time. Optional, and only meaningful with a date.
     *
     * Two performances on one day is the case worth recording — a matinee and
     * an evening, or the two parts of a show that comes in two.
     */
    curtain: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'A time looks like 14:00.')
      .optional(),
    attendeeIds: z.array(z.string().uuid()).max(50).default([]),
    rating: z.number().int().min(1).max(10).optional(),
    favorite: z.boolean().default(false),
    review: z.string().trim().max(5000).optional(),
    reviewVisibility: z.enum(['private', 'friends', 'public']).optional(),
    privateNotes: z.string().trim().max(5000).optional(),
  })
  .superRefine((data, context) => {
    if (data.datePrecision === 'exact' && !data.occurredOn) {
      context.addIssue({
        code: 'custom',
        path: ['occurredOn'],
        message: 'An exact date is required.',
      })
    }
    if (data.datePrecision === 'month' && (!data.occurredMonth || !data.occurredYear)) {
      context.addIssue({
        code: 'custom',
        path: ['occurredMonth'],
        message: 'A month and year are required.',
      })
    }
    if (data.datePrecision === 'year' && !data.occurredYear) {
      context.addIssue({ code: 'custom', path: ['occurredYear'], message: 'A year is required.' })
    }
    if (data.datePrecision === 'approximate' && !data.approximateDate) {
      context.addIssue({
        code: 'custom',
        path: ['approximateDate'],
        message: 'An approximate date is required.',
      })
    }
  })

// The exported helpers below hold the authorization rules and take the acting
// user explicitly, so they can be exercised without a request. `createServerOnlyFn`
// keeps the database client out of the browser bundle.

export const createOutingForUser = createServerOnlyFn(
  async (actorId: string, data: z.infer<typeof outingInput>) => {
    const session = { user: { id: actorId } }
    // Unstated sharing follows the logger's profile, so somebody who shares
    // openly does not have to say so on every night out.
    const fallbackVisibility = await defaultVisibilityFor(actorId)
    const attendeeIds = [...new Set(data.attendeeIds)].filter((id) => id !== session.user.id)
    // A show still awaiting review is loggable by whoever submitted it. Waiting
    // for an administrator before you can record last night is the sort of delay
    // that means the night never gets recorded at all, and nobody else can find
    // a pending show anyway. If it is later merged into a catalog record, the
    // outing follows it.
    const [show] = await getDb()
      .select({ id: shows.id })
      .from(shows)
      .where(
        and(
          eq(shows.id, data.showId),
          or(
            inArray(shows.catalogStatus, ['published', 'local']),
            and(eq(shows.catalogStatus, 'pending'), eq(shows.submittedByUserId, session.user.id)),
          ),
        ),
      )
      .limit(1)
    if (!show) throw new Error('Choose a show from the catalog.')

    if (data.productionId) {
      const [production] = await getDb()
        .select({ id: productions.id })
        .from(productions)
        .where(and(eq(productions.id, data.productionId), eq(productions.showId, data.showId)))
        .limit(1)
      if (!production) throw new Error('That production does not belong to the selected show.')
    }

    if (attendeeIds.length) {
      const relationships = await getDb()
        .select({ userOneId: friendships.userOneId, userTwoId: friendships.userTwoId })
        .from(friendships)
        .where(
          and(
            eq(friendships.status, 'accepted'),
            or(
              and(
                eq(friendships.userOneId, session.user.id),
                inArray(friendships.userTwoId, attendeeIds),
              ),
              and(
                eq(friendships.userTwoId, session.user.id),
                inArray(friendships.userOneId, attendeeIds),
              ),
            ),
          ),
        )
      const approvedIds = new Set(
        relationships.map((relationship) =>
          relationship.userOneId === session.user.id
            ? relationship.userTwoId
            : relationship.userOneId,
        ),
      )
      if (attendeeIds.some((id) => !approvedIds.has(id))) {
        throw new Error('You can only invite approved friends to a shared outing.')
      }
    }

    return getDb().transaction(async (tx) => {
      const [libraryEntry] = await tx
        .select({ id: libraryEntries.id, favorite: libraryEntries.favorite })
        .from(libraryEntries)
        .where(
          and(eq(libraryEntries.userId, session.user.id), eq(libraryEntries.showId, data.showId)),
        )
        .limit(1)
      if (libraryEntry) {
        await tx
          .update(libraryEntries)
          .set({
            status: 'seen',
            favorite: libraryEntry.favorite || data.favorite,
            updatedAt: new Date(),
          })
          .where(eq(libraryEntries.id, libraryEntry.id))
      } else {
        await tx.insert(libraryEntries).values({
          userId: session.user.id,
          showId: data.showId,
          status: 'seen',
          favorite: data.favorite,
          // The same choice as the night it came from. Hardcoding 'private'
          // here meant every show anybody logged was marked seen-but-hidden,
          // whatever their profile said, so friends' shelves were always empty.
          visibility: data.visibility ?? fallbackVisibility,
        })
      }

      // A typed venue is resolved to the shared record so the same theatre
      // entered four different ways stays one place.
      const venue = data.venue
        ? await findOrCreateVenue(session.user.id, data.venue, data.city, data.country)
        : null

      const [outing] = await tx
        .insert(outings)
        .values({
          showId: data.showId,
          productionId: data.productionId || null,
          venueId: venue?.id ?? null,
          createdByUserId: session.user.id,
          venue: data.venue || null,
          city: data.city || null,
          country: data.country || null,
          sharedNotes: data.sharedNotes || null,
          visibility: data.visibility ?? fallbackVisibility,
          datePrecision: data.datePrecision,
          occurredOn: data.datePrecision === 'exact' ? data.occurredOn : null,
          occurredMonth: data.datePrecision === 'month' ? data.occurredMonth : null,
          occurredYear: ['month', 'year'].includes(data.datePrecision) ? data.occurredYear : null,
          approximateDate: data.datePrecision === 'approximate' ? data.approximateDate : null,
          // Only alongside a real date. A curtain time on "some time in the
          // nineties" says nothing and reads as though it does.
          curtain: data.occurredOn ? (data.curtain ?? null) : null,
        })
        .returning({ id: outings.id })
      if (!outing) throw new Error('Unable to create this outing.')

      await tx.insert(outingAttendees).values([
        {
          outingId: outing.id,
          userId: session.user.id,
          invitedByUserId: session.user.id,
          attendanceStatus: 'accepted',
          rating: data.rating || null,
          favorite: data.favorite,
          review: data.review || null,
          reviewVisibility: data.reviewVisibility ?? fallbackVisibility,
          privateNotes: data.privateNotes || null,
        },
        ...attendeeIds.map((userId) => ({
          outingId: outing.id,
          userId,
          invitedByUserId: session.user.id,
          attendanceStatus: 'invited' as const,
          favorite: false,
          reviewVisibility: fallbackVisibility,
        })),
      ])
      return outing
    })
  },
)

/**
 * One night, as a particular person is allowed to see it.
 *
 * Two kinds of reader reach this page. Somebody who was there sees their own
 * evening and can write on it. A friend who was not sees the night itself —
 * what, when, where, and whatever the people on it chose to share — and is
 * offered the chance to say they were there too. Anybody else gets the same
 * answer as for a night that does not exist.
 */
export const outingForViewer = createServerOnlyFn(async (viewerId: string, outingId: string) => {
  const session = { user: { id: viewerId } }
  const data = { id: outingId }
  const [attendance] = await getDb()
    .select({ userId: outingAttendees.userId })
    .from(outingAttendees)
    .where(and(eq(outingAttendees.outingId, data.id), eq(outingAttendees.userId, session.user.id)))
    .limit(1)

  if (!attendance) {
    const [owned] = await getDb()
      .select({ ownerId: outings.createdByUserId, visibility: outings.visibility })
      .from(outings)
      .where(eq(outings.id, data.id))
      .limit(1)
    const shared =
      owned && owned.visibility !== 'private' && (await areFriends(session.user.id, owned.ownerId))
    if (!shared) throw new Error('Unauthorized')
  }

  const [outing] = await getDb()
    .select({
      id: outings.id,
      datePrecision: outings.datePrecision,
      occurredOn: outings.occurredOn,
      occurredMonth: outings.occurredMonth,
      occurredYear: outings.occurredYear,
      approximateDate: outings.approximateDate,
      curtain: outings.curtain,
      // Prefer the shared venue record, falling back to whatever was typed.
      venue: sql<string | null>`coalesce(${venues.name}, ${outings.venue})`,
      city: sql<string | null>`coalesce(${venues.city}, ${outings.city})`,
      country: outings.country,
      venueId: outings.venueId,
      productionId: outings.productionId,
      sharedNotes: outings.sharedNotes,
      visibility: outings.visibility,
      createdByUserId: outings.createdByUserId,
      showId: outings.showId,
      showTitle: shows.title,
      showSlug: shows.slug,
      showType: shows.type,
      showSynopsis: shows.synopsis,
      showCoverImageKey: shows.coverImageKey,
      productionName: productions.name,
      productionType: productions.productionType,
    })
    .from(outings)
    .innerJoin(shows, eq(outings.showId, shows.id))
    .leftJoin(productions, eq(outings.productionId, productions.id))
    .leftJoin(venues, eq(outings.venueId, venues.id))
    .where(eq(outings.id, data.id))
    .limit(1)
  if (!outing) throw new Error('Outing not found')

  const attendees = await getDb()
    .select({
      userId: outingAttendees.userId,
      name: user.name,
      attendanceStatus: outingAttendees.attendanceStatus,
      rating: outingAttendees.rating,
      favorite: outingAttendees.favorite,
      review: outingAttendees.review,
      reviewVisibility: outingAttendees.reviewVisibility,
      privateNotes: outingAttendees.privateNotes,
    })
    .from(outingAttendees)
    .innerJoin(user, eq(outingAttendees.userId, user.id))
    .where(eq(outingAttendees.outingId, data.id))
  // Attending the same night does not make two people friends, so what another
  // attendee wrote is governed by their own visibility setting and whether this
  // reader is actually an approved friend of theirs.
  const friendIds = await acceptedFriendIdsFor(session.user.id)

  // Only an exact date can be matched against a casting window. A year is not
  // enough to say who was on stage that night, and offering a guess from one
  // would be presenting a coin flip as a memory.
  const { castAcross, seenPerformersFor } = await import('./people-functions')

  // A recorded answer replaces the guess **for the roles it speaks to**, not
  // for the whole night.
  //
  // It used to replace all of it, on the reasoning that arguing with somebody
  // about their own evening is rude. True — but the commonest thing anybody
  // records is a single correction: an understudy went on. Dropping the rest of
  // the inference then punished the one act the feature exists for, and left a
  // twelve-person company showing one name.
  const seenCast = attendance ? await seenPerformersFor(session.user.id, data.id) : []
  // Compared through the same normaliser both sides were written with. Two
  // people typing the same track will not match on a raw string.
  const spokenFor = new Set(
    seenCast.filter((row) => row.role).map((row) => normalizeRole(row.role!)),
  )
  const alreadyNamed = new Set(seenCast.map((row) => row.personId))
  // A month or a year is a range, and a company that held all of it is as sure
  // as one that held a single night. Requiring an exact day meant the person
  // who declined to invent one lost the cast entirely.
  const window = dateWindow(outing)
  // "Who you probably saw" is addressed to somebody who was in the room.
  const across =
    attendance && outing.productionId && window
      ? await castAcross(outing.productionId, window.from, window.to)
      : { certain: [], possible: [] }
  const notAlreadySaid = (member: { role: string; personId: string }) =>
    !spokenFor.has(normalizeRole(member.role)) && !alreadyNamed.has(member.personId)
  const likelyCast = across.certain.filter(notAlreadySaid)
  /**
   * Somebody whose run overlaps part of the window but not all of it.
   *
   * Kept apart from the certain ones rather than dropped. A performer who
   * joined mid-month is the single most useful name for dating a half-
   * remembered night, and is exactly who a whole-window rule throws away.
   */
  const possibleCast = across.possible.filter(notAlreadySaid)

  const { applyViewerCovers } = await import('./image-functions')
  const [withCover] = await applyViewerCovers(
    session.user.id,
    [{ showId: outing.showId, coverImageKey: outing.showCoverImageKey }],
    (row) => row.showId,
  )

  return {
    ...outing,
    showCoverImageKey: withCover?.coverImageKey ?? outing.showCoverImageKey,
    likelyCast,
    possibleCast,
    seenCast,
    // Somebody who was there, or a friend looking in. A visitor is shown the
    // night but offered nothing to write on it.
    viewerRole: attendance ? ('attendee' as const) : ('visitor' as const),
    // The reader's other nights of the same show. A second viewing is its own
    // memory, and worth being able to step between.
    otherNights: (await outingsForUserAndShow(session.user.id, outing.showId)).filter(
      (night) => night.id !== data.id,
    ),
    // Shared facts belong to whoever logged the night.
    canEditFacts: outing.createdByUserId === session.user.id,
    attendees: attendees.map((attendee) => {
      const isOwn = attendee.userId === session.user.id
      const sharedWithReader =
        isOwn ||
        // Marked public: shared with everyone who can see this night, whether
        // or not the two of them are friends.
        attendee.reviewVisibility === 'public' ||
        (attendee.reviewVisibility === 'friends' && friendIds.has(attendee.userId))
      return {
        ...attendee,
        isOwn,
        // A private note is never anyone else's, whatever the friendship.
        privateNotes: isOwn ? attendee.privateNotes : null,
        review: sharedWithReader ? attendee.review : null,
        // So the page can say "kept private" rather than implying none was written.
        hasWithheldReview: !sharedWithReader && Boolean(attendee.review),
      }
    }),
  }
})

/**
 * A whole journal, a page at a time.
 *
 * The only way to enumerate nights was by year, and that path cannot see all of
 * them: a night recorded as "some time in the nineties" has no year to match,
 * so it is invisible to the one query that could count it. Answering "how many
 * shows have I tracked" took forty-four calls and still missed those.
 */
export const nightsForUser = createServerOnlyFn(
  async (viewerId: string, limit = 50, offset = 0) => {
    const rows = await getDb()
      .select({
        outingId: outings.id,
        showId: outings.showId,
        showTitle: shows.title,
        productionId: outings.productionId,
        datePrecision: outings.datePrecision,
        occurredOn: outings.occurredOn,
        occurredMonth: outings.occurredMonth,
        occurredYear: outings.occurredYear,
        approximateDate: outings.approximateDate,
        curtain: outings.curtain,
        venue: sql<string | null>`coalesce(${venues.name}, ${outings.venue})`,
        city: sql<string | null>`coalesce(${venues.city}, ${outings.city})`,
      })
      .from(outingAttendees)
      .innerJoin(outings, eq(outingAttendees.outingId, outings.id))
      .innerJoin(shows, eq(outings.showId, shows.id))
      .leftJoin(venues, eq(outings.venueId, venues.id))
      .where(eq(outingAttendees.userId, viewerId))
      // Undated nights sort last rather than being dropped, which is the whole
      // point of having this at all.
      // Two performances on one day come back in the order they happened.
      .orderBy(
        desc(outings.occurredOn),
        desc(outings.occurredYear),
        asc(outings.curtain),
        desc(outings.createdAt),
      )
      .limit(limit)
      .offset(offset)

    const [counted] = await getDb()
      .select({ total: sql<number>`count(*)::int` })
      .from(outingAttendees)
      .where(eq(outingAttendees.userId, viewerId))

    const total = counted?.total ?? 0
    return {
      nights: rows,
      total,
      // Handed back rather than left to be worked out, so a caller cannot
      // page past the end or stop one short.
      nextAfter: offset + rows.length < total ? offset + rows.length : null,
    }
  },
)

export const outingsForUserAndShow = createServerOnlyFn(async (viewerId: string, showId: string) =>
  getDb()
    .select({
      id: outings.id,
      datePrecision: outings.datePrecision,
      occurredOn: outings.occurredOn,
      occurredMonth: outings.occurredMonth,
      occurredYear: outings.occurredYear,
      approximateDate: outings.approximateDate,
      curtain: outings.curtain,
      venue: outings.venue,
      city: outings.city,
      productionName: productions.name,
    })
    .from(outingAttendees)
    .innerJoin(outings, eq(outingAttendees.outingId, outings.id))
    .leftJoin(productions, eq(outings.productionId, productions.id))
    .where(and(eq(outingAttendees.userId, viewerId), eq(outings.showId, showId))),
)

/**
 * Joins somebody else's night, because you were there too.
 *
 * A shared evening is one outing with several people on it — that is what the
 * attendee table is for — so this adds the reader to the night rather than
 * copying it. A duplicate would give the same evening two records, two dates to
 * keep in step, and two entries in everybody's history.
 *
 * Only a night the reader can already see, only among approved friends, and
 * reversible: `leaveOuting` takes it back. Their own rating, review, and notes
 * start empty, because they are theirs to write.
 */
export const joinOutingAsAttendee = createServerOnlyFn(async (userId: string, outingId: string) => {
  const db = getDb()
  const [outing] = await db
    .select({
      id: outings.id,
      showId: outings.showId,
      ownerId: outings.createdByUserId,
      visibility: outings.visibility,
    })
    .from(outings)
    .where(eq(outings.id, outingId))
    .limit(1)
  // The same answer as a night that does not exist, so this never confirms one.
  if (!outing) throw new Error('That performance is not available.')
  if (outing.ownerId === userId) throw new Error('This is already your night.')
  if (outing.visibility === 'private' || !(await areFriends(userId, outing.ownerId))) {
    throw new Error('That performance is not available.')
  }

  const [already] = await db
    .select({ userId: outingAttendees.userId })
    .from(outingAttendees)
    .where(and(eq(outingAttendees.outingId, outingId), eq(outingAttendees.userId, userId)))
    .limit(1)
  if (already) throw new Error('You are already on this night.')

  const fallbackVisibility = await defaultVisibilityFor(userId)
  await db.transaction(async (tx) => {
    await tx.insert(outingAttendees).values({
      outingId,
      userId,
      invitedByUserId: userId,
      attendanceStatus: 'accepted',
      reviewVisibility: fallbackVisibility,
    })
    // Having been there means having seen it.
    const [entry] = await tx
      .select({ id: libraryEntries.id })
      .from(libraryEntries)
      .where(and(eq(libraryEntries.userId, userId), eq(libraryEntries.showId, outing.showId)))
      .limit(1)
    if (entry) {
      await tx
        .update(libraryEntries)
        .set({ status: 'seen', updatedAt: new Date() })
        .where(eq(libraryEntries.id, entry.id))
    } else {
      await tx.insert(libraryEntries).values({
        userId,
        showId: outing.showId,
        status: 'seen',
        visibility: fallbackVisibility,
      })
    }
  })
  return { outingId, showId: outing.showId }
})

/** Takes back a mistaken "I was there too". The owner's night is left alone. */
export const leaveOuting = createServerOnlyFn(async (userId: string, outingId: string) => {
  const db = getDb()
  const [outing] = await db
    .select({ ownerId: outings.createdByUserId })
    .from(outings)
    .where(eq(outings.id, outingId))
    .limit(1)
  if (!outing) throw new Error('That performance is not available.')
  if (outing.ownerId === userId) {
    throw new Error('This is your own night — delete it instead of leaving it.')
  }
  await db
    .delete(outingAttendees)
    .where(and(eq(outingAttendees.outingId, outingId), eq(outingAttendees.userId, userId)))
})

export const joinOuting = createServerFn({ method: 'POST' })
  .validator(z.object({ outingId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    return joinOutingAsAttendee(session.user.id, data.outingId)
  })

export const dropOutOfOuting = createServerFn({ method: 'POST' })
  .validator(z.object({ outingId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    return leaveOuting(session.user.id, data.outingId)
  })

export const createOuting = createServerFn({ method: 'POST' })
  .validator(outingInput)
  .handler(async ({ data }) => createOutingForUser((await requireSession()).user.id, data))

export const getOuting = createServerFn({ method: 'GET' })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => outingForViewer((await requireSession()).user.id, data.id))

export const getMyOutingsForShow = createServerFn({ method: 'GET' })
  .validator(z.object({ showId: z.string().uuid() }))
  .handler(async ({ data }) => outingsForUserAndShow((await requireSession()).user.id, data.showId))

const sharedFactsInput = z
  .object({
    outingId: z.string().uuid(),
    productionId: z.string().uuid().optional(),
    venue: z.string().trim().max(200).optional(),
    city: z.string().trim().max(120).optional(),
    country: z.string().trim().max(120).optional(),
    sharedNotes: z.string().trim().max(5000).optional(),
    visibility: z.enum(['private', 'friends', 'public']).optional(),
    datePrecision,
    occurredOn: z.string().date().optional(),
    occurredMonth: z.number().int().min(1).max(12).optional(),
    occurredYear: z.number().int().min(1800).max(2200).optional(),
    approximateDate: z.string().trim().min(1).max(100).optional(),
    /**
     * Curtain-up, as a clock time. Optional, and only meaningful with a date.
     *
     * Two performances on one day is the case worth recording — a matinee and
     * an evening, or the two parts of a show that comes in two.
     */
    curtain: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'A time looks like 14:00.')
      .optional(),
  })
  .superRefine((data, context) => {
    if (data.datePrecision === 'exact' && !data.occurredOn) {
      context.addIssue({
        code: 'custom',
        path: ['occurredOn'],
        message: 'An exact date is required.',
      })
    }
    if (data.datePrecision === 'month' && (!data.occurredMonth || !data.occurredYear)) {
      context.addIssue({
        code: 'custom',
        path: ['occurredMonth'],
        message: 'A month and year are required.',
      })
    }
    if (data.datePrecision === 'year' && !data.occurredYear) {
      context.addIssue({ code: 'custom', path: ['occurredYear'], message: 'A year is required.' })
    }
    if (data.datePrecision === 'approximate' && !data.approximateDate) {
      context.addIssue({
        code: 'custom',
        path: ['approximateDate'],
        message: 'An approximate date is required.',
      })
    }
  })

const myReactionInput = z.object({
  outingId: z.string().uuid(),
  rating: z.number().int().min(1).max(10).optional(),
  favorite: z.boolean().default(false),
  review: z.string().trim().max(5000).optional(),
  // Absent means "follow my profile", filled in below. A default here would
  // pin every review to one level regardless of what the person set.
  reviewVisibility: z.enum(['private', 'friends', 'public']).optional(),
  privateNotes: z.string().trim().max(5000).optional(),
})

/**
 * Edits the facts of the night: which production, where, when, and the note
 * everyone who was there can read.
 *
 * Only the person who logged it may change these. They are shared, so an
 * attendee correcting the date for everybody else would be editing other
 * people's memories — what each attendee owns is their own reaction, below.
 */
/**
 * The shared facts of a night, as its owner would edit them.
 *
 * `updateOutingFacts` writes the whole set, so anything wanting to change one
 * field has to send the rest back unchanged. This is where it gets them, and it
 * refuses for anybody but the person whose night it is — the same rule the
 * write applies, asked before rather than after.
 */
export const nightForEditing = createServerOnlyFn(async (actorId: string, outingId: string) => {
  const [night] = await getDb()
    .select({
      productionId: outings.productionId,
      venue: sql<string | null>`coalesce(${venues.name}, ${outings.venue})`,
      city: sql<string | null>`coalesce(${venues.city}, ${outings.city})`,
      country: outings.country,
      sharedNotes: outings.sharedNotes,
      datePrecision: outings.datePrecision,
      occurredOn: outings.occurredOn,
      occurredMonth: outings.occurredMonth,
      occurredYear: outings.occurredYear,
      approximateDate: outings.approximateDate,
      curtain: outings.curtain,
      createdByUserId: outings.createdByUserId,
    })
    .from(outings)
    .leftJoin(venues, eq(outings.venueId, venues.id))
    .where(eq(outings.id, outingId))
    .limit(1)
  if (!night) throw new Error('That night is not in your journal.')
  if (night.createdByUserId !== actorId) {
    throw new Error('Only the person who logged this night can change its details.')
  }

  const { createdByUserId, ...facts } = night
  // Nulls out, so a spread over them does not reintroduce a field as null and
  // fail validation that expects it absent.
  return Object.fromEntries(
    Object.entries(facts).filter(([, value]) => value !== null && value !== undefined),
  ) as Record<string, unknown>
})

export const updateOutingFacts = createServerOnlyFn(
  async (actorId: string, data: z.infer<typeof sharedFactsInput>) => {
    const db = getDb()
    const [outing] = await db
      .select({ id: outings.id, createdByUserId: outings.createdByUserId, showId: outings.showId })
      .from(outings)
      .where(eq(outings.id, data.outingId))
      .limit(1)
    if (!outing) throw new Error('Outing not found')
    if (outing.createdByUserId !== actorId) {
      throw new Error('Only the person who logged this night can change its details.')
    }

    if (data.productionId) {
      const [production] = await db
        .select({ id: productions.id })
        .from(productions)
        .where(and(eq(productions.id, data.productionId), eq(productions.showId, outing.showId)))
        .limit(1)
      if (!production) throw new Error('That production does not belong to this show.')
    }

    const venue = data.venue
      ? await findOrCreateVenue(actorId, data.venue, data.city, data.country)
      : null

    await db
      .update(outings)
      .set({
        productionId: data.productionId || null,
        venueId: venue?.id ?? null,
        venue: data.venue || null,
        city: data.city || null,
        country: data.country || null,
        sharedNotes: data.sharedNotes || null,
        ...(data.visibility ? { visibility: data.visibility } : {}),
        datePrecision: data.datePrecision,
        occurredOn: data.datePrecision === 'exact' ? data.occurredOn : null,
        occurredMonth: data.datePrecision === 'month' ? data.occurredMonth : null,
        occurredYear: ['month', 'year'].includes(data.datePrecision) ? data.occurredYear : null,
        approximateDate: data.datePrecision === 'approximate' ? data.approximateDate : null,
        curtain: data.occurredOn ? (data.curtain ?? null) : null,
        updatedAt: new Date(),
      })
      .where(eq(outings.id, data.outingId))
  },
)

/** Edits the reader's own reaction. Everyone who was there owns their own row. */
export const updateMyReaction = createServerOnlyFn(
  async (actorId: string, data: z.infer<typeof myReactionInput>) => {
    const db = getDb()
    const [attendance] = await db
      .select({ userId: outingAttendees.userId })
      .from(outingAttendees)
      .where(and(eq(outingAttendees.outingId, data.outingId), eq(outingAttendees.userId, actorId)))
      .limit(1)
    if (!attendance) throw new Error('You were not at this performance.')

    await db
      .update(outingAttendees)
      .set({
        rating: data.rating || null,
        favorite: data.favorite,
        review: data.review || null,
        reviewVisibility: data.reviewVisibility ?? (await defaultVisibilityFor(actorId)),
        privateNotes: data.privateNotes || null,
        // Editing your own row is also how an invitation is accepted.
        attendanceStatus: 'accepted',
        updatedAt: new Date(),
      })
      .where(and(eq(outingAttendees.outingId, data.outingId), eq(outingAttendees.userId, actorId)))
  },
)

export const saveOutingFacts = createServerFn({ method: 'POST' })
  .validator(sharedFactsInput)
  .handler(async ({ data }) => updateOutingFacts((await requireSession()).user.id, data))

export const saveMyReaction = createServerFn({ method: 'POST' })
  .validator(myReactionInput)
  .handler(async ({ data }) => updateMyReaction((await requireSession()).user.id, data))
