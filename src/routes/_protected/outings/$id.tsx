import { Link, createFileRoute } from '@tanstack/react-router'
import { useEffect, useId, useState, type FormEvent } from 'react'

import { PrivacyBadge } from '../../../components/PrivacyBadge'
import { SharingField } from '../../../components/SharingField'
import { ShowArtwork } from '../../../components/ShowArtwork'
import { VenueField } from '../../../components/VenueField'
import { Rating } from '../../../components/Rating'
import { formFlag, formNumber, formText } from '../../../lib/form'
import {
  getOuting,
  joinOuting,
  saveMyReaction,
  saveOutingFacts,
} from '../../../server/outing-functions'
import {
  acceptLikelyCast,
  dropSeenPerformer,
  saveSeenPerformer,
  suggestPeople,
} from '../../../server/people-functions'
import { formatFuzzyDate } from '../../../lib/fuzzy-date'
import type { Visibility } from '../../../server/visibility'

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
  const [editing, setEditing] = useState<'none' | 'mine' | 'facts' | 'cast'>('none')
  if (!outing) {
    return (
      <main className="page-wrap empty-state">
        <p className="eyebrow">Not your memory</p>
        <h1>{problem}</h1>
        <p>If you were there, ask whoever logged it to add you.</p>
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
          <div className="outing-hero-actions">
            {outing.viewerRole === 'visitor' ? <IWasThereToo outingId={outing.id} /> : null}
            <Link
              className="button button-primary"
              params={{ slug: outing.showSlug }}
              to="/shows/$slug"
            >
              About {outing.showTitle}
            </Link>
          </div>
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
          {outing.viewerRole === 'visitor' ? null : (
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
          )}

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

          {outing.seenCast.length ? (
            <section className="outing-block">
              <div className="block-head">
                <p className="eyebrow">Who you saw</p>
                <button
                  className="text-action"
                  type="button"
                  onClick={() => setEditing(editing === 'cast' ? 'none' : 'cast')}
                >
                  {editing === 'cast' ? 'Done' : 'Change'}
                </button>
              </div>
              <ul className="cast-list">
                {outing.seenCast.map((member) => (
                  <li key={member.personId}>
                    <Link to="/artists/$id" params={{ id: member.personId }}>
                      <strong>{member.name}</strong>
                      {member.role ? <span>{member.role}</span> : null}
                    </Link>
                  </li>
                ))}
              </ul>
              {editing === 'cast' ? <CastCorrection outing={outing} /> : null}
            </section>
          ) : null}

          {outing.possibleCast.length ? (
            <section className="outing-block">
              <p className="eyebrow">Might have been on</p>
              {/*
                Separate from the list above, and never folded into it. These
                held the role for part of the span this night could fall in —
                somebody who joined or left mid-month. That is weaker evidence
                and stronger information: a performer who joined on the 19th is
                the one name that could pin the night down.
              */}
              <p className="outing-hint">
                In the cast for part of {formatFuzzyDate(outing)}, but not all of it.
              </p>
              <ul className="cast-list">
                {outing.possibleCast.map((member) => (
                  <li key={member.personId}>
                    <Link to="/artists/$id" params={{ id: member.personId }}>
                      <strong>{member.name}</strong>
                      <span>
                        {member.role}
                        {member.startedOn ? ` · from ${member.startedOn}` : ''}
                        {member.endedOn ? ` · until ${member.endedOn}` : ''}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {outing.likelyCast.length ? (
            <section className="outing-block">
              <p className="eyebrow">Who you probably saw</p>
              {/* Inference, not record. A casting window says somebody held the
                  role across a span; an understudy going on leaves no trace, so
                  this says "probably" and means it. */}
              <p className="outing-hint">
                Worked out from the date and who was in the cast then — an understudy may have gone
                on instead.
              </p>
              <ul className="cast-list">
                {outing.likelyCast.map((member) => (
                  <li key={member.personId}>
                    <Link to="/artists/$id" params={{ id: member.personId }}>
                      <strong>{member.name}</strong>
                      <span>{member.role}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="settings-actions">
                <button
                  className="button button-quiet"
                  type="button"
                  onClick={async () => {
                    if (!outing.productionId || !outing.occurredOn) return
                    await acceptLikelyCast({
                      data: {
                        outingId: outing.id,
                        productionId: outing.productionId,
                        onDate: outing.occurredOn,
                      },
                    })
                    window.location.reload()
                  }}
                >
                  That’s who I saw
                </button>
                <button
                  className="text-action"
                  type="button"
                  onClick={() => setEditing(editing === 'cast' ? 'none' : 'cast')}
                >
                  Somebody else went on
                </button>
              </div>
              {editing === 'cast' ? <CastCorrection outing={outing} /> : null}
            </section>
          ) : null}

          {outing.sharedNotes ? (
            <section className="outing-block">
              <p className="eyebrow">About the night</p>
              <p>{outing.sharedNotes}</p>
              <span className="outing-hint">Everyone who was there can see this.</span>
            </section>
          ) : null}

          {outing.otherNights.length ? (
            <section className="outing-block">
              <p className="eyebrow">
                {outing.otherNights.length === 1
                  ? 'The other time you saw it'
                  : 'The other times you saw it'}
              </p>
              <ul className="other-nights">
                {outing.otherNights.map((night) => (
                  <li key={night.id}>
                    <Link params={{ id: night.id }} to="/outings/$id">
                      {formatFuzzyDate(night)}
                      {night.venue ? ` · ${night.venue}` : ''}
                    </Link>
                  </li>
                ))}
              </ul>
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
  const { user } = Route.useRouteContext()
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
          // Absent means "follow my profile", which the server fills in.
          reviewVisibility: formText(form, 'reviewVisibility') as Visibility | undefined,
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
      <SharingField
        current={mine?.reviewVisibility as Visibility | undefined}
        label="Your review is for"
        name="reviewVisibility"
        profileDefault={user.profileVisibility as Visibility}
        wording={{
          private: 'only you',
          friends: 'friends who were there',
          public: 'anyone who was there',
        }}
      />
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
  const { user } = Route.useRouteContext()
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
      <SharingField
        current={outing.visibility as Visibility}
        label="This night is for"
        name="visibility"
        profileDefault={user.profileVisibility as Visibility}
        wording={{ private: 'only the people who were there' }}
      />
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

/**
 * Saying who actually went on. Free text with suggestions, because an
 * understudy is often nobody the catalog has heard of.
 */
function CastCorrection({ outing }: { outing: Outing }) {
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [suggestions, setSuggestions] = useState<Awaited<ReturnType<typeof suggestPeople>>>([])
  const [error, setError] = useState<string | null>(null)
  const listId = useId()

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(() => {
      void suggestPeople({ data: { query: name } })
        .then((rows) => {
          if (!cancelled) setSuggestions(rows)
        })
        .catch(() => {
          // Suggestions are a convenience; typing a new name must still work.
        })
    }, 150)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [name])

  async function add() {
    setError(null)
    try {
      await saveSeenPerformer({
        data: { outingId: outing.id, personName: name, role: role.trim() || undefined },
      })
      window.location.reload()
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'We could not save that.')
    }
  }

  return (
    <div className="cast-correction">
      <p className="outing-hint">
        Add whoever went on. If the list above is wrong, remove a name and add the right one.
      </p>
      <div className="backfill-pair">
        <label>
          Who
          <input
            value={name}
            list={listId}
            placeholder="An understudy"
            onChange={(event) => setName(event.target.value)}
          />
          <datalist id={listId}>
            {suggestions.map((person) => (
              <option key={person.id} value={person.name} />
            ))}
          </datalist>
        </label>
        <label>
          As <span>Optional</span>
          <input
            value={role}
            placeholder="Josh Skinner"
            onChange={(event) => setRole(event.target.value)}
          />
        </label>
      </div>
      <div className="settings-actions">
        <button
          className="button button-primary"
          type="button"
          disabled={!name.trim()}
          onClick={() => void add()}
        >
          Add them
        </button>
      </div>
      {outing.seenCast.length ? (
        <ul className="correction-remove">
          {outing.seenCast.map((member) => (
            <li key={member.personId}>
              <span>{member.name}</span>
              <button
                className="text-action"
                type="button"
                onClick={async () => {
                  await dropSeenPerformer({
                    data: { outingId: outing.id, personId: member.personId },
                  })
                  window.location.reload()
                }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

/**
 * The one thing a friend can do with somebody else's night.
 *
 * Saying so puts them on this same outing rather than making a second record of
 * one evening, and marks the show seen in their own library. Only ever offered
 * on a night they were already allowed to see.
 */
function IWasThereToo({ outingId }: { outingId: string }) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  return (
    <>
      <button
        className="button button-primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          setError(null)
          try {
            await joinOuting({ data: { outingId } })
            window.location.reload()
          } catch (caughtError) {
            setError(caughtError instanceof Error ? caughtError.message : 'We could not add you.')
            setBusy(false)
          }
        }}
        type="button"
      >
        {busy ? 'Adding…' : 'I was there too'}
      </button>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </>
  )
}
