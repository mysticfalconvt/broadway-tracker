import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { and, asc, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm'
import { z } from 'zod'

import { normalizePersonName, tidyPersonName } from '../lib/person'
import { auth } from './auth'
import { type Actor, assertAdmin } from './catalog-functions'
import { getDb } from './db/client'
import {
  castings,
  outingAttendees,
  outings,
  people,
  productions,
  seenPerformers,
  shows,
} from './db/schema'

async function requireSession() {
  const session = await auth.api.getSession({ headers: getRequestHeaders() })
  if (!session) throw new Error('Unauthorized')
  return session
}

/**
 * Returns the person of this name, creating them only if nobody matches.
 *
 * Open to members, like venues and productions: a community theatre's cast will
 * never be in any list, and requiring review before somebody can record who they
 * saw would mean nobody ever does.
 */
export const findOrCreatePerson = createServerOnlyFn(
  async (createdByUserId: string | null, name: string) => {
    const cleanName = tidyPersonName(name)
    if (!cleanName) throw new Error('A person needs a name.')
    const matchKey = normalizePersonName(cleanName)
    if (!matchKey) throw new Error('A person needs a name.')

    const db = getDb()
    const [existing] = await db.select().from(people).where(eq(people.matchKey, matchKey)).limit(1)
    if (existing) return existing

    const [created] = await db
      .insert(people)
      .values({ name: cleanName, matchKey, createdByUserId })
      .onConflictDoNothing({ target: people.matchKey })
      .returning()
    if (created) return created

    // Somebody else created them between the read and the write.
    const [raced] = await db.select().from(people).where(eq(people.matchKey, matchKey)).limit(1)
    if (!raced) throw new Error('Unable to record that person.')
    return raced
  },
)

/** Suggestions for a cast field, so an existing person is offered before a new one is made. */
export const searchPeople = createServerOnlyFn(async (query: string, limit = 8) => {
  const db = getDb()
  const trimmed = tidyPersonName(query)
  const base = db.select({ id: people.id, name: people.name, note: people.note }).from(people)
  if (!trimmed) return base.orderBy(asc(people.name)).limit(limit)
  const escaped = trimmed.replace(/[%_\\]/g, '\\$&')
  return base
    .where(ilike(people.name, `%${escaped}%`))
    .orderBy(asc(people.name))
    .limit(limit)
})

const castingInput = z.object({
  productionId: z.string().uuid(),
  personName: z.string().trim().min(1).max(160),
  role: z.string().trim().min(1).max(160),
  kind: z.enum(['performer', 'creative']).default('performer'),
  isPrincipal: z.boolean().default(false),
  startedOn: z.string().date().optional(),
  endedOn: z.string().date().optional(),
})

/** Records that somebody held a role in a production. */
export const addCasting = createServerOnlyFn(
  async (userId: string, data: z.infer<typeof castingInput>) => {
    const db = getDb()
    const [production] = await db
      .select({ id: productions.id })
      .from(productions)
      .where(eq(productions.id, data.productionId))
      .limit(1)
    if (!production) throw new Error('That production is not in the catalog.')

    const person = await findOrCreatePerson(userId, data.personName)
    const role = data.role.trim().replace(/\s+/g, ' ')

    // The same person in the same role is one casting, however many people record it.
    const existing = await db
      .select({ id: castings.id, role: castings.role })
      .from(castings)
      .where(and(eq(castings.productionId, data.productionId), eq(castings.personId, person.id)))
    const duplicate = existing.find((row) => row.role.toLowerCase() === role.toLowerCase())
    if (duplicate) return { id: duplicate.id, personId: person.id, created: false }

    const [created] = await db
      .insert(castings)
      .values({
        personId: person.id,
        productionId: data.productionId,
        role,
        kind: data.kind,
        isPrincipal: data.isPrincipal,
        startedOn: data.startedOn || null,
        endedOn: data.endedOn || null,
        createdByUserId: userId,
      })
      .returning({ id: castings.id })
    if (!created) throw new Error('Unable to record that casting.')
    return { id: created.id, personId: person.id, created: true }
  },
)

/** Everyone recorded in a production, principals first. */
export const castForProduction = createServerOnlyFn(async (productionId: string) =>
  getDb()
    .select({
      id: castings.id,
      personId: people.id,
      name: people.name,
      role: castings.role,
      kind: castings.kind,
      isPrincipal: castings.isPrincipal,
      startedOn: castings.startedOn,
      endedOn: castings.endedOn,
    })
    .from(castings)
    .innerJoin(people, eq(castings.personId, people.id))
    .where(eq(castings.productionId, productionId))
    .orderBy(desc(castings.isPrincipal), asc(people.name)),
)

/**
 * Who was probably on stage on a given night.
 *
 * This is inference, not record: a casting window says somebody held the role
 * across a span, and an understudy going on leaves no trace in the data. The
 * caller must present it as likely, never as fact — which is why the date used
 * is returned alongside, so a page can say what the guess was based on.
 */
export const likelyCastOn = createServerOnlyFn(
  async (productionId: string, onDate: string | null) => {
    if (!onDate) return []
    return getDb()
      .select({
        personId: people.id,
        name: people.name,
        role: castings.role,
        kind: castings.kind,
        isPrincipal: castings.isPrincipal,
      })
      .from(castings)
      .innerJoin(people, eq(castings.personId, people.id))
      .where(
        and(
          eq(castings.productionId, productionId),
          // Performers only: "who you probably saw" means who was on stage. A
          // director held the role all run and was not in front of you.
          eq(castings.kind, 'performer'),
          or(isNull(castings.startedOn), sql`${castings.startedOn} <= ${onDate}`),
          or(isNull(castings.endedOn), sql`${castings.endedOn} >= ${onDate}`),
        ),
      )
      .orderBy(desc(castings.isPrincipal), asc(people.name))
  },
)

/** A person, their roles, and the nights the reader saw them. */
export const personWithHistory = createServerOnlyFn(
  async (viewerId: string | null, personId: string) => {
    const db = getDb()
    const [person] = await db.select().from(people).where(eq(people.id, personId)).limit(1)
    if (!person) throw new Error('That person is not in the catalog.')

    const roles = await db
      .select({
        castingId: castings.id,
        role: castings.role,
        kind: castings.kind,
        isPrincipal: castings.isPrincipal,
        startedOn: castings.startedOn,
        endedOn: castings.endedOn,
        productionId: productions.id,
        productionName: productions.name,
        showTitle: shows.title,
        showSlug: shows.slug,
        showType: shows.type,
        coverImageKey: shows.coverImageKey,
      })
      .from(castings)
      .innerJoin(productions, eq(castings.productionId, productions.id))
      .innerJoin(shows, eq(productions.showId, shows.id))
      .where(and(eq(castings.personId, personId), eq(shows.catalogStatus, 'published')))
      .orderBy(asc(shows.title))

    // Only the reader's own nights: somebody else's evening is theirs to share.
    const yourNights = viewerId
      ? await db
          .select({
            id: outings.id,
            datePrecision: outings.datePrecision,
            occurredOn: outings.occurredOn,
            occurredMonth: outings.occurredMonth,
            occurredYear: outings.occurredYear,
            approximateDate: outings.approximateDate,
            showTitle: shows.title,
            role: castings.role,
          })
          .from(outingAttendees)
          .innerJoin(outings, eq(outingAttendees.outingId, outings.id))
          .innerJoin(shows, eq(outings.showId, shows.id))
          .innerJoin(castings, eq(castings.productionId, outings.productionId))
          .where(and(eq(outingAttendees.userId, viewerId), eq(castings.personId, personId)))
          .orderBy(desc(outings.occurredOn))
      : []

    return { person: { id: person.id, name: person.name, note: person.note }, roles, yourNights }
  },
)

/** Folds one person into another, moving their castings. */
export const mergePeople = createServerOnlyFn(
  async (actor: Actor, sourceId: string, targetId: string) => {
    assertAdmin(actor)
    if (sourceId === targetId) throw new Error('Choose a different person to merge into.')
    const db = getDb()
    await db.transaction(async (tx) => {
      const [source] = await tx.select().from(people).where(eq(people.id, sourceId)).limit(1)
      const [target] = await tx.select().from(people).where(eq(people.id, targetId)).limit(1)
      if (!source || !target) throw new Error('Both people must exist to merge them.')
      await tx.update(castings).set({ personId: target.id }).where(eq(castings.personId, source.id))
      await tx.delete(people).where(eq(people.id, source.id))
    })
  },
)

export const suggestPeople = createServerFn({ method: 'GET' })
  .validator(z.object({ query: z.string().trim().max(160) }))
  .handler(async ({ data }) => {
    await requireSession()
    return searchPeople(data.query)
  })

export const recordCasting = createServerFn({ method: 'POST' })
  .validator(castingInput)
  .handler(async ({ data }) => addCasting((await requireSession()).user.id, data))

export const getPerson = createServerFn({ method: 'GET' })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await auth.api.getSession({ headers: getRequestHeaders() })
    return personWithHistory(session?.user.id ?? null, data.id)
  })

/** Everyone recorded across all of a show's productions. */
export const castForShow = createServerOnlyFn(async (showId: string) =>
  getDb()
    .select({
      id: castings.id,
      personId: people.id,
      name: people.name,
      role: castings.role,
      kind: castings.kind,
      isPrincipal: castings.isPrincipal,
      productionName: productions.name,
    })
    .from(castings)
    .innerJoin(people, eq(castings.personId, people.id))
    .innerJoin(productions, eq(castings.productionId, productions.id))
    .where(eq(productions.showId, showId))
    .orderBy(asc(productions.name), desc(castings.isPrincipal), asc(people.name)),
)

export const getCastForShow = createServerFn({ method: 'GET' })
  .validator(z.object({ showId: z.string().uuid() }))
  .handler(async ({ data }) => castForShow(data.showId))

/** Confirms that somebody was on stage on a particular night, for one attendee. */
export const recordSeenPerformer = createServerOnlyFn(
  async (userId: string, outingId: string, personName: string, role?: string | null) => {
    const db = getDb()
    const [attendance] = await db
      .select({ userId: outingAttendees.userId })
      .from(outingAttendees)
      .where(and(eq(outingAttendees.outingId, outingId), eq(outingAttendees.userId, userId)))
      .limit(1)
    if (!attendance) throw new Error('You were not at this performance.')

    const person = await findOrCreatePerson(userId, personName)
    await db
      .insert(seenPerformers)
      .values({ outingId, userId, personId: person.id, role: role?.trim() || null })
      .onConflictDoNothing()
    return { personId: person.id }
  },
)

export const removeSeenPerformer = createServerOnlyFn(
  async (userId: string, outingId: string, personId: string) => {
    await getDb()
      .delete(seenPerformers)
      .where(
        and(
          eq(seenPerformers.outingId, outingId),
          eq(seenPerformers.userId, userId),
          eq(seenPerformers.personId, personId),
        ),
      )
  },
)

/**
 * Accepts the inferred cast as recorded fact for this attendee.
 *
 * Once anything is recorded, the inference stops being shown to them: they have
 * said who they saw, and a guess should not sit alongside an answer.
 */
export const confirmLikelyCast = createServerOnlyFn(
  async (userId: string, outingId: string, productionId: string, onDate: string | null) => {
    const likely = await likelyCastOn(productionId, onDate)
    const db = getDb()
    for (const member of likely) {
      await db
        .insert(seenPerformers)
        .values({ outingId, userId, personId: member.personId, role: member.role })
        .onConflictDoNothing()
    }
    return likely.length
  },
)

/** Who this attendee has said they saw. */
export const seenPerformersFor = createServerOnlyFn(async (userId: string, outingId: string) =>
  getDb()
    .select({
      personId: people.id,
      name: people.name,
      role: seenPerformers.role,
    })
    .from(seenPerformers)
    .innerJoin(people, eq(seenPerformers.personId, people.id))
    .where(and(eq(seenPerformers.outingId, outingId), eq(seenPerformers.userId, userId)))
    .orderBy(asc(people.name)),
)

export const saveSeenPerformer = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      outingId: z.string().uuid(),
      personName: z.string().trim().min(1).max(160),
      role: z.string().trim().max(160).optional(),
    }),
  )
  .handler(async ({ data }) =>
    recordSeenPerformer(
      (await requireSession()).user.id,
      data.outingId,
      data.personName,
      data.role,
    ),
  )

export const dropSeenPerformer = createServerFn({ method: 'POST' })
  .validator(z.object({ outingId: z.string().uuid(), personId: z.string().uuid() }))
  .handler(async ({ data }) =>
    removeSeenPerformer((await requireSession()).user.id, data.outingId, data.personId),
  )

export const acceptLikelyCast = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      outingId: z.string().uuid(),
      productionId: z.string().uuid(),
      onDate: z.string().date(),
    }),
  )
  .handler(async ({ data }) =>
    confirmLikelyCast(
      (await requireSession()).user.id,
      data.outingId,
      data.productionId,
      data.onDate,
    ),
  )
