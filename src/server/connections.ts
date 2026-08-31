import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
import { eq, inArray } from 'drizzle-orm'

import { dateWindow } from '../lib/fuzzy-date'
import { normalizeRole } from '../lib/person'
import { getDb } from './db/client'
import {
  castings,
  outingAttendees,
  outings,
  people,
  productions,
  seenPerformers,
  shows,
  venues,
} from './db/schema'
import { requireSession } from './session'

/**
 * Where somebody's own history joins up with itself.
 *
 * The app knows things nobody has ever been told: that the same actor turned up
 * in three different evenings years apart, that a theatre has been returned to
 * five times, that two rooms with different names are the same building. None
 * of it is new information — it is all already recorded — and none of it is
 * visible, because it only exists in the joins.
 *
 * Facts, not scores. Every line here is something that happened, phrased as
 * what happened: no ranking, no totals to beat, nothing to be top of. A count
 * appears only where it is the fact itself ("four times"), never as a measure
 * of anybody. That is the difference between remembering and being kept busy,
 * and it is the constraint the whole app is built around.
 *
 * Everything is computed from the nights the reader attended, in one pass. At
 * fifteen people with a few hundred nights between them, the honest and simple
 * shape — load it and work it out — is also the fast one, and it lets the
 * date-window rules live in one place instead of being reimplemented in SQL.
 */

export type Connections = Awaited<ReturnType<typeof connectionsFor>>

export const connectionsFor = createServerOnlyFn(async (viewerId: string) => {
  const db = getDb()

  const nights = await db
    .select({
      outingId: outings.id,
      showId: outings.showId,
      showTitle: shows.title,
      showSlug: shows.slug,
      productionId: outings.productionId,
      productionName: productions.name,
      datePrecision: outings.datePrecision,
      occurredOn: outings.occurredOn,
      occurredMonth: outings.occurredMonth,
      occurredYear: outings.occurredYear,
      approximateDate: outings.approximateDate,
      venueId: outings.venueId,
      venueText: outings.venue,
    })
    .from(outingAttendees)
    .innerJoin(outings, eq(outingAttendees.outingId, outings.id))
    .innerJoin(shows, eq(outings.showId, shows.id))
    .leftJoin(productions, eq(outings.productionId, productions.id))
    .where(eq(outingAttendees.userId, viewerId))

  if (nights.length === 0) {
    return { performers: [], venues: [], shows: [] }
  }

  const outingIds = nights.map((night) => night.outingId)
  const productionIds = [...new Set(nights.map((n) => n.productionId).filter(Boolean))] as string[]

  const [recorded, possible] = await Promise.all([
    db
      .select({
        outingId: seenPerformers.outingId,
        personId: seenPerformers.personId,
        name: people.name,
        role: seenPerformers.role,
      })
      .from(seenPerformers)
      .innerJoin(people, eq(seenPerformers.personId, people.id))
      .where(eq(seenPerformers.userId, viewerId)),
    productionIds.length
      ? db
          .select({
            productionId: castings.productionId,
            personId: castings.personId,
            name: people.name,
            role: castings.role,
            startedOn: castings.startedOn,
            endedOn: castings.endedOn,
          })
          .from(castings)
          .innerJoin(people, eq(castings.personId, people.id))
          .where(inArray(castings.productionId, productionIds))
      : Promise.resolve([]),
  ])

  const mine = new Set(outingIds)
  const recordedByOuting = new Map<string, typeof recorded>()
  for (const row of recorded) {
    if (!mine.has(row.outingId)) continue
    recordedByOuting.set(row.outingId, [...(recordedByOuting.get(row.outingId) ?? []), row])
  }

  /**
   * Who this person saw on one night: what they said, and — for roles they
   * never spoke to — who certainly held the part across the whole span the
   * night could fall in. The same bar the outing page uses, so the two never
   * disagree about somebody's own evening.
   */
  type Sighting = { personId: string; name: string; role: string }
  const onThisNight = (night: (typeof nights)[number]): Sighting[] => {
    const said = recordedByOuting.get(night.outingId) ?? []
    const spokenFor = new Set(said.filter((r) => r.role).map((r) => normalizeRole(r.role!)))
    const window = dateWindow(night)
    const inferred =
      night.productionId && window
        ? possible.filter(
            (row) =>
              row.productionId === night.productionId &&
              !spokenFor.has(normalizeRole(row.role)) &&
              (!row.startedOn || row.startedOn <= window.from) &&
              (!row.endedOn || row.endedOn >= window.to),
          )
        : []
    return [
      ...said.map((r) => ({ personId: r.personId, name: r.name, role: r.role ?? '' })),
      ...inferred.map((r) => ({ personId: r.personId, name: r.name, role: r.role })),
    ]
  }

  // ─── People seen in more than one show ──────────────────────────────────
  const byPerson = new Map<
    string,
    { name: string; appearances: Map<string, { title: string; slug: string; role: string }> }
  >()
  for (const night of nights) {
    for (const seen of onThisNight(night)) {
      const entry = byPerson.get(seen.personId) ?? { name: seen.name, appearances: new Map() }
      // Keyed by show: the same actor in the same show twice is one connection,
      // not two. Seeing them in something else is the thing worth saying.
      if (!entry.appearances.has(night.showId)) {
        entry.appearances.set(night.showId, {
          title: night.showTitle,
          slug: night.showSlug,
          role: seen.role,
        })
      }
      byPerson.set(seen.personId, entry)
    }
  }
  const performers = [...byPerson]
    .filter(([, entry]) => entry.appearances.size > 1)
    .map(([personId, entry]) => ({
      personId,
      name: entry.name,
      shows: [...entry.appearances.values()],
    }))
    .sort((a, b) => b.shows.length - a.shows.length || a.name.localeCompare(b.name))

  // ─── Theatres returned to ───────────────────────────────────────────────
  const venueIds = [...new Set(nights.map((n) => n.venueId).filter(Boolean))] as string[]
  const venueRows = venueIds.length
    ? await db.select().from(venues).where(inArray(venues.id, venueIds))
    : []
  const byVenue = new Map<
    string,
    {
      name: string
      formerNames: string[]
      nights: number
      /** What was seen there. A room is remembered by what happened in it. */
      shows: { title: string; slug: string; year: number | null }[]
    }
  >()
  for (const night of nights) {
    // Free text only groups with itself; without a linked record there is no
    // way to know two spellings are one building.
    const key = night.venueId ?? `text:${night.venueText ?? ''}`
    if (!night.venueId && !night.venueText) continue
    const found = venueRows.find((row) => row.id === night.venueId)
    const entry = byVenue.get(key) ?? {
      name: found?.name ?? night.venueText ?? '',
      formerNames: found?.formerNames ?? [],
      nights: 0,
      shows: [],
    }
    entry.nights += 1
    entry.shows.push({
      title: night.showTitle,
      slug: night.showSlug,
      year: night.occurredYear ?? (night.occurredOn ? Number(night.occurredOn.slice(0, 4)) : null),
    })
    byVenue.set(key, entry)
  }
  const returnedTo = [...byVenue.values()]
    .filter((entry) => entry.nights > 1)
    // Oldest first within a theatre: the point is the span, not the newest.
    .map((entry) => ({
      ...entry,
      shows: entry.shows.sort((a, b) => (a.year ?? 0) - (b.year ?? 0)),
    }))
    .sort((a, b) => b.nights - a.nights || a.name.localeCompare(b.name))

  // ─── Shows seen more than once ──────────────────────────────────────────
  const byShow = new Map<
    string,
    { title: string; slug: string; times: { year: number | null; production: string | null }[] }
  >()
  for (const night of nights) {
    const entry = byShow.get(night.showId) ?? {
      title: night.showTitle,
      slug: night.showSlug,
      times: [],
    }
    entry.times.push({
      year: night.occurredYear ?? (night.occurredOn ? Number(night.occurredOn.slice(0, 4)) : null),
      production: night.productionName,
    })
    byShow.set(night.showId, entry)
  }
  /**
   * Parts that changed hands between one visit and the next.
   *
   * A detail of a show seen twice, not a finding of its own. Listed alone it
   * was mostly noise: see a long-running show two years apart and every
   * principal has changed, so a whole company arrives dressed up as a
   * discovery. Sitting on the card for that show it is what it actually is —
   * what was different the second time.
   */
  const recastByShow = new Map<string, { role: string; people: string[] }[]>()
  for (const showId of byShow.keys()) {
    const parts = new Map<string, { role: string; people: Map<string, string> }>()
    for (const night of nights.filter((one) => one.showId === showId)) {
      for (const seen of onThisNight(night)) {
        if (!seen.role) continue
        const key = normalizeRole(seen.role)
        const entry = parts.get(key) ?? { role: seen.role, people: new Map() }
        entry.people.set(seen.personId, seen.name)
        parts.set(key, entry)
      }
    }
    const changed = [...parts.values()]
      .filter((entry) => entry.people.size > 1)
      .map((entry) => ({ role: entry.role, people: [...entry.people.values()] }))
    if (changed.length) recastByShow.set(showId, changed)
  }

  const seenAgain = [...byShow]
    .filter(([, entry]) => entry.times.length > 1)
    .map(([showId, entry]) => ({
      ...entry,
      times: entry.times.sort((a, b) => (a.year ?? 0) - (b.year ?? 0)),
      recast: recastByShow.get(showId) ?? [],
    }))

  return { performers, venues: returnedTo, shows: seenAgain }
})

export const getConnections = createServerFn({ method: 'GET' }).handler(async () =>
  connectionsFor((await requireSession()).user.id),
)
