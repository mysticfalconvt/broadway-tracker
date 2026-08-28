import { Link, createFileRoute, notFound } from '@tanstack/react-router'

import { Rating } from '../../components/Rating'
import { ShowArtwork } from '../../components/ShowArtwork'
import { getPublicProfile } from '../../server/profile-functions'

export const Route = createFileRoute('/p/$id')({
  // A profile that is missing, private, or friends-only is indistinguishable
  // from one that never existed, and should read as a dead link rather than a
  // server error.
  loader: async ({ params }) => {
    try {
      return await getPublicProfile({ data: { id: params.id } })
    } catch {
      throw notFound()
    }
  },
  component: PublicProfile,
  notFoundComponent: ProfileNotFound,
})

function ProfileNotFound() {
  return (
    <main className="page-wrap empty-state">
      <p className="eyebrow">Nothing here</p>
      <h1>This page isn’t public.</h1>
      <p>The link may have changed, or its owner may have made it private again.</p>
      <Link className="button button-primary" to="/">
        Back to Broadway Tracker
      </Link>
    </main>
  )
}

function PublicProfile() {
  const { stats, favorites, lists } = Route.useLoaderData()
  return (
    <main className="profile-page page-wrap">
      <header className="settings-header">
        <p className="eyebrow">A public theatre journal</p>
        <h1>Someone’s theatre.</h1>
        {/* Public pages are deliberately anonymous: the shows are shared, the person is not. */}
        <p>Shared publicly, without a name attached.</p>
      </header>

      <dl className="stat-list profile-stats">
        <div>
          <dt>Shows seen</dt>
          <dd>{stats.seen}</dd>
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
              <article className="library-entry" key={show.id}>
                <Link to="/shows/$slug" params={{ slug: show.slug }}>
                  <ShowArtwork title={show.title} type={show.type} tone="midnight" />
                  <div>
                    <h2>{show.title}</h2>
                    <p>{show.type}</p>
                  </div>
                </Link>
                {show.rating ? <Rating value={show.rating / 2} size="small" /> : null}
                {show.review ? <p className="memory-review">“{show.review}”</p> : null}
              </article>
            ))}
          </div>
        ) : (
          <p className="profile-empty">Nothing has been shared publicly yet.</p>
        )}
      </section>

      <section className="profile-favorites">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Lists</p>
            <h2>Public shelves.</h2>
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
          <p className="profile-empty">No public lists yet.</p>
        )}
      </section>
    </main>
  )
}
