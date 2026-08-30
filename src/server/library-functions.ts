import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'

import { auth } from './auth'
import { getDb } from './db/client'
import { libraryEntries, shows } from './db/schema'
import { applyViewerCovers } from './image-functions'
import { defaultVisibilityFor } from './visibility'

async function requireSession() {
  const session = await auth.api.getSession({ headers: getRequestHeaders() })
  if (!session) throw new Error('Unauthorized')
  return session
}

const libraryInput = z.object({
  showId: z.string().uuid(),
  status: z.enum(['want_to_see', 'seen']),
  favorite: z.boolean().default(false),
  rating: z.number().int().min(1).max(10).optional(),
  review: z.string().trim().max(5000).optional(),
  // Left unset so it can follow the person's profile setting.
  visibility: z.enum(['private', 'friends', 'public']).optional(),
})

// The exported helpers below hold the authorization rules and take the acting
// user explicitly, so they can be exercised without a request. `createServerOnlyFn`
// keeps the database client out of the browser bundle.

export const libraryForOwner = createServerOnlyFn(async (ownerId: string) => {
  const rows = await getDb()
    .select({
      entryId: libraryEntries.id,
      showId: shows.id,
      status: libraryEntries.status,
      favorite: libraryEntries.favorite,
      rating: libraryEntries.rating,
      review: libraryEntries.review,
      visibility: libraryEntries.visibility,
      title: shows.title,
      slug: shows.slug,
      type: shows.type,
      coverImageKey: shows.coverImageKey,
    })
    .from(libraryEntries)
    .innerJoin(shows, eq(libraryEntries.showId, shows.id))
    .where(eq(libraryEntries.userId, ownerId))
    .orderBy(asc(shows.title))
  // A person's own photograph stands in for the catalog cover, for them.
  return applyViewerCovers(
    ownerId,
    rows.map((row) => ({ ...row, id: row.showId })),
  )
})

export const saveEntryForOwner = createServerOnlyFn(
  async (ownerId: string, data: z.infer<typeof libraryInput>) => {
    const [show] = await getDb()
      .select({ id: shows.id })
      .from(shows)
      .where(and(eq(shows.id, data.showId), inArray(shows.catalogStatus, ['published', 'local'])))
      .limit(1)
    if (!show) throw new Error('Choose a published show from the catalog.')

    await getDb()
      .insert(libraryEntries)
      .values({
        userId: ownerId,
        showId: data.showId,
        status: data.status,
        favorite: data.favorite,
        rating: data.rating || null,
        review: data.review || null,
        visibility: data.visibility ?? (await defaultVisibilityFor(ownerId)),
      })
      .onConflictDoUpdate({
        target: [libraryEntries.userId, libraryEntries.showId],
        set: {
          status: data.status,
          favorite: data.favorite,
          rating: data.rating || null,
          review: data.review || null,
          visibility: data.visibility ?? (await defaultVisibilityFor(ownerId)),
          updatedAt: new Date(),
        },
      })
  },
)

/**
 * Where the reader already stands with one show: what they have marked, and
 * every night of it they have logged.
 *
 * Answered in one call from the route loader rather than fetched after mount,
 * because the buttons depend on it — offering "mark as seen" to somebody who
 * logged this show last year, and then swapping it a moment later, is worse
 * than waiting.
 */
export const showStateForViewer = createServerOnlyFn(
  async (viewerId: string | null, showId: string) => {
    if (!viewerId) return { entry: null, outings: [] }
    const db = getDb()
    const [entry] = await db
      .select({
        status: libraryEntries.status,
        favorite: libraryEntries.favorite,
        rating: libraryEntries.rating,
        review: libraryEntries.review,
        visibility: libraryEntries.visibility,
      })
      .from(libraryEntries)
      .where(and(eq(libraryEntries.userId, viewerId), eq(libraryEntries.showId, showId)))
      .limit(1)
    const { outingsForUserAndShow } = await import('./outing-functions')
    return { entry: entry ?? null, outings: await outingsForUserAndShow(viewerId, showId) }
  },
)

export const getMyShowState = createServerFn({ method: 'GET' })
  .validator(z.object({ showId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { auth } = await import('./auth')
    const { getRequestHeaders } = await import('@tanstack/react-start/server')
    const session = await auth.api.getSession({ headers: getRequestHeaders() })
    return showStateForViewer(session?.user.id ?? null, data.showId)
  })

export const getMyLibrary = createServerFn({ method: 'GET' }).handler(async () =>
  libraryForOwner((await requireSession()).user.id),
)

export const saveLibraryEntry = createServerFn({ method: 'POST' })
  .validator(libraryInput)
  .handler(async ({ data }) => saveEntryForOwner((await requireSession()).user.id, data))
