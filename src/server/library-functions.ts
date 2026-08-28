import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { and, asc, eq } from 'drizzle-orm'
import { z } from 'zod'

import { auth } from './auth'
import { getDb } from './db/client'
import { libraryEntries, shows } from './db/schema'

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
  visibility: z.enum(['private', 'friends']).default('private'),
})

export const getMyLibrary = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await requireSession()
  return getDb()
    .select({
      id: libraryEntries.id,
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
    .where(eq(libraryEntries.userId, session.user.id))
    .orderBy(asc(shows.title))
})

export const saveLibraryEntry = createServerFn({ method: 'POST' })
  .validator(libraryInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    const [show] = await getDb()
      .select({ id: shows.id })
      .from(shows)
      .where(and(eq(shows.id, data.showId), eq(shows.catalogStatus, 'published')))
      .limit(1)
    if (!show) throw new Error('Choose a published show from the catalog.')

    await getDb()
      .insert(libraryEntries)
      .values({
        userId: session.user.id,
        showId: data.showId,
        status: data.status,
        favorite: data.favorite,
        rating: data.rating || null,
        review: data.review || null,
        visibility: data.visibility,
      })
      .onConflictDoUpdate({
        target: [libraryEntries.userId, libraryEntries.showId],
        set: {
          status: data.status,
          favorite: data.favorite,
          rating: data.rating || null,
          review: data.review || null,
          visibility: data.visibility,
          updatedAt: new Date(),
        },
      })
  })
