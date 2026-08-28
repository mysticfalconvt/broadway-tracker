import { Link, createFileRoute } from '@tanstack/react-router'

import { ShowArtwork } from '../../../components/ShowArtwork'
import { getFriendProfile } from '../../../server/profile-functions'

export const Route = createFileRoute('/_protected/people/$handle')({
  loader: ({ params }) => getFriendProfile({ data: { handle: params.handle } }),
  component: FriendProfile,
})

function FriendProfile() {
  const { user, stats, favorites, lists } = Route.useLoaderData()
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
                <ShowArtwork title={show.title} type={show.type} tone="midnight" />
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
            <p className="eyebrow">Lists</p>
            <h2>Shared shelves.</h2>
          </div>
        </div>
        {lists.length ? (
          <div className="list-index">
            {lists.map((list) => (
              <article key={list.id}>
                <h3>{list.title}</h3>
                {list.description ? <p>{list.description}</p> : null}
                <p>
                  {list.itemCount} {list.itemCount === 1 ? 'show' : 'shows'}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <p className="profile-empty">No lists have been shared.</p>
        )}
      </section>
    </main>
  )
}
