import { Link, createFileRoute } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'

import { authClient } from '../../lib/auth-client'
import { ShowArtwork } from '../../components/ShowArtwork'
import { getSession } from '../../server/auth-functions'
import {
  getProductionsForShow,
  getShowBySlug,
  saveLocalShow,
  saveLocalStagingYear,
} from '../../server/catalog-functions'
import { getCastForShow } from '../../server/people-functions'
import { getMyShowState, saveLibraryEntry } from '../../server/library-functions'
import { changePhotoVisibility, deleteShowPhoto, getShowPhotos } from '../../server/image-functions'
import { formatFuzzyDate } from '../../lib/fuzzy-date'
import { formText } from '../../lib/form'

export const Route = createFileRoute('/shows/$slug')({
  loader: async ({ params }) => {
    const { show, scope, mayEdit } = await getShowBySlug({ data: { slug: params.slug } })
    return {
      show,
      scope,
      mayEdit,
      photos: show ? await getShowPhotos({ data: { showId: show.id } }) : [],
      productions: show ? await getProductionsForShow({ data: { showId: show.id, scope } }) : [],
      cast: show ? await getCastForShow({ data: { showId: show.id } }) : [],
      // Where the reader already stands with this show, so the buttons are
      // right on the first paint rather than corrected a moment later.
      mine: show
        ? await getMyShowState({ data: { showId: show.id } })
        : { entry: null, outings: [] },
      // Resolved on the server: the client session hook is empty during SSR, so
      // anything gated on it would only appear after hydration.
      session: await getSession(),
    }
  },
  component: ShowDetail,
})

function ShowDetail() {
  const { show, scope, mayEdit, photos, productions, cast, mine, session } = Route.useLoaderData()

  if (!show) {
    return (
      <main className="show-missing page-wrap">
        <p className="eyebrow">Not in the archive</p>
        <h1>That show is not published here.</h1>
        <Link to="/discover" className="button button-primary">
          Search the catalog
        </Link>
      </main>
    )
  }

  return (
    <main>
      <section className="show-hero">
        <div className="page-wrap show-hero-content">
          <ShowArtwork title={show.title} type={show.type} coverImageKey={show.coverImageKey} />
          <div>
            <p className="eyebrow">{show.type}</p>
            <h1>{show.title}</h1>
            {session ? <LogAction showId={show.id} /> : null}
            <p>
              {scope === 'local'
                ? 'A local record, kept by the people who were there. It is not in the shared catalog and does not appear in search.'
                : 'This shared catalog record is ready for your theatre history.'}
            </p>
            <LibraryButtons mine={mine} showId={show.id} serverSession={session} />
          </div>
        </div>
      </section>
      <section className="show-detail-body page-wrap">
        <div>
          <p className="eyebrow">About the show</p>
          <h2>The work itself.</h2>
          <p>
            {show.synopsis ||
              (scope === 'local'
                ? 'Nobody has written down what this was yet.'
                : 'A catalog description has not been added yet.')}
          </p>
        </div>
        <aside>
          <p className="eyebrow">Your theatre</p>
          <YourHistory mine={mine} serverSession={session} />
        </aside>
      </section>
      {mayEdit ? (
        <CorrectLocalRecord
          city={productions[0]?.city ?? ''}
          productions={productions}
          show={show}
          venue={productions[0]?.venue ?? ''}
        />
      ) : null}
      <Productions productions={productions} scope={scope} />
      <Cast cast={cast} />
      <PhotoGallery showId={show.id} photos={photos} />
    </main>
  )
}

/** "once", "twice", "three times" — a count nobody would say aloud as "2 times". */
function countWord(n: number) {
  if (n === 1) return 'once'
  if (n === 2) return 'twice'
  return `${n} times`
}

type ShowState = Awaited<ReturnType<typeof getMyShowState>>

function YourHistory({
  mine,
  serverSession,
}: {
  mine: ShowState
  serverSession: Awaited<ReturnType<typeof getSession>>
}) {
  const { data: clientSession } = authClient.useSession()
  const session = clientSession ?? serverSession
  if (!session) return <p>Sign in to see your history with this show.</p>
  if (!mine.outings.length) return <p>You have not logged a performance of this show yet.</p>
  return (
    <ul className="show-history">
      {mine.outings.map((outing) => (
        <li key={outing.id}>
          <Link params={{ id: outing.id }} to="/outings/$id">
            {formatFuzzyDate(outing)}
            {outing.venue ? ` · ${outing.venue}` : ''}
          </Link>
        </li>
      ))}
    </ul>
  )
}

function LibraryButtons({
  mine,
  showId,
  serverSession,
}: {
  mine: ShowState
  showId: string
  serverSession: Awaited<ReturnType<typeof getSession>>
}) {
  // Falling back to the server session rather than keying off `isPending`: the
  // hook does not reliably report pending during SSR, and a signed-in reader
  // must never be shown "sign in" while hydration catches up.
  const { data: clientSession } = authClient.useSession()
  const session = clientSession ?? serverSession
  const [message, setMessage] = useState<string | null>(null)

  async function save(status: 'want_to_see' | 'seen') {
    try {
      await saveLibraryEntry({ data: { showId, status } })
      setMessage(status === 'seen' ? 'Added to your Seen collection.' : 'Added to Want to See.')
    } catch {
      setMessage('We could not update your theatre.')
    }
  }

  async function saveDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    try {
      await saveLibraryEntry({
        data: {
          showId,
          status: form.get('status') === 'seen' ? 'seen' : 'want_to_see',
          favorite: form.get('favorite') === 'on',
          rating: Number(form.get('rating')) || undefined,
          review: String(form.get('review')).trim() || undefined,
          // Absent means "follow my profile", which the server fills in.
          visibility: formText(form, 'visibility') as 'friends' | undefined,
        },
      })
      setMessage('Your show details are saved.')
    } catch {
      setMessage('We could not update your theatre.')
    }
  }

  // No pending state to wait on: the server session is already known.
  if (!session)
    return (
      <Link className="button button-quiet" to="/sign-in">
        Sign in to add this show
      </Link>
    )

  // Logging a night marks the show seen already, so offering to mark it again
  // is asking for something the reader has plainly done. What they might want
  // instead is to record another night of it.
  const seen = mine.outings.length > 0 || mine.entry?.status === 'seen'
  const wanted = mine.entry?.status === 'want_to_see'

  return (
    <div className="show-library-actions">
      {seen ? (
        <p className="show-seen-note">
          {mine.outings.length
            ? `You have seen this ${countWord(mine.outings.length)}.`
            : 'You have marked this as seen.'}
        </p>
      ) : (
        <button className="button button-primary" onClick={() => save('seen')} type="button">
          Mark as seen
        </button>
      )}
      {seen || wanted ? null : (
        <button className="button button-quiet" onClick={() => save('want_to_see')} type="button">
          Want to see
        </button>
      )}
      {message ? <span role="status">{message}</span> : null}
      <details className="show-library-details">
        <summary>More details</summary>
        <form onSubmit={saveDetails}>
          <label>
            Status
            <select name="status" defaultValue="want_to_see">
              <option value="want_to_see">Want to See</option>
              <option value="seen">Seen</option>
            </select>
          </label>
          <label>
            Rating
            <select name="rating" defaultValue="">
              <option value="">No rating</option>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((value) => (
                <option key={value} value={value}>
                  {value / 2} out of 5
                </option>
              ))}
            </select>
          </label>
          <p className="settings-note">
            Dates, venues, and who you were with belong to a performance — use “Log a performance”
            above to record one.
          </p>
          <label className="favorite-toggle">
            <input name="favorite" type="checkbox" />
            <span>Favorite</span>
          </label>
          <label>
            Visible to
            <select name="visibility" defaultValue="friends">
              <option value="private">Only me</option>
              <option value="friends">Friends</option>
            </select>
          </label>
          <label>
            Personal review
            <textarea name="review" rows={4} />
          </label>
          <button className="button button-quiet" type="submit">
            Save my details
          </button>
        </form>
      </details>
    </div>
  )
}

/**
 * Photographs people have contributed for this show. A photo offered publicly
 * reaches approved friends immediately and everyone only after review, so the
 * gallery labels anything still waiting rather than implying it is live.
 */
function PhotoGallery({
  showId,
  photos,
}: {
  showId: string
  photos: Awaited<ReturnType<typeof getShowPhotos>>
}) {
  const { data: session } = authClient.useSession()
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  // Sharing with approved friends is the default; private stays one click away.
  const [visibility, setVisibility] = useState('friends')

  async function upload(file: File) {
    setProblem(null)
    setBusy(true)
    try {
      const body = new FormData()
      body.set('kind', 'show-photo')
      body.set('showId', showId)
      body.set('visibility', visibility)
      body.set('file', file)
      const response = await fetch('/api/uploads', { method: 'POST', body })
      const payload = (await response.json()) as { key?: string; error?: string }
      if (!response.ok || !payload.key) throw new Error(payload.error ?? 'Upload failed.')
      window.location.reload()
    } catch (caughtError) {
      setProblem(caughtError instanceof Error ? caughtError.message : 'Upload failed.')
      setBusy(false)
    }
  }

  async function remove(id: string) {
    await deleteShowPhoto({ data: { id } })
    window.location.reload()
  }

  return (
    <section className="photo-gallery page-wrap">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Photographs</p>
          <h2>From people who were there.</h2>
        </div>
      </div>

      {photos.length ? (
        <ul className="photo-grid">
          {photos.map((photo) => (
            <li key={photo.id}>
              <img src={`/api/images/${photo.objectKey}`} alt="" loading="lazy" decoding="async" />
              <div className="photo-meta">
                <span>{photo.isOwn ? 'Yours' : (photo.uploaderName ?? 'A theatregoer')}</span>
                {photo.isOwn &&
                photo.visibility === 'public' &&
                photo.reviewStatus === 'pending' ? (
                  <span className="photo-pending">Visible to friends · awaiting review</span>
                ) : null}
                {photo.isOwn && photo.reviewStatus === 'rejected' ? (
                  <span className="photo-pending">Not approved · only you can see this</span>
                ) : null}
                {photo.isOwn ? (
                  <>
                    <label className="photo-visibility">
                      <span className="sr-only">Who can see this photograph</span>
                      <select
                        defaultValue={photo.visibility}
                        onChange={async (event) => {
                          await changePhotoVisibility({
                            data: { id: photo.id, visibility: event.target.value as 'friends' },
                          })
                          window.location.reload()
                        }}
                      >
                        <option value="private">Only me</option>
                        <option value="friends">Friends</option>
                        <option value="public">Everyone — after review</option>
                      </select>
                    </label>
                    <button
                      className="text-action"
                      type="button"
                      onClick={() => void remove(photo.id)}
                    >
                      Remove
                    </button>
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="profile-empty">
          No photographs yet. If you have been, yours would be the first.
        </p>
      )}

      {session ? (
        <div className="photo-upload">
          <label className="avatar-field-input">
            <span>{busy ? 'Uploading…' : 'Add a photograph'}</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void upload(file)
              }}
            />
          </label>
          <label className="avatar-field-input">
            <span>Who can see it</span>
            <select value={visibility} onChange={(event) => setVisibility(event.target.value)}>
              <option value="private">Only me</option>
              <option value="friends">Friends</option>
              <option value="public">Everyone — after a quick review</option>
            </select>
          </label>
          {problem ? (
            <p className="form-error" role="alert">
              {problem}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

/**
 * The date, venue, and companions of a night out live on the outing, not on the
 * library entry — the form below records what you think of a show, this records
 * a particular performance of it.
 */
function LogAction({ showId }: { showId: string }) {
  return (
    <Link className="button button-primary show-hero-log" to="/log" search={{ show: showId }}>
      + Log a performance
    </Link>
  )
}

/**
 * Where and when this work has been staged. Catalog facts, so everybody sees
 * them — separate from the reader's own history with the show, which sits above.
 */
function Productions({
  productions,
  scope,
}: {
  productions: Awaited<ReturnType<typeof getProductionsForShow>>
  scope: 'catalog' | 'local'
}) {
  return (
    <section className="productions-section page-wrap">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{scope === 'local' ? 'Stagings' : 'Productions'}</p>
          <h2>Where it has been staged.</h2>
        </div>
      </div>
      {productions.length ? (
        <ul className="production-list-public">
          {productions.map((production) => (
            <li key={production.id}>
              <div>
                <strong>{production.name}</strong>
                {/* The venue is a real page now, with a map and everything else
                    staged there, so the row that names it should lead to it. */}
                {production.venueId && production.venue ? (
                  <Link params={{ id: production.venueId }} to="/venues/$id">
                    {[production.venue, production.city].filter(Boolean).join(', ')}
                  </Link>
                ) : (
                  <span>{[production.venue, production.city].filter(Boolean).join(' · ')}</span>
                )}
              </div>
              <span className="production-run">{describeRun(production)}</span>
            </li>
          ))}
        </ul>
      ) : (
        // Most shows have no production recorded, and a section that simply
        // vanished left the page looking like it had lost something.
        <p className="profile-empty">
          Nobody has recorded where this has been staged yet. Logging a night at a theatre is what
          fills this in.
        </p>
      )}
    </section>
  )
}

/** A run reads as a span, an opening, or nothing — never an invented date. */
function describeRun(production: { openedOn?: string | null; closedOn?: string | null }) {
  const opened = production.openedOn
    ? formatFuzzyDate({ datePrecision: 'exact', occurredOn: production.openedOn })
    : null
  const closed = production.closedOn
    ? formatFuzzyDate({ datePrecision: 'exact', occurredOn: production.closedOn })
    : null
  if (opened && closed) return `${opened} — ${closed}`
  if (opened) return `Opened ${opened} · still running`
  if (closed) return `Closed ${closed}`
  return ''
}

/** Who has been in this show, grouped by the production they were in. */
function Cast({ cast }: { cast: Awaited<ReturnType<typeof getCastForShow>> }) {
  if (!cast.length) return null
  const byProduction = new Map<string, typeof cast>()
  for (const member of cast) {
    byProduction.set(member.productionName, [
      ...(byProduction.get(member.productionName) ?? []),
      member,
    ])
  }
  return (
    <section className="cast-section page-wrap">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Company</p>
          <h2>Who has been in it.</h2>
        </div>
      </div>
      {[...byProduction].map(([productionName, members]) => (
        <div key={productionName} className="cast-group">
          <p className="eyebrow">{productionName}</p>
          <ul className="cast-list">
            {members.map((member) => (
              <li key={member.id}>
                <Link to="/artists/$id" params={{ id: member.personId }}>
                  <strong>{member.name}</strong>
                  <span>{member.role}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}

/**
 * Correcting a local record, for the people who were there.
 *
 * The hall is stated in full rather than left to be remembered, because a hall
 * is its name within its town: saving with the town blank would quietly move
 * the record to a different building.
 */
function CorrectLocalRecord({
  show,
  productions,
  venue,
  city,
}: {
  show: { id: string; title: string; type: string; synopsis: string | null }
  productions: Awaited<ReturnType<typeof getProductionsForShow>>
  venue: string
  city: string
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setError(null)
    setSaving(true)
    try {
      await saveLocalShow({
        data: {
          showId: show.id,
          title: String(form.get('title')),
          type: String(form.get('type')) as 'musical',
          synopsis: String(form.get('synopsis') ?? '').trim() || undefined,
          venue: String(form.get('venue')),
          city: String(form.get('city') ?? '').trim() || undefined,
        },
      })
      window.location.reload()
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'We could not save that.')
      setSaving(false)
    }
  }

  async function saveYear(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setError(null)
    try {
      await saveLocalStagingYear({
        data: { productionId: String(form.get('productionId')), year: Number(form.get('year')) },
      })
      window.location.reload()
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'We could not save that.')
    }
  }

  return (
    <section className="correct-local page-wrap">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Yours to correct</p>
          <h2>Something not right?</h2>
        </div>
        <button className="text-action" onClick={() => setOpen((was) => !was)} type="button">
          {open ? 'Cancel' : 'Correct this record'}
        </button>
      </div>
      {!open ? (
        <p className="profile-empty">
          You were there, so you can fix this — the title, what kind of thing it was, or the year.
        </p>
      ) : null}

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      {open ? (
        <>
          <form className="settings-form" onSubmit={save}>
            <label>
              What was it called?
              <input defaultValue={show.title} name="title" required />
            </label>
            <label>
              Kind
              <select defaultValue={show.type} name="type">
                <option value="musical">Musical</option>
                <option value="play">Play</option>
                <option value="other">Something else</option>
              </select>
            </label>
            <label>
              Where was it?
              <input defaultValue={venue} name="venue" required />
            </label>
            <label>
              Town or city
              <input defaultValue={city} name="city" />
              <span>A hall is its name within its town, so both matter.</span>
            </label>
            <label>
              What was it? <span>Optional</span>
              <textarea
                defaultValue={show.synopsis ?? ''}
                name="synopsis"
                placeholder="Worth writing down while somebody still remembers."
                rows={4}
              />
            </label>
            <button className="button button-primary" disabled={saving} type="submit">
              {saving ? 'Saving…' : 'Save the correction'}
            </button>
          </form>

          {productions.length ? (
            <div className="staging-years">
              <p className="eyebrow">Years</p>
              {productions.map((staging) => (
                <form key={staging.id} onSubmit={saveYear}>
                  <input name="productionId" type="hidden" value={staging.id} />
                  <label>
                    {staging.venue ?? 'This staging'}
                    <input
                      defaultValue={staging.name.split(', ').pop() ?? ''}
                      max="2200"
                      min="1800"
                      name="year"
                      type="number"
                    />
                  </label>
                  <button className="button button-quiet" type="submit">
                    Fix the year
                  </button>
                </form>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  )
}
