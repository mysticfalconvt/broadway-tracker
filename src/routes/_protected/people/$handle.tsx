import { Link, createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { ShowArtwork } from '../../../components/ShowArtwork'
import { VenueMap } from '../../../components/VenueMap'
import { formatFuzzyDateShort } from '../../../lib/fuzzy-date'
import { getFriendProfile } from '../../../server/profile-functions'

type Profile = NonNullable<Awaited<ReturnType<typeof getFriendProfile>>>
type Night = Profile['outings'][number]

export const Route = createFileRoute('/_protected/people/$handle')({
  validateSearch: z.object({ view: z.enum(['nights', 'shows', 'places', 'lists']).optional() }),
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
  const { view } = Route.useSearch()
  const { handle } = Route.useParams()
  const showing = view ?? 'nights'

  if (!profile) {
    return (
      <main className="page-wrap empty-state">
        <p className="eyebrow">Not shared</p>
        <h1>{problem}</h1>
        <Link className="button button-primary" to="/friends">
          Back to friends
        </Link>
      </main>
    )
  }

  const { user, stats, places, seenShows, outings, lists } = profile
  const together = seenShows.filter((show) => show.bothSaw).length

  const tabs = [
    { key: 'nights', label: 'Their nights', count: outings.length },
    { key: 'shows', label: 'Shows', count: seenShows.length },
    { key: 'places', label: 'Places', count: places.length },
    { key: 'lists', label: 'Lists', count: lists.length },
  ] as const

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
        <div>
          {/* The reason for visiting somebody's page: the overlap is what there
              is to talk about, and what you might have been at together. */}
          <dt>Also seen by you</dt>
          <dd>{together}</dd>
        </div>
      </dl>

      <nav aria-label="What to look at" className="discover-tabs">
        {tabs.map((tab) => (
          <Link
            activeOptions={{ exact: true, includeSearch: true }}
            className={showing === tab.key ? 'is-current' : ''}
            key={tab.key}
            params={{ handle }}
            search={{ view: tab.key === 'nights' ? undefined : tab.key }}
            to="/people/$handle"
          >
            {tab.label} <span className="tab-count">{tab.count}</span>
          </Link>
        ))}
      </nav>

      {showing === 'nights' ? <TheirNights nights={outings} /> : null}
      {showing === 'shows' ? <TheirShows shows={seenShows} /> : null}
      {showing === 'places' ? (
        places.length ? (
          <VenueMap venues={places} />
        ) : (
          <p className="profile-empty">No theatres shared yet.</p>
        )
      ) : null}
      {showing === 'lists' ? <TheirLists lists={lists} /> : null}
    </main>
  )
}

/**
 * Their nights, grouped by the year they happened in.
 *
 * The same shape the library timeline uses, because it is the same question
 * asked about somebody else. Each night links to itself, which is where saying
 * you were there too lives — so what this page is really for is finding the
 * ones you were at and had not said so.
 */
function TheirNights({ nights }: { nights: Night[] }) {
  if (nights.length === 0) return <p className="profile-empty">Nothing shared yet.</p>

  const byYear = new Map<number | null, Night[]>()
  for (const night of nights) {
    const year =
      night.occurredYear ?? (night.occurredOn ? Number(night.occurredOn.slice(0, 4)) : null)
    byYear.set(year, [...(byYear.get(year) ?? []), night])
  }
  const years = [...byYear.entries()]
    .filter(([year]) => year !== null)
    .sort((a, b) => (b[0] as number) - (a[0] as number))
  const undated = byYear.get(null) ?? []

  return (
    <div className="timeline">
      {years.map(([year, inThatYear]) => (
        <section key={year}>
          <h2 className="timeline-year">
            {year}
            <span>
              {inThatYear.length} {inThatYear.length === 1 ? 'night' : 'nights'}
            </span>
          </h2>
          <ul className="friend-outings">
            {inThatYear.map((night) => (
              <FriendOuting key={night.id} outing={night} />
            ))}
          </ul>
        </section>
      ))}
      {undated.length ? (
        <section>
          <h2 className="timeline-year">
            Date unknown
            <span>{undated.length}</span>
          </h2>
          <ul className="friend-outings">
            {undated.map((night) => (
              <FriendOuting key={night.id} outing={night} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

/**
 * One grid, with the starred ones and the shared ones marked.
 *
 * These were two sections — "Favorites" and "Seen" — and a favourite is almost
 * always also seen, so the same show was drawn twice on one page with nothing
 * saying they were the same thing.
 */
function TheirShows({ shows }: { shows: Profile['seenShows'] }) {
  if (shows.length === 0) return <p className="profile-empty">Nothing shared yet.</p>
  return (
    <div className="library-grid">
      {shows.map((show) => (
        <Link
          className="library-entry"
          key={show.id}
          params={{ slug: show.slug }}
          to="/shows/$slug"
        >
          <ShowArtwork coverImageKey={show.coverImageKey} title={show.title} type={show.type} />
          <div>
            <h2>{show.title}</h2>
            <p>{show.type}</p>
            <p className="show-marks">
              {show.favorite ? <span className="show-mark">One of their favourites</span> : null}
              {show.bothSaw ? <span className="show-mark is-shared">You saw it too</span> : null}
            </p>
          </div>
        </Link>
      ))}
    </div>
  )
}

function TheirLists({ lists }: { lists: Profile['lists'] }) {
  if (lists.length === 0) return <p className="profile-empty">No shared shelves.</p>
  return (
    <div className="list-index">
      {lists.map((list) => (
        <Link key={list.id} params={{ id: list.id }} to="/lists/$id">
          <h2>{list.title}</h2>
          {list.description ? <p>{list.description}</p> : null}
          <p>
            {list.itemCount} {list.itemCount === 1 ? 'show' : 'shows'}
          </p>
        </Link>
      ))}
    </div>
  )
}

function FriendOuting({ outing }: { outing: Night }) {
  const where = [outing.venue, outing.city].filter(Boolean).join(' · ')
  const when = formatFuzzyDateShort(outing)

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
          {outing.alreadyThere ? (
            <p className="friend-outing-flag">You were there</p>
          ) : outing.youSawItToo ? (
            // Seen the show but not marked as at this night: the likeliest
            // thing anybody came here to fix.
            <p className="friend-outing-maybe">You have seen this — were you at this one?</p>
          ) : null}
        </div>
      </Link>
    </li>
  )
}
