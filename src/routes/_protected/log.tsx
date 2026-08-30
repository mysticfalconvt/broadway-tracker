import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState, type FormEvent } from 'react'

import { VenueField } from '../../components/VenueField'
import { formFlag, formNumber, formRequired, formText } from '../../lib/form'
import { toLocalISODate } from '../../lib/time'

import {
  addLocalProduction,
  addLocalShow,
  addProduction,
  submitShow,
  getLocalProductionsAt,
  getPublishedProductions,
  searchPublishedShows,
} from '../../server/catalog-functions'
import { narrowTheDate } from '../../server/narrowing'
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
  // Filled in when the catalog settles a year the reader was unsure about.
  const [narrowedYear, setNarrowedYear] = useState('')
  // Resolved after mount: the server runs in UTC, so its "today" is the wrong
  // day for much of the world for part of every day.
  const [today, setToday] = useState('')
  const [productionId, setProductionId] = useState('')
  // Adding a staging inline: a tour stop or a local company's run is usually
  // not in the catalog yet, and stopping to ask an administrator would end the
  // evening's logging right there.
  // A community theatre's own revue is in no catalog and never will be. It is
  // recorded with its staging in one go, because a local work has no meaning
  // apart from the hall it was put on in.
  const [addingShow, setAddingShow] = useState(false)
  // A work missing from the catalog is either one that belongs there and nobody
  // has added yet, or one that never will. They are recorded differently.
  const [showKind, setShowKind] = useState<'catalog' | 'local'>('catalog')
  const [newShowTitle, setNewShowTitle] = useState('')
  const [newShowType, setNewShowType] = useState('musical')
  const [newShowYear, setNewShowYear] = useState('')
  const [addedShow, setAddedShow] = useState<{ id: string; title: string } | null>(null)
  const [addingProduction, setAddingProduction] = useState(false)
  // A school production and a national tour are recorded differently: one is
  // named, the other is found by where and when. Asking a parent to name their
  // child's school musical is asking them to invent something.
  const [productionKind, setProductionKind] = useState<'catalog' | 'local'>('catalog')
  const [newProductionName, setNewProductionName] = useState('')
  const [newProductionType, setNewProductionType] = useState('tour')
  const [newLocalYear, setNewLocalYear] = useState('')
  // Local stagings are not in everybody's list for the show, so they are looked
  // up by the theatre once one is named.
  const [localProductions, setLocalProductions] = useState<
    Awaited<ReturnType<typeof getLocalProductionsAt>>
  >([])
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

  useEffect(() => {
    if (!showId || !venue.trim()) {
      setLocalProductions([])
      return
    }
    let current = true
    void getLocalProductionsAt({ data: { showId, venue, city: city || undefined } }).then(
      (rows) => {
        if (current) setLocalProductions(rows)
      },
    )
    return () => {
      current = false
    }
  }, [showId, venue, city])

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
        <p>Broadway, a tour, your child’s school — all of it counts.</p>
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
            {addedShow ? <option value={addedShow.id}>{addedShow.title}</option> : null}
          </select>
          <button
            className="text-action"
            onClick={() => setAddingShow((open) => !open)}
            type="button"
          >
            {addingShow ? 'Cancel' : 'Not in the catalog? Add it'}
          </button>
        </label>
        {addingShow ? (
          <div className="new-production">
            <fieldset className="production-kind">
              <legend>What kind of work?</legend>
              <label>
                <input
                  checked={showKind === 'catalog'}
                  name="showKind"
                  onChange={() => setShowKind('catalog')}
                  type="radio"
                />
                A professional production
                <span>Broadway, a tour, a regional company.</span>
              </label>
              <label>
                <input
                  checked={showKind === 'local'}
                  name="showKind"
                  onChange={() => setShowKind('local')}
                  type="radio"
                />
                A school or community production
                <span>A company’s own revue, a school’s devised piece.</span>
              </label>
            </fieldset>
            <label>
              What was it called?
              <input
                onChange={(event) => setNewShowTitle(event.target.value)}
                placeholder="The Millbrook Revue"
                value={newShowTitle}
              />
            </label>
            <label>
              Kind
              <select onChange={(event) => setNewShowType(event.target.value)} value={newShowType}>
                <option value="musical">Musical</option>
                <option value="play">Play</option>
                <option value="other">Something else</option>
              </select>
            </label>
            {showKind === 'local' ? (
              <>
                <label>
                  Where was it?
                  <input
                    onChange={(event) => setVenue(event.target.value)}
                    placeholder="Grange Hall"
                    value={venue}
                  />
                </label>
                <label>
                  Town or city <span>Optional</span>
                  <input
                    onChange={(event) => setCity(event.target.value)}
                    placeholder="Millbrook"
                    value={city}
                  />
                </label>
                <label>
                  Which year?
                  <input
                    max="2200"
                    min="1800"
                    onChange={(event) => setNewShowYear(event.target.value)}
                    placeholder="2019"
                    type="number"
                    value={newShowYear}
                  />
                </label>
              </>
            ) : null}
            <button
              className="button button-quiet"
              disabled={
                !newShowTitle.trim() ||
                (showKind === 'local' && (!venue.trim() || !newShowYear.trim()))
              }
              onClick={async () => {
                setProductionMessage(null)
                try {
                  if (showKind === 'local') {
                    const result = await addLocalShow({
                      data: {
                        title: newShowTitle,
                        type: newShowType as 'musical',
                        venue,
                        city: city || undefined,
                        year: Number(newShowYear),
                      },
                    })
                    setAddedShow({ id: result.show.id, title: result.show.title })
                    setShowId(result.show.id)
                    setProductionId(result.productionId)
                    setProductionMessage(
                      result.created
                        ? 'Added. It is yours and your friends’ — not the shared catalog.'
                        : 'Somebody from there had already recorded it — you are both on it now.',
                    )
                  } else {
                    const created = await submitShow({
                      data: { title: newShowTitle, type: newShowType as 'musical' },
                    })
                    setAddedShow({ id: created.id, title: created.title })
                    setShowId(created.id)
                    setProductionMessage(
                      'Sent to the catalog for review. Log your night now — it will not wait on us.',
                    )
                  }
                  setAddingShow(false)
                  setNewShowTitle('')
                  setNewShowYear('')
                } catch (caughtError) {
                  setProductionMessage(
                    caughtError instanceof Error ? caughtError.message : 'We could not add that.',
                  )
                }
              }}
              type="button"
            >
              Add it
            </button>
          </div>
        ) : null}
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
            {localProductions.length ? (
              <optgroup label="At this theatre">
                {localProductions.map((production) => (
                  <option key={production.id} value={production.id}>
                    {production.name}
                  </option>
                ))}
              </optgroup>
            ) : null}
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
            <fieldset className="production-kind">
              <legend>What kind of staging?</legend>
              <label>
                <input
                  checked={productionKind === 'catalog'}
                  name="productionKind"
                  onChange={() => setProductionKind('catalog')}
                  type="radio"
                />
                A professional staging
                <span>A Broadway run, a tour, a regional company.</span>
              </label>
              <label>
                <input
                  checked={productionKind === 'local'}
                  name="productionKind"
                  onChange={() => setProductionKind('local')}
                  type="radio"
                />
                A school or community group
                <span>Found by where and when, so it stays out of everyone else’s list.</span>
              </label>
            </fieldset>

            {productionKind === 'catalog' ? (
              <>
                <label>
                  What was it called?
                  <input
                    onChange={(event) => setNewProductionName(event.target.value)}
                    placeholder="First National Tour"
                    value={newProductionName}
                  />
                  <span>A staging, not a place.</span>
                </label>
                <label>
                  Kind
                  <select
                    onChange={(event) => setNewProductionType(event.target.value)}
                    value={newProductionType}
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
                        result.created
                          ? 'Production added.'
                          : 'That production was already recorded.',
                      )
                    } catch (caughtError) {
                      setProductionMessage(
                        caughtError instanceof Error
                          ? caughtError.message
                          : 'We could not add that.',
                      )
                    }
                  }}
                  type="button"
                >
                  Add it
                </button>
              </>
            ) : (
              <>
                <label>
                  Where was it?
                  <input
                    onChange={(event) => setVenue(event.target.value)}
                    placeholder="Lincoln High School"
                    value={venue}
                  />
                </label>
                <label>
                  Town or city <span>Optional</span>
                  <input
                    onChange={(event) => setCity(event.target.value)}
                    placeholder="Springfield"
                    value={city}
                  />
                </label>
                <label>
                  Which year?
                  <input
                    max="2200"
                    min="1800"
                    onChange={(event) => setNewLocalYear(event.target.value)}
                    placeholder="2019"
                    type="number"
                    value={newLocalYear}
                  />
                </label>
                <button
                  className="button button-quiet"
                  disabled={!venue.trim() || !newLocalYear.trim()}
                  onClick={async () => {
                    setProductionMessage(null)
                    try {
                      const result = await addLocalProduction({
                        data: {
                          showId,
                          venue,
                          city: city || undefined,
                          year: Number(newLocalYear),
                        },
                      })
                      const rows = await getLocalProductionsAt({
                        data: { showId, venue, city: city || undefined },
                      })
                      setLocalProductions(rows)
                      setProductionId(result.id)
                      setAddingProduction(false)
                      setNewLocalYear('')
                      setProductionMessage(
                        result.created
                          ? 'Staging added.'
                          : 'Somebody had already recorded that staging — you are both on it now.',
                      )
                    } catch (caughtError) {
                      setProductionMessage(
                        caughtError instanceof Error
                          ? caughtError.message
                          : 'We could not add that.',
                      )
                    }
                  }}
                  type="button"
                >
                  Add it
                </button>
              </>
            )}
          </div>
        ) : null}
        {productionMessage ? <p className="settings-note">{productionMessage}</p> : null}
        <NarrowTheYear
          onYear={(year) => {
            setPrecision('year')
            setNarrowedYear(String(year))
          }}
          showId={showId}
        />
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
                <input
                  defaultValue={narrowedYear}
                  key={narrowedYear}
                  max="2200"
                  min="1800"
                  name="occurredYear"
                  required
                  type="number"
                />
              </label>
            </>
          ) : null}
          {precision === 'year' ? (
            <label>
              Year
              <input
                defaultValue={narrowedYear}
                key={narrowedYear}
                max="2200"
                min="1800"
                name="occurredYear"
                required
                type="number"
              />
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

/**
 * Working out a year somebody is unsure about.
 *
 * Remembering who was in it is usually a better clue than remembering when, so
 * that is what this asks for. The answer comes from the catalog rather than a
 * model: a run cannot have happened before it opened, and somebody eighth of
 * eight to play a part was late in it.
 */
function NarrowTheYear({ showId, onYear }: { showId: string; onYear: (year: number) => void }) {
  const [who, setWho] = useState('')
  const [guess, setGuess] = useState('')
  const [answer, setAnswer] = useState<Awaited<ReturnType<typeof narrowTheDate>> | null>(null)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)

  if (!showId) return null

  async function ask() {
    setBusy(true)
    try {
      setAnswer(
        await narrowTheDate({
          data: {
            showId,
            year: guess.trim() ? Number(guess) : null,
            personName: who.trim() || undefined,
          },
        }),
      )
    } catch {
      setAnswer(null)
    }
    setBusy(false)
  }

  if (!open) {
    return (
      <button className="text-action" onClick={() => setOpen(true)} type="button">
        Not sure when it was?
      </button>
    )
  }

  return (
    <div className="narrow-year">
      <p className="settings-note">
        Tell me what you remember and I will check it against the catalog.
      </p>
      <label>
        Roughly what year? <span>Optional</span>
        <input
          max="2200"
          min="1800"
          onChange={(event) => setGuess(event.target.value)}
          placeholder="2003"
          type="number"
          value={guess}
        />
      </label>
      <label>
        Anybody you remember being in it? <span>Optional</span>
        <input
          onChange={(event) => setWho(event.target.value)}
          placeholder="Tony Danza"
          value={who}
        />
      </label>
      <button className="button button-quiet" disabled={busy} onClick={ask} type="button">
        {busy ? 'Checking…' : 'Check it'}
      </button>
      {answer ? (
        <div className={`narrow-answer narrow-${answer.verdict}`}>
          <p>{answer.message}</p>
          {answer.suggestion ? (
            <button
              className="button button-quiet"
              onClick={() => onYear(answer.suggestion?.year ?? 0)}
              type="button"
            >
              Use {answer.suggestion.year}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
