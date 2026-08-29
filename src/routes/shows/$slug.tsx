import { Link, createFileRoute } from '@tanstack/react-router'
import { useEffect, useState, type FormEvent } from 'react'

import { authClient } from '../../lib/auth-client'
import { ShowArtwork } from '../../components/ShowArtwork'
import { getPublishedShow } from '../../server/catalog-functions'
import { saveLibraryEntry } from '../../server/library-functions'
import { getMyOutingsForShow } from '../../server/outing-functions'
import { formatFuzzyDate } from '../../lib/fuzzy-date'

export const Route = createFileRoute('/shows/$slug')({
  loader: ({ params }) => getPublishedShow({ data: { slug: params.slug } }),
  component: ShowDetail,
})

function ShowDetail() {
  const show = Route.useLoaderData()

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
            <p>This shared catalog record is ready for your theatre history.</p>
            <LibraryButtons showId={show.id} />
          </div>
        </div>
      </section>
      <section className="show-detail-body page-wrap">
        <div>
          <p className="eyebrow">About the show</p>
          <h2>The work itself.</h2>
          <p>{show.synopsis || 'A catalog description has not been added yet.'}</p>
        </div>
        <aside>
          <p className="eyebrow">Your theatre</p>
          <YourHistory showId={show.id} />
        </aside>
      </section>
    </main>
  )
}

function YourHistory({ showId }: { showId: string }) {
  const { data: session } = authClient.useSession()
  const [outings, setOutings] = useState<Awaited<ReturnType<typeof getMyOutingsForShow>>>([])
  useEffect(() => {
    if (session) void getMyOutingsForShow({ data: { showId } }).then(setOutings)
  }, [session, showId])
  if (!session) return <p>Sign in to see your history with this show.</p>
  if (!outings.length) return <p>You have not logged a performance of this show yet.</p>
  return (
    <ul className="show-history">
      {outings.map((outing) => (
        <li key={outing.id}>
          <Link to="/outings/$id" params={{ id: outing.id }}>
            {formatFuzzyDate(outing)}
            {outing.venue ? ` · ${outing.venue}` : ''}
          </Link>
        </li>
      ))}
    </ul>
  )
}

function LibraryButtons({ showId }: { showId: string }) {
  const { data: session, isPending } = authClient.useSession()
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
          visibility: form.get('visibility') === 'friends' ? 'friends' : 'private',
        },
      })
      setMessage('Your show details are saved.')
    } catch {
      setMessage('We could not update your theatre.')
    }
  }

  if (isPending) return null
  if (!session)
    return (
      <Link className="button button-quiet" to="/sign-in">
        Sign in to add this show
      </Link>
    )

  return (
    <div className="show-library-actions">
      <button className="button button-primary" type="button" onClick={() => save('seen')}>
        Mark as seen
      </button>
      <button className="button button-quiet" type="button" onClick={() => save('want_to_see')}>
        Want to see
      </button>
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
          <label className="favorite-toggle">
            <input name="favorite" type="checkbox" />
            <span>Favorite</span>
          </label>
          <label>
            Visible to
            <select name="visibility" defaultValue="private">
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
