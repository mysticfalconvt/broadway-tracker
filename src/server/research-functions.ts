import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
import { z } from 'zod'

import { askModelForJson } from './model'
import { readPage, readWikipedia, searchWeb, searchWikipedia } from './search'
import { requireSession } from './session'

/**
 * Finding out about a show nobody has entered yet.
 *
 * The catalog is the bottleneck for everything else: "who did I see" is a
 * query, and a query over an empty table is empty. This fills it — but it
 * stops at a **proposal**. Nothing here writes.
 *
 * That is not caution for its own sake. Casting dates are what the app reads to
 * tell somebody who they probably saw, so a date invented by a model does not
 * produce a small error, it produces a false memory that looks exactly like a
 * checked fact. A person reads the JSON before it lands, through the import
 * screen that already validates it, warns about near-duplicate venues, and
 * refuses to overwrite.
 */

const INSTRUCTIONS = `You extract theatre facts from web pages into JSON. You do not know
anything about theatre yourself — everything you output must come from the pages given to
you, and you must not fill gaps from memory.

Return JSON of this exact shape:

{
  "shows": [{
    "title": "string",
    "type": "musical" | "play" | "other",
    "synopsis": "one or two sentences, or omit",
    "productions": [{
      "name": "Original Broadway",
      "productionType": "broadway" | "off_broadway" | "tour" | "regional" | "local" | "other",
      "venue": "theatre name",
      "city": "string",
      "country": "string",
      "openedOn": "YYYY-MM-DD",
      "closedOn": "YYYY-MM-DD or null if still running",
      "source": "the URL you took the run and cast dates from",
      "cast": [{
        "name": "string",
        "role": "the character, or the job for creatives",
        "kind": "performer" | "creative",
        "isPrincipal": true,
        "startedOn": "YYYY-MM-DD when they took the role",
        "endedOn": "YYYY-MM-DD when they left it, or null"
      }]
    }]
  }]
}

Rules, in order of importance:

1. OMIT ANY FIELD YOU CANNOT SUPPORT FROM THE PAGES. A missing field is correct. An
   invented one is not. This applies most of all to startedOn and endedOn: those decide
   which performer somebody is told they saw on a given night.
2. Include every performer who held a principal role and the dates they held it, not only
   the opening-night company. Replacements are the point. If a page has a section listing
   replacements or later casts, every name in it belongs in your output — a cast list with
   only the opening company in it is a wrong answer, not a short one.
3. If the pages only give you the opening cast, return that and leave the dates out
   rather than guessing when anybody was replaced.
4. Use YYYY-MM-DD. If a page gives only a month or a year, omit the date entirely.
5. Only stage productions. If a page describes a film or television adaptation, ignore its
   cast entirely — a screen actor recorded as a stage performer is worse than a gap, because
   somebody will be told they saw them on stage.
6. Return only the JSON object. No commentary.`

/**
 * Screen adaptations, which search returns alongside the stage article and
 * which must not be read.
 *
 * "The Producers" returns the musical and the 2005 film. Half the pages given
 * to the model were then about a film, and its cast is not the cast anybody
 * saw at the St. James.
 */
const SCREEN = /\((\d{4} )?(film|movie|TV series|television series|miniseries)\)/i

/** The shape research comes back in, checked before any of it is written. */
const researched = z.object({
  shows: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(200),
        type: z.enum(['musical', 'play', 'other']).catch('other'),
        synopsis: z.string().trim().max(5_000).nullish(),
        productions: z
          .array(
            z.object({
              name: z.string().trim().min(1).max(200),
              productionType: z
                .enum(['broadway', 'off_broadway', 'tour', 'regional', 'local', 'other'])
                .catch('other'),
              venue: z.string().trim().max(200).nullish(),
              city: z.string().trim().max(120).nullish(),
              openedOn: z.string().date().nullish(),
              closedOn: z.string().date().nullish(),
              source: z.string().trim().max(500).nullish(),
              cast: z
                .array(
                  z.object({
                    name: z.string().trim().min(1).max(160),
                    role: z.string().trim().min(1).max(160),
                    kind: z.enum(['performer', 'creative']).catch('performer'),
                    isPrincipal: z.boolean().nullish(),
                    startedOn: z.string().date().nullish(),
                    endedOn: z.string().date().nullish(),
                  }),
                )
                .optional(),
            }),
          )
          .optional(),
      }),
    )
    .min(1),
})

export type Proposal = {
  json: string
  sources: { title: string; url: string }[]
  query: string
}

export const researchShow = createServerOnlyFn(
  async (_actorId: string, title: string, pagesToRead = 3): Promise<Proposal> => {
    const wanted = title.trim()
    if (!wanted) throw new Error('Name a show to look up.')

    // Only the public half of the question ever leaves: a show's title, and
    // nothing about who is asking or why.
    const query = `${wanted} Broadway production cast replacements dates`
    const read: { title: string; url: string; text: string }[] = []

    // Wikipedia first and directly. It answers, its API is meant to be used,
    // and its articles carry run dates and cast sections. General search is a
    // supplement, not the foundation.
    const articles = await searchWikipedia(`${wanted} musical Broadway`, 5)
    const named = articles.filter(
      (article) =>
        !SCREEN.test(article.title) && article.title.toLowerCase().includes(wanted.toLowerCase()),
    )
    // Search fills the rest of the page with things that merely mention the
    // show — "List of the longest-running Broadway shows" is not a source about
    // anybody's cast. Fall back to the top result only if nothing is named.
    for (const article of (named.length
      ? named
      : articles.filter((a) => !SCREEN.test(a.title))
    ).slice(0, 2)) {
      const text = await readWikipedia(article.title).catch(() => '')
      if (text.length > 500) read.push({ ...article, text })
    }

    // Whatever else the metasearch can find, if its engines are answering.
    try {
      for (const result of await searchWeb(query, 6)) {
        if (read.length >= pagesToRead) break
        if (result.url.includes('wikipedia.org')) continue
        try {
          read.push({ title: result.title, url: result.url, text: await readPage(result.url) })
        } catch {
          // A page that will not load is ordinary; move on.
        }
      }
    } catch {
      // The search service being down or rate-limited is not fatal while
      // Wikipedia answered.
    }

    if (read.length === 0) {
      throw new Error(`Nothing readable was found about ${wanted}.`)
    }

    const pages = read
      .map((page) => `--- ${page.title}\n--- ${page.url}\n\n${page.text}`)
      .join('\n\n')

    // Room for a full cast. A long run has dozens of principals across its
    // replacements, and a budget that fits only the opening company produces a
    // cast list that looks complete and is not.
    const proposal = await askModelForJson<unknown>(
      [
        { role: 'system', content: INSTRUCTIONS },
        { role: 'user', content: `Show to describe: ${wanted}\n\nPages:\n\n${pages}` },
      ],
      { maxTokens: 12_000 },
    )

    return {
      json: JSON.stringify(proposal, null, 2),
      sources: read.map((page) => ({ title: page.title, url: page.url })),
      query,
    }
  },
)

export const proposeShowResearch = createServerFn({ method: 'POST' })
  .validator(z.object({ title: z.string().trim().min(1).max(200) }))
  .handler(async ({ data }) => researchShow((await requireSession()).user.id, data.title))

/**
 * Takes a researched proposal and enters it as a submission.
 *
 * Open to any member, because what it creates is a **pending** show — the same
 * thing they would get by filling in the submission form, and subject to the
 * same review. They can log a night against their own submission straight away,
 * so nobody waits on an administrator to record last night, and the catalog
 * only gains a published record once a person has looked.
 *
 * Everything written is marked `research`: found by a machine reading the web,
 * confirmed by nobody. A wrong run date must never look like a checked fact.
 */
export const acceptResearch = createServerOnlyFn(async (actorId: string, json: string) => {
  let body: unknown
  try {
    body = JSON.parse(json)
  } catch (error) {
    throw new Error(`That was not JSON: ${(error as Error).message}`)
  }

  const parsed = researched.safeParse(body)
  if (!parsed.success) {
    // The path, not just the verdict. "Did not come back in a usable shape"
    // cost a caller three rounds of blind probing to discover it had written
    // `cast` where the schema wanted `castings` — and the probing itself left a
    // stub behind. One line of error text would have saved all of it.
    const said = parsed.error.issues
      .slice(0, 5)
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ')
    throw new Error(`That research did not match the expected shape — ${said}`)
  }
  const first = parsed.data.shows[0]
  if (!first) throw new Error('There was no show in that: `shows` was empty.')

  const { searchCatalogFor, submitShowForUser, findOrCreateProduction } = await import(
    './catalog-functions'
  )
  const clash = (await searchCatalogFor(actorId, first.title)).find(
    (row) => row.title.toLowerCase() === first.title.toLowerCase(),
  )

  /**
   * A second attempt fills in the first one rather than being turned away.
   *
   * Refusing outright was right about the danger — two identical titles in the
   * catalog is worse than nothing — and wrong about the remedy. Creating a show
   * is a single call, so a caller that gets the payload shape wrong is left
   * holding a stub with no productions and no run dates, and every later
   * attempt to describe it was refused as a duplicate. `narrow_the_year`, the
   * thing this whole layer exists to feed, then answers "nobody has recorded
   * when this ran" forever.
   *
   * So: a submission the caller made themselves, still awaiting review, is
   * theirs to complete. Anything already published is not — that is a catalog
   * record, and correcting one is a review decision.
   */
  if (clash && clash.catalogStatus !== 'pending') {
    throw new Error(
      `${clash.title} is already in the catalog. Add to it with add_production and add_casting instead.`,
    )
  }

  const submitted = clash
    ? { id: clash.id, title: clash.title }
    : await submitShowForUser(actorId, {
        title: first.title,
        type: first.type,
        synopsis: first.synopsis ?? undefined,
      })

  const { getDb } = await import('./db/client')
  const { eq } = await import('drizzle-orm')
  const { productions } = await import('./db/schema')
  const { addCasting } = await import('./people-functions')

  let productionsAdded = 0
  let castingsAdded = 0
  for (const production of first.productions ?? []) {
    const made = await findOrCreateProduction(
      actorId,
      submitted.id,
      production.name,
      production.productionType,
      production.venue ?? undefined,
      production.city ?? undefined,
    )
    productionsAdded += 1
    // Fill blanks, never overwrite. A run already on record was put there by
    // somebody or by an earlier pass, and a second opinion from a web page is
    // not a reason to replace it.
    const [existing] = await getDb()
      .select({ openedOn: productions.openedOn, closedOn: productions.closedOn })
      .from(productions)
      .where(eq(productions.id, made.id))
    await getDb()
      .update(productions)
      .set({
        openedOn: existing?.openedOn ?? production.openedOn ?? null,
        closedOn: existing?.closedOn ?? production.closedOn ?? null,
        source: 'research',
        sourceNote: production.source ?? null,
      })
      .where(eq(productions.id, made.id))

    // The order a source lists replacements in is data even when the dates are
    // missing, and it is what lets the app say "late in the run, not 2003".
    const seen = new Map<string, number>()
    for (const member of production.cast ?? []) {
      const nth = (seen.get(member.role) ?? 0) + 1
      seen.set(member.role, nth)
      await addCasting(
        actorId,
        {
          productionId: made.id,
          personName: member.name,
          role: member.role,
          kind: member.kind,
          isPrincipal: member.isPrincipal ?? member.kind === 'performer',
          startedOn: member.startedOn ?? undefined,
          endedOn: member.endedOn ?? undefined,
          replacementOrder: member.kind === 'performer' ? nth : undefined,
        },
        { source: 'research', sourceNote: production.source ?? null },
      )
      castingsAdded += 1
    }
  }

  return {
    showId: submitted.id,
    title: submitted.title,
    // Said plainly, so a caller retrying knows which of the two happened.
    completedExisting: Boolean(clash),
    productions: productionsAdded,
    castings: castingsAdded,
  }
})

export const addResearchedShow = createServerFn({ method: 'POST' })
  .validator(z.object({ json: z.string().min(2).max(200_000) }))
  .handler(async ({ data }) => acceptResearch((await requireSession()).user.id, data.json))
