import { Link, createFileRoute } from '@tanstack/react-router'
import { Avatar } from '../../components/Avatar'

import { authClient } from '../../lib/auth-client'

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
      <header className="settings-header profile-header">
        <div className="profile-identity">
          {/* Avatars are private: served through the authorizing proxy, never a
              bucket URL, and never shown on the anonymous public pages. */}
          {user.image ? (
            <Avatar
              className="avatar-preview profile-avatar"
              imageKey={user.image}
              name={user.name}
            />
          ) : (
            <Link aria-label="Add a profile photo" to="/settings">
              <Avatar className="avatar-preview profile-avatar" name={user.name} />
            </Link>
          )}
          <div>
            <p className="eyebrow">My profile</p>
            <h1>{user.name}'s theatre.</h1>
            <p>@{user.handle}</p>
          </div>
        </div>
        <div className="profile-account">
          <Link className="text-action" to="/settings">
            Edit profile settings
          </Link>
          <span className="profile-account-divider" aria-hidden="true" />
          {/* Sign-out lived inside settings, two clicks from anywhere. It is
              quieter than the settings link so the two do not read as one. */}
          <button
            className="text-action profile-signout"
            onClick={async () => {
              await authClient.signOut()
              window.location.assign('/')
            }}
            type="button"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* These were a row of six identical text links, which reads as a list of
          words rather than a set of choices — the same complaint the
          administration index had. */}
      <section className="profile-doors">
        <Link to="/ask">
          <strong>Work out when you saw something</strong>
          <span>Say what you remember and the catalog checks it</span>
        </Link>
        <Link to="/build-history">
          <strong>Add shows you saw years ago</strong>
          <span>A back catalogue, several at a time</span>
        </Link>
        <Link to="/places">
          <strong>Everywhere you have been</strong>
          <span>A map of your theatres</span>
        </Link>
        <Link search={{ piece: undefined }} to="/write">
          <strong>Write something</strong>
          <span>Longer than a review, about a show or a theatre</span>
        </Link>
        <Link to="/writing">
          <strong>Read what people have written</strong>
          <span>Pieces from your friends, and anything published openly</span>
        </Link>
        <Link to="/circle">
          <strong>Where your friends have been</strong>
          <span>Their nights out, newest first</span>
        </Link>
        <Link search={{ view: 'yours' }} to="/discover">
          <strong>Things that came round again</strong>
          <span>The same faces, theatres and shows, years apart</span>
        </Link>
        <Link to="/keys">
          <strong>Let an assistant help</strong>
          <span>A key so Claude or similar can research and log for you</span>
        </Link>
      </section>

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
