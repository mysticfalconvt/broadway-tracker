import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
import { z } from 'zod'

import { type Actor, assertAdmin } from './catalog-functions'
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
   the opening-night company. Replacements are the point.
3. If the pages only give you the opening cast, return that and leave the dates out
   rather than guessing when anybody was replaced.
4. Use YYYY-MM-DD. If a page gives only a month or a year, omit the date entirely.
5. Return only the JSON object. No commentary.`

export type Proposal = {
  json: string
  sources: { title: string; url: string }[]
  query: string
}

export const researchShow = createServerOnlyFn(
  async (actor: Actor, title: string, pagesToRead = 3): Promise<Proposal> => {
    assertAdmin(actor)
    const wanted = title.trim()
    if (!wanted) throw new Error('Name a show to look up.')

    // Only the public half of the question ever leaves: a show's title, and
    // nothing about who is asking or why.
    const query = `${wanted} Broadway production cast replacements dates`
    const read: { title: string; url: string; text: string }[] = []

    // Wikipedia first and directly. It answers, its API is meant to be used,
    // and its articles carry run dates and cast sections. General search is a
    // supplement, not the foundation.
    for (const article of await searchWikipedia(`${wanted} musical Broadway`, 2)) {
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

    const proposal = await askModelForJson<unknown>([
      { role: 'system', content: INSTRUCTIONS },
      { role: 'user', content: `Show to describe: ${wanted}\n\nPages:\n\n${pages}` },
    ])

    return {
      json: JSON.stringify(proposal, null, 2),
      sources: read.map((page) => ({ title: page.title, url: page.url })),
      query,
    }
  },
)

export const proposeShowResearch = createServerFn({ method: 'POST' })
  .validator(z.object({ title: z.string().trim().min(1).max(200) }))
  .handler(async ({ data }) => researchShow((await requireSession()).user as Actor, data.title))
