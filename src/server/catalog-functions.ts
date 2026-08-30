import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
import { and, asc, eq, ilike, ne, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { z } from 'zod'

import { getDb } from './db/client'
import { libraryEntries, listItems, outings, productions, shows, user, venues } from './db/schema'

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
      productionType: productions.productionType,
      // The canonical venue where one is linked, falling back to whatever was
      // typed, so a production recorded before venues existed still reads.
      venue: sql<string | null>`coalesce(${venues.name}, ${productions.venue})`,
      city: sql<string | null>`coalesce(${venues.city}, ${productions.city})`,
      country: productions.country,
      openedOn: productions.openedOn,
      closedOn: productions.closedOn,
    })
    .from(productions)
    .innerJoin(shows, eq(productions.showId, shows.id))
    .leftJoin(venues, eq(productions.venueId, venues.id))
    .where(
      and(
        eq(productions.showId, showId),
        eq(shows.catalogStatus, 'published'),
        // A school's staging is a real production, but putting it in the list
        // every member sees for a popular show would bury the professional
        // ones. Local stagings surface at their venue instead.
        eq(productions.scope, 'catalog'),
      ),
    )
    .orderBy(asc(productions.openedOn), asc(productions.name)),
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
    .select({ ...pendingShow, submittedByName: user.name, submittedByHandle: user.handle })
    .from(shows)
    .leftJoin(user, eq(shows.submittedByUserId, user.id))
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

/**
 * Saves a production, resolving its venue onto the shared record.
 *
 * The free text is kept alongside the reference so nothing is lost if a venue is
 * later merged, but the reference is what the venue list and the deduplication
 * rely on -- a production saved here has to link the same way an imported one
 * does, or venues entered by hand quietly fall outside the system.
 */
export const saveProductionForAdmin = createServerOnlyFn(
  async (actor: Actor, data: z.infer<typeof productionInput> & { id?: string }) => {
    assertAdmin(actor)
    const { findOrCreateVenue } = await import('./venue-functions')
    const venue = data.venue
      ? await findOrCreateVenue(actor.id, data.venue, data.city, data.country)
      : null
    const values = {
      showId: data.showId,
      venueId: venue?.id ?? null,
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
  },
)

export const saveProduction = createServerFn({ method: 'POST' })
  .validator(productionInput.extend({ id: z.string().uuid().optional() }))
  .handler(async ({ data }) => saveProductionForAdmin((await requireSession()).user as Actor, data))

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
      .returning({ id: shows.id, title: shows.title, slug: shows.slug })
    if (!show) throw new Error('This submission is no longer awaiting review.')
    await notifySubmitter(data.id, show.title, show.slug, data.action)
  },
)

/**
 * Tells the person who submitted a show what happened to it. Someone who adds a
 * missing show is doing the catalog a favour and otherwise never hears back.
 * Delivery failures are logged rather than thrown: the decision itself has
 * already been recorded and must not be undone by a mail problem.
 */
async function notifySubmitter(
  showId: string,
  title: string,
  slug: string,
  action: 'publish' | 'reject',
) {
  try {
    const [row] = await getDb()
      .select({ email: user.email, name: user.name })
      .from(shows)
      .innerJoin(user, eq(shows.submittedByUserId, user.id))
      .where(eq(shows.id, showId))
      .limit(1)
    if (!row) return

    const { sendEmail } = await import('./email')
    const base = process.env.BETTER_AUTH_URL ?? ''
    await sendEmail({
      to: row.email,
      subject:
        action === 'publish'
          ? `${title} is now in the Broadway Tracker catalog`
          : `About your Broadway Tracker submission`,
      text:
        action === 'publish'
          ? `Thank you — ${title} has been added to the shared catalog and anyone can log it now.\n\n${base}/shows/${slug}`
          : `Thanks for suggesting ${title}. It hasn't been added to the catalog this time — often that means it is already there under another name. If you think that's wrong, just reply and let us know.`,
    })
  } catch (error) {
    console.error('[catalog] could not notify the submitter', error)
  }
}

/**
 * Corrects an already-published record. `reviewShowAsAdmin` deliberately only
 * touches submissions awaiting a decision, so fixing a typo on a live show
 * needed its own path rather than a round trip back through the queue.
 */
export const editPublishedShow = createServerOnlyFn(
  async (actor: Actor, data: z.infer<typeof showInput> & { id: string; slug: string }) => {
    assertAdmin(actor)
    const [slugConflict] = await getDb()
      .select({ id: shows.id })
      .from(shows)
      .where(and(eq(shows.slug, data.slug), ne(shows.id, data.id)))
      .limit(1)
    if (slugConflict) throw new Error('That URL slug is already in use.')

    const [updated] = await getDb()
      .update(shows)
      .set({
        title: data.title,
        type: data.type as ShowType,
        synopsis: data.synopsis || null,
        slug: data.slug,
        updatedAt: new Date(),
      })
      .where(and(eq(shows.id, data.id), eq(shows.catalogStatus, 'published')))
      .returning({ id: shows.id })
    if (!updated) throw new Error('That published show does not exist.')
  },
)

export const savePublishedShow = createServerFn({ method: 'POST' })
  .validator(
    showInput.extend({
      id: z.string().uuid(),
      slug: z
        .string()
        .trim()
        .toLowerCase()
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
        .max(180),
    }),
  )
  .handler(async ({ data }) => editPublishedShow((await requireSession()).user as Actor, data))

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

/**
 * Finds or creates a production of a show, for a member logging a night.
 *
 * A production is the *staging* — Original Broadway, First National Tour, a
 * local company's summer run — not a place. A tour plays many venues, so the
 * venue belongs to the performance, not here. Matching is therefore on the show
 * and the name, which is what makes "I saw the tour in Montreal" and "I saw the
 * tour in Toronto" the same production.
 *
 * Open to members deliberately, like venues: an administrator merging the
 * occasional duplicate is a far smaller cost than every tour stop needing
 * review before somebody can record their own evening.
 */
export const findOrCreateProduction = createServerOnlyFn(
  async (
    userId: string,
    showId: string,
    name: string,
    productionType: z.infer<typeof productionInput>['productionType'],
    venue?: string | null,
    city?: string | null,
  ) => {
    const cleanName = name.trim().replace(/\s+/g, ' ')
    if (!cleanName) throw new Error('A production needs a name.')

    const db = getDb()
    const [show] = await db
      .select({ id: shows.id })
      .from(shows)
      .where(and(eq(shows.id, showId), eq(shows.catalogStatus, 'published')))
      .limit(1)
    if (!show) throw new Error('Choose a published show from the catalog.')

    // Compare the way venues do, so "National Tour" and "national tour" agree.
    const wanted = normalizeProductionName(cleanName)
    const existing = await db
      .select({ id: productions.id, name: productions.name })
      .from(productions)
      .where(eq(productions.showId, showId))
    const match = existing.find((row) => normalizeProductionName(row.name) === wanted)
    if (match) return { id: match.id, created: false }

    const linkedVenue = venue
      ? await (await import('./venue-functions')).findOrCreateVenue(userId, venue, city)
      : null
    const [created] = await db
      .insert(productions)
      .values({
        showId,
        name: cleanName,
        productionType,
        venueId: linkedVenue?.id ?? null,
        venue: venue || null,
        city: city || null,
      })
      .returning({ id: productions.id })
    if (!created) throw new Error('Unable to record that production.')
    return { id: created.id, created: true }
  },
)

/** Ignores case, punctuation, and the words that appear on nearly every staging. */
export function normalizeProductionName(value: string) {
  const noise = new Set(['the', 'a', 'production', 'company', 'run'])
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((word) => word && !noise.has(word))
    .join(' ')
}

/**
 * A local staging of a catalog show, recorded by a member without review.
 *
 * The whole difficulty is convergence. Two people from the same town who both
 * saw their high school's *Dear Evan Hansen* must land on one record, and they
 * will never type the same name for it — one writes "Lincoln High School 2019",
 * the other "LHS spring musical". What they do agree on is the school and the
 * year, so that is the key. Different nights of one run converge; the 2019 and
 * 2022 stagings stay apart.
 *
 * A run spanning New Year is recorded as two, which is wrong but rare, and less
 * wrong than folding two years' productions into one.
 */
export const findOrCreateLocalProduction = createServerOnlyFn(
  async (userId: string, showId: string, venueName: string, city: string | null, year: number) => {
    if (!Number.isInteger(year) || year < 1800 || year > 2200) {
      throw new Error('A local staging needs the year you saw it.')
    }
    const db = getDb()
    const [show] = await db
      .select({ id: shows.id })
      .from(shows)
      .where(and(eq(shows.id, showId), eq(shows.catalogStatus, 'published')))
      .limit(1)
    if (!show) throw new Error('Choose a published show from the catalog.')

    const venue = await (await import('./venue-functions')).findOrCreateVenue(
      userId,
      venueName,
      city,
    )
    const localKey = `${showId}:${venue.id}:${year}`

    const [existing] = await db
      .select({ id: productions.id })
      .from(productions)
      .where(eq(productions.localKey, localKey))
      .limit(1)
    if (existing) return { id: existing.id, created: false }

    const [created] = await db
      .insert(productions)
      .values({
        showId,
        name: `${venue.name}, ${year}`,
        productionType: 'local',
        scope: 'local',
        localKey,
        venueId: venue.id,
        venue: venue.name,
        city: venue.city,
      })
      .onConflictDoNothing({ target: productions.localKey })
      .returning({ id: productions.id })
    if (created) return { id: created.id, created: true }

    // Somebody else in town recorded it between the read and the write.
    const [raced] = await db
      .select({ id: productions.id })
      .from(productions)
      .where(eq(productions.localKey, localKey))
      .limit(1)
    if (!raced) throw new Error('Unable to record that staging.')
    return { id: raced.id, created: false }
  },
)

/**
 * Local stagings of a show at one venue, so the second person to log a night
 * there is offered the first person's record instead of making another.
 */
export const localProductionsAt = createServerOnlyFn(
  async (showId: string, venueName: string, city: string | null) => {
    const { venueKey, tidyPlace } = await import('../lib/place')
    const cleanName = tidyPlace(venueName)
    if (!cleanName) return []
    const key = venueKey(cleanName, city ? tidyPlace(city) : null)
    return getDb()
      .select({
        id: productions.id,
        name: productions.name,
        productionType: productions.productionType,
        venue: venues.name,
        city: venues.city,
        country: productions.country,
        openedOn: productions.openedOn,
        closedOn: productions.closedOn,
      })
      .from(productions)
      .innerJoin(venues, eq(productions.venueId, venues.id))
      .where(
        and(
          eq(productions.showId, showId),
          eq(productions.scope, 'local'),
          eq(venues.matchKey, key),
        ),
      )
      .orderBy(asc(productions.name))
  },
)

export const addLocalProduction = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      showId: z.string().uuid(),
      venue: z.string().trim().min(1).max(200),
      city: z.string().trim().max(120).optional(),
      year: z.number().int().min(1800).max(2200),
    }),
  )
  .handler(async ({ data }) => {
    const session = await requireSession()
    return findOrCreateLocalProduction(
      session.user.id,
      data.showId,
      data.venue,
      data.city ?? null,
      data.year,
    )
  })

export const getLocalProductionsAt = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      showId: z.string().uuid(),
      venue: z.string().trim().max(200),
      city: z.string().trim().max(120).optional(),
    }),
  )
  .handler(async ({ data }) => {
    await requireSession()
    return localProductionsAt(data.showId, data.venue, data.city ?? null)
  })

export const addProduction = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      showId: z.string().uuid(),
      name: z.string().trim().min(1).max(200),
      productionType: z.enum(['broadway', 'off_broadway', 'tour', 'regional', 'local', 'other']),
      venue: z.string().trim().max(200).optional(),
      city: z.string().trim().max(120).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const session = await requireSession()
    return findOrCreateProduction(
      session.user.id,
      data.showId,
      data.name,
      data.productionType,
      data.venue,
      data.city,
    )
  })
