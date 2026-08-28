import { createServerFn } from '@tanstack/react-start'
import { and, asc, eq, ilike, ne } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { z } from 'zod'

import { getDb } from './db/client'
import { libraryEntries, listItems, outings, productions, shows } from './db/schema'

type ShowType = 'musical' | 'play' | 'other'

const showInput = z.object({
  title: z.string().trim().min(1).max(200),
  type: z.enum(['musical', 'play', 'other']),
  synopsis: z.string().trim().max(5_000).optional(),
})

const catalogShow = {
  id: shows.id,
  title: shows.title,
  slug: shows.slug,
  type: shows.type,
  synopsis: shows.synopsis,
  coverImageKey: shows.coverImageKey,
}

export const searchPublishedShows = createServerFn({ method: 'GET' })
  .validator(z.object({ query: z.string().trim().max(100) }))
  .handler(async ({ data }) => {
    const query = data.query.replace(/[%_\\]/g, '\\$&')
    const conditions = [eq(shows.catalogStatus, 'published')]
    if (query) conditions.push(ilike(shows.title, `%${query}%`))

    return getDb()
      .select(catalogShow)
      .from(shows)
      .where(and(...conditions))
      .orderBy(asc(shows.title))
      .limit(30)
  })

export const getPublishedShow = createServerFn({ method: 'GET' })
  .validator(z.object({ slug: z.string().min(1).max(160) }))
  .handler(async ({ data }) => {
    const [show] = await getDb()
      .select(catalogShow)
      .from(shows)
      .where(and(eq(shows.slug, data.slug), eq(shows.catalogStatus, 'published')))
      .limit(1)
    return show ?? null
  })

function toSlug(title: string) {
  const slug = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
  return slug || 'show'
}

async function requireSession() {
  const { auth } = await import('./auth')
  const { getRequestHeaders } = await import('@tanstack/react-start/server')
  const session = await auth.api.getSession({ headers: getRequestHeaders() })
  if (!session) throw new Error('Unauthorized')
  return session
}

async function requireAdmin() {
  const session = await requireSession()
  if (session.user.role !== 'admin') throw new Error('Forbidden')
  return session
}

async function insertWithUniqueSlug({
  title,
  type,
  synopsis,
  submittedByUserId,
}: z.infer<typeof showInput> & { submittedByUserId: string }) {
  const baseSlug = toSlug(title)
  for (let suffix = 1; suffix <= 100; suffix++) {
    const slug = suffix === 1 ? baseSlug : `${baseSlug}-${suffix}`
    const [show] = await getDb()
      .insert(shows)
      .values({
        title,
        type,
        synopsis: synopsis || null,
        slug,
        submittedByUserId,
        catalogStatus: 'pending',
      })
      .onConflictDoNothing({ target: shows.slug })
      .returning({ id: shows.id, title: shows.title, slug: shows.slug })
    if (show) return show
  }
  throw new Error('Unable to create a unique URL for this show.')
}

export const submitShow = createServerFn({ method: 'POST' })
  .validator(showInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    return insertWithUniqueSlug({ ...data, submittedByUserId: session.user.id })
  })

const pendingShow = {
  ...catalogShow,
  submittedByUserId: shows.submittedByUserId,
  createdAt: shows.createdAt,
}

export const getPendingShows = createServerFn({ method: 'GET' }).handler(async () => {
  await requireAdmin()
  return getDb()
    .select(pendingShow)
    .from(shows)
    .where(eq(shows.catalogStatus, 'pending'))
    .orderBy(asc(shows.createdAt))
})

export const reviewShow = createServerFn({ method: 'POST' })
  .validator(
    showInput.extend({
      id: z.string().uuid(),
      action: z.enum(['publish', 'reject']),
      slug: z
        .string()
        .trim()
        .toLowerCase()
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
        .max(180),
    }),
  )
  .handler(async ({ data }) => {
    const session = await requireAdmin()
    const [slugConflict] = await getDb()
      .select({ id: shows.id })
      .from(shows)
      .where(and(eq(shows.slug, data.slug), ne(shows.id, data.id)))
      .limit(1)
    if (slugConflict) throw new Error('That URL slug is already in use.')

    const [show] = await getDb()
      .update(shows)
      .set({
        title: data.title,
        type: data.type as ShowType,
        synopsis: data.synopsis || null,
        slug: data.slug,
        catalogStatus: data.action === 'publish' ? 'published' : 'rejected',
        reviewedByUserId: session.user.id,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(shows.id, data.id), eq(shows.catalogStatus, 'pending')))
      .returning({ id: shows.id })
    if (!show) throw new Error('This submission is no longer awaiting review.')
  })

export const mergeShowIntoPublishedShow = createServerFn({ method: 'POST' })
  .validator(z.object({ sourceShowId: z.string().uuid(), targetSlug: z.string().min(1).max(180) }))
  .handler(async ({ data }) => {
    await requireAdmin()
    await getDb().transaction(async (tx) => {
      const targetLibraryEntries = alias(libraryEntries, 'target_library_entries')
      const targetListItems = alias(listItems, 'target_list_items')
      const [source] = await tx
        .select({ id: shows.id })
        .from(shows)
        .where(eq(shows.id, data.sourceShowId))
        .limit(1)
      const [target] = await tx
        .select({ id: shows.id })
        .from(shows)
        .where(and(eq(shows.slug, data.targetSlug), eq(shows.catalogStatus, 'published')))
        .limit(1)
      if (!source || !target) throw new Error('Choose an existing published show to merge into.')
      if (source.id === target.id) throw new Error('Choose a different show as the merge target.')

      const [libraryConflict] = await tx
        .select({ id: libraryEntries.id })
        .from(libraryEntries)
        .innerJoin(
          targetLibraryEntries,
          and(
            eq(libraryEntries.userId, targetLibraryEntries.userId),
            eq(targetLibraryEntries.showId, target.id),
          ),
        )
        .where(eq(libraryEntries.showId, source.id))
        .limit(1)
      if (libraryConflict) {
        throw new Error(
          'This merge would duplicate a member’s library entry. Resolve those entries first.',
        )
      }

      const [listConflict] = await tx
        .select({ listId: listItems.listId })
        .from(listItems)
        .innerJoin(
          targetListItems,
          and(eq(listItems.listId, targetListItems.listId), eq(targetListItems.showId, target.id)),
        )
        .where(eq(listItems.showId, source.id))
        .limit(1)
      if (listConflict) {
        throw new Error(
          'This merge would duplicate a show in a list. Resolve those list entries first.',
        )
      }

      await tx.update(listItems).set({ showId: target.id }).where(eq(listItems.showId, source.id))
      await tx
        .update(libraryEntries)
        .set({ showId: target.id, updatedAt: new Date() })
        .where(eq(libraryEntries.showId, source.id))
      await tx
        .update(productions)
        .set({ showId: target.id, updatedAt: new Date() })
        .where(eq(productions.showId, source.id))
      await tx
        .update(outings)
        .set({ showId: target.id, updatedAt: new Date() })
        .where(eq(outings.showId, source.id))
      await tx.delete(shows).where(eq(shows.id, source.id))
    })
  })
