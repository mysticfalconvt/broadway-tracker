import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
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

const productionInput = z.object({
  showId: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  productionType: z.enum(['broadway', 'off_broadway', 'tour', 'regional', 'local', 'other']),
  venue: z.string().trim().max(200).optional(),
  city: z.string().trim().max(120).optional(),
  country: z.string().trim().max(120).optional(),
  openedOn: z.string().date().optional(),
  closedOn: z.string().date().optional(),
})

const catalogShow = {
  id: shows.id,
  title: shows.title,
  slug: shows.slug,
  type: shows.type,
  synopsis: shows.synopsis,
  coverImageKey: shows.coverImageKey,
}

export const searchCatalog = createServerOnlyFn(async (rawQuery: string) => {
  const query = rawQuery.replace(/[%_\\]/g, '\\$&')
  const conditions = [eq(shows.catalogStatus, 'published')]
  if (query) conditions.push(ilike(shows.title, `%${query}%`))

  return getDb()
    .select(catalogShow)
    .from(shows)
    .where(and(...conditions))
    .orderBy(asc(shows.title))
    .limit(30)
})

export const publishedShowBySlug = createServerOnlyFn(async (slug: string) => {
  const [show] = await getDb()
    .select(catalogShow)
    .from(shows)
    .where(and(eq(shows.slug, slug), eq(shows.catalogStatus, 'published')))
    .limit(1)
  return show ?? null
})

export const publishedProductionsForShow = createServerOnlyFn(async (showId: string) =>
  getDb()
    .select({
      id: productions.id,
      name: productions.name,
      venue: productions.venue,
      city: productions.city,
    })
    .from(productions)
    .innerJoin(shows, eq(productions.showId, shows.id))
    .where(and(eq(productions.showId, showId), eq(shows.catalogStatus, 'published')))
    .orderBy(asc(productions.name)),
)

export const searchPublishedShows = createServerFn({ method: 'GET' })
  .validator(z.object({ query: z.string().trim().max(100) }))
  .handler(async ({ data }) => searchCatalog(data.query))

export const getPublishedShow = createServerFn({ method: 'GET' })
  .validator(z.object({ slug: z.string().min(1).max(160) }))
  .handler(async ({ data }) => publishedShowBySlug(data.slug))

export const getPublishedProductions = createServerFn({ method: 'GET' })
  .validator(z.object({ showId: z.string().uuid() }))
  .handler(async ({ data }) => publishedProductionsForShow(data.showId))

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
  assertAdmin(session.user)
  return session
}

/** The acting user for a moderation action, as the core helpers below need it. */
export type Actor = { id: string; role: 'member' | 'admin' }

export function assertAdmin(actor: { role?: string | null }) {
  if (actor.role !== 'admin') throw new Error('Forbidden')
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

export const submitShowForUser = createServerOnlyFn(
  async (userId: string, data: z.infer<typeof showInput>) =>
    insertWithUniqueSlug({ ...data, submittedByUserId: userId }),
)

export const submitShow = createServerFn({ method: 'POST' })
  .validator(showInput)
  .handler(async ({ data }) => submitShowForUser((await requireSession()).user.id, data))

const pendingShow = {
  ...catalogShow,
  submittedByUserId: shows.submittedByUserId,
  createdAt: shows.createdAt,
}

export const pendingShowsForAdmin = createServerOnlyFn(async (actor: Actor) => {
  assertAdmin(actor)
  return getDb()
    .select(pendingShow)
    .from(shows)
    .where(eq(shows.catalogStatus, 'pending'))
    .orderBy(asc(shows.createdAt))
})

export const getPendingShows = createServerFn({ method: 'GET' }).handler(async () =>
  pendingShowsForAdmin((await requireSession()).user as Actor),
)

export const getPublishedShowsForAdmin = createServerFn({ method: 'GET' }).handler(async () => {
  await requireAdmin()
  return getDb()
    .select({ id: shows.id, title: shows.title, coverImageKey: shows.coverImageKey })
    .from(shows)
    .where(eq(shows.catalogStatus, 'published'))
    .orderBy(asc(shows.title))
})

export const getProductionsForAdmin = createServerFn({ method: 'GET' })
  .validator(z.object({ showId: z.string().uuid() }))
  .handler(async ({ data }) => {
    await requireAdmin()
    return getDb()
      .select()
      .from(productions)
      .where(eq(productions.showId, data.showId))
      .orderBy(asc(productions.name))
  })

export const saveProduction = createServerFn({ method: 'POST' })
  .validator(productionInput.extend({ id: z.string().uuid().optional() }))
  .handler(async ({ data }) => {
    await requireAdmin()
    const values = {
      showId: data.showId,
      name: data.name,
      productionType: data.productionType,
      venue: data.venue || null,
      city: data.city || null,
      country: data.country || null,
      openedOn: data.openedOn || null,
      closedOn: data.closedOn || null,
      updatedAt: new Date(),
    }
    if (data.id) {
      await getDb().update(productions).set(values).where(eq(productions.id, data.id))
      return
    }
    await getDb().insert(productions).values(values)
  })

export const deleteProduction = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    await requireAdmin()
    await getDb().delete(productions).where(eq(productions.id, data.id))
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
  .handler(async ({ data }) => reviewShowAsAdmin((await requireSession()).user as Actor, data))

export const reviewShowAsAdmin = createServerOnlyFn(
  async (
    actor: Actor,
    data: z.infer<typeof showInput> & {
      id: string
      action: 'publish' | 'reject'
      slug: string
    },
  ) => {
    assertAdmin(actor)
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
        reviewedByUserId: actor.id,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(shows.id, data.id), eq(shows.catalogStatus, 'pending')))
      .returning({ id: shows.id })
    if (!show) throw new Error('This submission is no longer awaiting review.')
  },
)

export const mergeShowIntoPublishedShow = createServerFn({ method: 'POST' })
  .validator(z.object({ sourceShowId: z.string().uuid(), targetSlug: z.string().min(1).max(180) }))
  .handler(async ({ data }) =>
    mergeShowAsAdmin((await requireSession()).user as Actor, data.sourceShowId, data.targetSlug),
  )

export const mergeShowAsAdmin = createServerOnlyFn(
  async (actor: Actor, sourceShowId: string, targetSlug: string) => {
    assertAdmin(actor)
    await getDb().transaction(async (tx) => {
      const targetLibraryEntries = alias(libraryEntries, 'target_library_entries')
      const targetListItems = alias(listItems, 'target_list_items')
      const [source] = await tx
        .select({ id: shows.id })
        .from(shows)
        .where(eq(shows.id, sourceShowId))
        .limit(1)
      const [target] = await tx
        .select({ id: shows.id })
        .from(shows)
        .where(and(eq(shows.slug, targetSlug), eq(shows.catalogStatus, 'published')))
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
  },
)
