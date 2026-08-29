import { useEffect, useId, useState } from 'react'

import { suggestVenues } from '../server/venue-functions'

type Suggestion = Awaited<ReturnType<typeof suggestVenues>>[number]

/**
 * Venue and city, entered together and offered from what already exists.
 *
 * Choosing a suggestion fills the city too, which is what stops one theatre
 * acquiring four different cities. Free text is still allowed -- a school hall
 * will never be in the list -- and the server resolves whatever is typed onto a
 * shared record regardless.
 */
export function VenueField({
  venue,
  city,
  onVenue,
  onCity,
  layout,
}: {
  venue: string
  city: string
  onVenue: (value: string) => void
  onCity: (value: string) => void
  layout?: 'pair'
}) {
  const listId = useId()
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(() => {
      void suggestVenues({ data: { query: venue } })
        .then((rows) => {
          if (!cancelled) setSuggestions(rows)
        })
        .catch(() => {
          // Suggestions are a convenience; typing must work without them.
        })
    }, 150)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [venue])

  function choose(value: string) {
    onVenue(value)
    const match = suggestions.find((option) => option.name === value)
    if (match?.city) onCity(match.city)
  }

  const fields = (
    <>
      <label>
        Venue
        <input
          name="venue"
          value={venue}
          list={listId}
          autoComplete="off"
          placeholder="Walter Kerr Theatre"
          onChange={(event) => choose(event.target.value)}
        />
        <datalist id={listId}>
          {suggestions.map((option) => (
            <option key={option.id} value={option.name}>
              {option.city ?? ''}
            </option>
          ))}
        </datalist>
      </label>
      <label>
        City
        <input
          name="city"
          value={city}
          autoComplete="off"
          placeholder="New York"
          onChange={(event) => onCity(event.target.value)}
        />
      </label>
    </>
  )

  return layout === 'pair' ? <div className="backfill-pair">{fields}</div> : fields
}
