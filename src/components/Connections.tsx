import { Link } from '@tanstack/react-router'

import type { Connections as Found } from '../server/connections'

/**
 * Where a history joins up with itself.
 *
 * None of this is new. Every line was already recorded, on some night years
 * apart from the one beside it — the app has simply never said them in the same
 * place. That is the whole thing: not more to look at, the same things seen
 * together.
 *
 * Cards rather than lists, because each one is a separate small story and a
 * list of them reads as a report. Sections with nothing in them do not render:
 * a page of empty headings telling somebody what they have not done yet is the
 * opposite of the point.
 */
export function Connections({ found }: { found: Found }) {
  const empty = !found.performers.length && !found.venues.length && !found.shows.length

  if (empty) {
    return (
      <p className="empty-note">
        Nothing has come round twice yet. This fills itself in as you log more nights.
      </p>
    )
  }

  return (
    <div className="joined">
      {found.performers.length ? (
        <section>
          <h2>People you have seen more than once</h2>
          <div className="joined-cards">
            {found.performers.map((person) => (
              <article className="joined-card" key={person.personId}>
                <Link
                  className="joined-card-name"
                  params={{ id: person.personId }}
                  to="/artists/$id"
                >
                  {person.name}
                </Link>
                <ul>
                  {person.shows.map((show) => (
                    <li key={show.slug}>
                      <Link params={{ slug: show.slug }} to="/shows/$slug">
                        {show.title}
                      </Link>
                      {show.role ? <span> as {show.role}</span> : null}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {found.venues.length ? (
        <section>
          <h2>Theatres you have gone back to</h2>
          <div className="joined-cards">
            {found.venues.map((venue) => (
              <article className="joined-card" key={venue.name}>
                <p className="joined-card-name">{venue.name}</p>
                {/* The rename is the connection, not a footnote to it. */}
                {venue.formerNames.length ? (
                  <p className="joined-card-aside">
                    the same room as the {venue.formerNames.join(', the ')}
                  </p>
                ) : null}
                <ul>
                  {venue.shows.map((show) => (
                    <li key={`${show.slug}-${show.year}`}>
                      <Link params={{ slug: show.slug }} to="/shows/$slug">
                        {show.title}
                      </Link>
                      {show.year ? <span> {show.year}</span> : null}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {found.shows.length ? (
        <section>
          <h2>Shows you have seen again</h2>
          <div className="joined-cards">
            {found.shows.map((show) => (
              <article className="joined-card" key={show.slug}>
                <Link className="joined-card-name" params={{ slug: show.slug }} to="/shows/$slug">
                  {show.title}
                </Link>
                {/* Year on the left, staging on the right, so two visits line
                    up and the gap between them is the thing you see. */}
                <ul className="joined-when">
                  {show.times.map((one, index) => (
                    <li key={`${one.year}-${one.production ?? index}`}>
                      <span className="joined-when-year">{one.year ?? 'undated'}</span>
                      {one.production ? <span>{one.production}</span> : null}
                    </li>
                  ))}
                </ul>
                {/*
                  What was different the second time. A detail of having seen it
                  twice, which is why it sits here rather than in a list of its
                  own — alone it was mostly a whole company arriving dressed up
                  as a discovery.

                  A description list rather than a sentence: the part is the
                  thing being looked up and the people are the answer, and run
                  together with separators they were a paragraph nobody would
                  read to the end of.
                */}
                {show.recast.length ? (
                  <div className="joined-card-aside">
                    <p className="joined-card-label">Different the second time</p>
                    <dl className="recast">
                      {show.recast.slice(0, 5).map((part) => (
                        <div key={part.role}>
                          <dt>{part.role}</dt>
                          <dd>
                            {part.people.map((name, index) => (
                              <span key={name}>
                                {index > 0 ? <span aria-hidden="true"> → </span> : null}
                                {name}
                              </span>
                            ))}
                          </dd>
                        </div>
                      ))}
                    </dl>
                    {show.recast.length > 5 ? (
                      <p className="joined-card-more">
                        and {show.recast.length - 5} more{' '}
                        {show.recast.length - 5 === 1 ? 'part' : 'parts'}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
