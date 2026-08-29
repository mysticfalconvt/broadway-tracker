/**
 * Normalisation for place names, so the same theatre entered four different ways
 * collides instead of multiplying. This is the matching key only -- whatever the
 * person typed is preserved for display.
 */

/** Common ways people write the same city, folded to one form for matching. */
const CITY_ALIASES: Record<string, string> = {
  nyc: 'new york',
  ny: 'new york',
  'new york city': 'new york',
  'new york ny': 'new york',
  manhattan: 'new york',
  broadway: 'new york',
  la: 'los angeles',
  sf: 'san francisco',
  philly: 'philadelphia',
  dc: 'washington',
  'washington dc': 'washington',
}

/** Words that carry no distinguishing meaning in a venue name. */
const VENUE_NOISE = new Set(['the', 'theatre', 'theater', 'at'])

function fold(value: string) {
  return (
    value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      // An apostrophe joins a word rather than separating it, so O'Neill and
      // ONeill have to fold together; anything else becomes a space.
      .replace(/['\u2019]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ')
  )
}

/** The matching key for a city. `NYC`, `New York City`, and `new york` all agree. */
export function normalizeCity(city: string): string {
  const folded = fold(city)
  return CITY_ALIASES[folded] ?? folded
}

/**
 * The matching key for a venue name. Drops the words that appear on roughly
 * every theatre, so `Walter Kerr Theatre` and `The Walter Kerr` agree, while
 * genuinely different houses stay apart.
 */
export function normalizeVenueName(name: string): string {
  const words = fold(name)
    .split(' ')
    .filter((word) => word && !VENUE_NOISE.has(word))
  return words.join(' ')
}

/** The key a venue is deduplicated on: its name within its city. */
export function venueKey(name: string, city: string | null | undefined): string {
  return `${normalizeVenueName(name)}|${city ? normalizeCity(city) : ''}`
}

/** Tidies what gets stored for display: collapses whitespace, keeps the wording. */
export function tidyPlace(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}
