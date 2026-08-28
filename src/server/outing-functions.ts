import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { and, eq, inArray, or } from 'drizzle-orm'
import { z } from 'zod'

import { auth } from './auth'
import { getDb } from './db/client'
import {
  friendships,
  libraryEntries,
  outingAttendees,
  outings,
  productions,
  shows,
  user,
} from './db/schema'

const datePrecision = z.enum(['exact', 'month', 'year', 'approximate', 'unknown'])
const outingInput = z
  .object({
    showId: z.string().uuid(),
    productionId: z.string().uuid().optional(),
    venue: z.string().trim().max(200).optional(),
    city: z.string().trim().max(120).optional(),
    country: z.string().trim().max(120).optional(),
    sharedNotes: z.string().trim().max(5000).optional(),
    visibility: z.enum(['private', 'friends']).default('private'),
    datePrecision,
    occurredOn: z.string().date().optional(),
    occurredMonth: z.number().int().min(1).max(12).optional(),
    occurredYear: z.number().int().min(1800).max(2200).optional(),
    approximateDate: z.string().trim().min(1).max(100).optional(),
    attendeeIds: z.array(z.string().uuid()).max(50).default([]),
    rating: z.number().int().min(1).max(10).optional(),
    favorite: z.boolean().default(false),
    review: z.string().trim().max(5000).optional(),
    reviewVisibility: z.enum(['private', 'friends']).default('private'),
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

export const createOuting = createServerFn({ method: 'POST' })
  .validator(outingInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    const attendeeIds = [...new Set(data.attendeeIds)].filter((id) => id !== session.user.id)
    const [show] = await getDb()
      .select({ id: shows.id })
      .from(shows)
      .where(and(eq(shows.id, data.showId), eq(shows.catalogStatus, 'published')))
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

      const [outing] = await tx
        .insert(outings)
        .values({
          showId: data.showId,
          productionId: data.productionId || null,
          createdByUserId: session.user.id,
          venue: data.venue || null,
          city: data.city || null,
          country: data.country || null,
          sharedNotes: data.sharedNotes || null,
          visibility: data.visibility,
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
          reviewVisibility: data.reviewVisibility,
          privateNotes: data.privateNotes || null,
        },
        ...attendeeIds.map((userId) => ({
          outingId: outing.id,
          userId,
          invitedByUserId: session.user.id,
          attendanceStatus: 'invited' as const,
          favorite: false,
          reviewVisibility: 'private' as const,
        })),
      ])
      return outing
    })
  })

export const getOuting = createServerFn({ method: 'GET' })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    const [attendance] = await getDb()
      .select({ userId: outingAttendees.userId })
      .from(outingAttendees)
      .where(
        and(eq(outingAttendees.outingId, data.id), eq(outingAttendees.userId, session.user.id)),
      )
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
        venue: outings.venue,
        city: outings.city,
        country: outings.country,
        sharedNotes: outings.sharedNotes,
        showTitle: shows.title,
        showType: shows.type,
        productionName: productions.name,
      })
      .from(outings)
      .innerJoin(shows, eq(outings.showId, shows.id))
      .leftJoin(productions, eq(outings.productionId, productions.id))
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
    return {
      ...outing,
      attendees: attendees.map((attendee) => ({
        ...attendee,
        privateNotes: attendee.userId === session.user.id ? attendee.privateNotes : null,
        // Friends-only reviews require the friendship visibility layer before
        // they can be exposed to other attendees.
        review: attendee.userId === session.user.id ? attendee.review : null,
      })),
    }
  })
