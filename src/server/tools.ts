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
      'to work out which staging somebody means when a show has toured or been revived. ' +
      'Includes stagings of your own submissions while they await review.',
    parameters: z.object({ showId: z.string().uuid() }),
    run: async (actorId, { showId }) => {
      const { productionsForShowAndViewer } = await import('./catalog-functions')
      return await productionsForShowAndViewer(actorId, showId)
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
      'Other nights this person logged within a year either side of the one given, whatever ' +
      'the show. This is how "it was the same trip as..." gets resolved, and it is something ' +
      'no search engine could answer. For the whole journal, use my_nights.',
    parameters: z.object({ year: z.number().int().min(1800).max(2200) }),
    run: async (actorId, { year }) => {
      const { outingsNearYear } = await import('./narrowing')
      return await outingsNearYear(actorId, year)
    },
  }),

  tool({
    name: 'my_nights',
    description:
      'Every night this person has logged, newest first, a page at a time. This is the way ' +
      'to count or survey a journal: nights recorded without a date cannot appear in any ' +
      'year-based lookup, so my_nights_around can never see all of them. Pass the `after` ' +
      'value from a previous page to continue.',
    parameters: z.object({
      limit: z.number().int().min(1).max(100).default(50),
      after: z.number().int().min(0).default(0).describe('How many to skip. 0 for the first page.'),
    }),
    run: async (actorId, { limit, after }) => {
      const { nightsForUser } = await import('./outing-functions')
      return await nightsForUser(actorId, limit, after)
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
      'found by research rather than confirmed by anybody. Safe to call again after a ' +
      'rejected payload: if the show is your own submission still awaiting review it is ' +
      'completed rather than duplicated. A show already published is refused — add to that ' +
      'one with add_production and add_casting.',
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
      'Record a staging of a show — a tour, a revival, a local production — with its theatre ' +
      'and the dates it ran. Safe to call again on one that exists: it matches the existing ' +
      'record and fills in anything still blank, so a run left without dates can be ' +
      'completed. It will not overwrite dates already on record. Run dates matter more than ' +
      'anything else here: narrow_the_year has nothing to work with without them.',
    writes: true,
    parameters: z.object({
      showId: z.string().uuid(),
      name: z.string().trim().min(1).max(200),
      productionType: z.enum(['broadway', 'off_broadway', 'tour', 'regional', 'local', 'other']),
      venue: z.string().trim().max(200).optional(),
      city: z.string().trim().max(120).optional(),
      country: z.string().trim().max(120).optional(),
      openedOn: z.string().date().optional(),
      closedOn: z.string().date().optional().describe('Omit if it is still running.'),
      sourceNote: z.string().trim().max(500).optional().describe('A URL somebody could check.'),
    }),
    run: async (actorId, args) => {
      const { findOrCreateProduction } = await import('./catalog-functions')
      const made = await findOrCreateProduction(
        actorId,
        args.showId,
        args.name,
        args.productionType,
        args.venue,
        args.city,
        args.country,
      )

      if (args.openedOn || args.closedOn) {
        const { getDb } = await import('./db/client')
        const { productions } = await import('./db/schema')
        const { eq } = await import('drizzle-orm')
        const [current] = await getDb()
          .select({ openedOn: productions.openedOn, closedOn: productions.closedOn })
          .from(productions)
          .where(eq(productions.id, made.id))

        // Blanks only. A date already recorded was put there by somebody, and a
        // second reading of a web page is not grounds to replace it.
        const openedOn = current?.openedOn ?? args.openedOn ?? null
        const closedOn = current?.closedOn ?? args.closedOn ?? null
        await getDb()
          .update(productions)
          .set({ openedOn, closedOn, sourceNote: args.sourceNote ?? null })
          .where(eq(productions.id, made.id))
        return { ...made, openedOn, closedOn }
      }
      return made
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
    name: 'who_was_probably_on',
    description:
      'For one of this person’s own nights: who the catalog works out was on stage, and who ' +
      'they have already said they saw. `stillInferred` held the role for every day the ' +
      'night could have been; `possiblyOn` overlaps only part of it — somebody who joined ' +
      'or left mid-window, which is often the best clue for pinning the date down. Use ' +
      'before record_who_i_saw so a name is not recorded twice, and to find out whether the ' +
      'app is about to tell them they saw the wrong person.',
    parameters: z.object({ outingId: z.string().uuid() }),
    run: async (actorId, { outingId }) => {
      const { getDb } = await import('./db/client')
      const { outingAttendees, outings } = await import('./db/schema')
      const { and, eq } = await import('drizzle-orm')
      const { castAcross, seenPerformersFor } = await import('./people-functions')
      const { dateWindow } = await import('../lib/fuzzy-date')

      const [night] = await getDb()
        .select({
          productionId: outings.productionId,
          datePrecision: outings.datePrecision,
          occurredOn: outings.occurredOn,
          occurredMonth: outings.occurredMonth,
          occurredYear: outings.occurredYear,
        })
        .from(outings)
        .innerJoin(outingAttendees, eq(outingAttendees.outingId, outings.id))
        .where(and(eq(outings.id, outingId), eq(outingAttendees.userId, actorId)))
        .limit(1)
      if (!night) throw new Error('That is not a night you were at.')

      const { normalizeRole } = await import('../lib/person')
      const recorded = await seenPerformersFor(actorId, outingId)
      const spokenFor = new Set(recorded.filter((r) => r.role).map((r) => normalizeRole(r.role!)))
      const namedAlready = new Set(recorded.map((r) => r.personId))
      const window = dateWindow(night)
      const across =
        night.productionId && window
          ? await castAcross(night.productionId, window.from, window.to)
          : { certain: [], possible: [] }
      const unsaid = (member: { role: string; personId: string }) =>
        !spokenFor.has(normalizeRole(member.role)) && !namedAlready.has(member.personId)
      // Said plainly, because an empty list used to be indistinguishable from
      // "no cast recorded" and there was no way to tell which had happened.
      return {
        recorded,
        stillInferred: across.certain.filter(unsaid),
        // Overlapping part of the window but not all of it. Somebody who joined
        // mid-month is the best clue there is for pinning a vague night down,
        // and a whole-window rule is exactly what throws them away.
        possiblyOn: across.possible.filter(unsaid),
        inferredAcross: window,
        why: window ? null : 'This night has no date precise enough to match against a cast list.',
      }
    },
  }),

  tool({
    name: 'record_who_i_saw',
    description:
      'Record that this person actually saw somebody in a role on one of their own nights — ' +
      'an understudy or a cover going on, most usefully. This is the only way to correct the ' +
      'app’s guess: casting dates cannot know a cover went on, so without it the app will ' +
      'keep telling them they saw the billed performer. Give the role the person played, not ' +
      'the one they usually play. The performer does not need to be in the cast list; they ' +
      'are added if they are not.',
    writes: true,
    parameters: z.object({
      outingId: z.string().uuid(),
      personName: z.string().trim().min(1).max(160),
      role: z
        .string()
        .trim()
        .max(160)
        .optional()
        .describe('The part they went on for. Supply it: it is what supersedes the guess.'),
    }),
    run: async (actorId, { outingId, personName, role }) => {
      const { recordSeenPerformer } = await import('./people-functions')
      return await recordSeenPerformer(actorId, outingId, personName, role)
    },
  }),

  tool({
    name: 'forget_who_i_saw',
    description:
      'Undo a record of who this person saw, when it was entered wrongly. Falls back to the ' +
      'app’s own guess for that role. Only touches their own record of their own night.',
    writes: true,
    parameters: z.object({ outingId: z.string().uuid(), personId: z.string().uuid() }),
    run: async (actorId, { outingId, personId }) => {
      const { removeSeenPerformer } = await import('./people-functions')
      return await removeSeenPerformer(actorId, outingId, personId)
    },
  }),

  tool({
    name: 'update_casting',
    description:
      'Correct a casting you entered — its role, dates, or place in the run. Get the id from ' +
      'cast_of. You may change one you entered yourself; an administrator may change any. ' +
      'Prefer this to adding a second row: two rows disagreeing about the same person is ' +
      'worse than one that was wrong and got fixed.',
    writes: true,
    parameters: z.object({
      castingId: z.string().uuid(),
      role: z.string().trim().min(1).max(160),
      kind: z.enum(['performer', 'creative']).default('performer'),
      isPrincipal: z.boolean().default(true),
      startedOn: z.string().date().nullish(),
      endedOn: z.string().date().nullish(),
      replacementOrder: z.number().int().min(1).max(200).nullish(),
    }),
    run: async (actorId, { castingId, ...rest }) => {
      const { updateCasting } = await import('./people-functions')
      const { getDb } = await import('./db/client')
      const { user } = await import('./db/schema')
      const { eq } = await import('drizzle-orm')
      const [actor] = await getDb().select().from(user).where(eq(user.id, actorId)).limit(1)
      return await updateCasting(actor!, castingId, rest)
    },
  }),

  tool({
    name: 'remove_casting',
    description:
      'Delete a casting you entered, when it is simply wrong rather than incomplete. Removes ' +
      'a claim about who was on a stage; it never touches what anybody recorded about their ' +
      'own night.',
    writes: true,
    parameters: z.object({ castingId: z.string().uuid() }),
    run: async (actorId, { castingId }) => {
      const { removeCasting } = await import('./people-functions')
      const { getDb } = await import('./db/client')
      const { user } = await import('./db/schema')
      const { eq } = await import('drizzle-orm')
      const [actor] = await getDb().select().from(user).where(eq(user.id, actorId)).limit(1)
      return await removeCasting(actor!, castingId)
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
 * The same list in MCP's shape.
 *
 * Two protocols, two names for one thing: OpenAI's tool-calling wants
 * `{type, function: {parameters}}` and MCP wants a flat `{name, description,
 * inputSchema}`. Handing an MCP client the OpenAI shape gets the whole list
 * rejected — "expected object, received undefined" for every tool — so the
 * conversion is spelled out here and tested, rather than done inline at the
 * endpoint where it was got wrong once already.
 */
export const mcpToolDescriptions = createServerOnlyFn(({ allowWrites = false } = {}) =>
  TOOLS.filter((definition) => allowWrites || !definition.writes).map((definition) => ({
    name: definition.name,
    description: definition.description,
    inputSchema: z.toJSONSchema(definition.parameters) as Record<string, unknown>,
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
