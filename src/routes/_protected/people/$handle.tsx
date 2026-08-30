import { Link, createFileRoute } from '@tanstack/react-router'

import { ShowArtwork } from '../../../components/ShowArtwork'
import { formatFuzzyDate } from '../../../lib/fuzzy-date'
import { getFriendProfile } from '../../../server/profile-functions'

export const Route = createFileRoute('/_protected/people/$handle')({
  loader: async ({ params }) => {
    try {
      return { profile: await getFriendProfile({ data: { handle: params.handle } }), problem: null }
    } catch (error) {
      // Not shared is an ordinary answer here, not a failure.
      return { profile: null, problem: error instanceof Error ? error.message : 'Unavailable.' }
    }
  },
  component: FriendProfile,
})

function FriendProfile() {
  const { profile, problem } = Route.useLoaderData()
  if (!profile) {
    return (
      <main className="page-wrap empty-state">
        <p className="eyebrow">Not shared</p>
        <h1>{problem}</h1>
        <p>Profiles are private until their owner chooses to share them.</p>
        <Link className="button button-primary" to="/friends">
          Back to your friends
        </Link>
      </main>
    )
  }
  const { user, stats, favorites, seenShows, outings, lists } = profile
  return (
    <main className="profile-page page-wrap">
      <header className="settings-header">
        <p className="eyebrow">Friend's theatre</p>
        <h1>{user.name}'s theatre.</h1>
        <p>@{user.handle}</p>
      </header>
      <dl className="stat-list profile-stats">
        <div>
          <dt>Shows seen</dt>
          <dd>{stats.seen}</dd>
        </div>
        <div>
          <dt>Outings logged</dt>
          <dd>{stats.outings}</dd>
        </div>
      </dl>
      <section className="profile-favorites">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Favorites</p>
            <h2>Shows worth an encore.</h2>
          </div>
        </div>
        {favorites.length ? (
          <div className="library-grid">
            {favorites.map((show) => (
              <Link
                className="library-entry"
                key={show.id}
                to="/shows/$slug"
                params={{ slug: show.slug }}
              >
                <ShowArtwork
                  title={show.title}
                  type={show.type}
                  coverImageKey={show.coverImageKey}
                />
                <div>
                  <h2>{show.title}</h2>
                  <p>{show.type}</p>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="profile-empty">No favorites have been shared.</p>
        )}
      </section>
      <section className="profile-favorites">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Nights out</p>
            <h2>What they went to.</h2>
          </div>
        </div>
        {outings.length ? (
          <ul className="friend-outings">
            {outings.map((outing) => (
              <FriendOuting key={outing.id} outing={outing} />
            ))}
          </ul>
        ) : (
          <p className="profile-empty">
            {stats.outings
              ? 'Their nights out are kept private.'
              : 'They have not logged a night out yet.'}
          </p>
        )}
      </section>
      <section className="profile-favorites">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Seen</p>
            <h2>Where they have been.</h2>
          </div>
        </div>
        {seenShows.length ? (
          <div className="library-grid">
            {seenShows.map((show) => (
              <Link
                className="library-entry"
                key={show.id}
                params={{ slug: show.slug }}
                to="/shows/$slug"
              >
                <ShowArtwork
                  coverImageKey={show.coverImageKey}
                  title={show.title}
                  type={show.type}
                />
                <div>
                  <h2>{show.title}</h2>
                  <p>{show.type}</p>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="profile-empty">
            {stats.seen
              ? 'Their history is kept private.'
              : 'They have not recorded a night out yet.'}
          </p>
        )}
      </section>
      <section className="profile-favorites">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Lists</p>
            <h2>Shared shelves.</h2>
          </div>
        </div>
        {lists.length ? (
          <div className="list-index">
            {lists.map((list) => (
              <Link key={list.id} to="/lists/$id" params={{ id: list.id }}>
                <h2>{list.title}</h2>
                {list.description ? <p>{list.description}</p> : null}
                <p>
                  {list.itemCount} {list.itemCount === 1 ? 'show' : 'shows'}
                </p>
              </Link>
            ))}
          </div>
        ) : (
          <p className="profile-empty">No lists have been shared.</p>
        )}
      </section>
    </main>
  )
}

/**
 * One of a friend's nights, with the offer to say you were there too.
 *
 * Saying so puts the reader on that same outing rather than making a second
 * record of one evening — so it then appears in their own history, and the show
 * is marked seen in their library.
 */
function FriendOuting({
  outing,
}: {
  outing: NonNullable<Awaited<ReturnType<typeof getFriendProfile>>>['outings'][number]
}) {
  const where = [outing.venue, outing.city].filter(Boolean).join(' · ')
  const when = formatFuzzyDate({
    datePrecision: outing.datePrecision,
    occurredOn: outing.occurredOn,
    occurredMonth: outing.occurredMonth,
    occurredYear: outing.occurredYear,
    approximateDate: outing.approximateDate,
  })

  return (
    <li>
      {/* The whole card is the link. A separate button next to it went to the
          same place, and took the room three of these now sit in. */}
      <Link className="friend-outing" params={{ id: outing.id }} to="/outings/$id">
        <ShowArtwork
          coverImageKey={outing.coverImageKey}
          title={outing.showTitle}
          type={outing.showType}
        />
        <div className="friend-outing-body">
          <h3>{outing.showTitle}</h3>
          <p className="friend-outing-facts">{[when, where].filter(Boolean).join(' · ')}</p>
          {outing.sharedNotes ? <p className="friend-outing-note">{outing.sharedNotes}</p> : null}
          {outing.alreadyThere ? <p className="friend-outing-flag">You were there</p> : null}
        </div>
      </Link>
    </li>
  )
}
