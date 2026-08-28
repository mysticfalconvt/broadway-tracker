import { Link, createFileRoute } from '@tanstack/react-router'
import { useDeferredValue, useState } from 'react'

import { PrivacyBadge } from '../../components/PrivacyBadge'
import { Rating } from '../../components/Rating'
import { ShowArtwork } from '../../components/ShowArtwork'
import { ShowStatus } from '../../components/ShowStatus'
import { getMyLibrary } from '../../server/library-functions'

export const Route = createFileRoute('/_protected/library')({
  loader: () => getMyLibrary(),
  component: Library,
})

function Library() {
  const entries = Route.useLoaderData()
  const [filter, setFilter] = useState<'all' | 'want_to_see' | 'seen' | 'favorites'>('all')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<'title' | 'rating'>('title')
  const deferredQuery = useDeferredValue(query)
  const visibleEntries = entries
    .filter(
      (entry) =>
        filter === 'all' || (filter === 'favorites' ? entry.favorite : entry.status === filter),
    )
    .filter((entry) => entry.title.toLowerCase().includes(deferredQuery.trim().toLowerCase()))
  const sortedEntries = [...visibleEntries].sort((left, right) =>
    sort === 'rating'
      ? (right.rating ?? 0) - (left.rating ?? 0) || left.title.localeCompare(right.title)
      : left.title.localeCompare(right.title),
  )
  return (
    <main className="library-page page-wrap">
      <header className="settings-header">
        <p className="eyebrow">My theatre</p>
        <h1>Your collected shows.</h1>
        <p>
          {entries.length} {entries.length === 1 ? 'show' : 'shows'} in your private collection.
        </p>
      </header>
      <div className="library-tabs" role="tablist" aria-label="Library views">
        {(['all', 'want_to_see', 'seen', 'favorites'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={filter === value}
            onClick={() => setFilter(value)}
          >
            {value === 'want_to_see' ? 'Want to See' : value[0]?.toUpperCase() + value.slice(1)}
          </button>
        ))}
      </div>
      <div className="library-controls">
        <label>
          Search your theatre
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search titles"
          />
        </label>
        <label>
          Sort
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as 'title' | 'rating')}
          >
            <option value="title">Show title</option>
            <option value="rating">Highest rated</option>
          </select>
        </label>
      </div>
      {sortedEntries.length ? (
        <div className="library-grid">
          {sortedEntries.map((entry) => (
            <Link
              key={entry.id}
              to="/shows/$slug"
              params={{ slug: entry.slug }}
              className="library-entry"
            >
              <ShowArtwork title={entry.title} type={entry.type} tone="midnight" />
              <div>
                <h2>{entry.title}</h2>
                <p>{entry.type}</p>
                <ShowStatus status={entry.status} favorite={entry.favorite} />
                {entry.rating ? <Rating value={entry.rating / 2} size="small" /> : null}
                <PrivacyBadge visibility={entry.visibility} />
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <section className="catalog-empty">
          <h2>Your collection is waiting.</h2>
          <p>Search the catalog, then add the shows you have seen or hope to see.</p>
          <Link className="button button-primary" to="/discover">
            Search shows
          </Link>
        </section>
      )}
    </main>
  )
}
