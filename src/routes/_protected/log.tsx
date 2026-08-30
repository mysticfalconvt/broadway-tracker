import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState, type FormEvent } from 'react'

import { VenueField } from '../../components/VenueField'
import { formFlag, formNumber, formRequired, formText } from '../../lib/form'
import { toLocalISODate } from '../../lib/time'

import {
  addProduction,
  getPublishedProductions,
  searchPublishedShows,
} from '../../server/catalog-functions'
import { createOuting } from '../../server/outing-functions'

export const Route = createFileRoute('/_protected/log')({
  // Arriving from a show page, that show is already chosen.
  validateSearch: (search: Record<string, unknown>): { show?: string } => ({
    show: typeof search.show === 'string' ? search.show : undefined,
  }),
  loader: () => searchPublishedShows({ data: { query: '' } }),
  component: LogOuting,
})

function LogOuting() {
  const shows = Route.useLoaderData()
  const { show: showFromLink } = Route.useSearch()
  const [showId, setShowId] = useState(showFromLink ?? '')
  const [productions, setProductions] = useState<
    Awaited<ReturnType<typeof getPublishedProductions>>
  >([])
  const [precision, setPrecision] = useState('exact')
  // Resolved after mount: the server runs in UTC, so its "today" is the wrong
  // day for much of the world for part of every day.
  const [today, setToday] = useState('')
  const [productionId, setProductionId] = useState('')
  // Adding a staging inline: a tour stop or a local company's run is usually
  // not in the catalog yet, and stopping to ask an administrator would end the
  // evening's logging right there.
  const [addingProduction, setAddingProduction] = useState(false)
  const [newProductionName, setNewProductionName] = useState('')
  const [newProductionType, setNewProductionType] = useState('tour')
  const [productionMessage, setProductionMessage] = useState<string | null>(null)
  const [venue, setVenue] = useState('')
  const [city, setCity] = useState('')
  useEffect(() => setToday(toLocalISODate(new Date())), [])
  const [error, setError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)

  useEffect(() => {
    if (!showId) {
      setProductions([])
      return
    }
    void getPublishedProductions({ data: { showId } }).then((rows) => {
      setProductions(rows)
      // If the catalog only knows one place this show has been staged, that is
      // almost certainly where you saw it. Only ever fills an empty field, so it
      // cannot overwrite something already typed.
      const only = rows.length === 1 ? rows[0] : undefined
      if (only?.venue) {
        setVenue((current) => current || (only.venue ?? ''))
        setCity((current) => current || (only.city ?? ''))
        setProductionId((current) => current || only.id)
      }
    })
  }, [showId])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setError(null)
    setIsPending(true)
    try {
      const outing = await createOuting({
        data: {
          showId: formRequired(form, 'showId'),
          productionId: formText(form, 'productionId'),
          venue: formText(form, 'venue'),
          city: formText(form, 'city'),
          datePrecision: precision as 'exact' | 'month' | 'year' | 'approximate' | 'unknown',
          // Only the field matching the chosen precision is rendered, so the
          // others are absent from the form rather than empty.
          occurredOn: formText(form, 'occurredOn'),
          occurredMonth: formNumber(form, 'occurredMonth'),
          occurredYear: formNumber(form, 'occurredYear'),
          approximateDate: formText(form, 'approximateDate'),
          rating: formNumber(form, 'rating'),
          favorite: formFlag(form, 'favorite'),
          review: formText(form, 'review'),
          privateNotes: formText(form, 'privateNotes'),
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
          <select
            name="showId"
            value={showId}
            onChange={(event) => setShowId(event.target.value)}
            required
          >
            <option value="">Choose a show</option>
            {shows.map((show) => (
              <option key={show.id} value={show.id}>
                {show.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Production <span>Optional</span>
          <select
            name="productionId"
            value={productionId}
            disabled={!showId}
            onChange={(event) => {
              setProductionId(event.target.value)
              // Picking a production tells us the theatre, so fill it in.
              const chosen = productions.find((p) => p.id === event.target.value)
              if (chosen?.venue) {
                setVenue(chosen.venue)
                setCity(chosen.city ?? '')
              }
            }}
          >
            <option value="">Not sure</option>
            {productions.map((production) => (
              <option key={production.id} value={production.id}>
                {production.name}
                {production.venue ? ` · ${production.venue}` : ''}
              </option>
            ))}
          </select>
          {showId ? (
            <button
              className="text-action"
              type="button"
              onClick={() => setAddingProduction((open) => !open)}
            >
              {addingProduction ? 'Cancel' : 'Not listed? Add a production'}
            </button>
          ) : null}
        </label>
        {addingProduction ? (
          <div className="new-production">
            <label>
              What was it called?
              <input
                value={newProductionName}
                placeholder="First National Tour"
                onChange={(event) => setNewProductionName(event.target.value)}
              />
              <span>A staging, not a place — the same tour in two cities is one production.</span>
            </label>
            <label>
              Kind
              <select
                value={newProductionType}
                onChange={(event) => setNewProductionType(event.target.value)}
              >
                <option value="broadway">Broadway</option>
                <option value="off_broadway">Off-Broadway</option>
                <option value="tour">Touring</option>
                <option value="regional">Regional</option>
                <option value="local">Local or community</option>
                <option value="other">Something else</option>
              </select>
            </label>
            <button
              className="button button-quiet"
              type="button"
              disabled={!newProductionName.trim()}
              onClick={async () => {
                setProductionMessage(null)
                try {
                  const result = await addProduction({
                    data: {
                      showId,
                      name: newProductionName,
                      productionType: newProductionType as 'tour',
                      venue: venue || undefined,
                      city: city || undefined,
                    },
                  })
                  const rows = await getPublishedProductions({ data: { showId } })
                  setProductions(rows)
                  setProductionId(result.id)
                  setAddingProduction(false)
                  setNewProductionName('')
                  setProductionMessage(
                    result.created ? 'Production added.' : 'That production was already recorded.',
                  )
                } catch (caughtError) {
                  setProductionMessage(
                    caughtError instanceof Error ? caughtError.message : 'We could not add that.',
                  )
                }
              }}
            >
              Add it
            </button>
          </div>
        ) : null}
        {productionMessage ? <p className="settings-note">{productionMessage}</p> : null}
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
                value={today}
                onChange={(event) => setToday(event.target.value)}
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
        <VenueField venue={venue} city={city} onVenue={setVenue} onCity={setCity} />
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
          <label className="favorite-toggle">
            <input name="favorite" type="checkbox" />
            <span>Favorite</span>
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
