import { createFileRoute } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'

import { searchPublishedShows } from '../../server/catalog-functions'
import { createOuting } from '../../server/outing-functions'

export const Route = createFileRoute('/_protected/log')({
  loader: () => searchPublishedShows({ data: { query: '' } }),
  component: LogOuting,
})

function LogOuting() {
  const shows = Route.useLoaderData()
  const [precision, setPrecision] = useState('exact')
  const [error, setError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setError(null)
    setIsPending(true)
    try {
      const outing = await createOuting({
        data: {
          showId: String(form.get('showId')),
          venue: String(form.get('venue')).trim() || undefined,
          city: String(form.get('city')).trim() || undefined,
          datePrecision: precision as 'exact' | 'month' | 'year' | 'approximate' | 'unknown',
          occurredOn: String(form.get('occurredOn')) || undefined,
          occurredMonth: Number(form.get('occurredMonth')) || undefined,
          occurredYear: Number(form.get('occurredYear')) || undefined,
          approximateDate: String(form.get('approximateDate')).trim() || undefined,
          rating: Number(form.get('rating')) || undefined,
          favorite: form.get('favorite') === 'on',
          review: String(form.get('review')).trim() || undefined,
          privateNotes: String(form.get('privateNotes')).trim() || undefined,
        },
      })
      window.location.assign(`/outings/${outing.id}`)
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : 'We could not log this performance.',
      )
      setIsPending(false)
    }
  }

  return (
    <main className="log-page page-wrap">
      <header className="settings-header">
        <p className="eyebrow">New memory</p>
        <h1>Log a performance.</h1>
        <p>Keep the shared facts simple. Your reaction is always your own.</p>
      </header>
      <form className="settings-form" onSubmit={submit}>
        <label>
          What did you see?
          <select name="showId" required>
            <option value="">Choose a show</option>
            {shows.map((show) => (
              <option key={show.id} value={show.id}>
                {show.title}
              </option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend>When did you see it?</legend>
          <label>
            Date precision
            <select value={precision} onChange={(event) => setPrecision(event.target.value)}>
              <option value="exact">Exact date</option>
              <option value="month">Month and year</option>
              <option value="year">Year</option>
              <option value="approximate">Around a date</option>
              <option value="unknown">I do not remember</option>
            </select>
          </label>
          {precision === 'exact' ? (
            <label>
              Date
              <input
                name="occurredOn"
                type="date"
                defaultValue={new Date().toISOString().slice(0, 10)}
                required
              />
            </label>
          ) : null}
          {precision === 'month' ? (
            <>
              <label>
                Month
                <input name="occurredMonth" type="number" min="1" max="12" required />
              </label>
              <label>
                Year
                <input name="occurredYear" type="number" min="1800" max="2200" required />
              </label>
            </>
          ) : null}
          {precision === 'year' ? (
            <label>
              Year
              <input name="occurredYear" type="number" min="1800" max="2200" required />
            </label>
          ) : null}
          {precision === 'approximate' ? (
            <label>
              Approximate date
              <input name="approximateDate" placeholder="Around 2005" required />
            </label>
          ) : null}
        </fieldset>
        <label>
          Venue <span>Optional</span>
          <input name="venue" />
        </label>
        <label>
          City <span>Optional</span>
          <input name="city" />
        </label>
        <fieldset>
          <legend>
            What did you think? <span>Optional</span>
          </legend>
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
          <label>
            <input name="favorite" type="checkbox" /> Favorite
          </label>
          <label>
            Shareable review
            <textarea name="review" rows={4} />
          </label>
          <label>
            Private note
            <textarea name="privateNotes" rows={4} />
          </label>
        </fieldset>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <button className="button button-primary" type="submit" disabled={isPending}>
          {isPending ? 'Logging...' : 'Log performance'}
        </button>
      </form>
    </main>
  )
}
