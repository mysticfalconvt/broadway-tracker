import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { and, eq, inArray, or, sql } from 'drizzle-orm'
import { z } from 'zod'

import { auth } from './auth'
import { getDb } from './db/client'
import { acceptedFriendIdsFor } from './friend-functions'
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

async function requireSession() {
  const session = await auth.api.getSession({ headers: getRequestHeaders() })
  if (!session) throw new Error('Unauthorized')
  return session
}

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
    const [show] = await getDb()
      .select({ id: shows.id })
      .from(shows)
      .where(and(eq(shows.id, data.showId), inArray(shows.catalogStatus, ['published', 'local'])))
      .limit(1)
    if (!show) throw new Error('Choose a published show from the catalog.')

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
          visibility: 'private',
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

export const outingForAttendee = createServerOnlyFn(async (viewerId: string, outingId: string) => {
  const session = { user: { id: viewerId } }
  const data = { id: outingId }
  const [attendance] = await getDb()
    .select({ userId: outingAttendees.userId })
    .from(outingAttendees)
    .where(and(eq(outingAttendees.outingId, data.id), eq(outingAttendees.userId, session.user.id)))
    .limit(1)
  if (!attendance) throw new Error('Unauthorized')

  const [outing] = await getDb()
    .select({
      id: outings.id,
      datePrecision: outings.datePrecision,
      occurredOn: outings.occurredOn,
      occurredMonth: outings.occurredMonth,
      occurredYear: outings.occurredYear,
      approximateDate: outings.approximateDate,
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
  const { likelyCastOn, seenPerformersFor } = await import('./people-functions')

  // A recorded answer replaces the guess entirely. Once somebody has said who
  // they saw, showing them an inference alongside it would be arguing with them
  // about their own evening.
  const seenCast = await seenPerformersFor(session.user.id, data.id)
  const likelyCast =
    seenCast.length === 0 && outing.productionId && outing.datePrecision === 'exact'
      ? await likelyCastOn(outing.productionId, outing.occurredOn)
      : []

  return {
    ...outing,
    likelyCast,
    seenCast,
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

export const outingsForUserAndShow = createServerOnlyFn(async (viewerId: string, showId: string) =>
  getDb()
    .select({
      id: outings.id,
      datePrecision: outings.datePrecision,
      occurredOn: outings.occurredOn,
      occurredMonth: outings.occurredMonth,
      occurredYear: outings.occurredYear,
      approximateDate: outings.approximateDate,
      venue: outings.venue,
      city: outings.city,
      productionName: productions.name,
    })
    .from(outingAttendees)
    .innerJoin(outings, eq(outingAttendees.outingId, outings.id))
    .leftJoin(productions, eq(outings.productionId, productions.id))
    .where(and(eq(outingAttendees.userId, viewerId), eq(outings.showId, showId))),
)

export const createOuting = createServerFn({ method: 'POST' })
  .validator(outingInput)
  .handler(async ({ data }) => createOutingForUser((await requireSession()).user.id, data))

export const getOuting = createServerFn({ method: 'GET' })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => outingForAttendee((await requireSession()).user.id, data.id))

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
  reviewVisibility: z.enum(['private', 'friends', 'public']).default('friends'),
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
        reviewVisibility: data.reviewVisibility,
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
