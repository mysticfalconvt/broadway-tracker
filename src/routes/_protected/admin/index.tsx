import { Link, createFileRoute, redirect } from '@tanstack/react-router'

import { getAdminOverview, getDuplicateSuspicions } from '../../../server/admin-functions'

export const Route = createFileRoute('/_protected/admin/')({
  beforeLoad: ({ context }) => {
    if (context.user.role !== 'admin') throw redirect({ to: '/' })
  },
  loader: async () => ({
    overview: await getAdminOverview(),
    suspicions: await getDuplicateSuspicions(),
  }),
  component: AdminHome,
})

function AdminHome() {
  const { overview, suspicions } = Route.useLoaderData()
  const waiting = overview.pendingShows + overview.pendingPhotos + overview.openReports

  return (
    <main className="admin-page page-wrap">
      <header className="settings-header">
        <p className="eyebrow">Administration</p>
        <h1>{waiting ? 'A few things are waiting.' : 'Nothing is waiting.'}</h1>
        <p>
          {waiting
            ? 'Submissions and photographs stay out of sight until they are reviewed.'
            : 'The catalog is clear. This page will tell you when something arrives.'}
        </p>
      </header>

      <div className="admin-queues">
        <QueueCard
          label="Show submissions"
          count={overview.pendingShows}
          to="/admin/catalog"
          empty="No shows awaiting review"
        />
        <QueueCard
          label="Photographs"
          count={overview.pendingPhotos}
          to="/admin/photos"
          empty="No photographs awaiting review"
          note="Offered publicly — visible to the uploader's friends until approved"
        />
        <QueueCard
          label="Bug reports and ideas"
          count={overview.openReports}
          to="/admin/reports"
          empty="Nothing reported"
          note="Sent by members from anywhere in the app"
        />
        <QueueCard
          label="Possible duplicates"
          count={suspicions.shows.length + suspicions.venues.length}
          to="/admin/venues"
          empty="Nothing looks duplicated"
        />
      </div>

      <dl className="stat-list admin-stats">
        <div>
          <dt>Published shows</dt>
          <dd>{overview.publishedShows}</dd>
        </div>
        <div>
          <dt>Venues</dt>
          <dd>{overview.venues}</dd>
        </div>
      </dl>

      {suspicions.shows.length ? (
        <section>
          <div className="section-heading">
            <div>
              <p className="eyebrow">Possible duplicates</p>
              <h2>Shows that look like the same work.</h2>
            </div>
          </div>
          <ul className="suspect-list">
            {suspicions.shows.map((pair) => (
              <li key={`${pair.a.id}-${pair.b.id}`}>
                <span>
                  <strong>{pair.a.title}</strong> <em>{pair.a.status}</em>
                </span>
                <span>
                  <strong>{pair.b.title}</strong> <em>{pair.b.status}</em>
                </span>
                <span className="suspect-score">{Math.round(pair.score * 100)}% alike</span>
                <Link className="text-action" to="/admin/catalog">
                  Review
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <nav className="admin-links">
        <Link to="/admin/catalog">Show submissions</Link>
        <Link to="/admin/shows">Published shows</Link>
        <Link to="/admin/photos">Photographs</Link>
        <Link to="/admin/reports">Reports</Link>
        <Link to="/admin/venues">Venues</Link>
        <Link to="/admin/productions">Productions</Link>
      </nav>
    </main>
  )
}

function QueueCard({
  label,
  count,
  to,
  empty,
  note,
}: {
  label: string
  count: number
  to: '/admin/catalog' | '/admin/photos' | '/admin/venues' | '/admin/reports'
  empty: string
  note?: string
}) {
  return (
    <Link className={`queue-card${count ? ' queue-card-waiting' : ''}`} to={to}>
      <p className="eyebrow">{label}</p>
      <strong>{count}</strong>
      <span>{count ? 'awaiting review' : empty}</span>
      {note && count ? <span className="queue-note">{note}</span> : null}
    </Link>
  )
}
