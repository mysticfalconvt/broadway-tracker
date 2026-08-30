import { Link, createFileRoute, notFound } from '@tanstack/react-router'

import { ShowArtwork } from '../../components/ShowArtwork'
import { VenueMap } from '../../components/VenueMap'
import { formatFuzzyDate } from '../../lib/fuzzy-date'
import { getVenue } from '../../server/venue-functions'

export const Route = createFileRoute('/venues/$id')({
  loader: async ({ params }) => {
    try {
      return await getVenue({ data: { id: params.id } })
    } catch {
      throw notFound()
    }
  },
  component: Venue,
  notFoundComponent: VenueNotFound,
})

function VenueNotFound() {
  return (
    <main className="page-wrap empty-state">
      <p className="eyebrow">Not in the archive</p>
      <h1>That venue isn’t recorded here.</h1>
      <Link className="button button-primary" to="/discover">
        Search the catalog
      </Link>
    </main>
  )
}

function Venue() {
  const { venue, staged, yourNights } = Route.useLoaderData()
  return (
    <main className="venue-page page-wrap">
      <header className="settings-header">
        <p className="eyebrow">Venue</p>
        <h1>{venue.name}</h1>
        <p>{[venue.city, venue.country].filter(Boolean).join(', ') || 'Location not recorded'}</p>
      </header>

      {/* A single building, so a close view. Absent coordinates are not an
          error state: the page reads the same without the map. */}
      {venue.latitude !== null && venue.longitude !== null ? (
        <VenueMap height="18rem" venues={[venue]} />
      ) : null}

      <section>
        <div className="section-heading">
          <div>
            <p className="eyebrow">Staged here</p>
            <h2>
              {staged.length} {staged.length === 1 ? 'production' : 'productions'}
            </h2>
          </div>
        </div>
        {staged.length ? (
          <ul className="venue-productions">
            {staged.map((production) => (
              <li key={production.productionId}>
                <Link to="/shows/$slug" params={{ slug: production.showSlug }}>
                  <ShowArtwork
                    title={production.showTitle}
                    type={production.showType}
                    coverImageKey={production.coverImageKey}
                  />
                  <span>
                    <strong>{production.showTitle}</strong>
                    <span>{production.productionName}</span>
                    <span>{describeRun(production)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="profile-empty">
            Nothing in the catalog has been recorded at this venue yet.
          </p>
        )}
      </section>

      {yourNights.length ? (
        <section>
          <div className="section-heading">
            <div>
              <p className="eyebrow">Your nights here</p>
              <h2>
                {yourNights.length} {yourNights.length === 1 ? 'performance' : 'performances'}
              </h2>
            </div>
          </div>
          <ul className="venue-nights">
            {yourNights.map((night) => (
              <li key={night.id}>
                <Link to="/outings/$id" params={{ id: night.id }}>
                  <strong>{night.showTitle}</strong>
                  <span>{formatFuzzyDate(night)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  )
}

/** A run reads as a span, an opening, or nothing — never an invented date. */
function describeRun(production: { openedOn?: string | null; closedOn?: string | null }) {
  const opened = production.openedOn
    ? formatFuzzyDate({ datePrecision: 'exact', occurredOn: production.openedOn })
    : null
  const closed = production.closedOn
    ? formatFuzzyDate({ datePrecision: 'exact', occurredOn: production.closedOn })
    : null
  if (opened && closed) return `${opened} — ${closed}`
  if (opened) return `Opened ${opened} · still running`
  if (closed) return `Closed ${closed}`
  return 'Run dates not recorded'
}
