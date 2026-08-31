/**
 * A theatre memory may be decades old, so a date is stored at whatever precision
 * the person actually remembers. Never invent a placeholder day or month for the
 * coarser precisions -- render only what was recorded.
 */
export type DatePrecision = 'exact' | 'month' | 'year' | 'approximate' | 'unknown'

export type FuzzyDate = {
  datePrecision: DatePrecision | string
  occurredOn?: string | null
  occurredMonth?: number | null
  occurredYear?: number | null
  approximateDate?: string | null
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/** Renders a stored fuzzy date for display, e.g. `May 18, 2026` or `Around 2005`. */
export function formatFuzzyDate(date: FuzzyDate): string {
  switch (date.datePrecision) {
    case 'exact': {
      if (!date.occurredOn) return 'Date unknown'
      // The column is a plain date, so read the parts rather than crossing a timezone.
      const [year, month, day] = date.occurredOn.split('-').map(Number)
      if (!year || !month || !day) return date.occurredOn
      return `${MONTHS[month - 1]} ${day}, ${year}`
    }
    case 'month':
      return date.occurredMonth && date.occurredYear
        ? `${MONTHS[date.occurredMonth - 1]} ${date.occurredYear}`
        : 'Date unknown'
    case 'year':
      return date.occurredYear ? String(date.occurredYear) : 'Date unknown'
    case 'approximate':
      return date.approximateDate || 'Date unknown'
    default:
      return 'Date unknown'
  }
}

/** The short, archival label used on memory cards and history rows. */
export function formatFuzzyDateShort(date: FuzzyDate): string {
  if (date.datePrecision === 'exact' && date.occurredOn) {
    const [year, month, day] = date.occurredOn.split('-').map(Number)
    if (year && month && day)
      return `${MONTHS[month - 1]?.slice(0, 3).toUpperCase()} ${day} · ${year}`
  }
  return formatFuzzyDate(date)
}

/**
 * The span of days a recorded date could be, as two dates.
 *
 * "August 2007" is not an absence of a date, it is a range — and a range is
 * enough to answer who was on stage whenever one company held the whole of it.
 * Treating anything short of an exact day as unknown threw that away, and
 * punished the person who declined to invent a day they did not remember.
 *
 * Null for `approximate` and `unknown`: "some time in the nineties" has no
 * edges worth computing with, and a decade is not evidence about a cast.
 */
export function dateWindow(date: {
  datePrecision: string
  occurredOn?: string | null
  occurredMonth?: number | null
  occurredYear?: number | null
}): { from: string; to: string } | null {
  if (date.datePrecision === 'exact' && date.occurredOn) {
    return { from: date.occurredOn, to: date.occurredOn }
  }
  if (date.datePrecision === 'month' && date.occurredYear && date.occurredMonth) {
    const month = String(date.occurredMonth).padStart(2, '0')
    // Day zero of the next month is the last day of this one, and handles
    // February and leap years without a table.
    const last = new Date(Date.UTC(date.occurredYear, date.occurredMonth, 0)).getUTCDate()
    return {
      from: `${date.occurredYear}-${month}-01`,
      to: `${date.occurredYear}-${month}-${String(last).padStart(2, '0')}`,
    }
  }
  if (date.datePrecision === 'year' && date.occurredYear) {
    return { from: `${date.occurredYear}-01-01`, to: `${date.occurredYear}-12-31` }
  }
  return null
}
