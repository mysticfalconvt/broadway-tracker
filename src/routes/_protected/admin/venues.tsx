import { createFileRoute, redirect } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'

import { getDuplicateSuspicions } from '../../../server/admin-functions'
import { getVenuesForAdmin, mergeVenueInto, saveVenue } from '../../../server/venue-functions'

export const Route = createFileRoute('/_protected/admin/venues')({
  beforeLoad: ({ context }) => {
    if (context.user.role !== 'admin') throw redirect({ to: '/' })
  },
  loader: async () => ({
    venues: await getVenuesForAdmin(),
    suspicions: (await getDuplicateSuspicions()).venues,
  }),
  component: VenueAdmin,
})

function VenueAdmin() {
  const { venues, suspicions } = Route.useLoaderData()
  const [error, setError] = useState<string | null>(null)

  async function merge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setError(null)
    try {
      await mergeVenueInto({
        data: {
          sourceId: String(form.get('sourceId')),
          targetId: String(form.get('targetId')),
        },
      })
      window.location.reload()
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'We could not merge those.')
    }
  }

  async function rename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setError(null)
    try {
      await saveVenue({
        data: {
          id: String(form.get('id')),
          name: String(form.get('name')),
          city: String(form.get('city')).trim() || undefined,
          country: String(form.get('country')).trim() || undefined,
        },
      })
      window.location.reload()
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'We could not save that.')
    }
  }

  return (
    <main className="admin-page page-wrap">
      <header className="settings-header">
        <p className="eyebrow">Administration</p>
        <h1>Venues.</h1>
        <p>
          The same theatre entered different ways is folded together automatically. What is left
          here is the variation that needed a person.
        </p>
      </header>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      {suspicions.length ? (
        <section>
          <div className="section-heading">
            <div>
              <p className="eyebrow">Possible duplicates</p>
              <h2>These look like the same theatre.</h2>
            </div>
          </div>
          <ul className="suspect-list">
            {suspicions.map((pair) => (
              <li key={`${pair.a.id}-${pair.b.id}`}>
                <span>
                  <strong>{pair.a.name}</strong> <em>{pair.a.city ?? 'no city'}</em>
                </span>
                <span>
                  <strong>{pair.b.name}</strong> <em>{pair.b.city ?? 'no city'}</em>
                </span>
                <span className="suspect-score">{Math.round(pair.score * 100)}% alike</span>
                <form onSubmit={merge}>
                  <input type="hidden" name="sourceId" value={pair.b.id} />
                  <input type="hidden" name="targetId" value={pair.a.id} />
                  <button className="button button-quiet" type="submit">
                    Merge into “{pair.a.name}”
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <div className="section-heading">
          <div>
            <p className="eyebrow">All venues</p>
            <h2>{venues.length} recorded.</h2>
          </div>
        </div>
        {venues.length ? (
          <div className="venue-list">
            {venues.map((venue) => (
              <form key={venue.id} onSubmit={rename}>
                <input type="hidden" name="id" value={venue.id} />
                <label>
                  Name
                  <input name="name" defaultValue={venue.name} required />
                </label>
                <label>
                  City
                  <input name="city" defaultValue={venue.city ?? ''} />
                </label>
                <label>
                  Country
                  <input name="country" defaultValue={venue.country ?? ''} />
                </label>
                <p className="venue-usage">
                  {venue.outingCount} {venue.outingCount === 1 ? 'outing' : 'outings'} ·{' '}
                  {venue.productionCount}{' '}
                  {venue.productionCount === 1 ? 'production' : 'productions'}
                </p>
                <button className="button button-quiet" type="submit">
                  Save
                </button>
              </form>
            ))}
          </div>
        ) : (
          <p className="profile-empty">No venues recorded yet.</p>
        )}
      </section>
    </main>
  )
}
