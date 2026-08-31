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
    // The losing record is deleted, and putting it back means recreating it by
    // hand. Nights and productions move across, and the name is kept — but the
    // row is gone, so this asks first.
    const target = venues.find((one) => one.id === String(form.get('targetId')))
    const source = venues.find((one) => one.id === String(form.get('sourceId')))
    if (
      source &&
      target &&
      !window.confirm(
        `Treat “${source.name}” and “${target.name}” as the same building? ` +
          `Everything recorded at “${source.name}” moves across, and the name is kept as a former one.`,
      )
    ) {
      return
    }
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
        <p>What deduplication could not settle on its own.</p>
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
              <div className="venue-row" key={venue.id}>
                <form onSubmit={rename}>
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
                  {venue.formerNames.length ? (
                    <p className="venue-former">Formerly {venue.formerNames.join(', ')}</p>
                  ) : null}
                  <p className="venue-usage">
                    {venue.outingCount} {venue.outingCount === 1 ? 'outing' : 'outings'} ·{' '}
                    {venue.productionCount}{' '}
                    {venue.productionCount === 1 ? 'production' : 'productions'}
                  </p>
                  <button className="button button-quiet" type="submit">
                    Save
                  </button>
                </form>
                {/*
                Deliberate, rather than only for pairs that look alike. The
                suspect list is fuzzy name matching, and a renamed theatre is
                precisely the case it cannot find: the Brooks Atkinson and the
                Lena Horne share almost no letters and are the same room. Two
                records nobody would ever mistake for each other still need
                joining, so the choice has to be a person's.
              */}
                <form className="venue-merge" onSubmit={merge}>
                  <input type="hidden" name="sourceId" value={venue.id} />
                  <label>
                    Same building as
                    <select name="targetId" required defaultValue="">
                      <option value="">Leave it alone</option>
                      {venues
                        .filter((other) => other.id !== venue.id)
                        .map((other) => (
                          <option key={other.id} value={other.id}>
                            {other.name}
                            {other.city ? ` — ${other.city}` : ''}
                          </option>
                        ))}
                    </select>
                  </label>
                  <button className="text-action text-action-warn" type="submit">
                    Merge “{venue.name}” into it
                  </button>
                </form>
              </div>
            ))}
          </div>
        ) : (
          <p className="profile-empty">No venues recorded yet.</p>
        )}
      </section>
    </main>
  )
}
