import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
import { z } from 'zod'

import { askModelForJson } from './model'
import { requireSession } from './session'
import { runTool } from './tools'

/**
 * Asking about a night in words.
 *
 * A form only takes the questions it has fields for, and memories do not arrive
 * that way: a theatre, a companion, a year anchored to somebody's wedding, an
 * actor remembered from something else. This runs a short loop — the model
 * chooses a tool, the app answers it from the database, repeat — and stops at
 * either a question or a **proposal**.
 *
 * It never writes. The confirm button goes through the same `createOuting` as
 * the form, so a conversation cannot reach anything a person could not.
 */

const proposalShape = z.object({
  showId: z.string().uuid(),
  /**
   * Filled in from the database afterwards.
   *
   * Asking the model for it cost a whole proposal once: it had the id, saw no
   * reason to repeat the title, and the draft was thrown away for the missing
   * field. Never ask a model for something already known.
   */
  showTitle: z.string().optional(),
  productionId: z.string().uuid().nullish(),
  venue: z.string().nullish(),
  city: z.string().nullish(),
  datePrecision: z.enum(['exact', 'month', 'year', 'approximate', 'unknown']),
  occurredOn: z.string().date().nullish(),
  occurredMonth: z.number().int().min(1).max(12).nullish(),
  occurredYear: z.number().int().min(1800).max(2200).nullish(),
  approximateDate: z.string().nullish(),
  /** Shown to the reader, so they can judge the reasoning rather than the confidence. */
  why: z.string(),
})

export type Proposal = z.infer<typeof proposalShape>

/** What was looked up, in a shape that can cross the wire and be shown. */
export type Step = { tool: string; ok: boolean; summary: string }

export type Answer = {
  say: string
  proposal: Proposal | null
  steps: Step[]
}

/**
 * The model's only job: turn a sentence into fields.
 *
 * An earlier version let it choose tools and loop. It varied run to run between
 * a good answer in three steps, five steps and no answer, and no lookups at
 * all — and once proposed the year the person had guessed after the catalog had
 * just contradicted it, because agreeing is easier than being right.
 *
 * Extraction it is reliably good at. Deciding what to do next it is not. So the
 * decisions moved into the app, where they are deterministic and tested, and
 * the model is left with the part only it can do: reading English.
 */
const EXTRACT = `Pull the facts out of somebody's sentence about a night at the theatre.

Reply with JSON only:

{
  "showTitle": "the show they named, or null",
  "personName": "somebody they remember being in it, or null",
  "year": 2003 or null,
  "venue": "the theatre they named, or null",
  "companion": "who they say they were with, or null"
}

Use null for anything they did not say. Do not guess, do not add anything they did not
mention, and do not correct them — another part of the program checks their memory against
the record. "Around 2003", "2003ish" and "about 2003" all mean 2003.`

const extracted = z.object({
  showTitle: z.string().nullish(),
  personName: z.string().nullish(),
  year: z.number().int().min(1800).max(2200).nullish(),
  venue: z.string().nullish(),
  companion: z.string().nullish(),
})

export const askAboutANight = createServerOnlyFn(
  async (actorId: string, question: string): Promise<Answer> => {
    const steps: Step[] = []
    const note = (tool: string, ok: boolean, summary: string) => {
      steps.push({ tool, ok, summary: summary.slice(0, 300) })
    }

    const heard = extracted.safeParse(
      await askModelForJson<unknown>(
        [
          { role: 'system', content: EXTRACT },
          { role: 'user', content: question },
        ],
        { maxTokens: 400 },
      ),
    )
    if (!heard.success) {
      return { say: 'I could not make sense of that. Try naming the show.', proposal: null, steps }
    }
    const { showTitle, personName, venue, companion } = heard.data
    // A four-digit year in a sentence is not something worth a model's opinion.
    // It missed "in 1998 I think" once, which then went unchallenged.
    const written = question.match(/\b(1[89]\d{2}|20\d{2})\b/)
    const year = heard.data.year ?? (written ? Number(written[1]) : null)
    note(
      'read your message',
      true,
      JSON.stringify({ showTitle, personName, year, venue, companion }),
    )

    if (!showTitle) {
      return {
        say: 'Which show was it? I can work back from a theatre or somebody in the cast, but I need somewhere to start.',
        proposal: null,
        steps,
      }
    }

    // From here the app decides. No model discretion, so the same question
    // gives the same answer every time.
    const found = await runTool(actorId, 'find_show', { title: showTitle })
    const matches = (found.ok ? found.data : []) as { showId: string; title: string }[]
    note('find_show', found.ok, JSON.stringify(matches.map((m) => m.title)))

    if (matches.length === 0) {
      return {
        say: `${showTitle} is not in the catalog yet. An administrator can add it from the import screen, and then I can work out when you saw it.`,
        proposal: null,
        steps,
      }
    }
    if (matches.length > 1) {
      return {
        say: `There is more than one match: ${matches.map((m) => m.title).join(', ')}. Which did you mean?`,
        proposal: null,
        steps,
      }
    }

    const show = matches[0]
    if (!show) return { say: 'Something went wrong finding that show.', proposal: null, steps }

    const narrowing = await runTool(actorId, 'narrow_the_year', {
      showId: show.showId,
      year: year ?? null,
      personName: personName ?? undefined,
    })
    if (!narrowing.ok) {
      return { say: `I could not check that: ${narrowing.error}`, proposal: null, steps }
    }
    const answer = narrowing.data as {
      verdict: string
      message: string
      suggestion: { year: number; productionId: string | null } | null
    }
    note('narrow_the_year', true, answer.message)

    const already = await runTool(actorId, 'my_nights_at', { showId: show.showId })
    const nights = (already.ok ? already.data : []) as unknown[]
    note('my_nights_at', already.ok, `${nights.length} already logged`)

    const settled = answer.suggestion
    const lines = [answer.message]
    if (nights.length) {
      lines.push(
        `You have already logged ${nights.length} night${nights.length === 1 ? '' : 's'} of this — check it is not one of those.`,
      )
    }
    if (companion)
      lines.push(`You mentioned ${companion}; add them as an attendee when you log it.`)

    return {
      say: lines.join(' '),
      proposal: settled
        ? {
            showId: show.showId,
            showTitle: show.title,
            productionId: settled.productionId,
            venue: venue ?? null,
            datePrecision: 'year',
            occurredYear: settled.year,
            why: answer.message,
          }
        : null,
      steps,
    }
  },
)

export const ask = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      question: z.string().trim().min(2).max(2_000),
    }),
  )
  .handler(async ({ data }) => askAboutANight((await requireSession()).user.id, data.question))
