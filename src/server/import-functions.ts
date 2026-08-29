import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { auth } from './auth'
import { type Actor, assertAdmin } from './catalog-functions'
import { getDb } from './db/client'
import { productions, shows } from './db/schema'
import { findOrCreateVenue } from './venue-functions'

async function requireSession() {
  const session = await auth.api.getSession({ headers: getRequestHeaders() })
  if (!session) throw new Error('Unauthorized')
  return session
}

const productionSchema = z.object({
  name: z.string().trim().min(1).max(200),
  productionType: z.enum(['broadway', 'off_broadway', 'tour', 'regional', 'local', 'other']),
  venue: z.string().trim().max(200).optional().nullable(),
  city: z.string().trim().max(120).optional().nullable(),
  country: z.string().trim().max(120).optional().nullable(),
  openedOn: z.string().date().optional().nullable(),
  closedOn: z.string().date().optional().nullable(),
})

const showSchema = z.object({
  title: z.string().trim().min(1).max(200),
  type: z.enum(['musical', 'play', 'other']),
  synopsis: z.string().trim().max(5000).optional().nullable(),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(180)
    .optional(),
  productions: z.array(productionSchema).max(50).optional(),
})

export const importSchema = z.object({
  shows: z.array(showSchema).max(200).optional(),
  venues: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(200),
        city: z.string().trim().max(120).optional().nullable(),
        country: z.string().trim().max(120).optional().nullable(),
      }),
    )
    .max(200)
    .optional(),
})

export type ImportPayload = z.infer<typeof importSchema>

/** A show must carry a title and a type; a venue carries a name and no title. */
function looksLikeVenue(item: unknown): boolean {
  if (!item || typeof item !== 'object') return false
  const record = item as Record<string, unknown>
  return 'name' in record && !('title' in record)
}

/**
 * Accepts the shapes people and language models actually produce, not just the
 * documented one:
 *
 *   { "shows": [...], "venues": [...] }   the full document
 *   [ {...}, {...} ]                       a bare array of shows
 *   [ { "name": "..." }, ... ]             a bare array of venues, for seeding
 *   { "title": "...", "type": "..." }      a single show on its own
 *   { "name": "...", "city": "..." }       a single venue on its own
 *
 * Coercing here means a good paste is not rejected over its wrapper.
 */
export function normalizeImportPayload(parsed: unknown): unknown {
  if (Array.isArray(parsed)) {
    // A list of theatres is the natural way to seed venues, so tell the two apart
    // rather than assuming everything in an array is a show.
    return parsed.length > 0 && parsed.every(looksLikeVenue)
      ? { venues: parsed }
      : { shows: parsed }
  }
  if (parsed && typeof parsed === 'object') {
    const record = parsed as Record<string, unknown>
    if ('shows' in record || 'venues' in record) {
      return {
        ...record,
        ...('shows' in record && !Array.isArray(record.shows) ? { shows: [record.shows] } : {}),
        ...('venues' in record && !Array.isArray(record.venues) ? { venues: [record.venues] } : {}),
      }
    }
    if ('title' in record && 'type' in record) return { shows: [record] }
    if (looksLikeVenue(record)) return { venues: [record] }
  }
  return parsed
}

function toSlug(title: string) {
  const slug = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
  return slug || 'show'
}

export type ImportResult = {
  shows: { title: string; slug: string; status: 'created' | 'skipped'; reason?: string }[]
  productions: number
  venues: number
}

/**
 * Adds curated catalog data in bulk.
 *
 * Existing records are never overwritten — a title already in the catalog is
 * reported and left alone, so the same paste can be run twice without
 * duplicating anything. Corrections belong on the published-show screen, where
 * they are deliberate and visible.
 */
export const importCatalog = createServerOnlyFn(async (actor: Actor, payload: ImportPayload) => {
  assertAdmin(actor)
  const db = getDb()
  const result: ImportResult = { shows: [], productions: 0, venues: 0 }

  for (const venue of payload.venues ?? []) {
    await findOrCreateVenue(actor.id, venue.name, venue.city, venue.country)
    result.venues += 1
  }

  for (const show of payload.shows ?? []) {
    const baseSlug = show.slug ?? toSlug(show.title)
    const [existing] = await db
      .select({ id: shows.id })
      .from(shows)
      .where(eq(shows.slug, baseSlug))
      .limit(1)
    if (existing) {
      result.shows.push({
        title: show.title,
        slug: baseSlug,
        status: 'skipped',
        reason: 'A show already uses that URL slug.',
      })
      continue
    }

    let slug = baseSlug
    let created: { id: string } | undefined
    for (let suffix = 1; suffix <= 50 && !created; suffix++) {
      slug = suffix === 1 ? baseSlug : `${baseSlug}-${suffix}`
      const [row] = await db
        .insert(shows)
        .values({
          title: show.title,
          type: show.type,
          synopsis: show.synopsis || null,
          slug,
          // Curated by an administrator, so it does not go through review.
          catalogStatus: 'published',
          reviewedByUserId: actor.id,
          reviewedAt: new Date(),
        })
        .onConflictDoNothing({ target: shows.slug })
        .returning({ id: shows.id })
      created = row
    }
    if (!created) {
      result.shows.push({
        title: show.title,
        slug: baseSlug,
        status: 'skipped',
        reason: 'Could not find a free URL slug.',
      })
      continue
    }

    for (const production of show.productions ?? []) {
      const venue = production.venue
        ? await findOrCreateVenue(actor.id, production.venue, production.city, production.country)
        : null
      if (venue) result.venues += 1
      await db.insert(productions).values({
        showId: created.id,
        venueId: venue?.id ?? null,
        name: production.name,
        productionType: production.productionType,
        venue: production.venue || null,
        city: production.city || null,
        country: production.country || null,
        openedOn: production.openedOn || null,
        closedOn: production.closedOn || null,
      })
      result.productions += 1
    }
    result.shows.push({ title: show.title, slug, status: 'created' })
  }

  return result
})

/** Parses and validates without writing, so a paste can be checked first. */
export const previewImport = createServerOnlyFn(async (actor: Actor, raw: string) => {
  assertAdmin(actor)
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new Error(`That is not valid JSON: ${(error as Error).message}`)
  }
  const validated = importSchema.safeParse(normalizeImportPayload(parsed))
  if (!validated.success) {
    const first = validated.error.issues[0]
    const where = first?.path.length ? first.path.join('.') : 'the document'
    throw new Error(`${where}: ${first?.message ?? 'is not valid.'}`)
  }
  if (!validated.data.shows?.length && !validated.data.venues?.length) {
    throw new Error('Nothing to import: no shows or venues were found in that document.')
  }
  const db = getDb()
  const seen: { title: string; slug: string; exists: boolean }[] = []
  for (const show of validated.data.shows ?? []) {
    const slug = show.slug ?? toSlug(show.title)
    const [row] = await db.select({ id: shows.id }).from(shows).where(eq(shows.slug, slug)).limit(1)
    seen.push({ title: show.title, slug, exists: Boolean(row) })
  }
  return {
    shows: seen,
    productions: (validated.data.shows ?? []).reduce((n, s) => n + (s.productions?.length ?? 0), 0),
    venues: (validated.data.venues ?? []).length,
  }
})

export const runCatalogImport = createServerFn({ method: 'POST' })
  .validator(z.object({ json: z.string().min(2).max(500_000) }))
  .handler(async ({ data }) => {
    const actor = (await requireSession()).user as Actor
    const parsed = importSchema.parse(normalizeImportPayload(JSON.parse(data.json)))
    return importCatalog(actor, parsed)
  })

export const checkCatalogImport = createServerFn({ method: 'POST' })
  .validator(z.object({ json: z.string().min(2).max(500_000) }))
  .handler(async ({ data }) => previewImport((await requireSession()).user as Actor, data.json))
