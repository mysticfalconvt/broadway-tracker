import { Link, createFileRoute } from '@tanstack/react-router'

import { ShowArtwork } from '../../../components/ShowArtwork'
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
  const { user, stats, favorites, seenShows, lists } = profile
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
