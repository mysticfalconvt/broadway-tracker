import { Link, createFileRoute } from '@tanstack/react-router'

import { ShowArtwork } from '../../components/ShowArtwork'
import { getMyProfile } from '../../server/profile-functions'

export const Route = createFileRoute('/_protected/profile')({
  loader: () => getMyProfile(),
  component: Profile,
})

function Profile() {
  const { user, stats, favorites } = Route.useLoaderData()
  return (
    <main className="profile-page page-wrap">
      <header className="settings-header">
        <p className="eyebrow">My profile</p>
        <h1>{user.name}'s theatre.</h1>
        <p>@{user.handle}</p>
        <Link className="text-action" to="/settings">
          Edit profile settings
        </Link>
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
        <div>
          <dt>This year</dt>
          <dd>{stats.seenThisYear}</dd>
        </div>
      </dl>
      <section className="profile-favorites">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Favorites</p>
            <h2>Shows worth an encore.</h2>
          </div>
          <Link className="text-action" to="/library">
            View library
          </Link>
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
                  tone="midnight"
                />
                <div>
                  <h2>{show.title}</h2>
                  <p>{show.type}</p>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="profile-empty">Favorite a show from its detail page to keep it here.</p>
        )}
      </section>
    </main>
  )
}
