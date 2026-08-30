import { createServerOnlyFn } from '@tanstack/react-start'

/**
 * Searching the web, through a SearXNG instance on the same network.
 *
 * Self-hosted deliberately. The queries this sends are about public record —
 * when a show ran, who was in it — but they are still generated from somebody's
 * half-remembered evening, and a search engine that logs them would be able to
 * reconstruct a good deal about a family from the pattern. Running the
 * metasearch ourselves means the query fans out anonymously and nothing about
 * who asked leaves the building.
 */

export type SearchResult = {
  title: string
  url: string
  snippet: string
}

/** Sources worth reading first for theatre. Ordered, best-documented first. */
const PREFERRED_HOSTS = ['wikipedia.org', 'ibdb.com', 'playbill.com', 'broadwayworld.com']

function rank(result: SearchResult) {
  const host = (() => {
    try {
      return new URL(result.url).hostname
    } catch {
      return ''
    }
  })()
  const index = PREFERRED_HOSTS.findIndex((preferred) => host.endsWith(preferred))
  return index === -1 ? PREFERRED_HOSTS.length : index
}

export const searchWeb = createServerOnlyFn(
  async (query: string, limit = 8): Promise<SearchResult[]> => {
    const base = process.env.SEAR_XNG_URL
    if (!base) throw new Error('No search service is configured.')

    const url = new URL('search', base.endsWith('/') ? base : `${base}/`)
    url.searchParams.set('q', query)
    url.searchParams.set('format', 'json')
    url.searchParams.set('language', 'en')

    const response = await fetch(url, { signal: AbortSignal.timeout(20_000) })
    if (!response.ok) throw new Error(`The search service answered ${response.status}.`)

    const body = (await response.json()) as {
      results?: { title?: string; url?: string; content?: string }[]
    }
    const results = (body.results ?? [])
      .filter((row): row is { title: string; url: string; content?: string } =>
        Boolean(row.title && row.url),
      )
      .map((row) => ({ title: row.title, url: row.url, snippet: row.content ?? '' }))

    // Stable sort, so a well-documented source outranks a blog without
    // discarding anything: the model still sees the rest.
    return results
      .map((result, position) => ({ result, position, rank: rank(result) }))
      .sort((a, b) => a.rank - b.rank || a.position - b.position)
      .slice(0, limit)
      .map((row) => row.result)
  },
)

/**
 * The readable text of one page.
 *
 * Deliberately crude: tags stripped, whitespace collapsed, truncated. A real
 * readability pass would be better and is not worth a dependency here, because
 * the consumer is a language model that copes fine with navigation cruft and
 * badly with a page it never received.
 */
export const readPage = createServerOnlyFn(async (url: string, maxChars = 12_000) => {
  const response = await fetch(url, {
    headers: {
      // Named, for the same reason the geocoder is: somebody whose server this
      // is should be able to tell who is asking and complain to them.
      'User-Agent': `BroadwayTracker/1.0 (+${process.env.BETTER_AUTH_URL ?? 'https://broadway.rboskind.com'})`,
      Accept: 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw new Error(`${url} answered ${response.status}`)

  const html = await response.text()
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
  return text.slice(0, maxChars)
})

/**
 * Wikipedia, asked directly rather than through a search engine.
 *
 * The primary source, for three reasons: it has an API meant to be used, its
 * licence expects reuse, and — the deciding one — it is the only source here
 * that reliably answers at all. A self-hosted metasearch instance depends on
 * general engines that rate-limit and serve CAPTCHAs to datacentre addresses,
 * so it fails exactly when it is needed.
 *
 * What it gives is uneven: run dates and opening companies are good, and
 * replacement casts are usually an undated list of names. That is a limit of
 * the source, not something a model should paper over.
 */
const WIKIPEDIA = 'https://en.wikipedia.org/w/api.php'

async function wikipedia(params: Record<string, string>) {
  const url = new URL(WIKIPEDIA)
  for (const [key, value] of Object.entries({ ...params, format: 'json', origin: '*' })) {
    url.searchParams.set(key, value)
  }
  const response = await fetch(url, {
    headers: {
      'User-Agent': `BroadwayTracker/1.0 (+${process.env.BETTER_AUTH_URL ?? 'https://broadway.rboskind.com'})`,
    },
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw new Error(`Wikipedia answered ${response.status}`)
  return response.json()
}

export const searchWikipedia = createServerOnlyFn(
  async (query: string, limit = 3): Promise<SearchResult[]> => {
    const body = (await wikipedia({
      action: 'query',
      list: 'search',
      srsearch: query,
      srlimit: String(limit),
    })) as {
      query?: { search?: { title: string; snippet?: string }[] }
    }
    return (body.query?.search ?? []).map((row) => ({
      title: row.title,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(row.title.replace(/ /g, '_'))}`,
      snippet: (row.snippet ?? '').replace(/<[^>]+>/g, ''),
    }))
  },
)

/** An article as plain text, which is what a model wants and what the API offers. */
export const readWikipedia = createServerOnlyFn(async (title: string, maxChars = 24_000) => {
  const body = (await wikipedia({
    action: 'query',
    prop: 'extracts',
    explaintext: '1',
    titles: title,
  })) as { query?: { pages?: Record<string, { extract?: string }> } }
  const page = Object.values(body.query?.pages ?? {})[0]
  return (page?.extract ?? '').slice(0, maxChars)
})
