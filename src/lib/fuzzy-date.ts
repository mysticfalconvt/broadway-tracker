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
