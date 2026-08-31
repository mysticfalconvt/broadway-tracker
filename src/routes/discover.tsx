import { Link, createFileRoute } from '@tanstack/react-router'
import { useDeferredValue, useEffect, useState } from 'react'
import { z } from 'zod'

import { Connections } from '../components/Connections'
import { ShowArtwork } from '../components/ShowArtwork'
import { searchPublishedShows } from '../server/catalog-functions'
import { getConnections } from '../server/connections'
import { getSession } from '../server/auth-functions'

/**
 * Two ways of looking at the same archive: everybody's, and your own.
 *
 * The second used to be a page of its own that nothing pointed at except one
 * line on the profile, which is a good way to build something nobody opens.
 * Here it sits beside the search, one click from the place people already come
 * to look at shows.
 *
 * The tab only exists for somebody signed in — it is made entirely of their own
 * nights — and a signed-out visitor asking for it gets the catalog rather than
 * an error.
 */
export const Route = createFileRoute('/discover')({
  validateSearch: z.object({ view: z.enum(['shows', 'yours']).optional() }),
  loaderDeps: ({ search }) => ({ view: search.view }),
  loader: async ({ deps }) => {
    const session = await getSession()
    return {
      signedIn: Boolean(session),
      found: session && deps.view === 'yours' ? await getConnections() : null,
    }
  },
  component: Discover,
})

type CatalogShow = Awaited<ReturnType<typeof searchPublishedShows>>[number]

function Discover() {
  const { signedIn, found } = Route.useLoaderData()
  const { view } = Route.useSearch()
  const showing = signedIn && view === 'yours' ? 'yours' : 'shows'
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [shows, setShows] = useState<CatalogShow[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)

    void searchPublishedShows({ data: { query: deferredQuery } }).then((results) => {
      if (!cancelled) {
        setShows(results)
        setIsLoading(false)
      }
    })

    return () => {
      cancelled = true
    }
  }, [deferredQuery])

  return (
    <main className="discover-page page-wrap">
      <header className="discover-header">
        <p className="eyebrow">The shared archive</p>
        <h1>{showing === 'yours' ? 'Things that came round again.' : 'Find a show.'}</h1>
        <p>
          {showing === 'yours'
            ? 'The same faces, theatres and shows, years apart.'
            : 'Explore the growing collection of Broadway, touring, regional, and local theatre.'}
        </p>
      </header>

      {signedIn ? (
        <nav aria-label="What to look at" className="discover-tabs">
          <Link
            className={showing === 'shows' ? 'is-current' : ''}
            search={{ view: undefined }}
            to="/discover"
          >
            Every show
          </Link>
          <Link
            className={showing === 'yours' ? 'is-current' : ''}
            search={{ view: 'yours' }}
            to="/discover"
          >
            Came round again
          </Link>
        </nav>
      ) : null}

      {showing === 'yours' && found ? <Connections found={found} /> : null}

      {showing === 'yours' ? null : (
        <>
          <label className="catalog-search">
            <span className="sr-only">Search the catalog</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search shows..."
              autoComplete="off"
            />
          </label>
          <p className="catalog-result-count" aria-live="polite">
            {isLoading
              ? 'Searching the archive...'
              : `${shows.length} ${shows.length === 1 ? 'show' : 'shows'}`}
          </p>
          {shows.length ? (
            <div className="catalog-results">
              {shows.map((show) => (
                <Link
                  key={show.id}
                  to="/shows/$slug"
                  params={{ slug: show.slug }}
                  className="catalog-show-row"
                >
                  <ShowArtwork
                    title={show.title}
                    type={show.type}
                    coverImageKey={show.coverImageKey}
                  />
                  <span>
                    <strong>{show.title}</strong>
                    <small>{show.type}</small>
                  </span>
                  <span aria-hidden="true">View</span>
                </Link>
              ))}
            </div>
          ) : !isLoading ? (
            <section className="catalog-empty">
              <h2>{query ? 'Nothing in the archive yet.' : 'The curtain is about to rise.'}</h2>
              <p>
                {query
                  ? 'Try another title. Signed-in members will be able to submit missing shows shortly.'
                  : 'Published shows will appear here as the shared archive grows.'}
              </p>
            </section>
          ) : null}
        </>
      )}
    </main>
  )
}
