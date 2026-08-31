import { Link, createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { formatCurtain, formatFuzzyDateShort } from '../../lib/fuzzy-date'
import { getMyTimeline } from '../../server/outing-functions'
import { useDeferredValue, useState } from 'react'

import { PrivacyBadge } from '../../components/PrivacyBadge'
import { Rating } from '../../components/Rating'
import { ShowArtwork } from '../../components/ShowArtwork'
import { ShowStatus } from '../../components/ShowStatus'
import { getMyLibrary } from '../../server/library-functions'

export const Route = createFileRoute('/_protected/library')({
  validateSearch: z.object({ view: z.enum(['collection', 'timeline']).optional() }),
  loaderDeps: ({ search }) => ({ view: search.view }),
  loader: async ({ deps }) => ({
    entries: await getMyLibrary(),
    // Only when asked for: it is a second query over every night somebody has,
    // and most visits to this page are looking for a show by name.
    timeline: deps.view === 'timeline' ? await getMyTimeline() : null,
  }),
  component: Library,
})

/**
 * Every night in order, with the years called out.
 *
 * The collection answers "have I seen this". This answers "what was that year
 * like" — a different question, and the one the page could not be asked. The
 * year is the marker because it is how people actually remember going: the
 * autumn everybody was in town, the year with nothing in it.
 */
function Timeline({
  timeline,
}: {
  timeline: NonNullable<Awaited<ReturnType<typeof getMyTimeline>>>
}) {
  if (timeline.total === 0) {
    return <p className="empty-note">No nights logged yet.</p>
  }
  return (
    <div className="timeline">
      {timeline.years.map((year) => (
        <section key={year.year}>
          <h2 className="timeline-year">
            {year.year}
            <span>
              {year.nights.length} {year.nights.length === 1 ? 'night' : 'nights'}
            </span>
          </h2>
          <ol className="timeline-nights">
            {year.nights.map((night) => (
              <li key={night.outingId}>
                <Link params={{ id: night.outingId }} to="/outings/$id">
                  <span className="timeline-when">
                    {formatFuzzyDateShort(night)}
                    {night.curtain ? ` · ${formatCurtain(night.curtain)}` : ''}
                  </span>
                  <span className="timeline-what">
                    <strong>{night.showTitle}</strong>
                    {night.venue ? (
                      <span>{[night.venue, night.city].filter(Boolean).join(', ')}</span>
                    ) : null}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      ))}
      {timeline.undated.length ? (
        <section>
          {/* Kept, not dropped: a night nobody can date is still a night. */}
          <h2 className="timeline-year">
            Date unknown
            <span>{timeline.undated.length}</span>
          </h2>
          <ol className="timeline-nights">
            {timeline.undated.map((night) => (
              <li key={night.outingId}>
                <Link params={{ id: night.outingId }} to="/outings/$id">
                  <span className="timeline-when">{formatFuzzyDateShort(night)}</span>
                  <span className="timeline-what">
                    <strong>{night.showTitle}</strong>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  )
}

function Library() {
  const { entries, timeline } = Route.useLoaderData()
  const { view } = Route.useSearch()
  const showing = view === 'timeline' ? 'timeline' : 'collection'
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
        <h1>{showing === 'timeline' ? 'Your nights, in order.' : 'Your collected shows.'}</h1>
        <p>
          {showing === 'timeline'
            ? `${timeline?.total ?? 0} ${timeline?.total === 1 ? 'night' : 'nights'} logged.`
            : `${entries.length} ${entries.length === 1 ? 'show' : 'shows'} in your private collection.`}
        </p>
      </header>

      <nav aria-label="How to look at it" className="discover-tabs">
        <Link
          activeOptions={{ exact: true, includeSearch: true }}
          className={showing === 'collection' ? 'is-current' : ''}
          search={{ view: undefined }}
          to="/library"
        >
          Collection
        </Link>
        <Link
          activeOptions={{ exact: true, includeSearch: true }}
          className={showing === 'timeline' ? 'is-current' : ''}
          search={{ view: 'timeline' }}
          to="/library"
        >
          Timeline
        </Link>
      </nav>

      {showing === 'timeline' && timeline ? <Timeline timeline={timeline} /> : null}
      {showing === 'timeline' ? null : (
        <>
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
                  <ShowArtwork
                    title={entry.title}
                    type={entry.type}
                    coverImageKey={entry.coverImageKey}
                  />
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
        </>
      )}
    </main>
  )
}
