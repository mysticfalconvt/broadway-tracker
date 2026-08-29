import { venueKey } from './place'

/**
 * Rewrites a pasted catalog document so one venue reference uses the exact
 * wording of a venue that already exists.
 *
 * Editing the paste rather than silently coercing on the server keeps the
 * decision visible: the administrator sees what will be written, and can still
 * change their mind before importing.
 */
export type VenueFix = { given: string; city: string | null; name: string; venueCity: string | null }

type Mutable = Record<string, unknown>

function matches(name: unknown, city: unknown, fix: VenueFix) {
  if (typeof name !== 'string') return false
  const cityValue = typeof city === 'string' ? city : null
  // Compare on the same key the importer would, so a cosmetic difference in the
  // paste still matches the warning it produced.
  return (
    venueKey(name, cityValue) === venueKey(fix.given, fix.city) &&
    name.trim() === fix.given.trim()
  )
}

/** Applies one fix everywhere it appears, returning formatted JSON. */
export function applyVenueFix(json: string, fix: VenueFix): string {
  const parsed = JSON.parse(json) as unknown

  const visit = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(visit)
    if (!node || typeof node !== 'object') return node
    const record = { ...(node as Mutable) }

    // A standalone venue entry: { name, city }
    if ('name' in record && !('title' in record) && matches(record.name, record.city, fix)) {
      record.name = fix.name
      if (fix.venueCity !== null) record.city = fix.venueCity
      return record
    }
    // A production entry: { venue, city }
    if ('venue' in record && matches(record.venue, record.city, fix)) {
      record.venue = fix.name
      if (fix.venueCity !== null) record.city = fix.venueCity
      return record
    }
    for (const [key, value] of Object.entries(record)) record[key] = visit(value)
    return record
  }

  return `${JSON.stringify(visit(parsed), null, 2)}\n`
}

/** Applies every fix in turn. */
export function applyVenueFixes(json: string, fixes: VenueFix[]): string {
  return fixes.reduce((current, fix) => applyVenueFix(current, fix), json)
}
