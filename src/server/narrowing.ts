import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
import { and, eq, ilike, isNotNull, sql } from 'drizzle-orm'
import { z } from 'zod'

import { getDb } from './db/client'
import { castings, people, productions, shows, venues } from './db/schema'
import { requireSession } from './session'

/**
 * Working out when somebody actually saw something.
 *
 * A memory of a year is often wrong by a few, and the catalog usually knows
 * better: a show that ran for eighteen months cannot have been seen in 1998,
 * and one that ran for a single summer answers the question outright.
 *
 * This is deliberately not a language model. It is a comparison between what
 * somebody remembers and what is recorded, and its whole value is that it
 * cannot invent a run that did not happen.
 */

export type Narrowing = {
  verdict: 'unknown' | 'outside' | 'plausible' | 'determined'
  message: string
  runs: {
    productionId: string
    name: string
    venue: string | null
    city: string | null
    openedOn: string | null
    closedOn: string | null
    coversGuess: boolean
  }[]
  /** Offered only when the record settles it. */
  suggestion: { year: number; productionId: string | null } | null
}

/** "7th", for a sentence a person reads. */
function ordinal(n: number) {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')
  return `${n}${suffix}`
}

function yearOf(date: string | null) {
  return date ? Number(date.slice(0, 4)) : null
}

function describeRun(run: { openedOn: string | null; closedOn: string | null }) {
  const from = yearOf(run.openedOn)
  const to = yearOf(run.closedOn)
  if (!from) return 'dates unknown'
  if (!to) return `${from} onwards`
  return from === to ? `${from}` : `${from}–${to}`
}

export const narrowDate = createServerOnlyFn(
  async (showId: string, guessYear: number | null, personName?: string | null) => {
    const db = getDb()
    const [show] = await db
      .select({ title: shows.title })
      .from(shows)
      .where(eq(shows.id, showId))
      .limit(1)
    if (!show) throw new Error('That show is not in the catalog.')

    const rows = await db
      .select({
        productionId: productions.id,
        name: productions.name,
        venue: productions.venue,
        city: productions.city,
        venueName: venues.name,
        openedOn: productions.openedOn,
        closedOn: productions.closedOn,
      })
      .from(productions)
      .leftJoin(venues, eq(productions.venueId, venues.id))
      .where(and(eq(productions.showId, showId), isNotNull(productions.openedOn)))
      .orderBy(productions.openedOn)

    // Remembering a face is usually a better clue than remembering a year, so
    // this is the primary question rather than a refinement of the run.
    const remembered = personName?.trim()
      ? await db
          .select({
            who: people.name,
            role: castings.role,
            from: castings.startedOn,
            to: castings.endedOn,
            order: castings.replacementOrder,
            productionId: castings.productionId,
            productionName: productions.name,
            openedOn: productions.openedOn,
            closedOn: productions.closedOn,
          })
          .from(castings)
          .innerJoin(people, eq(castings.personId, people.id))
          .innerJoin(productions, eq(castings.productionId, productions.id))
          .where(
            and(
              eq(productions.showId, showId),
              ilike(people.name, `%${personName.trim().replace(/[%_\\]/g, '\\$&')}%`),
            ),
          )
          .limit(4)
      : []

    const runs = rows.map((row) => ({
      productionId: row.productionId,
      name: row.name,
      venue: row.venueName ?? row.venue,
      city: row.city,
      openedOn: row.openedOn,
      closedOn: row.closedOn,
      coversGuess:
        guessYear !== null &&
        (yearOf(row.openedOn) ?? 0) <= guessYear &&
        guessYear <= (yearOf(row.closedOn) ?? 9999),
    }))

    const result = (over: Partial<Narrowing>): Narrowing => ({
      verdict: 'unknown',
      message: '',
      runs,
      suggestion: null,
      ...over,
    })

    if (runs.length === 0) {
      return result({
        message: `Nobody has recorded when ${show.title} ran, so there is nothing to check against.`,
      })
    }

    const span = runs.map(describeRun).join(', ')

    const found = remembered[0]
    if (found) {
      // Best case: somebody recorded when they held the role.
      const from = yearOf(found.from)
      const to = yearOf(found.to) ?? from
      if (from && to) {
        const settled = from === to
        const contradicted = guessYear !== null && (guessYear < from || guessYear > to)
        return result({
          verdict: contradicted ? 'outside' : settled ? 'determined' : 'plausible',
          message: contradicted
            ? `${found.who} played ${found.role} ${from === to ? `in ${from}` : `between ${from} and ${to}`}, so ${guessYear} cannot be right.`
            : `${found.who} played ${found.role} ${from === to ? `in ${from}` : `between ${from} and ${to}`}.`,
          suggestion: settled ? { year: from, productionId: found.productionId } : null,
        })
      }

      // No dates, but a position in the queue of people who played the role.
      // Sources publish that order far more often than they publish dates, and
      // it is enough to move somebody's guess by a few years.
      const opened = yearOf(found.openedOn)
      const closed = yearOf(found.closedOn)
      if (found.order && opened) {
        const [{ total }] = await db
          .select({ total: sql<number>`count(*)::int` })
          .from(castings)
          .where(and(eq(castings.productionId, found.productionId), eq(castings.role, found.role)))
        const last = closed ?? new Date().getFullYear()
        // Spread the changeovers evenly across the run. Crude, and honest about
        // being crude: it is offered as "probably", never as a date.
        const share = (found.order - 0.5) / Math.max(total, found.order)
        const estimate = Math.round(opened + (last - opened) * share)
        const contradicted = guessYear !== null && Math.abs(guessYear - estimate) > 1
        return result({
          verdict: contradicted ? 'outside' : 'plausible',
          message:
            `${found.who} was ${ordinal(found.order)} of ${Math.max(total, found.order)} to play ${found.role}, ` +
            `in a run from ${opened} to ${closed ?? 'now'}. That puts it around ${estimate}` +
            (contradicted ? `, not ${guessYear}.` : '.') +
            ' Nobody recorded the exact dates, so this is worked out from the order, not looked up.',
          suggestion: { year: estimate, productionId: found.productionId },
        })
      }

      // Known to have been in it, but nothing says when.
      if (opened) {
        return result({
          verdict: 'plausible',
          message: `${found.who} played ${found.role} in the ${found.productionName}, which ran ${describeRun(found)}. Nobody has recorded when they took the role.`,
        })
      }
    }

    // One run, inside a single year: the record answers the question.
    const single = runs.length === 1 ? runs[0] : undefined
    if (single?.openedOn) {
      const from = yearOf(single.openedOn)
      const to = yearOf(single.closedOn)
      if (from && to && from === to) {
        return result({
          verdict: 'determined',
          message: `${show.title} only ran in ${from}${single.venue ? ` at the ${single.venue}` : ''}, so that is when it was.`,
          suggestion: { year: from, productionId: single.productionId },
        })
      }
    }

    if (guessYear === null) {
      return result({
        verdict: 'plausible',
        message: `${show.title} ran ${span}.`,
      })
    }

    const covering = runs.filter((run) => run.coversGuess)
    if (covering.length === 0) {
      const earliest = Math.min(...runs.map((run) => yearOf(run.openedOn) ?? 9999))
      const latest = Math.max(
        ...runs.map((run) => yearOf(run.closedOn) ?? yearOf(run.openedOn) ?? 0),
      )
      return result({
        verdict: 'outside',
        message:
          guessYear < earliest
            ? `${show.title} did not open until ${earliest}, so ${guessYear} is too early. It ran ${span}.`
            : `${show.title} had closed by ${latest}, so ${guessYear} is too late. It ran ${span}.`,
        suggestion: null,
      })
    }

    if (covering.length === 1 && covering[0]) {
      return result({
        verdict: 'plausible',
        message: `${guessYear} falls inside the ${covering[0].name}${covering[0].venue ? ` at the ${covering[0].venue}` : ''}, which ran ${describeRun(covering[0])}.`,
        suggestion: { year: guessYear, productionId: covering[0].productionId },
      })
    }

    return result({
      verdict: 'plausible',
      message: `Two or more stagings were running in ${guessYear}. Choosing one below will also fill in the theatre.`,
    })
  },
)

export const narrowTheDate = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      showId: z.string().uuid(),
      year: z.number().int().min(1800).max(2200).nullable().optional(),
      personName: z.string().trim().max(120).optional(),
    }),
  )
  .handler(async ({ data }) => {
    await requireSession()
    return narrowDate(data.showId, data.year ?? null, data.personName)
  })
