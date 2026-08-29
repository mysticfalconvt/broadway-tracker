/**
 * Time helpers that depend on the reader's clock.
 *
 * The server runs in UTC and the reader may be anywhere, so anything derived
 * from "now" differs between the server render and the browser. These functions
 * are pure -- callers pass the clock in -- and the components that use them
 * resolve the value after mount, which keeps SSR deterministic.
 */

/** Time-of-day greeting for a local hour, per the design brief's Home section. */
export function greetingFor(hour: number): string {
  if (hour < 5) return 'Good evening'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

/**
 * The date in the reader's own timezone, as `YYYY-MM-DD`.
 *
 * `toISOString()` would answer in UTC, which is a different day for most of the
 * world for part of every day -- someone logging an evening performance in New
 * York would be handed tomorrow's date.
 */
export function toLocalISODate(now: Date): string {
  const year = now.getFullYear()
  const month = `${now.getMonth() + 1}`.padStart(2, '0')
  const day = `${now.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}
