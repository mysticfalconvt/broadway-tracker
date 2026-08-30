import { createServerOnlyFn } from '@tanstack/react-start'
import { z } from 'zod'

/**
 * The things a model is allowed to ask the app.
 *
 * Deliberately few and sharply shaped. A local model choosing between eight
 * obvious functions is reliable; the same model asked to invent a plan across
 * thirty is not, and a tool nobody can describe in a sentence is a tool that
 * will be called wrongly.
 *
 * Three properties hold for every tool here, and the layer is worth having
 * mostly because they hold in one place rather than at each call site:
 *
 *   - **Writing is opt-in.** Tools are read-only unless marked, and a caller
 *     must ask for the writing ones by name. The app's own `/ask` never does,
 *     so its model cannot change anybody's history by being confused.
 *   - **Everything runs as somebody.** Each takes an actor id and goes through
 *     the same functions the rest of the app uses, so a tool cannot see more
 *     than the person on whose behalf it runs.
 *   - **Answers come from the database.** The model picks the question; it
 *     never supplies the answer. It has already been caught reading a cast list
 *     and attaching the right name to the wrong role.
 */

export type ToolResult = { ok: true; data: unknown } | { ok: false; error: string }

type Tool<Schema extends z.ZodTypeAny> = {
  name: string
  /** Written for the model. What it is for, and when to reach for it. */
  description: string
  parameters: Schema
  /**
   * Whether calling this changes anything.
   *
   * Off by default and opt-in per caller, so a tool that writes cannot reach a
   * model by being added to this file. The app's own `/ask` runs read-only; a
   * member's own agent, holding their key, does not.
   */
  writes?: boolean
  run: (actorId: string, args: z.infer<Schema>) => Promise<unknown>
}

function tool<Schema extends z.ZodTypeAny>(definition: Tool<Schema>) {
  return definition as Tool<z.ZodTypeAny>
}

export const TOOLS: Tool<z.ZodTypeAny>[] = [
  tool({
    name: 'find_show',
    description:
      'Search the catalog for a show by title or part of one. Use this first whenever a ' +
      'title is mentioned, however uncertainly. Returns nothing if the show has not been ' +
      'added yet, which is common and not an error.',
    parameters: z.object({ title: z.string().trim().min(1).max(120) }),
    run: async (actorId, { title }) => {
      const { searchCatalogFor } = await import('./catalog-functions')
      return (await searchCatalogFor(actorId, title)).map((show) => ({
        showId: show.id,
        title: show.title,
        type: show.type,
        // So a person can see their own submission is not public yet.
        awaitingReview: show.catalogStatus === 'pending',
      }))
    },
  }),

  tool({
    name: 'find_person',
    description:
      'Search performers and creatives already recorded in the catalog by name or part of ' +
      'one. Only knows people somebody has entered, so an empty result means the catalog ' +
      'has not heard of them, not that they do not exist.',
    parameters: z.object({ name: z.string().trim().min(1).max(120) }),
    run: async (_actorId, { name }) => {
      const { searchPeople } = await import('./people-functions')
      return (await searchPeople(name)).map((person) => ({
        personId: person.id,
        name: person.name,
      }))
    },
  }),

  tool({
    name: 'find_venue',
    description:
      'Search theatres by name or part of one. Useful when somebody remembers where they ' +
      'were but not what they saw.',
    parameters: z.object({ name: z.string().trim().min(1).max(120) }),
    run: async (_actorId, { name }) => {
      const { searchVenues } = await import('./venue-functions')
      return await searchVenues(name)
    },
  }),

  tool({
    name: 'productions_of',
    description:
      'Every recorded staging of a show, with its theatre and the dates it ran. Use this ' +
      'to work out which staging somebody means when a show has toured or been revived.',
    parameters: z.object({ showId: z.string().uuid() }),
    run: async (_actorId, { showId }) => {
      const { publishedProductionsForShow } = await import('./catalog-functions')
      return await publishedProductionsForShow(showId)
    },
  }),

  tool({
    name: 'narrow_the_year',
    description:
      'Check a half-remembered year against what the catalog records, optionally using ' +
      'somebody they remember being in it. This is the main tool for "I think it was ' +
      'around 2003": it will say when that is impossible, and often suggest a better year. ' +
      'Prefer it over reasoning about dates yourself.',
    parameters: z.object({
      showId: z.string().uuid(),
      year: z.number().int().min(1800).max(2200).nullable().optional(),
      personName: z.string().trim().max(120).optional(),
    }),
    run: async (_actorId, { showId, year, personName }) => {
      const { narrowDate } = await import('./narrowing')
      return await narrowDate(showId, year ?? null, personName)
    },
  }),

  tool({
    name: 'cast_of',
    description:
      'Everybody recorded across a show’s productions, with their roles. Use it to check ' +
      'whether a half-remembered name matches somebody who was actually in it.',
    parameters: z.object({ showId: z.string().uuid() }),
    run: async (_actorId, { showId }) => {
      const { castForShow } = await import('./people-functions')
      return await castForShow(showId)
    },
  }),

  tool({
    name: 'my_nights_at',
    description:
      'The nights this person has already logged for a show. Always check before proposing ' +
      'a new one — they may be describing an evening that is already recorded.',
    parameters: z.object({ showId: z.string().uuid() }),
    run: async (actorId, { showId }) => {
      const { outingsForUserAndShow } = await import('./outing-functions')
      return await outingsForUserAndShow(actorId, showId)
    },
  }),

  tool({
    name: 'my_nights_around',
    description:
      'Other nights this person logged near a given year, whatever the show. This is how ' +
      '"it was the same trip as..." gets resolved, and it is something no search engine ' +
      'could answer.',
    parameters: z.object({ year: z.number().int().min(1800).max(2200) }),
    run: async (actorId, { year }) => {
      const { outingsNearYear } = await import('./narrowing')
      return await outingsNearYear(actorId, year)
    },
  }),

  tool({
    name: 'my_friends',
    description:
      'The people this person shares with. Use it when they mention a companion by name or ' +
      'relationship — "my sister", "Sarah" — to work out who they mean.',
    parameters: z.object({}),
    run: async (actorId) => {
      const { friendsForUser } = await import('./friend-functions')
      // Accepted only: a pending request is not somebody you went with.
      return (await friendsForUser(actorId))
        .filter((row) => row.status === 'accepted')
        .map((row) => ({
          userId: row.person.id,
          name: row.person.name,
          handle: row.person.handle,
        }))
    },
  }),

  // ─── The ones that change something ─────────────────────────────────────
  //
  // Reached only by somebody's own agent, holding their key, acting as them.
  // Each goes through the function the website calls, so a key can do what its
  // owner can do at a keyboard and nothing more — including landing a show as a
  // submission rather than as catalog.

  tool({
    name: 'add_researched_show',
    description:
      'Add a show, its productions and its cast, from research you have done yourself. ' +
      'Give every principal performer and the dates they held the role, including ' +
      'replacements — the order they are listed in is kept and is what lets the app work ' +
      'out which year somebody saw it. Only stage productions; never a film cast. The show ' +
      'lands as a submission awaiting review, not as catalog, and everything is marked as ' +
      'found by research rather than confirmed by anybody. Use find_show first: this ' +
      'refuses to make a second copy of something already here.',
    writes: true,
    parameters: z.object({
      research: z
        .string()
        .min(2)
        .max(200_000)
        .describe('JSON of the shape {"shows":[{title, type, synopsis, productions:[…]}]}'),
    }),
    run: async (actorId, { research }) => {
      const { acceptResearch } = await import('./research-functions')
      return await acceptResearch(actorId, research)
    },
  }),

  tool({
    name: 'add_production',
    description:
      'Record a staging of a show that is already in the catalog — a tour, a revival, a ' +
      'local production — with its theatre. Returns the production, whether it was created ' +
      'or already existed.',
    writes: true,
    parameters: z.object({
      showId: z.string().uuid(),
      name: z.string().trim().min(1).max(200),
      productionType: z.enum(['broadway', 'off_broadway', 'tour', 'regional', 'local', 'other']),
      venue: z.string().trim().max(200).optional(),
      city: z.string().trim().max(120).optional(),
    }),
    run: async (actorId, { showId, name, productionType, venue, city }) => {
      const { findOrCreateProduction } = await import('./catalog-functions')
      return await findOrCreateProduction(actorId, showId, name, productionType, venue, city)
    },
  }),

  tool({
    name: 'add_casting',
    description:
      'Record that somebody held a role in a production, with the dates if they are known. ' +
      'Leave the dates out rather than guessing: they decide who the app tells people they ' +
      'saw. Marked as research, because nobody in the room confirmed it.',
    writes: true,
    parameters: z.object({
      productionId: z.string().uuid(),
      personName: z.string().trim().min(1).max(160),
      role: z.string().trim().min(1).max(160),
      kind: z.enum(['performer', 'creative']).default('performer'),
      isPrincipal: z.boolean().default(true),
      startedOn: z.string().date().optional(),
      endedOn: z.string().date().optional(),
      replacementOrder: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe('Where they came in the sequence of people who played the role.'),
      sourceNote: z.string().trim().max(500).optional().describe('A URL somebody could check.'),
    }),
    run: async (actorId, args) => {
      const { addCasting } = await import('./people-functions')
      const { sourceNote, ...casting } = args
      return await addCasting(actorId, casting, { source: 'research', sourceNote })
    },
  }),

  tool({
    name: 'log_night',
    description:
      'Record a night this person went to the theatre. Say how sure the date is: `exact` ' +
      'with a full date, `month`, `year` when only the year is known, `approximate` with a ' +
      'phrase like "some time in the nineties". Never invent a precision they did not ' +
      'give — a guessed date recorded as exact is a false memory. Check my_nights_at first ' +
      'so an evening is not logged twice.',
    writes: true,
    parameters: z.object({
      showId: z.string().uuid(),
      productionId: z.string().uuid().optional(),
      venue: z.string().trim().max(200).optional(),
      city: z.string().trim().max(120).optional(),
      datePrecision: z.enum(['exact', 'month', 'year', 'approximate', 'unknown']),
      occurredOn: z.string().date().optional(),
      occurredMonth: z.number().int().min(1).max(12).optional(),
      occurredYear: z.number().int().min(1800).max(2200).optional(),
      approximateDate: z.string().trim().max(100).optional(),
      sharedNotes: z.string().trim().max(5_000).optional(),
      attendeeIds: z
        .array(z.string().uuid())
        .max(50)
        .default([])
        .describe('Friends who were there, by the user id my_friends returns.'),
    }),
    run: async (actorId, args) => {
      const { createOutingForUser } = await import('./outing-functions')
      return await createOutingForUser(actorId, { ...args, favorite: false })
    },
  }),
]

/** Handed to the model so it knows what it may ask for. */
export const toolDescriptions = createServerOnlyFn(({ allowWrites = false } = {}) =>
  TOOLS.filter((definition) => allowWrites || !definition.writes).map((definition) => ({
    type: 'function' as const,
    function: {
      name: definition.name,
      description: definition.description,
      parameters: z.toJSONSchema(definition.parameters),
    },
  })),
)

/**
 * Runs one tool on somebody's behalf.
 *
 * Errors come back as values rather than thrown, because a model calling a tool
 * wrongly is ordinary and recoverable — it should be told what went wrong and
 * allowed to try again, not have the conversation collapse.
 */
export const runTool = createServerOnlyFn(
  async (
    actorId: string,
    name: string,
    args: unknown,
    { allowWrites = false } = {},
  ): Promise<ToolResult> => {
    const definition = TOOLS.find((candidate) => candidate.name === name)
    if (!definition) return { ok: false, error: `There is no tool called ${name}.` }
    if (definition.writes && !allowWrites) {
      return { ok: false, error: `${name} changes things, and this conversation may only read.` }
    }

    const parsed = definition.parameters.safeParse(args ?? {})
    if (!parsed.success) {
      return {
        ok: false,
        error: `Wrong arguments for ${name}: ${parsed.error.issues
          .map((issue) => `${issue.path.join('.') || 'value'} ${issue.message}`)
          .join('; ')}`,
      }
    }

    try {
      return { ok: true, data: await definition.run(actorId, parsed.data) }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'That failed.' }
    }
  },
)
