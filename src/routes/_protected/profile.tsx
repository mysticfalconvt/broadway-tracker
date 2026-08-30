import { Link, createFileRoute } from '@tanstack/react-router'

import { authClient } from '../../lib/auth-client'

import { ShowArtwork } from '../../components/ShowArtwork'
import { getMyProfile } from '../../server/profile-functions'

export const Route = createFileRoute('/_protected/profile')({
  loader: () => getMyProfile(),
  component: Profile,
})

/** Initials stand in for a photo, rather than a broken image or a grey square. */
function initialsFor(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  return `${first}${last}`.toUpperCase()
}

function Profile() {
  const { user, stats, favorites } = Route.useLoaderData()
  return (
    <main className="profile-page page-wrap">
      <header className="settings-header profile-header">
        <div className="profile-identity">
          {/* Avatars are private: served through the authorizing proxy, never a
              bucket URL, and never shown on the anonymous public pages. */}
          {user.image ? (
            <img
              className="avatar-preview profile-avatar"
              src={`/api/images/${user.image}`}
              alt=""
            />
          ) : (
            <Link
              className="avatar-preview profile-avatar profile-avatar-empty"
              to="/settings"
              aria-label="Add a profile photo"
            >
              {initialsFor(user.name)}
            </Link>
          )}
          <div>
            <p className="eyebrow">My profile</p>
            <h1>{user.name}'s theatre.</h1>
            <p>@{user.handle}</p>
          </div>
        </div>
        <div className="profile-account">
          <Link className="text-action" search={{ piece: undefined }} to="/write">
            Write something
          </Link>
          <span className="profile-account-divider" aria-hidden="true" />
          <Link className="text-action" to="/places">
            Everywhere you have been
          </Link>
          <span className="profile-account-divider" aria-hidden="true" />
          <Link className="text-action" to="/build-history">
            Add shows you saw years ago
          </Link>
          <span className="profile-account-divider" aria-hidden="true" />
          <Link className="text-action" to="/settings">
            Edit profile settings
          </Link>
          <span className="profile-account-divider" aria-hidden="true" />
          {/* Sign-out lived inside settings, two clicks from anywhere. It is
              quieter than the settings link so the two do not read as one. */}
          <button
            type="button"
            className="text-action profile-signout"
            onClick={async () => {
              await authClient.signOut()
              window.location.assign('/')
            }}
          >
            Sign out
          </button>
        </div>
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
