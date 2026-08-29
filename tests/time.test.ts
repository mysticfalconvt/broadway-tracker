import { describe, expect, it } from 'vitest'

import { greetingFor, toLocalISODate } from '../src/lib/time'

describe('greetingFor', () => {
  it('covers the whole day without a gap', () => {
    const seen = new Set<string>()
    for (let hour = 0; hour < 24; hour++) {
      const greeting = greetingFor(hour)
      expect(greeting).toMatch(/^Good (morning|afternoon|evening)$/)
      seen.add(greeting)
    }
    expect(seen.size).toBe(3)
  })

  it('picks the expected greeting at the boundaries', () => {
    expect(greetingFor(0)).toBe('Good evening')
    expect(greetingFor(4)).toBe('Good evening')
    expect(greetingFor(5)).toBe('Good morning')
    expect(greetingFor(11)).toBe('Good morning')
    expect(greetingFor(12)).toBe('Good afternoon')
    expect(greetingFor(17)).toBe('Good afternoon')
    expect(greetingFor(18)).toBe('Good evening')
    expect(greetingFor(23)).toBe('Good evening')
  })
})

describe('toLocalISODate', () => {
  it('reads the local calendar date, not the UTC one', () => {
    // 2026-08-28 20:01 in New York is already 2026-08-29 in UTC. A local
    // reading must still say the 28th, or an evening performance is logged
    // against tomorrow.
    const evening = new Date(2026, 7, 28, 20, 1)
    expect(toLocalISODate(evening)).toBe('2026-08-28')
    expect(evening.toISOString().slice(0, 10)).not.toBe('2026-08-28')
  })

  it('pads single-digit months and days', () => {
    expect(toLocalISODate(new Date(2026, 0, 5, 12, 0))).toBe('2026-01-05')
  })

  it('handles the last instant of a local day', () => {
    expect(toLocalISODate(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31')
  })
})
