import { Link, createFileRoute, redirect } from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'

import { getLocalShowsForAdmin, publishLocalShow } from '../../../server/catalog-functions'

export const Route = createFileRoute('/_protected/admin/local')({
  beforeLoad: ({ context }) => {
    if (context.user.role !== 'admin') throw redirect({ to: '/' })
  },
  loader: async () => ({ shows: await getLocalShowsForAdmin() }),
  component: LocalShowAdmin,
})

function LocalShowAdmin() {
  const { shows } = Route.useLoaderData()
  const [error, setError] = useState<string | null>(null)

  async function promote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const title = String(form.get('title'))
    if (
      !window.confirm(
        `Lift “${title}” into the shared catalog?\n\n` +
          'It becomes searchable by everybody and appears on the open web. Do this only for ' +
          'work of general interest — not because a record looks untidy.',
      )
    ) {
      return
    }
    setError(null)
    try {
      await publishLocalShow({ data: { showId: String(form.get('showId')) } })
      window.location.reload()
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'We could not publish that.')
    }
  }

  return (
    <main className="admin-page page-wrap">
      <header className="settings-header">
        <p className="eyebrow">Administration</p>
        <h1>Local records.</h1>
        <p>
          Work that exists nowhere but one town — a company’s own revue, a school’s devised piece.
          These were never submitted and are not waiting on you. They are listed only so that
          something of wider interest can be lifted into the shared catalog.
        </p>
      </header>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      {shows.length ? (
        <ul className="suspect-list">
          {shows.map((show) => (
            <li key={show.id}>
              <span>
                <strong>{show.title}</strong> <em>{show.venue ?? 'no venue recorded'}</em>
              </span>
              <span className="suspect-score">
                {show.stagings} {show.stagings === 1 ? 'staging' : 'stagings'} · {show.nights}{' '}
                {show.nights === 1 ? 'night' : 'nights'} logged
              </span>
              <span className="suspect-actions">
                <Link
                  className="button button-quiet"
                  params={{ slug: show.slug }}
                  to="/shows/$slug"
                >
                  Look at it
                </Link>
                <form onSubmit={promote}>
                  <input name="showId" type="hidden" value={show.id} />
                  <input name="title" type="hidden" value={show.title} />
                  <button className="button button-quiet" type="submit">
                    Lift into the catalog
                  </button>
                </form>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="profile-empty">No local records yet.</p>
      )}
    </main>
  )
}
