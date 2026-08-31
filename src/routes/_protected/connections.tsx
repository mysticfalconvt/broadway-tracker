import { Link, createFileRoute } from '@tanstack/react-router'

import { getConnections } from '../../server/connections'

/**
 * Where a history joins up with itself.
 *
 * None of this is new. Every line was already recorded, on some night years
 * apart from the one beside it — the app has simply never said them in the same
 * place. That is the whole feature: not more to look at, the same things seen
 * together.
 *
 * Sections appear only when they have something in them. A page of empty
 * headings telling somebody what they have not done yet is the opposite of the
 * point.
 */
export const Route = createFileRoute('/_protected/connections')({
  component: Connections,
  loader: async () => ({ found: await getConnections() }),
})

function times(count: number) {
  return count === 2 ? 'twice' : `${count} times`
}

function Connections() {
  const { found } = Route.useLoaderData()
  const empty =
    !found.performers.length && !found.venues.length && !found.shows.length && !found.roles.length

  return (
    <main className="page-wrap">
      <header className="settings-header">
        <p className="eyebrow">Memory lane</p>
        <h1>Things that came round again.</h1>
      </header>

      {empty ? (
        <p className="empty-note">
          Nothing has repeated yet. Log a few more nights and this fills itself in.
        </p>
      ) : null}

      {found.performers.length ? (
        <section className="joined-block">
          <h2>People you have seen more than once</h2>
          <ul className="joined-list">
            {found.performers.map((person) => (
              <li key={person.personId}>
                <Link params={{ id: person.personId }} to="/artists/$id">
                  <strong>{person.name}</strong>
                </Link>
                <span>
                  {person.shows.map((show, index) => (
                    <span key={show.slug}>
                      {index > 0 ? ', ' : ''}
                      <Link params={{ slug: show.slug }} to="/shows/$slug">
                        {show.title}
                      </Link>
                      {show.role ? ` as ${show.role}` : ''}
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {found.venues.length ? (
        <section className="joined-block">
          <h2>Theatres you have gone back to</h2>
          <ul className="joined-list">
            {found.venues.map((venue) => (
              <li key={venue.name}>
                <strong>{venue.name}</strong>
                <span>
                  {times(venue.nights)}
                  {/* The rename is the connection, not a footnote to it. */}
                  {venue.formerNames.length
                    ? ` · the same room as the ${venue.formerNames.join(', the ')}`
                    : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {found.shows.length ? (
        <section className="joined-block">
          <h2>Shows you have seen again</h2>
          <ul className="joined-list">
            {found.shows.map((show) => (
              <li key={show.slug}>
                <Link params={{ slug: show.slug }} to="/shows/$slug">
                  <strong>{show.title}</strong>
                </Link>
                <span>
                  {show.times
                    .map((one) => [one.year, one.production].filter(Boolean).join(' · '))
                    .join(' — then ')}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {found.roles.length ? (
        <section className="joined-block">
          <h2>Parts you have seen more than one person play</h2>
          <ul className="joined-list">
            {found.roles.map((role) => (
              <li key={`${role.show}-${role.role}`}>
                <strong>{role.role}</strong>
                <span>
                  {role.show} · {role.people.join(', then ')}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  )
}
