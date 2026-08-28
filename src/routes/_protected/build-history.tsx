import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'

import { formatFuzzyDate } from '../../lib/fuzzy-date'
import { getPublishedProductions, searchPublishedShows } from '../../server/catalog-functions'
import { createOuting } from '../../server/outing-functions'

export const Route = createFileRoute('/_protected/build-history')({
  loader: () => searchPublishedShows({ data: { query: '' } }),
  component: BuildHistory,
})

type Show = Awaited<ReturnType<typeof searchPublishedShows>>[number]
type Production = Awaited<ReturnType<typeof getPublishedProductions>>[number]
type Precision = 'exact' | 'month' | 'year' | 'approximate' | 'unknown'
type Added = { id: string; title: string; when: string }

const PRECISIONS: { value: Precision; label: string }[] = [
  { value: 'exact', label: 'Exact date' },
  { value: 'month', label: 'Month / year' },
  { value: 'year', label: 'Year' },
  { value: 'approximate', label: 'Approximate' },
  { value: 'unknown', label: "I don't remember" },
]

function BuildHistory() {
  const initialShows = Route.useLoaderData()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Show[]>(initialShows)
  const [pending, setPending] = useState<Show | null>(null)
  const [added, setAdded] = useState<Added[]>([])
  const [error, setError] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  // Backfilling is a rhythm: search, answer one question, search again. The
  // search box keeps focus so a whole decade can be entered without reaching
  // for the mouse.
  useEffect(() => {
    if (!pending) searchRef.current?.focus()
  }, [pending])

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(() => {
      void searchPublishedShows({ data: { query } }).then((shows) => {
        if (!cancelled) setResults(shows)
      })
    }, 150)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query])

  function choose(show: Show) {
    setError(null)
    setPending(show)
  }

  function finish(show: Show, when: string, id: string) {
    setAdded((current) => [{ id, title: show.title, when }, ...current])
    setPending(null)
    setQuery('')
  }

  return (
    <main className="backfill-page page-wrap">
      <header className="settings-header">
        <p className="eyebrow">Build your history</p>
        <h1>Build Your Theatre History.</h1>
        <p>Add everything you remember. Details can come later.</p>
      </header>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="backfill-layout">
        <section className="backfill-main">
          {pending ? (
            <DateStep
              show={pending}
              onCancel={() => setPending(null)}
              onError={setError}
              onAdded={finish}
            />
          ) : (
            <>
              <label className="backfill-search">
                Search the catalog
                <input
                  ref={searchRef}
                  type="search"
                  value={query}
                  placeholder="les mis"
                  autoComplete="off"
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && results[0]) {
                      event.preventDefault()
                      choose(results[0])
                    }
                  }}
                />
              </label>
              {results.length ? (
                <ul className="backfill-results">
                  {results.map((show) => (
                    <li key={show.id}>
                      <span>
                        <strong>{show.title}</strong>
                        <span className="backfill-type">{show.type}</span>
                      </span>
                      <button
                        className="button button-primary"
                        type="button"
                        onClick={() => choose(show)}
                      >
                        + Seen
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="backfill-empty">
                  No shows match “{query}”. Ask an admin to add it, or try another title.
                </p>
              )}
            </>
          )}
        </section>

        <aside className="backfill-queue" aria-live="polite">
          <p className="eyebrow">Added today</p>
          {added.length ? (
            <ol>
              {added.map((entry) => (
                <li key={entry.id}>
                  <strong>{entry.title}</strong>
                  <span>{entry.when}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="backfill-empty">
              Nothing yet. Every show you add lands here so you can see the history taking shape.
            </p>
          )}
        </aside>
      </div>
    </main>
  )
}

function DateStep({
  show,
  onAdded,
  onCancel,
  onError,
}: {
  show: Show
  onAdded: (show: Show, when: string, id: string) => void
  onCancel: () => void
  onError: (message: string | null) => void
}) {
  // Year is the fastest answer for a show seen long ago, so it leads.
  const [precision, setPrecision] = useState<Precision>('year')
  const [occurredOn, setOccurredOn] = useState('')
  const [occurredMonth, setOccurredMonth] = useState('')
  const [occurredYear, setOccurredYear] = useState('')
  const [approximateDate, setApproximateDate] = useState('')
  const [venue, setVenue] = useState('')
  const [city, setCity] = useState('')
  const [productionId, setProductionId] = useState('')
  const [productions, setProductions] = useState<Production[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const firstFieldRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    firstFieldRef.current?.focus()
  }, [])

  async function save(withDetails: boolean) {
    onError(null)
    setIsSaving(true)
    const date = {
      datePrecision: precision,
      occurredOn: precision === 'exact' ? occurredOn || undefined : undefined,
      occurredMonth: precision === 'month' ? Number(occurredMonth) || undefined : undefined,
      occurredYear:
        precision === 'month' || precision === 'year'
          ? Number(occurredYear) || undefined
          : undefined,
      approximateDate:
        precision === 'approximate' ? approximateDate.trim() || undefined : undefined,
    }
    try {
      const outing = await createOuting({
        data: {
          showId: show.id,
          ...date,
          productionId: withDetails ? productionId || undefined : undefined,
          venue: withDetails ? venue.trim() || undefined : undefined,
          city: withDetails ? city.trim() || undefined : undefined,
        },
      })
      onAdded(show, formatFuzzyDate(date), outing.id)
    } catch (caughtError) {
      onError(caughtError instanceof Error ? caughtError.message : 'We could not add this show.')
      setIsSaving(false)
    }
  }

  return (
    <form
      className="backfill-step"
      onSubmit={(event) => {
        event.preventDefault()
        void save(true)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onCancel()
      }}
    >
      <p className="eyebrow">{show.title}</p>
      <h2>When did you see it?</h2>

      <div
        className="backfill-precision"
        role="group"
        aria-label="How well do you remember the date?"
      >
        {PRECISIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={precision === option.value ? 'is-selected' : undefined}
            aria-pressed={precision === option.value}
            onClick={() => setPrecision(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {precision === 'exact' ? (
        <label>
          Date
          <input
            ref={firstFieldRef}
            type="date"
            value={occurredOn}
            onChange={(event) => setOccurredOn(event.target.value)}
            required
          />
        </label>
      ) : null}

      {precision === 'month' ? (
        <div className="backfill-pair">
          <label>
            Month
            <input
              ref={firstFieldRef}
              type="number"
              min="1"
              max="12"
              value={occurredMonth}
              onChange={(event) => setOccurredMonth(event.target.value)}
              required
            />
          </label>
          <label>
            Year
            <input
              type="number"
              min="1800"
              max="2200"
              value={occurredYear}
              onChange={(event) => setOccurredYear(event.target.value)}
              required
            />
          </label>
        </div>
      ) : null}

      {precision === 'year' ? (
        <label>
          Year
          <input
            ref={firstFieldRef}
            type="number"
            min="1800"
            max="2200"
            placeholder="2007"
            value={occurredYear}
            onChange={(event) => setOccurredYear(event.target.value)}
            required
          />
        </label>
      ) : null}

      {precision === 'approximate' ? (
        <label>
          Roughly when?
          <input
            ref={firstFieldRef}
            value={approximateDate}
            placeholder="Around 2005"
            onChange={(event) => setApproximateDate(event.target.value)}
            required
          />
        </label>
      ) : null}

      {precision === 'unknown' ? (
        <p className="backfill-empty">
          That is fine — the show is recorded without a date, and you can add one later.
        </p>
      ) : null}

      <details
        className="backfill-details"
        onToggle={(event) => {
          // Only reach for productions if the person opens the optional section,
          // so the common path stays a single round trip.
          if (!event.currentTarget.open || productions.length) return
          void getPublishedProductions({ data: { showId: show.id } }).then(setProductions)
        }}
      >
        <summary>Add production, venue, or city</summary>
        {productions.length ? (
          <label className="backfill-production">
            Production
            <select value={productionId} onChange={(event) => setProductionId(event.target.value)}>
              <option value="">Not sure</option>
              {productions.map((production) => (
                <option key={production.id} value={production.id}>
                  {production.name}
                  {production.venue ? ` — ${production.venue}` : ''}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="backfill-pair">
          <label>
            Venue
            <input value={venue} onChange={(event) => setVenue(event.target.value)} />
          </label>
          <label>
            City
            <input value={city} onChange={(event) => setCity(event.target.value)} />
          </label>
        </div>
      </details>

      <div className="backfill-actions">
        <button className="button button-primary" type="submit" disabled={isSaving}>
          Add to history
        </button>
        <button
          className="button button-quiet"
          type="button"
          disabled={isSaving}
          onClick={() => void save(false)}
        >
          Skip for now
        </button>
        <button className="text-action" type="button" onClick={onCancel} disabled={isSaving}>
          Choose a different show
        </button>
      </div>
    </form>
  )
}
