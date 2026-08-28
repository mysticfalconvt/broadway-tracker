import { createFileRoute } from '@tanstack/react-router'

import { PrivacyBadge } from '../../../components/PrivacyBadge'
import { Rating } from '../../../components/Rating'
import { getOuting } from '../../../server/outing-functions'
import { formatFuzzyDate } from '../../../lib/fuzzy-date'

export const Route = createFileRoute('/_protected/outings/$id')({
  loader: ({ params }) => getOuting({ data: { id: params.id } }),
  component: OutingDetail,
})

function OutingDetail() {
  const outing = Route.useLoaderData()
  const ownEntry = outing.attendees.find(
    (attendee) =>
      attendee.privateNotes !== null || attendee.userId === Route.useRouteContext().user.id,
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
