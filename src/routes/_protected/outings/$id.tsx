import { Link, createFileRoute } from '@tanstack/react-router'

import { PrivacyBadge } from '../../../components/PrivacyBadge'
import { Rating } from '../../../components/Rating'
import { getOuting } from '../../../server/outing-functions'
import { formatFuzzyDate } from '../../../lib/fuzzy-date'

export const Route = createFileRoute('/_protected/outings/$id')({
  loader: async ({ params }) => {
    try {
      return { outing: await getOuting({ data: { id: params.id } }), problem: null }
    } catch {
      // Somebody else's night, or one that no longer exists. Both are ordinary
      // answers here, not server errors, and they read the same so the page
      // never confirms that a memory it will not show you exists.
      return { outing: null, problem: 'This memory is not yours to see.' }
    }
  },
  component: OutingDetail,
})

function OutingDetail() {
  const { outing, problem } = Route.useLoaderData()
  const viewerId = Route.useRouteContext().user.id
  if (!outing) {
    return (
      <main className="page-wrap empty-state">
        <p className="eyebrow">Not your memory</p>
        <h1>{problem}</h1>
        <p>
          A shared night is only visible to the people who were there. If you were, ask whoever
          logged it to add you.
        </p>
        <Link className="button button-primary" to="/library">
          Back to your theatre
        </Link>
      </main>
    )
  }
  const ownEntry = outing.attendees.find(
    (attendee) => attendee.privateNotes !== null || attendee.userId === viewerId,
  )
  const date = formatFuzzyDate(outing)
  return (
    <main>
      <section className="outing-hero">
        <div className="page-wrap">
          <p className="eyebrow">{date}</p>
          <h1>{outing.showTitle}</h1>
          <p>
            {outing.productionName || outing.showType} ·{' '}
            {[outing.venue, outing.city].filter(Boolean).join(', ') || 'Venue unknown'}
          </p>
          <p>{outing.attendees.map((attendee) => attendee.name).join(' · ')}</p>
        </div>
      </section>
      <section className="outing-detail page-wrap">
        <div>
          <p className="eyebrow">Shared memory</p>
          <h2>The night itself.</h2>
          <p>{outing.sharedNotes || 'No shared notes were added to this outing.'}</p>
        </div>
        <div>
          {ownEntry?.rating ? <Rating value={ownEntry.rating / 2} /> : null}
          {ownEntry?.review ? <blockquote>{ownEntry.review}</blockquote> : null}
          <section className="private-note">
            <PrivacyBadge visibility="private" />
            <p>{ownEntry?.privateNotes || 'No private note yet.'}</p>
          </section>
        </div>
      </section>
    </main>
  )
}
