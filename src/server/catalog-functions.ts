import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
import { and, asc, desc, eq, ilike, ne, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { z } from 'zod'

import { localTitleKey } from '../lib/show'
import { getDb } from './db/client'
import {
  libraryEntries,
  listItems,
  outingAttendees,
  outings,
  productions,
  shows,
  user,
  venues,
} from './db/schema'

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

/**
 * A show a member recorded for themselves, readable by anyone signed in.
 *
 * Kept apart from the published lookup rather than folded into it, because that
 * one answers the public route: a local record carries a school's name and the
 * fact that somebody was there, which is not for the open web.
 */
export const localShowBySlug = createServerOnlyFn(async (slug: string) => {
  const [show] = await getDb()
    .select(catalogShow)
    .from(shows)
    .where(and(eq(shows.slug, slug), eq(shows.catalogStatus, 'local')))
    .limit(1)
  return show ?? null
})

/** Every staging of a local show, which is the only way one is ever reached. */
export const localProductionsForShow = createServerOnlyFn(async (showId: string) =>
  getDb()
    .select({
      id: productions.id,
      name: productions.name,
      productionType: productions.productionType,
      venue: sql<string | null>`coalesce(${venues.name}, ${productions.venue})`,
      city: sql<string | null>`coalesce(${venues.city}, ${productions.city})`,
      country: productions.country,
      openedOn: productions.openedOn,
      closedOn: productions.closedOn,
    })
    .from(productions)
    .leftJoin(venues, eq(productions.venueId, venues.id))
    .where(eq(productions.showId, showId))
    .orderBy(asc(productions.name)),
)

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
  .handler(async ({ data }) => {
    const { auth } = await import('./auth')
    const { getRequestHeaders } = await import('@tanstack/react-start/server')
    const session = await auth.api.getSession({ headers: getRequestHeaders() })
    const { applyViewerCovers } = await import('./image-functions')
    return applyViewerCovers(session?.user.id ?? null, await searchCatalog(data.query))
  })

export const getPublishedShow = createServerFn({ method: 'GET' })
  .validator(z.object({ slug: z.string().min(1).max(160) }))
  .handler(async ({ data }) => publishedShowBySlug(data.slug))

/**
 * The show behind a slug, for the show page.
 *
 * Published records answer to anybody. A local one answers only to somebody
 * signed in, so the open web never sees a school's name attached to the fact
 * that somebody was there.
 */
export const getShowBySlug = createServerFn({ method: 'GET' })
  .validator(z.object({ slug: z.string().min(1).max(160) }))
  .handler(async ({ data }) => {
    const published = await publishedShowBySlug(data.slug)
    if (published) return { show: published, scope: 'catalog' as const, mayEdit: false }

    const { auth } = await import('./auth')
    const { getRequestHeaders } = await import('@tanstack/react-start/server')
    const session = await auth.api.getSession({ headers: getRequestHeaders() })
    if (!session) return { show: null, scope: 'catalog' as const, mayEdit: false }

    const local = await localShowBySlug(data.slug)
    if (!local) return { show: null, scope: 'catalog' as const, mayEdit: false }
    return {
      show: local,
      scope: 'local' as const,
      mayEdit: await mayEditLocalShow(session.user.id, local.id),
    }
  })

/** Stagings for the show page, whichever kind of record it turned out to be. */
export const getProductionsForShow = createServerFn({ method: 'GET' })
  .validator(z.object({ showId: z.string().uuid(), scope: z.enum(['catalog', 'local']) }))
  .handler(async ({ data }) =>
    data.scope === 'local'
      ? localProductionsForShow(data.showId)
      : publishedProductionsForShow(data.showId),
  )

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
  catalogStatus = 'pending',
  localKey = null,
}: z.infer<typeof showInput> & {
  submittedByUserId: string
  catalogStatus?: 'pending' | 'local'
  localKey?: string | null
}) {
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
        catalogStatus,
        localKey,
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

/**
 * Recently recorded productions across every show, newest first.
 *
 * After a bulk import the thing an administrator wants to fix is whatever just
 * landed, and they do not know which show to pick from a list of hundreds to
 * find it. This is the flat view: search it, or just look at the top.
 */
export const recentProductionsForAdmin = createServerOnlyFn(
  async (actor: Actor, query = '', limit = 40) => {
    assertAdmin(actor)
    const needle = query.trim().replace(/[%_\\]/g, '\\$&')
    const filters = needle
      ? [
          or(
            ilike(shows.title, `%${needle}%`),
            ilike(productions.name, `%${needle}%`),
            ilike(venues.name, `%${needle}%`),
          ),
        ]
      : []
    return getDb()
      .select({
        id: productions.id,
        name: productions.name,
        productionType: productions.productionType,
        scope: productions.scope,
        venue: sql<string | null>`coalesce(${venues.name}, ${productions.venue})`,
        city: sql<string | null>`coalesce(${venues.city}, ${productions.city})`,
        country: productions.country,
        openedOn: productions.openedOn,
        closedOn: productions.closedOn,
        createdAt: productions.createdAt,
        showId: shows.id,
        showTitle: shows.title,
      })
      .from(productions)
      .innerJoin(shows, eq(productions.showId, shows.id))
      .leftJoin(venues, eq(productions.venueId, venues.id))
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(productions.createdAt))
      .limit(limit)
  },
)

export const getRecentProductions = createServerFn({ method: 'GET' })
  .validator(z.object({ query: z.string().trim().max(120).optional() }))
  .handler(async ({ data }) =>
    recentProductionsForAdmin((await requireSession()).user as Actor, data.query ?? ''),
  )

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

    // Somebody can log a night against their own submission while it waits, so
    // rejecting one would leave a real memory pointing at a record nothing will
    // ever show. Merging it into the right catalog entry carries the night over;
    // rejection does not.
    if (data.action === 'reject') {
      const [logged] = await getDb()
        .select({ id: outings.id })
        .from(outings)
        .where(eq(outings.showId, data.id))
        .limit(1)
      if (logged) {
        throw new Error(
          'Somebody has recorded a night against this submission. Merge it into the right show instead of rejecting it.',
        )
      }
    }

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
/**
 * A work that exists nowhere but this town: a community theatre's own revue, a
 * school's devised piece. Recorded without review, because an administrator
 * approving a record only one family will ever read makes the shared catalog
 * worse and the queue longer.
 *
 * The show and its staging are made together, because a local work has no
 * meaning apart from where it was put on. Convergence follows the same rule as
 * local stagings: the title and the hall, which two people from the same town
 * agree about. It stays deliberately conservative — a second record an
 * administrator can merge is a smaller error than folding two different works
 * into one.
 */
export const findOrCreateLocalShow = createServerOnlyFn(
  async (
    userId: string,
    title: string,
    type: 'musical' | 'play' | 'other',
    venueName: string,
    city: string | null,
    year: number,
  ) => {
    const cleanTitle = title.trim().replace(/\s+/g, ' ')
    if (!cleanTitle) throw new Error('A show needs a title.')
    if (!Number.isInteger(year) || year < 1800 || year > 2200) {
      throw new Error('A local show needs the year you saw it.')
    }

    const venue = await (await import('./venue-functions')).findOrCreateVenue(
      userId,
      venueName,
      city,
    )
    const localKey = `${localTitleKey(cleanTitle)}:${venue.id}`

    const db = getDb()
    const [existing] = await db
      .select({ id: shows.id, slug: shows.slug, title: shows.title })
      .from(shows)
      .where(eq(shows.localKey, localKey))
      .limit(1)

    const show =
      existing ??
      (await insertWithUniqueSlug({
        title: cleanTitle,
        type,
        submittedByUserId: userId,
        catalogStatus: 'local',
        localKey,
      }))

    // The staging is what a night actually attaches to, and it converges on the
    // year the same way a school's production of a known work does.
    const production = await findOrCreateLocalStaging(show.id, venue, year)
    return { show, productionId: production.id, created: !existing }
  },
)

type ResolvedVenue = { id: string; name: string; city: string | null }

/** The staging itself, once the show and the hall are both settled. */
async function findOrCreateLocalStaging(showId: string, venue: ResolvedVenue, year: number) {
  const db = getDb()
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
}

export const findOrCreateLocalProduction = createServerOnlyFn(
  async (userId: string, showId: string, venueName: string, city: string | null, year: number) => {
    if (!Number.isInteger(year) || year < 1800 || year > 2200) {
      throw new Error('A local staging needs the year you saw it.')
    }
    const [show] = await getDb()
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
    return findOrCreateLocalStaging(showId, venue, year)
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

/**
 * Whether this person may correct a local record.
 *
 * The people who were in the room own it. That is whoever first wrote it down
 * and anyone who has logged a night at it — not every member, because another
 * town's record is not theirs to rewrite, and not the author alone, because two
 * families share one record by design and either may have made the typo.
 */
export const mayEditLocalShow = createServerOnlyFn(
  async (userId: string | null, showId: string) => {
    if (!userId) return false
    const db = getDb()
    const [show] = await db
      .select({ status: shows.catalogStatus, author: shows.submittedByUserId })
      .from(shows)
      .where(eq(shows.id, showId))
      .limit(1)
    if (!show || show.status !== 'local') return false
    if (show.author === userId) return true

    const [attended] = await db
      .select({ id: outings.id })
      .from(outings)
      .innerJoin(outingAttendees, eq(outingAttendees.outingId, outings.id))
      .where(and(eq(outings.showId, showId), eq(outingAttendees.userId, userId)))
      .limit(1)
    return Boolean(attended)
  },
)

/**
 * The venue a local record is keyed on, read back out of the key itself.
 *
 * A show is keyed `title:venue` and a staging `show:venue:year`, so the venue
 * sits second in both. Neither a normalised title nor a uuid can contain a
 * colon, so the separators are unambiguous.
 */
function venueIdFromLocalKey(localKey: string | null) {
  return localKey?.split(':')[1] || null
}

/**
 * Corrects a local record: its title, what kind of thing it was, a description,
 * and the hall it was staged in.
 *
 * All four can be wrong the moment they are typed, and three of them key the
 * record — the title keys the show, the hall keys the show and every staging
 * under it. So a correction recomputes those keys, and refuses when the result
 * would collide with a record that already exists rather than silently making a
 * second one or destroying the first. The URL never moves: it may already have
 * been handed to somebody.
 */
export const editLocalShow = createServerOnlyFn(
  async (
    userId: string,
    showId: string,
    data: {
      title: string
      type: ShowType
      synopsis?: string | null
      venue: string
      city?: string | null
    },
  ) => {
    if (!(await mayEditLocalShow(userId, showId))) {
      throw new Error('Only the people who were there can correct this record.')
    }
    const title = data.title.trim().replace(/\s+/g, ' ')
    const titleKey = localTitleKey(title)
    if (!title || !titleKey) throw new Error('A show needs a title.')
    if (!data.venue.trim()) throw new Error('A local show needs the place it was staged.')

    const venue = await (await import('./venue-functions')).findOrCreateVenue(
      userId,
      data.venue,
      data.city ?? null,
    )
    const db = getDb()
    const localKey = `${titleKey}:${venue.id}`

    const [clash] = await db
      .select({ id: shows.id, title: shows.title })
      .from(shows)
      .where(and(eq(shows.localKey, localKey), ne(shows.id, showId)))
      .limit(1)
    if (clash) {
      throw new Error(
        `“${clash.title}” is already recorded at that place — this would duplicate it.`,
      )
    }

    return db.transaction(async (tx) => {
      // Every staging moves with the hall, and each carries the hall in its own
      // key, so a rehousing that would collide has to be caught too.
      const stagings = await tx.select().from(productions).where(eq(productions.showId, showId))
      for (const staging of stagings) {
        const year = staging.localKey?.split(':')[2]
        if (!year) continue
        const stagingKey = `${showId}:${venue.id}:${year}`
        const [stagingClash] = await tx
          .select({ id: productions.id })
          .from(productions)
          .where(and(eq(productions.localKey, stagingKey), ne(productions.id, staging.id)))
          .limit(1)
        if (stagingClash) {
          throw new Error(
            `Two ${year} stagings would end up at that place. Correct them one at a time.`,
          )
        }
        await tx
          .update(productions)
          .set({
            localKey: stagingKey,
            venueId: venue.id,
            venue: venue.name,
            city: venue.city,
            name: `${venue.name}, ${year}`,
            updatedAt: new Date(),
          })
          .where(eq(productions.id, staging.id))
      }

      const [updated] = await tx
        .update(shows)
        .set({
          title,
          type: data.type,
          synopsis: data.synopsis?.trim() || null,
          localKey,
          updatedAt: new Date(),
        })
        .where(and(eq(shows.id, showId), eq(shows.catalogStatus, 'local')))
        .returning({ id: shows.id, title: shows.title, slug: shows.slug })
      if (!updated) throw new Error('That local show does not exist.')
      return updated
    })
  },
)

/** Corrects the year of one staging, which is the other half of its key. */
export const editLocalStagingYear = createServerOnlyFn(
  async (userId: string, productionId: string, year: number) => {
    if (!Number.isInteger(year) || year < 1800 || year > 2200) {
      throw new Error('A staging needs the year you saw it.')
    }
    const db = getDb()
    const [staging] = await db
      .select()
      .from(productions)
      .where(and(eq(productions.id, productionId), eq(productions.scope, 'local')))
      .limit(1)
    if (!staging) throw new Error('That staging does not exist.')
    if (!(await mayEditLocalShow(userId, staging.showId))) {
      throw new Error('Only the people who were there can correct this record.')
    }
    const venueId = venueIdFromLocalKey(staging.localKey)
    if (!venueId) throw new Error('That staging cannot be corrected.')

    const localKey = `${staging.showId}:${venueId}:${year}`
    const [clash] = await db
      .select({ id: productions.id })
      .from(productions)
      .where(and(eq(productions.localKey, localKey), ne(productions.id, productionId)))
      .limit(1)
    if (clash) throw new Error(`A ${year} staging is already recorded there.`)

    const venueName = staging.venue ?? 'Unknown'
    await db
      .update(productions)
      .set({ localKey, name: `${venueName}, ${year}`, updatedAt: new Date() })
      .where(eq(productions.id, productionId))
  },
)

/**
 * Lifts a local record into the shared catalog.
 *
 * Some local work turns out to be of general interest — a company's original
 * musical that goes on to be staged elsewhere. Promotion drops the local key so
 * the record deduplicates by title from then on, and leaves the staging alone:
 * it really did happen at that hall in that year.
 */
export const promoteLocalShow = createServerOnlyFn(async (actor: Actor, showId: string) => {
  assertAdmin(actor)
  const db = getDb()
  const [promoted] = await db
    .update(shows)
    .set({
      catalogStatus: 'published',
      localKey: null,
      reviewedByUserId: actor.id,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(shows.id, showId), eq(shows.catalogStatus, 'local')))
    .returning({ id: shows.id, title: shows.title, slug: shows.slug })
  if (!promoted) throw new Error('That is not a local show.')
  return promoted
})

/** Local shows, for the administrator deciding whether any deserves promotion. */
export const localShowsForAdmin = createServerOnlyFn(async (actor: Actor) => {
  assertAdmin(actor)
  return getDb()
    .select({
      id: shows.id,
      title: shows.title,
      slug: shows.slug,
      type: shows.type,
      createdAt: shows.createdAt,
      // The hall it was staged in is the only thing that identifies it.
      venue: sql<string | null>`(
        select ${venues}."name" from ${productions}
        join ${venues} on ${venues}."id" = ${productions}."venue_id"
        where ${productions}."show_id" = ${shows}."id"
        order by ${productions}."created_at" limit 1
      )`,
      stagings: sql<number>`(select count(*)::int from ${productions} where ${productions}."show_id" = ${shows}."id")`,
      nights: sql<number>`(select count(*)::int from ${outings} where ${outings}."show_id" = ${shows}."id")`,
    })
    .from(shows)
    .where(eq(shows.catalogStatus, 'local'))
    .orderBy(asc(shows.title))
})

export const addLocalShow = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      title: z.string().trim().min(1).max(200),
      type: z.enum(['musical', 'play', 'other']),
      venue: z.string().trim().min(1).max(200),
      city: z.string().trim().max(120).optional(),
      year: z.number().int().min(1800).max(2200),
    }),
  )
  .handler(async ({ data }) => {
    const session = await requireSession()
    return findOrCreateLocalShow(
      session.user.id,
      data.title,
      data.type,
      data.venue,
      data.city ?? null,
      data.year,
    )
  })

export const saveLocalShow = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      showId: z.string().uuid(),
      title: z.string().trim().min(1).max(200),
      type: z.enum(['musical', 'play', 'other']),
      synopsis: z.string().trim().max(5_000).optional(),
      venue: z.string().trim().min(1).max(200),
      city: z.string().trim().max(120).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const session = await requireSession()
    return editLocalShow(session.user.id, data.showId, {
      title: data.title,
      type: data.type,
      synopsis: data.synopsis ?? null,
      venue: data.venue,
      city: data.city ?? null,
    })
  })

export const saveLocalStagingYear = createServerFn({ method: 'POST' })
  .validator(
    z.object({ productionId: z.string().uuid(), year: z.number().int().min(1800).max(2200) }),
  )
  .handler(async ({ data }) => {
    const session = await requireSession()
    return editLocalStagingYear(session.user.id, data.productionId, data.year)
  })

export const getLocalShowsForAdmin = createServerFn({ method: 'GET' }).handler(async () =>
  localShowsForAdmin((await requireSession()).user as Actor),
)

export const publishLocalShow = createServerFn({ method: 'POST' })
  .validator(z.object({ showId: z.string().uuid() }))
  .handler(async ({ data }) =>
    promoteLocalShow((await requireSession()).user as Actor, data.showId),
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
