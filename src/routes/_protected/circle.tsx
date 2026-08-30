import { Link, createFileRoute } from '@tanstack/react-router'

import { ShowArtwork } from '../../components/ShowArtwork'
import { formatFuzzyDate } from '../../lib/fuzzy-date'
import { getFriendsActivity } from '../../server/profile-functions'

export const Route = createFileRoute('/_protected/circle')({
  loader: async () => ({ activity: await getFriendsActivity() }),
  component: Circle,
})

function Circle() {
  const { activity } = Route.useLoaderData()

  return (
    <main className="page-wrap">
      <header className="settings-header">
        <p className="eyebrow">Your circle</p>
        <h1>Where your friends have been.</h1>
        <p>
          Nights out, newest first. Only what people chose to share, and only from friends whose
          profile is open to you.
        </p>
      </header>

      {activity.length ? (
        <ul className="friend-outings">
          {activity.map((night) => (
            <li key={night.id}>
              <Link className="friend-outing" params={{ id: night.id }} to="/outings/$id">
                <ShowArtwork
                  coverImageKey={night.coverImageKey}
                  title={night.showTitle}
                  type={night.showType}
                />
                <div className="friend-outing-body">
                  <h3>{night.showTitle}</h3>
                  <p className="friend-outing-facts">
                    {night.friendName} ·{' '}
                    {[formatFuzzyDate(night), [night.venue, night.city].filter(Boolean).join(' · ')]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  {night.sharedNotes ? (
                    <p className="friend-outing-note">{night.sharedNotes}</p>
                  ) : null}
                  {night.alreadyThere ? <p className="friend-outing-flag">You were there</p> : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="profile-empty">
          Nothing yet. This fills up as the people you share with log their nights out.{' '}
          <Link className="text-action" to="/friends">
            Find your friends
          </Link>
          .
        </p>
      )}
    </main>
  )
}
