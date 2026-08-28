import { describe, expect, it } from 'vitest'

import { formatFuzzyDate, formatFuzzyDateShort } from '../src/lib/fuzzy-date'

describe('formatFuzzyDate', () => {
  it('renders an exact date without shifting across a timezone', () => {
    expect(formatFuzzyDate({ datePrecision: 'exact', occurredOn: '2026-05-18' })).toBe(
      'May 18, 2026',
    )
    expect(formatFuzzyDate({ datePrecision: 'exact', occurredOn: '2026-01-01' })).toBe(
      'January 1, 2026',
    )
  })

  it('renders a month and year', () => {
    expect(
      formatFuzzyDate({ datePrecision: 'month', occurredMonth: 5, occurredYear: 2026 }),
    ).toBe('May 2026')
  })

  it('renders a year alone', () => {
    expect(formatFuzzyDate({ datePrecision: 'year', occurredYear: 2007 })).toBe('2007')
  })

  it('renders an approximate date as written', () => {
    expect(
      formatFuzzyDate({ datePrecision: 'approximate', approximateDate: 'Around 2005' }),
    ).toBe('Around 2005')
  })

  it('never invents a placeholder for an unknown date', () => {
    expect(formatFuzzyDate({ datePrecision: 'unknown' })).toBe('Date unknown')
  })

  it('falls back rather than rendering a partial date', () => {
    expect(formatFuzzyDate({ datePrecision: 'month', occurredYear: 2026 })).toBe('Date unknown')
    expect(formatFuzzyDate({ datePrecision: 'year' })).toBe('Date unknown')
    expect(formatFuzzyDate({ datePrecision: 'exact', occurredOn: null })).toBe('Date unknown')
    expect(formatFuzzyDate({ datePrecision: 'approximate', approximateDate: '' })).toBe(
      'Date unknown',
    )
  })
})

describe('formatFuzzyDateShort', () => {
  it('renders an archival label for an exact date', () => {
    expect(formatFuzzyDateShort({ datePrecision: 'exact', occurredOn: '2026-05-18' })).toBe(
      'MAY 18 · 2026',
    )
  })

  it('falls back to the long form for coarser precisions', () => {
    expect(formatFuzzyDateShort({ datePrecision: 'year', occurredYear: 2007 })).toBe('2007')
    expect(formatFuzzyDateShort({ datePrecision: 'unknown' })).toBe('Date unknown')
  })
})
