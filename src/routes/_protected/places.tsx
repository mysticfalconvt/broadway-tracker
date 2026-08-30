import { Link, createFileRoute } from '@tanstack/react-router'

import { VenueMap } from '../../components/VenueMap'
import { getMyPlaces } from '../../server/profile-functions'

export const Route = createFileRoute('/_protected/places')({
  loader: async () => ({ places: await getMyPlaces() }),
  component: Places,
})

function Places() {
  const { places } = Route.useLoaderData()
  const nights = places.reduce((total, place) => total + place.nights, 0)

  return (
    <main className="page-wrap">
      <header className="settings-header">
        <p className="eyebrow">Your theatre</p>
        <h1>Everywhere you have been.</h1>
        <p>
          {places.length
            ? `${nights} ${nights === 1 ? 'night' : 'nights'} across ${places.length} ${
                places.length === 1 ? 'place' : 'places'
              }.`
            : 'This fills in as you log where you saw things.'}
        </p>
      </header>

      <VenueMap height="30rem" venues={places} />

      {places.length ? (
        <section>
          <div className="section-heading">
            <div>
              <h2>Where you keep going back.</h2>
            </div>
          </div>
          <ul className="places-list">
            {places.map((place) => (
              <li key={place.id}>
                <Link params={{ id: place.id }} to="/venues/$id">
                  <strong>{place.name}</strong>
                  <span>{[place.city, place.country].filter(Boolean).join(' · ')}</span>
                </Link>
                <span className="places-count">
                  {place.nights} {place.nights === 1 ? 'night' : 'nights'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  )
}
