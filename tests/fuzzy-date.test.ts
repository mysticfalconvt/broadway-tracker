import { describe, expect, it } from 'vitest'

import { dateWindow, formatFuzzyDate, formatFuzzyDateShort } from '../src/lib/fuzzy-date'

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
    expect(formatFuzzyDate({ datePrecision: 'month', occurredMonth: 5, occurredYear: 2026 })).toBe(
      'May 2026',
    )
  })

  it('renders a year alone', () => {
    expect(formatFuzzyDate({ datePrecision: 'year', occurredYear: 2007 })).toBe('2007')
  })

  it('renders an approximate date as written', () => {
    expect(formatFuzzyDate({ datePrecision: 'approximate', approximateDate: 'Around 2005' })).toBe(
      'Around 2005',
    )
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

describe('the span a recorded date covers', () => {
  it('turns a month into its real first and last day', () => {
    expect(dateWindow({ datePrecision: 'month', occurredYear: 2007, occurredMonth: 8 })).toEqual({
      from: '2007-08-01',
      to: '2007-08-31',
    })
    // February, and a leap year, without a table of month lengths.
    expect(dateWindow({ datePrecision: 'month', occurredYear: 2007, occurredMonth: 2 })?.to).toBe(
      '2007-02-28',
    )
    expect(dateWindow({ datePrecision: 'month', occurredYear: 2008, occurredMonth: 2 })?.to).toBe(
      '2008-02-29',
    )
  })

  it('turns a year into the whole of it, and a day into itself', () => {
    expect(dateWindow({ datePrecision: 'year', occurredYear: 2007 })).toEqual({
      from: '2007-01-01',
      to: '2007-12-31',
    })
    expect(dateWindow({ datePrecision: 'exact', occurredOn: '2007-08-16' })).toEqual({
      from: '2007-08-16',
      to: '2007-08-16',
    })
  })

  it('refuses a date too vague to compute with, even when a year is sitting there', () => {
    // "Some time in the nineties" has no edges worth using, and a decade is not
    // evidence about a cast. The stored year must not be taken as a window.
    expect(dateWindow({ datePrecision: 'approximate', occurredYear: 1995 })).toBeNull()
    expect(dateWindow({ datePrecision: 'unknown', occurredYear: 1995 })).toBeNull()
    expect(dateWindow({ datePrecision: 'exact', occurredOn: null })).toBeNull()
    expect(dateWindow({ datePrecision: 'month', occurredYear: 2007 })).toBeNull()
  })
})
