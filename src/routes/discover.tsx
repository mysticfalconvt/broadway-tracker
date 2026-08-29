import { Link, createFileRoute } from '@tanstack/react-router'
import { useDeferredValue, useEffect, useState } from 'react'

import { ShowArtwork } from '../components/ShowArtwork'
import { searchPublishedShows } from '../server/catalog-functions'

export const Route = createFileRoute('/discover')({ component: Discover })

type CatalogShow = Awaited<ReturnType<typeof searchPublishedShows>>[number]

function Discover() {
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
        <h1>Find a show.</h1>
        <p>Explore the growing collection of Broadway, touring, regional, and local theatre.</p>
      </header>
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
              <ShowArtwork title={show.title} type={show.type} coverImageKey={show.coverImageKey} />
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
    </main>
  )
}
