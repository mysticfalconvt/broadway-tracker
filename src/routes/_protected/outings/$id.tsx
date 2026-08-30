import { Link, createFileRoute } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'

import { PrivacyBadge } from '../../../components/PrivacyBadge'
import { ShowArtwork } from '../../../components/ShowArtwork'
import { VenueField } from '../../../components/VenueField'
import { Rating } from '../../../components/Rating'
import { formFlag, formNumber, formText } from '../../../lib/form'
import { getOuting, saveMyReaction, saveOutingFacts } from '../../../server/outing-functions'
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
  const [editing, setEditing] = useState<'none' | 'mine' | 'facts'>('none')
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
  // Strictly the reader's own row. The previous condition also matched any
  // attendee carrying private notes, which would have picked the wrong person
  // the moment the server stopped withholding them.
  const ownEntry = outing.attendees.find((attendee) => attendee.userId === viewerId)
  const others = outing.attendees.filter((attendee) => attendee.userId !== viewerId)
  const date = formatFuzzyDate(outing)
  const place = [outing.venue, outing.city].filter(Boolean).join(', ')

  return (
    <main>
      <section className="outing-hero">
        <div className="page-wrap">
          <p className="eyebrow">{date}</p>
          <h1>{outing.showTitle}</h1>
          <p className="outing-place">
            {outing.productionName ? `${outing.productionName} · ` : ''}
            {outing.venueId && outing.venue ? (
              <Link to="/venues/$id" params={{ id: outing.venueId }}>
                {outing.venue}
              </Link>
            ) : (
              (outing.venue ?? 'Venue not recorded')
            )}
            {outing.city ? `, ${outing.city}` : ''}
          </p>
          <p className="outing-attendees">
            {outing.attendees.map((attendee) => attendee.name).join(' · ')}
          </p>
          {outing.canEditFacts ? (
            <button
              className="text-action outing-edit-facts"
              type="button"
              onClick={() => setEditing(editing === 'facts' ? 'none' : 'facts')}
            >
              {editing === 'facts' ? 'Cancel' : 'Edit the details of this night'}
            </button>
          ) : null}
          <Link
            className="button button-primary"
            to="/shows/$slug"
            params={{ slug: outing.showSlug }}
          >
            About {outing.showTitle}
          </Link>
        </div>
      </section>

      {editing === 'facts' ? (
        <section className="page-wrap">
          <SharedFactsForm outing={outing} />
        </section>
      ) : null}

      <section className="outing-body page-wrap">
        <div className="outing-main">
          {/* Your own reaction. Separate from the shared record of the night,
              and separate again from what only you can see. */}
          <section className="outing-block">
            <div className="block-head">
              <p className="eyebrow">What you thought</p>
              <button
                className="text-action"
                type="button"
                onClick={() => setEditing(editing === 'mine' ? 'none' : 'mine')}
              >
                {editing === 'mine' ? 'Cancel' : 'Edit'}
              </button>
            </div>
            {editing === 'mine' ? <MyReactionForm outingId={outing.id} mine={ownEntry} /> : null}
            {editing === 'mine' ? null : ownEntry?.rating || ownEntry?.review ? (
              <>
                {ownEntry.rating ? <Rating value={ownEntry.rating / 2} /> : null}
                {ownEntry.review ? <blockquote>{ownEntry.review}</blockquote> : null}
              </>
            ) : (
              <p className="outing-empty">You have not written anything about this night yet.</p>
            )}
          </section>

          {others.length ? (
            <section className="outing-block">
              <p className="eyebrow">Who else was there</p>
              <ul className="outing-reactions">
                {others.map((attendee) => (
                  <li key={attendee.userId}>
                    <div className="reaction-head">
                      <strong>{attendee.name}</strong>
                      {attendee.rating ? (
                        <Rating value={attendee.rating / 2} size="small" />
                      ) : (
                        <span className="outing-empty">
                          {attendee.attendanceStatus === 'accepted' ? 'No rating yet' : 'Invited'}
                        </span>
                      )}
                    </div>
                    {attendee.review ? <blockquote>{attendee.review}</blockquote> : null}
                    {/* Saying it is kept private is honest; saying nothing would
                        imply they never wrote anything at all. */}
                    {attendee.hasWithheldReview ? (
                      <span className="outing-empty">Their review is private</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {outing.sharedNotes ? (
            <section className="outing-block">
              <p className="eyebrow">About the night</p>
              <p>{outing.sharedNotes}</p>
              <span className="outing-hint">Everyone who was there can see this.</span>
            </section>
          ) : null}

          {ownEntry?.privateNotes ? (
            <section className="outing-block private-note">
              <PrivacyBadge visibility="private" />
              <p>{ownEntry.privateNotes}</p>
            </section>
          ) : null}
        </div>

        <aside className="outing-aside">
          <ShowArtwork
            title={outing.showTitle}
            type={outing.showType}
            coverImageKey={outing.showCoverImageKey}
          />
          <p className="eyebrow">{outing.showType}</p>
          {outing.showSynopsis ? <p>{outing.showSynopsis}</p> : null}
          <Link className="text-action" to="/shows/$slug" params={{ slug: outing.showSlug }}>
            All productions and photographs →
          </Link>
          {place ? (
            <p className="outing-hint">
              {outing.venueId ? (
                <Link to="/venues/$id" params={{ id: outing.venueId }}>
                  Everything seen at {outing.venue}
                </Link>
              ) : (
                place
              )}
            </p>
          ) : null}
        </aside>
      </section>
    </main>
  )
}

type Outing = NonNullable<Awaited<ReturnType<typeof getOuting>>>
type Attendee = Outing['attendees'][number]

/** The reader's own reaction: the one part of a shared night that is theirs. */
function MyReactionForm({ outingId, mine }: { outingId: string; mine?: Attendee }) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setError(null)
    setBusy(true)
    try {
      await saveMyReaction({
        data: {
          outingId,
          rating: formNumber(form, 'rating'),
          favorite: formFlag(form, 'favorite'),
          review: formText(form, 'review'),
          reviewVisibility: (formText(form, 'reviewVisibility') ?? 'friends') as 'friends',
          privateNotes: formText(form, 'privateNotes'),
        },
      })
      window.location.reload()
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'We could not save that.')
      setBusy(false)
    }
  }

  return (
    <form className="settings-form outing-form" onSubmit={submit}>
      <label>
        Rating <span>Optional, in half stars</span>
        <select name="rating" defaultValue={mine?.rating ?? ''}>
          <option value="">Not rated</option>
          {Array.from({ length: 10 }, (_, index) => index + 1).map((half) => (
            <option key={half} value={half}>
              {half / 2} {half === 2 ? 'star' : 'stars'}
            </option>
          ))}
        </select>
      </label>
      <label className="favorite-toggle">
        <input name="favorite" type="checkbox" defaultChecked={mine?.favorite ?? false} />
        <span>Favorite</span>
      </label>
      <label>
        Your review <span>Optional</span>
        <textarea name="review" rows={4} defaultValue={mine?.review ?? ''} />
      </label>
      <label>
        Who can read your review
        <select name="reviewVisibility" defaultValue={mine?.reviewVisibility ?? 'friends'}>
          <option value="private">Only me</option>
          <option value="friends">Friends who were there</option>
          <option value="public">Anyone who was there</option>
        </select>
      </label>
      <label>
        Private note <span>Only ever visible to you</span>
        <textarea name="privateNotes" rows={3} defaultValue={mine?.privateNotes ?? ''} />
      </label>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="settings-actions">
        <button className="button button-primary" type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  )
}

/** The facts of the night, which everyone who was there sees. */
function SharedFactsForm({ outing }: { outing: Outing }) {
  const [precision, setPrecision] = useState(outing.datePrecision)
  const [venue, setVenue] = useState(outing.venue ?? '')
  const [city, setCity] = useState(outing.city ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setError(null)
    setBusy(true)
    try {
      await saveOutingFacts({
        data: {
          outingId: outing.id,
          venue: formText(form, 'venue'),
          city: formText(form, 'city'),
          sharedNotes: formText(form, 'sharedNotes'),
          visibility: formText(form, 'visibility') as 'friends' | undefined,
          datePrecision: precision as 'exact',
          occurredOn: formText(form, 'occurredOn'),
          occurredMonth: formNumber(form, 'occurredMonth'),
          occurredYear: formNumber(form, 'occurredYear'),
          approximateDate: formText(form, 'approximateDate'),
        },
      })
      window.location.reload()
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'We could not save that.')
      setBusy(false)
    }
  }

  return (
    <form className="settings-form outing-form" onSubmit={submit}>
      <p className="eyebrow">The details of this night</p>
      <VenueField venue={venue} city={city} onVenue={setVenue} onCity={setCity} />
      <label>
        How well do you remember the date?
        <select value={precision} onChange={(event) => setPrecision(event.target.value as 'exact')}>
          <option value="exact">An exact date</option>
          <option value="month">A month and year</option>
          <option value="year">Just the year</option>
          <option value="approximate">Roughly</option>
          <option value="unknown">I don’t remember</option>
        </select>
      </label>
      {precision === 'exact' ? (
        <label>
          Date
          <input type="date" name="occurredOn" defaultValue={outing.occurredOn ?? ''} required />
        </label>
      ) : null}
      {precision === 'month' ? (
        <div className="backfill-pair">
          <label>
            Month
            <input
              type="number"
              name="occurredMonth"
              min="1"
              max="12"
              defaultValue={outing.occurredMonth ?? ''}
              required
            />
          </label>
          <label>
            Year
            <input
              type="number"
              name="occurredYear"
              min="1800"
              max="2200"
              defaultValue={outing.occurredYear ?? ''}
              required
            />
          </label>
        </div>
      ) : null}
      {precision === 'year' ? (
        <label>
          Year
          <input
            type="number"
            name="occurredYear"
            min="1800"
            max="2200"
            defaultValue={outing.occurredYear ?? ''}
            required
          />
        </label>
      ) : null}
      {precision === 'approximate' ? (
        <label>
          Roughly when?
          <input
            name="approximateDate"
            defaultValue={outing.approximateDate ?? ''}
            placeholder="Around 2005"
            required
          />
        </label>
      ) : null}
      <label>
        Who can see this night
        <select name="visibility" defaultValue={outing.visibility}>
          <option value="private">Only the people who were there</option>
          <option value="friends">Friends</option>
          <option value="public">Anyone</option>
        </select>
      </label>
      <label>
        A note for everyone who was there <span>Optional</span>
        <textarea name="sharedNotes" rows={3} defaultValue={outing.sharedNotes ?? ''} />
      </label>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="settings-actions">
        <button className="button button-primary" type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save the details'}
        </button>
      </div>
    </form>
  )
}
